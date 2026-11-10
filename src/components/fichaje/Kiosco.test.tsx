// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Kiosco } from "./Kiosco";

const llamar = vi.fn();
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-start")>()), useServerFn: () => llamar }));
vi.mock("@/lib/acceso.functions", () => ({ fichaKiosco: vi.fn() }));

const entrar = () => {
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "ana" } });
  fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
};

describe("tableta: accesible para lectores de pantalla", () => {
  it("los campos tienen etiqueta y el usuario recibe el foco", () => {
    render(<Kiosco />);
    expect(screen.getByLabelText("Usuario")).toHaveFocus();
  });
  it("tras identificarse, el foco va al nombre", async () => {
    llamar.mockResolvedValueOnce({ nombre: "Ana Demo", estado: "fuera", olvidada: false, opciones: ["entrada"], hecho: null });
    render(<Kiosco />);
    entrar();
    expect(await screen.findByRole("heading", { name: "Ana Demo" })).toHaveFocus();
  });
  it("tras fichar, el resultado se anuncia y recibe el foco", async () => {
    llamar.mockResolvedValueOnce({ nombre: "Ana Demo", estado: "trabajando", olvidada: false, opciones: [], hecho: { tipo: "entrada", at: "2026-11-10T07:02:00Z" } });
    render(<Kiosco />);
    entrar();
    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent("Entrada registrada a las");
    expect(estado).toHaveFocus();
  });
});

describe("tableta: tiempo para elegir", () => {
  it("cada toque vuelve a dar los 20 segundos; sin tocar, se limpia", async () => {
    vi.useFakeTimers();
    try {
      llamar.mockResolvedValueOnce({ nombre: "Ana Demo", estado: "fuera", olvidada: false, opciones: ["entrada"], hecho: null });
      render(<Kiosco />);
      entrar();
      await act(async () => { await Promise.resolve(); });
      const nombre = screen.getByRole("heading", { name: "Ana Demo" });
      act(() => { vi.advanceTimersByTime(15000); });
      fireEvent.pointerDown(nombre);
      act(() => { vi.advanceTimersByTime(15000); });
      expect(screen.getByRole("heading", { name: "Ana Demo" })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.queryByRole("heading", { name: "Ana Demo" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
