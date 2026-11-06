# Seguridad del registro de jornada
- [x] Bloquear altas en la app y en el disparador de creación; gestión solo por encargado.
- [ ] Cerrar altas en ajustes alojados: usuario debe desactivar registro en Más → Usuarios → Ajustes de autenticación (el disparador `handle_new_user` ya rechaza altas sin `alta_encargado`).
- [ ] Aprovisionar fuera de banda la cuenta de administrador con PIN temporal y cambio obligatorio, y activar el TOTP en el primer acceso (hasta entonces cualquiera con el PIN podría enrolar su propio autenticador).
- [x] Hacer fichajes inmutables, con hora del servidor y turnos continuos.
- [x] Conectar solicitudes y decisiones de corrección atómicas y auditables.
- [x] Corregir cálculos, avisos y exportaciones de jornadas sin cerrar.
- [x] Retirar geolocalización y registrar lectura del aviso informativo de privacidad (0006).
- [x] Jornada abierta >16 h = olvidada: no se cierra fichando, exige corrección (0007).
- [x] Arreglar request_correction (alias ambiguo, toda solicitud fallaba) (0008).
- [x] Cambio obligatorio de PIN en primer acceso y tras reseteo (debe_cambiar_pin).
- [x] Verificar acceso público, pruebas de cálculo y permisos declarados.
- [ ] Verificar acceso y cambio obligatorio de PIN, alta y reseteo de trabajadores y privacidad sin ubicación.

# Auditoría final (noviembre 2026)
- [x] `PIN_PEPPER` propio con rotación (`PIN_PEPPER_PREVIOUS`); sesión de la tablet revocada; IP del kiosco solo de Cloudflare.
- [x] Descanso semanal por racha; vacaciones en laborables en el Excel; avisos al cerrar el mes; errores claros en correcciones.
- [x] Lista blanca de servicios push; límite por IP; la Inspección solo consulta; cabeceras; carga parcial del histórico (0012).
- [x] Definir el secreto `PIN_PEPPER` en Lovable Cloud (la migración desde la clave de servicio es automática).
- [x] Aplicar la migración 0012: estaba escrita y registrada en el diario pero no ejecutada; la 0013 solo fuerza su aplicación.
- [ ] Comprobar en Equipo que el histórico y el Excel siguen cargando (hace falta una sesión firmada; no se ha probado).
- [x] Aplicar 0014: el alta la autoriza la tabla `altas_autorizadas` (solo clave de servicio); el disparador la consume y caduca a los 10 min.
