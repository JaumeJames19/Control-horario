// Solo servidor (cron): recordatorios push de olvidos, descansos y solicitudes pendientes, sin repetirlos.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { avisos, cierresComoAusencias, madrid, type Ausencia, type Config, type FilaDia } from "./jornada";
import { encargados, notificar } from "./push.server";
import { todas } from "./paginar";

async function huella(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Envía solo lo que no se haya enviado ya hoy (clave = día + texto). */
async function enviarNuevos(userId: string, textos: string[], hoy: string, title: string) {
  if (!textos.length) return 0;
  const filas = await Promise.all(textos.map(async (t) => ({ user_id: userId, clave: `${hoy}:${await huella(t)}`, texto: t })));
  const { data } = await supabaseAdmin.from("avisos_enviados").upsert(filas.map(({ user_id, clave }) => ({ user_id, clave })), { onConflict: "user_id,clave", ignoreDuplicates: true }).select("clave");
  const nuevas = new Set((data ?? []).map((x) => x.clave));
  let n = 0;
  for (const f of filas) if (nuevas.has(f.clave)) n += await notificar([userId], { title, body: f.texto, tag: f.clave, url: "/" });
  return n;
}

export async function recordatorios(now = Date.now()) {
  const hoy = madrid(now).dia;
  const [c, f, e, h, a, p] = await Promise.all([
    supabaseAdmin.from("config_jornada").select("*").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("festivos").select("fecha"),
    supabaseAdmin.from("cierres_empresa").select("desde,hasta,nombre"),
    supabaseAdmin.from("horarios_periodo").select("*"),
    supabaseAdmin.from("ausencias").select("user_id,tipo,desde,hasta,estado").eq("estado", "aprobada"),
    supabaseAdmin.from("profiles").select("id,nombre").eq("activo", true).eq("inspector", false),
  ]);
  if (!c.data) return { enviados: 0 };
  const cfg: Config = { horas_semana: Number(c.data.horas_semana), horas_anuales: Number(c.data.horas_anuales), hora_entrada: c.data.hora_entrada.slice(0, 5), hora_salida: c.data.hora_salida.slice(0, 5), dias_vacaciones: c.data.dias_vacaciones, periodos: (h.data ?? []).map((x) => ({ ...x, horas_dia: x.horas_dia === null ? null : Number(x.horas_dia) })) };
  const festivos = new Set((f.data ?? []).map((x) => x.fecha));
  const cierres = cierresComoAusencias(e.data ?? []);
  let enviados = 0;
  // Con el fichaje desactivado no hay olvidos de fichar que recordar: solo se avisa de las solicitudes pendientes.
  for (const t of c.data.fichaje_activo ? p.data ?? [] : []) {
    // Para los avisos de hoy bastan las últimas semanas (descansos, semana en curso, jornada abierta).
    const { data: filas } = await supabaseAdmin.rpc("effective_punches", { _uid: t.id, _desde: madrid(now - 45 * 86400000).dia });
    const aus: Ausencia[] = [...(a.data ?? []).filter((x) => x.user_id === t.id), ...cierres];
    const textos = avisos(now, (filas ?? []) as FilaDia[], cfg, festivos, aus);
    enviados += await enviarNuevos(t.id, textos, hoy, "Recordatorio de fichaje");
  }
  // Cada solicitud trae su decisión (sin decisión = pendiente), por páginas: Supabase corta a 1.000 filas.
  const [s, pa] = await Promise.all([
    todas((x, y) => supabaseAdmin.from("solicitudes_correccion").select("id, decisiones_correccion(id)").order("id").range(x, y)),
    supabaseAdmin.from("ausencias").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);
  const pendientes = s.filter((x) => !x.decisiones_correccion).length + (pa.count ?? 0);
  if (pendientes > 0) {
    const texto = `Tienes ${pendientes} solicitud${pendientes === 1 ? "" : "es"} pendiente${pendientes === 1 ? "" : "s"} de revisar.`;
    for (const id of await encargados()) enviados += await enviarNuevos(id, [texto], hoy, "Solicitudes pendientes");
  }
  // Limpieza: lo enviado hace más de 30 días ya no hace falta para no repetir, y el registro de accesos
  // (con IP) se conserva 90 días, suficiente para investigar un bloqueo y lo mínimo por protección de datos.
  await Promise.all([
    supabaseAdmin.from("avisos_enviados").delete().lt("enviado_at", new Date(now - 30 * 86400000).toISOString()),
    supabaseAdmin.from("accesos").delete().lt("at", new Date(now - 90 * 86400000).toISOString()),
  ]);
  return { enviados };
}
