// Solo servidor: envío de avisos push a los trabajadores suscritos.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clavesDeEntorno, enviarPush } from "./webpush.server";

export type Mensaje = { title: string; body: string; tag?: string; url?: string };

/** Envía el mensaje a todas las suscripciones de esos usuarios; borra las caducadas. Devuelve cuántas llegaron. */
export async function notificar(userIds: string[], mensaje: Mensaje) {
  const claves = clavesDeEntorno();
  const ids = [...new Set(userIds)];
  if (!claves || !ids.length) return 0;
  const { data: subs } = await supabaseAdmin.from("push_subs").select("endpoint,p256dh,auth,user_id").in("user_id", ids);
  let enviados = 0;
  const caducadas: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    const r = await enviarPush(s, mensaje, claves);
    if (r === "enviado") enviados++;
    if (r === "caducada") caducadas.push(s.endpoint);
  }));
  if (caducadas.length) await supabaseAdmin.from("push_subs").delete().in("endpoint", caducadas);
  return enviados;
}

/** Usuarios con rol de encargado. */
export async function encargados() {
  const { data } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  return (data ?? []).map((x) => x.user_id);
}
