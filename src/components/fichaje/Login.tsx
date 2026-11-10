import { useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { normUser } from "@/lib/fichaje";
import { entrar } from "@/lib/acceso.functions";
import { Button } from "@/components/ui/button";
import { Marca } from "./Marca";
import { Idioma } from "./Idioma";

export function Login() {
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useServerFn(entrar);
  useIdioma();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const u = normUser(usuario);
    if (u.length < 3) return setErr(t("El usuario debe tener al menos 3 letras o números."));
    if (!/^\d{6}$/.test(pin)) return setErr(t("El PIN debe tener 6 números."));
    setBusy(true);
    try {
      const s = await login({ data: { username: u, pin } });
      const { error } = await supabase.auth.setSession(s);
      if (error) throw error;
    } catch (e) {
      setErr(String(e).includes("BLOQUEADO")
        ? t("Demasiados intentos fallidos. Espera 15 minutos o habla con el encargado.")
        : t("Usuario o PIN incorrectos."));
    } finally {
      setBusy(false);
    }
  }

  const field = "campo px-4 py-3 text-lg";
  return (
    <div className="flex min-h-screen flex-col">
      <Marca grande ancho="max-w-sm"><Idioma /></Marca>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-5 py-10">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{t("Ficha tu jornada")}</h1>
          <p className="mt-1 text-muted-foreground">{t("Entra con tu usuario y tu PIN.")}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl bg-card p-6 shadow-card">
          <label className="flex flex-col gap-1.5 text-sm font-medium">{t("Usuario")}
            <input className={field} autoCapitalize="none" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">{t("PIN de 6 números")}
            <input className={`${field} num tracking-[0.4em]`} inputMode="numeric" type="password" maxLength={6}
              autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </label>
          {err && <p role="alert" className="rounded-xl bg-stop-soft px-3 py-2 text-sm font-medium text-destructive">{err}</p>}
          <Button disabled={busy} className="mt-1 h-auto rounded-lg py-3.5 text-lg">{busy ? t("Entrando…") : t("Entrar")}</Button>
        </form>
        <p className="text-sm text-muted-foreground">{t("Para obtener acceso o recuperar tu PIN, habla con el encargado.")}</p>
        <p aria-hidden className="mt-auto pt-6 text-center font-lema text-xl tracking-[0.12em] text-logo-grey">{t("Cada hora cuenta")}</p>
      </main>
    </div>
  );
}
