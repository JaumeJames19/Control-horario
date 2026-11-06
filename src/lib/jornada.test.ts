import { describe, it, expect } from "vitest";
import { compute, pausaConvenio } from "./fichaje";
import { resumenMes, avisos, saldoVacaciones, cupoVacaciones, desgloseVacaciones, sabadosFestivos, puentesCompensados, diasVacacionesSolicitud, cierresComoAusencias, horarioDe, descansos, excesoAusentes, type Config, type FilaDia } from "./jornada";

const H = 3600000, M = 60000;
const cfg: Config = { horas_semana: 40, horas_anuales: 1780, hora_entrada: "08:00", hora_salida: "17:00", dias_vacaciones: 30 };
// Madrid en noviembre de 2026 = UTC+1
const at = (dia: string, hm: string) => new Date(`${dia}T${hm}:00+01:00`).toISOString();
const jornada = (dia: string, a: string, b: string, pausa?: [string, string]): FilaDia[] => [
  { dia, tipo: "entrada", at: at(dia, a) },
  ...(pausa ? [{ dia, tipo: "pausa" as const, at: at(dia, pausa[0]) }, { dia, tipo: "reanudar" as const, at: at(dia, pausa[1]) }] : []),
  { dia, tipo: "salida", at: at(dia, b) },
];

describe("convenio y nómina", () => {
  it("pausa pagada: 20 min si más de 5 h, 10 min si menos", () => {
    expect(pausaConvenio(6 * H)).toBe(20 * M);
    expect(pausaConvenio(4 * H)).toBe(10 * M);
    const corta = compute([{ tipo: "entrada", at: 0 }, { tipo: "pausa", at: 2 * H }, { tipo: "reanudar", at: 2 * H + 5 * M }, { tipo: "salida", at: 4 * H }]);
    expect(corta.worked).toBe(3 * H + 55 * M + 5 * M); // solo se paga la pausa realmente hecha
  });
  it("la comida (pausa de más de 30 min) no se paga", () => {
    const c = compute([{ tipo: "entrada", at: 0 }, { tipo: "pausa", at: 4 * H }, { tipo: "reanudar", at: 5 * H }, { tipo: "salida", at: 9 * H }]);
    expect(c.worked).toBe(8 * H);
  });
  it("la espera del conductor no es trabajo efectivo", () => {
    const c = compute([{ tipo: "entrada", at: 0 }, { tipo: "espera", at: 2 * H }, { tipo: "reanudar", at: 3 * H }, { tipo: "salida", at: 5 * H }]);
    expect(c.efectivo).toBe(4 * H);
    expect(c.presencia).toBe(1 * H);
  });
  it("semana de 5 x 8 h (bocadillo de 20 min incluido): sin horas extra", () => {
    const filas = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].flatMap((d) => jornada(d, "08:00", "16:00", ["12:00", "12:20"]));
    const r = resumenMes("2026-11", filas, cfg, new Set(), []);
    expect(r.extra75 + r.extra150).toBe(0);
  });
  it("2 h de más el viernes = extra al 75 %; sábado por la tarde = 150 %", () => {
    const filas = [
      ...["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap((d) => jornada(d, "08:00", "16:00")),
      ...jornada("2026-11-06", "08:00", "18:00"),
      ...jornada("2026-11-07", "15:00", "17:00"),
    ];
    const r = resumenMes("2026-11", filas, cfg, new Set(), []);
    // 4 x 8 h + 10 h + 2 h = 44 h (sin pausas, sin crédito) frente a 40 h teóricas
    expect(r.extra150).toBe(2 * H);
    expect(r.extra75).toBe(2 * H);
  });
  it("un festivo reduce el horario teórico de la semana", () => {
    const filas = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap((d) => jornada(d, "08:00", "16:00"));
    const r = resumenMes("2026-11", filas, cfg, new Set(["2026-11-06"]), []);
    expect(r.extra75 + r.extra150).toBe(0); // 32 h trabajadas = 32 h teóricas
  });
  it("avisa del olvido de entrada en día laborable", () => {
    const now = new Date("2026-11-02T09:00:00+01:00").getTime();
    expect(avisos(now, [], cfg, new Set(), []).length).toBe(1);
    expect(avisos(now, [], cfg, new Set(["2026-11-02"]), []).length).toBe(0);
  });
});

describe("vacaciones y cierres de empresa", () => {
  // Calendario 2026 de la empresa: cierre 3–21 de agosto y 28–31 de diciembre; 22 días laborables al año.
  const cierres = [
    { desde: "2026-08-03", hasta: "2026-08-21", nombre: "Vacaciones de agosto" },
    { desde: "2026-12-28", hasta: "2026-12-31", nombre: "Cierre de Navidad" },
  ];
  const festivos = new Set(["2026-08-15", "2026-12-25", "2026-12-08", "2026-01-01"]);

  it("el cierre de empresa consume 19 días laborables y quedan 3 a elegir", () => {
    const s = saldoVacaciones(2026, 22, [], cierres, festivos);
    expect(s.empresa).toBe(19);
    expect(s.disponibles).toBe(3);
  });
  it("las solicitudes cuentan solo laborables, sin festivos ni fines de semana, y por estado", () => {
    const aus = [
      { tipo: "vacaciones", desde: "2026-12-04", hasta: "2026-12-09", estado: "aprobada" }, // vie 4, lun 7, (mar 8 festivo), mié 9 = 3
      { tipo: "vacaciones", desde: "2026-03-02", hasta: "2026-03-02", estado: "pendiente" },
      { tipo: "vacaciones", desde: "2026-03-09", hasta: "2026-03-10", estado: "rechazada" },
      { tipo: "permiso", desde: "2026-03-16", hasta: "2026-03-16", estado: "aprobada" },
    ];
    const s = saldoVacaciones(2026, 22, aus, cierres, festivos);
    expect(s.aprobadas).toBe(3);
    expect(s.pendientes).toBe(1);
    expect(s.disponibles).toBe(22 - 19 - 3 - 1);
  });
  it("una solicitud que pisa un cierre no cuenta dos veces esos días", () => {
    const aus = [{ tipo: "vacaciones", desde: "2026-08-20", hasta: "2026-08-25", estado: "aprobada" }]; // 20-21 cierre; 24, 25 = 2
    expect(saldoVacaciones(2026, 22, aus, cierres, festivos).aprobadas).toBe(2);
    expect(diasVacacionesSolicitud("2026-08-20", "2026-08-25", festivos, cierres)).toBe(2);
  });
  it("solo cuenta los días del año consultado", () => {
    const aus = [{ tipo: "vacaciones", desde: "2026-12-30", hasta: "2027-01-05", estado: "aprobada" }];
    // 2026: 30 y 31 son cierre (no cuentan); 2027: vie 1 (festivo), lun 4, mar 5 = 2
    expect(saldoVacaciones(2026, 22, aus, cierres, festivos).aprobadas).toBe(0);
    expect(saldoVacaciones(2027, 22, aus, cierres, new Set(["2027-01-01"])).aprobadas).toBe(2);
  });
  it("durante el cierre no hay horario teórico ni avisos, y cuenta como vacaciones para la gestoría", () => {
    const aus = cierresComoAusencias(cierres);
    const r = resumenMes("2026-08", [], cfg, festivos, aus);
    expect(r.teorico).toBe(6 * 8 * H); // agosto 2026: 21 laborables, 15 de cierre
    expect(r.vacaciones).toBe(19); // días naturales del 3 al 21
    expect(r.vacacionesLaborables).toBe(15); // tres semanas completas de lunes a viernes
    const now = new Date("2026-08-05T09:00:00+02:00").getTime();
    expect(avisos(now, [], cfg, festivos, aus).length).toBe(0);
  });
});

describe("horarios por periodo", () => {
  const periodos = [{ nombre: "Verano viernes", desde: "2026-06-01", hasta: "2026-09-30", dia_semana: 5, hora_entrada: "07:00", hora_salida: "15:00", horas_dia: 8 }];
  const c = { ...cfg, periodos };
  it("un viernes de verano entra a las 7, sale a las 15 y el teórico sigue siendo 8 h", () => {
    const h = horarioDe("2026-07-03", c);
    expect(h.entrada).toBe("07:00");
    expect(h.salida).toBe("15:00");
    expect(h.horas).toBe(8 * H);
    expect(horarioDe("2026-07-02", c).entrada).toBe("08:00"); // jueves: horario general
    expect(horarioDe("2026-10-02", c).entrada).toBe("08:00"); // viernes fuera del periodo
  });
  it("un periodo general con menos horas reduce el teórico", () => {
    const c2 = { ...cfg, periodos: [{ nombre: "Intensiva", desde: "2026-07-01", hasta: "2026-07-31", dia_semana: null, hora_entrada: "07:00", hora_salida: "14:00", horas_dia: 7 }] };
    expect(resumenMes("2026-07", [], c2, new Set(), []).teorico).toBe(23 * 7 * H); // julio 2026: 23 laborables
  });
  it("los avisos de olvido usan el horario del periodo", () => {
    const now = new Date("2026-07-03T08:15:00+02:00").getTime(); // viernes de verano, 7:00 + 1 h 15
    expect(avisos(now, [], c, new Set(), [])).toHaveLength(1);
    expect(avisos(now, [], cfg, new Set(), [])).toHaveLength(0); // horario general: aún no son las 8:30
  });
});

describe("descansos legales", () => {
  it("avisa si no hay 12 h entre la salida y la entrada siguiente", () => {
    const filas = [...jornada("2026-11-02", "08:00", "22:00"), ...jornada("2026-11-03", "08:00", "16:00")];
    const d = descansos(filas);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tipo: "12h", dia: "2026-11-03" });
    expect(descansos([...jornada("2026-11-02", "08:00", "19:00"), ...jornada("2026-11-03", "08:00", "16:00")])).toHaveLength(0);
  });
  it("avisa a los 7 días seguidos con fichajes", () => {
    const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
    const filas = dias.flatMap((d) => jornada(d, "08:00", "12:00"));
    const d = descansos(filas);
    expect(d.some((x) => x.tipo === "semanal" && x.dia === "2026-11-08")).toBe(true);
    expect(descansos(dias.slice(0, 6).flatMap((d) => jornada(d, "08:00", "12:00")))).toHaveLength(0);
  });
  it("una racha de 10 días cuenta como un solo incumplimiento semanal", () => {
    const dias = Array.from({ length: 10 }, (_, i) => `2026-11-${String(2 + i).padStart(2, "0")}`);
    const filas = dias.flatMap((d) => jornada(d, "08:00", "12:00"));
    expect(descansos(filas).filter((x) => x.tipo === "semanal")).toHaveLength(1);
    expect(resumenMes("2026-11", filas, cfg, new Set(), []).descansos).toBe(1);
  });
  it("el resumen mensual cuenta los incumplimientos y los avisos de hoy los muestran", () => {
    const filas = [...jornada("2026-11-02", "08:00", "22:00"), ...jornada("2026-11-03", "08:00", "16:00")];
    expect(resumenMes("2026-11", filas, cfg, new Set(), []).descansos).toBe(1);
    const now = new Date("2026-11-03T17:00:00+01:00").getTime();
    expect(avisos(now, filas, cfg, new Set(), []).some((a) => a.includes("12 h"))).toBe(true);
  });
});

describe("personal mínimo", () => {
  it("cuenta cuántos faltan cada día del tramo, incluyendo la solicitud que se aprueba", () => {
    const aprobadas = [
      { user_id: "a", tipo: "vacaciones", desde: "2026-03-02", hasta: "2026-03-04", estado: "aprobada" },
      { user_id: "b", tipo: "baja", desde: "2026-03-03", hasta: "2026-03-10", estado: "aprobada" },
      { user_id: "c", tipo: "vacaciones", desde: "2026-03-03", hasta: "2026-03-03", estado: "pendiente" },
    ];
    const r = excesoAusentes({ user_id: "d", desde: "2026-03-02", hasta: "2026-03-05" }, aprobadas, 2, new Set());
    expect(r.map((x) => x.dia)).toEqual(["2026-03-03", "2026-03-04"]);
    expect(r[0]?.ausentes).toEqual(["a", "b", "d"]);
    expect(excesoAusentes({ user_id: "d", desde: "2026-03-02", hasta: "2026-03-05" }, aprobadas, 3, new Set())).toHaveLength(0);
  });
});

describe("calendario laboral 2027 (Localidad Demo)", () => {
  const festivos2027 = new Set(["2027-01-01", "2027-01-06", "2027-03-12", "2027-03-26", "2027-03-29", "2027-05-01", "2027-06-24", "2027-09-11", "2027-09-06", "2027-10-12", "2027-11-01", "2027-12-06", "2027-12-08", "2027-12-25"]);
  const cierres2027 = [
    { desde: "2027-06-25", hasta: "2027-06-25", nombre: "Puente Sant Joan", puente: true },
    { desde: "2027-08-09", hasta: "2027-08-27", nombre: "Vacaciones de verano", puente: false },
    { desde: "2027-12-07", hasta: "2027-12-07", nombre: "Puente de diciembre", puente: true },
  ];
  it("los cierres suman 17 laborables y dejan 5 días de libre elección", () => {
    const s = saldoVacaciones(2027, 22, [], cierres2027, festivos2027);
    expect(s.empresa).toBe(17);
    expect(s.compensados).toBe(0);
    expect(s.disponibles).toBe(5);
  });
  it("tres festivos caen en sábado", () => {
    expect(sabadosFestivos(2027, festivos2027)).toEqual(["2027-05-01", "2027-09-11", "2027-12-25"]);
  });
  it("con la compensación activada los dos puentes no restan vacaciones: 7 de libre elección", () => {
    const s = saldoVacaciones(2027, 22, [], cierres2027, festivos2027, true);
    expect(s.compensados).toBe(2);
    expect(s.empresa).toBe(15);
    expect(s.disponibles).toBe(7);
    expect([...puentesCompensados(2027, cierres2027, festivos2027, true)]).toEqual(["2027-06-25", "2027-12-07"]);
  });
  it("no se compensan más puentes que sábados festivos", () => {
    expect(puentesCompensados(2027, cierres2027, new Set(["2027-05-01"]), true).size).toBe(1);
  });
  it("festivos y cierres no tienen horario teórico ni avisos de fichar", () => {
    const aus = cierresComoAusencias(cierres2027);
    const r = resumenMes("2027-12", [], cfg, festivos2027, aus);
    // Diciembre 2027: 23 laborables L-V menos 6 y 8 (festivos) menos 7 (puente) = 20 días de 8 h.
    expect(r.teorico / 3600000).toBe(20 * 8);
    expect(avisos(new Date("2027-12-07T10:00:00+01:00").getTime(), [], cfg, festivos2027, aus).length).toBe(0);
    expect(avisos(new Date("2027-12-08T10:00:00+01:00").getTime(), [], cfg, festivos2027, aus).length).toBe(0);
  });
});

describe("vacaciones de la plantilla", () => {
  it("separa los días ya disfrutados de los programados", () => {
    const cierres = [{ desde: "2027-08-09", hasta: "2027-08-27", nombre: "Verano" }];
    const aus = [
      { tipo: "vacaciones", desde: "2027-04-05", hasta: "2027-04-07", estado: "aprobada" }, // 3, ya pasados
      { tipo: "vacaciones", desde: "2027-10-04", hasta: "2027-10-05", estado: "aprobada" }, // 2, futuros
      { tipo: "vacaciones", desde: "2027-11-02", hasta: "2027-11-02", estado: "pendiente" },
      { tipo: "permiso", desde: "2027-05-03", hasta: "2027-05-03", estado: "aprobada" },
    ];
    const d = desgloseVacaciones(2027, 22, aus, cierres, new Set(), false, "2027-06-01");
    expect(d).toMatchObject({ empresa: 15, disfrutados: 3, programados: 2, pendientes: 1, disponibles: 1 });
  });
});

describe("año por defecto de las vacaciones", () => {
  it("desde noviembre se abre el año siguiente", async () => {
    const { anoPorDefecto } = await import("./calendario");
    expect(anoPorDefecto("2026-10-31")).toBe(2026);
    expect(anoPorDefecto("2026-11-06")).toBe(2027);
    expect(anoPorDefecto("2026-12-31")).toBe(2027);
    expect(anoPorDefecto("2027-01-02")).toBe(2027);
  });
});

describe("días de otros años", () => {
  it("se suman al cupo del trabajador solo en ese año", () => {
    const ajustes = [{ user_id: "ana", anio: 2027, dias: 4 }, { user_id: "berta", anio: 2027, dias: 2 }];
    expect(cupoVacaciones(22, ajustes, "ana", 2027)).toBe(26);
    expect(cupoVacaciones(22, ajustes, "ana", 2026)).toBe(22);
    // Ana Demo 2027: 26 - 17 de cierre - 3 laborables del 4 al 7 de enero (el 6 es Reyes) = 6
    const festivos = new Set(["2027-01-06"]);
    const cierres = [{ desde: "2027-06-25", hasta: "2027-06-25", nombre: "P" }, { desde: "2027-08-09", hasta: "2027-08-27", nombre: "V" }, { desde: "2027-12-07", hasta: "2027-12-07", nombre: "P" }];
    const s = saldoVacaciones(2027, cupoVacaciones(22, ajustes, "ana", 2027), [{ tipo: "vacaciones", desde: "2027-01-04", hasta: "2027-01-07", estado: "aprobada" }], cierres, festivos);
    expect(s).toMatchObject({ total: 26, empresa: 17, aprobadas: 3, disponibles: 6 });
  });
});

describe("horas laborables", () => {
  it("cuenta L-V con el horario de cada día, viernes de verano y sábados de apertura", async () => {
    const { horasLaborables } = await import("./calendario");
    const periodos = [
      { nombre: "General 2027", desde: "2027-01-01", hasta: "2027-12-31", dia_semana: null, hora_entrada: "07:00", hora_salida: "19:00", horas_dia: 10.5 },
      { nombre: "Viernes de verano", desde: "2027-06-01", hasta: "2027-09-30", dia_semana: 5, hora_entrada: "07:00", hora_salida: "15:00", horas_dia: 8 },
      { nombre: "Sábados", desde: "2027-06-27", hasta: "2027-12-31", dia_semana: 6, hora_entrada: "08:00", hora_salida: "13:00", horas_dia: 5 },
    ];
    const c = { ...cfg, periodos };
    const festivos = new Set(["2027-09-11", "2027-09-06"]);
    // Septiembre 2027: 22 laborables L-V menos el 6 (festivo) = 21; de ellos 4 viernes (3, 10, 17, 24) de 8 h.
    const sep = horasLaborables("2027-09-01", "2027-09-30", c, festivos, []);
    expect(sep).toMatchObject({ dias: 21, horas: 17 * 10.5 + 4 * 8, sabados: 3, horasSabado: 15 }); // sábados 4, 18, 25 (el 11 es festivo)
    // Con una semana de vacaciones del trabajador (20-24): 5 días menos (4 de 10,5 h y un viernes de 8 h).
    const conVac = horasLaborables("2027-09-01", "2027-09-30", c, festivos, [], [{ tipo: "vacaciones", desde: "2027-09-20", hasta: "2027-09-24", estado: "aprobada" }]);
    expect(conVac.dias).toBe(16);
    expect(conVac.horas).toBe(sep.horas - 4 * 10.5 - 8);
  });
});
