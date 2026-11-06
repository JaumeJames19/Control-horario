# Control de vacaciones — diseño

Fecha: 2026-10-31. Estado: implementado en la misma sesión (ver nota final).

## Objetivo

Que la app sea la vía oficial para pedir vacaciones y que el saldo de cada
trabajador sea visible y correcto, incluyendo los días en que la empresa cierra
(tres semanas de agosto y los últimos días de diciembre). Origen: el calendario
2026 de la empresa (Excel «calendario-2026-lunes-a-domingo»), que marca:

- **Cierre de empresa (amarillo):** 3–21 de agosto y 28–31 de diciembre.
- **Festivos (verde):** ya están en la tabla `festivos`.
- **«3 a elegir»:** 22 días laborables de vacaciones al año = 15 (agosto) +
  4 (diciembre) + 3 que elige cada trabajador.
- Otros avisos del calendario («Divendres de 7 a 15» en verano, «no es
  treballen dissabte» en agosto) quedan fuera de este cambio.

## Lo que ya existía

Tabla `ausencias` (tipo `vacaciones|permiso|baja|otra`, estados
`pendiente|aprobada|rechazada|anulada`), RPC `solicitar_ausencia` /
`decidir_ausencia`, pestaña «Ausencias» y `config_jornada.dias_vacaciones`
(30, en días naturales). Las ausencias aprobadas anulan el horario teórico del
día y cuentan en el Excel de la gestoría.

## Decisiones

1. **Cierres de empresa como dato propio.** Nueva tabla `cierres_empresa`
   (`desde`, `hasta`, `nombre`), mantenida por el encargado desde *Ajustes*
   igual que los festivos. Se siembran los dos cierres de 2026. Para todos
   los trabajadores, los días de cierre se tratan como vacaciones aprobadas:
   reducen el horario teórico, no generan avisos de «no ha fichado» y cuentan
   como vacaciones en el Excel de la gestoría. No se crean filas en `ausencias`
   por trabajador: se inyectan en el cálculo (`ausDe`), así un cambio en el
   cierre afecta a todos sin migrar datos.
2. **El saldo se cuenta en días laborables** (lunes a viernes, sin festivos),
   como hace la empresa. `dias_vacaciones` pasa a significar «días laborables
   al año» y la migración lo pone a 22 si todavía tenía el valor por defecto
   (30). Saldo = total − cierre de empresa − aprobadas − pendientes.
3. **La regla se aplica en la base de datos.** `solicitar_ausencia`, para
   `vacaciones`: rechaza solicitudes que pisen un cierre de empresa (esos días
   ya son vacaciones) y, si quien pide no es el encargado, rechaza las que
   superen el saldo del año. El encargado puede registrar de más (p. ej. días
   arrastrados), viendo el saldo en pantalla.
4. **Interfaz.** En «Ausencias»: tarjeta de saldo del año, calendario anual
   (festivos, cierres, vacaciones aprobadas y pendientes), formulario que
   muestra los días laborables que consume y avisa si no quedan. El encargado
   puede ver el calendario de cualquier trabajador, ve el saldo de cada uno en
   «Equipo» y gestiona los cierres en «Ajustes».
5. **Sin cambios en lo inmutable.** Fichajes, correcciones y cierres de mes no
   se tocan. Las solicitudes siguen siendo filas con quién, cuándo y decisión.

## Fuera de alcance

Horario de verano de los viernes, sábados de agosto, arrastre automático de
días al año siguiente, notificaciones.

## Nota

Esta sesión se ejecutó sin interlocutor en tiempo real; el diseño se aplicó
bajo las decisiones anteriores y queda pendiente de confirmación. Si el saldo
anual no es 22 o los cierres cambian, se editan desde *Ajustes* sin tocar
código.
