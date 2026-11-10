import { type ReactNode } from "react";
import { t, useIdioma } from "@/lib/i18n";

/** Nombre de la empresa (genérico en esta versión de demostración). */
export const EMPRESA = "Empresa Demo";

/** Cabecera con el nombre de la empresa y la línea de color de la marca. */
export function Marca({ children, grande = false, ancho = "max-w-[560px]" }: { children?: ReactNode; grande?: boolean; ancho?: string }) {
  useIdioma();
  return (
    <header className={`${grande ? "" : "sticky top-0 z-20"} bg-card/90 backdrop-blur-md supports-[backdrop-filter]:bg-card/80`}>
      <div className={`mx-auto flex ${ancho} items-center justify-between gap-3 ${grande ? "px-5 py-7" : "px-4 py-2.5"}`}>
        <div className="min-w-0">
          <span className={`block font-display font-bold leading-none text-brand ${grande ? "text-5xl" : "text-2xl"}`}>{EMPRESA}</span>
          {grande && <span className="mt-1.5 block text-base font-medium text-muted-foreground">{t("Registro de jornada")}</span>}
        </div>
        {children}
      </div>
      <div aria-hidden className="h-1 bg-brand" />
    </header>
  );
}
