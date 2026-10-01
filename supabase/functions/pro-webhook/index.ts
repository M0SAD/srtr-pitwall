// PRO üyelik bildirimi: Patreon ve Ko-fi ödeme bildirimlerini alır, ödeyen e-postaya PRO süresi verir.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-webhook?source=lemon  (ya da patreon / kofi)
// Gizli değerler (Supabase -> Edge Functions -> Secrets):
//   PATREON_WEBHOOK_SECRET  Patreon webhook sayfasındaki "secret"
//   KOFI_VERIFICATION_TOKEN Ko-fi -> API -> Verification Token
//   LEMON_WEBHOOK_SECRET    Lemon Squeezy -> Settings -> Webhooks -> signing secret (source=lemon)
//   LEMON_AD_VARIANT_ID     (isteğe bağlı) reklam ürününün varyantı; reklam siparişleri (order_created /
//                           order_refunded, custom_data.ad_id) bu varyantla eşleşmeli (bkz. ads-checkout).
//                           LEMON_USD_AD_VARIANT_ID gibi para birimi mağazalarının varyantları da kabul edilir.
// PRO abonelikleri pro-checkout'un açtığı ödeme sayfasından gelir (custom_data.user_id + custom_data.plan);
// plan adı Lemon'daki varyant adından alınır (ör. "Monthly" / "Yearly"), yoksa custom_data.plan ("1m" …).
<<<<<<< HEAD
// Hediye PRO (pro-checkout gift_to): custom_data.user_id = alıcı, custom_data.gifter = hediye eden (ödeyen).
// Abonelik alıcıya işlenir (apply_subscription p_gifter); fatura/ödeme kaydı ise hediye edene yazılır
// (makbuz ona gider), alıcı payments.gift_to'da tutulur. Önce c26_guncelleme.sql çalıştırılmalı.
// İndirim kuponu (c34): pro-checkout / ads-checkout custom_data'ya coupon_id, coupon_before, coupon_after,
// coupon_currency ekler; ödeme gelince kullanım coupon_redeem ile kaydedilir (abonelik / sipariş başına bir kez).
// PRO'da indirim Lemon indirim koduyla (checkout_data.discount_code) uygulanır, custom_price tam fiyattır; kullanımın
// indirimli tutarı (amount_after) ilk abonelik faturasının toplamından (total) alınır.
=======
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "POST bekleniyor");
  const source = new URL(req.url).searchParams.get("source");
  try {
    if (source === "kofi") return await kofi(req);
    if (source === "patreon") return await patreon(req);
    if (source === "lemon") return await lemon(req);
    return fail(400, "source=lemon, patreon ya da kofi olmalı");
  } catch (e) {
    console.error(e);
    return fail(500, String((e as Error).message ?? e));
  }
});
