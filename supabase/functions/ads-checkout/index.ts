// Reklam ödemesi: reklam verenin ödenmemiş reklamı için Lemon Squeezy'de tek seferlik ödeme sayfası açar.
//
// Adres: https://<proje>.supabase.co/functions/v1/ads-checkout   (POST {"ad_id":"<reklam id>"})
<<<<<<< HEAD
// İndirim kuponu: {"ad_id":…, "coupon":"ERKIN"} (isteğe bağlı) → kupon sunucuda yeniden doğrulanır (coupon_validate, c34;
// reklam modeli impressions / days kuponun paketlerinde olmalı), indirimli tutar custom_price olur ve indirim ödeme
// sayfasında ürün adı/açıklamasında görünür. custom_data.coupon_id ile pro-webhook kullanımı kaydeder (coupon_redeem).
=======
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır). Fiyat istemciden alınmaz: app_config.ad_pricing'den
// yeniden hesaplanır (public.ad_price) ve Lemon'a custom_price (kuruş/cent) olarak gönderilir.
// Ödeme bitince Lemon "order_created" olayını pro-webhook'a (?source=lemon) yollar; meta.custom_data.ad_id
// ile reklam ödendi sayılır ve yayına girer (ya da yönetici onayına düşer).
//
// Bölgesel ödeme: Türkiye'den reklam verenler TL (ad_pricing.currency_tr), diğerleri genel para birimi (ör. USD)
// öder. Lemon'da her mağazanın tek para birimi vardır; bu yüzden para birimi başına bir mağaza tanımlanır.
// O para birimine mağaza tanımlı değilse ödeme ana mağazada, tutar güncel kurla çevrilerek açılır.
//
// Gizli değerler (Supabase → Edge Functions → Secrets):
//   LEMON_API_KEY        Lemon Squeezy → Settings → API → yeni anahtar (hesaptaki tüm mağazalar için geçerli)
//   LEMON_STORE_ID       Ana mağaza numarası (Settings → Stores)
//   LEMON_AD_VARIANT_ID  Ana mağazadaki reklam ürününün (tek seferlik) varyant numarası
//                        ya da LEMON_AD_PRODUCT_ID: ürün numarası (varyant Lemon API'sinden bulunur)
//   LEMON_STORE_CURRENCY (isteğe bağlı) ana mağazanın para birimi, varsayılan TRY
//   LEMON_USD_STORE_ID / LEMON_USD_AD_VARIANT_ID (ya da LEMON_USD_AD_PRODUCT_ID)   (isteğe bağlı) dolar mağazası
//   (başka para birimleri için de aynı kalıp: LEMON_EUR_STORE_ID / LEMON_EUR_AD_VARIANT_ID …)
//   LEMON_TEST_MODE      (isteğe bağlı) "1" ise ödeme sayfası test modunda açılır
//   SITE_URL             (isteğe bağlı) ödeme sonrası dönüş için, varsayılan https://pitwall.simracetr.com

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

const PLACE_NAMES: Record<string, string> = {
  panel_banner: "App banner",
  panel_card: "App card",
  site_home: "Website home banner",
  site_account: "Website account card",
};

const PLACE_NAMES_TR: Record<string, string> = {
  panel_banner: "Uygulama banner",
  panel_card: "Uygulama kart",
  site_home: "Site ana sayfa banner",
  site_account: "Site hesap sayfası kartı",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

/** Ürünün ilk (tek) varyantı — Lemon API'sinden, sonuç saklanır */
const variantCache = new Map<string, string>();
async function variantOf(product: string): Promise<string> {
  if (!product) return "";
  if (variantCache.has(product)) return variantCache.get(product)!;
  const r = await fetch(`https://api.lemonsqueezy.com/v1/variants?filter[product_id]=${encodeURIComponent(product)}`, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${env("LEMON_API_KEY")}` },
  });
  const j = await r.json().catch(() => ({}));
  // deno-lint-ignore no-explicit-any
  const list = (j?.data ?? []) as any[];
  const v = list.find((x) => x?.attributes?.status !== "draft") ?? list[0];
  const id = v?.id ? String(v.id) : "";
  if (id) variantCache.set(product, id);
  return id;
}

/** Reklam varyantı: LEMON_<önek>AD_VARIANT_ID, yoksa LEMON_<önek>AD_PRODUCT_ID'nin varyantı */
async function adVariant(prefix: string) {
  return env(`LEMON_${prefix}AD_VARIANT_ID`) || (await variantOf(env(`LEMON_${prefix}AD_PRODUCT_ID`)));
}

/** Para birimi için mağaza + varyant; yoksa ana mağaza (kur çevrimi gerekir) */
async function storeFor(currency: string) {
  const cur = currency.toUpperCase();
  const store = env(`LEMON_${cur}_STORE_ID`);
  if (store) {
    const variant = await adVariant(`${cur}_`);
    if (variant) return { store, variant, currency: cur };
  }
  const mainCur = (env("LEMON_STORE_CURRENCY") || "TRY").toUpperCase();
  return { store: env("LEMON_STORE_ID"), variant: await adVariant(""), currency: mainCur };
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

<<<<<<< HEAD
/** Kuponlu tutar (c34 coupon_apply ile aynı: 2 haneye yuvarlanır) */
const discounted = (price: number, percent: number) => Math.round(price * (100 - percent) + 1e-6) / 100;

/** Ödeme sayfası metinleri için tutar */
function money(n: number, cur: string, tr: boolean) {
  try {
    return new Intl.NumberFormat(tr ? "tr-TR" : "en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

=======
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    const apiKey = Deno.env.get("LEMON_API_KEY") ?? "";
    if (!apiKey || !env("LEMON_STORE_ID") || !(env("LEMON_AD_VARIANT_ID") || env("LEMON_AD_PRODUCT_ID"))) {
      return reply(503, { error: "Reklam ödemesi henüz yapılandırılmadı" });
    }

    // Çağıran hesap (oturum anahtarından)
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });

    const body = await req.json().catch(() => ({}));
    const embed = body?.embed === true;
    const adId = String(body?.ad_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(adId)) return reply(400, { error: "ad_id eksik" });

    const { data: cfg } = await db.from("app_config").select("ads_enabled").eq("id", 1).maybeSingle();
    if (!cfg?.ads_enabled) return reply(403, { error: "Reklam alımı şu an kapalı" });

    const { data: ad, error: ae } = await db
      .from("ad_campaigns")
      .select("id,user_id,placement,model,quantity,title,status,region")
      .eq("id", adId)
      .maybeSingle();
    if (ae) throw new Error(ae.message);
    if (!ad || ad.user_id !== user.id) return reply(404, { error: "Reklam bulunamadı" });
    if (ad.status !== "unpaid") return reply(409, { error: "Bu reklam zaten ödenmiş" });

    // Fiyat sunucuda yeniden hesaplanır
    const { data: q, error: qe } = await db.rpc("ad_price", {
      p_placement: ad.placement,
      p_model: ad.model,
      p_qty: ad.quantity,
      p_region: ad.region ?? "intl",
    });
    if (qe) return reply(400, { error: qe.message });
    const price = Number(q?.price ?? 0);
    const currency = String(q?.currency ?? "USD");
    if (!(price > 0)) return reply(400, { error: "Fiyat belirlenmemiş" });
<<<<<<< HEAD

    // İndirim kuponu (isteğe bağlı): sunucuda yeniden doğrulanır, istemcinin fiyatına güvenilmez
    const couponCode = typeof body?.coupon === "string" ? body.coupon.trim() : "";
    let coupon: { id: string; code: string; percent: number } | null = null;
    if (couponCode) {
      const { data: cv, error: cve } = await db.rpc("coupon_validate", {
        p_code: couponCode,
        p_user: user.id,
        p_product: "ad",
        p_plan: ad.model,
      });
      if (cve) return reply(400, { error: cve.message });
      const pct = Number(cv?.percent);
      if (!cv?.id || !(pct >= 1 && pct <= 90)) return reply(400, { error: "Kupon bulunamadı" });
      coupon = { id: String(cv.id), code: String(cv.code ?? couponCode).toUpperCase(), percent: pct };
    }

    // Bu para biriminin mağazası; yoksa ana mağaza ve kur çevrimi
    const { store, variant, currency: storeCur } = await storeFor(currency);
    if (!store || !variant) return reply(503, { error: "Reklam ödemesi henüz yapılandırılmadı" });
    let fxRate = 1;
    if (storeCur !== currency) {
      const fx = await rate(currency, storeCur);
      if (!fx) return reply(502, { error: "Kur alınamadı, biraz sonra tekrar dene" });
      fxRate = fx;
    }
    const conv = (n: number) => (storeCur !== currency ? Math.round(n * fxRate * 100) / 100 : n);
    const full = conv(price);
    const charge = coupon ? conv(discounted(price, coupon.percent)) : full;
=======
    // Bu para biriminin mağazası; yoksa ana mağaza ve kur çevrimi
    const { store, variant, currency: storeCur } = await storeFor(currency);
    if (!store || !variant) return reply(503, { error: "Reklam ödemesi henüz yapılandırılmadı" });
    let charge = price;
    if (storeCur !== currency) {
      const fx = await rate(currency, storeCur);
      if (!fx) return reply(502, { error: "Kur alınamadı, biraz sonra tekrar dene" });
      charge = Math.round(price * fx * 100) / 100;
    }
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
    const cents = Math.round(charge * 100);
    if (!(cents > 0)) return reply(400, { error: "Fiyat belirlenmemiş" });
    await db.from("ad_campaigns").update({ price, currency, updated_at: new Date().toISOString() }).eq("id", ad.id);

    // Ödeme sayfası metinleri: TL mağazasında Türkçe, diğerlerinde İngilizce
    const trText = storeCur === "TRY";
    const what = trText
      ? ad.model === "impressions" ? `${ad.quantity.toLocaleString("tr-TR")} gösterim` : `${ad.quantity} gün`
      : ad.model === "impressions" ? `${ad.quantity.toLocaleString("en-US")} impressions` : `${ad.quantity} day${ad.quantity > 1 ? "s" : ""}`;
    const place = (trText ? PLACE_NAMES_TR : PLACE_NAMES)[ad.placement] ?? ad.placement;
<<<<<<< HEAD
    const baseName = trText ? `SRTR Pitwall reklam · ${place}` : `SRTR Pitwall ad · ${place}`;
    const name = coupon
      ? trText
        ? `${baseName} – %${coupon.percent} indirim (${coupon.code})`
        : `${baseName} – ${coupon.percent}% off (${coupon.code})`
      : baseName;
    const couponLine = coupon
      ? trText
        ? ` · Kupon ${coupon.code}: ${money(full, storeCur, true)} yerine ${money(charge, storeCur, true)} (%${coupon.percent} indirim)`
        : ` · Coupon ${coupon.code}: ${money(charge, storeCur, false)} instead of ${money(full, storeCur, false)} (${coupon.percent}% off)`
      : "";
    const couponData = coupon
      ? {
          coupon_id: coupon.id,
          coupon: coupon.code,
          coupon_before: String(full),
          coupon_after: String(charge),
          coupon_currency: storeCur,
        }
      : {};
=======
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          custom_price: cents,
          product_options: {
<<<<<<< HEAD
            name,
            description: `${what} — "${ad.title}"${couponLine}`,
=======
            name: trText ? `SRTR Pitwall reklam · ${place}` : `SRTR Pitwall ad · ${place}`,
            description: `${what} — "${ad.title}"`,
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
            redirect_url: `${SITE}/reklam.html?paid=${ad.id}`,
            enabled_variants: [Number(variant)],
          },
          // embed: sitede Lemon.js katmanı (overlay) olarak açılır; yoksa tam sayfa
          checkout_options: embed ? { embed: true, media: false, logo: true } : { embed: false, media: false },
          checkout_data: {
            email: user.email ?? undefined,
            custom: { ad_id: ad.id, user_id: user.id, ...couponData },
          },
          expires_at: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
          test_mode: Deno.env.get("LEMON_TEST_MODE") === "1",
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
<<<<<<< HEAD
    return reply(200, {
      url,
      price,
      currency,
      charged: charge,
      charged_currency: storeCur,
      ...(coupon ? { coupon: coupon.code, percent: coupon.percent, discounted: discounted(price, coupon.percent) } : {}),
    });
=======
    return reply(200, { url, price, currency, charged: charge, charged_currency: storeCur });
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
