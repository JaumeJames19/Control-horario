import { setIdioma, useIdioma } from "@/lib/i18n";

/** Selector castellano / català. */
export function Idioma({ className = "" }: { className?: string }) {
  const actual = useIdioma();
  return (
    <div role="group" aria-label="Idioma" className={`inline-flex rounded-full bg-secondary p-0.5 text-xs font-semibold ${className}`}>
      {(["es", "ca"] as const).map((i) => (
        <button key={i} type="button" aria-pressed={actual === i} onClick={() => setIdioma(i)}
          className={`rounded-full px-2.5 py-1 uppercase transition-colors ${actual === i ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}>{i}</button>
      ))}
    </div>
  );
}
