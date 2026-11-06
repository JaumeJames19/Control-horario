import { useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { TIPOS, localInput, madridTime, type Tipo } from "@/lib/fichaje";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Fila } from "./data";
import { mensajeCorreccion } from "@/lib/correction";

type Row = { original_id: string | null; tipo: Tipo; time: string; anular: boolean };
export function Editor({ uid, filas, nombre, conductor = false, onClose, onSaved }: { uid: string; me: string; dia: string | null; filas: Fila[]; nombre?: string; conductor?: boolean; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(filas.filter((f) => f.original_id).map((f) => ({ original_id: f.original_id, tipo: f.tipo, time: localInput(f.at), anular: false })));
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useIdioma();
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  async function save() {
    setBusy(true); setErr("");
    try {
      const propuesta = rows.map((r) => ({ original_id: r.original_id, tipo: r.tipo, at: r.anular ? null : madridTime(r.time), anular: r.anular }));
      const { error } = await supabase.rpc("request_correction", { _uid: uid, _motivo: motivo, _propuesta: propuesta });
      if (error) throw error; onSaved();
    } catch (e) { setErr(t(mensajeCorreccion(e, "No se pudo solicitar. Revisa las fechas, el motivo y los fichajes."))); }
    finally { setBusy(false); }
  }
  const input = "campo min-w-0 px-2 py-2";
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto">
    <DialogTitle>{t("Solicitar corrección")}</DialogTitle><DialogDescription>{nombre} · {t("Los originales se conservan. Solo se aplicará después de la aprobación del encargado.")}</DialogDescription>
    {rows.map((r, i) => <div key={i} className="flex flex-col gap-2 border-b pb-3">
      {r.original_id && <p className="text-xs text-muted-foreground">{t("Original:")} {r.original_id}</p>}
      <select aria-label={t("Tipo de fichaje")} className={input} disabled={r.anular} value={r.tipo} onChange={(e) => set(i, { tipo: e.target.value as Tipo })}>{Object.entries(TIPOS).filter(([k]) => k !== "espera" || conductor).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
      <label className="text-sm">{t("Fecha y hora propuesta (España)")}<input type="datetime-local" className={`${input} w-full`} disabled={r.anular} value={r.time} onChange={(e) => set(i, { time: e.target.value })} /></label>
      {r.original_id ? <label className="text-sm"><input type="checkbox" checked={r.anular} onChange={(e) => set(i, { anular: e.target.checked })} /> {t("Solicitar anulación")}</label> : <Button variant="outline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t("Quitar propuesta")}</Button>}
    </div>)}
    <Button variant="outline" onClick={() => setRows([...rows, { original_id: null, tipo: rows.length ? "salida" : "entrada", time: "", anular: false }])}>{t("Añadir fichaje omitido")}</Button>
    <label className="text-sm">{t("Motivo obligatorio")}<textarea className={`${input} w-full`} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    <Button disabled={busy || !motivo.trim() || !rows.length} onClick={save}>{t("Enviar solicitud")}</Button>
  </DialogContent></Dialog>;
}