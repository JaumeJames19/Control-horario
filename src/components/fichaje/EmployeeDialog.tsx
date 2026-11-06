import { useState } from "react";
import { t, useIdioma } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { crearTrabajador } from "@/lib/employees.functions";
import { cambiarPin } from "@/lib/pin.functions";
import { normUser } from "@/lib/fichaje";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil } from "./data";

/** El servidor y la base de datos devuelven un motivo concreto; se muestra en vez del mensaje genérico. */
const MOTIVOS = [
  "Solo el encargado puede crear trabajadores.", "Solo el encargado puede cambiar PINs.", "Usuario inválido.",
  "No se pudo crear: comprueba que el usuario no exista.", "Trabajador creado, pero no se pudo poner el PIN: ponlo con «Cambiar PIN».",
  "No se pudo cambiar el PIN.", "PIN cambiado, pero no se pudo marcar como temporal.", "Falta PIN_PEPPER en el servidor",
  "Usuario duplicado", "Datos inválidos", "Solo encargado", "No puede desactivarse", "Trabajador inexistente",
];
function motivoAlta(e: unknown): { clave: string; detalle: string } {
  const msg = (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e)).replace(/^Error:\s*/, "").trim();
  const conocido = MOTIVOS.find((m) => msg.includes(m));
  // Lo que venga después del motivo conocido (o todo el texto si no es conocido) se enseña tal cual, recortado, para poder diagnosticarlo.
  const detalle = (conocido ? msg.slice(msg.indexOf(conocido) + conocido.length) : msg).trim().slice(0, 160);
  return { clave: conocido ?? "No se pudo guardar. Comprueba los datos y el usuario.", detalle };
}

export function EmployeeDialog({ perfil, mode, onClose, onSaved }: { perfil?: Perfil; mode: "crear" | "editar" | "pin"; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(perfil?.nombre ?? "");
  const [username, setUsername] = useState(perfil?.username ?? "");
  const [pin, setPin] = useState("");
  const [conductor, setConductor] = useState(perfil?.conductor ?? false);
  const [inspector, setInspector] = useState(perfil?.inspector ?? false);
  const [busy, setBusy] = useState(false);
  const create = useServerFn(crearTrabajador);
  const reset = useServerFn(cambiarPin);
  useIdioma();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "crear") await create({ data: { nombre, username: normUser(username), pin } });
      else if (perfil && mode === "pin") await reset({ data: { userId: perfil.id, pin } });
      else if (perfil) {
        const { error } = await supabase.rpc("edit_employee", { _id: perfil.id, _nombre: nombre, _username: normUser(username), _activo: perfil.activo });
        if (error) throw error;
        if (conductor !== perfil.conductor) {
          const { error: e2 } = await supabase.rpc("marcar_conductor", { _id: perfil.id, _conductor: conductor });
          if (e2) throw e2;
        }
        if (inspector !== perfil.inspector) {
          const { error: e3 } = await supabase.rpc("marcar_inspector", { _id: perfil.id, _inspector: inspector });
          if (e3) throw e3;
        }
      }
      toast.success(mode === "pin" ? t("PIN temporal puesto. Comunícalo en persona: tendrá que cambiarlo al entrar.") : t("Trabajador guardado")); onSaved();
    } catch (e) { const { clave, detalle } = motivoAlta(e); toast.error(detalle ? `${t(clave)} ${detalle}` : t(clave)); }
    finally { setBusy(false); }
  }
  const field = "campo px-4 py-3";
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent>
    <DialogTitle>{mode === "crear" ? t("Crear trabajador") : mode === "pin" ? `${t("Cambiar PIN de")} ${perfil?.nombre}` : t("Editar trabajador")}</DialogTitle>
    <DialogDescription>{mode === "pin" ? t("PIN temporal de 6 números. El trabajador tendrá que cambiarlo al entrar.") : t("Acceso gestionado por el encargado.")}</DialogDescription>
    <form onSubmit={save} className="flex flex-col gap-3">
      {mode !== "pin" && <><label>{t("Nombre")}<input required maxLength={100} className={field} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label><label>{t("Usuario")}<input required minLength={3} maxLength={40} className={field} value={username} onChange={(e) => setUsername(e.target.value)} /></label></>}
      {mode === "editar" && <label className="flex items-center gap-2"><input type="checkbox" checked={conductor} onChange={(e) => setConductor(e.target.checked)} /> {t("Conductor (puede fichar tiempo de espera)")}</label>}
      {mode === "editar" && <label className="flex items-center gap-2"><input type="checkbox" checked={inspector} onChange={(e) => setInspector(e.target.checked)} /> {t("Inspección de Trabajo (solo lectura de todo, con código de seguridad; no ficha)")}</label>}
      {mode !== "editar" && <label>{t("PIN temporal (6 números)")}<input required pattern="[0-9]{6}" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className={field} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>}
      <Button disabled={busy} type="submit">{busy ? t("Guardando…") : t("Guardar")}</Button>
    </form>
  </DialogContent></Dialog>;
}