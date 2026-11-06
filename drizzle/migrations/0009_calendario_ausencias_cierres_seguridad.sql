-- Configuración de jornada (convenio comercio materiales de construcción de Barcelona) y kiosco.
CREATE TABLE public.config_jornada(
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  horas_semana numeric NOT NULL DEFAULT 40 CHECK (horas_semana BETWEEN 1 AND 60),
  horas_anuales numeric NOT NULL DEFAULT 1780,
  hora_entrada time NOT NULL DEFAULT '08:00',
  hora_salida time NOT NULL DEFAULT '17:00',
  dias_vacaciones int NOT NULL DEFAULT 30,
  ip_kiosco text[] NOT NULL DEFAULT '{}'
);
INSERT INTO public.config_jornada(id) VALUES (1);
REVOKE ALL ON public.config_jornada FROM anon, authenticated;
GRANT SELECT ON public.config_jornada TO authenticated; GRANT ALL ON public.config_jornada TO service_role;
ALTER TABLE public.config_jornada ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_lectura ON public.config_jornada FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

-- Festivos (estatales, Cataluña y locales de Localidad Demo). El encargado los mantiene cada año.
CREATE TABLE public.festivos(fecha date PRIMARY KEY, nombre text NOT NULL);
REVOKE ALL ON public.festivos FROM anon, authenticated;
GRANT SELECT ON public.festivos TO authenticated; GRANT ALL ON public.festivos TO service_role;
ALTER TABLE public.festivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY festivos_lectura ON public.festivos FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
INSERT INTO public.festivos VALUES
 ('2026-01-01','Año Nuevo'),('2026-01-06','Reyes'),('2026-03-12','Fiesta local (Localidad Demo)'),
 ('2026-04-03','Viernes Santo'),('2026-04-06','Lunes de Pascua'),('2026-05-01','Fiesta del Trabajo'),
 ('2026-06-24','Sant Joan'),('2026-08-15','Asunción'),('2026-09-11','Diada'),('2026-09-21','Fiesta local (Localidad Demo)'),
 ('2026-10-12','Fiesta Nacional'),('2026-12-08','Inmaculada'),('2026-12-25','Navidad'),('2026-12-26','Sant Esteve');

-- Configuración (solo encargado, con 2FA).
CREATE OR REPLACE FUNCTION public.guardar_config(_horas_semana numeric,_horas_anuales numeric,_entrada time,_salida time,_vacaciones int,_ips text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
UPDATE config_jornada SET horas_semana=_horas_semana,horas_anuales=_horas_anuales,hora_entrada=_entrada,hora_salida=_salida,dias_vacaciones=_vacaciones,ip_kiosco=coalesce(_ips,'{}') WHERE id=1; END $$;
CREATE OR REPLACE FUNCTION public.guardar_festivo(_fecha date,_nombre text,_borrar boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
IF _borrar THEN DELETE FROM festivos WHERE fecha=_fecha; ELSE INSERT INTO festivos VALUES(_fecha,trim(_nombre)) ON CONFLICT(fecha) DO UPDATE SET nombre=excluded.nombre; END IF; END $$;
REVOKE ALL ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[]),public.guardar_festivo(date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[]),public.guardar_festivo(date,text,boolean) TO authenticated;

-- Conductores: pueden fichar "espera" (tiempo de presencia, RD 1561/1995).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS conductor boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.marcar_conductor(_id uuid,_conductor boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF; UPDATE profiles SET conductor=_conductor WHERE id=_id; END $$;
REVOKE ALL ON FUNCTION public.marcar_conductor(uuid,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.marcar_conductor(uuid,boolean) TO authenticated;
ALTER TABLE public.fichajes DROP CONSTRAINT IF EXISTS fichajes_tipo_check;
ALTER TABLE public.fichajes ADD CONSTRAINT fichajes_tipo_check CHECK (tipo IN ('entrada','pausa','espera','reanudar','salida'));

CREATE OR REPLACE FUNCTION public.estado_tras(_tipo text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT CASE _tipo WHEN 'entrada' THEN 'trabajando' WHEN 'reanudar' THEN 'trabajando' WHEN 'pausa' THEN 'pausa' WHEN 'espera' THEN 'espera' ELSE 'fuera' END $$;
CREATE OR REPLACE FUNCTION public.paso_valido(_st text,_tipo text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
SELECT (_st='fuera' AND _tipo='entrada') OR (_st='trabajando' AND _tipo IN ('pausa','espera','salida')) OR (_st IN ('pausa','espera') AND _tipo IN ('reanudar','salida')) $$;

CREATE OR REPLACE FUNCTION public.current_punch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_p record; st text='fuera'; inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  NEW.user_id=auth.uid();
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  SELECT * INTO last_p FROM public.effective_punches(NEW.user_id) ORDER BY at DESC LIMIT 1;
  IF FOUND THEN st=public.estado_tras(last_p.tipo); END IF;
  IF st<>'fuera' THEN
    SELECT max(at) INTO inicio FROM public.effective_punches(NEW.user_id) WHERE tipo='entrada';
    IF inicio < now() - interval '16 hours' THEN RAISE EXCEPTION 'Jornada anterior sin cerrar: solicita una corrección'; END IF;
  END IF;
  IF NEW.tipo='espera' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND conductor) THEN RAISE EXCEPTION 'Solo conductores'; END IF;
  IF NOT public.paso_valido(st,NEW.tipo) THEN RAISE EXCEPTION 'Secuencia inválida'; END IF;
  NEW.at=now(); NEW.created_at=now(); NEW.editado=false; NEW.lugar='Centro principal';
  NEW.dia=CASE WHEN st<>'fuera' THEN last_p.dia ELSE (NEW.at AT TIME ZONE 'Europe/Madrid')::date END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_punch_sequence(_uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; st text='fuera'; prev timestamptz;
BEGIN FOR e IN SELECT * FROM public.effective_punches(_uid) LOOP
  IF e.tipo IS NULL OR e.at IS NULL OR e.tipo NOT IN ('entrada','pausa','espera','reanudar','salida') THEN RAISE EXCEPTION 'Fichaje inválido'; END IF;
  IF prev IS NOT NULL AND e.at<=prev THEN RAISE EXCEPTION 'Las horas deben ser distintas y crecientes'; END IF;
  IF NOT public.paso_valido(st,e.tipo) THEN RAISE EXCEPTION 'Secuencia de fichajes inválida'; END IF;
  st=public.estado_tras(e.tipo); prev=e.at; END LOOP; END $$;

-- Cierre mensual: el trabajador da su conformidad o anota su discrepancia; el mes queda cerrado.
CREATE TABLE public.cierres_mes(user_id uuid NOT NULL, mes text NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'), conforme boolean NOT NULL, comentario text, cerrado_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,mes));
REVOKE ALL ON public.cierres_mes FROM anon, authenticated;
GRANT SELECT ON public.cierres_mes TO authenticated; GRANT ALL ON public.cierres_mes TO service_role;
ALTER TABLE public.cierres_mes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cierres_lectura ON public.cierres_mes FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager());
CREATE TRIGGER cierres_inmutables BEFORE UPDATE OR DELETE ON public.cierres_mes FOR EACH ROW EXECUTE FUNCTION public.no_mutations();
CREATE OR REPLACE FUNCTION public.cerrar_mes(_mes text,_conforme boolean,_comentario text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF _mes !~ '^\d{4}-(0[1-9]|1[0-2])$' OR _mes >= to_char(now() AT TIME ZONE 'Europe/Madrid','YYYY-MM') THEN RAISE EXCEPTION 'Solo meses terminados'; END IF;
  IF NOT _conforme AND length(trim(coalesce(_comentario,'')))<3 THEN RAISE EXCEPTION 'Explica la discrepancia'; END IF;
  INSERT INTO cierres_mes(user_id,mes,conforme,comentario) VALUES(auth.uid(),_mes,_conforme,nullif(trim(coalesce(_comentario,'')),''));
END $$;
REVOKE ALL ON FUNCTION public.cerrar_mes(text,boolean,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.cerrar_mes(text,boolean,text) TO authenticated;

-- Correcciones: el trabajador no puede tocar un mes que ya ha cerrado (el encargado sí, queda registrado).
CREATE OR REPLACE FUNCTION public.request_correction(_uid uuid,_motivo text,_propuesta jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x jsonb; rid uuid; _m text;
BEGIN
  IF NOT public.is_active(auth.uid()) OR (_uid<>auth.uid() AND NOT public.is_manager()) OR NOT public.is_active(_uid) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
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

-- Ausencias: vacaciones, permisos, bajas. El trabajador solicita; el encargado aprueba o rechaza.
CREATE TABLE public.ausencias(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('vacaciones','permiso','baja','otra')),
  desde date NOT NULL, hasta date NOT NULL CHECK (hasta >= desde AND hasta - desde < 366),
  motivo text, estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','anulada')),
  solicitada_por uuid NOT NULL, solicitada_at timestamptz NOT NULL DEFAULT now(),
  decidida_por uuid, decidida_at timestamptz, motivo_decision text,
  anulada_por uuid, anulada_at timestamptz);
REVOKE ALL ON public.ausencias FROM anon, authenticated;
GRANT SELECT ON public.ausencias TO authenticated; GRANT ALL ON public.ausencias TO service_role;
ALTER TABLE public.ausencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY ausencias_lectura ON public.ausencias FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager());
CREATE OR REPLACE FUNCTION public.solicitar_ausencia(_uid uuid,_tipo text,_desde date,_hasta date,_motivo text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; jefe boolean := public.is_manager();
BEGIN
  IF NOT public.is_active(auth.uid()) OR NOT public.is_active(_uid) OR (_uid<>auth.uid() AND NOT jefe) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,1));
  IF EXISTS(SELECT 1 FROM ausencias WHERE user_id=_uid AND estado IN ('pendiente','aprobada') AND daterange(desde,hasta,'[]') && daterange(_desde,_hasta,'[]')) THEN RAISE EXCEPTION 'Se solapa con otra ausencia'; END IF;
  INSERT INTO ausencias(user_id,tipo,desde,hasta,motivo,solicitada_por,estado,decidida_por,decidida_at)
  VALUES(_uid,_tipo,_desde,_hasta,nullif(trim(coalesce(_motivo,'')),''),auth.uid(),
    CASE WHEN jefe THEN 'aprobada' ELSE 'pendiente' END, CASE WHEN jefe THEN auth.uid() END, CASE WHEN jefe THEN now() END)
  RETURNING id INTO rid; RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.decidir_ausencia(_id uuid,_estado text,_motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a ausencias;
BEGIN
  SELECT * INTO a FROM ausencias WHERE id=_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No existe'; END IF;
  IF _estado='anulada' THEN
    IF a.estado NOT IN ('pendiente','aprobada') OR NOT (public.is_manager() OR (a.user_id=auth.uid() AND a.estado='pendiente')) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
    UPDATE ausencias SET estado='anulada',anulada_por=auth.uid(),anulada_at=now() WHERE id=_id;
    RETURN;
  ELSIF _estado IN ('aprobada','rechazada') THEN
    IF NOT public.is_manager() OR a.estado<>'pendiente' THEN RAISE EXCEPTION 'Solo el encargado decide solicitudes pendientes'; END IF;
    IF _estado='rechazada' AND length(trim(coalesce(_motivo,'')))<1 THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
  ELSE RAISE EXCEPTION 'Estado inválido'; END IF;
  UPDATE ausencias SET estado=_estado,decidida_por=auth.uid(),decidida_at=now(),motivo_decision=nullif(trim(coalesce(_motivo,'')),'') WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.solicitar_ausencia(uuid,text,date,date,text),public.decidir_ausencia(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.solicitar_ausencia(uuid,text,date,date,text),public.decidir_ausencia(uuid,text,text) TO authenticated;

-- Seguridad: registro de accesos (bloqueo tras 5 PIN fallidos en 15 min) y 2FA obligatorio para el encargado.
CREATE TABLE public.accesos(id bigserial PRIMARY KEY, username text NOT NULL, ok boolean NOT NULL, origen text NOT NULL, ip text, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX accesos_usuario_at ON public.accesos(username, at DESC);
REVOKE ALL ON public.accesos FROM anon, authenticated;
GRANT SELECT ON public.accesos TO authenticated; GRANT ALL ON public.accesos TO service_role; GRANT USAGE ON SEQUENCE public.accesos_id_seq TO service_role;
ALTER TABLE public.accesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY accesos_encargado ON public.accesos FOR SELECT TO authenticated USING (public.is_manager());

CREATE OR REPLACE FUNCTION public.is_manager() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.is_active(auth.uid()) AND public.has_role(auth.uid(),'admin') AND coalesce(auth.jwt()->>'aal','')='aal2' $$;

-- Intentos de acceso atómicos (solo el servidor): devuelve NULL si el usuario está bloqueado.
CREATE OR REPLACE FUNCTION public.intento_login(_username text,_origen text,_ip text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login:'||_username,0));
  IF (SELECT count(*) FROM accesos WHERE username=_username AND NOT ok AND at > now()-interval '15 minutes') >= 5 THEN RETURN NULL; END IF;
  INSERT INTO accesos(username,ok,origen,ip) VALUES(_username,false,_origen,nullif(_ip,'')) RETURNING id INTO rid;
  RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.intento_ok(_id bigint) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE accesos SET ok=true WHERE id=_id $$;
REVOKE ALL ON FUNCTION public.intento_login(text,text,text),public.intento_ok(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intento_login(text,text,text),public.intento_ok(bigint) TO service_role;
