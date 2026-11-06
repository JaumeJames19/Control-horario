-- Días de vacaciones de otros años: días pendientes del año anterior (o descuentos) que el encargado suma al saldo de
-- un trabajador en un año concreto. El cupo de ese año pasa a ser config_jornada.dias_vacaciones + los ajustes.
CREATE TABLE public.vacaciones_ajustes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  anio int NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  dias int NOT NULL CHECK (dias <> 0 AND dias BETWEEN -60 AND 60),
  motivo text NOT NULL CHECK (length(trim(motivo)) > 0),
  creado_por uuid NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vacaciones_ajustes_usuario_anio ON public.vacaciones_ajustes(user_id, anio);
REVOKE ALL ON public.vacaciones_ajustes FROM anon, authenticated;
GRANT SELECT ON public.vacaciones_ajustes TO authenticated; GRANT ALL ON public.vacaciones_ajustes TO service_role;
ALTER TABLE public.vacaciones_ajustes ENABLE ROW LEVEL SECURITY;
CREATE POLICY vacaciones_ajustes_lectura ON public.vacaciones_ajustes FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND public.is_active(auth.uid())) OR public.is_manager() OR public.is_inspector());

-- Cupo de vacaciones de un trabajador en un año: el general más sus días de otros años.
CREATE OR REPLACE FUNCTION public.cupo_vacaciones(_uid uuid, _year int) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (SELECT dias_vacaciones FROM config_jornada WHERE id = 1)
    + coalesce((SELECT sum(dias) FROM vacaciones_ajustes WHERE user_id = _uid AND anio = _year), 0)::int $$;
REVOKE ALL ON FUNCTION public.cupo_vacaciones(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupo_vacaciones(uuid,int) TO authenticated;

-- Alta o baja de un ajuste (solo encargado).
CREATE OR REPLACE FUNCTION public.guardar_ajuste_vacaciones(_id uuid, _uid uuid, _anio int, _dias int, _motivo text, _borrar boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  IF _borrar THEN DELETE FROM vacaciones_ajustes WHERE id = _id; RETURN _id; END IF;
  IF NOT public.is_active(_uid) THEN RAISE EXCEPTION 'Trabajador inexistente'; END IF;
  INSERT INTO vacaciones_ajustes(user_id, anio, dias, motivo, creado_por) VALUES (_uid, _anio, _dias, trim(_motivo), auth.uid()) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.guardar_ajuste_vacaciones(uuid,uuid,int,int,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_ajuste_vacaciones(uuid,uuid,int,int,text,boolean) TO authenticated;

-- Solicitar ausencia: igual que antes, pero el saldo de cada año usa el cupo del trabajador (con sus días de otros años).
CREATE OR REPLACE FUNCTION public.solicitar_ausencia(_uid uuid, _tipo text, _desde date, _hasta date, _motivo text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; jefe boolean := public.is_manager(); y int;
BEGIN
  IF NOT public.is_active(auth.uid()) OR NOT public.is_active(_uid) OR (_uid<>auth.uid() AND NOT jefe) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF public.es_inspector(auth.uid()) OR public.es_inspector(_uid) THEN RAISE EXCEPTION 'La Inspección solo consulta'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,1));
  IF EXISTS(SELECT 1 FROM ausencias WHERE user_id=_uid AND estado IN ('pendiente','aprobada') AND daterange(desde,hasta,'[]') && daterange(_desde,_hasta,'[]')) THEN RAISE EXCEPTION 'Se solapa con otra ausencia'; END IF;
  IF _tipo='vacaciones' THEN
    IF EXISTS(SELECT 1 FROM cierres_empresa c WHERE daterange(c.desde,c.hasta,'[]') && daterange(_desde,_hasta,'[]')) THEN RAISE EXCEPTION 'Esos días la empresa está cerrada: ya son vacaciones'; END IF;
    IF NOT jefe THEN
      FOR y IN extract(year FROM _desde)::int .. extract(year FROM _hasta)::int LOOP
        IF public.vacaciones_usadas(_uid, y) + public.laborables_vacaciones(greatest(_desde, make_date(y,1,1)), least(_hasta, make_date(y,12,31))) > public.cupo_vacaciones(_uid, y)
          THEN RAISE EXCEPTION 'No quedan suficientes días de vacaciones en %', y; END IF;
      END LOOP;
    END IF;
  END IF;
  INSERT INTO ausencias(user_id,tipo,desde,hasta,motivo,solicitada_por,estado,decidida_por,decidida_at)
  VALUES(_uid,_tipo,_desde,_hasta,nullif(trim(coalesce(_motivo,'')),''),auth.uid(),
    CASE WHEN jefe THEN 'aprobada' ELSE 'pendiente' END, CASE WHEN jefe THEN auth.uid() END, CASE WHEN jefe THEN now() END)
  RETURNING id INTO rid; RETURN rid;
END $$;
