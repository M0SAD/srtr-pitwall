// PRO üyelik ödemesi: giriş yapmış kullanıcı için Lemon Squeezy'de abonelik ödeme sayfası açar.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-checkout   (POST {"plan":"1m|3m|6m|12m","region":"tr|intl"})
// Hediye PRO: {"plan":…, "region":…, "gift_to":"<alıcının hesap kimliği>"} → abonelik alıcıya işlenir
// (custom_data.user_id = alıcı, custom_data.gifter = çağıran). Ödeme sayfasındaki e-posta ÇAĞIRANIN kendi
// e-postasıdır: fatura, makbuz ve yenileme ödemeleri ona aittir; alıcının e-postası hiçbir yerde gösterilmez.
// Hediye eden aboneliği gift-cancel ile istediği zaman sonlandırabilir.
// İndirim kuponu: {"coupon":"ERKIN"} (isteğe bağlı) → kupon sunucuda yeniden doğrulanır (coupon_validate, c34).
// custom_price HER ZAMAN tam (güncel) fiyattır; Lemon abonelikte custom_price'ı yenilemelerde de kullandığı için
// indirim custom_price'a gömülmez. Bunun yerine bu ödeme için Lemon'da tek kullanımlık bir indirim kodu üretilir
// (POST /v1/discounts, yalnızca bu mağazadaki PRO varyantlarında geçerli, en çok 1 kullanım, ödeme sayfasıyla aynı
// anda sona erer) ve checkout_data.discount_code ile ödeme sayfasına hazır girilir:
//   - aylık plan, kuponun bitiş tarihi var → "repeating": kupon geçerliyken yapılacak aylık ödeme sayısı kadar ay
//     (en az 1); kupon bitince yenilemeler tam fiyattan
//   - aylık plan, kuponun bitiş tarihi yok → "forever" (kupon hiç bitmediği için tüm ödemeler geçerlilik içinde)
//   - 3 / 6 / 12 aylık plan → "once": indirim yalnızca ilk ödemede, yenilemeler tam fiyattan
// İndirim kodu oluşturulamazsa ödeme sayfası açılmaz (yanlış tutar alınmasın diye "Kupon şu an uygulanamadı").
// İndirim ödeme sayfasında ürün adı/açıklamasında da görünür. Kupon kimliği custom_data.coupon_id ile
// pro-webhook'a gider; ödeme gelince kullanım kaydedilir (coupon_redeem).
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır). Fiyat istemciden alınmaz:
// app_config.pro_pricing'den okunur ve Lemon'a custom_price (kuruş/cent, kuponsuz tam fiyat) olarak gönderilir.
// Abonelikte bu tutar tüm yenilemelerde de kullanılır (fiyat değişikliği yalnızca yeni aboneliklere uygulanır).
// Lemon'da tek abonelik ürünü ("SRTR Pitwall PRO") ve 4 varyantı vardır: her 1 / 3 / 6 / 12 ayda bir yenilenen
// (varyant fiyatı önemsiz, yer tutucu). Ödeme bitince Lemon abonelik olaylarını pro-webhook'a (?source=lemon) yollar;
// meta.custom_data.user_id ile PRO bu hesaba işlenir.
//
// Bölgesel ödeme: Türkiye'den gelenler, o plan için Türkiye fiyatı (price_tr) girildiyse TL (pro_pricing.currency_tr),
// diğerleri genel fiyatı (pro_pricing.currency, ör. USD) öder. Lemon'da her mağazanın tek para birimi vardır; bu yüzden
// para birimi başına bir mağaza tanımlanabilir. O para birimine mağaza tanımlı değilse ödeme ana mağazada, tutar güncel
// kurla çevrilerek açılır.
//
// Gizli değerler (Supabase → Edge Functions → Secrets):
//   LEMON_API_KEY            Lemon Squeezy → Settings → API → yeni anahtar (hesaptaki tüm mağazalar için geçerli)
//   LEMON_STORE_ID           Ana mağaza numarası (Settings → Stores)
//   LEMON_STORE_CURRENCY     (isteğe bağlı) ana mağazanın para birimi, varsayılan TRY
//   LEMON_PRO_1M_VARIANT_ID  Ana mağazadaki PRO ürününün aylık varyant numarası
//   LEMON_PRO_3M_VARIANT_ID  … 3 ayda bir yenilenen varyant
//   LEMON_PRO_6M_VARIANT_ID  … 6 ayda bir yenilenen varyant
//   LEMON_PRO_12M_VARIANT_ID … yıllık varyant
//   LEMON_USD_STORE_ID / LEMON_USD_PRO_1M_VARIANT_ID … LEMON_USD_PRO_12M_VARIANT_ID
//                            (isteğe bağlı) dolar mağazası ve oradaki PRO varyantları
//                            (başka para birimleri için de aynı kalıp: LEMON_EUR_STORE_ID / LEMON_EUR_PRO_1M_VARIANT_ID …)
//   LEMON_TEST_MODE          (isteğe bağlı) "1" ise ödeme sayfası test modunda açılır
//   SITE_URL                 (isteğe bağlı) ödeme sonrası dönüş için, varsayılan https://pitwall.simracetr.com

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
const SITE = (Deno.env.get("SITE_URL") ?? "https://pitwall.simracetr.com").replace(/\/$/, "");

const MONTHS: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Ana mağazadaki plan varyantı */
const mainVariant = (plan: string) => Deno.env.get(`LEMON_PRO_${plan.toUpperCase()}_VARIANT_ID`) ?? "";

/** Para birimi + plan için mağaza ve varyant; yoksa ana mağaza (kur çevrimi gerekir) */
function storeFor(currency: string, plan: string) {
  const cur = currency.toUpperCase();
  const store = Deno.env.get(`LEMON_${cur}_STORE_ID`) ?? "";
  const variant = Deno.env.get(`LEMON_${cur}_PRO_${plan.toUpperCase()}_VARIANT_ID`) ?? "";
  if (store && variant) return { store, variant, currency: cur };
  const mainCur = (Deno.env.get("LEMON_STORE_CURRENCY") ?? "TRY").toUpperCase();
  return { store: Deno.env.get("LEMON_STORE_ID") ?? "", variant: mainVariant(plan), currency: mainCur };
}

/** Güncel kur (from → to); başarısızsa null */
async function rate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    const j = await r.json();
    const v = Number(j?.rates?.[to]);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Kuponlu tutar (c34 coupon_apply ile aynı: 2 haneye yuvarlanır) */
const discounted = (price: number, percent: number) => Math.round(price * (100 - percent) + 1e-6) / 100;

/** Kupon geçerliyken yapılacak aylık ödeme sayısı (ilk ödeme şimdi; sonra her ay), en az 1 */
function monthsWithin(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const end = new Date(validUntil).getTime();
  if (!Number.isFinite(end)) return null;
  const start = new Date();
  let n = 1;
  while (n < 120) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + n);
    if (d.getTime() >= end) break;
    n++;
  }
  return n;
}

/** Lemon indirim kodu: yalnızca büyük harf ve rakam, 3–256 karakter */
function discountCode(coupon: string): string {
  const base = coupon.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  let tail = "";
  for (const b of rnd) tail += abc[b % abc.length];
  return `PW${base}${tail}`;
}

/** Bu mağazadaki tüm PRO varyantları (indirim yalnızca bunlarda geçerli) */
function proVariants(store: string, currency: string): string[] {
  const cur = currency.toUpperCase();
  const out = new Set<string>();
  for (const plan of Object.keys(MONTHS)) {
    const P = plan.toUpperCase();
    const own = Deno.env.get(`LEMON_${cur}_STORE_ID`) ?? "";
    const v = own === store ? Deno.env.get(`LEMON_${cur}_PRO_${P}_VARIANT_ID`) ?? "" : "";
    if (v) out.add(v.trim());
    if (store === (Deno.env.get("LEMON_STORE_ID") ?? "")) {
      const m = mainVariant(plan);
      if (m) out.add(m.trim());
    }
  }
  return [...out].filter((v) => /^\d+$/.test(v));
}

/** Ödeme sayfası metinleri için tutar */
function money(n: number, cur: string, tr: boolean) {
  try {
    return new Intl.NumberFormat(tr ? "tr-TR" : "en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const NOT_READY = "PRO ödemesi henüz yapılandırılmadı";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    const apiKey = Deno.env.get("LEMON_API_KEY") ?? "";
    if (!apiKey || !(Deno.env.get("LEMON_STORE_ID") ?? "")) return reply(503, { error: NOT_READY });

    // Çağıran hesap (oturum anahtarından)
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });

    const body = await req.json().catch(() => ({}));
    const embed = body?.embed === true;
    const plan = String(body?.plan ?? "");
    const months = MONTHS[plan];
    if (!months) return reply(400, { error: "Geçersiz plan" });
    const region = body?.region === "tr" ? "tr" : "intl";

    // Hediye: alıcı kayıtlı bir üye olmalı ve çağıran olmamalı
    let giftTo: string | null = null;
    let giftName = "";
    if (body?.gift_to != null && body?.gift_to !== "") {
      const g = String(body.gift_to);
      if (!/^[0-9a-f-]{36}$/i.test(g)) return reply(400, { error: "Geçersiz alıcı" });
      if (g.toLowerCase() === user.id.toLowerCase()) return reply(400, { error: "Kendine hediye edemezsin" });
      const { data: rp, error: re } = await db.from("profiles").select("id,display_name").eq("id", g).maybeSingle();
      if (re) throw new Error(re.message);
      if (!rp) return reply(404, { error: "Alıcı bulunamadı" });
      giftTo = rp.id;
      giftName = String(rp.display_name || "").trim() || "?";
    }

    // Fiyat sunucuda app_config.pro_pricing'den
    const { data: cfg, error: ce } = await db.from("app_config").select("pro_pricing").eq("id", 1).maybeSingle();
    if (ce) throw new Error(ce.message);
    const pr = cfg?.pro_pricing ?? {};
    const pl = pr?.plans?.[plan] ?? {};
    const priceTr = Number(pl?.price_tr);
    let price: number;
    let currency: string;
    if (region === "tr" && priceTr > 0) {
      price = priceTr;
      currency = String(pr?.currency_tr || "TRY").toUpperCase();
    } else {
      price = Number(pl?.price);
      currency = String(pr?.currency || "USD").toUpperCase();
    }
    if (!(price > 0)) return reply(400, { error: "Bu plan için fiyat belirlenmemiş" });

    // İndirim kuponu (isteğe bağlı): sunucuda yeniden doğrulanır, istemcinin fiyatına güvenilmez
    const couponCode = typeof body?.coupon === "string" ? body.coupon.trim() : "";
    let coupon: { id: string; code: string; percent: number; validUntil: string | null } | null = null;
    if (couponCode) {
      const { data: cv, error: cve } = await db.rpc("coupon_validate", {
        p_code: couponCode,
        p_user: user.id,
        p_product: giftTo ? "gift" : "pro",
        p_plan: plan,
      });
      if (cve) return reply(400, { error: cve.message });
      const pct = Number(cv?.percent);
      if (!cv?.id || !(pct >= 1 && pct <= 90)) return reply(400, { error: "Kupon bulunamadı" });
      // Bitiş tarihi (aylık planda indirimin kaç ödeme süreceği buna göre)
      const { data: cr, error: cre } = await db.from("coupons").select("valid_until").eq("id", String(cv.id)).maybeSingle();
      if (cre) throw new Error(cre.message);
      coupon = {
        id: String(cv.id),
        code: String(cv.code ?? couponCode).toUpperCase(),
        percent: pct,
        validUntil: cr?.valid_until ? String(cr.valid_until) : null,
      };
    }

    // Bu para biriminin mağazası; yoksa ana mağaza ve kur çevrimi
    const { store, variant, currency: storeCur } = storeFor(currency, plan);
    if (!store || !variant) return reply(503, { error: NOT_READY });
    let fxRate = 1;
    if (storeCur !== currency) {
      const fx = await rate(currency, storeCur);
      if (!fx) return reply(502, { error: "Kur alınamadı, biraz sonra tekrar dene" });
      fxRate = fx;
    }
    const conv = (n: number) => (storeCur !== currency ? Math.round(n * fxRate * 100) / 100 : n);
    const full = conv(price);
    const charge = coupon ? conv(discounted(price, coupon.percent)) : full;
    // custom_price her zaman tam fiyat (yenilemeler bu tutardan); indirim Lemon indirim koduyla
    const cents = Math.round(full * 100);
    if (!(cents > 0) || !(Math.round(charge * 100) > 0)) return reply(400, { error: "Bu plan için fiyat belirlenmemiş" });
    const testMode = Deno.env.get("LEMON_TEST_MODE") === "1";
    const expiresAt = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

    // Kupon: aylık planda kupon geçerliyken (bitiş yoksa her zaman), diğer planlarda yalnızca ilk ödeme
    let duration: "once" | "repeating" | "forever" = "once";
    let durMonths = 1;
    if (coupon && months === 1) {
      const n = monthsWithin(coupon.validUntil);
      if (n == null) duration = "forever";
      else if (n > 1) {
        duration = "repeating";
        durMonths = n;
      }
    }
    let lemonCode = "";
    if (coupon) {
      const variants = proVariants(String(store), storeCur);
      if (!variants.includes(String(variant))) variants.push(String(variant));
      lemonCode = discountCode(coupon.code);
      const dres = await fetch("https://api.lemonsqueezy.com/v1/discounts", {
        method: "POST",
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          data: {
            type: "discounts",
            attributes: {
              name: `SRTR Pitwall ${coupon.code} %${coupon.percent}`,
              code: lemonCode,
              amount: coupon.percent,
              amount_type: "percent",
              duration,
              ...(duration === "repeating" ? { duration_in_months: durMonths } : {}),
              is_limited_to_products: true,
              is_limited_redemptions: true,
              max_redemptions: 1,
              expires_at: expiresAt,
              test_mode: testMode,
            },
            relationships: {
              store: { data: { type: "stores", id: String(store) } },
              variants: { data: variants.map((id) => ({ type: "variants", id })) },
            },
          },
        }),
      });
      const dj = await dres.json().catch(() => ({}));
      if (!dres.ok || !dj?.data?.id) {
        console.error("lemon discount", dres.status, JSON.stringify(dj?.errors ?? dj));
        return reply(502, { error: "Kupon şu an uygulanamadı" });
      }
    }

    // Ödeme sayfası metinleri: TL mağazasında Türkçe, diğerlerinde İngilizce
    const trText = storeCur === "TRY";
    const lines: string[] = [];
    if (giftTo) lines.push(trText ? `Hediye: ${giftName}` : `Gift for ${giftName}`);
    if (coupon) {
      const until = coupon.validUntil ? new Date(coupon.validUntil) : null;
      const untilTxt = (tr: boolean) =>
        until ? until.toLocaleDateString(tr ? "tr-TR" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }) : "";
      const scopeTr =
        duration === "once"
          ? "ilk ödemede; yenilemeler güncel fiyattan"
          : duration === "forever"
            ? "tüm ödemelerde"
            : `kupon geçerli olduğu sürece (${untilTxt(true)} tarihine kadar, ${durMonths} ödeme); sonra güncel fiyattan`;
      const scopeEn =
        duration === "once"
          ? "first payment only; renewals at the current price"
          : duration === "forever"
            ? "on every payment"
            : `while the coupon is valid (until ${untilTxt(false)}, ${durMonths} payments); then the current price`;
      lines.push(
        trText
          ? `Kupon ${coupon.code}: ${money(full, storeCur, true)} yerine ${money(charge, storeCur, true)} (%${coupon.percent} indirim, ${scopeTr})`
          : `Coupon ${coupon.code}: ${money(charge, storeCur, false)} instead of ${money(full, storeCur, false)} (${coupon.percent}% off, ${scopeEn})`,
      );
    }
    const title = coupon
      ? trText
        ? `SRTR Pitwall PRO – %${coupon.percent} indirim (${coupon.code})`
        : `SRTR Pitwall PRO – ${coupon.percent}% off (${coupon.code})`
      : "SRTR Pitwall PRO";
    const couponData = coupon
      ? {
          coupon_id: coupon.id,
          coupon: coupon.code,
          coupon_before: String(full),
          coupon_after: String(charge),
          coupon_currency: storeCur,
          coupon_lemon_code: lemonCode,
          coupon_duration: duration === "repeating" ? `repeating:${durMonths}` : duration,
        }
      : {};

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          custom_price: cents,
          product_options: {
            // Lemon başlığın yanına varyant adını zaten ekler ("SRTR Pitwall PRO (12 aylık)")
            name: title,
            ...(lines.length ? { description: lines.join(" · ") } : {}),
            redirect_url: `${SITE}/hesap.html?paid=${giftTo ? "gift" : "pro"}`,
            enabled_variants: [Number(variant)],
          },
          // embed: sitede Lemon.js katmanı (overlay) olarak açılır; yoksa tam sayfa
          checkout_options: embed ? { embed: true, media: false, logo: true } : { embed: false, media: false },
          checkout_data: {
            // Hediyede de ödeyenin (çağıranın) kendi e-postası: fatura/makbuz/yenileme ona gider
            email: user.email ?? undefined,
            ...(lemonCode ? { discount_code: lemonCode } : {}),
            custom: giftTo
              ? { user_id: giftTo, gifter: user.id, plan, gift: "1", ...couponData }
              : { user_id: user.id, plan, ...couponData },
          },
          expires_at: expiresAt,
          test_mode: testMode,
        },
        relationships: {
          store: { data: { type: "stores", id: String(store) } },
          variant: { data: { type: "variants", id: String(variant) } },
        },
      },
    };
    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    const url = j?.data?.attributes?.url;
    if (!res.ok || !url) {
      console.error("lemon checkout", res.status, JSON.stringify(j?.errors ?? j));
      return reply(502, { error: "Ödeme sayfası açılamadı" });
    }
    return reply(200, {
      url,
      price,
      currency,
      charged: charge,
      charged_currency: storeCur,
      ...(coupon
        ? {
            coupon: coupon.code,
            percent: coupon.percent,
            discounted: discounted(price, coupon.percent),
            coupon_duration: duration,
            ...(duration === "repeating" ? { coupon_months: durMonths } : {}),
          }
        : {}),
    });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
