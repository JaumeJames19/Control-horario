import { diasAusencia, diasEntre, dowDe, esLaborable, horarioDe, sumarDias, type Ausencia, type Cierre, type Config, type Periodo } from "./jornada";

export type TipoFestivo = "nacional" | "autonomico" | "local";
export type FestivoCal = { fecha: string; nombre?: string; tipo?: string | null; provisional?: boolean | null };
export type Marca = TipoFestivo | "cierre" | "vacaciones" | "pendiente" | "ausencia";

export const TIPOS_FESTIVO: Record<TipoFestivo, string> = { nacional: "Festivo nacional", autonomico: "Festivo autonómico", local: "Festivo local" };
/** Clases de color de cada marca del calendario (las mismas en el calendario anual y en el cuadrante de la plantilla). */
export const ESTILO_MARCA: Record<Marca, string> = {
  nacional: "bg-brand text-on-signal",
  autonomico: "bg-autonomico text-on-signal",
  local: "bg-local text-on-signal",
  cierre: "bg-pause text-on-signal",
  vacaciones: "bg-go text-on-signal",
  pendiente: "ring-2 ring-inset ring-go text-go",
  ausencia: "bg-foreground/80 text-on-signal",
};
export const NOMBRE_MARCA: Record<Marca, string> = { ...TIPOS_FESTIVO, cierre: "Cierre de la empresa", vacaciones: "Vacaciones aprobadas", pendiente: "Pendientes de aprobar", ausencia: "Permiso o baja" };
export const PROVISIONAL = "outline-2 outline-dashed outline-offset-1 outline-local";

export const tipoFestivo = (tipo?: string | null): TipoFestivo => (tipo === "autonomico" || tipo === "local" ? tipo : "nacional");

/** Qué es cada día del año para un trabajador. Lo más fijo (festivo, cierre) gana a lo pedido. */
export function marcasDelAno(year: number, festivos: FestivoCal[], cierres: Cierre[], ausencias: Ausencia[]) {
  const m = new Map<string, Marca>();
  const poner = (desde: string, hasta: string, marca: Marca) => {
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (d.startsWith(String(year)) && !m.has(d)) m.set(d, marca);
  };
  for (const f of festivos) if (f.fecha.startsWith(String(year))) m.set(f.fecha, tipoFestivo(f.tipo));
  for (const c of cierres) poner(c.desde, c.hasta, "cierre");
  for (const a of ausencias) if (a.tipo === "vacaciones" && a.estado === "aprobada") poner(a.desde, a.hasta, "vacaciones");
  for (const a of ausencias) if (a.tipo === "vacaciones" && a.estado === "pendiente") poner(a.desde, a.hasta, "pendiente");
  for (const a of ausencias) if (a.tipo !== "vacaciones" && a.estado === "aprobada") poner(a.desde, a.hasta, "ausencia");
  return m;
}

/** Notas de un día festivo: local pendiente de confirmación oficial o festivo en sábado (posible compensación). */
export function notasFestivo(f: FestivoCal) {
  const out: string[] = [];
  if (f.provisional) out.push("pendiente de confirmación oficial");
  if (dowDe(f.fecha) === 6) out.push("cae en sábado: posible día de compensación");
  return out;
}

/** Año que se muestra al abrir las vacaciones: desde noviembre, el siguiente (ya está cerca y es el que se planifica). */
export const anoPorDefecto = (hoy: string) => Number(hoy.slice(0, 4)) + (Number(hoy.slice(5, 7)) >= 11 ? 1 : 0);

export const SABADO_APERTURA = "ring-1 ring-inset ring-foreground/50 font-semibold";

/**
 * Sábados en que abre la empresa: los que cubre un horario especial de sábado (dia_semana 6), salvo festivos y cierres.
 * Solo se marcan en el calendario: aún no suman horas teóricas ni se asignan por trabajador.
 */
export function sabadosApertura(year: number, periodos: Periodo[], festivos: Set<string>, cierres: Cierre[]) {
  const m = new Map<string, Periodo>();
  for (const p of periodos) if (p.dia_semana === 6)
    for (const d of diasEntre(p.desde > `${year}-01-01` ? p.desde : `${year}-01-01`, p.hasta < `${year}-12-31` ? p.hasta : `${year}-12-31`))
      if (dowDe(d) === 6 && !festivos.has(d) && !cierres.some((c) => c.desde <= d && d <= c.hasta)) m.set(d, p);
  return m;
}

export type HorasLaborables = { dias: number; horas: number; sabados: number; horasSabado: number };

/**
 * Horas de trabajo entre dos fechas del mismo año según el calendario y el horario de cada día (`horarioDe`: los
 * horarios especiales, como los viernes de verano, mandan sobre el general). De lunes a viernes cuentan los laborables
 * fuera de cierres y de las ausencias aprobadas que se pasen; aparte, los sábados de apertura (aún sin asignar por trabajador).
 */
export function horasLaborables(desde: string, hasta: string, cfg: Config, festivos: Set<string>, cierres: Cierre[], ausencias: Ausencia[] = []): HorasLaborables {
  const aus = diasAusencia(ausencias);
  const sabados = sabadosApertura(Number(desde.slice(0, 4)), cfg.periodos ?? [], festivos, cierres);
  const enCierre = (d: string) => cierres.some((c) => c.desde <= d && d <= c.hasta);
  const r: HorasLaborables = { dias: 0, horas: 0, sabados: 0, horasSabado: 0 };
  for (const d of diasEntre(desde, hasta)) {
    if (esLaborable(d, festivos) && !enCierre(d) && !aus.has(d)) { r.dias++; r.horas += horarioDe(d, cfg).horas / 3600000; }
    else if (sabados.has(d)) { r.sabados++; r.horasSabado += horarioDe(d, cfg).horas / 3600000; }
  }
  return r;
}
