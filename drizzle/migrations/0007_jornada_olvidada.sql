-- Una jornada abierta más de 16 h se considera olvidada: no se puede cerrar fichando ahora
-- (registraría horas falsas); hay que solicitar una corrección con la hora real de salida.
CREATE OR REPLACE FUNCTION public.current_punch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_p record; st text='fuera'; inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  NEW.user_id=auth.uid();
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  SELECT * INTO last_p FROM public.effective_punches(NEW.user_id) ORDER BY at DESC LIMIT 1;
  IF FOUND THEN st=CASE last_p.tipo WHEN 'entrada' THEN 'trabajando' WHEN 'reanudar' THEN 'trabajando' WHEN 'pausa' THEN 'pausa' ELSE 'fuera' END; END IF;
  IF st<>'fuera' THEN
    SELECT max(at) INTO inicio FROM public.effective_punches(NEW.user_id) WHERE tipo='entrada';
    IF inicio < now() - interval '16 hours' THEN RAISE EXCEPTION 'Jornada anterior sin cerrar: solicita una corrección'; END IF;
  END IF;
  IF (st='fuera' AND NEW.tipo<>'entrada') OR (st='trabajando' AND NEW.tipo NOT IN ('pausa','salida')) OR (st='pausa' AND NEW.tipo NOT IN ('reanudar','salida')) THEN RAISE EXCEPTION 'Secuencia inválida'; END IF;
  NEW.at=now(); NEW.created_at=now(); NEW.editado=false; NEW.lugar='Centro principal';
  NEW.dia=CASE WHEN st<>'fuera' THEN last_p.dia ELSE (NEW.at AT TIME ZONE 'Europe/Madrid')::date END;
  RETURN NEW;
END $$;
