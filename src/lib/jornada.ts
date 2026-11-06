import { compute, enCurso, type Evento } from "./fichaje";

/** Parámetros del convenio y del calendario, editables por el encargado. */
export type Config = {
  horas_semana: number;
  horas_anuales: number;
  hora_entrada: string; // "08:00"
  hora_salida: string; // "17:00"
  dias_vacaciones: number; // laborables al año (cierre de empresa incluido)
  compensar_sabados?: boolean; // los festivos en sábado cubren los puentes (pendiente de confirmar con la gestoría)
  periodos?: Periodo[]; // horarios especiales (jornada intensiva de verano, etc.)
};

/** Horario especial en un tramo de fechas; `dia_semana` 1 (lunes) – 7 (domingo) o nulo = todos los laborables. */
export type Periodo = { nombre: string; desde: string; hasta: string; dia_semana: number | null; hora_entrada: string; hora_salida: string; horas_dia: number | null };

export type FilaDia = { dia: string; tipo: Evento["tipo"]; at: string };
export type Ausencia = { tipo: string; desde: string; hasta: string; estado: string };

const H = 3600000;
const MIN = 60000;

/** Hora local de España de un instante: día "YYYY-MM-DD", día de la semana (0 = domingo) y minutos desde las 00:00. */
const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
const DOWS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function madrid(ms: number) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value])) as Record<string, string>;
  return { dia: `${p["year"]}-${p["month"]}-${p["day"]}`, dow: DOWS[p["weekday"] ?? ""] ?? 0, min: Number(p["hour"]) * 60 + Number(p["minute"]) };
}

/** Días de calendario "YYYY-MM-DD" (sin husos: se opera en UTC). */
export function sumarDias(dia: string, n: number) {
  const d = new Date(dia + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dowDe = (dia: string) => new Date(dia + "T00:00:00Z").getUTCDay();
export const lunesDe = (dia: string) => sumarDias(dia, -((dowDe(dia) + 6) % 7));
export function diasEntre(desde: string, hasta: string) {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}
export function diasDelMes(ym: string) {
  const [y = 0, m = 1] = ym.split("-").map(Number);
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return diasEntre(`${ym}-01`, `${ym}-${String(fin).padStart(2, "0")}`);
}

/** Días con ausencia aprobada (vacaciones, permiso, baja...). */
export function diasAusencia(aus: Ausencia[]) {
  const s = new Map<string, string>();
  for (const a of aus) if (a.estado === "aprobada") for (const d of diasEntre(a.desde, a.hasta)) s.set(d, a.tipo);
  return s;
}

export const esLaborable = (dia: string, festivos: Set<string>) => dowDe(dia) >= 1 && dowDe(dia) <= 5 && !festivos.has(dia);

const isoDow = (dia: string) => dowDe(dia) === 0 ? 7 : dowDe(dia);

/** Horario que toca un día: el periodo más específico que lo cubra (con día de la semana gana; si no, el más reciente) o el general. */
export function horarioDe(dia: string, cfg: Config) {
  const p = (cfg.periodos ?? [])
    .filter((x) => x.desde <= dia && dia <= x.hasta && (x.dia_semana === null || x.dia_semana === isoDow(dia)))
    .sort((a, b) => Number(b.dia_semana !== null) - Number(a.dia_semana !== null) || b.desde.localeCompare(a.desde))[0];
  const horas = (p?.horas_dia ?? cfg.horas_semana / 5) * H;
  return { entrada: (p?.hora_entrada ?? cfg.hora_entrada).slice(0, 5), salida: (p?.hora_salida ?? cfg.hora_salida).slice(0, 5), horas, nombre: p?.nombre ?? null };
}

/** Horas que tocaba trabajar ese día según el horario (L-V, sin festivos ni ausencias). */
export function teoricoDia(dia: string, cfg: Config, festivos: Set<string>, ausencias: Map<string, string>) {
  return esLaborable(dia, festivos) && !ausencias.has(dia) ? horarioDe(dia, cfg).horas : 0;
}

export type Descanso = { tipo: "12h" | "semanal"; dia: string; horas?: number; dias?: number };

/**
 * Descansos legales: 12 h entre el final de una jornada y el inicio de la siguiente (art. 34.3 ET) y, como
 * aproximación al descanso semanal de día y medio (art. 37.1 ET), siete o más días seguidos con fichajes.
 */
export function descansos(filas: FilaDia[]): Descanso[] {
  const dias = [...porDia(filas).entries()].map(([dia, ev]) => ({ dia, ev: [...ev].sort((a, b) => a.at - b.at) })).sort((a, b) => a.dia.localeCompare(b.dia));
  const out: Descanso[] = [];
  let racha = 0;
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i]!, prev = dias[i - 1];
    if (prev) {
      const fin = prev.ev[prev.ev.length - 1]!, ini = d.ev[0]!;
      if (fin.tipo === "salida" && ini.tipo === "entrada" && ini.at - fin.at < 12 * H) out.push({ tipo: "12h", dia: d.dia, horas: (ini.at - fin.at) / H });
    }
    racha = prev && sumarDias(prev.dia, 1) === d.dia ? racha + 1 : 1;
    // Un incumplimiento por racha (el séptimo día), no uno por cada día que siga sin descansar.
    if (racha === 7) out.push({ tipo: "semanal", dia: d.dia, dias: racha });
  }
  return out;
}

/** Ausencia que se va a aprobar: días laborables en los que, con ella, faltarían más personas de las permitidas. */
export function excesoAusentes(sol: { user_id: string; desde: string; hasta: string }, aprobadas: (Ausencia & { user_id: string })[], max: number, festivos: Set<string>) {
  const out: { dia: string; ausentes: string[] }[] = [];
  for (const dia of laborablesEntre(sol.desde, sol.hasta, festivos)) {
    const otros = aprobadas.filter((a) => a.estado === "aprobada" && a.user_id !== sol.user_id && a.desde <= dia && dia <= a.hasta).map((a) => a.user_id);
    const ausentes = [...new Set([...otros, sol.user_id])];
    if (ausentes.length > max) out.push({ dia, ausentes });
  }
  return out;
}

/** Agrupa fichajes por jornada (día de la entrada). */
function porDia(filas: FilaDia[]) {
  const m = new Map<string, Evento[]>();
  for (const f of filas) m.set(f.dia, [...(m.get(f.dia) ?? []), { tipo: f.tipo, at: new Date(f.at).getTime() }]);
  return m;
}

/** Minutos de trabajo efectivo en franja de recargo del 150 %: domingo, festivo, sábado desde las 14 h o noche (22-6 h). */
function minutosEspeciales(ev: Evento[], festivos: Set<string>) {
  const evs = [...ev].sort((a, b) => a.at - b.at);
  let total = 0;
  let desde: number | null = null;
  for (const e of evs) {
    if (desde !== null && e.tipo !== "entrada") {
      // Por tramos alineados al cuarto de hora: las franjas de recargo empiezan en hora en punto.
      const PASO = 15 * MIN;
      for (let t = desde; t < e.at;) {
        const fin = Math.min(e.at, (Math.floor(t / PASO) + 1) * PASO);
        const l = madrid(t);
        if (l.dow === 0 || festivos.has(l.dia) || (l.dow === 6 && l.min >= 14 * 60) || l.min >= 22 * 60 || l.min < 6 * 60) total += fin - t;
        t = fin;
      }
    }
    desde = e.tipo === "entrada" || e.tipo === "reanudar" ? e.at : null;
  }
  return total;
}

export type ResumenMes = {
  trabajado: number; // ms trabajados (cerrados) en jornadas del mes
  teorico: number;
  extra75: number;
  extra150: number;
  presencia: number;
  sinCerrar: number;
  descansos: number; // incumplimientos de descanso (12 h o semanal) en jornadas del mes
  vacaciones: number; // días naturales de vacaciones en el mes (cierre de empresa incluido)
  vacacionesLaborables: number; // los mismos, solo laborables (como cuenta el saldo)
  permisos: number;
  bajas: number;
  otras: number;
};

/**
 * Resumen mensual para nómina. Las horas extra se calculan por semana (lunes a domingo) frente
 * al horario teórico, y cada semana se asigna al mes en que termina (su domingo).
 */
export function resumenMes(ym: string, filas: FilaDia[], cfg: Config, festivos: Set<string>, ausencias: Ausencia[]): ResumenMes {
  const dias = porDia(filas);
  const aus = diasAusencia(ausencias);
  const r: ResumenMes = { trabajado: 0, teorico: 0, extra75: 0, extra150: 0, presencia: 0, sinCerrar: 0, descansos: descansos(filas).filter((d) => d.dia.startsWith(ym)).length, vacaciones: 0, vacacionesLaborables: 0, permisos: 0, bajas: 0, otras: 0 };
  for (const d of diasDelMes(ym)) {
    const ev = dias.get(d);
    if (ev) {
      const c = compute(ev);
      if (c.unclosed) r.sinCerrar++;
      r.trabajado += c.worked;
      r.presencia += c.presencia;
    }
    r.teorico += teoricoDia(d, cfg, festivos, aus);
    const t = aus.get(d);
    if (t === "vacaciones") { r.vacaciones++; if (esLaborable(d, festivos)) r.vacacionesLaborables++; }
    else if (t === "permiso") r.permisos++;
    else if (t === "baja") r.bajas++;
    else if (t) r.otras++;
  }
  const domingos = diasDelMes(ym).filter((d) => dowDe(d) === 0);
  for (const dom of domingos) {
    const semana = diasEntre(sumarDias(dom, -6), dom);
    let trab = 0, teor = 0, esp = 0;
    for (const d of semana) {
      const ev = dias.get(d);
      if (ev) {
        const c = compute(ev);
        trab += c.worked;
        if (!c.unclosed) esp += minutosEspeciales(ev, festivos);
      }
      teor += teoricoDia(d, cfg, festivos, aus);
    }
    const extra = Math.max(0, trab - teor);
    const e150 = Math.min(extra, esp);
    r.extra150 += e150;
    r.extra75 += extra - e150;
  }
  return r;
}

/** Horas trabajadas en el año frente al máximo anual del convenio. */
export function computoAnual(year: number, filas: FilaDia[]) {
  let total = 0;
  for (const [d, ev] of porDia(filas)) if (d.startsWith(String(year))) total += compute(ev).worked;
  return total;
}

/** Cierre de la empresa (vacaciones colectivas): esos días son vacaciones para todos. */
export type Cierre = { desde: string; hasta: string; nombre: string; puente?: boolean };
export const cierresComoAusencias = (cierres: Cierre[]): Ausencia[] =>
  cierres.map((c) => ({ tipo: "vacaciones", desde: c.desde, hasta: c.hasta, estado: "aprobada" }));

export const laborablesEntre = (desde: string, hasta: string, festivos: Set<string>) =>
  hasta >= desde ? diasEntre(desde, hasta).filter((d) => esLaborable(d, festivos)) : [];

const diasCierre = (cierres: Cierre[], festivos: Set<string>) => new Set(cierres.flatMap((c) => laborablesEntre(c.desde, c.hasta, festivos)));

/** Días laborables que consume una solicitud de vacaciones (los de cierre de empresa ya son vacaciones). */
export function diasVacacionesSolicitud(desde: string, hasta: string, festivos: Set<string>, cierres: Cierre[]) {
  const cierre = diasCierre(cierres, festivos);
  return laborablesEntre(desde, hasta, festivos).filter((d) => !cierre.has(d)).length;
}

/** Festivos del año que caen en sábado: posibles días de compensación. */
export const sabadosFestivos = (year: number, festivos: Set<string>) =>
  [...festivos].filter((d) => d.startsWith(String(year)) && dowDe(d) === 6).sort();

/**
 * Días de puente (cierres marcados como puente) que se cubren con los festivos caídos en sábado, si la
 * compensación está activada: tantos como sábados festivos tenga el año, empezando por el primer puente.
 */
export function puentesCompensados(year: number, cierres: Cierre[], festivos: Set<string>, compensar: boolean) {
  if (!compensar) return new Set<string>();
  const y = String(year);
  const puentes = [...diasCierre(cierres.filter((c) => c.puente), festivos)].filter((d) => d.startsWith(y)).sort();
  return new Set(puentes.slice(0, sabadosFestivos(year, festivos).length));
}

/** Días de vacaciones de otros años (pendientes del año anterior o descuentos) que se suman al cupo de un año. */
export type AjusteVacaciones = { user_id: string; anio: number; dias: number };
/** Cupo de vacaciones de un trabajador en un año: el general más sus días de otros años. */
export const cupoVacaciones = (general: number, ajustes: AjusteVacaciones[], userId: string, year: number) =>
  general + ajustes.filter((a) => a.user_id === userId && a.anio === year).reduce((n, a) => n + a.dias, 0);

export type SaldoVacaciones = { total: number; empresa: number; compensados: number; aprobadas: number; pendientes: number; disponibles: number };

/**
 * Saldo de vacaciones del año en días laborables (L-V sin festivos), como lo cuenta la empresa. Los cierres de
 * empresa se descuentan, salvo los puentes compensados con festivos en sábado (si `compensar` está activado).
 */
export function saldoVacaciones(year: number, total: number, aus: Ausencia[], cierres: Cierre[], festivos: Set<string>, compensar = false): SaldoVacaciones {
  const y = String(year);
  const compensados = puentesCompensados(year, cierres, festivos, compensar);
  const todosCierre = [...diasCierre(cierres, festivos)].filter((d) => d.startsWith(y));
  const cierre = new Set(todosCierre);
  const empresa = todosCierre.filter((d) => !compensados.has(d));
  let aprobadas = 0, pendientes = 0;
  for (const a of aus) {
    if (a.tipo !== "vacaciones" || (a.estado !== "aprobada" && a.estado !== "pendiente")) continue;
    const n = laborablesEntre(a.desde, a.hasta, festivos).filter((d) => d.startsWith(y) && !cierre.has(d)).length;
    if (a.estado === "aprobada") aprobadas += n; else pendientes += n;
  }
  return { total, empresa: empresa.length, compensados: compensados.size, aprobadas, pendientes, disponibles: total - empresa.length - aprobadas - pendientes };
}

/** Avisos de hoy para un trabajador: olvido de fichar y exceso de jornada. */
export function avisos(now: number, filas: FilaDia[], cfg: Config, festivos: Set<string>, ausencias: Ausencia[]) {
  const out: string[] = [];
  const hoy = madrid(now);
  const aus = diasAusencia(ausencias);
  const dias = porDia(filas);
  const toMin = (h: string) => { const [a = 0, b = 0] = h.split(":").map(Number); return a * 60 + b; };
  const horario = horarioDe(hoy.dia, cfg);
  const abierta = [...dias.values()].find((ev) => enCurso(ev, now));
  const hoyEv = dias.get(hoy.dia) ?? [];
  if (esLaborable(hoy.dia, festivos) && !aus.has(hoy.dia) && !hoyEv.length && !abierta && hoy.min > toMin(horario.entrada) + 30)
    out.push(`No ha fichado la entrada (horario: ${horario.entrada}).`);
  if (abierta && hoy.min > toMin(horario.salida) + 60 && abierta.some((e) => madrid(e.at).dia === hoy.dia))
    out.push(`Sigue con la jornada abierta pasada la hora de salida (${horario.salida}). ¿Olvidó fichar la salida?`);
  for (const d of descansos(filas)) if (d.dia === hoy.dia) {
    if (d.tipo === "12h") out.push(`No ha descansado 12 h desde la jornada anterior (${(d.horas ?? 0).toFixed(1).replace(".", ",")} h).`);
    else out.push(`Lleva ${d.dias} días seguidos trabajando: falta el descanso semanal.`);
  }
  const hoyTrab = abierta ? compute(abierta, now, true).worked : compute(hoyEv).worked;
  if (hoyTrab > 9 * H) out.push("Lleva más de 9 h de trabajo hoy.");
  let semana = 0;
  for (const d of diasEntre(lunesDe(hoy.dia), hoy.dia)) {
    const ev = dias.get(d);
    if (ev) semana += enCurso(ev, now) ? compute(ev, now, true).worked : compute(ev).worked;
  }
  if (semana > cfg.horas_semana * H) out.push(`Lleva más de ${cfg.horas_semana} h esta semana.`);
  return out;
}

export const horas = (ms: number) => (ms / H).toFixed(2).replace(".", ",");

export type DesgloseVacaciones = SaldoVacaciones & { disfrutados: number; programados: number };

/**
 * Saldo del año separando las vacaciones aprobadas ya disfrutadas (hasta `hoy`, incluido) de las programadas.
 * Cuenta igual que `saldoVacaciones`: días laborables fuera de los cierres de empresa.
 */
export function desgloseVacaciones(year: number, total: number, aus: Ausencia[], cierres: Cierre[], festivos: Set<string>, compensar: boolean, hoy: string): DesgloseVacaciones {
  const s = saldoVacaciones(year, total, aus, cierres, festivos, compensar);
  const cierre = diasCierre(cierres, festivos);
  let disfrutados = 0;
  for (const a of aus) if (a.tipo === "vacaciones" && a.estado === "aprobada")
    disfrutados += laborablesEntre(a.desde, a.hasta, festivos).filter((d) => d.startsWith(String(year)) && !cierre.has(d) && d <= hoy).length;
  return { ...s, disfrutados, programados: s.aprobadas - disfrutados };
}
