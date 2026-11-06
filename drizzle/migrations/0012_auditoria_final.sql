-- Endurecimiento tras la auditoría final: validación del horario, límite de intentos por IP,
-- la Inspección solo consulta, carga parcial del histórico e índices que faltaban.

-- 1. Horario general: la salida debe ser posterior a la entrada (los avisos de olvido lo dan por hecho).
CREATE OR REPLACE FUNCTION public.guardar_config(_horas_semana numeric,_horas_anuales numeric,_entrada time,_salida time,_vacaciones int,_ips text[],_max_ausentes int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
IF _salida <= _entrada THEN RAISE EXCEPTION 'La hora de salida debe ser posterior a la de entrada'; END IF;
IF _vacaciones < 0 OR _vacaciones > 60 THEN RAISE EXCEPTION 'Días de vacaciones inválidos'; END IF;
UPDATE config_jornada SET horas_semana=_horas_semana,horas_anuales=_horas_anuales,hora_entrada=_entrada,hora_salida=_salida,dias_vacaciones=_vacaciones,ip_kiosco=coalesce(_ips,'{}'),max_ausentes=coalesce(_max_ausentes,2) WHERE id=1; END $$;

-- 2. Intentos de acceso: además del bloqueo por usuario (5 fallos / 15 min), 20 fallos desde la misma IP en
--    15 min la bloquean, para que nadie pueda bloquear a los demás usuarios uno a uno.
CREATE OR REPLACE FUNCTION public.intento_login(_username text,_origen text,_ip text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login:'||_username,0));
  IF (SELECT count(*) FROM accesos WHERE username=_username AND NOT ok AND at > now()-interval '15 minutes') >= 5 THEN RETURN NULL; END IF;
  IF nullif(_ip,'') IS NOT NULL AND (SELECT count(*) FROM accesos WHERE ip=_ip AND NOT ok AND at > now()-interval '15 minutes') >= 20 THEN RETURN NULL; END IF;
  INSERT INTO accesos(username,ok,origen,ip) VALUES(_username,false,_origen,nullif(_ip,'')) RETURNING id INTO rid;
  RETURN rid;
END $$;

-- 3. La Inspección de Trabajo solo consulta: no solicita correcciones ni ausencias ni cierra meses.
CREATE OR REPLACE FUNCTION public.es_inspector(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid AND inspector) $$;
REVOKE ALL ON FUNCTION public.es_inspector(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.es_inspector(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_correction(_uid uuid,_motivo text,_propuesta jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x jsonb; rid uuid; _m text;
BEGIN
  IF NOT public.is_active(auth.uid()) OR (_uid<>auth.uid() AND NOT public.is_manager()) OR NOT public.is_active(_uid) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF public.es_inspector(auth.uid()) OR public.es_inspector(_uid) THEN RAISE EXCEPTION 'La Inspección solo consulta'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,0));
  IF length(trim(_motivo))<1 OR jsonb_typeof(_propuesta)<>'array' OR jsonb_array_length(_propuesta) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Motivo y propuesta obligatorios'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(_propuesta) LOOP
    IF x->>'original_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fichajes WHERE id=(x->>'original_id')::uuid AND user_id=_uid) THEN RAISE EXCEPTION 'Original no pertenece al trabajador'; END IF;
    IF coalesce((x->>'anular')::boolean,false) AND x->>'original_id' IS NULL THEN RAISE EXCEPTION 'Anulación sin original'; END IF;
    IF NOT coalesce((x->>'anular')::boolean,false) AND (x->>'tipo' IS NULL OR x->>'tipo' NOT IN ('entrada','pausa','espera','reanudar','salida') OR x->>'at' IS NULL OR (x->>'at')::timestamptz>now()) THEN RAISE EXCEPTION 'Hora o tipo inválidos'; END IF;
    IF x->>'tipo'='espera' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=_uid AND conductor) THEN RAISE EXCEPTION 'Solo conductores'; END IF;
    IF NOT public.is_manager() THEN
      FOR _m IN SELECT to_char(t AT TIME ZONE 'Europe/Madrid','YYYY-MM') FROM (SELECT (x->>'at')::timestamptz t UNION ALL SELECT f.at FROM fichajes f WHERE f.id=(x->>'original_id')::uuid UNION ALL SELECT e.at FROM public.effective_punches(_uid) e WHERE e.original_id=(x->>'original_id')::uuid) q WHERE t IS NOT NULL LOOP
        IF EXISTS(SELECT 1 FROM cierres_mes c WHERE c.user_id=_uid AND c.mes=_m) THEN RAISE EXCEPTION 'Mes cerrado: pide la corrección al encargado'; END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_propuesta) el WHERE el.value->>'original_id' IS NOT NULL GROUP BY el.value->>'original_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Original repetido'; END IF;
  INSERT INTO solicitudes_correccion(user_id,solicitada_por,motivo,propuesta) VALUES(_uid,auth.uid(),trim(_motivo),_propuesta) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.solicitar_ausencia(_uid uuid,_tipo text,_desde date,_hasta date,_motivo text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; jefe boolean := public.is_manager(); y int; cupo int;
BEGIN
  IF NOT public.is_active(auth.uid()) OR NOT public.is_active(_uid) OR (_uid<>auth.uid() AND NOT jefe) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF public.es_inspector(auth.uid()) OR public.es_inspector(_uid) THEN RAISE EXCEPTION 'La Inspección solo consulta'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,1));
  IF EXISTS(SELECT 1 FROM ausencias WHERE user_id=_uid AND estado IN ('pendiente','aprobada') AND daterange(desde,hasta,'[]') && daterange(_desde,_hasta,'[]')) THEN RAISE EXCEPTION 'Se solapa con otra ausencia'; END IF;
  IF _tipo='vacaciones' THEN
    IF EXISTS(SELECT 1 FROM cierres_empresa c WHERE daterange(c.desde,c.hasta,'[]') && daterange(_desde,_hasta,'[]')) THEN RAISE EXCEPTION 'Esos días la empresa está cerrada: ya son vacaciones'; END IF;
    IF NOT jefe THEN
      SELECT dias_vacaciones INTO cupo FROM config_jornada WHERE id=1;
      FOR y IN extract(year FROM _desde)::int .. extract(year FROM _hasta)::int LOOP
        IF public.vacaciones_usadas(_uid, y) + public.laborables_vacaciones(greatest(_desde, make_date(y,1,1)), least(_hasta, make_date(y,12,31))) > cupo
          THEN RAISE EXCEPTION 'No quedan suficientes días de vacaciones en %', y; END IF;
      END LOOP;
    END IF;
  END IF;
  INSERT INTO ausencias(user_id,tipo,desde,hasta,motivo,solicitada_por,estado,decidida_por,decidida_at)
  VALUES(_uid,_tipo,_desde,_hasta,nullif(trim(coalesce(_motivo,'')),''),auth.uid(),
    CASE WHEN jefe THEN 'aprobada' ELSE 'pendiente' END, CASE WHEN jefe THEN auth.uid() END, CASE WHEN jefe THEN now() END)
  RETURNING id INTO rid; RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.cerrar_mes(_mes text,_conforme boolean,_comentario text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF public.es_inspector(auth.uid()) THEN RAISE EXCEPTION 'La Inspección solo consulta'; END IF;
  IF _mes !~ '^\d{4}-(0[1-9]|1[0-2])$' OR _mes >= to_char(now() AT TIME ZONE 'Europe/Madrid','YYYY-MM') THEN RAISE EXCEPTION 'Solo meses terminados'; END IF;
  IF NOT _conforme AND length(trim(coalesce(_comentario,'')))<3 THEN RAISE EXCEPTION 'Explica la discrepancia'; END IF;
  INSERT INTO cierres_mes(user_id,mes,conforme,comentario) VALUES(auth.uid(),_mes,_conforme,nullif(trim(coalesce(_comentario,'')),''));
END $$;

-- 4. Carga parcial: la app pide desde una fecha en vez de los cuatro años de histórico en cada pantalla.
--    La línea de tiempo se sigue calculando entera (las sesiones dependen de todo) y se filtra por el día de la jornada.
CREATE FUNCTION public.effective_punches(_uid uuid,_desde date) RETURNS TABLE(id text,user_id uuid,tipo text,at timestamptz,dia date,lugar text,editado boolean,original_at timestamptz,original_id uuid,modalidad text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT * FROM public.effective_punches(_uid) e WHERE _desde IS NULL OR e.dia >= _desde $$;
REVOKE ALL ON FUNCTION public.effective_punches(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_punches(uuid,date) TO service_role;

DROP FUNCTION IF EXISTS public.list_punches(uuid);
CREATE FUNCTION public.list_punches(_uid uuid DEFAULT NULL,_desde date DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE todo boolean := public.is_manager() OR public.is_inspector();
BEGIN
  IF NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF _uid IS NULL AND NOT todo THEN _uid=auth.uid(); END IF;
  IF _uid IS NOT NULL AND _uid<>auth.uid() AND NOT todo THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN QUERY SELECT to_jsonb(e) FROM profiles p CROSS JOIN LATERAL public.effective_punches(p.id,_desde) e WHERE _uid IS NULL OR p.id=_uid;
END $$;
REVOKE ALL ON FUNCTION public.list_punches(uuid,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.list_punches(uuid,date) TO authenticated;

-- 5. Índices que faltaban.
CREATE INDEX IF NOT EXISTS solicitudes_correccion_user ON public.solicitudes_correccion(user_id);
CREATE INDEX IF NOT EXISTS ausencias_user_estado ON public.ausencias(user_id, estado);
CREATE INDEX IF NOT EXISTS accesos_at ON public.accesos(at);
CREATE INDEX IF NOT EXISTS accesos_ip_at ON public.accesos(ip, at DESC);

NOTIFY pgrst, 'reload schema';
