/**
 * Web Push sin dependencias (RFC 8291 cifrado aes128gcm + RFC 8292 VAPID) sobre WebCrypto,
 * que es lo único disponible en Cloudflare Workers, donde corre el servidor de la app.
 */
export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type ClavesVapid = { publica: string; privada: string; contacto: string };

const enc = new TextEncoder();
export const b64url = {
  encode: (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, key, bits));
}

/** Clave privada P-256 (32 bytes, base64url) + pública (65 bytes) → CryptoKey para ECDH o ECDSA. */
async function importarPrivada(privada: string, publica: string, uso: "ECDH" | "ECDSA") {
  const pub = b64url.decode(publica);
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33, 65)), d: privada, ext: true };
  return crypto.subtle.importKey("jwk", jwk, uso === "ECDH" ? { name: "ECDH", namedCurve: "P-256" } : { name: "ECDSA", namedCurve: "P-256" }, false, uso === "ECDH" ? ["deriveBits"] : ["sign"]);
}

export type OpcionesCifrado = { salt?: Uint8Array; servidor?: { privada: string; publica: string } };

/** Cifra el mensaje para la suscripción (RFC 8291). Las opciones solo sirven para los vectores de prueba. */
export async function cifrar(sub: Suscripcion, texto: string, op: OpcionesCifrado = {}) {
  const uaPublica = b64url.decode(sub.p256dh);
  const authSecret = b64url.decode(sub.auth);
  let asPrivada: CryptoKey, asPublica: Uint8Array;
  if (op.servidor) {
    asPrivada = await importarPrivada(op.servidor.privada, op.servidor.publica, "ECDH");
    asPublica = b64url.decode(op.servidor.publica);
  } else {
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivada = par.privateKey;
    asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  }
  const uaKey = await crypto.subtle.importKey("raw", buf(uaPublica), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivada, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublica, asPublica), 256);
  const salt = op.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 96);
  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, buf(concat(enc.encode(texto), new Uint8Array([2])))));
  const cabecera = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublica.length]), asPublica);
  return concat(cabecera, cifrado);
}

/** Cabecera Authorization de VAPID (RFC 8292): JWT ES256 firmado con la clave privada del servidor. */
export async function cabeceraVapid(endpoint: string, claves: ClavesVapid, ahora = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url.encode(enc.encode(JSON.stringify({ aud, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: claves.contacto })));
  const key = await importarPrivada(claves.privada, claves.publica, "ECDSA");
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, buf(enc.encode(`${header}.${body}`)));
  return `vapid t=${header}.${body}.${b64url.encode(firma)}, k=${claves.publica}`;
}

export type ResultadoPush = "enviado" | "caducada" | "error";

/** Envía una notificación. "caducada" = la suscripción ya no existe y hay que borrarla. */
export async function enviarPush(sub: Suscripcion, mensaje: { title: string; body: string; tag?: string; url?: string }, claves: ClavesVapid, ttl = 6 * 3600): Promise<ResultadoPush> {
  try {
    const cuerpo = await cifrar(sub, JSON.stringify(mensaje));
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: await cabeceraVapid(sub.endpoint, claves), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal" },
      body: buf(cuerpo),
    });
    if (r.status === 404 || r.status === 410) return "caducada";
    return r.ok ? "enviado" : "error";
  } catch {
    return "error";
  }
}

/** Claves del servidor desde el entorno (generadas una vez; la privada es secreta). */
export function clavesDeEntorno(): ClavesVapid | null {
  const publica = process.env["VAPID_PUBLIC_KEY"], privada = process.env["VAPID_PRIVATE_KEY"];
  if (!publica || !privada) return null;
  return { publica, privada, contacto: process.env["VAPID_CONTACT"] ?? "mailto:admin@example.com" };
}
