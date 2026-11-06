// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { marcasDelAno, sabadosApertura } from "@/lib/calendario";
import { Ausencias } from "./Ausencias";
import { VacacionesPlantilla } from "./VacacionesPlantilla";
import type { AusenciaRow, CierreEmpresaRow } from "./data";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-start")>()), useServerFn: () => vi.fn() }));
vi.mock("@/lib/avisos.functions", () => ({ avisarEncargados: vi.fn(), avisarTrabajador: vi.fn() }));

const cierres: CierreEmpresaRow[] = [
  { id: "c1", desde: "2026-08-03", hasta: "2026-08-21", nombre: "Vacaciones de agosto", puente: false },
  { id: "c2", desde: "2026-12-28", hasta: "2026-12-31", nombre: "Cierre de Navidad", puente: false },
];
const festivos = [{ fecha: "2026-08-15", nombre: "Asunción", tipo: "nacional", provisional: false }, { fecha: "2026-12-25", nombre: "Navidad", tipo: "nacional", provisional: false }];
const fila = (x: Partial<AusenciaRow>): AusenciaRow => ({
  id: "a1", user_id: "u1", tipo: "vacaciones", desde: "2026-03-02", hasta: "2026-03-03", estado: "aprobada", motivo: null,
  solicitada_por: "u1", solicitada_at: "2026-02-01T10:00:00Z", decidida_por: null, decidida_at: null, motivo_decision: null, anulada_por: null, anulada_at: null, ...x,
});
const cfg = { horas_semana: 40, horas_anuales: 1780, hora_entrada: "08:00", hora_salida: "17:00", dias_vacaciones: 22, ip_kiosco: [], max_ausentes: 2, periodos: [], fichaje_activo: false };

describe("calendario anual", () => {
  it("marca festivos, cierres y vacaciones sin pisar lo más fijo", () => {
    const m = marcasDelAno(2026, festivos, cierres, [
      { tipo: "vacaciones", desde: "2026-08-20", hasta: "2026-08-25", estado: "aprobada" },
      { tipo: "vacaciones", desde: "2026-09-01", hasta: "2026-09-01", estado: "pendiente" },
      { tipo: "baja", desde: "2026-10-05", hasta: "2026-10-06", estado: "aprobada" },
    ]);
    expect(m.get("2026-08-15")).toBe("nacional");
    expect(m.get("2026-08-20")).toBe("cierre");
    expect(m.get("2026-08-24")).toBe("vacaciones");
    expect(m.get("2026-09-01")).toBe("pendiente");
    expect(m.get("2026-10-05")).toBe("ausencia");
    expect(m.has("2026-10-07")).toBe(false);
  });
  it("distingue festivos nacionales, autonómicos y locales", () => {
    const m = marcasDelAno(2027, [
      { fecha: "2027-01-06", tipo: "nacional" }, { fecha: "2027-09-11", tipo: "autonomico" }, { fecha: "2027-09-06", tipo: "local", provisional: true },
    ], [{ desde: "2027-12-07", hasta: "2027-12-07", nombre: "Puente de diciembre", puente: true }], []);
    expect(m.get("2027-01-06")).toBe("nacional");
    expect(m.get("2027-09-11")).toBe("autonomico");
    expect(m.get("2027-09-06")).toBe("local");
    expect(m.get("2027-12-07")).toBe("cierre");
  });
});

describe("sábados de apertura", () => {
  it("marca los sábados del horario de sábado salvo festivos, cierres y los excluidos", () => {
    const sab = (desde: string, hasta: string) => ({ nombre: "Sábados", desde, hasta, dia_semana: 6, hora_entrada: "08:00", hora_salida: "13:00", horas_dia: 5 });
    const m = sabadosApertura(2027, [sab("2027-01-03", "2027-03-26"), sab("2027-03-28", "2027-12-31")], new Set(["2027-05-01", "2027-09-11", "2027-12-25"]), [{ desde: "2027-08-09", hasta: "2027-08-27", nombre: "Verano" }]);
    expect(m.has("2027-01-02")).toBe(false);
    expect(m.has("2027-01-09")).toBe(true);
    expect(m.has("2027-03-27")).toBe(false);
    expect(m.has("2027-05-01")).toBe(false);
    expect(m.has("2027-08-14")).toBe(false);
    expect(m.has("2027-01-10")).toBe(false); // domingo
    expect(m.size).toBe(52 - 2 - 3 - 2); // 52 sábados menos 2 excluidos, 3 festivos y 2 de cierre
  });
});

describe("pestaña de vacaciones", () => {
  it("muestra el saldo del trabajador con el cierre de empresa descontado", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00+01:00"), toFake: ["Date"] });
    render(<Ausencias uid="u1" admin={false} perfiles={[{ id: "u1", username: "ana", nombre: "Ana Demo", activo: true, debe_cambiar_pin: false, conductor: false, inspector: false }]}
      cfg={cfg} festivos={festivos} cierres={cierres} ausencias={[fila({})]} onSaved={() => {}} />);
    vi.useRealTimers();
    expect(screen.getByText("Vacaciones 2026")).toBeInTheDocument();
    expect(screen.getByText("cierre empresa").previousSibling).toHaveTextContent("19");
    expect(screen.getByText("a elegir").previousSibling).toHaveTextContent("1"); // 22 - 19 - 2 aprobados
    expect(screen.getByRole("button", { name: /Pedir/ })).toHaveTextContent("Pedir 1 día laborable");
    expect(screen.getByText(/Las vacaciones se piden desde aquí/)).toBeInTheDocument();
  });
});

describe("vacaciones de la plantilla (encargado)", () => {
  const perfil = (id: string, nombre: string, extra = {}) => ({ id, username: id, nombre, activo: true, debe_cambiar_pin: false, conductor: false, inspector: false, ...extra });
  const perfiles = [perfil("u1", "Ana Demo"), perfil("u2", "Berta Demo"), perfil("u3", "Carles Demo"), perfil("i1", "Inspección", { inspector: true }), perfil("u4", "Baja", { activo: false })];
  const aus = [
    fila({ id: "a1", user_id: "u1", desde: "2026-03-02", hasta: "2026-03-04" }),
    fila({ id: "a2", user_id: "u2", desde: "2026-03-03", hasta: "2026-03-03" }),
    fila({ id: "a3", user_id: "u3", tipo: "baja", desde: "2026-03-03", hasta: "2026-03-05" }),
    fila({ id: "a4", user_id: "u2", desde: "2026-11-02", hasta: "2026-11-03", estado: "pendiente" }),
  ];
  it("muestra a toda la plantilla activa con su saldo y quién falta cada día", () => {
    render(<VacacionesPlantilla year={2026} hoy="2026-03-10" perfiles={perfiles} cfg={cfg} festivos={festivos} cierres={cierres} ausencias={aus} onVer={() => {}} />);
    expect(screen.getByText("Vacaciones de la plantilla 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "marzo" })).toBeInTheDocument();
    const filas = screen.getAllByRole("row").map((r) => r.querySelector("th")?.textContent);
    expect(filas).toEqual(["Trabajador", "Ana Demo", "Berta Demo", "Carles Demo", "Ausentes"]); // sin inspección ni inactivos
    const ausentes = screen.getAllByRole("row").at(-1)!.querySelectorAll("td");
    expect(ausentes[2]).toHaveTextContent("3"); // 3 de marzo: Ana Demo, Berta Demo y Carles Demo (baja)
    expect(ausentes[2]).toHaveClass("text-stop"); // más del máximo (2)
    const berta = screen.getAllByText("Berta Demo").find((x) => x.closest("summary"))!.closest("summary")!;
    // Libres: 22 - 19 de cierre - 1 disfrutado - 2 pendientes = 0
    expect(berta).toHaveTextContent("19 cierre · 1 disfrutados · 0 programados · 2 pendientes");
    expect(berta).toHaveTextContent(/0\s*libres/);
    // Horas laborables de marzo 2026 (L-V 8 h): 22 laborables; Ana Demo tiene 3 de vacaciones -> 19 días = 152 h.
    expect(screen.getByRole("heading", { name: "Horas laborables" })).toBeInTheDocument();
    const ana = screen.getAllByText("Ana Demo").find((x) => x.closest(".grid") && !x.closest("summary"))!.parentElement!;
    expect(ana).toHaveTextContent("152 h");
  });
});

describe("idioma", () => {
  it("en catalán traduce lo que hay en el diccionario y deja en castellano lo demás", async () => {
    const { setIdioma, t } = await import("@/lib/i18n");
    setIdioma("ca");
    expect(t("Vacaciones")).toBe("Vacances");
    expect(t("No ha fichado la entrada (horario: 07:00).")).toBe("No ha fitxat l'entrada (horari: 07:00).");
    expect(t("Texto sin traducir")).toBe("Texto sin traducir");
    render(<Ausencias uid="u1" admin={false} perfiles={[{ id: "u1", username: "ana", nombre: "Ana Demo", activo: true, debe_cambiar_pin: false, conductor: false, inspector: false }]}
      cfg={cfg} festivos={festivos} cierres={cierres} ausencias={[]} onSaved={() => {}} />);
    expect(screen.getByText(/^Vacances \d{4}$/)).toBeInTheDocument();
    setIdioma("es");
  });
});
