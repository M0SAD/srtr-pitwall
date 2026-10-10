// Abonelik yönetimi (Paddle müşteri portalı): giriş yapmış üye için kısa ömürlü bir Paddle portal oturumu açar;
// üye orada kartını değiştirir, faturalarını indirir ya da aboneliğini iptal eder.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-portal   (POST {} ya da {"sub_id":"sub_…"})
//   {}               → üyenin kendi (hediye olmayan) en son Paddle aboneliği
//   {"sub_id": …}    → üyenin kendi aboneliği ya da HEDİYE ETTİĞİ abonelik (ödeme yöntemi ödeyene aittir)
// Yanıt: {"url": "https://customer-portal.paddle.com/…"} (birkaç saat geçerli; her tıklamada yenisi açılır).
// Paddle kalıcı bir portal bağlantısı vermediği için (Lemon'daki customer_portal gibi) bağlantı veritabanında tutulmaz.
// Lemon abonelikleri için bu fonksiyon gerekmez: onların portal_url'i my_pro ile gelir.
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır, pro-checkout gibi).
// Gizli değerler: PADDLE_API_KEY, PADDLE_ENV (pro-checkout ile aynı). Önce c110_guncelleme.sql çalıştırılmalı.

import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Paddle Billing (ortak yardımcılar; bu dosya panelden tek başına yayınlandığı için diğer fonksiyonlarda da aynısı var)
// ---------------------------------------------------------------------------
const PADDLE_KEY = () => (Deno.env.get("PADDLE_API_KEY") ?? "").trim();
/** PADDLE_ENV=sandbox: test ortamı (sandbox-api.paddle.com); boş / "live": canlı */
const PADDLE_SANDBOX = () => (Deno.env.get("PADDLE_ENV") ?? "").trim().toLowerCase() === "sandbox";
const PADDLE_API = () => (PADDLE_SANDBOX() ? "https://sandbox-api.paddle.com" : "https://api.paddle.com");

class PaddleError extends Error {
  constructor(public status: number, public code: string, msg: string) {
    super(msg);
  }
}

/** Paddle API çağrısı; `data` alanını döner, hatada PaddleError fırlatır */
// deno-lint-ignore no-explicit-any
async function paddle<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(PADDLE_API() + path, {
    method,
    headers: { Authorization: `Bearer ${PADDLE_KEY()}`, "Content-Type": "application/json", "Paddle-Version": "1" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = j?.error ?? {};
    // deno-lint-ignore no-explicit-any
    const fields = Array.isArray(e.errors) ? e.errors.map((x: any) => `${x?.field}: ${x?.message}`).join("; ") : "";
    throw new PaddleError(res.status, String(e.code ?? ""), `${e.code ?? res.status}: ${e.detail ?? ""}${fields ? ` (${fields})` : ""}`);
  }
  return j?.data as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    if (!PADDLE_KEY()) return reply(503, { error: "Ödeme sistemi yapılandırılmadı" });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });

    const body = await req.json().catch(() => ({}));
    const subId = String(body?.sub_id ?? "").trim();
    if (subId && !/^sub_[a-z0-9]{8,64}$/i.test(subId)) return reply(400, { error: "Geçersiz abonelik" });

    let q = db.from("subscriptions").select("lemon_id,user_id,gifted_by,is_gift,customer_id,provider").eq("provider", "paddle");
    q = subId ? q.eq("lemon_id", subId) : q.eq("user_id", user.id).eq("is_gift", false);
    const { data: rows, error: se } = await q.order("updated_at", { ascending: false }).limit(1);
    if (se) throw new Error(se.message);
    const sub = rows?.[0];
    // Kendi aboneliği (hediye değil) ya da hediye ettiği abonelik; alıcı hediyenin portalını açamaz
    const mine = sub && ((sub.user_id === user.id && !sub.is_gift) || (sub.is_gift && sub.gifted_by === user.id));
    if (!sub || !mine) return reply(404, { error: "Abonelik bulunamadı" });

    let customer = String(sub.customer_id ?? "");
    if (!customer) {
      const s = await paddle("GET", `/subscriptions/${encodeURIComponent(sub.lemon_id)}`);
      customer = String(s?.customer_id ?? "");
      if (customer) await db.from("subscriptions").update({ customer_id: customer }).eq("lemon_id", sub.lemon_id);
    }
    if (!customer) return reply(404, { error: "Abonelik bulunamadı" });

    const session = await paddle("POST", `/customers/${encodeURIComponent(customer)}/portal-sessions`, {
      subscription_ids: [sub.lemon_id],
    });
    const url = session?.urls?.general?.overview;
    if (!url) return reply(502, { error: "Abonelik sayfası açılamadı" });
    return reply(200, { url });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
