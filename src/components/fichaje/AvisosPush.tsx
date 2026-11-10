import { useEffect, useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clavePublicaPush, guardarSuscripcion, quitarSuscripcion } from "@/lib/avisos.functions";
import { desuscribir, soportaPush, suscribir, suscripcionActual } from "@/lib/push";

type Estado = "cargando" | "no-soporta" | "sin-clave" | "activo" | "inactivo";

/** Tarjeta para activar los avisos push en este móvil (olvidos de fichar, solicitudes, decisiones). */
export function AvisosPush({ admin }: { admin: boolean }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [clave, setClave] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pedirClave = useServerFn(clavePublicaPush);
  const guardar = useServerFn(guardarSuscripcion);
  const quitar = useServerFn(quitarSuscripcion);
  useIdioma();

  useEffect(() => {
    if (!soportaPush()) { setEstado("no-soporta"); return; }
    (async () => {
      try {
        const k = await pedirClave();
        setClave(k);
        if (!k) { setEstado("sin-clave"); return; }
        setEstado((await suscripcionActual()) ? "activo" : "inactivo");
      } catch { setEstado("sin-clave"); }
    })();
  }, [pedirClave]);

  async function activar() {
    if (!clave) return;
    setBusy(true);
    try {
      const datos = await suscribir(clave);
      await guardar({ data: datos });
      setEstado("activo");
      toast.success(t("Avisos activados en este móvil"));
    } catch (e) {
      toast.error(String(e).includes("PERMISO") ? t("Has denegado las notificaciones. Actívalas en los ajustes del navegador.") : t("No se pudieron activar los avisos."));
    } finally { setBusy(false); }
  }
  async function desactivar() {
    setBusy(true);
    try {
      const endpoint = await desuscribir();
      if (endpoint) await quitar({ data: { endpoint } });
      setEstado("inactivo");
      toast.success(t("Avisos desactivados"));
    } catch { toast.error(t("No se pudieron desactivar.")); }
    finally { setBusy(false); }
  }

  if (estado === "cargando") return null;
  if (estado === "sin-clave") return admin ? <p className="text-xs text-muted-foreground">Avisos push: faltan las claves VAPID en el servidor (VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY).</p> : null;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-5 shadow-card">
      <h2 className="font-display text-2xl font-bold tracking-tight">{t("Avisos en el móvil")}</h2>
      {estado === "no-soporta" ? (
        <p className="text-sm text-muted-foreground">{ios ? t("En iPhone, añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí para poder activar los avisos.") : t("Este navegador no admite notificaciones.")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{admin ? t("Te avisaremos de las solicitudes pendientes y de los olvidos de fichar del equipo.") : t("Te avisaremos si olvidas fichar, si no has descansado lo que toca y cuando el encargado decida tus solicitudes.")}</p>
          {estado === "activo"
            ? <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-go">{t("Activados en este móvil")}</span><Button variant="outline" size="sm" disabled={busy} onClick={desactivar}>{t("Desactivar")}</Button></div>
            : <Button disabled={busy} onClick={activar}>{t("Activar avisos")}</Button>}
        </>
      )}
    </section>
  );
}
