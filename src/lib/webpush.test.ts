// @vitest-environment node
import { describe, expect, it } from "vitest";
import { b64url, cabeceraVapid, cifrar } from "./webpush.server";

// Vectores de prueba del RFC 8291, apéndice A.
const sub = { endpoint: "https://push.example.net/p/1", p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
const servidor = { privada: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", publica: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8" };

describe("web push", () => {
  it("cifra exactamente como el vector del RFC 8291", async () => {
    const out = await cifrar(sub, "When I grow up, I want to be a watermelon", { salt: b64url.decode("DGv6ra1nlYgDCS1FRnbzlw"), servidor });
    expect(b64url.encode(out)).toBe("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  });
  it("firma un JWT VAPID verificable con la clave pública", async () => {
    const claves = { ...servidor, contacto: "mailto:test@example.com" };
    const h = await cabeceraVapid("https://fcm.googleapis.com/fcm/send/abc", claves, 1_700_000_000_000);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h);
    expect(m?.[2]).toBe(servidor.publica);
    const [head = "", body = "", sig = ""] = (m?.[1] ?? "").split(".");
    const claims = JSON.parse(new TextDecoder().decode(b64url.decode(body)));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: "mailto:test@example.com" });
    const pub = b64url.decode(servidor.publica);
    const key = await crypto.subtle.importKey("raw", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64url.decode(sig), new TextEncoder().encode(`${head}.${body}`));
    expect(ok).toBe(true);
  });
});
