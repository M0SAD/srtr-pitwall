// PRO üyelik bildirimi: Paddle, Lemon Squeezy, Patreon ve Ko-fi ödeme bildirimlerini alır, PRO süresini ayarlar.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-webhook?source=paddle  (ya da lemon / patreon / kofi)
//
// Paddle (?source=paddle): Paddle → Developer tools → Notifications → bildirim adresi (webhook). Olaylar:
//   subscription.created / updated / activated / canceled / past_due / paused / resumed / trialing → apply_subscription
//     (provider 'paddle'; Paddle durumları Lemon'daki adlara çevrilir: iptal planlanmış aktif abonelik 'cancelled',
//     sona ermiş 'expired', deneme 'on_trial'), kuponlu abonelik başlayınca coupon_redeem.
//   transaction.completed → ödeme kaydı (record_payment; abonelik faturası ya da reklam). Reklamda (custom_data.ad_id)
//     ad_paid ile reklam ödendi sayılır.
//   adjustment.created / updated (iade / ters ibraz onaylanınca) → iade kaydı; reklam iadesinde ad_refunded.
//   İmza: Paddle-Signature: ts=…;h1=… — HMAC-SHA256("ts:gövde", PADDLE_WEBHOOK_SECRET). Bildirimin custom_data'sı
//   yoksa (ör. yenileme) abonelik satırından ya da Paddle API'sinden (işlem / müşteri) tamamlanır.
//   Gizli değerler: PADDLE_WEBHOOK_SECRET (bildirim adresinin "secret key"i), PADDLE_API_KEY, PADDLE_ENV.
//   Önce c110_guncelleme.sql çalıştırılmalı.
//
// Gizli değerler (Supabase -> Edge Functions -> Secrets):
//   PATREON_WEBHOOK_SECRET  Patreon webhook sayfasındaki "secret"
//   KOFI_VERIFICATION_TOKEN Ko-fi -> API -> Verification Token
//   LEMON_WEBHOOK_SECRET    Lemon Squeezy -> Settings -> Webhooks -> signing secret (source=lemon)
//   LEMON_AD_VARIANT_ID     (isteğe bağlı) reklam ürününün varyantı; reklam siparişleri (order_created /
//                           order_refunded, custom_data.ad_id) bu varyantla eşleşmeli (bkz. ads-checkout).
//                           LEMON_USD_AD_VARIANT_ID gibi para birimi mağazalarının varyantları da kabul edilir.
// PRO abonelikleri pro-checkout'un açtığı ödeme sayfasından gelir (custom_data.user_id + custom_data.plan);
// plan adı Lemon'daki varyant adından alınır (ör. "Monthly" / "Yearly"), yoksa custom_data.plan ("1m" …).
// Hediye PRO (pro-checkout gift_to): custom_data.user_id = alıcı, custom_data.gifter = hediye eden (ödeyen).
// Abonelik alıcıya işlenir (apply_subscription p_gifter); fatura/ödeme kaydı ise hediye edene yazılır
// (makbuz ona gider), alıcı payments.gift_to'da tutulur. Önce c26_guncelleme.sql çalıştırılmalı.
// İndirim kuponu (c34): pro-checkout / ads-checkout custom_data'ya coupon_id, coupon_before, coupon_after,
// coupon_currency ekler; ödeme gelince kullanım coupon_redeem ile kaydedilir (abonelik / sipariş başına bir kez).
// PRO'da indirim Lemon indirim koduyla (checkout_data.discount_code) uygulanır, custom_price tam fiyattır; kullanımın
// indirimli tutarı (amount_after) ilk abonelik faturasının toplamından (total) alınır.
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

/** Ödemeyi istatistik için kaydeder (hata olursa PRO işlemini durdurmaz) */
async function record(p: {
  id: string; source: string; email: string; user?: string | null; amount: number; currency: string; plan: string; kind?: string;
  giftTo?: string | null;
}) {
  const { error } = await supabase.rpc("record_payment", {
    p_id: p.id,
    p_source: p.source,
    p_email: p.email,
    p_user: p.user ?? null,
    p_amount: Math.round(p.amount * 100) / 100,
    p_currency: p.currency,
    p_plan: p.plan,
    p_kind: p.kind ?? "payment",
    p_gift_to: p.giftTo ?? null,
  });
  if (error) console.error("record_payment", error.message);
}

/** Kupon kullanımını kaydeder (c34; aynı ref bir kez sayılır, hata olursa ödeme işlemini durdurmaz) */
// deno-lint-ignore no-explicit-any
async function redeemCoupon(custom: any, p: { ref: string; user: string | null; product: string; plan: string; after?: number; currency?: string }) {
  const id = custom?.coupon_id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const { error } = await supabase.rpc("coupon_redeem", {
    p_coupon: id,
    p_user: p.user,
    p_ref: p.ref,
    p_product: p.product,
    p_plan: p.plan,
    p_before: num(custom?.coupon_before),
    p_after: p.after ?? num(custom?.coupon_after),
    p_currency: String(p.currency || custom?.coupon_currency || ""),
  });
  if (error) console.error("coupon_redeem", error.message);
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
  if (d.kofi_transaction_id && d.email) {
    await record({
      id: `kofi-${d.kofi_transaction_id}`,
      source: "kofi",
      email: String(d.email),
      amount: Number(d.amount) || 0,
      currency: String(d.currency || "USD"),
      plan: String(d.tier_name || d.type || ""),
    });
  }
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
  // Ödeme kaydı: her tahsilat tarihi bir kez sayılır
  if (a.last_charge_status === "Paid" && a.last_charge_date) {
    await record({
      id: `patreon-${j?.data?.id ?? email}-${a.last_charge_date}`,
      source: "patreon",
      email,
      amount: (Number(a.currently_entitled_amount_cents) || 0) / 100,
      currency: "USD",
      plan: cadence >= 12 ? "Patreon 12m" : "Patreon 1m",
    });
  }
  const next = a.next_charge_date ? new Date(a.next_charge_date) : null;
  const base = next && next.getTime() > Date.now() ? next.getTime() : Date.now() + (cadence >= 12 ? 365 : 31) * DAY;
  const until = new Date(base + GRACE_DAYS * DAY);
  const r = await grant(email, until, "patreon");
  return ok({ ok: true, user: r });
}

// ---------------------------------------------------------------------------
// Lemon Squeezy: abonelik olayları (subscription_created / updated / cancelled / expired ...).
// X-Signature = HMAC-SHA256(gövde, signing secret). Ödemeyi yapan hesap, ödeme bağlantısına eklenen
// checkout[custom][user_id] ile eşlenir; yoksa ödeme e-postasıyla.
// Aktif abonelik: bir sonraki yenileme tarihine (+ek süre) kadar PRO. İptal: ödenen dönem bitene kadar.
// ---------------------------------------------------------------------------
async function lemon(req: Request) {
  const raw = await req.text();
  const secret = Deno.env.get("LEMON_WEBHOOK_SECRET") ?? "";
  const sig = req.headers.get("X-Signature") ?? "";
  const mine = createHmac("sha256", secret).update(raw).digest("hex");
  if (!secret || sig.length !== mine.length || !timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(mine))) {
    return fail(401, "imza hatalı");
  }
  const j = JSON.parse(raw);
  const event = String(j?.meta?.event_name ?? "");
  const custom = j?.meta?.custom_data?.user_id;
  const customUser = typeof custom === "string" && /^[0-9a-f-]{36}$/i.test(custom) ? custom : null;
  // Hediye: ödeyen (hediye eden) hesap
  const gifterRaw = j?.meta?.custom_data?.gifter;
  const customGifter = typeof gifterRaw === "string" && /^[0-9a-f-]{36}$/i.test(gifterRaw) ? gifterRaw : null;
  // Reklam ödemesi (ads-checkout'un açtığı tek seferlik sipariş): order_created → yayına al, order_refunded → durdur
  const adId = j?.meta?.custom_data?.ad_id;
  if (j?.data?.type === "orders" && typeof adId === "string" && /^[0-9a-f-]{36}$/i.test(adId)) {
    return await lemonAdOrder(j, event, adId, customUser);
  }
  // Ödeme / iade (abonelik faturası): sadece kayıt, PRO süresini abonelik olayı ayarlar
  if (j?.data?.type === "subscription-invoices") {
    const a = j.data.attributes ?? {};
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan,user_id,gifted_by,is_gift")
      .eq("lemon_id", String(a.subscription_id ?? ""))
      .maybeSingle();
    const refund = event.includes("refund") || a.status === "refunded";
    // Hediye faturası: ödeme hediye edene (yoksa ödeme e-postasıyla eşlenir), alıcı gift_to
    const gift = !!customGifter || !!sub?.is_gift || j?.meta?.custom_data?.gift === "1";
    await record({
      id: `lemon-inv-${j.data.id}${refund ? "-refund" : ""}`,
      source: "lemon",
      email: String(a.user_email ?? ""),
      user: gift ? customGifter ?? sub?.gifted_by ?? null : customUser ?? sub?.user_id ?? null,
      giftTo: gift ? customUser ?? sub?.user_id ?? null : null,
      amount: (Number(refund ? a.refunded_amount || a.total : a.total) || 0) / 100,
      currency: String(a.currency ?? "USD"),
      plan: String(sub?.plan || j?.meta?.custom_data?.plan || ""),
      kind: refund ? "refund" : "payment",
    });
    // Kuponlu abonelik: kullanım abonelik başına bir kez (subscription_created ile aynı ref). İndirim Lemon indirim
    // koduyla uygulandığı için indirimli tutar ilk faturanın toplamından okunur; kayıt subscription_created ile
    // önceden açıldıysa tutarı bu faturayla düzeltilir. Yenileme faturaları kullanım saymaz.
    const initial = !a.billing_reason || String(a.billing_reason) === "initial";
    if (!refund && initial && a.subscription_id && typeof j?.meta?.custom_data?.coupon_id === "string") {
      const ref = `lemon-sub-${a.subscription_id}`;
      const paid = (Number(a.total) || 0) / 100;
      const cur = String(a.currency ?? "");
      await redeemCoupon(j?.meta?.custom_data, {
        ref,
        user: gift ? customGifter ?? sub?.gifted_by ?? null : customUser ?? sub?.user_id ?? null,
        product: gift ? "gift" : "pro",
        plan: String(j?.meta?.custom_data?.plan || sub?.plan || ""),
        after: paid,
        currency: cur,
      });
      const { error: ue } = await supabase
        .from("coupon_redemptions")
        .update({ amount_after: paid, ...(cur ? { currency: cur.toUpperCase() } : {}) })
        .eq("ref", ref);
      if (ue) console.error("coupon amount", ue.message);
    }
    return ok({ ok: true, event });
  }
  if (j?.data?.type !== "subscriptions") return ok({ ignored: event });
  const a = j.data.attributes ?? {};
  const status = String(a.status ?? "");
  const email = String(a.user_email ?? "").trim();
  const renews = a.renews_at ? new Date(a.renews_at) : null;
  const ends = a.ends_at ? new Date(a.ends_at) : null;
  let until: Date | null = null;
  if (status === "active" || status === "on_trial" || status === "past_due") {
    if (renews) until = new Date(renews.getTime() + GRACE_DAYS * DAY);
  } else if (status === "cancelled") {
    // İptal: ödenen dönemin sonuna kadar
    until = ends ?? new Date();
  } else {
    // expired / unpaid / paused: PRO biter
    until = ends && ends.getTime() < Date.now() ? ends : new Date();
  }
  const { data, error } = await supabase.rpc("apply_subscription", {
    p_lemon_id: String(j.data.id),
    p_user: customUser,
    p_email: email,
    p_status: status,
    p_plan: String(a.variant_name || a.product_name || j?.meta?.custom_data?.plan || ""),
    p_variant: String(a.variant_id ?? ""),
    p_renews: renews ? renews.toISOString() : null,
    p_ends: ends ? ends.toISOString() : null,
    p_portal: String(a.urls?.customer_portal ?? ""),
    p_until: until ? until.toISOString() : null,
    p_gifter: customGifter,
  });
  if (error) throw new Error(error.message);
  // Kuponlu abonelik başladı: kullanım kaydı (ödeyen: hediyede hediye eden)
  if (event === "subscription_created") {
    await redeemCoupon(j?.meta?.custom_data, {
      ref: `lemon-sub-${j.data.id}`,
      user: customGifter ?? customUser,
      product: customGifter ? "gift" : "pro",
      plan: String(j?.meta?.custom_data?.plan || ""),
    });
  }
  return ok({ ok: true, event, status, user: data });
}

// ---------------------------------------------------------------------------
// Lemon Squeezy reklam siparişi (webhook olayları: order_created, order_refunded).
// LEMON_AD_VARIANT_ID ayarlıysa siparişin varyantı onunla eşleşmeli.
// ---------------------------------------------------------------------------
const AD_PLACES: Record<string, string> = {
  panel_banner: "Uygulama banner",
  panel_card: "Uygulama kart",
  site_home: "Site ana sayfa",
  site_account: "Site hesap sayfası",
};

// deno-lint-ignore no-explicit-any
async function lemonAdOrder(j: any, event: string, adId: string, customUser: string | null) {
  const a = j.data.attributes ?? {};
  // Tanımlı tüm reklam varyantları (ana mağaza + LEMON_<PARA>_AD_VARIANT_ID)
  const wantVariants = Object.entries(Deno.env.toObject())
    .filter(([k, v]) => /^LEMON_(?:[A-Z]{3}_)?AD_VARIANT_ID$/.test(k) && v)
    .map(([, v]) => String(v).trim());
  // … ya da reklam ürünleri (LEMON_AD_PRODUCT_ID / LEMON_<PARA>_AD_PRODUCT_ID)
  const wantProducts = Object.entries(Deno.env.toObject())
    .filter(([k, v]) => /^LEMON_(?:[A-Z]{3}_)?AD_PRODUCT_ID$/.test(k) && v)
    .map(([, v]) => String(v).trim());
  const gotVariant = String(a.first_order_item?.variant_id ?? "");
  const gotProduct = String(a.first_order_item?.product_id ?? "");
  const known = (gotVariant && wantVariants.includes(gotVariant)) || (gotProduct && wantProducts.includes(gotProduct));
  if (wantVariants.length + wantProducts.length > 0 && (gotVariant || gotProduct) && !known) return ok({ ignored: "variant", event });
  const refund = event === "order_refunded" || a.status === "refunded" || a.status === "partial_refund";
  const orderId = String(j.data.id);
  if (refund) {
    const { data, error } = await supabase.rpc("ad_refunded", { p_ad: adId });
    if (error) throw new Error(error.message);
    await record({
      id: `lemon-ad-${orderId}-refund`,
      source: "lemon",
      email: String(a.user_email ?? ""),
      user: customUser ?? data?.user_id ?? null,
      amount: (Number(a.refunded_amount || a.total) || 0) / 100,
      currency: String(a.currency ?? "USD"),
      plan: `Reklam: ${AD_PLACES[data?.placement] ?? data?.placement ?? ""}`,
      kind: "refund",
    });
    return ok({ ok: true, event, ad: adId, refunded: true });
  }
  if (event !== "order_created" || a.status !== "paid") return ok({ ignored: a.status ?? event });
  const amount = (Number(a.total) || 0) / 100;
  const { data, error } = await supabase.rpc("ad_paid", {
    p_ad: adId,
    p_user: customUser,
    p_order: orderId,
    p_amount: amount,
    p_currency: String(a.currency ?? "USD"),
  });
  if (error) throw new Error(error.message);
  await record({
    id: `lemon-ad-${orderId}`,
    source: "lemon",
    email: String(a.user_email ?? ""),
    user: customUser ?? data?.user_id ?? null,
    amount,
    currency: String(a.currency ?? "USD"),
    plan: `Reklam: ${AD_PLACES[data?.placement] ?? data?.placement ?? ""}`,
  });
  await redeemCoupon(j?.meta?.custom_data, {
    ref: `lemon-ad-${orderId}`,
    user: customUser ?? data?.user_id ?? null,
    product: "ad",
    plan: String(data?.placement ?? ""),
    after: amount,
    currency: String(a.currency ?? ""),
  });
  return ok({ ok: true, event, ad: adId, status: data?.status });
}

// ---------------------------------------------------------------------------
// Paddle Billing (bkz. dosya başı)
// ---------------------------------------------------------------------------
const UUID = /^[0-9a-f-]{36}$/i;
const uuidOr = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
/** Paddle tutarı: en küçük birim (kuruş / cent) metni → sayı */
const minor = (v: unknown) => (Number(v) || 0) / 100;
const PLAN_NAME: Record<number, string> = { 1: "Monthly", 3: "Every 3 months", 6: "Every 6 months", 12: "Yearly" };

/** İmza: "ts=…;h1=…" (anahtar değişiminde birden çok h1 olabilir) */
export function paddleSignatureOk(header: string, raw: string, secret: string, now = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = header.split(";").map((x) => x.trim().split("="));
  const ts = parts.find(([k]) => k === "ts")?.[1] ?? "";
  const sigs = parts.filter(([k]) => k === "h1").map(([, v]) => v ?? "");
  if (!/^\d+$/.test(ts) || !sigs.length) return false;
  // Eski bildirimin yeniden gönderilmesine karşı: en çok 1 saatlik (Paddle yeniden denemelerde yeni imza üretir)
  if (Math.abs(now / 1000 - Number(ts)) > 3600) return false;
  const mine = new TextEncoder().encode(createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex"));
  return sigs.some((s) => {
    const b = new TextEncoder().encode(s);
    return b.length === mine.length && timingSafeEqual(b, mine);
  });
}

const customerEmails = new Map<string, string>();
/** Paddle müşterisinin e-postası (bulunamazsa "") */
async function paddleEmail(customer: string): Promise<string> {
  if (!customer) return "";
  if (customerEmails.has(customer)) return customerEmails.get(customer)!;
  try {
    const c = await paddle("GET", `/customers/${encodeURIComponent(customer)}`);
    const e = String(c?.email ?? "");
    customerEmails.set(customer, e);
    return e;
  } catch (e) {
    console.error("paddle customer", String((e as Error).message ?? e));
    return "";
  }
}

/** İşlemin custom_data'sı ve abonelik kimliği (bildirimde yoksa API'den) */
// deno-lint-ignore no-explicit-any
async function paddleTxn(id: string): Promise<any | null> {
  if (!id || !PADDLE_KEY()) return null;
  try {
    return await paddle("GET", `/transactions/${encodeURIComponent(id)}`);
  } catch (e) {
    console.error("paddle transaction", String((e as Error).message ?? e));
    return null;
  }
}

/** Fiyatın yenileme dönemi (ay) */
// deno-lint-ignore no-explicit-any
function cycleMonths(price: any): number {
  const c = price?.billing_cycle;
  const n = Number(c?.frequency) || 0;
  if (!n) return 0;
  return c?.interval === "year" ? n * 12 : c?.interval === "month" ? n : 0;
}

// deno-lint-ignore no-explicit-any
async function paddleSubscription(d: any, event: string) {
  const id = String(d?.id ?? "");
  if (!id) return ok({ ignored: "id yok", event });
  let custom = d?.custom_data ?? null;
  // custom_data işlemden aboneliğe kopyalanır; yoksa (eski olay) aboneliği başlatan işlemden okunur
  if (!uuidOr(custom?.user_id) && d?.transaction_id) custom = (await paddleTxn(String(d.transaction_id)))?.custom_data ?? custom;
  const customUser = uuidOr(custom?.user_id);
  const customGifter = uuidOr(custom?.gifter);

  const now = Date.now();
  const at = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);
  const periodEnd = at(d?.current_billing_period?.ends_at);
  const next = at(d?.next_billed_at);
  const sc = d?.scheduled_change;
  let status = "";
  let renews: Date | null = null;
  let ends: Date | null = null;
  switch (String(d?.status ?? "")) {
    case "active":
      if (sc?.action === "cancel") {
        status = "cancelled";
        ends = at(sc?.effective_at) ?? periodEnd ?? new Date(now);
      } else if (sc?.action === "pause") {
        status = "cancelled";
        ends = at(sc?.effective_at) ?? periodEnd ?? new Date(now);
      } else {
        status = "active";
        renews = next ?? periodEnd;
      }
      break;
    case "trialing":
      status = "on_trial";
      renews = next ?? periodEnd;
      break;
    case "past_due":
      // Paddle ödemeyi yeniden dener. Yenilemede dönem ileri alındığı için current_billing_period ÖDENMEMİŞ dönemdir:
      // PRO ödenen dönemin sonuna (= ödenmemiş dönemin başı) + ek süre kadar sürer
      status = "past_due";
      renews = at(d?.current_billing_period?.starts_at) ?? new Date(now);
      break;
    case "paused":
      status = "paused";
      ends = at(d?.paused_at) ?? periodEnd ?? new Date(now);
      break;
    case "canceled":
      ends = at(d?.canceled_at) ?? periodEnd ?? new Date(now);
      status = ends.getTime() > now ? "cancelled" : "expired";
      break;
    default:
      return ok({ ignored: d?.status, event });
  }
  let until: Date | null;
  if (status === "active" || status === "on_trial" || status === "past_due") {
    until = renews ? new Date(renews.getTime() + GRACE_DAYS * DAY) : null;
  } else if (status === "cancelled") {
    until = ends ?? new Date(now);
  } else {
    until = ends && ends.getTime() < now ? ends : new Date(now);
  }
  const item = Array.isArray(d?.items) ? d.items[0] : null;
  const months = cycleMonths(item?.price);
  const plan = PLAN_NAME[months] ?? (months ? `Every ${months} months` : String(custom?.plan ?? ""));
  const customer = String(d?.customer_id ?? "");
  const email = await paddleEmail(customer);
  const { data, error } = await supabase.rpc("apply_subscription", {
    p_lemon_id: id,
    p_user: customUser,
    p_email: email,
    p_status: status,
    p_plan: plan,
    p_variant: String(item?.price?.id ?? ""),
    p_renews: renews ? renews.toISOString() : null,
    p_ends: ends ? ends.toISOString() : null,
    p_portal: "",
    p_until: until ? until.toISOString() : null,
    p_gifter: customGifter,
    p_provider: "paddle",
    p_customer: customer,
    // Paddle olayları sırasız / gecikmeli gelebilir: daha eski durum yenisinin üstüne yazılmaz (c110)
    p_event_at: typeof d?.updated_at === "string" && d.updated_at ? d.updated_at : null,
  });
  if (error) throw new Error(error.message);
  if (event === "subscription.created") {
    await redeemCoupon(custom, {
      ref: `paddle-sub-${id}`,
      user: customGifter ?? customUser,
      product: customGifter ? "gift" : "pro",
      plan: String(custom?.plan || ""),
    });
  }
  return ok({ ok: true, event, status, user: data });
}

// deno-lint-ignore no-explicit-any
async function paddleTransaction(d: any, event: string) {
  if (String(d?.status ?? "") !== "completed") return ok({ ignored: d?.status, event });
  const id = String(d?.id ?? "");
  const custom = d?.custom_data ?? {};
  const customUser = uuidOr(custom?.user_id);
  const customGifter = uuidOr(custom?.gifter);
  const totals = d?.details?.totals ?? {};
  const amount = minor(totals.grand_total ?? totals.total);
  const currency = String(d?.currency_code ?? totals.currency_code ?? "USD");
  const email = await paddleEmail(String(d?.customer_id ?? ""));

  // Reklam ödemesi (ads-checkout)
  const adId = uuidOr(custom?.ad_id);
  if (adId) {
    const { data, error } = await supabase.rpc("ad_paid", { p_ad: adId, p_user: customUser, p_order: id, p_amount: amount, p_currency: currency });
    if (error) {
      // Kalıcı veri hatası (ör. reklam başka hesaba ait / silinmiş): Paddle günlerce yeniden denemesin
      if (/başka hesab|bulunamad|not found/i.test(error.message)) {
        console.error("ad_paid", adId, error.message);
        return ok({ ignored: error.message, event, ad: adId });
      }
      throw new Error(error.message);
    }
    await record({
      id: `paddle-ad-${id}`,
      source: "paddle",
      email,
      user: customUser ?? data?.user_id ?? null,
      amount,
      currency,
      plan: `Reklam: ${AD_PLACES[data?.placement] ?? data?.placement ?? ""}`,
    });
    await redeemCoupon(custom, { ref: `paddle-ad-${id}`, user: customUser ?? data?.user_id ?? null, product: "ad", plan: String(data?.placement ?? ""), after: amount, currency });
    return ok({ ok: true, event, ad: adId, status: data?.status });
  }

  // Abonelik faturası: sadece kayıt (PRO süresini abonelik olayı ayarlar)
  const subId = String(d?.subscription_id ?? "");
  if (!subId) return ok({ ignored: "abonelik / reklam değil", event });
  // Tutarsız işlemler (ör. portalda kart değişikliği: origin subscription_payment_method_change, tutar 0) ödeme sayılmaz
  if (!(amount > 0)) return ok({ ignored: `tutar 0 (${d?.origin ?? ""})`, event });
  const { data: sub } = await supabase.from("subscriptions").select("plan,user_id,gifted_by,is_gift").eq("lemon_id", subId).maybeSingle();
  const gift = !!customGifter || !!sub?.is_gift || custom?.gift === "1";
  const months = cycleMonths(Array.isArray(d?.items) ? d.items[0]?.price : null);
  const payer = gift ? customGifter ?? sub?.gifted_by ?? null : customUser ?? sub?.user_id ?? null;
  await record({
    id: `paddle-txn-${id}`,
    source: "paddle",
    email,
    user: payer,
    giftTo: gift ? customUser ?? sub?.user_id ?? null : null,
    amount,
    currency,
    plan: String(sub?.plan || PLAN_NAME[months] || custom?.plan || ""),
  });
  // Kuponlu aboneliğin ilk ödemesi: kullanım abonelik başına bir kez (subscription.created ile aynı ref),
  // indirimli tutar bu işlemden
  const initial = ["web", "api"].includes(String(d?.origin ?? ""));
  if (initial && typeof custom?.coupon_id === "string") {
    const ref = `paddle-sub-${subId}`;
    await redeemCoupon(custom, { ref, user: payer, product: gift ? "gift" : "pro", plan: String(custom?.plan || ""), after: amount, currency });
    const { error: ue } = await supabase.from("coupon_redemptions").update({ amount_after: amount, currency: currency.toUpperCase() }).eq("ref", ref);
    if (ue) console.error("coupon amount", ue.message);
  }
  return ok({ ok: true, event });
}

// deno-lint-ignore no-explicit-any
async function paddleAdjustment(d: any, event: string) {
  const action = String(d?.action ?? "");
  if ((action !== "refund" && action !== "chargeback") || String(d?.status ?? "") !== "approved") {
    return ok({ ignored: `${action}/${d?.status}`, event });
  }
  const txnId = String(d?.transaction_id ?? "");
  const t = await paddleTxn(txnId);
  const custom = t?.custom_data ?? {};
  const amount = minor(d?.totals?.total);
  const currency = String(d?.currency_code ?? t?.currency_code ?? "USD");
  const email = await paddleEmail(String(d?.customer_id ?? t?.customer_id ?? ""));
  const adId = uuidOr(custom?.ad_id);
  if (adId) {
    const { data, error } = await supabase.rpc("ad_refunded", { p_ad: adId });
    if (error) throw new Error(error.message);
    await record({
      id: `paddle-adj-${d?.id}`,
      source: "paddle",
      email,
      user: uuidOr(custom?.user_id) ?? data?.user_id ?? null,
      amount,
      currency,
      plan: `Reklam: ${AD_PLACES[data?.placement] ?? data?.placement ?? ""}`,
      kind: "refund",
    });
    return ok({ ok: true, event, ad: adId, refunded: true });
  }
  const subId = String(d?.subscription_id ?? t?.subscription_id ?? "");
  const { data: sub } = subId
    ? await supabase.from("subscriptions").select("plan,user_id,gifted_by,is_gift").eq("lemon_id", subId).maybeSingle()
    : { data: null };
  const customUser = uuidOr(custom?.user_id);
  const customGifter = uuidOr(custom?.gifter);
  const gift = !!customGifter || !!sub?.is_gift || custom?.gift === "1";
  await record({
    id: `paddle-adj-${d?.id}`,
    source: "paddle",
    email,
    user: gift ? customGifter ?? sub?.gifted_by ?? null : customUser ?? sub?.user_id ?? null,
    giftTo: gift ? customUser ?? sub?.user_id ?? null : null,
    amount,
    currency,
    plan: String(sub?.plan || custom?.plan || ""),
    kind: "refund",
  });
  return ok({ ok: true, event, refunded: true });
}

async function paddleHook(req: Request) {
  const raw = await req.text();
  const secret = (Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "").trim();
  if (!paddleSignatureOk(req.headers.get("Paddle-Signature") ?? "", raw, secret)) return fail(401, "imza hatalı");
  const j = JSON.parse(raw);
  const event = String(j?.event_type ?? "");
  const d = j?.data ?? {};
  if (event.startsWith("subscription.")) return await paddleSubscription(d, event);
  if (event === "transaction.completed") return await paddleTransaction(d, event);
  if (event === "adjustment.created" || event === "adjustment.updated") return await paddleAdjustment(d, event);
  return ok({ ignored: event });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "POST bekleniyor");
  const source = new URL(req.url).searchParams.get("source");
  try {
    if (source === "kofi") return await kofi(req);
    if (source === "patreon") return await patreon(req);
    if (source === "paddle") return await paddleHook(req);
    if (source === "lemon") return await lemon(req);
    return fail(400, "source=paddle, lemon, patreon ya da kofi olmalı");
  } catch (e) {
    console.error(e);
    return fail(500, String((e as Error).message ?? e));
  }
});
