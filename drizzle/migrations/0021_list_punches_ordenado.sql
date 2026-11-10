-- list_punches se lee por páginas (Supabase corta a 1.000 filas): con un orden fijo, las páginas no se solapan
-- ni dejan huecos entre una petición y la siguiente. Por trabajador y, dentro, por hora, como ya salía.
CREATE OR REPLACE FUNCTION public.list_punches(_uid uuid DEFAULT NULL,_desde date DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE todo boolean := public.is_manager() OR public.is_inspector();
BEGIN
  IF NOT public.is_active(auth.uid()) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
  IF _uid IS NULL AND NOT todo THEN _uid=auth.uid(); END IF;
  IF _uid IS NOT NULL AND _uid<>auth.uid() AND NOT todo THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN QUERY SELECT to_jsonb(e) FROM profiles p CROSS JOIN LATERAL public.effective_punches(p.id,_desde) e WHERE _uid IS NULL OR p.id=_uid ORDER BY p.id, e.at, e.id;
END $$;
REVOKE ALL ON FUNCTION public.list_punches(uuid,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.list_punches(uuid,date) TO authenticated;
