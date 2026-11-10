import { useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { enfocarAlMontar } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cambiarMiPin } from "@/lib/pin.functions";
import { pinDebil } from "@/lib/fichaje";
import { Button } from "@/components/ui/button";
import { Marca } from "./Marca";

/** Pantalla obligatoria cuando el PIN dado por el encargado es temporal; también sirve para cambiarlo por voluntad propia. */
export function CambiarPin({ nombre, voluntario = false, onDone, onCancel }: { nombre?: string | undefined; voluntario?: boolean; onDone: () => void; onCancel?: () => void }) {
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const guardar = useServerFn(cambiarMiPin);
  useIdioma();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^\d{6}$/.test(pin)) return setErr(t("El PIN debe tener 6 números."));
    if (pinDebil(pin)) return setErr(t("Ese PIN es demasiado fácil. Evita números repetidos o seguidos."));
    if (pin !== repetir) return setErr(t("Los dos PIN no coinciden."));
    setBusy(true);
    try {
      await guardar({ data: { pin } });
      onDone();
    } catch {
      setErr(t("No se pudo cambiar el PIN. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const field = "campo px-4 py-3 text-lg num tracking-[0.4em]";
  const solo = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="min-h-screen">
    <Marca />
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-5 py-10">
      <div>
        <h1 ref={enfocarAlMontar} tabIndex={-1} className="outline-none font-display text-3xl font-bold">{voluntario ? t("Cambiar mi PIN") : t("Elige tu PIN")}</h1>
        <p className="text-sm text-muted-foreground">{voluntario ? t("Elige un PIN nuevo de 6 números que solo sepas tú.") : <>{nombre ? `${nombre}, ${t("el")}` : t("El")} {t("PIN que te han dado es temporal. Pon uno nuevo que solo sepas tú.")}</>}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl bg-card p-6 shadow-card">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t("PIN nuevo")}
          <input className={field} inputMode="numeric" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(solo(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t("Repite el PIN")}
          <input className={field} inputMode="numeric" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(solo(e.target.value))} />
        </label>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
        <Button disabled={busy} className="mt-1 h-auto rounded-xl py-3 text-lg font-semibold">{busy ? "…" : t("Guardar PIN")}</Button>
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>{t("Volver")}</Button> : <Button type="button" variant="outline" onClick={() => supabase.auth.signOut()}>{t("Salir")}</Button>}
      </form>
    </main>
    </div>
  );
}
