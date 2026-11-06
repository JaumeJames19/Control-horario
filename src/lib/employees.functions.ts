import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normUser, usernameToEmail } from "./fichaje";

export const crearTrabajador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ nombre: z.string().trim().min(1).max(100), username: z.string().min(3).max(40), pin: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: manager } = await context.supabase.rpc("is_manager");
    if (!manager) throw new Error("Solo el encargado puede crear trabajadores.");
    const username = normUser(data.username);
    if (username !== data.username || username.length < 3) throw new Error("Usuario inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Auth insert and its profile/role trigger commit together in PostgreSQL.
    const { claveDePin } = await import("./clave.server");
    const temporal = crypto.randomUUID() + crypto.randomUUID();
    const email = usernameToEmail(username);
    // El disparador de la base de datos solo deja crear cuentas autorizadas aquí (la tabla solo la ve la clave de servicio).
    const { error: eAut } = await supabaseAdmin.from("altas_autorizadas").upsert({ email, creada_at: new Date().toISOString() });
    if (eAut) throw new Error("No se pudo autorizar el alta.");
    const { data: alta, error } = await supabaseAdmin.auth.admin.createUser({ email, password: temporal, email_confirm: true, app_metadata: { alta_encargado: "true" }, user_metadata: { nombre: data.nombre } });
    if (error || !alta.user) {
      await supabaseAdmin.from("altas_autorizadas").delete().eq("email", email);
      // El motivo de Supabase (usuario ya registrado, correo rechazado, fallo del disparador…) va entre paréntesis para poder diagnosticarlo.
      throw new Error(`No se pudo crear: comprueba que el usuario no exista. (${error?.message ?? "sin detalle"})`);
    }
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(alta.user.id, { password: await claveDePin(alta.user.id, data.pin) });
    if (e2) throw new Error(`Trabajador creado, pero no se pudo poner el PIN: ponlo con «Cambiar PIN». (${e2.message})`);
    return { ok: true };
  });