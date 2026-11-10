import { useEffect, useRef, useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { fichaKiosco } from "@/lib/acceso.functions";
import { TIPOS, hm, normUser, type Tipo } from "@/lib/fichaje";
import { Button } from "@/components/ui/button";
import { Marca } from "./Marca";
import { Idioma } from "./Idioma";

type Estado = Awaited<ReturnType<typeof fichaKiosco>>;

const ERRORES: Record<string, string> = {
  BLOQUEADO: "Demasiados intentos fallidos. Espera 15 minutos o avisa al encargado.",
  CREDENCIALES: "Usuario o PIN incorrectos.",
  KIOSCO_IP: "Esta tablet no está en la red de la empresa.",
  CAMBIA_PIN: "Tu PIN es temporal: entra antes en la app con tu móvil y cámbialo.",
  INACTIVO: "Tu cuenta está desactivada. Habla con el encargado.",
  OLVIDADA: "Tienes una jornada anterior sin cerrar. Pide la corrección desde la app.",
  NO_FICHADO: "No se pudo fichar. Inténtalo otra vez.",
  FICHAJE_OFF: "El fichaje aún no está activado. De momento la app solo se usa para las vacaciones.",
};
const BOTON: Record<Tipo, string> = { entrada: "bg-go", salida: "bg-stop", pausa: "bg-pause", espera: "bg-foreground", reanudar: "bg-go" };

/** Tablet compartida del almacén: cada trabajador se identifica, ficha y la pantalla se limpia sola. */
export function Kiosco() {
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const llamar = useServerFn(fichaKiosco);
  // El formulario desaparece al identificarse: el foco va al resultado (o al nombre) para que el lector de pantalla lo lea.
  const resultado = useRef<HTMLElement>(null);
  useEffect(() => { if (estado) resultado.current?.focus(); }, [estado]);
  useIdioma();

  const limpiar = () => { setUsuario(""); setPin(""); setEstado(null); };
  // La pantalla se limpia sola (tablet compartida), pero cada toque o tecla vuelve a dar el tiempo completo:
  // así quien va más despacio (lector de pantalla, poca soltura con la pantalla táctil) no se queda a medias.
  const [actividad, setActividad] = useState(0);
  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(limpiar, estado.hecho ? 4000 : 20000);
    return () => clearTimeout(t);
  }, [estado, actividad]);

  async function enviar(tipo?: Tipo) {
    setBusy(true); setMsg("");
    try {
      const r = await llamar({ data: { username: normUser(usuario), pin, ...(tipo ? { tipo } : {}) } });
      setEstado(r);
    } catch (e) {
      const k = Object.keys(ERRORES).find((x) => String(e).includes(x));
      setMsg(t(ERRORES[k ?? "NO_FICHADO"] ?? "Error"));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const field = "campo rounded-lg px-5 py-4 text-2xl";
  return (
    <div className="min-h-screen">
      <Marca grande ancho="max-w-md"><Idioma /></Marca>
      <main className="mx-auto flex max-w-md flex-col gap-5 px-5 py-10">
        {!estado ? (
          <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} className="flex flex-col gap-4 rounded-xl bg-card p-6 shadow-card">
            <h1 className="font-display text-4xl font-bold tracking-tight">{t("Fichar")}</h1>
            <label className="flex flex-col gap-1.5 text-lg font-medium">{t("Usuario")}
              {/* Al volver al formulario (tras fichar o cancelar) el foco queda listo para el siguiente trabajador. */}
              <input autoFocus className={field} autoCapitalize="none" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-lg font-medium">{t("PIN")}
              <input className={`${field} num tracking-[0.4em]`} inputMode="numeric" type="password" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </label>
            {msg && <p role="alert" className="rounded-lg bg-stop-soft px-4 py-3 text-lg font-medium text-destructive">{msg}</p>}
            <Button disabled={busy || !usuario || pin.length !== 6} className="h-auto rounded-lg py-4 text-2xl">{busy ? "…" : t("Continuar")}</Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4" onPointerDown={() => setActividad((n) => n + 1)} onKeyDown={() => setActividad((n) => n + 1)}>
            <h1 ref={estado.hecho ? undefined : (resultado as React.RefObject<HTMLHeadingElement>)} tabIndex={-1} className="font-display text-5xl font-bold tracking-tight outline-none">{estado.nombre}</h1>
            {estado.hecho ? (
              <p ref={resultado as React.RefObject<HTMLParagraphElement>} role="status" tabIndex={-1} className="outline-none rounded-xl bg-go-soft p-6 text-2xl font-semibold text-go ring-1 ring-go/30">{t(TIPOS[estado.hecho.tipo])} {t("registrada a las")} {hm(estado.hecho.at)}.</p>
            ) : estado.olvidada ? (
              <p className="rounded-xl bg-pause-soft p-6 text-lg text-pause ring-1 ring-pause/30">{t(ERRORES["OLVIDADA"] ?? "")}</p>
            ) : (
              estado.opciones.map((tp) => (
                <button key={tp} type="button" disabled={busy} onClick={() => enviar(tp)}
                  className={`slashes min-h-28 rounded-2xl ${BOTON[tp]} font-display text-5xl font-bold tracking-tight text-on-signal shadow-pop transition-transform hover:brightness-105 active:scale-[.98] disabled:opacity-60`}>
                  {tp === "reanudar" ? t("Volver al trabajo") : t(TIPOS[tp])}
                </button>
              ))
            )}
            <Button variant="outline" className="h-auto rounded-lg py-3.5 text-lg" onClick={limpiar}>{estado.hecho ? t("Listo") : t("Cancelar")}</Button>
          </div>
        )}
      </main>
    </div>
  );
}
