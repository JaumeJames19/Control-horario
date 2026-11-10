import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { NEXT, compute, enCurso, normUser, usernameToEmail, type Estado, type Tipo } from "./fichaje";


/**
 * IP del cliente. `fiable` solo la pone Cloudflare (no se puede falsificar) y es la que vale para la
 * lista de IPs de la tablet; `texto` añade las cabeceras habituales solo para dejar constancia en `accesos`.
 */
function ipCliente() {
  const h = getRequest()?.headers;
  const fiable = h?.get("cf-connecting-ip") ?? null;
  return { fiable, texto: fiable ?? h?.get("x-real-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null };
}

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Igual que los clientes generados: las claves nuevas no van como Bearer. */
function supabaseFetch(key: string, token?: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function clienteAnonimo(token?: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configuración incompleta");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch(key, token) },
  });
}

/**
 * Comprueba usuario + PIN. Bloquea tras 5 fallos en 15 min (de forma atómica en la base de datos)
 * y deja constancia de cada intento.
 */
async function comprobarPin(username: string, pin: string, origen: "app" | "kiosco") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { claveDePin, peppers } = await import("./clave.server");
  const ip = ipCliente();
  const { data: intento, error: eInt } = await supabaseAdmin.rpc("intento_login", { _username: username, _origen: origen, _ip: ip.texto ?? "" });
  if (eInt) throw new Error("NO_DISPONIBLE");
  if (intento === null) throw new Error("BLOQUEADO");
  const { data: perfil } = await supabaseAdmin.from("profiles").select("id,debe_cambiar_pin").eq("username", username).maybeSingle();
  if (!perfil) throw new Error("CREDENCIALES");
  const anon = clienteAnonimo();
  const email = usernameToEmail(username);
  const { actual, anterior } = peppers();
  const claveActual = await claveDePin(perfil.id, pin, actual);
  let r = await anon.auth.signInWithPassword({ email, password: claveActual });
  let migrar = false;
  // Rotación del secreto: la cuenta aún tiene la contraseña derivada del secreto anterior.
  if ((r.error || !r.data.session) && anterior) {
    r = await anon.auth.signInWithPassword({ email, password: await claveDePin(perfil.id, pin, anterior) });
    migrar = !r.error && !!r.data.session;
  }
  // Cuenta aprovisionada a mano con el PIN temporal en claro: solo mientras deba cambiarlo.
  if ((r.error || !r.data.session) && perfil.debe_cambiar_pin) {
    r = await anon.auth.signInWithPassword({ email, password: pin });
    migrar = !r.error && !!r.data.session;
  }
  if (r.error || !r.data.session) throw new Error("CREDENCIALES");
  // Se vuelve a guardar con el secreto actual para que la vía antigua deje de hacer falta.
  if (migrar) await supabaseAdmin.auth.admin.updateUserById(perfil.id, { password: claveActual });
  await supabaseAdmin.rpc("intento_ok", { _id: intento });
  return { anon, session: r.data.session, ip };
}

const credenciales = z.object({ username: z.string().min(1).max(60), pin: z.string().regex(/^\d{6}$/) });

/** Inicio de sesión de la app. Devuelve la sesión para guardarla en el navegador. */
export const entrar = createServerFn({ method: "POST" })
  .inputValidator((d) => credenciales.parse(d))
  .handler(async ({ data }) => {
    const { session } = await comprobarPin(normUser(data.username), data.pin, "app");
    return { access_token: session.access_token, refresh_token: session.refresh_token };
  });

const OPCIONES: Record<Estado, Tipo[]> = NEXT;

/**
 * Tablet del almacén: identifica con usuario + PIN, muestra el estado y, si se indica `tipo`, ficha.
 * Solo funciona desde las IP configuradas por el encargado (si hay alguna).
 */
export const fichaKiosco = createServerFn({ method: "POST" })
  .inputValidator((d) => credenciales.extend({ tipo: z.enum(["entrada", "pausa", "espera", "reanudar", "salida"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin.from("config_jornada").select("ip_kiosco,fichaje_activo").eq("id", 1).single();
    // Con el fichaje desactivado (la app arranca solo con vacaciones) la tablet no ficha ni pide el PIN.
    if (!cfg?.fichaje_activo) throw new Error("FICHAJE_OFF");
    const permitidas = cfg?.ip_kiosco ?? [];
    // Solo cuenta la IP que pone Cloudflare; sin ella (otro despliegue, proxy) y con lista configurada, se deniega.
    const ip = ipCliente().fiable;
    if (permitidas.length && (!ip || !permitidas.includes(ip))) throw new Error("KIOSCO_IP");
    const { anon, session } = await comprobarPin(normUser(data.username), data.pin, "kiosco");
    try {
      const yo = clienteAnonimo(session.access_token);
      const { data: perfil } = await yo.from("profiles").select("nombre,conductor,debe_cambiar_pin,activo").eq("id", session.user.id).single();
      if (!perfil?.activo) throw new Error("INACTIVO");
      if (perfil.debe_cambiar_pin) throw new Error("CAMBIA_PIN");
      let hecho: { tipo: Tipo; at: string } | null = null;
      if (data.tipo) {
        const { data: f, error } = await yo.from("fichajes").insert({ user_id: session.user.id, tipo: data.tipo, dia: "2000-01-01" }).select("at").single();
        if (error || !f) throw new Error(error?.message.includes("sin cerrar") ? "OLVIDADA" : "NO_FICHADO");
        hecho = { tipo: data.tipo, at: f.at };
      }
      // Basta con lo reciente (jornada abierta o la última); sin fecha llegaría todo el histórico y Supabase lo corta a 1.000 filas.
      const { data: filas } = await yo.rpc("list_punches", { _uid: session.user.id, _desde: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10) });
      const ev = ((filas ?? []) as unknown as { tipo: Tipo; at: string; dia: string }[]).map((f) => ({ tipo: f.tipo, at: new Date(f.at).getTime(), dia: f.dia }));
      const ultimo = ev[ev.length - 1];
      const sesion = ultimo ? ev.filter((e) => e.dia === ultimo.dia) : [];
      const abierta = sesion.length > 0 && compute(sesion).unclosed;
      const olvidada = abierta && !enCurso(sesion);
      const estado: Estado = abierta ? compute(sesion, Date.now(), true).state : "fuera";
      const opciones = olvidada ? [] : OPCIONES[estado].filter((t) => t !== "espera" || perfil.conductor);
      return { nombre: perfil.nombre, estado, olvidada, opciones, hecho };
    } finally {
      // La sesión de la tablet es de un solo uso: se revoca en el servidor (local = solo esta, no las del móvil).
      await supabaseAdmin.auth.admin.signOut(session.access_token, "local").catch(() => undefined);
      await anon.auth.signOut({ scope: "local" });
    }
  });
