-- Todos los fichajes efectivos en una sola fila (array JSON): el límite de 1.000 filas de Supabase no la corta, así que la
-- app no pagina. Con páginas, la base de datos recalculaba el historial en cada una y una corrección aprobada entre dos
-- páginas podía saltarse una fila. Mismos permisos y mismo orden que list_punches, que es quien los comprueba.
CREATE OR REPLACE FUNCTION public.list_punches_json(_uid uuid DEFAULT NULL,_desde date DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM public.list_punches(_uid,_desde) WITH ORDINALITY t(x, n) $$;
REVOKE ALL ON FUNCTION public.list_punches_json(uuid,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.list_punches_json(uuid,date) TO authenticated;
