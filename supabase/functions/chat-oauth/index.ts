// Canlı Sohbet › Sohbete yaz: YouTube (Google) ve Kick OAuth anahtar değişimi / yenileme.
//
// Adres: https://<proje>.supabase.co/functions/v1/chat-oauth
// İstek (POST, JSON):
//   { "provider": "youtube" | "kick", "action": "exchange", "code": "...", "code_verifier": "...", "redirect_uri": "http://127.0.0.1:8767/callback" }
//   { "provider": "youtube" | "kick", "action": "refresh", "refresh_token": "..." }
//   { "provider": "youtube" | "kick", "action": "check", "client_id": "..." }   ("Bağlantıyı test et": sağlayıcıya gitmez)
// "exchange" ve "check" isteğindeki client_id (isteğe bağlı, gizli değil): programın giriş adresinde kullandığı kimlik.
// Secret'taki CLIENT_ID ile aynı değilse sağlayıcının anlaşılmaz "invalid_grant" hatası yerine açık bir hata döner.
// Yanıt: sağlayıcının token yanıtı (access_token, refresh_token?, expires_in, scope, token_type) ya da { "error": "..." }.
//
// Neden sunucuda: Google ve Kick bu akışta istemci gizli anahtarı (client_secret) ister; anahtar programın içine konamaz.
// Program kodu PKCE (S256) ile alır, bu işlev gizli anahtarı ekleyip sağlayıcıya iletir. Anahtarlar SAKLANMAZ / kaydedilmez.
//
// Verify JWT: AÇIK yayınlanmalı (supabase functions deploy chat-oauth — varsayılan). Ayrıca işlev içinde JWT'nin
// "authenticated" rolünde bir üyeye ait olduğu denetlenir (anon anahtarıyla çağrılamaz). Ağ geçidi imzayı doğruladığı için
// içerik (payload) burada sadece okunur.
//
// Gizli değerler (Supabase › Edge Functions › Secrets):
//   YT_CLIENT_ID, YT_CLIENT_SECRET      Google Cloud OAuth istemcisi (Masaüstü uygulaması)
//   KICK_CLIENT_ID, KICK_CLIENT_SECRET  Kick geliştirici uygulaması
// Bu dosya kendi başınadır (ek paket yok).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Programın kullandığı yerel dönüş adresleri (başka adrese kod gönderilmesin) */
const REDIRECTS: Record<string, string[]> = {
  youtube: ["http://127.0.0.1:8767/callback", "http://localhost:8767/callback"],
  kick: ["http://localhost:8767/callback", "http://127.0.0.1:8767/callback"],
};

const TOKEN_URL: Record<string, string> = {
  youtube: "https://oauth2.googleapis.com/token",
  kick: "https://id.kick.com/oauth/token",
};

function creds(provider: string): { id: string; secret: string } {
  const p = provider === "youtube" ? "YT" : "KICK";
  return { id: Deno.env.get(`${p}_CLIENT_ID`) ?? "", secret: Deno.env.get(`${p}_CLIENT_SECRET`) ?? "" };
}

/** JWT içeriği (imza ağ geçidinde doğrulandı) */
function jwtPayload(req: Request): Record<string, unknown> | null {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });

  const claims = jwtPayload(req);
  if (!claims || claims.role !== "authenticated" || typeof claims.sub !== "string") {
    return reply(401, { error: "Giriş yapmalısın" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Geçersiz istek" });
  }
  const provider = str(body.provider, 20);
  const action = str(body.action, 20);
  if (!TOKEN_URL[provider]) return reply(400, { error: "Bilinmeyen sağlayıcı" });

  const { id, secret } = creds(provider);
  if (!id || !secret) return reply(503, { error: `${provider === "youtube" ? "YouTube" : "Kick"} girişi sunucuda yapılandırılmadı` });

  // Programın (Yönetim › Canlı Sohbet ayarları) kullandığı Client ID, secret'taki ile aynı olmalı
  const sentId = str(body.client_id, 200).trim();
  const idMatch = sentId ? sentId === id.trim() : null;
  if (action === "check") return reply(200, { ok: true, configured: true, client_id_match: idMatch, version: 2 });
  const pname = provider === "youtube" ? "YouTube" : "Kick";
  if (action === "exchange" && idMatch === false) {
    return reply(400, { error: `Yönetim'deki ${pname} Client ID ile Supabase secret ${provider === "youtube" ? "YT" : "KICK"}_CLIENT_ID aynı değil; ikisine de aynı Client ID yazılmalı` });
  }

  const form = new URLSearchParams();
  form.set("client_id", id);
  form.set("client_secret", secret);
  if (action === "exchange") {
    const code = str(body.code, 4096);
    const verifier = str(body.code_verifier, 256);
    const redirect = str(body.redirect_uri, 200);
    if (!code || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return reply(400, { error: "Eksik ya da geçersiz kod" });
    if (!REDIRECTS[provider].includes(redirect)) return reply(400, { error: "Geçersiz dönüş adresi" });
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("code_verifier", verifier);
    form.set("redirect_uri", redirect);
  } else if (action === "refresh") {
    const rt = str(body.refresh_token, 4096);
    if (!rt) return reply(400, { error: "Eksik yenileme anahtarı" });
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", rt);
  } else {
    return reply(400, { error: "Bilinmeyen işlem" });
  }

  try {
    const r = await fetch(TOKEN_URL[provider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      // JSON değil (ör. güvenlik duvarı / bakım sayfası): HTML gövdesi yerine kısa bir açıklama
      j = { error: /^\s*</.test(text) ? "sağlayıcı JSON yerine bir web sayfası döndürdü (istek engellenmiş olabilir)" : text.slice(0, 200) };
    }
    if (!r.ok || typeof j.access_token !== "string") {
      const code = typeof j.error === "string" ? j.error : "";
      const desc = String(j.error_description ?? j.message ?? "");
      const err = [code, desc].filter((x, i, a) => x && a.indexOf(x) === i).join(": ") || "yanıtta access_token yok";
      // Sağlayıcının durum kodu ve hata metni olduğu gibi iletilir (gizli değer içermez).
      // invalid_grant: kod kullanılmış / süresi dolmuş / yenileme anahtarı iptal → program yeniden giriş ister
      return reply(r.status >= 500 ? 502 : 400, { error: `${pname} HTTP ${r.status}: ${err}` });
    }
    // Sadece programın ihtiyaç duyduğu alanlar
    return reply(200, {
      access_token: j.access_token,
      refresh_token: typeof j.refresh_token === "string" ? j.refresh_token : undefined,
      expires_in: typeof j.expires_in === "number" ? j.expires_in : Number(j.expires_in) || undefined,
      scope: j.scope,
      token_type: j.token_type,
    });
  } catch (e) {
    return reply(502, { error: `Sağlayıcıya ulaşılamadı: ${(e as Error).message}` });
  }
});
