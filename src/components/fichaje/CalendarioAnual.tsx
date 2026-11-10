import { diasDelMes, dowDe, type Ausencia, type Cierre, type Periodo } from "@/lib/jornada";
import { t, useIdioma } from "@/lib/i18n";
import { ESTILO_MARCA as ESTILO, marcasDelAno, NOMBRE_MARCA as NOMBRE, notasFestivo, PROVISIONAL, SABADO_APERTURA, sabadosApertura, type FestivoCal, type Marca } from "@/lib/calendario";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LEYENDA: Marca[] = ["nacional", "autonomico", "local", "cierre", "vacaciones", "pendiente", "ausencia"];
/** Forma además del color (para quien no distingue el rojo del verde): días de la empresa cuadrados, los del trabajador redondos. */
const FORMA: Record<Marca, string> = { nacional: "rounded-sm", autonomico: "rounded-sm", local: "rounded-sm", cierre: "rounded-sm", vacaciones: "rounded-full", pendiente: "rounded-full", ausencia: "rounded-full" };

/**
 * Los doce meses del año de un vistazo: festivos (nacional, autonómico y local, con los locales provisionales
 * resaltados), cierre de la empresa y vacaciones del trabajador. Los festivos en sábado llevan un punto: posible compensación.
 */
export function CalendarioAnual({ year, festivos, cierres, ausencias, hoy, periodos = [] }: { year: number; festivos: FestivoCal[]; cierres: Cierre[]; ausencias: Ausencia[]; hoy: string; periodos?: Periodo[] }) {
  const marcas = marcasDelAno(year, festivos, cierres, ausencias);
  const porFecha = new Map(festivos.map((f) => [f.fecha, f]));
  const delAno = festivos.filter((f) => f.fecha.startsWith(String(year)));
  const hayProvisional = delAno.some((f) => f.provisional);
  const haySabado = delAno.some((f) => dowDe(f.fecha) === 6);
  const apertura = sabadosApertura(year, periodos, new Set(festivos.map((f) => f.fecha)), cierres);
  useIdioma();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
        {MESES.map((nombre, i) => {
          const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
          const dias = diasDelMes(ym);
          const hueco = (dowDe(dias[0] ?? `${ym}-01`) + 6) % 7;
          return (
            <section key={ym} aria-label={`${t(nombre)} ${year}`}>
              <h4 className="mb-1 text-sm font-semibold capitalize">{t(nombre)}</h4>
              <div className="grid grid-cols-7 gap-px text-center text-[11px] leading-none">
                {["L", "M", "X", "J", "V", "S", "D"].map((d, j) => <span key={d + j} className="pb-1 text-muted-foreground">{t(d).slice(-1).toUpperCase()}</span>)}
                {Array.from({ length: hueco }, (_, j) => <span key={"h" + j} />)}
                {dias.map((d) => {
                  const marca = marcas.get(d);
                  const fest = porFecha.get(d);
                  const finde = dowDe(d) === 0 || dowDe(d) === 6;
                  const sab = !marca ? apertura.get(d) : undefined;
                  const titulo = [d, fest?.nombre, marca ? t(NOMBRE[marca]) : "", sab ? `${t("Sábado de apertura")} ${sab.hora_entrada.slice(0, 5)}–${sab.hora_salida.slice(0, 5)}` : "", ...(fest ? notasFestivo(fest).map(t) : [])].filter(Boolean).join(" · ");
                  return (
                    <span key={d} title={titulo}
                      className={`num relative flex aspect-square items-center justify-center ${marca ? `${ESTILO[marca]} ${FORMA[marca]}` : `rounded-md ${sab ? SABADO_APERTURA : finde ? "text-muted-foreground" : ""}`} ${fest?.provisional ? PROVISIONAL : ""} ${d === hoy ? "font-bold underline underline-offset-2" : ""}`}>
                      <span aria-hidden>{Number(d.slice(-2))}</span>
                      {/* El title no se ve en el móvil ni lo leen bien los lectores de pantalla: el mismo texto, oculto. */}
                      <span className="sr-only">{titulo}</span>
                      {fest && dowDe(d) === 6 && <i aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-on-signal" />}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEYENDA.map((k) => <li key={k} className="flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 ${ESTILO[k]} ${FORMA[k]}`} />{t(NOMBRE[k])}</li>)}
        {apertura.size > 0 && <li className="flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 rounded-sm ${SABADO_APERTURA}`} />{t("Sábado de apertura")}</li>}
        {hayProvisional && <li className="flex items-center gap-1.5"><i aria-hidden className={`inline-block h-3 w-3 rounded-sm ${PROVISIONAL}`} />{t("Local pendiente de confirmación oficial")}</li>}
        {haySabado && <li className="flex items-center gap-1.5"><i aria-hidden className="relative inline-block h-3 w-3 rounded-sm bg-brand"><i className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-on-signal" /></i>{t("Festivo en sábado: posible compensación")}</li>}
      </ul>
    </div>
  );
}
