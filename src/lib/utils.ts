import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Ref para el título de una pantalla nueva: le da el foco al aparecer, para que el lector de pantalla anuncie el cambio
 * y el teclado siga desde ahí. Es una función fija, así que React la llama solo al montar, no en cada render.
 */
export const enfocarAlMontar = (e: HTMLElement | null) => e?.focus({ preventScroll: true });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
