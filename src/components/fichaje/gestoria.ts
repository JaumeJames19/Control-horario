import { TIPOS, hm } from "@/lib/fichaje";
import { supabase } from "@/integrations/supabase/client";
import { computoAnual, resumenMes, type Cierre, type Config } from "@/lib/jornada";
import { descargarXlsx } from "@/lib/xlsx";
import { ausDe, type AusenciaRow, type CierreRow, type Fila, type Perfil } from "./data";

const h = (ms: number) => Math.round((ms / 3600000) * 100) / 100;

/** Excel mensual para la gestoría: una fila de incidencias por trabajador y el detalle de fichajes. */
export function exportarGestoria(mes: string, filas: Fila[], perfiles: Perfil[], cfg: Config, festivos: Set<string>, ausencias: AusenciaRow[], cierres: CierreRow[], cierresEmpresa: Cierre[] = []) {
  const year = Number(mes.slice(0, 4));
  const incid: (string | number | null)[][] = [[
    "Trabajador", "Usuario", "Horas trabajadas", "Horas teóricas", "Extra 75 %", "Extra 150 %", "Espera conductor",
    "Vacaciones (días laborables, cierre de empresa incluido)", "Vacaciones (días naturales)", "Permisos (días)", "Baja (días)", "Otras ausencias (días)", "Jornadas sin cerrar", "Descansos incumplidos (12 h / semanal)", `Horas año ${year} (máx. ${cfg.horas_anuales})`, "Conformidad del trabajador",
  ]];
  for (const p of perfiles) {
    const suyas = filas.filter((f) => f.user_id === p.id);
    const r = resumenMes(mes, suyas, cfg, festivos, ausDe(ausencias, p.id, cierresEmpresa));
    const c = cierres.find((x) => x.user_id === p.id && x.mes === mes);
    incid.push([
      p.nombre, p.username, h(r.trabajado), h(r.teorico), h(r.extra75), h(r.extra150), h(r.presencia),
      r.vacacionesLaborables, r.vacaciones, r.permisos, r.bajas, r.otras, r.sinCerrar, r.descansos, h(computoAnual(year, suyas)),
      c ? (c.conforme ? "Conforme" : `Discrepa: ${c.comentario ?? ""}`) : "Pendiente",
    ]);
  }
  const detalle: (string | number | null)[][] = [["Trabajador", "Día", "Tipo", "Hora", "Modalidad", "Corregido", "Hora original"]];
  for (const f of filas.filter((x) => x.dia.startsWith(mes)).sort((a, b) => a.at.localeCompare(b.at))) {
    detalle.push([perfiles.find((p) => p.id === f.user_id)?.nombre ?? "", f.dia, TIPOS[f.tipo], hm(f.at), f.modalidad === "distancia" ? "A distancia" : "Presencial", f.editado ? "Sí" : "", f.original_at ? hm(f.original_at) : ""]);
  }
  descargarXlsx(`gestoria-${mes}.xlsx`, [{ nombre: "Incidencias", filas: incid }, { nombre: "Fichajes", filas: detalle }]);
}

const ESTADO_AUS: Record<string, string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", anulada: "Anulada" };

/**
 * Histórico completo para la Inspección de Trabajo o para conservar 4 años: todos los fichajes efectivos con su
 * original, las correcciones solicitadas y decididas, las ausencias y la conformidad mensual de cada trabajador.
 */
export async function exportarHistorico(filas: Fila[], perfiles: Perfil[], ausencias: AusenciaRow[], cierres: CierreRow[]) {
  const nombre = (id: string) => perfiles.find((p) => p.id === id)?.nombre ?? id;
  const [s, d] = await Promise.all([
    supabase.from("solicitudes_correccion").select("*").order("solicitada_at"),
    supabase.from("decisiones_correccion").select("*"),
  ]);
  const fichajes: (string | number | null)[][] = [["Trabajador", "Usuario", "Día de la jornada", "Tipo", "Fecha y hora", "Modalidad", "Corregido", "Fecha y hora original", "Id"]];
  for (const f of [...filas].sort((a, b) => a.user_id.localeCompare(b.user_id) || a.at.localeCompare(b.at))) {
    const p = perfiles.find((x) => x.id === f.user_id);
    fichajes.push([p?.nombre ?? "", p?.username ?? "", f.dia, TIPOS[f.tipo], new Date(f.at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }), f.modalidad === "distancia" ? "A distancia" : "Presencial", f.editado ? "Sí" : "", f.original_at ? new Date(f.original_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "", f.id]);
  }
  const correcciones: (string | number | null)[][] = [["Trabajador", "Solicitada por", "Solicitada el", "Motivo", "Propuesta", "Decisión", "Decidida por", "Decidida el", "Motivo de la decisión"]];
  for (const x of s.data ?? []) {
    const dec = (d.data ?? []).find((y) => y.solicitud_id === x.id);
    const prop = (x.propuesta as { original_id: string | null; tipo: string; at: string | null; anular: boolean }[]).map((q) => q.anular ? `anular ${q.original_id}` : `${q.tipo} ${q.at ? new Date(q.at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : ""}${q.original_id ? ` (sustituye ${q.original_id})` : " (omitido)"}`).join("; ");
    correcciones.push([nombre(x.user_id), nombre(x.solicitada_por), new Date(x.solicitada_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }), x.motivo, prop, dec ? (dec.aprobada ? "Aprobada" : "Rechazada") : "Pendiente", dec ? nombre(dec.decidida_por) : "", dec ? new Date(dec.decidida_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "", dec?.motivo ?? ""]);
  }
  const aus: (string | number | null)[][] = [["Trabajador", "Tipo", "Desde", "Hasta", "Estado", "Solicitada el", "Decidida por", "Decidida el", "Motivo de la decisión"]];
  for (const a of [...ausencias].sort((x, y) => x.desde.localeCompare(y.desde))) aus.push([nombre(a.user_id), a.tipo, a.desde, a.hasta, ESTADO_AUS[a.estado] ?? a.estado, new Date(a.solicitada_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }), a.decidida_por ? nombre(a.decidida_por) : "", a.decidida_at ? new Date(a.decidida_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "", a.motivo_decision ?? ""]);
  const meses: (string | number | null)[][] = [["Trabajador", "Mes", "Conformidad", "Comentario", "Cerrado el"]];
  for (const c of [...cierres].sort((x, y) => x.mes.localeCompare(y.mes))) meses.push([nombre(c.user_id), c.mes, c.conforme ? "Conforme" : "Discrepa", c.comentario ?? "", new Date(c.cerrado_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })]);
  const gente: (string | number | null)[][] = [["Trabajador", "Usuario", "Activo", "Conductor", "Inspección"], ...perfiles.map((p) => [p.nombre, p.username, p.activo ? "Sí" : "No", p.conductor ? "Sí" : "", p.inspector ? "Sí" : ""])];
  const hoy = new Date().toISOString().slice(0, 10);
  descargarXlsx(`registro-jornada-completo-${hoy}.xlsx`, [{ nombre: "Fichajes", filas: fichajes }, { nombre: "Correcciones", filas: correcciones }, { nombre: "Ausencias", filas: aus }, { nombre: "Cierres de mes", filas: meses }, { nombre: "Trabajadores", filas: gente }]);
}
