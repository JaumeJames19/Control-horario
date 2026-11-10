-- La tableta y los móviles del wifi del almacén salen por la misma IP pública: 20 PIN mal tecleados en 15 min
-- al cambio de turno dejaban a todos sin poder fichar. Las IPs de la tableta (config_jornada.ip_kiosco) ya no
-- cuentan para el límite por IP; sigue el bloqueo de 5 fallos por usuario y la IP se sigue guardando en accesos.
CREATE OR REPLACE FUNCTION public.intento_login(_username text,_origen text,_ip text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login:'||_username,0));
  IF (SELECT count(*) FROM accesos WHERE username=_username AND NOT ok AND at > now()-interval '15 minutes') >= 5 THEN RETURN NULL; END IF;
  IF nullif(_ip,'') IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM config_jornada WHERE id=1 AND _ip = ANY(ip_kiosco))
    AND (SELECT count(*) FROM accesos WHERE ip=_ip AND NOT ok AND at > now()-interval '15 minutes') >= 20 THEN RETURN NULL; END IF;
  INSERT INTO accesos(username,ok,origen,ip) VALUES(_username,false,_origen,nullif(_ip,'')) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.intento_login(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intento_login(text,text,text) TO service_role;
