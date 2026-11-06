export type Tipo = "entrada" | "pausa" | "espera" | "reanudar" | "salida";
export type Estado = "fuera" | "trabajando" | "pausa" | "espera";
export type Evento = { tipo: Tipo; at: number };

export const TIPOS: Record<Tipo, string> = {
  entrada: "Entrada",
  pausa: "Pausa",
  espera: "Espera",
  reanudar: "Vuelta al trabajo",
  salida: "Salida",
};

/** "espera" = tiempo de presencia de los conductores (RD 1561/1995): se paga, pero no es trabajo efectivo. */
export const NEXT: Record<Estado, Tipo[]> = {
  fuera: ["entrada"],
  trabajando: ["pausa", "espera", "salida"],
  pausa: ["reanudar", "salida"],
  espera: ["reanudar", "salida"],
};

const AFTER: Record<Tipo, Estado> = {
  entrada: "trabajando",
  pausa: "pausa",
  espera: "espera",
  reanudar: "trabajando",
  salida: "fuera",
};

const MIN = 60000;
/** Pausa pagada del convenio de comercio de materiales de construcción de Barcelona. */
export function pausaConvenio(trabajadoMs: number) {
  if (trabajadoMs <= 0) return 0;
  return trabajadoMs > 5 * 60 * MIN ? 20 * MIN : 10 * MIN;
}

/** Una pausa más larga que esto se considera la comida (no retribuida), no el descanso del convenio. */
export const PAUSA_CORTA_MAX = 30 * MIN;

/**
 * Estado final y tiempos de una jornada. `worked` = trabajo efectivo + la parte de las pausas cortas
 * (≤ 30 min) que paga el convenio (20 min si >5 h, 10 min si menos). La comida no se paga.
 * Una jornada sin cerrar computa 0 salvo en vivo.
 */
export function compute(eventos: Evento[], now = Date.now(), live = false) {
  const evs = [...eventos].sort((a, b) => a.at - b.at);
  let state: Estado = "fuera";
  let efectivo = 0;
  let pausa = 0;
  let pausaCorta = 0;
  let presencia = 0;
  let since = 0;
  const sumar = (hasta: number) => {
    const d = Math.max(0, hasta - since);
    if (state === "trabajando") efectivo += d;
    else if (state === "pausa") { pausa += d; if (d <= PAUSA_CORTA_MAX) pausaCorta += d; }
    else if (state === "espera") presencia += d;
  };
  for (const e of evs) {
    sumar(e.at);
    state = AFTER[e.tipo];
    since = e.at;
  }
  const unclosed = state !== "fuera";
  if (unclosed && live) sumar(now);
  if (unclosed && !live) { efectivo = 0; pausa = 0; pausaCorta = 0; presencia = 0; }
  const credito = Math.min(pausaCorta, pausaConvenio(efectivo));
  return { state, worked: efectivo + credito, unclosed, efectivo, pausa, presencia, credito };
}

/** Una jornada abierta más de este tiempo se da por olvidada (misma regla que la base de datos). */
export const MAX_JORNADA_MS = 16 * 3600000;

/** true si la jornada sigue abierta y empezó hace menos de 16 h: está en curso, no olvidada. */
export function enCurso(eventos: Evento[], now = Date.now()) {
  const evs = [...eventos].sort((a, b) => a.at - b.at);
  const inicio = [...evs].reverse().find((e) => e.tipo === "entrada");
  return compute(evs).unclosed && inicio !== undefined && now - inicio.at < MAX_JORNADA_MS;
}

/** Comprueba que la secuencia de fichajes sea posible. Devuelve un mensaje de error o null. */
export function validSeq(eventos: Evento[]): string | null {
  const evs = [...eventos].sort((a, b) => a.at - b.at);
  let state: Estado = "fuera";
  for (const e of evs) {
    if (!NEXT[state].includes(e.tipo))
      return `No se puede fichar «${TIPOS[e.tipo]}» en ese orden.`;
    state = AFTER[e.tipo];
  }
  return null;
}

export function dkey(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value ?? "").join("-");
}

export function hm(at: number | string) {
  return new Date(at).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
}

/** Entrada de calendario español a UTC; evita depender del huso del dispositivo. */
export function madridTime(value: string) {
  const base = Date.parse(value + "Z");
  if (!Number.isFinite(base)) throw new Error("Fecha inválida");
  let result = base;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(result)).replace(" ", "T");
    result += base - Date.parse(parts + "Z");
  }
  return new Date(result).toISOString();
}

export function localInput(at: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at)).replace(" ", "T");
}

export function dur(ms: number) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** PIN fácil de adivinar: todos iguales o una escalera (123456, 654321...). */
export function pinDebil(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const paso = d[1]! - d[0]!;
  return Math.abs(paso) === 1 && d.every((x, i) => i === 0 || x - d[i - 1]! === paso);
}

export function usernameToEmail(u: string) {
  return `${normUser(u)}@fichaje.local`;
}
export function normUser(u: string) {
  return u
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}
