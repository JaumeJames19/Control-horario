import { useEffect, useRef, useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Marca } from "./Marca";

/** El encargado entra con PIN + código de 6 cifras de una app de autenticación (Google Authenticator, etc.). */
export function SegundoFactor({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const iniciado = useRef(false);
  useIdioma();
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { setErr(t("No se pudo comprobar el segundo factor.")); return; }
      const verificado = data.totp[0];
      if (verificado) { setFactorId(verificado.id); return; }
      for (const f of data.all.filter((x) => x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: alta, error: e2 } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Empresa Demo" });
      if (e2 || !alta) { setErr(t("No se pudo preparar el código de seguridad.")); return; }
      setFactorId(alta.id);
      setQr(alta.totp.qr_code);
      setSecreto(alta.totp.secret);
    })();
  }, []);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return setErr(t("Escribe los 6 números que muestra la app."));
    setBusy(true); setErr("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setErr(t("Código incorrecto o caducado. Prueba con el siguiente."));
    onDone();
  }

  return (
    <div className="min-h-screen">
      <Marca />
      <main className="mx-auto flex max-w-sm flex-col gap-5 px-5 py-10">
        <h1 className="font-display text-3xl font-bold">{t("Código de seguridad")}</h1>
        {qr ? (
          <>
            <p className="text-sm">{t("Como encargado, además del PIN necesitas un código que cambia cada 30 segundos. Escanea este QR con Google Authenticator, Microsoft Authenticator o la app de contraseñas del iPhone:")}</p>
            <img src={qr} alt="Código QR para la app de autenticación" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
            {secreto && <p className="break-all text-xs text-muted-foreground">{t("Si no puedes escanearlo, introduce esta clave:")} {secreto}</p>}
            <p role="alert" className="rounded-xl bg-pause-soft p-3 text-sm text-pause">{t("Hazlo ahora: hasta que actives el código, cualquiera que sepa tu PIN podría registrar su propia app de autenticación.")}</p>
          </>
        ) : (
          <p className="text-sm">{t("Escribe el código de 6 números que muestra tu app de autenticación.")}</p>
        )}
        <form onSubmit={verificar} className="flex flex-col gap-3">
          <input className="campo px-4 py-3 text-center text-2xl tracking-[0.4em] num" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Código de 6 números" />
          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
          <Button disabled={busy || !factorId} className="h-auto rounded-xl py-3 text-lg font-semibold">{busy ? t("Comprobando…") : t("Entrar")}</Button>
          <Button type="button" variant="outline" onClick={() => supabase.auth.signOut()}>{t("Salir")}</Button>
        </form>
      </main>
    </div>
  );
}
