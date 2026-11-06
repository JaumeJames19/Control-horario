// Solo servidor. La contraseña real de cada cuenta no es el PIN, sino HMAC(secreto, id:PIN)
// (se usa el id y no el usuario para que renombrar a alguien no le cambie la contraseña).
// Así no se puede probar PINs directamente contra el servicio de acceso saltándose el bloqueo de la app.
//
// El secreto es `PIN_PEPPER`, propio de la app y que nunca sale del servidor. Para rotarlo sin
// resetear a nadie: poner el valor viejo en `PIN_PEPPER_PREVIOUS` y el nuevo en `PIN_PEPPER`;
// cada inicio de sesión que valide con el viejo se vuelve a guardar con el nuevo (ver `entrar`).
// Si no hay `PIN_PEPPER_PREVIOUS`, el «anterior» es la clave de servicio de Supabase, que es lo que
// se usaba antes de existir `PIN_PEPPER`: así la primera migración no necesita copiar nada.

/** Secretos activos: el actual (obligatorio) y, durante una rotación, el anterior. */
export function peppers() {
  const actual = process.env["PIN_PEPPER"];
  if (!actual) throw new Error("Falta PIN_PEPPER en el servidor");
  const anterior = process.env["PIN_PEPPER_PREVIOUS"] || process.env["SUPABASE_SERVICE_ROLE_KEY"] || null;
  return { actual, anterior: anterior && anterior !== actual ? anterior : null };
}

export async function claveDePin(userId: string, pin: string, secreto = peppers().actual) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", key, enc.encode(`${userId}:${pin}`));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
