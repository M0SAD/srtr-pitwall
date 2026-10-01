// PRO üyelik ödemesi: giriş yapmış kullanıcı için Lemon Squeezy'de abonelik ödeme sayfası açar.
//
// Adres: https://<proje>.supabase.co/functions/v1/pro-checkout   (POST {"plan":"1m|3m|6m|12m","region":"tr|intl"})
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır). Fiyat istemciden alınmaz:
// app_config.pro_pricing'den okunur ve Lemon'a custom_price (kuruş/cent) olarak gönderilir. Abonelikte bu tutar
// tüm yenilemelerde de kullanılır (fiyat değişikliği yalnızca yeni aboneliklere uygulanır).
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
    const plan = String(body?.plan ?? "");
    const months = MONTHS[plan];
    if (!months) return reply(400, { error: "Geçersiz plan" });
    const region = body?.region === "tr" ? "tr" : "intl";

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

    // Bu para biriminin mağazası; yoksa ana mağaza ve kur çevrimi
    const { store, variant, currency: storeCur } = storeFor(currency, plan);
    if (!store || !variant) return reply(503, { error: NOT_READY });
    let charge = price;
    if (storeCur !== currency) {
      const fx = await rate(currency, storeCur);
      if (!fx) return reply(502, { error: "Kur alınamadı, biraz sonra tekrar dene" });
      charge = Math.round(price * fx * 100) / 100;
    }
    const cents = Math.round(charge * 100);
    if (!(cents > 0)) return reply(400, { error: "Bu plan için fiyat belirlenmemiş" });

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          custom_price: cents,
          product_options: {
            name: storeCur === "TRY" ? `SRTR Pitwall PRO · ${months} aylık` : `SRTR Pitwall PRO · ${months} month${months > 1 ? "s" : ""}`,
            redirect_url: `${SITE}/hesap.html?paid=pro`,
            enabled_variants: [Number(variant)],
          },
          checkout_options: { embed: false, media: false },
          checkout_data: {
            email: user.email ?? undefined,
            custom: { user_id: user.id, plan },
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
    return reply(200, { url, price, currency, charged: charge, charged_currency: storeCur });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
