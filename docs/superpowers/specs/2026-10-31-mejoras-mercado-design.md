# Seis mejoras tras comparar con el mercado — diseño

Fecha: 2026-10-31. Aprobadas por el encargado en chat («Todos»).

## 1. Horarios por periodo
Tabla `horarios_periodo` (nombre, desde, hasta, `dia_semana` 1–7 o nulo = todos
los laborables, hora_entrada, hora_salida, horas_dia). `horarioDe(dia)` elige la
fila más específica (con día de la semana) y, a igualdad, la más reciente; si no
hay, el horario general de `config_jornada`. Afecta al teórico diario, a las
horas extra y a los avisos de olvido. Semilla: viernes de 7 a 15 del 1-06 al
30-09 de 2026 («Divendres de 7 a 15» del calendario). Se mantiene en Ajustes.

## 2. Descansos legales
`descansos(filas)`: menos de 12 h entre la salida y la entrada siguiente
(art. 34.3 ET) y siete o más días seguidos con fichajes (aproximación al
descanso semanal de día y medio, art. 37.1). Aparecen en los avisos del
trabajador y del encargado y se cuentan en el Excel de la gestoría.

## 3. Personal mínimo
`config_jornada.max_ausentes` (por defecto 2). Al aprobar una ausencia, si
algún día del tramo supera ese número de ausentes aprobados (cualquier tipo),
se avisa con nombres y fechas. No bloquea: decide el encargado.

## 4. Real Decreto de registro de jornada
- `fichajes.modalidad` ('presencial' | 'distancia'): casilla «trabajo a
  distancia» al fichar la entrada; se exporta.
- `profiles.inspector` + `is_inspector()` (activo, marcado y con 2FA): lectura
  de todo, sin poder fichar ni decidir. Pestaña «Inspección» de solo lectura.
- Exportación del histórico completo (todos los fichajes, correcciones,
  ausencias y cierres) en un Excel, para encargado e inspector.

## 5. Avisos push
Web Push estándar (VAPID + RFC 8291) con WebCrypto, sin dependencias, porque
el servidor corre en Cloudflare Workers. Tabla `push_subs`; `public/sw.js`;
servidor: `guardarSuscripcion`, `avisarEncargados` (nueva solicitud),
`avisarTrabajador` (decisión) y la ruta `/api/avisos` para el cron de
recordatorios (olvidos, descansos), con `avisos_enviados` para no repetir.
Requiere dos secretos en Lovable: `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.

## 6. Catalán
`t()` con diccionario castellano→catalán y `useIdioma()`; preferencia en
localStorage; selector en cabecera y en el acceso. Lo que no esté traducido
sale en castellano.
