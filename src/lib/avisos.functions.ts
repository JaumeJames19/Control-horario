import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Servicios push de los navegadores: el servidor solo hace peticiones a estos dominios (nunca a una URL arbitraria). */
const HOSTS_PUSH = /^(fcm\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)+push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com|([a-z0-9-]+\.)*push\.samsungosp\.com)$/i;
const endpointPush = z.string().max(2000).refine((u) => { try { const x = new URL(u); return x.protocol === "https:" && HOSTS_PUSH.test(x.hostname); } catch { return false; } }, "Servicio de notificaciones no admitido");
const suscripcion = z.object({ endpoint: endpointPush, p256dh: z.string().min(80).max(200), auth: z.string().min(16).max(64) });

/** Clave pública VAPID con la que el navegador se suscribe (nula si el servidor no tiene las claves). */
export const clavePublicaPush = createServerFn({ method: "GET" }).handler(async () => process.env["VAPID_PUBLIC_KEY"] ?? null);

/** Guarda la suscripción push del usuario que llama (una por navegador). */
export const guardarSuscripcion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => suscripcion.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subs").upsert({ ...data, user_id: context.userId }, { onConflict: "endpoint" });
    if (error) throw new Error("No se pudo guardar la suscripción.");
    return { ok: true };
  });

export const quitarSuscripcion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subs").delete().eq("endpoint", data.endpoint).eq("user_id", context.userId);
    return { ok: true };
  });

/** Un trabajador acaba de pedir algo: aviso a los encargados. */
export const avisarEncargados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tipo: z.enum(["correccion", "ausencia"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase.from("profiles").select("nombre,activo,inspector").eq("id", context.userId).maybeSingle();
    if (!yo?.activo || yo.inspector) throw new Error("Sin permiso");
    // Como mucho un aviso por trabajador y tipo cada 10 minutos: evita que alguien inunde al encargado.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clave = `solicitud:${data.tipo}:${Math.floor(Date.now() / 600000)}`;
    const { data: nuevo } = await supabaseAdmin.from("avisos_enviados").upsert({ user_id: context.userId, clave }, { onConflict: "user_id,clave", ignoreDuplicates: true }).select("clave");
    if (!nuevo?.length) return { enviados: 0 };
    const { notificar, encargados } = await import("./push.server");
    const body = `${yo.nombre} ha pedido ${data.tipo === "ausencia" ? "vacaciones o una ausencia" : "una corrección de fichaje"}.`;
    return { enviados: await notificar(await encargados(), { title: "Nueva solicitud", body, tag: "solicitud", url: "/" }) };
  });

/** El encargado ha decidido una solicitud: aviso al trabajador. */
export const avisarTrabajador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), texto: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: jefe } = await context.supabase.rpc("is_manager");
    if (!jefe) throw new Error("Solo el encargado");
    const { notificar } = await import("./push.server");
    return { enviados: await notificar([data.userId], { title: "Fichaje Empresa Demo", body: data.texto, tag: "decision", url: "/" }) };
  });
