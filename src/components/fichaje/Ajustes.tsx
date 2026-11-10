import { useEffect, useState } from "react";
import { locale, t, tf, useIdioma } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { localInput } from "@/lib/fichaje";
import { dowDe } from "@/lib/jornada";
import { TIPOS_FESTIVO, tipoFestivo, type TipoFestivo } from "@/lib/calendario";
import type { Cfg, CierreEmpresaRow, Festivo, PeriodoRow } from "./data";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const FESTIVO_VACIO = { fecha: "", nombre: "", tipo: "nacional" as TipoFestivo, provisional: false };
const COLOR_TIPO: Record<TipoFestivo, string> = { nacional: "bg-brand", autonomico: "bg-autonomico", local: "bg-local" };
const PERIODO_VACIO = { nombre: "", desde: "", hasta: "", dia_semana: "", hora_entrada: "07:00", hora_salida: "15:00", horas_dia: "" };

type Acceso = { id: number; username: string; ok: boolean; origen: string; ip: string | null; at: string };

/** Ajustes del encargado: horario y convenio, festivos, cierres de la empresa, tablet del almacén y registro de accesos. */
export function Ajustes({ cfg, festivos, cierres, periodos, onSaved }: { cfg: Cfg; festivos: Festivo[]; cierres: CierreEmpresaRow[]; periodos: PeriodoRow[]; onSaved: () => void }) {
  const [c, setC] = useState(cfg);
  const [ips, setIps] = useState(cfg.ip_kiosco.join(", "));
  const [nuevo, setNuevo] = useState(FESTIVO_VACIO);
  const [editando, setEditando] = useState<{ anterior: string } & typeof FESTIVO_VACIO | null>(null);
  const [cierre, setCierre] = useState({ desde: "", hasta: "", nombre: "", puente: false });
  const [calendarioJson, setCalendarioJson] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_VACIO);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmar, setConfirmar] = useState<{ texto: string; accion: () => void; boton?: string; detalle?: string } | null>(null);
  useIdioma();
  useEffect(() => { setC(cfg); setIps(cfg.ip_kiosco.join(", ")); }, [cfg]);
  useEffect(() => {
    supabase.from("accesos").select("*").order("at", { ascending: false }).limit(30).then(({ data }) => setAccesos((data ?? []) as Acceso[]));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (c.hora_salida <= c.hora_entrada) { toast.error(t("La hora de salida debe ser posterior a la de entrada.")); return; }
    setBusy(true);
    const lista = ips.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const { error } = await supabase.rpc("guardar_config", { _horas_semana: c.horas_semana, _horas_anuales: c.horas_anuales, _entrada: c.hora_entrada, _salida: c.hora_salida, _vacaciones: c.dias_vacaciones, _ips: lista, _max_ausentes: c.max_ausentes, _compensar_sabados: c.compensar_sabados ?? false });
    setBusy(false);
    if (error) { toast.error(t("No se pudieron guardar los ajustes.")); return; }
    toast.success(t("Ajustes guardados")); onSaved();
  }
  async function fichajeActivo(activo: boolean) {
    const { error } = await supabase.rpc("activar_fichaje", { _activo: activo });
    if (error) { toast.error(t("No se pudieron guardar los ajustes.")); return; }
    toast.success(activo ? t("Fichaje activado") : t("Fichaje desactivado")); onSaved();
  }
  async function festivo(f: typeof FESTIVO_VACIO, borrar: boolean, anterior?: string) {
    const { error } = await supabase.rpc("guardar_festivo", { _fecha: f.fecha, _nombre: f.nombre, _borrar: borrar, _tipo: f.tipo, _provisional: f.provisional, ...(anterior ? { _fecha_anterior: anterior } : {}) });
    if (error) { toast.error(error.message.includes("Ya hay") ? t("Ya hay un festivo ese día.") : t("No se pudo guardar el festivo.")); return; }
    setNuevo(FESTIVO_VACIO); setEditando(null); onSaved();
  }
  async function cargarCalendario() {
    let datos: unknown;
    try { datos = JSON.parse(calendarioJson); } catch { toast.error(t("El texto no es un JSON válido.")); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("cargar_calendario", { _datos: datos as never });
    setBusy(false);
    if (error) { toast.error(`${t("No se pudo cargar el calendario:")} ${error.message}`); return; }
    const r = data as { anio: number; festivos: number; cierres: number; dias_cierre_laborables: number };
    toast.success(tf("Calendario {a} cargado: {f} festivos y {c} cierres ({d} días laborables de cierre).", { a: r.anio, f: r.festivos, c: r.cierres, d: r.dias_cierre_laborables }));
    setCalendarioJson(""); onSaved();
  }
  async function guardarPeriodo(id: string | null, borrar: boolean, fila?: PeriodoRow) {
    const f = fila ?? { nombre: periodo.nombre, desde: periodo.desde, hasta: periodo.hasta, dia_semana: periodo.dia_semana ? Number(periodo.dia_semana) : null, hora_entrada: periodo.hora_entrada, hora_salida: periodo.hora_salida, horas_dia: periodo.horas_dia ? Number(periodo.horas_dia) : null };
    // Los parámetros de la función aceptan NULL en base de datos; los tipos generados los marcan obligatorios.
    const args = { _id: id, _nombre: f.nombre, _desde: f.desde, _hasta: f.hasta, _dia_semana: f.dia_semana, _entrada: f.hora_entrada, _salida: f.hora_salida, _horas: f.horas_dia, _borrar: borrar } as { _id: string; _nombre: string; _desde: string; _hasta: string; _dia_semana: number; _entrada: string; _salida: string; _horas: number; _borrar: boolean };
    const { error } = await supabase.rpc("guardar_horario_periodo", args);
    if (error) { toast.error(t("No se pudo guardar el horario.")); return; }
    setPeriodo(PERIODO_VACIO); onSaved();
  }
  async function guardarCierre(id: string | null, borrar: boolean) {
    const { error } = await supabase.rpc("guardar_cierre_empresa", { _id: id as string, _desde: cierre.desde, _hasta: cierre.hasta, _nombre: cierre.nombre, _borrar: borrar, _puente: cierre.puente });
    if (error) { toast.error(error.message.includes("exclusion") || error.message.includes("conflict") ? t("Se solapa con otro cierre.") : t("No se pudo guardar el cierre.")); return; }
    setCierre({ desde: "", hasta: "", nombre: "", puente: false }); onSaved();
  }

  const field = "campo px-3 py-2";
  const year = new Date().getFullYear();
  const delAno = festivos.filter((f) => f.fecha >= `${year}-01-01`);
  const anos = [...new Set(delAno.map((f) => f.fecha.slice(0, 4)))].sort();
  const cierresProximos = cierres.filter((k) => k.hasta >= `${year}-01-01`);
  const fechaCorta = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const kiosco = typeof window !== "undefined" ? `${window.location.origin}/?kiosco` : "/?kiosco";
  // Desde noviembre, recordar que el calendario del año siguiente aún está vacío (festivos, cierres, horarios).
  const siguiente = year + 1;
  const faltaCalendario = new Date().getMonth() >= 10 && !festivos.some((f) => f.fecha.startsWith(String(siguiente)));

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card">
      <h2 className="font-display text-2xl font-bold">{t("Ajustes")}</h2>
      <div className={`flex flex-col gap-2 rounded-lg p-4 ${cfg.fichaje_activo ? "bg-go-soft" : "bg-secondary"}`}>
        <b>{cfg.fichaje_activo ? t("Fichaje activado") : t("Fichaje desactivado: la app se usa solo para vacaciones")}</b>
        <p className="text-sm text-muted-foreground">{t("Mientras esté desactivado nadie puede fichar (tampoco en la tablet), los trabajadores solo ven Vacaciones y no se envían recordatorios de fichaje.")}</p>
        <Button variant="outline" className="self-start" onClick={() => setConfirmar({ texto: cfg.fichaje_activo ? t("¿Desactivar el fichaje?") : t("¿Activar el fichaje para toda la plantilla?"), accion: () => void fichajeActivo(!cfg.fichaje_activo), boton: cfg.fichaje_activo ? t("Sí, desactivar") : t("Sí, activar"), detalle: t("Se puede volver a cambiar en cualquier momento.") })}>{cfg.fichaje_activo ? t("Desactivar fichaje") : t("Activar fichaje")}</Button>
      </div>
      <form onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">{t("Horas por semana")}<input type="number" min={1} max={60} step={0.5} className={field} value={c.horas_semana} onChange={(e) => setC({ ...c, horas_semana: Number(e.target.value) })} /></label>
        <label className="text-sm font-medium">{t("Máximo anual")}<input type="number" min={1} className={field} value={c.horas_anuales} onChange={(e) => setC({ ...c, horas_anuales: Number(e.target.value) })} /></label>
        <label className="text-sm font-medium">{t("Hora de entrada")}<input type="time" className={field} value={c.hora_entrada} onChange={(e) => setC({ ...c, hora_entrada: e.target.value })} /></label>
        <label className="text-sm font-medium">{t("Hora de salida")}<input type="time" className={field} value={c.hora_salida} onChange={(e) => setC({ ...c, hora_salida: e.target.value })} /></label>
        <label className="text-sm font-medium">{t("Vacaciones al año (días laborables, cierre incluido)")}<input type="number" min={0} className={field} value={c.dias_vacaciones} onChange={(e) => setC({ ...c, dias_vacaciones: Number(e.target.value) })} /></label>
        <label className="text-sm font-medium">{t("Personal mínimo: avisar si faltan más de")}<input type="number" min={0} className={field} value={c.max_ausentes} onChange={(e) => setC({ ...c, max_ausentes: Number(e.target.value) })} /></label>
        <label className="col-span-2 flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={c.compensar_sabados ?? false} onChange={(e) => setC({ ...c, compensar_sabados: e.target.checked })} />
          <span>{t("Compensar los festivos que caen en sábado con los puentes")}<span className="block font-normal text-muted-foreground">{t("Si se activa, los días de puente se cubren con esos festivos y no restan vacaciones. Desactivado hasta confirmarlo con la gestoría.")}</span></span>
        </label>
        <label className="col-span-2 text-sm font-medium">{t("IP de la oficina para la tablet (vacío = desde cualquier sitio)")}
          <input className={field} value={ips} onChange={(e) => setIps(e.target.value)} placeholder="p. ej. 85.12.34.56" />
        </label>
        <Button disabled={busy} className="col-span-2">{t("Guardar ajustes")}</Button>
      </form>
      <p className="text-sm">{t("Tablet del almacén: abre")} <a className="font-semibold text-brand underline" href={kiosco}>{kiosco}</a> {t("en la tablet y añádela a la pantalla de inicio.")}</p>

      {faltaCalendario && <p className="rounded-xl bg-pause-soft p-3 text-sm text-pause">{tf("El año {n} aún no tiene festivos: añádelos (y los cierres de empresa y horarios especiales) antes de enero para que el horario teórico y los avisos sean correctos.", { n: siguiente })}</p>}
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">{t("Festivos")}</h3>
        {anos.map((a) => (
          <div key={a} className="flex flex-col">
            <h4 className="text-sm font-semibold text-muted-foreground">{a}</h4>
            <ul className="flex flex-col divide-y text-sm">{delAno.filter((f) => f.fecha.startsWith(a)).map((f) => editando?.anterior === f.fecha ? (
              <li key={f.fecha} className="grid grid-cols-2 items-end gap-2 py-2">
                <input type="date" aria-label={t("Fecha del festivo")} className={field} value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
                <input aria-label={t("Nombre del festivo")} className={field} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
                <select aria-label={t("Tipo de festivo")} className={field} value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as TipoFestivo })}>{Object.entries(TIPOS_FESTIVO).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={editando.provisional} onChange={(e) => setEditando({ ...editando, provisional: e.target.checked })} />{t("Pendiente de confirmación oficial")}</label>
                <Button disabled={!editando.fecha || !editando.nombre.trim()} onClick={() => festivo(editando, false, editando.anterior)}>{t("Guardar")}</Button>
                <Button variant="outline" onClick={() => setEditando(null)}>{t("Cancelar")}</Button>
              </li>
            ) : (
              <li key={f.fecha} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="flex flex-col">
                  <span className="num flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-sm ${COLOR_TIPO[tipoFestivo(f.tipo)]}`} />{fechaCorta(f.fecha)} · {f.nombre} <span className="text-muted-foreground">({t(TIPOS_FESTIVO[tipoFestivo(f.tipo)])})</span></span>
                  {f.provisional && <span className="text-xs font-semibold text-pause">{t("Pendiente de confirmación oficial")}</span>}
                  {dowDe(f.fecha) === 6 && c.compensar_sabados && <span className="text-xs text-muted-foreground">{t("Cae en sábado: se compensa con un puente")}</span>}
                </span>
                <span className="flex gap-2">
                  {f.provisional && <Button variant="outline" onClick={() => festivo({ fecha: f.fecha, nombre: f.nombre, tipo: tipoFestivo(f.tipo), provisional: false }, false)}>{t("Confirmar")}</Button>}
                  <Button variant="outline" onClick={() => setEditando({ anterior: f.fecha, fecha: f.fecha, nombre: f.nombre, tipo: tipoFestivo(f.tipo), provisional: f.provisional })}>{t("Editar")}</Button>
                  <Button variant="outline" onClick={() => setConfirmar({ texto: tf("¿Quitar el festivo «{n}»?", { n: f.nombre }), accion: () => void festivo({ fecha: f.fecha, nombre: f.nombre, tipo: tipoFestivo(f.tipo), provisional: f.provisional }, true) })}>{t("Quitar")}</Button>
                </span>
              </li>
            ))}</ul>
          </div>
        ))}
        <div className="grid grid-cols-2 items-end gap-2">
          <input type="date" aria-label={t("Fecha del festivo")} className={field} value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
          <input aria-label={t("Nombre del festivo")} placeholder={t("Nombre")} className={field} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <select aria-label={t("Tipo de festivo")} className={field} value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoFestivo })}>{Object.entries(TIPOS_FESTIVO).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={nuevo.provisional} onChange={(e) => setNuevo({ ...nuevo, provisional: e.target.checked })} />{t("Pendiente de confirmación oficial")}</label>
          <Button className="col-span-2" disabled={!nuevo.fecha || !nuevo.nombre.trim()} onClick={() => festivo(nuevo, false)}>{t("Añadir")}</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">{t("Cargar el calendario de un año")}</h3>
        <p className="text-sm text-muted-foreground">{t("Pega el JSON del calendario laboral (anio, festivos y cierres_empresa). Sustituye los festivos de ese año y los cierres que empiezan ese año, y comprueba los días laborables indicados.")}</p>
        <textarea aria-label={t("Calendario en JSON")} rows={5} className={`${field} font-mono text-xs`} value={calendarioJson} onChange={(e) => setCalendarioJson(e.target.value)} placeholder={'{ "anio": 2028, "festivos": [ { "fecha": "2028-01-01", "nombre": "Año Nuevo", "tipo": "nacional" } ], "cierres_empresa": [] }'} />
        <Button disabled={busy || !calendarioJson.trim()} onClick={() => setConfirmar({ texto: t("¿Cargar este calendario? Sustituye los festivos y cierres de ese año."), accion: () => void cargarCalendario(), boton: t("Sí, cargar") })}>{t("Cargar calendario")}</Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">{t("Horarios especiales")}</h3>
        <p className="text-sm text-muted-foreground">{t("Jornada intensiva de verano, horario de un día concreto… Manda sobre el horario general en esas fechas: cambia la hora de entrada y salida de los avisos y las horas teóricas del día.")}</p>
        <ul className="flex flex-col divide-y text-sm">{periodos.filter((x) => x.hasta >= `${year}-01-01`).map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
            <span><b>{x.nombre}</b> · {x.dia_semana ? t(DIAS[x.dia_semana] ?? "") : t("Laborables")} · <span className="num">{fechaCorta(x.desde)} – {fechaCorta(x.hasta)} · {x.hora_entrada.slice(0, 5)}–{x.hora_salida.slice(0, 5)}{x.horas_dia ? ` · ${Number(x.horas_dia)} h` : ""}</span></span>
            <Button variant="outline" onClick={() => setConfirmar({ texto: tf("¿Quitar el horario «{n}»?", { n: x.nombre }), accion: () => void guardarPeriodo(x.id, true, x) })}>{t("Quitar")}</Button>
          </li>
        ))}</ul>
        <div className="grid grid-cols-2 items-end gap-2">
          <input aria-label={t("Nombre del horario")} placeholder={t("Nombre (p. ej. Intensiva de verano)")} className={`${field} col-span-2`} value={periodo.nombre} onChange={(e) => setPeriodo({ ...periodo, nombre: e.target.value })} />
          <label className="text-sm font-medium">{t("Desde")}<input type="date" className={field} value={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} /></label>
          <label className="text-sm font-medium">{t("Hasta")}<input type="date" className={field} value={periodo.hasta} min={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} /></label>
          <label className="text-sm font-medium">{t("Día")}<select className={field} value={periodo.dia_semana} onChange={(e) => setPeriodo({ ...periodo, dia_semana: e.target.value })}><option value="">{t("Todos los laborables")}</option>{DIAS.map((d, i) => i ? <option key={i} value={i}>{t(d)}</option> : null)}</select></label>
          <label className="text-sm font-medium">{t("Horas del día")}<input type="number" min={1} max={12} step={0.5} placeholder={String(cfg.horas_semana / 5)} className={field} value={periodo.horas_dia} onChange={(e) => setPeriodo({ ...periodo, horas_dia: e.target.value })} /></label>
          <label className="text-sm font-medium">{t("Entrada")}<input type="time" className={field} value={periodo.hora_entrada} onChange={(e) => setPeriodo({ ...periodo, hora_entrada: e.target.value })} /></label>
          <label className="text-sm font-medium">{t("Salida")}<input type="time" className={field} value={periodo.hora_salida} onChange={(e) => setPeriodo({ ...periodo, hora_salida: e.target.value })} /></label>
          <Button className="col-span-2" disabled={!periodo.nombre.trim() || !periodo.desde || !periodo.hasta || periodo.hasta < periodo.desde} onClick={() => guardarPeriodo(null, false)}>{t("Añadir horario")}</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">{t("Cierres de la empresa")}</h3>
        <p className="text-sm text-muted-foreground">{t("Vacaciones colectivas (las tres semanas de agosto, Navidad): cuentan como vacaciones de todos y se descuentan del saldo de cada uno.")}</p>
        <ul className="flex flex-col divide-y text-sm">{cierresProximos.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="num">{fechaCorta(k.desde)} – {fechaCorta(k.hasta)} · {k.nombre}{k.puente ? ` · ${t("puente")}` : ""}</span>
            <Button variant="outline" onClick={() => setConfirmar({ texto: tf("¿Quitar el cierre «{n}»?", { n: k.nombre }), accion: () => void supabase.rpc("guardar_cierre_empresa", { _id: k.id, _desde: k.desde, _hasta: k.hasta, _nombre: k.nombre, _borrar: true, _puente: k.puente }).then(({ error }) => { if (error) toast.error(t("No se pudo quitar el cierre.")); else onSaved(); }) })}>{t("Quitar")}</Button>
          </li>
        ))}</ul>
        <div className="grid grid-cols-2 items-end gap-2">
          <label className="text-sm font-medium">{t("Desde")}<input type="date" className={field} value={cierre.desde} onChange={(e) => setCierre({ ...cierre, desde: e.target.value })} /></label>
          <label className="text-sm font-medium">{t("Hasta")}<input type="date" className={field} value={cierre.hasta} min={cierre.desde} onChange={(e) => setCierre({ ...cierre, hasta: e.target.value })} /></label>
          <input aria-label={t("Nombre del cierre")} placeholder={t("Nombre (p. ej. Vacaciones de agosto)")} className={field} value={cierre.nombre} onChange={(e) => setCierre({ ...cierre, nombre: e.target.value })} />
          <Button disabled={!cierre.desde || !cierre.hasta || cierre.hasta < cierre.desde || !cierre.nombre.trim()} onClick={() => guardarCierre(null, false)}>{t("Añadir cierre")}</Button>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={cierre.puente} onChange={(e) => setCierre({ ...cierre, puente: e.target.checked })} />{t("Es un puente (se puede compensar con un festivo en sábado)")}</label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">{t("Últimos accesos")}</h3>
        <ul className="flex flex-col text-sm">{accesos.map((a) => (
          <li key={a.id} className={`flex justify-between gap-2 ${a.ok ? "" : "text-stop"}`}>
            <span>{a.username} · {a.origen === "kiosco" ? t("tablet") : t("app")}{a.ok ? "" : ` · ${t("PIN incorrecto")}`}</span>
            <span className="num shrink-0 text-muted-foreground">{localInput(a.at).replace("T", " ")}</span>
          </li>
        ))}</ul>
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(open) => !open && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{confirmar?.texto}</AlertDialogTitle>
          <AlertDialogDescription>{confirmar?.detalle ?? t("Esta acción no se puede deshacer.")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmar?.accion(); setConfirmar(null); }}>{confirmar?.boton ?? t("Sí, quitar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
