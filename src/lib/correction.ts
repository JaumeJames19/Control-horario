export function decisionReason(approve: boolean, reason: string) {
  const trimmed = reason.trim();
  if (!approve && !trimmed) throw new Error("Motivo obligatorio para rechazar");
  return trimmed || "Aprobada por el encargado";
}

/** Mensajes que devuelve la base de datos al solicitar o decidir una corrección, en palabras del usuario. */
const MENSAJES: [string, string][] = [
  ["distintas y crecientes", "Dos fichajes tendrían la misma hora o quedarían desordenados. Revisa las horas."],
  ["Secuencia de fichajes", "Con ese cambio la secuencia no cuadra (por ejemplo, dos entradas seguidas o una salida sin entrada)."],
  ["Mes cerrado", "Ese mes ya está cerrado: pide la corrección al encargado."],
  ["Solo conductores", "El tiempo de espera solo lo pueden fichar los conductores."],
  ["Hora o tipo inválidos", "Falta la fecha y hora, o es posterior a ahora."],
  ["Original repetido", "Has propuesto dos cambios para el mismo fichaje."],
  ["Ya decidida", "Esta solicitud ya estaba decidida."],
  ["Motivo", "Escribe el motivo."],
];

export function mensajeCorreccion(error: unknown, porDefecto: string) {
  const msg = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  return MENSAJES.find(([clave]) => msg.includes(clave))?.[1] ?? porDefecto;
}
