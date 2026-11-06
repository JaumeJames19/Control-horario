// Genera el par de claves VAPID para los avisos push (una sola vez por despliegue).
// Uso: node scripts/vapid.mjs  →  copia VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY a los secretos del servidor.
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
const { d } = await crypto.subtle.exportKey("jwk", par.privateKey);
console.log(`VAPID_PUBLIC_KEY=${publica}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
console.log(`PIN_PEPPER=${b64url(crypto.getRandomValues(new Uint8Array(32)))}   # si aún no existe`);
