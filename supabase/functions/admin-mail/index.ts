// Yönetim › E-posta: SMTP (Gmail vb.) ayarlarını uygulamadan değiştirir. Supabase paneline girmek gerekmez.
//
// Adres: https://<proje>.supabase.co/functions/v1/admin-mail   (POST {action, ...}; yalnızca site yöneticileri)
//   get   {}                                   → {settings (şifresiz), has_pass, mgmt, auth?: {smtp, confirm_email, rate}}
//   save  {host, port, user, pass?, sender_name, confirm_email?}
//         → mail_settings'e yazar (uygulamanın kendi e-postaları) + Supabase Auth SMTP'yi Management API ile ayarlar
//           (kayıt doğrulama / şifre sıfırlama e-postaları). pass boşsa eski şifre kalır.
//   test  {to?, host?, port?, user?, pass?}    → verilen (ya da kayıtlı) ayarlarla deneme e-postası gönderir
//
// Verify JWT: KAPALI (oturum fonksiyon içinde doğrulanır, profiles.is_admin aranır).
// Gizli değer: PITWALL_MGMT_TOKEN = Supabase hesap erişim anahtarı (supabase.com/dashboard/account/tokens).
//   Yoksa yalnızca uygulamanın kendi e-postaları ayarlanır; kayıt e-postası ayarı için anahtar gerekir.
// Önce c123_guncelleme.sql çalıştırılmalı.

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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

const URL_ = Deno.env.get("SUPABASE_URL")!;
const REF = new URL(URL_).hostname.split(".")[0];
const db = createClient(URL_, serviceKey(), { auth: { persistSession: false } });
const MGMT = () => (Deno.env.get("PITWALL_MGMT_TOKEN") ?? "").trim();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function mgmt(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    method,
    headers: { Authorization: `Bearer ${MGMT()}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    /* düz metin */
  }
  if (!res.ok) {
    const msg = j?.message ?? j?.error ?? text ?? "";
    if (res.status === 401 || res.status === 403)
      throw new Error(`Supabase erişim anahtarı geçersiz ya da yetkisiz (${res.status}). PITWALL_MGMT_TOKEN'ı yenile.`);
    throw new Error(`Supabase ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return j;
}

interface Smtp {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  sender_name: string;
}

async function loadSettings(): Promise<Smtp | null> {
  const { data } = await db.from("mail_settings").select("smtp_host, smtp_port, smtp_user, smtp_pass, sender_name").eq("id", 1).maybeSingle();
  return (data as Smtp) ?? null;
}

const clean = (s: unknown, max = 200) =>
  String(s ?? "")
    .trim()
    .slice(0, max);
const okEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Gmail uygulama şifresi boşluklu gösterilir ("abcd efgh …"); boşluklar atılır */
const cleanPass = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, "")
    .slice(0, 200);

function friendlySmtpError(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(m))
    return "Gmail kullanıcı adı / uygulama şifresi kabul edilmedi. Normal Gmail şifresi değil, 16 haneli uygulama şifresi girilmeli (myaccount.google.com/apppasswords).";
  if (/ETIMEDOUT|ECONNREFUSED|timeout|ENOTFOUND/i.test(m)) return "SMTP sunucusuna bağlanılamadı (sunucu adı / port yanlış olabilir): " + m.slice(0, 200);
  return m.slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });
    const { data: prof } = await db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!prof?.is_admin) return reply(403, { error: "Yalnızca yöneticiler" });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "get") {
      const s = await loadSettings();
      // deno-lint-ignore no-explicit-any
      let auth: any = null;
      let authErr = "";
      if (MGMT()) {
        try {
          const c = await mgmt("GET", "/config/auth");
          auth = {
            smtp: !!c?.smtp_host,
            smtp_host: c?.smtp_host ?? "",
            smtp_user: c?.smtp_user ?? "",
            confirm_email: !c?.mailer_autoconfirm,
            rate: c?.rate_limit_email_sent ?? null,
          };
        } catch (e) {
          authErr = String((e as Error)?.message ?? e);
        }
      }
      return reply(200, {
        settings: s ? { host: s.smtp_host, port: s.smtp_port, user: s.smtp_user, sender_name: s.sender_name } : null,
        has_pass: !!s?.smtp_pass,
        mgmt: !!MGMT(),
        auth,
        auth_error: authErr,
        email: user.email ?? "",
      });
    }

    if (action === "save") {
      const host = clean(body.host) || "smtp.gmail.com";
      const port = Math.max(1, Math.min(65535, Number(body.port) || 465));
      const userName = clean(body.user);
      const sender = clean(body.sender_name, 60) || "SRTR Pitwall";
      if (!okEmail(userName)) return reply(400, { error: "Geçerli bir e-posta adresi gir (Gmail adresin)" });
      const old = await loadSettings();
      const pass = cleanPass(body.pass) || old?.smtp_pass || "";
      if (!pass) return reply(400, { error: "Uygulama şifresini gir" });

      const { error: we } = await db.from("mail_settings").upsert({
        id: 1,
        smtp_host: host,
        smtp_port: port,
        smtp_user: userName,
        smtp_pass: pass,
        sender_name: sender,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });
      if (we) return reply(500, { error: "Kaydedilemedi: " + we.message + " (c123_guncelleme.sql çalıştırıldı mı?)" });

      let authOk = false;
      let authErr = "";
      if (MGMT()) {
        try {
          // deno-lint-ignore no-explicit-any
          const patch: any = {
            external_email_enabled: true,
            smtp_admin_email: userName,
            smtp_host: host,
            smtp_port: String(port),
            smtp_user: userName,
            smtp_pass: pass,
            smtp_sender_name: sender,
            // Kendi SMTP'mizle saatte 30 yerine daha fazla kayıt e-postası (Gmail günde ~500 sınırı var)
            rate_limit_email_sent: Math.max(1, Math.min(1000, Number(body.rate) || 100)),
          };
          if (typeof body.confirm_email === "boolean") patch.mailer_autoconfirm = !body.confirm_email;
          await mgmt("PATCH", "/config/auth", patch);
          authOk = true;
        } catch (e) {
          authErr = String((e as Error)?.message ?? e);
        }
      } else {
        authErr = "PITWALL_MGMT_TOKEN tanımlı değil: kayıt / şifre sıfırlama e-postaları için ayar Supabase'e gönderilemedi.";
      }
      return reply(200, { ok: true, auth_ok: authOk, auth_error: authErr });
    }

    if (action === "confirm") {
      if (!MGMT()) return reply(400, { error: "PITWALL_MGMT_TOKEN tanımlı değil" });
      await mgmt("PATCH", "/config/auth", { mailer_autoconfirm: !body.on });
      return reply(200, { ok: true });
    }

    if (action === "test") {
      const s = await loadSettings();
      const host = clean(body.host) || s?.smtp_host || "smtp.gmail.com";
      const port = Number(body.port) || s?.smtp_port || 465;
      const u = clean(body.user) || s?.smtp_user || "";
      const pass = cleanPass(body.pass) || s?.smtp_pass || "";
      const sender = clean(body.sender_name, 60) || s?.sender_name || "SRTR Pitwall";
      const to = clean(body.to) || user.email || u;
      if (!u || !pass) return reply(400, { error: "Önce e-posta adresini ve uygulama şifresini gir" });
      if (!okEmail(to)) return reply(400, { error: "Deneme e-postası için geçerli bir adres gir" });
      try {
        const tr = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: u, pass }, connectionTimeout: 15000 });
        await tr.sendMail({
          from: `${sender} <${u}>`,
          to,
          subject: "SRTR Pitwall · deneme e-postası",
          text: "Bu bir deneme e-postasıdır. SMTP ayarların çalışıyor.",
          html: `<p style="font-family:Arial,sans-serif;font-size:15px">Bu bir deneme e-postasıdır. <b>SMTP ayarların çalışıyor.</b></p><p style="font-family:Arial,sans-serif;color:#888;font-size:12px">${host}:${port} · ${u}</p>`,
        });
      } catch (e) {
        return reply(400, { error: friendlySmtpError(e) });
      }
      return reply(200, { ok: true, to });
    }

    return reply(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return reply(500, { error: String((e as Error)?.message ?? e) });
  }
});
