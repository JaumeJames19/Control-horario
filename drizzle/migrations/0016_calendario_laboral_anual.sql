-- Calendario laboral por año en tablas (festivos y cierres_empresa), sin tocar la app para cargar el año siguiente.
-- 1. Festivos con tipo (nacional, autonómico, local) y marca de provisional (local pendiente de confirmación oficial).
-- 2. Cierres de empresa que son puentes: con la compensación activada se cubren con los festivos que caen en sábado.
-- 3. Compensación de festivos en sábado: parámetro de la empresa, desactivado hasta confirmarlo con la gestoría.
-- 4. Importador de un año completo en JSON (solo encargado) y carga del calendario 2027 de ejemplo (Localidad Demo).

ALTER TABLE public.festivos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'nacional' CHECK (tipo IN ('nacional','autonomico','local')),
  ADD COLUMN IF NOT EXISTS provisional boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.festivos.provisional IS 'Festivo local aún no publicado oficialmente: se muestra «pendiente de confirmación oficial»';
UPDATE public.festivos SET tipo = 'local' WHERE nombre ILIKE '%local%';
UPDATE public.festivos SET tipo = 'autonomico' WHERE nombre IN ('Lunes de Pascua','Sant Joan','Diada','Sant Esteve');

ALTER TABLE public.cierres_empresa ADD COLUMN IF NOT EXISTS puente boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.cierres_empresa.puente IS 'Puente: con config_jornada.compensar_sabados se cubre con los festivos que caen en sábado y no resta vacaciones';

ALTER TABLE public.config_jornada ADD COLUMN IF NOT EXISTS compensar_sabados boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.config_jornada.compensar_sabados IS 'Los festivos que caen en sábado se compensan cubriendo los días de puente (pendiente de confirmar con la gestoría)';

-- Días de puente cubiertos por festivos en sábado ese año: tantos como sábados festivos, como mucho los días de puente.
CREATE OR REPLACE FUNCTION public.dias_compensados(_year int) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN coalesce((SELECT compensar_sabados FROM config_jornada WHERE id = 1), false) THEN least(
    (SELECT count(*) FROM festivos f WHERE extract(year FROM f.fecha) = _year AND extract(isodow FROM f.fecha) = 6),
    (SELECT count(DISTINCT d::date) FROM cierres_empresa c, generate_series(c.desde, c.hasta, interval '1 day') d
      WHERE c.puente AND extract(year FROM d) = _year AND extract(isodow FROM d) BETWEEN 1 AND 5
        AND NOT EXISTS (SELECT 1 FROM festivos f WHERE f.fecha = d::date))
  )::int ELSE 0 END $$;

-- Vacaciones consumidas en el año: cierre de empresa (menos los puentes compensados) + solicitudes pendientes o aprobadas.
CREATE OR REPLACE FUNCTION public.vacaciones_usadas(_uid uuid, _year int) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (
    SELECT count(*)::int FROM generate_series(make_date(_year,1,1), make_date(_year,12,31), interval '1 day') d
    WHERE extract(isodow FROM d) BETWEEN 1 AND 5
      AND NOT EXISTS (SELECT 1 FROM festivos f WHERE f.fecha = d::date)
      AND EXISTS (SELECT 1 FROM cierres_empresa c WHERE d::date BETWEEN c.desde AND c.hasta)
  ) - public.dias_compensados(_year) + coalesce((
    SELECT sum(public.laborables_vacaciones(greatest(a.desde, make_date(_year,1,1)), least(a.hasta, make_date(_year,12,31))))::int
    FROM ausencias a
    WHERE a.user_id = _uid AND a.tipo = 'vacaciones' AND a.estado IN ('pendiente','aprobada')
      AND a.desde <= make_date(_year,12,31) AND a.hasta >= make_date(_year,1,1)
  ), 0) $$;
REVOKE ALL ON FUNCTION public.dias_compensados(int), public.vacaciones_usadas(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dias_compensados(int), public.vacaciones_usadas(uuid,int) TO authenticated;

-- Configuración: añade la compensación de sábados (nulo = no cambiarla).
DROP FUNCTION IF EXISTS public.guardar_config(numeric,numeric,time,time,int,text[],int);
CREATE OR REPLACE FUNCTION public.guardar_config(_horas_semana numeric,_horas_anuales numeric,_entrada time,_salida time,_vacaciones int,_ips text[],_max_ausentes int,_compensar_sabados boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
IF _salida <= _entrada THEN RAISE EXCEPTION 'La hora de salida debe ser posterior a la de entrada'; END IF;
IF _vacaciones < 0 OR _vacaciones > 60 THEN RAISE EXCEPTION 'Días de vacaciones inválidos'; END IF;
UPDATE config_jornada SET horas_semana=_horas_semana,horas_anuales=_horas_anuales,hora_entrada=_entrada,hora_salida=_salida,dias_vacaciones=_vacaciones,ip_kiosco=coalesce(_ips,'{}'),max_ausentes=coalesce(_max_ausentes,2),compensar_sabados=coalesce(_compensar_sabados,compensar_sabados) WHERE id=1; END $$;
REVOKE ALL ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[],int,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_config(numeric,numeric,time,time,int,text[],int,boolean) TO authenticated;

-- Festivo: alta, cambio (también de fecha, con _fecha_anterior) o baja. Tipo y provisional nulos = conservar los que tenía.
DROP FUNCTION IF EXISTS public.guardar_festivo(date,text,boolean);
CREATE OR REPLACE FUNCTION public.guardar_festivo(_fecha date,_nombre text,_borrar boolean,_tipo text DEFAULT NULL,_provisional boolean DEFAULT NULL,_fecha_anterior date DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ant festivos;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  IF _borrar THEN DELETE FROM festivos WHERE fecha=_fecha; RETURN; END IF;
  IF length(trim(coalesce(_nombre,''))) = 0 THEN RAISE EXCEPTION 'Falta el nombre'; END IF;
  IF _fecha_anterior IS NOT NULL AND _fecha_anterior <> _fecha THEN
    IF EXISTS(SELECT 1 FROM festivos WHERE fecha=_fecha) THEN RAISE EXCEPTION 'Ya hay un festivo ese día'; END IF;
    DELETE FROM festivos WHERE fecha=_fecha_anterior RETURNING * INTO ant;
  END IF;
  INSERT INTO festivos(fecha,nombre,tipo,provisional)
  VALUES(_fecha, trim(_nombre), coalesce(_tipo, ant.tipo, 'nacional'), coalesce(_provisional, ant.provisional, false))
  ON CONFLICT(fecha) DO UPDATE SET nombre=excluded.nombre, tipo=coalesce(_tipo, festivos.tipo), provisional=coalesce(_provisional, festivos.provisional);
END $$;
REVOKE ALL ON FUNCTION public.guardar_festivo(date,text,boolean,text,boolean,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_festivo(date,text,boolean,text,boolean,date) TO authenticated;

-- Cierre de empresa: ahora con la marca de puente (nulo = conservarla; en altas, no es puente).
DROP FUNCTION IF EXISTS public.guardar_cierre_empresa(uuid,date,date,text,boolean);
CREATE OR REPLACE FUNCTION public.guardar_cierre_empresa(_id uuid, _desde date, _hasta date, _nombre text, _borrar boolean, _puente boolean DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  IF _borrar THEN DELETE FROM cierres_empresa WHERE id=_id; RETURN _id; END IF;
  IF _id IS NULL THEN
    INSERT INTO cierres_empresa(desde, hasta, nombre, puente) VALUES (_desde, _hasta, trim(_nombre), coalesce(_puente, false)) RETURNING id INTO rid;
  ELSE
    UPDATE cierres_empresa SET desde=_desde, hasta=_hasta, nombre=trim(_nombre), puente=coalesce(_puente, puente) WHERE id=_id RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'No existe'; END IF;
  END IF;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.guardar_cierre_empresa(uuid,date,date,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_cierre_empresa(uuid,date,date,text,boolean,boolean) TO authenticated;

-- Carga (o recarga) el calendario de un año desde el JSON del calendario laboral: sustituye los festivos y los
-- cierres que empiezan ese año. Comprueba los días laborables de cada cierre y el resumen si vienen indicados.
-- `cae_en_sabado` no se guarda: se deduce de la fecha. Un cierre es puente si lo dice `puente` o su motivo empieza por «Puente».
CREATE OR REPLACE FUNCTION public._cargar_calendario(_d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  y int := (_d->>'anio')::int;
  f jsonb; c jsonb; desde date; hasta date; lab int; total int := 0; nf int := 0; nc int := 0;
BEGIN
  IF y IS NULL OR y < 2000 OR y > 2100 THEN RAISE EXCEPTION 'Año inválido'; END IF;
  IF jsonb_typeof(coalesce(_d->'festivos','[]')) <> 'array' OR jsonb_typeof(coalesce(_d->'cierres_empresa','[]')) <> 'array' THEN RAISE EXCEPTION 'Formato inválido'; END IF;
  DELETE FROM festivos WHERE extract(year FROM fecha) = y
    AND fecha NOT IN (SELECT (x->>'fecha')::date FROM jsonb_array_elements(coalesce(_d->'festivos','[]')) x);
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(_d->'festivos','[]')) LOOP
    IF extract(year FROM (f->>'fecha')::date) <> y THEN RAISE EXCEPTION 'El festivo % no es de %', f->>'fecha', y; END IF;
    IF length(trim(coalesce(f->>'nombre',''))) = 0 THEN RAISE EXCEPTION 'Al festivo % le falta el nombre', f->>'fecha'; END IF;
    INSERT INTO festivos(fecha, nombre, tipo, provisional)
    VALUES ((f->>'fecha')::date, trim(f->>'nombre'), coalesce(f->>'tipo','nacional'), coalesce((f->>'provisional')::boolean, false))
    ON CONFLICT (fecha) DO UPDATE SET nombre=excluded.nombre, tipo=excluded.tipo, provisional=excluded.provisional;
    nf := nf + 1;
  END LOOP;
  DELETE FROM cierres_empresa WHERE extract(year FROM cierres_empresa.desde) = y;
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(_d->'cierres_empresa','[]')) LOOP
    desde := (c->>'desde')::date; hasta := (c->>'hasta')::date;
    IF extract(year FROM desde) <> y THEN RAISE EXCEPTION 'El cierre del % no es de %', desde, y; END IF;
    INSERT INTO cierres_empresa(desde, hasta, nombre, puente)
    VALUES (desde, hasta, trim(coalesce(c->>'motivo', c->>'nombre')), coalesce((c->>'puente')::boolean, coalesce(c->>'motivo', c->>'nombre') ILIKE 'puente%'));
    SELECT count(*) INTO lab FROM generate_series(desde, hasta, interval '1 day') d
      WHERE extract(isodow FROM d) BETWEEN 1 AND 5 AND NOT EXISTS (SELECT 1 FROM festivos x WHERE x.fecha = d::date);
    IF c ? 'dias_laborables' AND lab <> (c->>'dias_laborables')::int THEN
      RAISE EXCEPTION 'El cierre del % al % tiene % días laborables, no %', desde, hasta, lab, c->>'dias_laborables'; END IF;
    total := total + lab; nc := nc + 1;
  END LOOP;
  IF _d->'resumen' ? 'dias_cierre_laborables' AND total <> (_d->'resumen'->>'dias_cierre_laborables')::int THEN
    RAISE EXCEPTION 'Los cierres suman % días laborables, no %', total, _d->'resumen'->>'dias_cierre_laborables'; END IF;
  RETURN jsonb_build_object('anio', y, 'festivos', nf, 'cierres', nc, 'dias_cierre_laborables', total);
END $$;
REVOKE ALL ON FUNCTION public._cargar_calendario(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cargar_calendario(_datos jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  RETURN public._cargar_calendario(_datos);
END $$;
REVOKE ALL ON FUNCTION public.cargar_calendario(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargar_calendario(jsonb) TO authenticated;

-- Calendario laboral 2027 de ejemplo (Localidad Demo). Las dos fiestas locales son provisionales.
SELECT public._cargar_calendario($json${
  "anio": 2027,
  "festivos": [
    { "fecha": "2027-01-01", "nombre": "Año Nuevo",          "tipo": "nacional" },
    { "fecha": "2027-01-06", "nombre": "Reyes",              "tipo": "nacional" },
    { "fecha": "2027-03-12", "nombre": "Fiesta local 1",     "tipo": "local", "provisional": true },
    { "fecha": "2027-03-26", "nombre": "Viernes Santo",      "tipo": "nacional" },
    { "fecha": "2027-03-29", "nombre": "Lunes de Pascua",    "tipo": "autonomico" },
    { "fecha": "2027-05-01", "nombre": "Fiesta del Trabajo", "tipo": "nacional" },
    { "fecha": "2027-06-24", "nombre": "Sant Joan",          "tipo": "autonomico" },
    { "fecha": "2027-09-06", "nombre": "Fiesta local 2",     "tipo": "local", "provisional": true },
    { "fecha": "2027-09-11", "nombre": "Diada",              "tipo": "autonomico" },
    { "fecha": "2027-10-12", "nombre": "Fiesta Nacional",    "tipo": "nacional" },
    { "fecha": "2027-11-01", "nombre": "Todos los Santos",   "tipo": "nacional" },
    { "fecha": "2027-12-06", "nombre": "Constitución",       "tipo": "nacional" },
    { "fecha": "2027-12-08", "nombre": "Inmaculada",         "tipo": "nacional" },
    { "fecha": "2027-12-25", "nombre": "Navidad",            "tipo": "nacional" }
  ],
  "cierres_empresa": [
    { "desde": "2027-06-25", "hasta": "2027-06-25", "motivo": "Puente Sant Joan",     "dias_laborables": 1 },
    { "desde": "2027-08-09", "hasta": "2027-08-27", "motivo": "Vacaciones de verano", "dias_laborables": 15 },
    { "desde": "2027-12-07", "hasta": "2027-12-07", "motivo": "Puente de diciembre",  "dias_laborables": 1 }
  ],
  "resumen": { "dias_cierre_laborables": 17 }
}$json$::jsonb);
