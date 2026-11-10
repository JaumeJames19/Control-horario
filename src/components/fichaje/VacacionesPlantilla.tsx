import { useState } from "react";
import { locale, t, tf, useIdioma } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cupoVacaciones, desgloseVacaciones, diasDelMes, diasEntre, diasVacacionesSolicitud, dowDe } from "@/lib/jornada";
import { ESTILO_MARCA, horasLaborables, marcasDelAno, NOMBRE_MARCA, SABADO_APERTURA, sabadosApertura, type Marca } from "@/lib/calendario";
import type { AjusteRow, AusenciaRow, Cfg, CierreEmpresaRow, Festivo, Perfil } from "./data";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LETRA = ["D", "L", "M", "X", "J", "V", "S"];
const TIPOS: Record<string, string> = { vacaciones: "Vacaciones", permiso: "Permiso retribuido", baja: "Baja médica", otra: "Otra ausencia" };
const ESTADOS: Record<string, string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", anulada: "Anulada" };
const LEYENDA: Marca[] = ["nacional", "autonomico", "local", "cierre", "vacaciones", "pendiente", "ausencia"];
const fecha = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short" });

/**
 * Panel del encargado: las vacaciones y ausencias de toda la plantilla. Un cuadrante del mes (quién falta cada día,
 * con aviso si se supera el máximo de ausentes) y el saldo del año de cada trabajador con sus tramos pedidos.
 */
export function VacacionesPlantilla({ year, hoy, perfiles, cfg, festivos, cierres, ausencias, ajustes = [], onVer, onSaved = () => {} }: {
  year: number; hoy: string; perfiles: Perfil[]; cfg: Cfg; festivos: Festivo[]; cierres: CierreEmpresaRow[]; ausencias: AusenciaRow[]; ajustes?: AjusteRow[]; onVer: (id: string) => void; onSaved?: () => void;
}) {
  const [nuevo, setNuevo] = useState<Record<string, { dias: string; motivo: string }>>({});
  const [busy, setBusy] = useState(false);
  const [mes, setMes] = useState(hoy.startsWith(String(year)) ? Number(hoy.slice(5, 7)) - 1 : 0);
  useIdioma();
  const festSet = new Set(festivos.map((f) => f.fecha));
  const plantilla = perfiles.filter((p) => p.activo && !p.inspector).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const suyas = (id: string) => ausencias.filter((a) => a.user_id === id);
  const marcas = new Map(plantilla.map((p) => [p.id, marcasDelAno(year, festivos, cierres, suyas(p.id))]));
  const apertura = sabadosApertura(year, cfg.periodos, festSet, cierres);
  const ym = `${year}-${String(mes + 1).padStart(2, "0")}`;
  const dias = diasDelMes(ym);
  // Ausentes por día: solo vacaciones y permisos aprobados (festivos y cierres no cuentan: no se trabaja).
  const ausentes = (d: string) => plantilla.filter((p) => { const m = marcas.get(p.id)?.get(d); return m === "vacaciones" || m === "ausencia"; }).length;

  async function ajuste(uid: string, borrar: boolean, id?: string) {
    const n = nuevo[uid] ?? { dias: "", motivo: "" };
    setBusy(true);
    const { error } = await supabase.rpc("guardar_ajuste_vacaciones", { _id: (id ?? null) as string, _uid: uid, _anio: year, _dias: Number(n.dias) || 0, _motivo: n.motivo, _borrar: borrar });
    setBusy(false);
    if (error) { toast.error(t("No se pudo guardar.")); return; }
    setNuevo({ ...nuevo, [uid]: { dias: "", motivo: "" } }); onSaved();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card">
      <h2 className="font-display text-2xl font-bold">{t("Vacaciones de la plantilla")} {year}</h2>

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl font-bold capitalize">{t(MESES[mes] ?? "")}</h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label={t("Mes anterior")} disabled={mes === 0} onClick={() => setMes(mes - 1)}>‹</Button>
          <Button variant="outline" size="sm" aria-label={t("Mes siguiente")} disabled={mes === 11} onClick={() => setMes(mes + 1)}>›</Button>
        </div>
      </div>
      {plantilla.length ? (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-px text-center text-[11px] leading-none">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-card pr-2 text-left font-semibold">{t("Trabajador")}</th>
                {dias.map((d) => (
                  <th key={d} scope="col" className={`num w-6 min-w-6 pb-1 font-normal ${dowDe(d) === 0 || dowDe(d) === 6 ? "text-muted-foreground" : "text-muted-foreground"} ${d === hoy ? "font-bold text-foreground" : ""}`}>
                    <span className="block">{t(LETRA[dowDe(d)] ?? "").slice(-1).toUpperCase()}</span>{Number(d.slice(-2))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plantilla.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 max-w-32 truncate bg-card pr-2 text-left text-xs font-medium">{p.nombre}</th>
                  {dias.map((d) => {
                    const m = marcas.get(p.id)?.get(d);
                    const finde = dowDe(d) === 0 || dowDe(d) === 6;
                    return <td key={d} title={`${p.nombre} · ${fecha(d)}${m ? ` · ${t(NOMBRE_MARCA[m])}` : ""}`}
                      className={`h-6 w-6 rounded ${m ? ESTILO_MARCA[m] : apertura.has(d) ? `bg-secondary/40 ${SABADO_APERTURA}` : finde ? "bg-muted/60" : "bg-secondary/40"}`} />;
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-card pr-2 pt-1 text-left text-xs font-semibold">{t("Ausentes")}</th>
                {dias.map((d) => {
                  const n = ausentes(d);
                  return <td key={d} className={`num pt-1 ${n > cfg.max_ausentes ? "font-bold text-stop" : "text-muted-foreground"}`}>{n || ""}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">{t("No hay trabajadores activos.")}</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEYENDA.map((k) => <li key={k} className="flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 rounded-sm ${ESTILO_MARCA[k]}`} />{t(NOMBRE_MARCA[k])}</li>)}
        {apertura.size > 0 && <li className="flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 rounded-sm ${SABADO_APERTURA}`} />{t("Sábado de apertura")}</li>}
        <li className="flex items-center gap-1.5"><b className="text-stop">n</b>{tf("más de {n} ausentes", { n: cfg.max_ausentes })}</li>
      </ul>

      <HorasPlantilla year={year} mes={mes} plantilla={plantilla} cfg={cfg} festSet={festSet} cierres={cierres} suyas={suyas} />

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-bold">{t("Saldo de cada trabajador")}</h3>
        <p className="text-sm text-muted-foreground">{t("Días laborables de vacaciones. Disfrutados: aprobados hasta hoy; programados: aprobados a partir de mañana.")}</p>
        {plantilla.map((p) => {
          const aus = suyas(p.id);
          const s = desgloseVacaciones(year, cupoVacaciones(cfg.dias_vacaciones, ajustes, p.id, year), aus, cierres, festSet, cfg.compensar_sabados ?? false, hoy);
          const tramos = aus.filter((a) => a.estado !== "anulada" && a.desde <= `${year}-12-31` && a.hasta >= `${year}-01-01`).sort((a, b) => a.desde.localeCompare(b.desde));
          return (
            <details key={p.id} className="group border-b py-1.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium"><span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>{p.nombre}</span>
                  <span className="num text-xs text-muted-foreground">{s.empresa} {t("cierre")} · {s.disfrutados} {t("disfrutados")} · {s.programados} {t("programados")} · {s.pendientes} {t("pendientes")}</span>
                </span>
                <span className={`flex shrink-0 flex-col items-end rounded-xl px-2.5 py-1 ${s.disponibles < 0 ? "bg-stop-soft text-stop" : "bg-go-soft text-go"}`}>
                  <b className="num font-display text-2xl leading-none">{s.disponibles}</b><span className="text-[11px]">{t("libres")}</span>
                </span>
              </summary>
              <div className="flex flex-col gap-1 pt-2 pl-4 text-sm">
                {tramos.length ? (
                  <ul className="flex flex-col gap-0.5">{tramos.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{t(TIPOS[a.tipo] ?? a.tipo)} · <span className="num">{fecha(a.desde)} – {fecha(a.hasta)}</span> <small className="text-muted-foreground">({a.tipo === "vacaciones" ? `${diasVacacionesSolicitud(a.desde, a.hasta, festSet, cierres)} ${t("laborables")}` : `${diasEntre(a.desde, a.hasta).length} ${t("días")}`})</small></span>
                      <span className={`shrink-0 ${a.estado === "aprobada" ? "text-go" : a.estado === "rechazada" ? "text-stop" : "text-muted-foreground"}`}>{t(ESTADOS[a.estado] ?? a.estado)}</span>
                    </li>
                  ))}</ul>
                ) : <p className="text-muted-foreground">{t("No ha pedido vacaciones ni ausencias este año.")}</p>}
                <div className="flex flex-col gap-1 border-t pt-2">
                  <b className="text-xs">{tf("Días de otros años en {a}", { a: year })} <span className="font-normal text-muted-foreground">{tf("(cupo: {n} días)", { n: s.total })}</span></b>
                  {ajustes.filter((x) => x.user_id === p.id && x.anio === year).map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-2">
                      <span><b className="num">{x.dias > 0 ? `+${x.dias}` : x.dias}</b> · {x.motivo}</span>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void ajuste(p.id, true, x.id)}>{t("Quitar")}</Button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
                    <input type="number" min={-60} max={60} aria-label={t("Días")} placeholder="+4" className="campo px-2 py-1.5" value={nuevo[p.id]?.dias ?? ""} onChange={(e) => setNuevo({ ...nuevo, [p.id]: { dias: e.target.value, motivo: nuevo[p.id]?.motivo ?? "" } })} />
                    <input aria-label={t("Motivo")} placeholder={t("p. ej. Pendientes del año anterior")} className="campo px-2 py-1.5" value={nuevo[p.id]?.motivo ?? ""} onChange={(e) => setNuevo({ ...nuevo, [p.id]: { dias: nuevo[p.id]?.dias ?? "", motivo: e.target.value } })} />
                    <Button size="sm" disabled={busy || !Number(nuevo[p.id]?.dias) || !nuevo[p.id]?.motivo.trim()} onClick={() => void ajuste(p.id, false)}>{t("Añadir")}</Button>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="self-start" onClick={() => onVer(p.id)}>{t("Ver su calendario")}</Button>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

const h1 = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });

/**
 * Horas laborables según el calendario y el horario: las de apertura de la empresa (lunes a viernes y sábados) y,
 * por trabajador, las de lunes a viernes descontando sus vacaciones y ausencias. Los sábados van por turnos y aún no
 * se asignan por trabajador, así que solo cuentan en el total de la empresa.
 */
function HorasPlantilla({ year, mes, plantilla, cfg, festSet, cierres, suyas }: {
  year: number; mes: number; plantilla: Perfil[]; cfg: Cfg; festSet: Set<string>; cierres: CierreEmpresaRow[]; suyas: (id: string) => AusenciaRow[];
}) {
  const ym = `${year}-${String(mes + 1).padStart(2, "0")}`;
  const finMes = diasDelMes(ym).at(-1) ?? `${ym}-28`;
  const rango = { ano: [`${year}-01-01`, `${year}-12-31`], mes: [`${ym}-01`, finMes] } as const;
  const empresa = (k: keyof typeof rango) => horasLaborables(rango[k][0], rango[k][1], cfg, festSet, cierres);
  const ano = empresa("ano"), delMes = empresa("mes");
  const fila = (titulo: string, r: ReturnType<typeof empresa>) => (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
      <b className="col-span-2">{titulo}</b>
      <span>{tf("Lunes a viernes: {d} días", { d: r.dias })}</span><span className="num text-right">{h1(r.horas)} h</span>
      <span>{tf("Sábados de apertura: {s}", { s: r.sabados })}</span><span className="num text-right">{h1(r.horasSabado)} h</span>
      <span className="font-semibold">{t("Total de apertura")}</span><span className="num text-right font-semibold">{h1(r.horas + r.horasSabado)} h</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-xl font-bold">{t("Horas laborables")}</h3>
      <div className="grid gap-3 rounded-lg bg-secondary p-3 sm:grid-cols-2">
        {fila(`${t(MESES[mes] ?? "")} ${year}`, delMes)}
        {fila(tf("Año {a}", { a: year }), ano)}
      </div>
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_4.5rem_5rem] gap-x-2 border-b pb-1 text-right text-[11px] text-muted-foreground">
          <span className="text-left">{t("Lunes a viernes, sin sus vacaciones ni ausencias")}</span><span className="capitalize">{t(MESES[mes] ?? "")}</span><span>{year}</span>
        </div>
        {plantilla.map((p) => {
          const m = horasLaborables(rango.mes[0], rango.mes[1], cfg, festSet, cierres, suyas(p.id));
          const a = horasLaborables(rango.ano[0], rango.ano[1], cfg, festSet, cierres, suyas(p.id));
          const exceso = a.horas > cfg.horas_anuales;
          return (
            <div key={p.id} className="grid grid-cols-[1fr_4.5rem_5rem] items-center gap-x-2 border-b py-1 text-right text-sm">
              <span className="truncate text-left">{p.nombre}</span>
              <span className="num">{h1(m.horas)} h</span>
              <span className={`num ${exceso ? "font-semibold text-stop" : ""}`}>{exceso && <span aria-hidden>⚠ </span>}{h1(a.horas)} h{exceso && <span className="sr-only"> ({t("supera el máximo anual")})</span>}</span>
            </div>
          );
        })}
      </div>
      {plantilla.some((p) => horasLaborables(rango.ano[0], rango.ano[1], cfg, festSet, cierres, suyas(p.id)).horas > cfg.horas_anuales) && (
        <p className="rounded-xl bg-stop-soft p-2 text-sm text-stop">{tf("En rojo y con ⚠, quien supera el máximo anual del convenio ({n} h). El horario de apertura no puede ser la jornada de cada trabajador: habrá que repartirlo por turnos.", { n: h1(cfg.horas_anuales) })}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("Los sábados van por turnos: cuentan en el total de la empresa, pero aún no en las horas de cada trabajador.")}</p>
    </div>
  );
}
