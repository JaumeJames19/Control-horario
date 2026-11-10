import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { compute, localInput } from "@/lib/fichaje";
import { groupByDay, loadSolicitudes, pendiente, toEv, type CierreRow, type Fila } from "./data";
import { locale, t, tf, useIdioma } from "@/lib/i18n";

const nombreMes = (ym: string) => new Date(ym + "-15T12:00").toLocaleDateString(locale(), { month: "long", year: "numeric" });

/**
 * Conformidad mensual del trabajador: cierra el mes tal cual o deja constancia de su discrepancia.
 * Antes de cerrar avisa si hay jornadas sin cerrar en el mes o correcciones pendientes de decidir.
 */
export function CierreMes({ uid, mes, mesActual, cierres, filas, revision, onSaved }: { uid: string; mes: string; mesActual: string; cierres: CierreRow[]; filas: Fila[]; revision: number; onSaved: () => void }) {
  const [discrepo, setDiscrepo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  useIdioma();
  const cierre = cierres.find((c) => c.user_id === uid && c.mes === mes);
  const abierto = mes < mesActual && !cierre;
  const sinCerrar = groupByDay(filas).filter(([, fs]) => compute(fs.map(toEv)).unclosed).length;

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      setPendientes((await loadSolicitudes(uid).catch(() => [])).filter(pendiente).length);
    })();
  }, [uid, abierto, revision]);

  if (mes >= mesActual) return null;
  if (cierre) {
    return (
      <p className={`rounded-xl p-3 text-sm ${cierre.conforme ? "bg-go-soft text-go" : "bg-pause-soft text-pause"}`}>
        {cierre.conforme ? t("Diste tu conformidad") : t("Anotaste una discrepancia")} {t("a las horas de")} {nombreMes(mes)} {t("el")} {localInput(cierre.cerrado_at).replace("T", ` ${t("a las")} `)}.
        {cierre.comentario ? ` «${cierre.comentario}»` : ""} {t("El mes está cerrado: para cambiar algo, habla con el encargado.")}
      </p>
    );
  }

  async function cerrar(conforme: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("cerrar_mes", { _mes: mes, _conforme: conforme, _comentario: comentario });
    setBusy(false);
    if (error) { toast.error(conforme ? t("No se pudo cerrar el mes.") : t("Explica en qué no estás de acuerdo.")); return; }
    toast.success(t("Mes cerrado"));
    onSaved();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-stop-soft/60 p-4 ring-1 ring-brand/25">
      <b>{t("Revisa tus horas de")} {nombreMes(mes)}</b>
      <span className="text-sm">{t("Si todo está bien, da tu conformidad. Si algo no cuadra, explícalo: quedará anotado junto al registro.")}</span>
      {sinCerrar > 0 && <p className="rounded-xl bg-pause-soft p-2 text-sm text-pause">{tf(sinCerrar === 1 ? "Tienes {n} jornada sin cerrar este mes: cuenta 0 h. Pide la corrección antes de cerrar si quieres que se compute." : "Tienes {n} jornadas sin cerrar este mes: cuentan 0 h. Pide las correcciones antes de cerrar si quieres que se computen.", { n: sinCerrar })}</p>}
      {pendientes > 0 && <p className="rounded-xl bg-pause-soft p-2 text-sm text-pause">{tf(pendientes === 1 ? "Tienes {n} solicitud de corrección pendiente de decidir. Si la apruebas el encargado después, las horas de este mes cambiarán." : "Tienes {n} solicitudes de corrección pendientes de decidir. Si las aprueba el encargado después, las horas de este mes cambiarán.", { n: pendientes })}</p>}
      {discrepo && <label className="flex flex-col gap-1 text-sm font-medium">{t("¿Qué no es correcto?")}<textarea className="campo p-2" value={comentario} onChange={(e) => setComentario(e.target.value)} /></label>}
      <div className="flex flex-wrap gap-2">
        {!discrepo && <Button disabled={busy} onClick={() => cerrar(true)}>{t("Estoy conforme")}</Button>}
        {!discrepo && <Button variant="outline" disabled={busy} onClick={() => setDiscrepo(true)}>{t("No estoy conforme")}</Button>}
        {discrepo && <Button disabled={busy || comentario.trim().length < 3} onClick={() => cerrar(false)}>{t("Guardar discrepancia y cerrar")}</Button>}
        {discrepo && <Button variant="outline" onClick={() => setDiscrepo(false)}>{t("Volver")}</Button>}
      </div>
    </div>
  );
}
