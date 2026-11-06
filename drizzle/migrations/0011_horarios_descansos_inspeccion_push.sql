-- Mejoras tras comparar con el mercado: horarios por periodo, personal mínimo, modalidad y acceso de la
-- Inspección (proyecto de Real Decreto de registro de jornada) y suscripciones para avisos push.

-- 1. Horarios por periodo (jornada intensiva de verano, etc.). dia_semana: 1 = lunes … 7 = domingo; nulo = todos los laborables.
CREATE TABLE public.horarios_periodo(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  desde date NOT NULL,
  hasta date NOT NULL CHECK (hasta >= desde),
  dia_semana int CHECK (dia_semana BETWEEN 1 AND 7),
  hora_entrada time NOT NULL,
  hora_salida time NOT NULL,
  horas_dia numeric CHECK (horas_dia > 0 AND horas_dia <= 12)
);
REVOKE ALL ON public.horarios_periodo FROM anon, authenticated;
GRANT SELECT ON public.horarios_periodo TO authenticated; GRANT ALL ON public.horarios_periodo TO service_role;
ALTER TABLE public.horarios_periodo ENABLE ROW LEVEL SECURITY;
CREATE POLICY horarios_lectura ON public.horarios_periodo FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
-- Calendario 2026: «Divendres de 7 a 15» de junio a septiembre.
INSERT INTO public.horarios_periodo(nombre, desde, hasta, dia_semana, hora_entrada, hora_salida, horas_dia)
VALUES ('Jornada intensiva de verano (viernes)', '2026-06-01', '2026-09-30', 5, '07:00', '15:00', 8);

CREATE OR REPLACE FUNCTION public.guardar_horario_periodo(_id uuid, _nombre text, _desde date, _hasta date, _dia_semana int, _entrada time, _salida time, _horas numeric, _borrar boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  IF _borrar THEN DELETE FROM horarios_periodo WHERE id=_id; RETURN _id; END IF;
  IF _id IS NULL THEN
    INSERT INTO horarios_periodo(nombre, desde, hasta, dia_semana, hora_entrada, hora_salida, horas_dia) VALUES (trim(_nombre), _desde, _hasta, _dia_semana, _entrada, _salida, _horas) RETURNING id INTO rid;
  ELSE
    UPDATE horarios_periodo SET nombre=trim(_nombre), desde=_desde, hasta=_hasta, dia_semana=_dia_semana, hora_entrada=_entrada, hora_salida=_salida, horas_dia=_horas WHERE id=_id RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'No existe'; END IF;
  END IF;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.guardar_horario_periodo(uuid,text,date,date,int,time,time,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_horario_periodo(uuid,text,date,date,int,time,time,numeric,boolean) TO authenticated;

-- 2. Personal mínimo: aviso al aprobar ausencias si faltan más de este número de personas el mismo día.
ALTER TABLE public.config_jornada ADD COLUMN IF NOT EXISTS max_ausentes int NOT NULL DEFAULT 2 CHECK (max_ausentes >= 0);
-- Se conserva la firma anterior de guardar_config para que la versión desplegada siga funcionando hasta actualizar.
CREATE OR REPLACE FUNCTION public.guardar_config(_horas_semana numeric,_horas_anuales numeric,_entrada time,_salida time,_vacaciones int,_ips text[],_max_ausentes int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
UPDATE config_jornada SET horas_semana=_horas_semana,horas_anuales=_horas_anuales,hora_entrada=_entrada,hora_salida=_salida,dias_vacaciones=_vacaciones,ip_kiosco=coalesce(_ips,'{}'),max_ausentes=coalesce(_max_ausentes,2) WHERE id=1; END $$;
REVOKE ALL ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[],int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[],int) TO authenticated;

-- 3. Modalidad de la jornada (presencial / a distancia), exigida por el proyecto de Real Decreto. Se indica al fichar la entrada.
ALTER TABLE public.fichajes ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'presencial' CHECK (modalidad IN ('presencial','distancia'));

-- 4. Inspección de Trabajo: acceso de solo lectura a todo, con 2FA como el encargado. Lo marca el encargado.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS inspector boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.is_inspector() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND activo AND inspector) AND coalesce(auth.jwt()->>'aal','')='aal2' $$;
REVOKE ALL ON FUNCTION public.is_inspector() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_inspector() TO authenticated;
CREATE OR REPLACE FUNCTION public.marcar_inspector(_id uuid,_inspector boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF; UPDATE profiles SET inspector=_inspector WHERE id=_id; END $$;
REVOKE ALL ON FUNCTION public.marcar_inspector(uuid,boolean) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.marcar_inspector(uuid,boolean) TO authenticated;

DROP POLICY IF EXISTS perfiles_lectura ON public.profiles;
CREATE POLICY perfiles_lectura ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS fichajes_lectura ON public.fichajes;
CREATE POLICY fichajes_lectura ON public.fichajes FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS correcciones_legacy_lectura ON public.correcciones;
CREATE POLICY correcciones_legacy_lectura ON public.correcciones FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS solicitudes_lectura ON public.solicitudes_correccion;
CREATE POLICY solicitudes_lectura ON public.solicitudes_correccion FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS ausencias_lectura ON public.ausencias;
CREATE POLICY ausencias_lectura ON public.ausencias FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS cierres_lectura ON public.cierres_mes;
CREATE POLICY cierres_lectura ON public.cierres_mes FOR SELECT TO authenticated USING ((user_id=auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());
DROP POLICY IF EXISTS avisos_lectura ON public.avisos_privacidad;
CREATE POLICY avisos_lectura ON public.avisos_privacidad FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_manager() OR public.is_inspector());

-- Línea de tiempo efectiva con la modalidad (los fichajes omitidos añadidos por corrección heredan 'presencial').
DROP FUNCTION IF EXISTS public.effective_punches(uuid);
CREATE FUNCTION public.effective_punches(_uid uuid) RETURNS TABLE(id text,user_id uuid,tipo text,at timestamptz,dia date,lugar text,editado boolean,original_at timestamptz,original_id uuid,modalidad text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH approved AS (SELECT s.*,d.decidida_at FROM solicitudes_correccion s JOIN decisiones_correccion d ON d.solicitud_id=s.id AND d.aprobada WHERE s.user_id=_uid),
changes AS (SELECT a.id sid,a.decidida_at,e.value v,e.ordinality n FROM approved a CROSS JOIN LATERAL jsonb_array_elements(a.propuesta) WITH ORDINALITY e),
latest AS (SELECT DISTINCT ON (v->>'original_id') * FROM changes WHERE v->>'original_id' IS NOT NULL ORDER BY v->>'original_id',decidida_at DESC,sid DESC),
events AS (
  SELECT f.id::text id,f.user_id,coalesce(l.v->>'tipo',f.tipo) tipo,coalesce((l.v->>'at')::timestamptz,f.at) at,f.lugar,(f.editado OR l.sid IS NOT NULL) editado,f.at original_at,f.id original_id,f.modalidad
  FROM fichajes f LEFT JOIN latest l ON l.v->>'original_id'=f.id::text
  WHERE f.user_id=_uid AND coalesce((l.v->>'anular')::boolean,false)=false
  UNION ALL
  SELECT sid::text||':'||n,_uid,v->>'tipo',(v->>'at')::timestamptz,'Centro principal',true,NULL::timestamptz,NULL::uuid,'presencial'
  FROM changes WHERE v->>'original_id' IS NULL AND NOT coalesce((v->>'anular')::boolean,false)
),
sessions AS (SELECT *,sum(CASE WHEN tipo='entrada' THEN 1 ELSE 0 END) OVER(ORDER BY at,id) session FROM events)
SELECT id,user_id,tipo,at,coalesce((min(at) FILTER(WHERE tipo='entrada') OVER(PARTITION BY session) AT TIME ZONE 'Europe/Madrid')::date,(at AT TIME ZONE 'Europe/Madrid')::date),lugar,editado,original_at,original_id,
  coalesce(first_value(modalidad) OVER(PARTITION BY session ORDER BY at,id),'presencial')
FROM sessions ORDER BY at,id $$;
REVOKE ALL ON FUNCTION public.effective_punches(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_punches(uuid) TO service_role; -- el cron de recordatorios la usa con el cliente de administrador

-- El encargado y la Inspección ven todos los fichajes; el resto solo los suyos.
CREATE OR REPLACE FUNCTION public.list_punches(_uid uuid DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE todo boolean := public.is_manager() OR public.is_inspector();
BEGIN
  IF NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF _uid IS NULL AND NOT todo THEN _uid=auth.uid(); END IF;
  IF _uid IS NOT NULL AND _uid<>auth.uid() AND NOT todo THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN QUERY SELECT to_jsonb(e) FROM profiles p CROSS JOIN LATERAL public.effective_punches(p.id) e WHERE _uid IS NULL OR p.id=_uid;
END $$;

-- Fichar: la modalidad se fija en la entrada y se hereda en el resto de la jornada; la Inspección no ficha.
CREATE OR REPLACE FUNCTION public.current_punch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_p record; st text='fuera'; inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND inspector) THEN RAISE EXCEPTION 'La Inspección no ficha'; END IF;
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
  NEW.modalidad=CASE WHEN st<>'fuera' THEN last_p.modalidad ELSE coalesce(NEW.modalidad,'presencial') END;
  RETURN NEW;
END $$;

-- 5. Avisos push en el móvil: cada trabajador guarda su suscripción; el servidor envía con la clave VAPID.
CREATE TABLE public.push_subs(
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subs_user ON public.push_subs(user_id);
REVOKE ALL ON public.push_subs FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subs TO authenticated; GRANT ALL ON public.push_subs TO service_role;
ALTER TABLE public.push_subs ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_propias ON public.push_subs FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY push_crear ON public.push_subs FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND public.is_active(auth.uid()));
CREATE POLICY push_borrar ON public.push_subs FOR DELETE TO authenticated USING (user_id=auth.uid());
-- Recordatorios ya enviados (para no repetirlos): solo el servidor.
CREATE TABLE public.avisos_enviados(user_id uuid NOT NULL, clave text NOT NULL, enviado_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, clave));
REVOKE ALL ON public.avisos_enviados FROM anon, authenticated; GRANT ALL ON public.avisos_enviados TO service_role;
ALTER TABLE public.avisos_enviados ENABLE ROW LEVEL SECURITY;
