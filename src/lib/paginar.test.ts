import { describe, expect, it } from "vitest";
import { todas } from "./paginar";

/** Simula Supabase: `max` filas por petición como mucho, aunque se pidan más. */
const servidor = (total: number, max: number) => {
  const filas = Array.from({ length: total }, (_, i) => i);
  return async (desde: number, hasta: number) => ({ data: filas.slice(desde, Math.min(hasta + 1, desde + max)), error: null });
};

describe("todas", () => {
  it("junta todas las páginas, sin repetir ni saltar filas", async () => {
    expect(await todas(servidor(2500, 1000))).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });
  it("no se salta filas si el servidor da menos de las pedidas", async () => {
    expect((await todas(servidor(1200, 500))).length).toBe(1200);
  });
  it("devuelve [] sin filas y propaga el error", async () => {
    expect(await todas(servidor(0, 1000))).toEqual([]);
    await expect(todas(async () => ({ data: null, error: new Error("x") }))).rejects.toThrow("x");
  });
});
