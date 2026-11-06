-- Control de vacaciones: cierres de empresa (vacaciones colectivas) y saldo en días laborables.
-- Calendario 2026: la empresa cierra del 3 al 21 de agosto y del 28 al 31 de diciembre (19 laborables);
-- cada trabajador elige 3 más = 22 días laborables al año.

CREATE TABLE public.cierres_empresa(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desde date NOT NULL,
  hasta date NOT NULL CHECK (hasta >= desde AND hasta - desde < 62),
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  EXCLUDE USING gist (daterange(desde, hasta, '[]') WITH &&)
);
REVOKE ALL ON public.cierres_empresa FROM anon, authenticated;
GRANT SELECT ON public.cierres_empresa TO authenticated; GRANT ALL ON public.cierres_empresa TO service_role;
ALTER TABLE public.cierres_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY cierres_empresa_lectura ON public.cierres_empresa FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
INSERT INTO public.cierres_empresa(desde, hasta, nombre) VALUES
 ('2026-08-03', '2026-08-21', 'Vacaciones de agosto'),
 ('2026-12-28', '2026-12-31', 'Cierre de Navidad');

CREATE OR REPLACE FUNCTION public.guardar_cierre_empresa(_id uuid, _desde date, _hasta date, _nombre text, _borrar boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  IF _borrar THEN DELETE FROM cierres_empresa WHERE id=_id; RETURN _id; END IF;
  IF _id IS NULL THEN
    INSERT INTO cierres_empresa(desde, hasta, nombre) VALUES (_desde, _hasta, trim(_nombre)) RETURNING id INTO rid;
  ELSE
    UPDATE cierres_empresa SET desde=_desde, hasta=_hasta, nombre=trim(_nombre) WHERE id=_id RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'No existe'; END IF;
  END IF;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.guardar_cierre_empresa(uuid,date,date,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_cierre_empresa(uuid,date,date,text,boolean) TO authenticated;

-- El saldo se cuenta en días laborables (L-V sin festivos), como en el calendario de la empresa.
COMMENT ON COLUMN public.config_jornada.dias_vacaciones IS 'Días laborables de vacaciones al año, cierre de empresa incluido';
UPDATE public.config_jornada SET dias_vacaciones = 22 WHERE id = 1 AND dias_vacaciones = 30;
ALTER TABLE public.config_jornada ALTER COLUMN dias_vacaciones SET DEFAULT 22;

-- Laborables de un tramo que consumen saldo: ni fin de semana, ni festivo, ni cierre de empresa (ya es vacación).
CREATE OR REPLACE FUNCTION public.laborables_vacaciones(_desde date, _hasta date) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::int FROM generate_series(_desde, _hasta, interval '1 day') d
  WHERE extract(isodow FROM d) BETWEEN 1 AND 5
    AND NOT EXISTS (SELECT 1 FROM festivos f WHERE f.fecha = d::date)
    AND NOT EXISTS (SELECT 1 FROM cierres_empresa c WHERE d::date BETWEEN c.desde AND c.hasta) $$;

-- Días laborables de vacaciones ya consumidos en el año: cierre de empresa + solicitudes pendientes o aprobadas.
CREATE OR REPLACE FUNCTION public.vacaciones_usadas(_uid uuid, _year int) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (
    SELECT count(*)::int FROM generate_series(make_date(_year,1,1), make_date(_year,12,31), interval '1 day') d
    WHERE extract(isodow FROM d) BETWEEN 1 AND 5
      AND NOT EXISTS (SELECT 1 FROM festivos f WHERE f.fecha = d::date)
      AND EXISTS (SELECT 1 FROM cierres_empresa c WHERE d::date BETWEEN c.desde AND c.hasta)
  ) + coalesce((
    SELECT sum(public.laborables_vacaciones(greatest(a.desde, make_date(_year,1,1)), least(a.hasta, make_date(_year,12,31))))::int
    FROM ausencias a
    WHERE a.user_id = _uid AND a.tipo = 'vacaciones' AND a.estado IN ('pendiente','aprobada')
      AND a.desde <= make_date(_year,12,31) AND a.hasta >= make_date(_year,1,1)
  ), 0) $$;
REVOKE ALL ON FUNCTION public.laborables_vacaciones(date,date), public.vacaciones_usadas(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laborables_vacaciones(date,date), public.vacaciones_usadas(uuid,int) TO authenticated;

-- Solicitar ausencia: las vacaciones no pueden pisar un cierre de empresa y, salvo que las registre el
-- encargado, no pueden superar el saldo del año. La app es la vía oficial: queda quién, cuándo y la decisión.
CREATE OR REPLACE FUNCTION public.solicitar_ausencia(_uid uuid,_tipo text,_desde date,_hasta date,_motivo text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; jefe boolean := public.is_manager(); y int; cupo int;
BEGIN
  IF NOT public.is_active(auth.uid()) OR NOT public.is_active(_uid) OR (_uid<>auth.uid() AND NOT jefe) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
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
