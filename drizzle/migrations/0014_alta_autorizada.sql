-- Arreglo del alta de trabajadores. El disparador exigía `alta_encargado` en raw_app_meta_data al insertar el usuario,
-- pero el servicio de autenticación de Supabase guarda app_metadata DESPUÉS de insertar la fila, así que toda alta
-- desde la app fallaba con «Altas públicas deshabilitadas». Ahora la función de servidor del encargado autoriza el
-- correo justo antes (tabla solo accesible con la clave de servicio) y el disparador comprueba esa autorización.
CREATE TABLE IF NOT EXISTS public.altas_autorizadas(
  email text PRIMARY KEY,
  creada_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.altas_autorizadas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.altas_autorizadas TO service_role;
ALTER TABLE public.altas_autorizadas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE autorizada boolean;
BEGIN
  -- Las autorizaciones caducan a los 10 minutos; la del correo que se está creando se consume aquí.
  DELETE FROM public.altas_autorizadas WHERE creada_at < now() - interval '10 minutes';
  DELETE FROM public.altas_autorizadas WHERE email = lower(new.email) RETURNING true INTO autorizada;
  IF NOT coalesce(autorizada, false) AND coalesce(new.raw_app_meta_data->>'alta_encargado','') <> 'true' THEN
    RAISE EXCEPTION 'Altas públicas deshabilitadas';
  END IF;
  INSERT INTO public.profiles(id, username, nombre)
  VALUES (new.id, split_part(new.email,'@',1), coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)));
  INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'user');
  RETURN new;
END $$;
