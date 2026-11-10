// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CambiarPin } from "./CambiarPin";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-start")>()), useServerFn: () => vi.fn() }));
vi.mock("@/lib/pin.functions", () => ({ cambiarMiPin: vi.fn() }));

describe("cambio de pantalla: el foco va al título nuevo", () => {
  it("al abrir Cambiar mi PIN, el foco está en su título", () => {
    render(<CambiarPin voluntario onDone={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cambiar mi PIN" })).toHaveFocus();
  });
});
