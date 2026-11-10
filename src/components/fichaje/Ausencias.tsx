import { useState } from "react";
import { locale, t, tf, useIdioma } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { dkey } from "@/lib/fichaje";
import { cupoVacaciones, diasEntre, diasVacacionesSolicitud, excesoAusentes, sabadosFestivos, saldoVacaciones } from "@/lib/jornada";
import { avisarEncargados, avisarTrabajador } from "@/lib/avisos.functions";
import { CalendarioAnual } from "./CalendarioAnual";
import { VacacionesPlantilla } from "./VacacionesPlantilla";
import { anoPorDefecto } from "@/lib/calendario";
import type { AjusteRow, AusenciaRow, Cfg, CierreEmpresaRow, Festivo, Perfil } from "./data";

const TIPOS_AUS: Record<string, string> = { vacaciones: "Vacaciones", permiso: "Permiso retribuido", baja: "Baja médica", otra: "Otra ausencia" };
const ESTADOS: Record<string, string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", anulada: "Anulada" };
const fecha = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short" });
const fechaLarga = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "long" });

/** Mensaje claro para los errores que la base de datos devuelve al pedir una ausencia. */
function errorSolicitud(msg: string) {
  if (msg.includes("solapa")) return t("Ya hay una ausencia en esas fechas.");
  if (msg.includes("cerrada")) return t("Esos días la empresa está cerrada: ya son vacaciones para todos.");
  if (msg.includes("quedan")) return t("No quedan suficientes días de vacaciones para esas fechas.");
  return t("No se pudo guardar la ausencia.");
}

/**
 * Vacaciones y ausencias. La app es la vía oficial para pedir vacaciones: queda registrado quién pide,
 * cuándo y la decisión del encargado. El saldo se cuenta en días laborables, cierre de la empresa incluido.
 */
export function Ausencias({ uid, admin, perfiles, cfg, festivos, cierres, ausencias, ajustes = [], onSaved }: { uid: string; admin: boolean; perfiles: Perfil[]; cfg: Cfg; festivos: Festivo[]; cierres: CierreEmpresaRow[]; ausencias: AusenciaRow[]; ajustes?: AjusteRow[]; onSaved: () => void }) {
  const hoy = dkey(new Date());
  const [para, setPara] = useState(uid);
  const [year, setYear] = useState(() => anoPorDefecto(hoy));
  const [tipo, setTipo] = useState("vacaciones");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [razon, setRazon] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nombre = (id: string) => perfiles.find((p) => p.id === id)?.nombre ?? "—";
  const avisarJefes = useServerFn(avisarEncargados);
  const avisarA = useServerFn(avisarTrabajador);
  useIdioma();
  const festSet = new Set(festivos.map((f) => f.fecha));
  const quien = admin ? para : uid;
  const suyas = ausencias.filter((a) => a.user_id === quien);
  const cupo = (id: string, y: number) => cupoVacaciones(cfg.dias_vacaciones, ajustes, id, y);
  const saldo = saldoVacaciones(year, cupo(quien, year), suyas, cierres, festSet, cfg.compensar_sabados);
  const laborables = hasta >= desde ? diasVacacionesSolicitud(desde, hasta, festSet, cierres) : 0;
  const naturales = hasta >= desde ? diasEntre(desde, hasta).length : 0;
  const dias = tipo === "vacaciones" ? laborables : naturales;
  const anoSolicitud = Number(desde.slice(0, 4));
  const saldoSolicitud = anoSolicitud === year ? saldo : saldoVacaciones(anoSolicitud, cupo(quien, anoSolicitud), suyas, cierres, festSet, cfg.compensar_sabados);
  const sinSaldo = tipo === "vacaciones" && laborables > saldoSolicitud.disponibles;
  const cierresAno = cierres.filter((c) => c.desde.startsWith(String(year)) || c.hasta.startsWith(String(year)));
  const ajustesAno = ajustes.filter((a) => a.user_id === quien && a.anio === year);
  const provisionales = festivos.filter((f) => f.provisional && f.fecha.startsWith(String(year)));
  const sabados = sabadosFestivos(year, festSet);

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    if (hasta < desde) { toast.error(t("La fecha final es anterior a la inicial.")); return; }
    setBusy(true);
    const { error } = await supabase.rpc("solicitar_ausencia", { _uid: para, _tipo: tipo, _desde: desde, _hasta: hasta, _motivo: motivo });
    setBusy(false);
    if (error) { toast.error(errorSolicitud(error.message)); return; }
    toast.success(admin ? t("Ausencia registrada") : t("Solicitud enviada al encargado"));
    if (!admin) avisarJefes({ data: { tipo: "ausencia" } }).catch(() => undefined);
    setMotivo(""); onSaved();
  }

  async function decidir(id: string, estado: "aprobada" | "rechazada" | "anulada") {
    setBusy(true);
    const { error } = await supabase.rpc("decidir_ausencia", { _id: id, _estado: estado, _motivo: razon[id] ?? "" });
    setBusy(false);
    if (error) { toast.error(estado === "rechazada" ? t("Para rechazar escribe el motivo.") : t("No se pudo guardar.")); return; }
    toast.success(estado === "aprobada" ? t("Ausencia aprobada") : estado === "rechazada" ? t("Ausencia rechazada") : t("Solicitud anulada"));
    const a = ausencias.find((x) => x.id === id);
    if (admin && a && estado !== "anulada") avisarA({ data: { userId: a.user_id, texto: `${TIPOS_AUS[a.tipo]} del ${fecha(a.desde)} al ${fecha(a.hasta)}: ${estado === "aprobada" ? "aprobada" : `rechazada. ${razon[id] ?? ""}`}`.slice(0, 200) } }).catch(() => undefined);
    onSaved();
  }

  const pendientes = ausencias.filter((a) => a.estado === "pendiente");
  const proximas = ausencias.filter((a) => a.estado === "aprobada" && a.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
  const mias = ausencias.filter((a) => a.user_id === uid);
  const field = "campo px-3 py-2";
  const card = "flex flex-col gap-3 rounded-xl bg-card p-5 shadow-card";
  const cifra = (n: number, t: string, destacar = false) => (
    <div className={`flex flex-col px-2 py-3 ${destacar ? (n < 0 ? "bg-stop-soft text-stop" : "bg-go-soft text-go") : ""}`}>
      <b className="num font-display text-4xl leading-none">{n}</b><span className="mt-1.5 text-xs leading-tight">{t}</span>
    </div>
  );
  const laborablesDe = (a: AusenciaRow) => a.tipo === "vacaciones" ? `${diasVacacionesSolicitud(a.desde, a.hasta, festSet, cierres)} ${t("laborables")}` : `${diasEntre(a.desde, a.hasta).length} ${t("días")}`;

  return (
    <>
      <section id="vacaciones-calendario" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-bold">{t("Vacaciones")} {year}</h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" aria-label={t("Año anterior")} onClick={() => setYear(year - 1)}>‹</Button>
            <Button variant="outline" size="sm" aria-label={t("Año siguiente")} onClick={() => setYear(year + 1)}>›</Button>
          </div>
        </div>
        {admin && (
          <label className="text-sm font-medium">{t("Trabajador")}
            <select className={field} value={para} onChange={(e) => setPara(e.target.value)}>{perfiles.filter((p) => p.activo || p.id === para).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
        )}
        <div className="grid grid-cols-4 divide-x divide-border overflow-hidden rounded-lg text-center ring-1 ring-border">
          {cifra(saldo.total, t("al año"))}
          {cifra(saldo.empresa, t("cierre empresa"))}
          {cifra(saldo.aprobadas + saldo.pendientes, saldo.pendientes ? `${t("pedidos")} (${saldo.pendientes} ${t("pend.")})` : t("pedidos"))}
          {cifra(saldo.disponibles, t("a elegir"), true)}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Días laborables (de lunes a viernes, sin festivos).")}{" "}
          {cierresAno.length ? <>{t("La empresa cierra")} {cierresAno.map((c, i) => <span key={c.id}>{i ? ` ${t("y")} ` : ""}{t("del")} {fechaLarga(c.desde)} {t("al")} {fechaLarga(c.hasta)}</span>)}{t(": esos días ya son vacaciones para todos.")}</> : t("Este año no hay cierres de empresa anotados.")}
        </p>
        {ajustesAno.map((a) => (
          <p key={a.id} className="text-sm text-muted-foreground">{tf("Incluye {n} días de otros años: {m}.", { n: a.dias > 0 ? `+${a.dias}` : a.dias, m: a.motivo })}</p>
        ))}
        {provisionales.map((f) => (
          <p key={f.fecha} role="note" className="rounded-xl bg-pause-soft p-2 text-sm text-pause">{fechaLarga(f.fecha)} · {f.nombre}: {t("festivo local pendiente de confirmación oficial; la fecha puede cambiar.")}</p>
        ))}
        {sabados.length > 0 && saldo.compensados > 0 && (
          <p className="text-sm text-muted-foreground">
            {tf("Festivos que caen en sábado: {n}.", { n: sabados.map(fechaLarga).join(", ") })}{" "}
            {tf("Se compensan cubriendo {n} días de puente, que no restan vacaciones.", { n: saldo.compensados })}
          </p>
        )}
        <CalendarioAnual year={year} festivos={festivos} cierres={cierres} ausencias={suyas} hoy={hoy} periodos={cfg.periodos} />
      </section>

      <section className={card}>
        <h2 className="font-display text-2xl font-bold">{admin ? t("Registrar ausencia") : t("Pedir vacaciones o ausencia")}</h2>
        {!admin && <p className="text-sm text-muted-foreground">{t("Las vacaciones se piden desde aquí: el encargado las aprueba y queda constancia de la fecha de la solicitud y de la decisión.")}</p>}
        <form onSubmit={solicitar} className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-medium">{t("Tipo")}
            <select className={field} value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(TIPOS_AUS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
          </label>
          <label className="text-sm font-medium">{t("Desde")}<input type="date" className={field} value={desde} onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} required /></label>
          <label className="text-sm font-medium">{t("Hasta")}<input type="date" className={field} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} required /></label>
          <label className="col-span-2 text-sm font-medium">{t("Comentario (opcional)")}<input className={field} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></label>
          {tipo === "vacaciones" && naturales > 0 && laborables === 0 && <p className="col-span-2 text-sm text-muted-foreground">{t("Esas fechas no consumen vacaciones: son fin de semana, festivo o cierre de la empresa.")}</p>}
          {sinSaldo && <p role="alert" className="col-span-2 text-sm text-stop">{admin ? `${t("Supera los")} ${saldoSolicitud.disponibles} ${t("días disponibles de")} ${nombre(para)} ${t("en")} ${anoSolicitud}${t("; quedará registrado igualmente.")}` : `${t("Solo te quedan")} ${saldoSolicitud.disponibles} ${t("días")} ${t("en")} ${anoSolicitud}.`}</p>}
          <Button disabled={busy || !dias || (sinSaldo && !admin)} className="col-span-2">
            {admin ? t("Registrar") : t("Pedir")} {dias} {tipo === "vacaciones" ? (dias === 1 ? t("día laborable") : t("días laborables")) : (dias === 1 ? t("día") : t("días"))}
          </Button>
        </form>
      </section>

      {admin && pendientes.length > 0 && (
        <section className={card}>
          <h2 className="font-display text-2xl font-bold">{t("Por aprobar")}</h2>
          {pendientes.map((a) => {
            const s = saldoVacaciones(Number(a.desde.slice(0, 4)), cupo(a.user_id, Number(a.desde.slice(0, 4))), ausencias.filter((x) => x.user_id === a.user_id), cierres, festSet, cfg.compensar_sabados);
            const exceso = excesoAusentes(a, ausencias, cfg.max_ausentes, festSet);
            return (
              <article key={a.id} className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
                <b>{nombre(a.user_id)} · {t(TIPOS_AUS[a.tipo] ?? a.tipo)}</b>
                <span className="text-sm">{fecha(a.desde)} – {fecha(a.hasta)} ({laborablesDe(a)}){a.motivo ? ` · ${a.motivo}` : ""}</span>
                {exceso.length > 0 && (
                  <p className="rounded-xl bg-pause-soft p-2 text-sm text-pause">{t("Personal mínimo: si la apruebas faltarían más de")} {cfg.max_ausentes} {t("el")} {exceso.map((x, i) => <span key={x.dia}>{i ? ", " : ""}{fecha(x.dia)} ({x.ausentes.map(nombre).join(", ")})</span>)}.</p>
                )}
                {a.tipo === "vacaciones" && <span className="text-xs text-muted-foreground">{t("Pedida el")} {new Date(a.solicitada_at).toLocaleDateString(locale())} · {t("con esta,")} {nombre(a.user_id)} {t("tendría")} {s.disponibles} {t("días a elegir en")} {a.desde.slice(0, 4)}.</span>}
                <input className={field} placeholder={t("Motivo (obligatorio para rechazar)")} value={razon[a.id] ?? ""} onChange={(e) => setRazon({ ...razon, [a.id]: e.target.value })} />
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => decidir(a.id, "aprobada")}>{t("Aprobar")}</Button>
                  <Button variant="outline" disabled={busy || !razon[a.id]?.trim()} onClick={() => decidir(a.id, "rechazada")}>{t("Rechazar")}</Button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {admin && (
        <section className={card}>
          <h2 className="font-display text-2xl font-bold">{t("Quién falta")}</h2>
          {proximas.length ? (
            <ul className="flex flex-col gap-1 text-sm">{proximas.map((a) => (
              <li key={a.id} className="flex justify-between gap-2"><span>{nombre(a.user_id)} · {t(TIPOS_AUS[a.tipo] ?? a.tipo)}</span><span className="num shrink-0">{fecha(a.desde)} – {fecha(a.hasta)}</span></li>
            ))}</ul>
          ) : <p className="text-sm text-muted-foreground">{t("No hay ausencias aprobadas a partir de hoy.")}</p>}
        </section>
      )}

      {admin && <VacacionesPlantilla year={year} hoy={hoy} perfiles={perfiles} cfg={cfg} festivos={festivos} cierres={cierres} ausencias={ausencias} ajustes={ajustes} onSaved={onSaved}
        onVer={(id) => { setPara(id); document.getElementById("vacaciones-calendario")?.scrollIntoView({ behavior: "smooth" }); }} />}

      <section className={card}>
        <h2 className="font-display text-2xl font-bold">{t("Mis ausencias")}</h2>
        {mias.length ? (
          <ul className="flex flex-col divide-y text-sm">{mias.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span>{t(TIPOS_AUS[a.tipo] ?? a.tipo)} · {fecha(a.desde)} – {fecha(a.hasta)} <small className="text-muted-foreground">({laborablesDe(a)})</small>{a.motivo_decision ? <small className="block text-muted-foreground">{a.motivo_decision}</small> : null}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={a.estado === "aprobada" ? "text-go" : a.estado === "rechazada" ? "text-stop" : "text-muted-foreground"}>{t(ESTADOS[a.estado] ?? a.estado)}</span>
                {a.estado === "pendiente" && <Button variant="outline" disabled={busy} onClick={() => decidir(a.id, "anulada")}>{t("Anular")}</Button>}
              </span>
            </li>
          ))}</ul>
        ) : <p className="text-sm text-muted-foreground">{t("Aún no has pedido ninguna ausencia.")}</p>}
      </section>
    </>
  );
}
