-- Fichar leía dos veces la línea de tiempo completa del trabajador (último fichaje y última entrada).
-- Ahora una sola lectura da los dos. Mismas reglas que en 0011.
CREATE OR REPLACE FUNCTION public.current_punch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_p record; st text='fuera';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND inspector) THEN RAISE EXCEPTION 'La Inspección no ficha'; END IF;
  NEW.user_id=auth.uid();
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  -- La ventana se calcula sobre todas las filas antes del LIMIT: `inicio` es la última entrada de todo el historial.
  SELECT e.*, max(e.at) FILTER (WHERE e.tipo='entrada') OVER () AS inicio INTO last_p
    FROM public.effective_punches(NEW.user_id) e ORDER BY e.at DESC LIMIT 1;
  IF FOUND THEN st=public.estado_tras(last_p.tipo); END IF;
  IF st<>'fuera' AND last_p.inicio < now() - interval '16 hours' THEN RAISE EXCEPTION 'Jornada anterior sin cerrar: solicita una corrección'; END IF;
  IF NEW.tipo='espera' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND conductor) THEN RAISE EXCEPTION 'Solo conductores'; END IF;
  IF NOT public.paso_valido(st,NEW.tipo) THEN RAISE EXCEPTION 'Secuencia inválida'; END IF;
  NEW.at=now(); NEW.created_at=now(); NEW.editado=false; NEW.lugar='Centro principal';
  NEW.dia=CASE WHEN st<>'fuera' THEN last_p.dia ELSE (NEW.at AT TIME ZONE 'Europe/Madrid')::date END;
  NEW.modalidad=CASE WHEN st<>'fuera' THEN last_p.modalidad ELSE coalesce(NEW.modalidad,'presencial') END;
  RETURN NEW;
END $$;
