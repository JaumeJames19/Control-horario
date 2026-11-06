import { supabase } from "@/integrations/supabase/client";
import type { Evento, Tipo } from "@/lib/fichaje";
import { cierresComoAusencias, type Config, type Ausencia, type Cierre, type Periodo } from "@/lib/jornada";
import type { Database } from "@/integrations/supabase/types";

export type Fila = { id: string; user_id: string; tipo: Tipo; at: string; dia: string; lugar: string; editado: boolean; original_at: string | null; original_id: string | null; modalidad?: string };
export type Perfil = { id: string; username: string; nombre: string; activo: boolean; debe_cambiar_pin: boolean; conductor: boolean; inspector: boolean };

export const LUGAR = "Centro principal";

export function monthRange(ym: string) {
  const [y = 0, m = 1] = ym.split("-").map(Number);
  const end = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(end).padStart(2, "0")}` };
}

/** Fichajes efectivos (de un trabajador o de todos) desde el día indicado; sin `desde`, todo el histórico. */
export async function loadAll(userId?: string, desde?: string) {
  const { data, error } = await supabase.rpc("list_punches", { ...(userId ? { _uid: userId } : {}), ...(desde ? { _desde: desde } : {}) });
  if (error) throw error;
  return (data ?? []) as unknown as Fila[];
}

export async function loadMonth(ym: string, userId?: string) {
  const { from, to } = monthRange(ym);
  return (await loadAll(userId, from)).filter((f) => f.dia <= to);
}

/** Primer día del mes anterior al indicado: lo que hace falta para la jornada abierta y las semanas que cruzan de mes. */
export function inicioMesAnterior(ym: string) {
  const [y = 0, m = 1] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

/** Desde cuándo cargar para mostrar un mes: el año entero (cómputo anual) o el mes anterior, lo que sea antes. */
export function desdeParaMes(ym: string) {
  const enero = `${ym.slice(0, 4)}-01-01`;
  const anterior = inicioMesAnterior(ym);
  return anterior < enero ? anterior : enero;
}

export const toEv = (f: Fila): Evento => ({ tipo: f.tipo, at: new Date(f.at).getTime() });

export function groupByDay(rows: Fila[]) {
  const m = new Map<string, Fila[]>();
  for (const r of rows) m.set(r.dia, [...(m.get(r.dia) ?? []), r]);
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}


export type Cfg = Config & { ip_kiosco: string[]; max_ausentes: number; periodos: Periodo[]; fichaje_activo: boolean };
export type PeriodoRow = Database["public"]["Tables"]["horarios_periodo"]["Row"];
export type AusenciaRow = Database["public"]["Tables"]["ausencias"]["Row"];
export type CierreRow = Database["public"]["Tables"]["cierres_mes"]["Row"];
export type CierreEmpresaRow = Database["public"]["Tables"]["cierres_empresa"]["Row"];
export type AjusteRow = Database["public"]["Tables"]["vacaciones_ajustes"]["Row"];
export type Festivo = { fecha: string; nombre: string; tipo: string; provisional: boolean };

export const CFG_DEFECTO: Cfg = { horas_semana: 40, horas_anuales: 1780, hora_entrada: "08:00", hora_salida: "17:00", dias_vacaciones: 22, compensar_sabados: false, ip_kiosco: [], max_ausentes: 2, periodos: [], fichaje_activo: false };

/** Configuración, festivos, cierres de empresa, ausencias y cierres de mes visibles para el usuario (el encargado los ve todos). */
export async function loadCalendario() {
  const [c, f, a, k, e, h, v] = await Promise.all([
    supabase.from("config_jornada").select("*").eq("id", 1).maybeSingle(),
    supabase.from("festivos").select("fecha,nombre,tipo,provisional").order("fecha"),
    supabase.from("ausencias").select("*").order("desde", { ascending: false }),
    supabase.from("cierres_mes").select("*"),
    supabase.from("cierres_empresa").select("*").order("desde"),
    supabase.from("horarios_periodo").select("*").order("desde"),
    supabase.from("vacaciones_ajustes").select("*").order("creado_at"),
  ]);
  const periodos = ((h.data ?? []) as PeriodoRow[]).map((x) => ({ ...x, horas_dia: x.horas_dia === null ? null : Number(x.horas_dia) }));
  const cfg: Cfg = c.data
    ? { horas_semana: Number(c.data.horas_semana), horas_anuales: Number(c.data.horas_anuales), hora_entrada: c.data.hora_entrada.slice(0, 5), hora_salida: c.data.hora_salida.slice(0, 5), dias_vacaciones: c.data.dias_vacaciones, compensar_sabados: c.data.compensar_sabados ?? false, ip_kiosco: c.data.ip_kiosco, max_ausentes: c.data.max_ausentes ?? 2, periodos, fichaje_activo: c.data.fichaje_activo ?? false }
    : { ...CFG_DEFECTO, periodos };
  return { cfg, festivos: (f.data ?? []) as Festivo[], ausencias: (a.data ?? []) as AusenciaRow[], cierres: (k.data ?? []) as CierreRow[], cierresEmpresa: (e.data ?? []) as CierreEmpresaRow[], periodos: (h.data ?? []) as PeriodoRow[], ajustes: (v.data ?? []) as AjusteRow[] };
}

/** Ausencias de un trabajador a efectos de cálculo: las suyas más los cierres de empresa, que son vacaciones para todos. */
export const ausDe = (aus: AusenciaRow[], userId: string, cierres: Cierre[] = []): Ausencia[] => [...aus.filter((a) => a.user_id === userId), ...cierresComoAusencias(cierres)];
