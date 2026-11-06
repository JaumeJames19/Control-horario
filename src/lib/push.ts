// Cliente: suscripción del navegador a los avisos push (requiere la app instalada en iPhone).
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export const soportaPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function suscripcionActual() {
  if (!soportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export type DatosSuscripcion = { endpoint: string; p256dh: string; auth: string };

/** Pide permiso, se suscribe con la clave pública del servidor y devuelve los datos para guardarlos. */
export async function suscribir(clavePublica: string): Promise<DatosSuscripcion> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  if ((await Notification.requestPermission()) !== "granted") throw new Error("PERMISO");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(clavePublica) as BufferSource }));
  const j = sub.toJSON();
  if (!j.keys?.["p256dh"] || !j.keys["auth"]) throw new Error("SIN_CLAVES");
  return { endpoint: sub.endpoint, p256dh: j.keys["p256dh"], auth: j.keys["auth"] };
}

export async function desuscribir() {
  const sub = await suscripcionActual();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
