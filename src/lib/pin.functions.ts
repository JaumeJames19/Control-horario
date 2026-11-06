import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pinDebil } from "./fichaje";

const pinSchema = z.string().regex(/^\d{6}$/);

/** El encargado pone un PIN temporal: el trabajador deberá cambiarlo al entrar. */
export const cambiarPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), pin: pinSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: manager } = await context.supabase.rpc("is_manager");
    if (!manager) throw new Error("Solo el encargado puede cambiar PINs.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { claveDePin } = await import("./clave.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: await claveDePin(data.userId, data.pin) });
    if (error) throw new Error("No se pudo cambiar el PIN.");
    if (data.userId !== context.userId) {
      const { error: flagError } = await supabaseAdmin.from("profiles").update({ debe_cambiar_pin: true }).eq("id", data.userId);
      if (flagError) throw new Error("PIN cambiado, pero no se pudo marcar como temporal.");
    }
    return { ok: true };
  });

/** Cada usuario cambia su propio PIN (obligatorio en el primer acceso y tras un reseteo). */
export const cambiarMiPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pin: pinSchema }).parse(d))
  .handler(async ({ data, context }) => {
    if (pinDebil(data.pin)) throw new Error("PIN demasiado fácil.");
    const { data: activo } = await context.supabase.rpc("is_active", { _uid: context.userId });
    if (!activo) throw new Error("Cuenta inactiva.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { claveDePin } = await import("./clave.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: await claveDePin(context.userId, data.pin) });
    if (error) throw new Error("No se pudo cambiar el PIN.");
    const { error: flagError } = await supabaseAdmin.from("profiles").update({ debe_cambiar_pin: false }).eq("id", context.userId);
    if (flagError) throw new Error("No se pudo guardar el cambio.");
    return { ok: true };
  });
