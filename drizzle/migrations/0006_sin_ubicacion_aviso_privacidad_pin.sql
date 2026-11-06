-- Sin geolocalización: el registro horario (art. 34.9 ET) solo exige horas; minimización RGPD.
DROP TRIGGER IF EXISTS fichaje_actual ON public.fichajes;
DROP FUNCTION IF EXISTS public.effective_punches(uuid);
ALTER TABLE public.fichajes DROP COLUMN IF EXISTS lat, DROP COLUMN IF EXISTS lng, DROP COLUMN IF EXISTS precision_m;
DROP TABLE IF EXISTS public.aceptaciones_ubicacion;
DROP FUNCTION IF EXISTS public.accept_location();

CREATE FUNCTION public.effective_punches(_uid uuid) RETURNS TABLE(id text,user_id uuid,tipo text,at timestamptz,dia date,lugar text,editado boolean,original_at timestamptz,original_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH approved AS (SELECT s.*,d.decidida_at FROM solicitudes_correccion s JOIN decisiones_correccion d ON d.solicitud_id=s.id AND d.aprobada WHERE s.user_id=_uid),
changes AS (SELECT a.id sid,a.decidida_at,e.value v,e.ordinality n FROM approved a CROSS JOIN LATERAL jsonb_array_elements(a.propuesta) WITH ORDINALITY e),
latest AS (SELECT DISTINCT ON (v->>'original_id') * FROM changes WHERE v->>'original_id' IS NOT NULL ORDER BY v->>'original_id',decidida_at DESC,sid DESC),
events AS (
  SELECT f.id::text id,f.user_id,coalesce(l.v->>'tipo',f.tipo) tipo,coalesce((l.v->>'at')::timestamptz,f.at) at,f.lugar,(f.editado OR l.sid IS NOT NULL) editado,f.at original_at,f.id original_id
  FROM fichajes f LEFT JOIN latest l ON l.v->>'original_id'=f.id::text
  WHERE f.user_id=_uid AND coalesce((l.v->>'anular')::boolean,false)=false
  UNION ALL
  SELECT sid::text||':'||n,_uid,v->>'tipo',(v->>'at')::timestamptz,'Centro principal',true,NULL::timestamptz,NULL::uuid
  FROM changes WHERE v->>'original_id' IS NULL AND NOT coalesce((v->>'anular')::boolean,false)
),
sessions AS (SELECT *,sum(CASE WHEN tipo='entrada' THEN 1 ELSE 0 END) OVER(ORDER BY at,id) session FROM events)
SELECT id,user_id,tipo,at,coalesce((min(at) FILTER(WHERE tipo='entrada') OVER(PARTITION BY session) AT TIME ZONE 'Europe/Madrid')::date,(at AT TIME ZONE 'Europe/Madrid')::date),lugar,editado,original_at,original_id
FROM sessions ORDER BY at,id $$;
REVOKE ALL ON FUNCTION public.effective_punches(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.current_punch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_p record; st text='fuera';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  NEW.user_id=auth.uid();
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  SELECT * INTO last_p FROM public.effective_punches(NEW.user_id) ORDER BY at DESC LIMIT 1;
  IF FOUND THEN st=CASE last_p.tipo WHEN 'entrada' THEN 'trabajando' WHEN 'reanudar' THEN 'trabajando' WHEN 'pausa' THEN 'pausa' ELSE 'fuera' END; END IF;
  IF (st='fuera' AND NEW.tipo<>'entrada') OR (st='trabajando' AND NEW.tipo NOT IN ('pausa','salida')) OR (st='pausa' AND NEW.tipo NOT IN ('reanudar','salida')) THEN RAISE EXCEPTION 'Secuencia inválida'; END IF;
  NEW.at=now(); NEW.created_at=now(); NEW.editado=false; NEW.lugar='Centro principal';
  NEW.dia=CASE WHEN st<>'fuera' THEN last_p.dia ELSE (NEW.at AT TIME ZONE 'Europe/Madrid')::date END;
  RETURN NEW;
END $$;
CREATE TRIGGER fichaje_actual BEFORE INSERT ON public.fichajes FOR EACH ROW EXECUTE FUNCTION public.current_punch();

-- Aviso informativo de privacidad (art. 13 RGPD): se registra cuándo lo ha visto cada trabajador.
CREATE TABLE public.avisos_privacidad(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,version text NOT NULL,visto_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,version));
REVOKE ALL ON public.avisos_privacidad FROM anon,authenticated;
GRANT SELECT,INSERT ON public.avisos_privacidad TO authenticated; GRANT ALL ON public.avisos_privacidad TO service_role;
ALTER TABLE public.avisos_privacidad ENABLE ROW LEVEL SECURITY;
CREATE POLICY avisos_lectura ON public.avisos_privacidad FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_manager());
CREATE POLICY avisos_crear ON public.avisos_privacidad FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.is_active(auth.uid()));
CREATE OR REPLACE FUNCTION public.aviso_visto() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.user_id=auth.uid(); NEW.visto_at=now(); RETURN NEW; END $$;
CREATE TRIGGER aviso_visto BEFORE INSERT ON public.avisos_privacidad FOR EACH ROW EXECUTE FUNCTION public.aviso_visto();
CREATE TRIGGER avisos_inmutables BEFORE UPDATE OR DELETE ON public.avisos_privacidad FOR EACH ROW EXECUTE FUNCTION public.no_mutations();

-- PIN temporal: obligatorio cambiarlo en el primer acceso y tras cada reseteo del encargado.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS debe_cambiar_pin boolean NOT NULL DEFAULT true;

-- Nadie anónimo consulta roles.
REVOKE ALL ON FUNCTION public.has_role(uuid,app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO authenticated,service_role;
