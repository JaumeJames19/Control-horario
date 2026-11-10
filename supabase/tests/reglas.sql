-- Tests de las reglas que solo están en la base de datos. Ejecutar con scripts/test-sql.sh.
-- Todo va en una transacción que se deshace al final: no deja datos.
\set ON_ERROR_STOP 1
\o /dev/null
BEGIN;

CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO authenticated;
-- Ejecuta `q` y exige que falle con un mensaje que contenga `patron`.
CREATE FUNCTION tests.falla(q text, patron text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF position(patron IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Esperaba «%», llegó «%» en: %', patron, SQLERRM, q; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Debía fallar («%»): %', patron, q;
END $$;
GRANT EXECUTE ON FUNCTION tests.falla(text, text) TO authenticated;
-- Simula la sesión de un usuario (aal2 = con segundo factor).
CREATE FUNCTION tests.como(_uid uuid, _aal text DEFAULT 'aal1') RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _uid, 'aal', _aal, 'role', 'authenticated')::text, true) $$;
GRANT EXECUTE ON FUNCTION tests.como(uuid, text) TO authenticated;

-- Datos: un trabajador, una encargada y una inspectora (las altas pasan por altas_autorizadas, como en la app).
INSERT INTO altas_autorizadas(email) VALUES ('ana@fichaje.local'), ('jefa@fichaje.local'), ('ines@fichaje.local'), ('pepe@fichaje.local');
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'ana@fichaje.local'),
  ('00000000-0000-0000-0000-00000000000b', 'jefa@fichaje.local'),
  ('00000000-0000-0000-0000-00000000000c', 'ines@fichaje.local'),
  ('00000000-0000-0000-0000-00000000000d', 'pepe@fichaje.local');
INSERT INTO user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000000b', 'admin');
UPDATE profiles SET inspector = true WHERE id = '00000000-0000-0000-0000-00000000000c';
-- Pepe dejó una jornada abierta hace 20 horas (se inserta sin disparadores para poder poner la hora).
SET session_replication_role = replica;
INSERT INTO fichajes(user_id, tipo, dia, at) VALUES ('00000000-0000-0000-0000-00000000000d', 'entrada', (now() - interval '20 hours')::date, now() - interval '20 hours');
SET session_replication_role = origin;
UPDATE config_jornada SET fichaje_activo = true, ip_kiosco = '{198.51.100.7}' WHERE id = 1;

-- 1. Nadie se da de alta solo.
SELECT tests.falla($$INSERT INTO auth.users(email) VALUES ('intruso@fichaje.local')$$, 'Altas públicas deshabilitadas');

SET ROLE authenticated;

-- 2. Fichajes: la secuencia la valida la base de datos y la hora la pone el servidor.
SELECT tests.como('00000000-0000-0000-0000-00000000000a');
SELECT tests.falla($$INSERT INTO fichajes(user_id, tipo, dia) VALUES (auth.uid(), 'salida', '2000-01-01')$$, 'Secuencia inválida');
INSERT INTO fichajes(user_id, tipo, dia, at) VALUES (auth.uid(), 'entrada', '2000-01-01', '2001-01-01');
DO $$ BEGIN ASSERT (SELECT at FROM fichajes WHERE user_id = auth.uid()) = now(), 'La hora del fichaje debe ser la del servidor'; END $$;
SELECT tests.falla($$INSERT INTO fichajes(user_id, tipo, dia) VALUES (auth.uid(), 'entrada', '2000-01-01')$$, 'Secuencia inválida');
SELECT tests.falla($$INSERT INTO fichajes(user_id, tipo, dia) VALUES (auth.uid(), 'espera', '2000-01-01')$$, 'Solo conductores');
SELECT tests.falla($$UPDATE fichajes SET tipo = 'salida' WHERE user_id = auth.uid()$$, '');
SELECT tests.falla($$DELETE FROM fichajes WHERE user_id = auth.uid()$$, '');

-- Una jornada abierta hace más de 16 horas no se cierra fichando.
SELECT tests.como('00000000-0000-0000-0000-00000000000d');
SELECT tests.falla($$INSERT INTO fichajes(user_id, tipo, dia) VALUES (auth.uid(), 'salida', '2000-01-01')$$, 'Jornada anterior sin cerrar');
SELECT tests.como('00000000-0000-0000-0000-00000000000a');

-- 3. Vacaciones: no se puede pedir más saldo del que hay, pero un periodo corto sí.
SELECT tests.falla($$SELECT solicitar_ausencia(auth.uid(), 'vacaciones', '2028-01-03', '2028-03-31', null)$$, 'No quedan suficientes días');
SELECT solicitar_ausencia(auth.uid(), 'vacaciones', '2028-02-07', '2028-02-08', null);
SELECT tests.falla($$SELECT solicitar_ausencia(auth.uid(), 'vacaciones', '2028-02-08', '2028-02-09', null)$$, 'Se solapa');
SELECT tests.falla($$SELECT solicitar_ausencia(auth.uid(), 'vacaciones', '2026-08-03', '2026-08-04', null)$$, 'la empresa está cerrada');

-- 4. Un mes cerrado por el trabajador no admite correcciones suyas.
SELECT cerrar_mes('2026-01', true, null);
SELECT tests.falla($$SELECT request_correction(auth.uid(), 'olvido', '[{"original_id": null, "tipo": "entrada", "at": "2026-01-15T08:00:00Z", "anular": false}]')$$, 'Mes cerrado');
SELECT tests.falla($$SELECT cerrar_mes(to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM'), true, null)$$, 'Solo meses terminados');

-- 5. Sin segundo factor la encargada no es encargada; con él, sí.
SELECT tests.como('00000000-0000-0000-0000-00000000000b');
DO $$ BEGIN ASSERT NOT is_manager(), 'Sin aal2 no debe ser encargada'; END $$;
SELECT tests.falla($$SELECT activar_fichaje(false)$$, 'Solo encargado');
SELECT tests.como('00000000-0000-0000-0000-00000000000b', 'aal2');
DO $$ BEGIN ASSERT is_manager(), 'Con aal2 debe ser encargada'; END $$;

-- 6. La Inspección solo consulta.
SELECT tests.como('00000000-0000-0000-0000-00000000000c', 'aal2');
SELECT tests.falla($$INSERT INTO fichajes(user_id, tipo, dia) VALUES (auth.uid(), 'entrada', '2000-01-01')$$, 'La Inspección no ficha');
SELECT tests.falla($$SELECT solicitar_ausencia(auth.uid(), 'vacaciones', '2028-05-08', '2028-05-08', null)$$, 'La Inspección solo consulta');
DO $$ BEGIN ASSERT (SELECT count(*) FROM fichajes) = 2, 'La Inspección debe ver los fichajes de todos'; END $$;

-- list_punches sale ordenado por trabajador y hora (la app lo lee por páginas).
DO $$ BEGIN ASSERT (SELECT array_agg(x->>'user_id' ORDER BY n) FROM list_punches() WITH ORDINALITY t(x, n)) = ARRAY['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d'], 'list_punches debe salir ordenado'; END $$;

-- 7. Un trabajador no ve los datos de otro.
SELECT tests.como('00000000-0000-0000-0000-00000000000c');
DO $$ BEGIN ASSERT (SELECT count(*) FROM fichajes) = 0, 'Sin aal2 la Inspección no ve nada ajeno'; END $$;

RESET ROLE;

-- 8. Límite de intentos: 5 fallos bloquean al usuario; 20 desde una IP la bloquean, salvo la IP de la tableta.
DO $$ DECLARE i int; BEGIN
  FOR i IN 1..20 LOOP PERFORM intento_login('u' || i, 'kiosco', '198.51.100.7'); PERFORM intento_login('v' || i, 'app', '203.0.113.9'); END LOOP;
  ASSERT intento_login('otro', 'kiosco', '198.51.100.7') IS NOT NULL, 'La IP de la tableta no debe bloquearse por IP';
  ASSERT intento_login('otro', 'app', '203.0.113.9') IS NULL, 'Otra IP con 20 fallos debe quedar bloqueada';
  FOR i IN 1..5 LOOP PERFORM intento_login('ana', 'kiosco', '198.51.100.7'); END LOOP;
  ASSERT intento_login('ana', 'kiosco', '198.51.100.7') IS NULL, 'Tras 5 fallos el usuario debe quedar bloqueado';
END $$;

\o
\echo 'OK: todas las reglas de la base de datos se cumplen'
ROLLBACK;
