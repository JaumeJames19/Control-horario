-- La app arranca solo con vacaciones: el fichaje queda desactivado hasta que el encargado lo active en Ajustes.
-- Se bloquea en la base de datos (no solo en pantalla), así que tampoco ficha la tablet ni ninguna otra vía.
ALTER TABLE public.config_jornada ADD COLUMN IF NOT EXISTS fichaje_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.config_jornada.fichaje_activo IS 'Si es falso no se puede fichar (la app funciona solo para vacaciones y ausencias)';

CREATE OR REPLACE FUNCTION public.fichaje_desactivado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT coalesce((SELECT fichaje_activo FROM config_jornada WHERE id = 1), true) THEN RAISE EXCEPTION 'Fichaje desactivado'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fichaje_solo_si_activo ON public.fichajes;
CREATE TRIGGER fichaje_solo_si_activo BEFORE INSERT ON public.fichajes FOR EACH ROW EXECUTE FUNCTION public.fichaje_desactivado();

-- Activar o desactivar el fichaje (solo encargado).
CREATE OR REPLACE FUNCTION public.activar_fichaje(_activo boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo encargado'; END IF;
  UPDATE config_jornada SET fichaje_activo = _activo WHERE id = 1;
END $$;
REVOKE ALL ON FUNCTION public.activar_fichaje(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activar_fichaje(boolean) TO authenticated;
