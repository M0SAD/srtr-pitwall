// PRO üyelik bildirimi: Patreon ve Ko-fi ödeme bildirimlerini alır, ödeyen e-postaya PRO süresi verir.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-webhook?source=patreon  (ya da source=kofi)
// Gizli değerler (Supabase -> Edge Functions -> Secrets):
//   PATREON_WEBHOOK_SECRET  Patreon webhook sayfasındaki "secret"
//   KOFI_VERIFICATION_TOKEN Ko-fi -> API -> Verification Token
// Kurulum: docs/PRO.md

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

// Yeni projelerde gizli anahtar SUPABASE_SECRET_KEYS içinde de gelir; hangisi varsa kullanılır
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

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false },
});

const DAY = 24 * 3600 * 1000;
/** Ödeme gecikmelerine karşı ek süre */
const GRACE_DAYS = 3;

async function grant(email: string, until: Date, source: string) {
  const { data, error } = await supabase.rpc("grant_pro_by_email", {
    p_email: email,
    p_until: until.toISOString(),
    p_source: source,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function fail(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Ko-fi: form verisi içinde "data" alanında JSON gelir.
// Üyelik (Subscription) ödemelerinde her ay bir bildirim gelir. Tier adında "yıl"/"year"
// geçiyorsa yıllık sayılır.
// ---------------------------------------------------------------------------
async function kofi(req: Request) {
  const form = await req.formData();
  const raw = form.get("data");
  if (typeof raw !== "string") return fail(400, "data yok");
  const d = JSON.parse(raw);
  if (d.verification_token !== Deno.env.get("KOFI_VERIFICATION_TOKEN")) return fail(401, "token hatalı");
  if (d.type !== "Subscription" && !d.is_subscription_payment) return ok({ ignored: d.type });
  const email = String(d.email || "").trim();
  if (!email) return fail(400, "e-posta yok");
  const tier = String(d.tier_name || "").toLowerCase();
  const yearly = /y[ıi]l|year|annual/.test(tier);
  const until = new Date(Date.now() + ((yearly ? 365 : 31) + GRACE_DAYS) * DAY);
  const r = await grant(email, until, "kofi");
  return ok({ ok: true, user: r });
}

// ---------------------------------------------------------------------------
// Patreon: JSON:API gövdesi, X-Patreon-Signature = HMAC-MD5(gövde, secret).
// Olaylar: members:create/update/delete, members:pledge:create/update/delete.
// Aktif destekçi: bir sonraki ödeme tarihine kadar (+ek süre) PRO.
// ---------------------------------------------------------------------------
async function patreon(req: Request) {
  const body = await req.text();
  const secret = Deno.env.get("PATREON_WEBHOOK_SECRET") ?? "";
  const sig = req.headers.get("X-Patreon-Signature") ?? "";
  const mine = createHmac("md5", secret).update(body).digest("hex");
  if (!secret || sig.length !== mine.length || !timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(mine))) {
    return fail(401, "imza hatalı");
  }
  const event = req.headers.get("X-Patreon-Event") ?? "";
  const j = JSON.parse(body);
  const a = j?.data?.attributes ?? {};
  const email = String(a.email || "").trim();
  if (!email) return ok({ ignored: "e-posta yok" });

  if (a.patron_status !== "active_patron" || event.endsWith(":delete")) {
    // İptal: ödenen dönem bitene kadar PRO kalır, uzatılmaz
    return ok({ ignored: a.patron_status ?? event });
  }
  const cadence = Number(a.pledge_cadence) || 1; // 1 aylık, 12 yıllık
  const next = a.next_charge_date ? new Date(a.next_charge_date) : null;
  const base = next && next.getTime() > Date.now() ? next.getTime() : Date.now() + (cadence >= 12 ? 365 : 31) * DAY;
  const until = new Date(base + GRACE_DAYS * DAY);
  const r = await grant(email, until, "patreon");
  return ok({ ok: true, user: r });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "POST bekleniyor");
  const source = new URL(req.url).searchParams.get("source");
  try {
    if (source === "kofi") return await kofi(req);
    if (source === "patreon") return await patreon(req);
    return fail(400, "source=patreon ya da source=kofi olmalı");
  } catch (e) {
    console.error(e);
    return fail(500, String((e as Error).message ?? e));
  }
});
