import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { avisarEncargados } from "@/lib/avisos.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TIPOS, compute, dkey, dur, enCurso, hm, type Estado, type Tipo } from "@/lib/fichaje";
import { Editor } from "./Editor";
import { CFG_DEFECTO, ausDe, desdeParaMes, groupByDay, inicioMesAnterior, loadAll, loadCalendario, loadMonth, toEv, type AusenciaRow, type Cfg, type CierreEmpresaRow, type CierreRow, type Fila, type Festivo, type Perfil, type PeriodoRow, type AjusteRow } from "./data";
import { avisos, computoAnual, cupoVacaciones, horas, resumenMes, saldoVacaciones } from "@/lib/jornada";
import { Ausencias } from "./Ausencias";
import { CierreMes } from "./CierreMes";
import { Ajustes } from "./Ajustes";
import { SegundoFactor } from "./SegundoFactor";
import { exportarGestoria, exportarHistorico } from "./gestoria";
import { AvisosPush } from "./AvisosPush";
import { Idioma } from "./Idioma";
import { locale, t, useIdioma } from "@/lib/i18n";
import { enfocarAlMontar } from "@/lib/utils";
import { exportarPdf } from "./pdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmployeeDialog } from "./EmployeeDialog";
import { Requests } from "./Requests";
import { CambiarPin } from "./CambiarPin";
import { Marca } from "./Marca";

const AVISO = "registro-v1";

type Tab = "fichar" | "historial" | "ausencias" | "equipo" | "inspección";
const thisMonth = () => dkey(new Date()).slice(0, 7);

export function FichajeApp({ uid }: { uid: string }) {
  const [tab, setTab] = useState<Tab>("ausencias");
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [admin, setAdmin] = useState(false);
  const [hoy, setHoy] = useState<Fila[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [mes, setMes] = useState(thisMonth());
  const [filasMes, setFilasMes] = useState<Fila[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ uid: string; dia: string | null; filas: Fila[] } | null>(null);

  const [employee, setEmployee] = useState<{ perfil?: Perfil; mode: "crear" | "editar" | "pin" } | null>(null);
  const [allRows, setAllRows] = useState<Fila[]>([]);
  const [revision, setRevision] = useState(0);
  const [privacy, setPrivacy] = useState(false);
  const [privacyReady, setPrivacyReady] = useState(false);
  const [rolAdmin, setRolAdmin] = useState(false);
  const [aal2, setAal2] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<Cfg>(CFG_DEFECTO);
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [ausencias, setAusencias] = useState<AusenciaRow[]>([]);
  const [cierres, setCierres] = useState<CierreRow[]>([]);
  const [cierresEmpresa, setCierresEmpresa] = useState<CierreEmpresaRow[]>([]);
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([]);
  const [ajustes, setAjustes] = useState<AjusteRow[]>([]);
  const [distancia, setDistancia] = useState(false);
  const [editarPin, setEditarPin] = useState(false);
  const avisarJefes = useServerFn(avisarEncargados);
  useIdioma();
  const cargarPerfiles = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id,username,nombre,activo,debe_cambiar_pin,conductor,inspector").order("nombre");
    if (error) { toast.error(t("No se pudo cargar el equipo.")); return; }
    setPerfiles(data ?? []);
  }, []);
  async function activar(p: Perfil) {
    const { error } = await supabase.rpc("edit_employee", { _id: p.id, _nombre: p.nombre, _username: p.username, _activo: !p.activo });
    if (error) { toast.error(t("No se pudo cambiar el acceso.")); return; }
    toast.success(p.activo ? t("Trabajador desactivado") : t("Trabajador reactivado")); void cargarPerfiles();
  }
  async function acceptPrivacy() {
    setBusy(true);
    const { error } = await supabase.from("avisos_privacidad").insert({ user_id: uid, version: AVISO });
    setBusy(false);
    if (error) { toast.error(t("No se pudo registrar el aviso.")); return; }
    setPrivacy(false);
  }
  const yo = perfiles.find((p) => p.id === uid);
  const inspector = Boolean(yo?.inspector && aal2);
  const todo = admin || inspector; // ve a todo el equipo
  const nombreDe = (id: string) => perfiles.find((p) => p.id === id)?.nombre ?? "—";

  // Sin saber si ha visto el aviso de privacidad no se puede fichar: si la consulta falla, se ofrece reintentar.
  const comprobarPrivacidad = useCallback(() => {
    supabase.from("avisos_privacidad").select("id").eq("user_id", uid).eq("version", AVISO).then(({ data, error }) => {
      if (error) { toast.error(t("No se pudo comprobar el aviso de privacidad."), { action: { label: t("Reintentar"), onClick: comprobarPrivacidad } }); return; }
      setPrivacy(!data?.length); setPrivacyReady(true);
    });
  }, [uid]);

  const cargarHoy = useCallback(async () => {
    try {
      const rows = await loadAll(uid, inicioMesAnterior(thisMonth()));
      const groups = groupByDay(rows);
      // Mismo criterio que la base de datos: solo bloquea la última jornada si sigue abierta.
      // Una jornada antigua que una corrección haya dejado abierta se avisa aparte, pero no impide fichar.
      const ultima = groups[0];
      const open = ultima && compute(ultima[1].map(toEv)).unclosed ? ultima : undefined;
      setHoy(open?.[1] ?? rows.filter((f) => f.dia === dkey(new Date())));
    } catch { toast.error(t("No se pudieron cargar los fichajes.")); }

  }, [uid]);

  const cargarMes = useCallback(async () => {
    try { setFilasMes(await loadMonth(mes, tab === "equipo" || tab === "inspección" ? undefined : uid)); } catch { toast.error(t("No se pudo cargar el mes.")); }
  }, [mes, tab, uid]);

  useEffect(() => {
    const reloj = setInterval(() => setNow(Date.now()), 1000);
    void cargarPerfiles();
    supabase.from("user_roles").select("role").eq("user_id", uid).then(({ data }) => setRolAdmin(Boolean(data?.some((x) => x.role === "admin"))));
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal2(data?.currentLevel === "aal2"));
    comprobarPrivacidad();
    cargarHoy();
    return () => clearInterval(reloj);
  }, [uid, cargarHoy, cargarPerfiles, comprobarPrivacidad]);

  useEffect(() => { if (tab === "historial" || tab === "equipo" || tab === "inspección") void cargarMes(); }, [tab, cargarMes]);

  useEffect(() => { if (aal2) supabase.rpc("is_manager").then(({ data }) => setAdmin(data === true)); }, [aal2]);
  // Se carga desde enero del año consultado (cómputo anual) o desde el mes anterior, no los cuatro años de histórico.
  useEffect(() => { loadAll(todo ? undefined : uid, desdeParaMes(mes)).then(setAllRows).catch(() => toast.error(t("No se pudieron cargar los avisos."))); }, [uid, todo, revision, mes]);
  async function historico() {
    try { await exportarHistorico(await loadAll(), perfiles, ausencias, cierres); } catch { toast.error(t("No se pudieron cargar los fichajes.")); }
  }
  useEffect(() => {
    loadCalendario().then((c) => { setCfg(c.cfg); setFestivos(c.festivos); setAusencias(c.ausencias); setCierres(c.cierres); setCierresEmpresa(c.cierresEmpresa); setPeriodos(c.periodos); setAjustes(c.ajustes); }).catch(() => toast.error(t("No se pudo cargar el calendario.")));
  }, [uid, admin, revision]);
  const festSet = useMemo(() => new Set(festivos.map((f) => f.fecha)), [festivos]);
  // El reloj avanza cada segundo; lo que depende de la hora se recalcula como mucho una vez por minuto.
  const minuto = Math.floor(now / 60000);
  const porUsuario = useMemo(() => {
    const avisosDe = new Map<string, string[]>(), estadoDe = new Map<string, Estado>();
    const sinCerrar: { p: Perfil; dia: string }[] = [];
    for (const p of perfiles) {
      const suyas = allRows.filter((f) => f.user_id === p.id);
      avisosDe.set(p.id, avisos(now, suyas, cfg, festSet, ausDe(ausencias, p.id, cierresEmpresa)));
      const grupos = groupByDay(suyas).map(([dia, fs]) => ({ dia, ev: fs.map(toEv) }));
      const abierta = grupos.find((g) => enCurso(g.ev, now));
      estadoDe.set(p.id, abierta ? compute(abierta.ev, now, true).state : "fuera");
      for (const g of grupos) if (compute(g.ev).unclosed && !enCurso(g.ev, now)) sinCerrar.push({ p, dia: g.dia });
    }
    return { avisosDe, estadoDe, sinCerrar };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuto, perfiles, allRows, cfg, festSet, ausencias, cierresEmpresa]);
  const avisosDe = (id: string) => porUsuario.avisosDe.get(id) ?? [];
  const misAvisos = avisosDe(uid);
  const live = enCurso(hoy.map(toEv), now);
  const { state, worked, unclosed } = compute(hoy.map(toEv), now, live);
  const olvidada = unclosed && !live;
  const refresh = () => { void cargarHoy(); void cargarMes(); setRevision((r) => r + 1); };
  const unclosedGroups = porUsuario.sinCerrar;

  async function fichar(tipo: Tipo) {
    setBusy(true);
    const { data, error } = await supabase.from("fichajes").insert({ user_id: uid, tipo, dia: "2000-01-01", modalidad: tipo === "entrada" && distancia ? "distancia" : "presencial" }).select("at").single();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("sin cerrar") ? t("Tienes una jornada sin cerrar. Solicita la corrección con tu hora de salida real.") : t("No se pudo fichar. Revisa la conexión."));
      refresh();
      return;
    }
    toast.success(`${t(TIPOS[tipo])} ${t("registrada a las")} ${data ? hm(data.at) : "—"}`);
    refresh();
  }

  const estadoDia = (fs: Fila[]) => {
    const ev = fs.map(toEv);
    return !compute(ev).unclosed ? t("Cerrada") : enCurso(ev, now) ? t("En curso") : t("Sin cerrar");
  };

  function exportar() {
    const lines = [["Empleado", "Usuario", "Día", "Tipo", "Hora", "Lugar", "Corregido", "Estado", "Hora original"]];
    for (const f of filasMes) {
      const p = perfiles.find((x) => x.id === f.user_id);
      lines.push([p?.nombre ?? "", p?.username ?? "", f.dia, TIPOS[f.tipo], hm(f.at), f.lugar, f.editado ? "Sí" : "No", estadoDia(filasMes.filter((x) => x.user_id === f.user_id && x.dia === f.dia)), f.original_at ? hm(f.original_at) : ""]);
    }
    lines.push([], ["Empleado", "Total horas del mes"]);
    const porUser = new Map<string, Fila[]>();
    filasMes.forEach((f) => porUser.set(f.user_id, [...(porUser.get(f.user_id) ?? []), f]));
    for (const [id, fs] of porUser) {
      const total = groupByDay(fs).reduce((s, [, d]) => s + compute(d.map(toEv), Date.now()).worked, 0);
      lines.push([nombreDe(id), (total / 3600000).toFixed(2).replace(".", ",")]);
    }
    const csv = "\uFEFF" + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `fichajes-${mes}.csv`;
    a.click();
  }

  const idiomaActual = locale();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fecha = useMemo(() => new Date(now).toLocaleDateString(idiomaActual, { weekday: "long", day: "numeric", month: "long" }), [minuto, idiomaActual]);
  const reloj = new Date(now);
  const p2 = (n: number) => String(n).padStart(2, "0");

  const chip = state === "trabajando" ? "bg-go-soft text-go" : state === "pausa" || state === "espera" ? "bg-pause-soft text-pause" : "bg-muted text-muted-foreground";
  const chipTxt = olvidada ? t("Jornada sin cerrar: no suma horas") : state === "trabajando" ? `${t("Trabajando")} · ${dur(worked)}` : state === "pausa" ? `${t("En pausa")} · ${dur(worked)} ${t("hoy")}` : state === "espera" ? `${t("En espera")} · ${dur(worked)} ${t("de trabajo hoy")}` : hoy.length ? `${t("Jornada cerrada")} · ${dur(worked)}` : t("Sin fichar hoy");

  const DayList = ({ id, filas, soloLectura = false }: { id: string; filas: Fila[]; soloLectura?: boolean }) => (
    <ul className="flex flex-col divide-y">
      {groupByDay(filas).map(([dia, fs]) => {
        const c = compute(fs.map(toEv), Date.now());
        const estado = estadoDia(fs);
        return (
          <li key={dia} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold capitalize">{new Date(dia + "T12:00").toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })}
                {fs.some((f) => f.editado) && <span className="ml-2 rounded-full bg-pause-soft px-2 py-0.5 text-xs font-medium text-pause">{t("corregido")}</span>}
                {fs.some((f) => f.modalidad === "distancia") && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("a distancia")}</span>}</div>
              <div className="num flex flex-wrap gap-x-2 text-sm text-muted-foreground">{fs.map((f) => (
                <span key={f.id}>{t(TIPOS[f.tipo])} {hm(f.at)}{f.editado && f.original_at && <small> (original: {hm(f.original_at)})</small>}</span>
              ))}</div>
            </div>
            <span className="num text-sm font-semibold">{c.unclosed ? estado : dur(c.worked)}</span>
            {!soloLectura && <Button variant="outline" size="sm" onClick={() => setEditor({ uid: id, dia, filas: fs })}>{t("Solicitar")}</Button>}
          </li>
        );
      })}
    </ul>
  );

  const total = (fs: Fila[]) => groupByDay(fs).reduce((s, [, d]) => s + compute(d.map(toEv), Date.now()).worked, 0);
  // Sin fichaje activo la app es solo de vacaciones: el trabajador ve Vacaciones y el encargado, además, Equipo.
  const fichaje = cfg.fichaje_activo;
  const tabs = useMemo<Tab[]>(() => inspector ? ["inspección"] : fichaje ? (admin ? ["fichar", "historial", "ausencias", "equipo"] : ["fichar", "historial", "ausencias"]) : admin ? ["ausencias", "equipo"] : ["ausencias"], [inspector, fichaje, admin]);
  useEffect(() => { if (inspector && tab !== "inspección") setTab("inspección"); else if (!inspector && !tabs.includes(tab)) setTab(tabs[0] ?? "ausencias"); }, [inspector, tab, tabs]);
  // Con el fichaje activo se abre en Fichar, como siempre.
  const [abiertaFichar, setAbiertaFichar] = useState(false);
  useEffect(() => { if (fichaje && !abiertaFichar && !inspector) { setAbiertaFichar(true); setTab("fichar"); } }, [fichaje, abiertaFichar, inspector]);
  const year = Number(mes.slice(0, 4));
  // Cálculos pesados: solo cuando cambian los datos, no en cada segundo del reloj.
  const resumenes = useMemo(() => new Map(perfiles.map((p) => [p.id, {
    mes: resumenMes(mes, allRows.filter((f) => f.user_id === p.id), cfg, festSet, ausDe(ausencias, p.id, cierresEmpresa)),
    anual: computoAnual(year, allRows.filter((f) => f.user_id === p.id)),
    vacaciones: saldoVacaciones(year, cupoVacaciones(cfg.dias_vacaciones, ajustes, p.id, year), ausencias.filter((a) => a.user_id === p.id), cierresEmpresa, festSet, cfg.compensar_sabados),
  }])), [mes, year, allRows, perfiles, cfg, festSet, ausencias, cierresEmpresa, ajustes]);
  const resumenDe = (id: string) => resumenes.get(id)?.mes ?? resumenMes(mes, [], cfg, festSet, []);
  const anualDe = (id: string) => resumenes.get(id)?.anual ?? 0;
  const vacacionesDe = (id: string) => resumenes.get(id)?.vacaciones;
  const card = "flex flex-col gap-3 rounded-xl bg-card p-5 shadow-card";
  const h = "font-display text-2xl font-bold tracking-tight";

  if (yo?.debe_cambiar_pin) return <CambiarPin nombre={yo.nombre} onDone={() => { toast.success(t("PIN cambiado")); void cargarPerfiles(); }} />;
  if (editarPin) return <CambiarPin nombre={yo?.nombre} voluntario onDone={() => { toast.success(t("PIN cambiado")); setEditarPin(false); }} onCancel={() => setEditarPin(false)} />;
  if ((rolAdmin || yo?.inspector) && aal2 === false) return <SegundoFactor onDone={() => setAal2(true)} />;

  return (
    <div className="min-h-screen">
    <Marca>
      <div className="flex items-center gap-2 text-sm">
        <Idioma />
        <span className="max-w-[120px] truncate font-medium">{yo?.nombre}</span>
        {yo && !yo.inspector && <button type="button" aria-label={t("Cambiar mi PIN")} title={t("Cambiar mi PIN")} className="rounded-full bg-secondary px-3 py-1.5 font-semibold transition-colors hover:bg-foreground hover:text-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => setEditarPin(true)}>PIN</button>}
        <button type="button" className="rounded-full bg-secondary px-3.5 py-1.5 font-semibold transition-colors hover:bg-foreground hover:text-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => supabase.auth.signOut()}>{t("Salir")}</button>
      </div>
    </Marca>
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pb-12 pt-5">
      <h1 id="titulo-app" ref={enfocarAlMontar} tabIndex={-1} className="sr-only">{t("Registro de jornada")}</h1>
      {tabs.length > 1 && <nav className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-secondary p-1">
        {tabs.map((k) => (
          <button type="button" key={k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}
            className={`rounded-md py-2 text-[15px] font-semibold capitalize transition-all focus-visible:outline-2 focus-visible:outline-ring ${tab === k ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}>{t(k)}</button>
        ))}
      </nav>}

      {yo && !yo.activo && <p className="text-destructive">{t("Tu cuenta está desactivada. Habla con el encargado.")}</p>}
      {fichaje && unclosedGroups.length > 0 && <section className="rounded-lg bg-pause-soft p-4 text-pause ring-1 ring-pause/30"><b>{t("Jornadas sin cerrar: no suman horas")}</b>{unclosedGroups.map(({ p, dia }) => <p key={p.id + dia}>{admin ? p.nombre + " · " : ""}{dia} · {t("Solicita una corrección si falta la salida.")}</p>)}</section>}
      {tab === "fichar" && (
        <>
          <section className="relative flex flex-col items-center gap-1 overflow-hidden rounded-xl bg-card px-4 pb-6 pt-5 text-center shadow-card">
            <div aria-hidden className="slashes pointer-events-none absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-[22px] bg-brand" />
            <div className="relative text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{fecha}</div>
            <div className="num relative font-display text-[clamp(64px,22vw,112px)] font-bold leading-none tracking-tight">
              {p2(reloj.getHours())}:{p2(reloj.getMinutes())}<span className="ml-1 text-[0.38em] text-muted-foreground">{p2(reloj.getSeconds())}</span>
            </div>
            <div className={`relative mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold ${chip}`}>
              <i className="h-2 w-2 rounded-full bg-current" />{chipTxt}
            </div>
          </section>
          {misAvisos.length > 0 && !olvidada && (
            <section role="status" className="rounded-lg bg-pause-soft p-4 text-pause ring-1 ring-pause/30">
              {misAvisos.map((a) => <p key={a}>{t(a)}</p>)}
            </section>
          )}
          <section className="flex flex-col gap-3">
            {olvidada && (
              <div className="flex flex-col gap-2 rounded-xl bg-pause-soft p-5 text-center text-pause ring-1 ring-pause/30">
                <b>{t("Te olvidaste de fichar la salida del")} {new Date(hoy[0]!.dia + "T12:00").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })}.</b>
                <span className="text-sm">{t("Para volver a fichar, solicita la corrección con tu hora real de salida. El encargado la aprobará.")}</span>
                <Button onClick={() => setEditor({ uid, dia: hoy[0]!.dia, filas: hoy })}>{t("Solicitar corrección")}</Button>
              </div>
            )}
            {!olvidada && state === "fuera" && (
              <label className="flex items-center gap-2 self-center text-sm text-muted-foreground"><input type="checkbox" checked={distancia} onChange={(e) => setDistancia(e.target.checked)} /> {t("Hoy trabajo a distancia")}</label>
            )}
            {!olvidada && state === "fuera" && (
              <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("entrada")} className="flex min-h-[128px] flex-col items-center justify-center slashes rounded-2xl border-0 bg-go shadow-pop hover:bg-go hover:text-on-signal hover:brightness-105 font-display text-5xl font-bold tracking-tight text-on-signal active:scale-[.98] disabled:opacity-60">
                {t("Entrada")}<small className="font-sans text-base font-medium tracking-normal opacity-90">{hoy.length ? t("Empezar otra jornada") : t("Empezar la jornada")}</small>
              </Button>
            )}
            {!olvidada && state === "trabajando" && (
              <>
                <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("salida")} className="flex min-h-[128px] flex-col items-center justify-center slashes rounded-2xl border-0 bg-stop shadow-pop hover:bg-stop hover:text-on-signal hover:brightness-105 font-display text-5xl font-bold tracking-tight text-on-signal active:scale-[.98] disabled:opacity-60">
                  {t("Salida")}<small className="font-sans text-base font-medium tracking-normal opacity-90">{t("Terminar la jornada")}</small>
                </Button>
                <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("pausa")} className="min-h-14 rounded-lg border-0 bg-card text-lg text-pause shadow-card ring-2 ring-inset ring-pause/70 hover:bg-pause-soft hover:text-pause">{t("Hacer pausa")}</Button>
                {yo?.conductor && <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("espera")} className="min-h-14 rounded-lg border-0 bg-card text-lg text-foreground shadow-card ring-2 ring-inset ring-foreground/70 hover:bg-muted">{t("Espera (carga, descarga, obra)")}</Button>}
              </>
            )}
            {!olvidada && (state === "pausa" || state === "espera") && (
              <>
                <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("reanudar")} className="flex min-h-[128px] flex-col items-center justify-center slashes rounded-2xl border-0 bg-pause shadow-pop hover:bg-pause hover:text-on-signal hover:brightness-105 font-display text-5xl font-bold tracking-tight text-on-signal active:scale-[.98] disabled:opacity-60">
                  {t("Volver")}<small className="font-sans text-base font-medium tracking-normal opacity-90">{state === "espera" ? t("Terminar la espera") : t("Terminar la pausa")}</small>
                </Button>
                <Button variant="outline" disabled={busy || !privacyReady || !yo?.activo} onClick={() => fichar("salida")} className="min-h-14 rounded-lg border-0 bg-card text-lg text-stop shadow-card ring-2 ring-inset ring-stop/70 hover:bg-stop-soft hover:text-stop">{t("Salida")}</Button>
              </>
            )}
          </section>
          <section className={card}>
            <h2 className={h}>{t("Hoy")}</h2>
            {hoy.length ? (
              <ul className="flex flex-col divide-y divide-border">{hoy.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2"><span className="flex items-center gap-2.5"><i aria-hidden className={`h-2 w-2 rounded-full ${f.tipo === "entrada" || f.tipo === "reanudar" ? "bg-go" : f.tipo === "salida" ? "bg-stop" : "bg-pause"}`} />{t(TIPOS[f.tipo])}</span><span className="num font-semibold">{hm(f.at)}</span></li>
              ))}</ul>
            ) : <p className="text-sm text-muted-foreground">{t("Aún no has fichado hoy.")}</p>}
          </section>
          <AvisosPush admin={admin} />
        </>
      )}

      {tab === "inspección" && (
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={h}>{t("Registro de jornada")}</h2>
            <input type="month" aria-label={t("Mes")} value={mes} max={thisMonth()} onChange={(e) => e.target.value && setMes(e.target.value)} className="campo w-auto px-2.5 py-1.5" />
          </div>
          <p className="text-sm text-muted-foreground">{t("Acceso de solo lectura para la Inspección de Trabajo: fichajes efectivos con sus originales, correcciones, ausencias y conformidad mensual de cada trabajador. Se conserva 4 años.")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={historico} className="h-11 flex-1">{t("Histórico completo (Excel)")}</Button>
            <Button variant="outline" onClick={() => exportarPdf(mes, filasMes, perfiles)} className="h-11 flex-1">{t("PDF del mes")}</Button>
          </div>
          <ul className="flex flex-col divide-y">
            {perfiles.filter((p) => !p.inspector).map((p) => {
              const fs = filasMes.filter((f) => f.user_id === p.id);
              const open = abierto === p.id;
              const rP = resumenDe(p.id);
              return (
                <li key={p.id} className="py-2">
                  <Button variant="ghost" aria-expanded={open} onClick={() => setAbierto(open ? null : p.id)} className="flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left whitespace-normal">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p.nombre}{!p.activo && <span className="ml-2 text-xs text-stop">{t("baja")}</span>}</div>
                      <div className="text-sm text-muted-foreground">{groupByDay(fs).length} {t("días")} · {dur(rP.trabajado)} {t("de")} {dur(rP.teorico)} {t("previstas")}{rP.extra75 + rP.extra150 > 0 ? ` · ${horas(rP.extra75 + rP.extra150)} h extra` : ""}{rP.descansos ? ` · ${t("Descansos incumplidos:")} ${rP.descansos}` : ""}</div>
                    </div>
                    <span className="num font-semibold">{dur(total(fs))}</span>
                  </Button>
                  {open && <div className="pl-2">{fs.length ? <DayList id={p.id} filas={fs} soloLectura /> : <p className="py-2 text-sm text-muted-foreground">{t("Sin fichajes este mes.")}</p>}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === "ausencias" && !fichaje && <AvisosPush admin={admin} />}
      {tab === "ausencias" && <Ausencias uid={uid} admin={admin} perfiles={perfiles.length ? perfiles : []} cfg={cfg} festivos={festivos} cierres={cierresEmpresa} ausencias={ausencias} ajustes={ajustes} onSaved={refresh} />}
      {(tab === "historial" || tab === "equipo") && (
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={h}>{tab === "equipo" ? t("Equipo") : t("Mis jornadas")}</h2>
            <input type="month" aria-label={t("Mes")} value={mes} max={thisMonth()} onChange={(e) => e.target.value && setMes(e.target.value)} className="campo w-auto px-2.5 py-1.5" />
          </div>
          <div className="flex flex-wrap gap-2">
            {tab === "equipo"
              ? <Button variant="outline" onClick={() => exportarGestoria(mes, allRows, perfiles, cfg, festSet, ausencias, cierres, cierresEmpresa)} className="h-11 flex-1">{t("Excel gestoría")}</Button>
              : <Button variant="outline" onClick={exportar} className="h-11 flex-1">CSV</Button>}
            <Button variant="outline" onClick={() => exportarPdf(mes, filasMes, perfiles)} className="h-11 flex-1">PDF</Button>
            {tab === "historial" && <Button variant="outline" onClick={() => setEditor({ uid, dia: null, filas: [] })} className="h-11 flex-1">{t("Solicitar jornada")}</Button>}
          </div>
          {tab === "historial" && (
            <>
              {(() => { const r = resumenDe(uid); return (
                <p className="text-sm text-muted-foreground">{t("Total del mes:")} <b className="num text-foreground">{dur(r.trabajado)}</b> {t("de")} {dur(r.teorico)} {t("previstas")} · {groupByDay(filasMes).length} {t("días")}
                  {r.extra75 + r.extra150 > 0 && <> · {t("Horas extra:")} <b className="num text-foreground">{horas(r.extra75 + r.extra150)} h</b></>}
                  {r.presencia > 0 && <> · {t("Espera:")} <b className="num text-foreground">{dur(r.presencia)}</b></>}
                  {r.descansos > 0 && <> · <span className="text-pause">{t("Descansos incumplidos:")} <b className="num">{r.descansos}</b></span></>}
                  <br />{t("Año")} {year}: <b className="num text-foreground">{horas(anualDe(uid))} h</b> {t("de")} {cfg.horas_anuales} h{(() => { const v = vacacionesDe(uid); return v ? <> · {t("Vacaciones:")} <b className="num text-foreground">{v.disponibles}</b> {t("días a elegir")}</> : null; })()}</p>
              ); })()}
              <CierreMes uid={uid} mes={mes} mesActual={thisMonth()} cierres={cierres} filas={filasMes} revision={revision} onSaved={refresh} />
              {filasMes.length ? <DayList id={uid} filas={filasMes} /> : <p className="text-sm text-muted-foreground">{t("Sin fichajes este mes.")}</p>}
            </>
          )}
          {tab === "equipo" && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEmployee({ mode: "crear" })}>{t("Crear trabajador")}</Button><Button variant="outline" onClick={historico}>{t("Histórico completo (Excel)")}</Button></div>}
          {tab === "equipo" && (
            <ul className="flex flex-col divide-y">
              {perfiles.map((p) => {
                const fs = filasMes.filter((f) => f.user_id === p.id);
                const open = abierto === p.id;
                const st = porUsuario.estadoDe.get(p.id) ?? "fuera";
                const avP = avisosDe(p.id);
                const rP = resumenDe(p.id);
                const cP = cierres.find((c) => c.user_id === p.id && c.mes === mes);
                return (
                  <li key={p.id} className="py-2">
                    <Button variant="ghost" aria-expanded={open} onClick={() => setAbierto(open ? null : p.id)} className="flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left whitespace-normal">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.nombre}{!p.activo && <span className="ml-2 text-xs text-stop">{t("desactivado")}</span>}
                          {st !== "fuera" && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${st === "trabajando" ? "bg-go-soft text-go" : "bg-pause-soft text-pause"}`}>{st === "trabajando" ? t("trabajando") : st === "pausa" ? t("en pausa") : t("en espera")}</span>}
                          {avP.length > 0 && <span className="ml-2 rounded-full bg-pause-soft px-2 py-0.5 text-xs font-medium text-pause">{avP.length} {avP.length > 1 ? t("avisos") : t("aviso")}</span>}</div>
                        <div className="text-sm text-muted-foreground">@{p.username}{p.conductor ? ` · ${t("conductor")}` : ""}{p.inspector ? ` · ${t("inspección")}` : ""} · {groupByDay(fs).length} {t("días")}{rP.descansos ? ` · ${t("Descansos incumplidos:")} ${rP.descansos}` : ""}{rP.extra75 + rP.extra150 > 0 ? ` · ${horas(rP.extra75 + rP.extra150)} h extra` : ""}{mes < thisMonth() ? (cP ? (cP.conforme ? ` · ${t("conforme")}` : ` · ${t("discrepa")}`) : ` · ${t("sin cerrar el mes")}`) : ""}</div>
                      </div>
                      <span className="num font-semibold">{dur(total(fs))}</span>
                    </Button>
                    {open && (
                      <div className="pl-2">
                        {avP.map((a) => <p key={a} className="text-sm text-pause">{t(a)}</p>)}
                        {cP && !cP.conforme && <p className="text-sm text-pause">{t("Discrepancia del mes:")} «{cP.comentario}»</p>}
                        {(() => { const v = vacacionesDe(p.id); return v ? <p className="text-sm text-muted-foreground">{t("Vacaciones")} {year}: <b className="num text-foreground">{v.aprobadas + v.pendientes}</b> {t("pedidos")} · <b className={`num ${v.disponibles < 0 ? "text-stop" : "text-foreground"}`}>{v.disponibles}</b> {t("a elegir")} {t("de")} {v.total} {t("laborables")} ({t("cierre empresa")}: {v.empresa}).</p> : null; })()}
                        {fs.length ? <DayList id={p.id} filas={fs} /> : <p className="py-2 text-sm text-muted-foreground">{t("Sin fichajes este mes.")}</p>}
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => setEditor({ uid: p.id, dia: null, filas: [] })} size="sm">{t("Solicitar jornada")}</Button>
                          <Button variant="outline" onClick={() => setEmployee({ perfil: p, mode: "pin" })}>{t("Cambiar PIN")}</Button>
                          <Button variant="outline" onClick={() => setEmployee({ perfil: p, mode: "editar" })}>{t("Editar")}</Button>
                          {p.id !== uid && <Button variant="outline" onClick={() => activar(p)}>{p.activo ? t("Desactivar") : t("Reactivar")}</Button>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {fichaje && (tab === "historial" || tab === "equipo") && <Requests admin={admin} perfiles={perfiles} revision={revision} onSaved={refresh} />}
      {tab === "equipo" && admin && <Ajustes cfg={cfg} festivos={festivos} cierres={cierresEmpresa} periodos={periodos} onSaved={refresh} />}
      {employee && <EmployeeDialog {...employee} onClose={() => setEmployee(null)} onSaved={() => { setEmployee(null); void cargarPerfiles(); }} />}
      <Dialog open={privacy} onOpenChange={() => undefined}><DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.getElementById("titulo-app")?.focus(); }}><DialogTitle>{t("Información sobre tus datos")}</DialogTitle><DialogDescription>{t("Registro de jornada obligatorio (art. 34.9 del Estatuto de los Trabajadores).")}</DialogDescription>
        <p className="text-sm">{t("Empresa Demo registra la hora de entrada, pausas y salida de cada jornada para cumplir la obligación legal de registro horario. No se recoge tu ubicación.")}</p>
        <p className="text-sm">{t("Los registros se conservan 4 años y están a disposición tuya, de tus representantes y de la Inspección de Trabajo. Solo tú y el encargado podéis consultarlos.")}</p>
        <p className="text-sm">{t("Puedes pedir a la empresa el acceso a tus datos o la rectificación de un fichaje erróneo (desde «Solicitar corrección»).")}</p>
        <Button disabled={busy} onClick={acceptPrivacy}>{t("Entendido")}</Button>
      </DialogContent></Dialog>
      {editor && (
        <Editor {...editor} me={uid} nombre={nombreDe(editor.uid)} conductor={perfiles.find((p) => p.id === editor.uid)?.conductor ?? false} onClose={() => setEditor(null)}
          onSaved={() => { if (!admin) avisarJefes({ data: { tipo: "correccion" } }).catch(() => undefined); setEditor(null); toast.success(t("Solicitud enviada al encargado")); refresh(); }} />
      )}
    </main>
    </div>
  );
}
