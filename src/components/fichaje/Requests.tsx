import { useCallback, useEffect, useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { avisarTrabajador } from "@/lib/avisos.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TIPOS, localInput, type Tipo } from "@/lib/fichaje";
import type { Database } from "@/integrations/supabase/types";
import type { Perfil } from "./data";
import { decisionReason, mensajeCorreccion } from "@/lib/correction";
type Request = Database["public"]["Tables"]["solicitudes_correccion"]["Row"];
type Decision = Database["public"]["Tables"]["decisiones_correccion"]["Row"];
export function Requests({ admin, perfiles, revision, onSaved }: { admin: boolean; perfiles: Perfil[]; revision: number; onSaved: () => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(true);
  const avisarA = useServerFn(avisarTrabajador);
  useIdioma();
  const load = useCallback(async () => {
    const [s, d] = await Promise.all([supabase.from("solicitudes_correccion").select("*").order("solicitada_at", { ascending: false }), supabase.from("decisiones_correccion").select("*")]);
    if (s.error || d.error) { toast.error(t("No se pudieron cargar las solicitudes.")); return; }
    setRequests(s.data ?? []); setDecisions(d.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load, revision]);
  async function decide(id: string, approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("decide_correction", { _id: id, _aprobar: approve, _motivo: decisionReason(approve, reason[id] ?? "") });
    setBusy(false);
    if (error) { toast.error(t(mensajeCorreccion(error, "No se pudo decidir: comprueba la secuencia y el motivo. No se ha aplicado ningún cambio."))); return; }
    toast.success(approve ? t("Corrección aprobada") : t("Corrección rechazada"));
    const s = requests.find((x) => x.id === id);
    if (s) avisarA({ data: { userId: s.user_id, texto: approve ? "Tu corrección de fichaje ha sido aprobada." : `Tu corrección de fichaje ha sido rechazada. ${reason[id] ?? ""}`.slice(0, 200) } }).catch(() => undefined);
    await load(); onSaved();
  }
  return <section className="flex flex-col gap-3"><h2 className="font-display text-lg font-bold uppercase">{t("Solicitudes de corrección")}</h2>
    <div className="flex gap-2"><Button variant={pendingOnly ? "default" : "outline"} onClick={() => setPendingOnly(true)}>{t("Pendientes")}</Button><Button variant={!pendingOnly ? "default" : "outline"} onClick={() => setPendingOnly(false)}>{t("Todas")}</Button></div>
    {!requests.length && <p className="text-sm text-muted-foreground">{t("Sin solicitudes.")}</p>}
    {requests.filter((s) => !pendingOnly || !decisions.some((d) => d.solicitud_id === s.id)).map((s) => { const d = decisions.find((x) => x.solicitud_id === s.id); const proposal = s.propuesta as { original_id: string | null; tipo: Tipo; at: string | null; anular: boolean }[];
      return <article key={s.id} className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card">
        <b>{perfiles.find((p) => p.id === s.user_id)?.nombre ?? t("Mi jornada")} · {d ? d.aprobada ? t("Aprobada") : t("Rechazada") : t("Pendiente")}</b>
        <p className="text-sm">{s.motivo}</p><p className="text-xs text-muted-foreground">{t("Solicitada por")} {perfiles.find((p) => p.id === s.solicitada_por)?.nombre ?? s.solicitada_por} · {localInput(s.solicitada_at).replace("T", " ")}</p>
        {proposal.map((p, i) => <p key={i} className="break-all text-sm">{p.anular ? t("Anulación") : `${t(TIPOS[p.tipo])}: ${p.at ? localInput(p.at).replace("T", " ") : "—"}`} · {t("Original:")} {p.original_id ?? t("fichaje omitido")}</p>)}
        {d && <p className="text-xs">{t("Decidida por")} {perfiles.find((p) => p.id === d.decidida_por)?.nombre ?? d.decidida_por} · {localInput(d.decidida_at).replace("T", " ")} · {d.motivo}</p>}
        {!d && admin && <><label className="text-sm">{t("Motivo (obligatorio para rechazar)")}<input className="campo p-2" value={reason[s.id] ?? ""} onChange={(e) => setReason({ ...reason, [s.id]: e.target.value })} /></label><div className="flex gap-2"><Button disabled={busy} onClick={() => decide(s.id, true)}>{t("Aprobar")}</Button><Button variant="outline" disabled={busy || !reason[s.id]?.trim()} onClick={() => decide(s.id, false)}>{t("Rechazar")}</Button></div></>}
      </article>;
    })}
  </section>;
}