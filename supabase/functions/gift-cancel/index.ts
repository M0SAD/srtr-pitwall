// Hediye PRO aboneliğini sonlandırma: hediye eden üye, hediye ettiği aboneliği istediği zaman iptal eder.
//
// Adres: https://<proje>.supabase.co/functions/v1/gift-cancel   (POST {"lemon_id":"<abonelik numarası>"})
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır, pro-checkout gibi).
// Sadece aboneliğin hediye edeni (subscriptions.gifted_by) iptal edebilir; alıcı edemez.
// Lemon'da DELETE /v1/subscriptions/{id} aboneliği iptal eder: yenileme durur, ödenen dönemin sonuna kadar
// alıcının PRO'su sürer (Lemon ayrıca 'subscription_cancelled' olayını pro-webhook'a yollar).
// Veritabanında durum hemen 'cancelled' yapılır ve alıcıya 'pro_gift_ended' bildirimi gider (gift_cancelled).
//
// Paddle aboneliği (kimlik sub_…, subscriptions.provider = 'paddle'): POST /subscriptions/{id}/cancel
// (effective_from: next_billing_period) — yenileme durur, ödenen dönemin sonuna kadar alıcının PRO'su sürer; Paddle
// ayrıca subscription.updated (iptal planlandı) ve dönem bitince subscription.canceled olaylarını pro-webhook'a yollar.
//
// Gizli değerler: LEMON_API_KEY (Lemon abonelikleri için), PADDLE_API_KEY / PADDLE_ENV (Paddle abonelikleri için)

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    const apiKey = Deno.env.get("LEMON_API_KEY") ?? "";

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });

    const body = await req.json().catch(() => ({}));
    // Abonelik kimliği: Lemon (sayı) ya da Paddle (sub_…)
    const lemonId = String(body?.lemon_id ?? "").trim();
    if (!/^\d{1,20}$/.test(lemonId) && !/^sub_[a-z0-9]{8,64}$/i.test(lemonId)) return reply(400, { error: "Geçersiz abonelik" });

    // Sadece hediye eden
    const { data: sub, error: se } = await db
      .from("subscriptions")
      .select("lemon_id,status,gifted_by,is_gift,renews_at,ends_at,provider")
      .eq("lemon_id", lemonId)
      .maybeSingle();
    if (se) throw new Error(se.message);
    if (!sub || !sub.is_gift || sub.gifted_by !== user.id) return reply(404, { error: "Hediye bulunamadı" });

    let endsAt: string | null = sub.ends_at ?? null;
    if (sub.provider === "paddle" && sub.status !== "cancelled" && sub.status !== "expired") {
      if (!PADDLE_KEY()) return reply(503, { error: "Ödeme sistemi yapılandırılmadı" });
      const cancel = (effective: string) =>
        paddle("POST", `/subscriptions/${encodeURIComponent(lemonId)}/cancel`, { effective_from: effective });
      try {
        const d = await cancel("next_billing_period");
        endsAt = d?.scheduled_change?.effective_at ?? d?.current_billing_period?.ends_at ?? sub.renews_at ?? endsAt;
      } catch (e) {
        const code = e instanceof PaddleError ? e.code : "";
        console.error("paddle cancel", code, String((e as Error).message ?? e));
        if (/already|canceled|cancelled|scheduled/i.test(code)) {
          // Zaten iptal edilmiş / planlanmış: veritabanı yine güncellenir
          endsAt = sub.renews_at ?? endsAt;
        } else if (sub.status === "past_due") {
          // Ödemesi yapılamayan abonelik dönem sonunda iptal edilemiyorsa hemen iptal edilir (zaten ödenmemiş)
          try {
            await cancel("immediately");
            endsAt = new Date().toISOString();
          } catch (e2) {
            console.error("paddle cancel now", String((e2 as Error).message ?? e2));
            return reply(502, { error: "Abonelik iptal edilemedi, biraz sonra tekrar dene" });
          }
        } else {
          return reply(502, { error: "Abonelik iptal edilemedi, biraz sonra tekrar dene" });
        }
      }
    } else if (sub.provider !== "paddle" && sub.status !== "cancelled" && sub.status !== "expired") {
      if (!apiKey) return reply(503, { error: "Ödeme sistemi yapılandırılmadı" });
      const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(lemonId)}`, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("lemon cancel", res.status, JSON.stringify(j?.errors ?? j));
        return reply(502, { error: "Abonelik iptal edilemedi, biraz sonra tekrar dene" });
      }
      endsAt = j?.data?.attributes?.ends_at ?? sub.renews_at ?? endsAt;
    }

    const { data, error } = await db.rpc("gift_cancelled", { p_lemon_id: lemonId, p_gifter: user.id, p_ends: endsAt });
    if (error) throw new Error(error.message);
    return reply(200, { ok: true, ...(data ?? {}) });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
