import { describe, it, expect } from "vitest";
import { compute, validSeq, dkey, madridTime, enCurso, pinDebil } from "./fichaje";
import { decisionReason } from "./correction";

const H = 3600000;
describe("fichaje", () => {
  it("jornada sin cerrar no computa aunque pasen meses", () => {
    const r = compute([{ tipo: "entrada", at: 0 }], 1000 * H);
    expect([r.state, r.worked, r.unclosed]).toEqual(["trabajando", 0, true]);
  });
  it("jornada en pausa sin salida no computa", () => {
    expect(compute([{ tipo: "entrada", at: 0 }, { tipo: "pausa", at: 4 * H }], 100 * H).worked).toBe(0);
  });
  it("turno de 22 a 6 cruza medianoche y dura 8 horas", () => {
    const entrada = madridTime("2026-10-20T22:00");
    const salida = madridTime("2026-10-21T06:00");
    expect(compute([{ tipo: "entrada", at: Date.parse(entrada) }, { tipo: "salida", at: Date.parse(salida) }]).worked).toBe(8 * H);
    expect(dkey(new Date(entrada))).toBe("2026-10-20");
  });
  it("rechazar necesita un motivo y aprobar no", () => {
    expect(() => decisionReason(false, " ")).toThrow();
    expect(decisionReason(true, "").length).toBeGreaterThan(0);
  });
  it("rechaza entradas repetidas y reanudar sin pausa", () => {
    expect(validSeq([{ tipo: "entrada", at: 0 }, { tipo: "entrada", at: H }])).not.toBeNull();
    expect(validSeq([{ tipo: "entrada", at: 0 }, { tipo: "reanudar", at: H }])).not.toBeNull();
  });
  it("descuenta las pausas del tiempo trabajado", () => {
    const r = compute([
      { tipo: "entrada", at: 0 },
      { tipo: "pausa", at: 4 * H },
      { tipo: "reanudar", at: 5 * H },
      { tipo: "salida", at: 9 * H },
    ]);
    expect(r.efectivo).toBe(8 * H);
    expect(r.worked).toBe(8 * H); // pausa de 1 h = comida, no se paga
    expect(r.state).toBe("fuera");
  });
  it("rechaza una salida sin entrada", () => {
    expect(validSeq([{ tipo: "salida", at: 0 }])).not.toBeNull();
  });
  it("una jornada abierta es 'en curso' hasta 16 h y luego queda olvidada", () => {
    const ev = [{ tipo: "entrada" as const, at: 0 }];
    expect(enCurso(ev, 15 * H)).toBe(true);
    expect(enCurso(ev, 17 * H)).toBe(false);
    expect(enCurso([...ev, { tipo: "salida", at: H }], 2 * H)).toBe(false);
  });
  it("una jornada en curso cuenta el tiempo en vivo", () => {
    expect(compute([{ tipo: "entrada", at: 0 }], 2 * H, true).worked).toBe(2 * H);
  });
  it("PIN débil o igual no se acepta", () => {
    expect(pinDebil("111111")).toBe(true);
    expect(pinDebil("123456")).toBe(true);
    expect(pinDebil("482913")).toBe(false);
  });
  it("acepta entrada y salida", () => {
    expect(validSeq([{ tipo: "entrada", at: 0 }, { tipo: "salida", at: H }])).toBeNull();
  });
});
