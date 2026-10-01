// Reklam ödemesi: reklam verenin ödenmemiş reklamı için Lemon Squeezy'de tek seferlik ödeme sayfası açar.
//
// Adres: https://<proje>.supabase.co/functions/v1/ads-checkout   (POST {"ad_id":"<reklam id>"})
// Verify JWT: AÇIK (sitedeki oturum anahtarıyla çağrılır). Fiyat istemciden alınmaz: app_config.ad_pricing'den
// yeniden hesaplanır (public.ad_price) ve Lemon'a custom_price (kuruş/cent) olarak gönderilir.
// Ödeme bitince Lemon "order_created" olayını pro-webhook'a (?source=lemon) yollar; meta.custom_data.ad_id
// ile reklam ödendi sayılır ve yayına girer (ya da yönetici onayına düşer).
//
// Gizli değerler (Supabase → Edge Functions → Secrets):
//   LEMON_API_KEY        Lemon Squeezy → Settings → API → yeni anahtar
//   LEMON_STORE_ID       Lemon Squeezy → Settings → Stores → mağaza numarası (ör. 12345)
//   LEMON_AD_VARIANT_ID  Reklam için açılan tek seferlik ürünün varyant numarası
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
    const store = Deno.env.get("LEMON_STORE_ID") ?? "";
    const variant = Deno.env.get("LEMON_AD_VARIANT_ID") ?? "";
    if (!apiKey || !store || !variant) return reply(503, { error: "Reklam ödemesi henüz yapılandırılmadı" });

    // Çağıran hesap (oturum anahtarından)
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });

    const body = await req.json().catch(() => ({}));
    const adId = String(body?.ad_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(adId)) return reply(400, { error: "ad_id eksik" });

    const { data: cfg } = await db.from("app_config").select("ads_enabled").eq("id", 1).maybeSingle();
    if (!cfg?.ads_enabled) return reply(403, { error: "Reklam alımı şu an kapalı" });

    const { data: ad, error: ae } = await db
      .from("ad_campaigns")
      .select("id,user_id,placement,model,quantity,title,status")
      .eq("id", adId)
      .maybeSingle();
    if (ae) throw new Error(ae.message);
    if (!ad || ad.user_id !== user.id) return reply(404, { error: "Reklam bulunamadı" });
    if (ad.status !== "unpaid") return reply(409, { error: "Bu reklam zaten ödenmiş" });

    // Fiyat sunucuda yeniden hesaplanır
    const { data: q, error: qe } = await db.rpc("ad_price", { p_placement: ad.placement, p_model: ad.model, p_qty: ad.quantity });
    if (qe) return reply(400, { error: qe.message });
    const price = Number(q?.price ?? 0);
    const currency = String(q?.currency ?? "USD");
    const cents = Math.round(price * 100);
    if (!(cents > 0)) return reply(400, { error: "Fiyat belirlenmemiş" });
    await db.from("ad_campaigns").update({ price, currency, updated_at: new Date().toISOString() }).eq("id", ad.id);

    const what = ad.model === "impressions" ? `${ad.quantity.toLocaleString("en-US")} impressions` : `${ad.quantity} day${ad.quantity > 1 ? "s" : ""}`;
    const place = PLACE_NAMES[ad.placement] ?? ad.placement;
    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          custom_price: cents,
          product_options: {
            name: `SRTR Pitwall ad · ${place}`,
            description: `${what} — "${ad.title}"`,
            redirect_url: `${SITE}/reklam.html?paid=${ad.id}`,
            enabled_variants: [Number(variant)],
          },
          checkout_options: { embed: false, media: false },
          checkout_data: {
            email: user.email ?? undefined,
            custom: { ad_id: ad.id, user_id: user.id },
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
    return reply(200, { url, price, currency });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message ?? e) });
  }
});
