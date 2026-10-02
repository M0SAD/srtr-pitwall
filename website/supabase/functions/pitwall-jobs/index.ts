// SRTR Pitwall sunucu işleri (veritabanı tarafından çağrılır, uygulama çağırmaz):
//   {"type":"report","id":"<rapor id>"}  Yeni rapor: yöneticilere e-posta gönderir
//   {"type":"friend_request","id":"<bildirim id>"}  Yeni arkadaşlık isteği: karşı tarafa temalı e-posta gönderir
//   {"type":"pro_expiring","id":"<bildirim id>"}  PRO bitmesine 10 gün ve son 1 gün kala hatırlatma e-postası
//   {"type":"device_alert","id":"<bildirim id>"}   Yöneticiye: hesap cihaz sınırını aştı
//   {"type":"pro_changed","id":"<bildirim id>"}   Yönetici PRO süresini elle değiştirdi (kullanıcıya, kendi dilinde)
//   {"type":"support_new" | "support_user_reply","id":"<bildirim id>"}  Yöneticiye: yeni destek talebi / yeni mesaj
//   {"type":"support_reply","id":"<bildirim id>"}  Kullanıcıya: destek talebine yanıt geldi (kendi dilinde)
//   {"type":"ad_live" | "ad_rejected" | "ad_ended","id":"<bildirim id>"}  Reklam verene: reklam yayında / reddedildi-durduruldu / bitti
//   {"type":"ad_reported" | "ad_pending","id":"<bildirim id>"}  Yöneticiye: reklam raporlandı (gizlendi) / onay bekliyor
//   {"type":"payment_new","id":"<bildirim id>"}  Yöneticiye: yeni ödeme ya da iade (PRO, reklam, Patreon, Ko-fi)
//   {"type":"payment_receipt","id":"<bildirim id>"}  Ödeyene: ödeme makbuzu / teşekkür ya da iade onayı (kendi dilinde);
//                                        hediye PRO ödemesinde hediye edene "hediye ödemen alındı" makbuzu
//   {"type":"pro_gift","id":"<bildirim id>"}  Alıcıya: bir üye sana PRO hediye etti (hediye paketi temalı; plan, geçerlilik)
//   {"type":"pro_gift_sent","id":"<bildirim id>"}  Hediye edene: hediyen ulaştı (alıcı, plan, sonraki yenileme)
//   {"type":"pro_gift_ended","id":"<bildirim id>"}  Alıcıya: hediye eden aboneliği sonlandırdı, PRO şu tarihe kadar sürer
//   {"type":"message_reported","id":"<bildirim id>"}  Yöneticiye: bir üye arkadaş mesajını raporladı (sebep, metin, kişiler)
//   {"type":"voice_submission","id":"<bildirim id>"}  Yöneticiye: bir üye ses paketi gönderdi (dil, paket adı, bağlantı, mesaj)
//   {"type":"team_invite" | "team_request" | "team_accepted" | "team_announcement" | "team_role","id":"<bildirim id>"}
//                                        Takım bildirimleri (kendi dilinde; "teams" e-posta tercihi açıksa)
//   Kullanıcı e-postaları profiles.email_prefs tercihine uyar (c35: friends, teams, support, ads, pro, shots);
//   ödeme, hediye PRO, PRO değişikliği ve yönetici e-postaları her zaman gider.
//   {"type":"cleanup"}                   6 aydır açılmayan ekran görüntülerini siler,
//                                        sahibine uygulama içi bildirim ve e-posta gönderir
//
// Kurulum: docs/SUPABASE.md → "Sunucu işleri". JWT doğrulaması kapalı çalışır (veritabanı çağırır);
// işler tekrar çağrılsa da zarar vermez (rapor bir kez bildirilir, temizlik sadece süresi dolanları siler).
//
// Gizli değerler (Edge Functions → Secrets):
//   SMTP_PASS  Gmail uygulama şifresi (e-posta göndermek için; yoksa sadece uygulama içi bildirim)
//   SMTP_USER  (isteğe bağlı) varsayılan: erkinazcan@gmail.com
//   SMTP_HOST / SMTP_PORT (isteğe bağlı) varsayılan: smtp.gmail.com / 465
//   REPORT_TO  (isteğe bağlı) rapor e-postalarının ek alıcıları, virgülle

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, serviceKey(), { auth: { persistSession: false } });

const SMTP_USER = Deno.env.get("SMTP_USER") ?? "erkinazcan@gmail.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 465);

const SIX_MONTHS_MS = 182 * 24 * 3600 * 1000;

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Tüm e-postalar aynı temada: koyu arka plan, turuncu vurgu, pist kerbi şeridi
// Kullanıcı e-postalarının altındaki "E-posta tercihleri" bağlantısı (web hesap sayfası → #eposta)
const PREFS_LINK: Record<string, string> = {
  tr: "E-posta tercihleri", en: "E-mail preferences", de: "E-Mail-Einstellungen", es: "Preferencias de correo",
  fr: "Préférences e-mail", it: "Preferenze e-mail", "pt-BR": "Preferências de e-mail", "pt-PT": "Preferências de e-mail",
  nl: "E-mailvoorkeuren", pl: "Preferencje e-mail", sv: "E-postinställningar", fi: "Sähköpostiasetukset",
  ru: "Настройки писем", "zh-CN": "邮件偏好设置", ja: "メール設定",
};

/** lang verilirse (kullanıcı e-postası) alt bilgiye e-posta tercihleri bağlantısı eklenir; yönetici e-postalarında yok */
function page(title: string, body: string, preheader = "", lang = "") {
  const prefs = lang ? PREFS_LINK[lang] ?? PREFS_LINK[lang.split("-")[0]] ?? PREFS_LINK.en : "";
  const kerb = Array.from(
    { length: 24 },
    (_, i) => `<td style="height:6px;background:${i % 2 ? "#ffffff" : "#e5322d"};font-size:0;line-height:0">&nbsp;</td>`,
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0d12">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="padding:0 4px 18px 4px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:34px;height:34px;background:#ff8a2a;border-radius:8px;text-align:center;vertical-align:middle;font:900 20px/34px Arial,Helvetica,sans-serif;color:#111">&#10095;</td>
      <td style="padding-left:10px;font:800 20px/1 'Segoe UI',Arial,Helvetica,sans-serif;color:#e9ecf2;letter-spacing:.5px">SRTR <span style="color:#ff8a2a">Pitwall</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#151821;border:1px solid #262b36;border-radius:14px;overflow:hidden">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${kerb}</tr></table>
    <div style="padding:26px 26px 24px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#e9ecf2;font-size:15px;line-height:1.6">
      <h2 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff">${esc(title)}</h2>
      ${body}
    </div>
  </td></tr>
  <tr><td style="padding:16px 8px 0;text-align:center;font:12px/1.5 'Segoe UI',Arial,Helvetica,sans-serif;color:#6b7383">
    SRTR Pitwall &middot; <a href="https://pitwall.simracetr.com" style="color:#8a93a4;text-decoration:none">pitwall.simracetr.com</a>${
      prefs ? ` &middot; <a href="https://pitwall.simracetr.com/hesap.html#eposta" style="color:#8a93a4;text-decoration:underline">${esc(prefs)}</a>` : ""
    }
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function sendMail(to: string[], subject: string, html: string) {
  if (!SMTP_PASS || to.length === 0) return false;
  // nodemailer: Türkçe karakterli konu ve HTML doğru kodlanır (denomailer bunu bozuyordu)
  const tr = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  // Uygulama adı hiçbir dile çevrilmez: Gmail / Google Çeviri'ye "çevirme" işareti
  const bi = html.indexOf("<body");
  html = html.slice(0, bi) + html.slice(bi).replace(/SRTR (<span[^>]*>)?Pitwall(<\/span>)?/g, (m) => `<span translate="no" class="notranslate">${m}</span>`);
  const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  await tr.sendMail({ from: `SRTR Pitwall <${SMTP_USER}>`, to: to.join(", "), subject, html, text });
  return true;
}

// E-posta tercihi (c35: profiles.email_prefs; anahtar yoksa varsayılan: takımlar kapalı, diğerleri açık).
// friends | teams | support | ads | pro | shots. Ödeme, hediye PRO, hesap ve yönetici e-postaları her zaman gider.
async function emailPrefOn(userId: string, cat: string) {
  const { data, error } = await db.rpc("email_pref_on", { p_user: userId, p_cat: cat });
  if (error || typeof data !== "boolean") return cat !== "teams";
  return data;
}

async function userInfo(id: string) {
  const { data } = await db.auth.admin.getUserById(id);
  const u = data?.user;
  return { email: u?.email ?? "", lang: String(u?.user_metadata?.lang ?? "en") };
}

// ---------------------------------------------------------------------------
// Rapor bildirimi (yöneticiye)
// ---------------------------------------------------------------------------

const REASONS: Record<string, { tr: string; en: string }> = {
  inappropriate: { tr: "Uygunsuz içerik", en: "Inappropriate content" },
  spam: { tr: "Spam / reklam", en: "Spam / advertising" },
  copyright: { tr: "Telif hakkı ihlali", en: "Copyright infringement" },
  harassment: { tr: "Hakaret / taciz", en: "Harassment / abuse" },
  impersonation: { tr: "Başkasının içeriği / kimliği", en: "Someone else's content / identity" },
  other: { tr: "Diğer", en: "Other" },
};

const KINDS: Record<string, { tr: string; en: string }> = {
  shot: { tr: "Ekran görüntüsü", en: "Screenshot" },
  shot_comment: { tr: "Ekran görüntüsü yorumu", en: "Screenshot comment" },
  layout: { tr: "Paylaşılan düzen", en: "Shared layout" },
  layout_comment: { tr: "Düzen yorumu", en: "Layout comment" },
};

async function report(id: string) {
  const { data: r, error } = await db.from("report_list").select("*").eq("id", id).maybeSingle();
  if (error || !r) return { ok: false, error: error?.message ?? "rapor yok" };
  if (r.notified_at) return { ok: true, skipped: true };

  const { data: admins } = await db.from("profiles").select("id").eq("is_admin", true);
  const to: string[] = [];
  let lang = "tr";
  for (const a of admins ?? []) {
    const u = await userInfo(a.id);
    if (u.email) to.push(u.email);
    lang = u.lang;
  }
  for (const x of (Deno.env.get("REPORT_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) to.push(x);
  const L = lang === "tr" ? "tr" : "en";
  const reason = REASONS[r.reason]?.[L] ?? r.reason;
  const kind = KINDS[r.target_type]?.[L] ?? r.target_type;
  const t = r.target ?? {};
  const img = t.thumb_path ? `${SUPABASE_URL}/storage/v1/object/public/screenshots/${t.thumb_path}` : "";
  const row = (k: string, v: string) =>
    `<tr><td style="color:#8b93a3;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`;
  const title = L === "tr" ? "Yeni rapor" : "New report";
  const body = `
    ${img ? `<img src="${img}" alt="" style="width:100%;border-radius:8px;margin-bottom:12px">` : ""}
    <table style="font-size:14px;border-collapse:collapse">
      ${row(L === "tr" ? "Sebep" : "Reason", `<b style="color:#ffb35c">${esc(reason)}</b>`)}
      ${row(L === "tr" ? "Tür" : "Type", esc(kind))}
      ${row(L === "tr" ? "İçerik" : "Content", esc(t.title ?? t.body ?? (L === "tr" ? "(silinmiş)" : "(deleted)")))}
      ${row(L === "tr" ? "İçerik sahibi" : "Owner", esc(t.author ?? "?"))}
      ${row(L === "tr" ? "Raporlayan" : "Reported by", esc(r.reporter_name))}
      ${r.note ? row(L === "tr" ? "Not" : "Note", esc(r.note)) : ""}
    </table>
    <p style="color:#8b93a3;font-size:13px;margin:16px 0 0">${
      L === "tr" ? "Uygulamada Hesap → Moderasyon bölümünden inceleyebilirsin." : "Review it in the app under Account → Moderation."
    }</p>`;
  const sent = await sendMail([...new Set(to)], `SRTR Pitwall · ${title}: ${reason}`, page(title, body));
  await db.from("reports").update({ notified_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Arkadaşlık isteği e-postası (isteği alan kişiye)
// ---------------------------------------------------------------------------

const FRIEND: Record<string, { subject: string; line: string; how: string; note: string }> = {
  tr: {
    subject: "{0} sana arkadaşlık isteği gönderdi",
    line: "{0}, SRTR Pitwall'da seni arkadaş olarak eklemek istiyor.",
    how: "SRTR Pitwall'u aç, sağ alttaki Arkadaşlar düğmesine (ya da üstteki zil simgesine) tıkla ve isteği kabul et ya da reddet.",
    note: "Bu kişiyi tanımıyorsan isteği reddedebilirsin; karşı tarafa bildirim gitmez.",
  },
  en: {
    subject: "{0} sent you a friend request",
    line: "{0} wants to add you as a friend on SRTR Pitwall.",
    how: "Open SRTR Pitwall, click Friends at the bottom right (or the bell icon at the top), and accept or decline the request.",
    note: "If you don't know this person, just decline. They won't be notified.",
  },
  de: {
    subject: "{0} hat dir eine Freundschaftsanfrage gesendet",
    line: "{0} möchte dich in SRTR Pitwall als Freund hinzufügen.",
    how: "Öffne SRTR Pitwall, klicke unten rechts auf Freunde (oder oben auf die Glocke) und nimm die Anfrage an oder lehne sie ab.",
    note: "Wenn du diese Person nicht kennst, lehne die Anfrage einfach ab. Sie wird nicht benachrichtigt.",
  },
  es: {
    subject: "{0} te ha enviado una solicitud de amistad",
    line: "{0} quiere añadirte como amigo en SRTR Pitwall.",
    how: "Abre SRTR Pitwall, haz clic en Amigos (abajo a la derecha) o en la campana de arriba, y acepta o rechaza la solicitud.",
    note: "Si no conoces a esta persona, simplemente recházala. No se le avisará.",
  },
  "pt-BR": {
    subject: "{0} enviou um pedido de amizade para você",
    line: "{0} quer adicionar você como amigo no SRTR Pitwall.",
    how: "Abra o SRTR Pitwall, clique em Amigos (canto inferior direito) ou no sino no topo, e aceite ou recuse o pedido.",
    note: "Se você não conhece essa pessoa, é só recusar. Ela não será notificada.",
  },
  "pt-PT": {
    subject: "{0} enviou-te um pedido de amizade",
    line: "{0} quer adicionar-te como amigo no SRTR Pitwall.",
    how: "Abre o SRTR Pitwall, clica em Amigos (canto inferior direito) ou no sino no topo, e aceita ou recusa o pedido.",
    note: "Se não conheces esta pessoa, basta recusar. Ela não será notificada.",
  },
  fr: {
    subject: "{0} t'a envoyé une demande d'ami",
    line: "{0} souhaite t'ajouter comme ami sur SRTR Pitwall.",
    how: "Ouvre SRTR Pitwall, clique sur Amis (en bas à droite) ou sur la cloche en haut, puis accepte ou refuse la demande.",
    note: "Si tu ne connais pas cette personne, refuse simplement. Elle ne sera pas prévenue.",
  },
  it: {
    subject: "{0} ti ha inviato una richiesta di amicizia",
    line: "{0} vuole aggiungerti come amico su SRTR Pitwall.",
    how: "Apri SRTR Pitwall, clicca su Amici (in basso a destra) o sulla campanella in alto, e accetta o rifiuta la richiesta.",
    note: "Se non conosci questa persona, rifiuta semplicemente. Non riceverà nessuna notifica.",
  },
  nl: {
    subject: "{0} heeft je een vriendschapsverzoek gestuurd",
    line: "{0} wil je toevoegen als vriend in SRTR Pitwall.",
    how: "Open SRTR Pitwall, klik rechtsonder op Vrienden (of bovenaan op de bel) en accepteer of weiger het verzoek.",
    note: "Ken je deze persoon niet, weiger het verzoek dan gewoon. Diegene krijgt geen melding.",
  },
  pl: {
    subject: "{0} wysłał(a) Ci zaproszenie do znajomych",
    line: "{0} chce dodać Cię do znajomych w SRTR Pitwall.",
    how: "Otwórz SRTR Pitwall, kliknij Znajomi (prawy dolny róg) lub dzwonek u góry i zaakceptuj albo odrzuć zaproszenie.",
    note: "Jeśli nie znasz tej osoby, po prostu odrzuć zaproszenie. Nie otrzyma ona powiadomienia.",
  },
  sv: {
    subject: "{0} har skickat en vänförfrågan till dig",
    line: "{0} vill lägga till dig som vän i SRTR Pitwall.",
    how: "Öppna SRTR Pitwall, klicka på Vänner (nere till höger) eller på klockan högst upp och godkänn eller avvisa förfrågan.",
    note: "Känner du inte personen kan du bara avvisa. Personen får ingen avisering.",
  },
  fi: {
    subject: "{0} lähetti sinulle kaveripyynnön",
    line: "{0} haluaa lisätä sinut kaveriksi SRTR Pitwallissa.",
    how: "Avaa SRTR Pitwall, napsauta Kaverit (oikealla alhaalla) tai kelloa ylhäällä ja hyväksy tai hylkää pyyntö.",
    note: "Jos et tunne henkilöä, hylkää pyyntö. Hänelle ei lähde ilmoitusta.",
  },
  ru: {
    subject: "{0} отправил(а) тебе запрос в друзья",
    line: "{0} хочет добавить тебя в друзья в SRTR Pitwall.",
    how: "Открой SRTR Pitwall, нажми «Друзья» (справа внизу) или колокольчик вверху и прими или отклони запрос.",
    note: "Если ты не знаешь этого человека, просто отклони запрос. Он не получит уведомления.",
  },
  "zh-CN": {
    subject: "{0} 向你发送了好友请求",
    line: "{0} 想在 SRTR Pitwall 中添加你为好友。",
    how: "打开 SRTR Pitwall，点击右下角的“好友”（或顶部的铃铛图标），然后接受或拒绝请求。",
    note: "如果你不认识对方，直接拒绝即可，对方不会收到通知。",
  },
  ja: {
    subject: "{0} さんからフレンド申請が届きました",
    line: "{0} さんが SRTR Pitwall であなたをフレンドに追加したいと考えています。",
    how: "SRTR Pitwall を開き、右下の「フレンド」（または上部のベルアイコン）をクリックして、申請を承認または拒否してください。",
    note: "知らない相手の場合は拒否するだけで大丈夫です。相手には通知されません。",
  },
};

async function friendRequest(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "friend_request") return { ok: true, skipped: true };
  if (!(await emailPrefOn(n.user_id, "friends"))) return { ok: true, skipped: "tercih" };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const { data: from } = await db.from("profiles").select("display_name,iracing_name").eq("id", n.data?.from).maybeSingle();
  const name = from?.display_name || n.data?.name || "?";
  const m = FRIEND[u.lang] ?? FRIEND[u.lang.split("-")[0]] ?? FRIEND.en;
  const fill = (t: string) => t.replace("{0}", name);
  const initial = esc(String(name).trim().charAt(0).toUpperCase() || "?");
  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
      <td style="width:52px;height:52px;background:#ff8a2a;border-radius:26px;text-align:center;vertical-align:middle;font:800 24px/52px Arial,Helvetica,sans-serif;color:#111">${initial}</td>
      <td style="padding-left:14px;vertical-align:middle">
        <div style="font-size:17px;font-weight:700;color:#fff">${esc(name)}</div>
        ${from?.iracing_name ? `<div style="font-size:13px;color:#8a93a4">iRacing: ${esc(from.iracing_name)}</div>` : ""}
      </td>
    </tr></table>
    <p style="margin:0 0 14px">${esc(fill(m.line))}</p>
    <div style="margin:0 0 14px;padding:12px 14px;background:#10131a;border:1px solid #262b36;border-left:3px solid #ff8a2a;border-radius:8px;color:#cfd5e1;font-size:14px">${esc(m.how)}</div>
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.note)}</p>`;
  const subject = fill(m.subject);
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, fill(m.line), u.lang));
  return { ok: true, sent };
}

const PRO_EXP: Record<string, { subject: string; line: string; how: string; note: string }> = {
  "tr": {
    subject: "PRO üyeliğinin bitmesine {0} gün kaldı",
    line: "PRO üyeliğin {1} tarihinde sona eriyor ({0} gün kaldı).",
    how: "SRTR Pitwall'u aç, sol menüden PRO'ya gir ve yenile; kaldığın yerden devam edersin.",
    note: "Süre dolduğunda PRO overlay'ler ve sesli mühendis kilitlenir, ayarların ve verilerin silinmez.",
  },
  "en": {
    subject: "Your PRO membership ends in {0} days",
    line: "Your PRO membership ends on {1} ({0} days left).",
    how: "Open SRTR Pitwall, go to PRO in the left menu and renew to keep going without a break.",
    note: "When it ends, PRO overlays and the voice engineer lock. Your settings and data are kept.",
  },
  "de": {
    subject: "Deine PRO-Mitgliedschaft endet in {0} Tagen",
    line: "Deine PRO-Mitgliedschaft endet am {1} (noch {0} Tage).",
    how: "Öffne SRTR Pitwall, gehe im linken Menü auf PRO und verlängere, um ohne Unterbrechung weiterzumachen.",
    note: "Nach Ablauf sind PRO-Overlays und der Sprach-Ingenieur gesperrt. Einstellungen und Daten bleiben erhalten.",
  },
  "es": {
    subject: "Tu membresía PRO termina en {0} días",
    line: "Tu membresía PRO termina el {1} (quedan {0} días).",
    how: "Abre SRTR Pitwall, entra en PRO en el menú izquierdo y renueva para seguir sin interrupciones.",
    note: "Al terminar, los overlays PRO y el ingeniero de voz se bloquean. Tus ajustes y datos se conservan.",
  },
  "pt-BR": {
    subject: "Sua assinatura PRO termina em {0} dias",
    line: "Sua assinatura PRO termina em {1} (faltam {0} dias).",
    how: "Abra o SRTR Pitwall, entre em PRO no menu à esquerda e renove para continuar sem interrupção.",
    note: "Ao terminar, os overlays PRO e o engenheiro de voz ficam bloqueados. Suas configurações e dados são mantidos.",
  },
  "pt-PT": {
    subject: "A tua subscrição PRO termina em {0} dias",
    line: "A tua subscrição PRO termina em {1} (faltam {0} dias).",
    how: "Abre o SRTR Pitwall, entra em PRO no menu à esquerda e renova para continuares sem interrupção.",
    note: "Quando terminar, os overlays PRO e o engenheiro de voz ficam bloqueados. As tuas definições e dados mantêm-se.",
  },
  "fr": {
    subject: "Ton abonnement PRO se termine dans {0} jours",
    line: "Ton abonnement PRO se termine le {1} ({0} jours restants).",
    how: "Ouvre SRTR Pitwall, va dans PRO dans le menu de gauche et renouvelle pour continuer sans interruption.",
    note: "À la fin, les overlays PRO et l'ingénieur vocal sont verrouillés. Tes réglages et données sont conservés.",
  },
  "it": {
    subject: "Il tuo abbonamento PRO scade tra {0} giorni",
    line: "Il tuo abbonamento PRO scade il {1} (mancano {0} giorni).",
    how: "Apri SRTR Pitwall, vai su PRO nel menu a sinistra e rinnova per continuare senza interruzioni.",
    note: "Alla scadenza gli overlay PRO e l'ingegnere vocale vengono bloccati. Impostazioni e dati restano.",
  },
  "nl": {
    subject: "Je PRO-lidmaatschap eindigt over {0} dagen",
    line: "Je PRO-lidmaatschap eindigt op {1} (nog {0} dagen).",
    how: "Open SRTR Pitwall, ga links naar PRO en verleng om zonder onderbreking door te gaan.",
    note: "Daarna zijn PRO-overlays en de stemengineer vergrendeld. Je instellingen en gegevens blijven bewaard.",
  },
  "pl": {
    subject: "Twoje członkostwo PRO kończy się za {0} dni",
    line: "Twoje członkostwo PRO kończy się {1} (zostało {0} dni).",
    how: "Otwórz SRTR Pitwall, wejdź w PRO w lewym menu i odnów, aby kontynuować bez przerwy.",
    note: "Po zakończeniu nakładki PRO i inżynier głosowy zostaną zablokowane. Ustawienia i dane zostają.",
  },
  "sv": {
    subject: "Ditt PRO-medlemskap upphör om {0} dagar",
    line: "Ditt PRO-medlemskap upphör den {1} ({0} dagar kvar).",
    how: "Öppna SRTR Pitwall, gå till PRO i vänstermenyn och förnya för att fortsätta utan avbrott.",
    note: "När det upphör låses PRO-overlays och röstingenjören. Dina inställningar och data finns kvar.",
  },
  "fi": {
    subject: "PRO-jäsenyytesi päättyy {0} päivän kuluttua",
    line: "PRO-jäsenyytesi päättyy {1} ({0} päivää jäljellä).",
    how: "Avaa SRTR Pitwall, siirry vasemmasta valikosta kohtaan PRO ja uusi jäsenyys jatkaaksesi keskeytyksettä.",
    note: "Päättyessään PRO-overlayt ja ääni-insinööri lukitaan. Asetukset ja tiedot säilyvät.",
  },
  "ru": {
    subject: "Твоя PRO-подписка закончится через {0} дн.",
    line: "Твоя PRO-подписка заканчивается {1} (осталось дней: {0}).",
    how: "Открой SRTR Pitwall, зайди в PRO в левом меню и продли подписку, чтобы продолжить без перерыва.",
    note: "После окончания PRO-оверлеи и голосовой инженер блокируются. Настройки и данные сохраняются.",
  },
  "zh-CN": {
    subject: "你的 PRO 会员将在 {0} 天后到期",
    line: "你的 PRO 会员将于 {1} 到期（还剩 {0} 天）。",
    how: "打开 SRTR Pitwall，在左侧菜单进入 PRO 并续费，即可不间断继续使用。",
    note: "到期后，PRO 叠加层和语音工程师将被锁定，你的设置和数据会保留。",
  },
  "ja": {
    subject: "PRO メンバーシップはあと {0} 日で終了します",
    line: "PRO メンバーシップは {1} に終了します（残り {0} 日）。",
    how: "SRTR Pitwall を開き、左メニューの PRO から更新すると、中断せずに使い続けられます。",
    note: "終了後は PRO オーバーレイとボイスエンジニアがロックされます。設定とデータは保持されます。",
  },
};

// Son gün uyarısı (bitişe 24 saatten az kala)
const PRO_LAST: Record<string, { subject: string; line: string }> = {
  "tr": { subject: "PRO üyeliğinin son günü", line: "PRO üyeliğin {1} itibarıyla sona eriyor. Kesintisiz devam etmek için şimdi yenile." },
  "en": { subject: "Last day of your PRO membership", line: "Your PRO membership ends on {1}. Renew now to keep going without a break." },
  "de": { subject: "Letzter Tag deiner PRO-Mitgliedschaft", line: "Deine PRO-Mitgliedschaft endet am {1}. Verlängere jetzt, um ohne Unterbrechung weiterzumachen." },
  "es": { subject: "Último día de tu membresía PRO", line: "Tu membresía PRO termina el {1}. Renueva ahora para seguir sin interrupciones." },
  "pt-BR": { subject: "Último dia da sua assinatura PRO", line: "Sua assinatura PRO termina em {1}. Renove agora para continuar sem interrupção." },
  "pt-PT": { subject: "Último dia da tua subscrição PRO", line: "A tua subscrição PRO termina em {1}. Renova agora para continuares sem interrupção." },
  "fr": { subject: "Dernier jour de ton abonnement PRO", line: "Ton abonnement PRO se termine le {1}. Renouvelle-le maintenant pour continuer sans interruption." },
  "it": { subject: "Ultimo giorno del tuo abbonamento PRO", line: "Il tuo abbonamento PRO scade il {1}. Rinnova ora per continuare senza interruzioni." },
  "nl": { subject: "Laatste dag van je PRO-lidmaatschap", line: "Je PRO-lidmaatschap eindigt op {1}. Verleng nu om zonder onderbreking door te gaan." },
  "pl": { subject: "Ostatni dzień Twojego członkostwa PRO", line: "Twoje członkostwo PRO kończy się {1}. Odnów je teraz, aby kontynuować bez przerwy." },
  "sv": { subject: "Sista dagen av ditt PRO-medlemskap", line: "Ditt PRO-medlemskap upphör den {1}. Förnya nu för att fortsätta utan avbrott." },
  "fi": { subject: "PRO-jäsenyytesi viimeinen päivä", line: "PRO-jäsenyytesi päättyy {1}. Uusi nyt jatkaaksesi keskeytyksettä." },
  "ru": { subject: "Последний день твоей PRO-подписки", line: "Твоя PRO-подписка заканчивается {1}. Продли сейчас, чтобы продолжить без перерыва." },
  "zh-CN": { subject: "PRO 会员最后一天", line: "你的 PRO 会员将于 {1} 到期。立即续费即可不间断使用。" },
  "ja": { subject: "PRO メンバーシップ最終日", line: "PRO メンバーシップは {1} に終了します。今すぐ更新すれば中断なく使い続けられます。" },
};

// Tarih biçimi: kullanıcının dili
const LOCALES: Record<string, string> = {
  tr: "tr-TR", en: "en-GB", de: "de-DE", es: "es-ES", "pt-BR": "pt-BR", "pt-PT": "pt-PT", fr: "fr-FR", it: "it-IT",
  nl: "nl-NL", pl: "pl-PL", sv: "sv-SE", fi: "fi-FI", ru: "ru-RU", "zh-CN": "zh-CN", ja: "ja-JP",
};
function fmtDay(d: Date, lang: string, time = false) {
  const loc = LOCALES[lang] ?? LOCALES[lang.split("-")[0]] ?? "en-GB";
  try {
    return d.toLocaleString(loc, time
      ? { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul", timeZoneName: "short" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
function pick<T>(dict: Record<string, T>, lang: string): T {
  return dict[lang] ?? dict[lang.split("-")[0]] ?? dict.en;
}

const BOX = "margin:0 0 14px;padding:12px 14px;background:#10131a;border:1px solid #262b36;border-left:3px solid #ff8a2a;border-radius:8px;color:#cfd5e1;font-size:14px";
const button = (href: string, label: string) =>
  `<p style="margin:18px 0 4px"><a href="${esc(href)}" style="display:inline-block;background:#ff8a2a;color:#111;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(label)}</a></p>`;

async function proExpiring(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "pro_expiring") return { ok: true, skipped: true };
  if (!(await emailPrefOn(n.user_id, "pro"))) return { ok: true, skipped: "tercih" };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const until = new Date(n.data?.until ?? Date.now());
  const last = n.data?.stage === "d1" || until.getTime() - Date.now() <= 86400000;
  const days = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 86400000));
  const m = pick(PRO_EXP, u.lang);
  const lm = pick(PRO_LAST, u.lang);
  const date = fmtDay(until, u.lang, last);
  const fill = (t: string) => t.replace("{0}", String(days)).replace("{1}", date);
  const line = fill(last ? lm.line : m.line);
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid ${last ? "#e5322d" : "#262b36"};border-radius:10px;text-align:center">
      <div style="font:800 40px/1 Arial,Helvetica,sans-serif;color:${last ? "#ff5a4f" : "#ff8a2a"}">${last ? "24h" : days}</div>
      <div style="font-size:12px;letter-spacing:1px;color:#8a93a4;text-transform:uppercase;margin-top:6px">PRO</div>
    </div>
    <p style="margin:0 0 14px">${esc(line)}</p>
    <div style="${BOX}">${esc(m.how)}</div>
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.note)}</p>`;
  const subject = fill(last ? lm.subject : m.subject);
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line, u.lang));
  return { ok: true, sent };
}

// Yöneticiye: bir hesap cihaz sınırını aştı
async function deviceAlert(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "device_alert") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const tr = u.lang === "tr";
  const name = String(n.data?.name ?? "?");
  const count = Number(n.data?.count ?? 0);
  const title = tr ? "Şüpheli hesap kullanımı" : "Suspicious account usage";
  const body = `
    <p style="margin:0 0 12px"><b style="color:#ffb35c">${esc(name)}</b> ${
      tr ? `hesabı ${count} farklı bilgisayardan kullanılıyor (sınır aşıldı).` : `is being used from ${count} different computers (limit exceeded).`
    }</p>
    <p style="color:#8b93a3;font-size:13px;margin:0">${
      tr ? "Uygulamada Yönetim → Cihazlar bölümünden inceleyebilirsin." : "Review it in the app under Management → Devices."
    }</p>`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${name}`, page(title, body));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Yönetici PRO süresini elle değiştirdi (kullanıcıya, kendi dilinde)
// ---------------------------------------------------------------------------

type ProChg = {
  add: string; cut: string; set: string; forever: string; remove: string;
  until: string; added: string; removed: string; foreverLine: string; removeLine: string; note: string; foot: string;
};
const PRO_CHG: Record<string, ProChg> = {
  "tr": {
    add: "PRO üyeliğin uzatıldı", cut: "PRO süren güncellendi", set: "PRO bitiş tarihin güncellendi",
    forever: "Artık süresiz PRO üyesisin", remove: "PRO üyeliğin sonlandırıldı",
    until: "Yeni bitiş tarihi: {0}", added: "PRO üyeliğine {0} gün eklendi.", removed: "PRO üyeliğinden {0} gün düşüldü.",
    foreverLine: "PRO üyeliğin süresiz olarak tanımlandı. Tüm PRO özelliklerini sınırsız kullanabilirsin.",
    removeLine: "PRO üyeliğin ekibimiz tarafından sonlandırıldı. Ayarların ve verilerin silinmez.",
    note: "Ekibin notu",
    foot: "Değişiklik SRTR Pitwall'da birkaç dakika içinde görünür (hemen görmek için programı yeniden başlat).",
  },
  "en": {
    add: "Your PRO membership was extended", cut: "Your PRO time was updated", set: "Your PRO end date was updated",
    forever: "You're now an unlimited PRO member", remove: "Your PRO membership was ended",
    until: "New end date: {0}", added: "{0} days were added to your PRO membership.", removed: "{0} days were removed from your PRO membership.",
    foreverLine: "Your PRO membership is now unlimited. Enjoy every PRO feature with no end date.",
    removeLine: "Your PRO membership was ended by our team. Your settings and data are kept.",
    note: "Note from the team",
    foot: "The change shows up in SRTR Pitwall within a few minutes (restart the app to see it right away).",
  },
  "de": {
    add: "Deine PRO-Mitgliedschaft wurde verlängert", cut: "Deine PRO-Laufzeit wurde aktualisiert", set: "Dein PRO-Enddatum wurde aktualisiert",
    forever: "Du bist jetzt unbegrenzt PRO-Mitglied", remove: "Deine PRO-Mitgliedschaft wurde beendet",
    until: "Neues Enddatum: {0}", added: "Deiner PRO-Mitgliedschaft wurden {0} Tage hinzugefügt.", removed: "Von deiner PRO-Mitgliedschaft wurden {0} Tage abgezogen.",
    foreverLine: "Deine PRO-Mitgliedschaft ist jetzt unbegrenzt. Nutze alle PRO-Funktionen ohne Enddatum.",
    removeLine: "Deine PRO-Mitgliedschaft wurde von unserem Team beendet. Deine Einstellungen und Daten bleiben erhalten.",
    note: "Hinweis vom Team",
    foot: "Die Änderung erscheint in SRTR Pitwall innerhalb weniger Minuten (starte die App neu, um sie sofort zu sehen).",
  },
  "es": {
    add: "Tu membresía PRO se ha ampliado", cut: "Tu tiempo PRO se ha actualizado", set: "La fecha de fin de tu PRO se ha actualizado",
    forever: "Ahora eres miembro PRO sin límite", remove: "Tu membresía PRO ha finalizado",
    until: "Nueva fecha de fin: {0}", added: "Se han añadido {0} días a tu membresía PRO.", removed: "Se han quitado {0} días de tu membresía PRO.",
    foreverLine: "Tu membresía PRO ahora es ilimitada. Disfruta de todas las funciones PRO sin fecha de fin.",
    removeLine: "Nuestro equipo ha finalizado tu membresía PRO. Tus ajustes y datos se conservan.",
    note: "Nota del equipo",
    foot: "El cambio aparecerá en SRTR Pitwall en unos minutos (reinicia la aplicación para verlo al instante).",
  },
  "pt-BR": {
    add: "Sua assinatura PRO foi estendida", cut: "Seu tempo PRO foi atualizado", set: "A data de término do seu PRO foi atualizada",
    forever: "Agora você é membro PRO ilimitado", remove: "Sua assinatura PRO foi encerrada",
    until: "Nova data de término: {0}", added: "{0} dias foram adicionados à sua assinatura PRO.", removed: "{0} dias foram removidos da sua assinatura PRO.",
    foreverLine: "Sua assinatura PRO agora é ilimitada. Aproveite todos os recursos PRO sem data de término.",
    removeLine: "Sua assinatura PRO foi encerrada pela nossa equipe. Suas configurações e dados são mantidos.",
    note: "Nota da equipe",
    foot: "A mudança aparece no SRTR Pitwall em alguns minutos (reinicie o app para ver na hora).",
  },
  "pt-PT": {
    add: "A tua subscrição PRO foi prolongada", cut: "O teu tempo PRO foi atualizado", set: "A data de fim do teu PRO foi atualizada",
    forever: "Agora és membro PRO ilimitado", remove: "A tua subscrição PRO foi terminada",
    until: "Nova data de fim: {0}", added: "Foram adicionados {0} dias à tua subscrição PRO.", removed: "Foram retirados {0} dias da tua subscrição PRO.",
    foreverLine: "A tua subscrição PRO é agora ilimitada. Aproveita todas as funcionalidades PRO sem data de fim.",
    removeLine: "A tua subscrição PRO foi terminada pela nossa equipa. As tuas definições e dados mantêm-se.",
    note: "Nota da equipa",
    foot: "A alteração aparece no SRTR Pitwall dentro de alguns minutos (reinicia a aplicação para a veres de imediato).",
  },
  "fr": {
    add: "Ton abonnement PRO a été prolongé", cut: "Ta durée PRO a été mise à jour", set: "La date de fin de ton PRO a été mise à jour",
    forever: "Tu es maintenant membre PRO sans limite", remove: "Ton abonnement PRO a pris fin",
    until: "Nouvelle date de fin : {0}", added: "{0} jours ont été ajoutés à ton abonnement PRO.", removed: "{0} jours ont été retirés de ton abonnement PRO.",
    foreverLine: "Ton abonnement PRO est désormais illimité. Profite de toutes les fonctions PRO sans date de fin.",
    removeLine: "Notre équipe a mis fin à ton abonnement PRO. Tes réglages et données sont conservés.",
    note: "Note de l'équipe",
    foot: "Le changement apparaît dans SRTR Pitwall d'ici quelques minutes (redémarre l'application pour le voir tout de suite).",
  },
  "it": {
    add: "Il tuo abbonamento PRO è stato esteso", cut: "Il tuo tempo PRO è stato aggiornato", set: "La data di scadenza del tuo PRO è stata aggiornata",
    forever: "Ora sei un membro PRO senza limiti", remove: "Il tuo abbonamento PRO è terminato",
    until: "Nuova data di scadenza: {0}", added: "Sono stati aggiunti {0} giorni al tuo abbonamento PRO.", removed: "Sono stati tolti {0} giorni dal tuo abbonamento PRO.",
    foreverLine: "Il tuo abbonamento PRO ora è illimitato. Goditi tutte le funzioni PRO senza scadenza.",
    removeLine: "Il nostro team ha terminato il tuo abbonamento PRO. Impostazioni e dati restano.",
    note: "Nota del team",
    foot: "La modifica compare in SRTR Pitwall entro pochi minuti (riavvia l'app per vederla subito).",
  },
  "nl": {
    add: "Je PRO-lidmaatschap is verlengd", cut: "Je PRO-tijd is bijgewerkt", set: "De einddatum van je PRO is bijgewerkt",
    forever: "Je bent nu onbeperkt PRO-lid", remove: "Je PRO-lidmaatschap is beëindigd",
    until: "Nieuwe einddatum: {0}", added: "Er zijn {0} dagen aan je PRO-lidmaatschap toegevoegd.", removed: "Er zijn {0} dagen van je PRO-lidmaatschap afgehaald.",
    foreverLine: "Je PRO-lidmaatschap is nu onbeperkt. Geniet van alle PRO-functies zonder einddatum.",
    removeLine: "Je PRO-lidmaatschap is door ons team beëindigd. Je instellingen en gegevens blijven bewaard.",
    note: "Opmerking van het team",
    foot: "De wijziging is binnen enkele minuten zichtbaar in SRTR Pitwall (herstart de app om het meteen te zien).",
  },
  "pl": {
    add: "Twoje członkostwo PRO zostało przedłużone", cut: "Twój czas PRO został zaktualizowany", set: "Data zakończenia PRO została zaktualizowana",
    forever: "Masz teraz bezterminowe PRO", remove: "Twoje członkostwo PRO zostało zakończone",
    until: "Nowa data zakończenia: {0}", added: "Do Twojego członkostwa PRO dodano {0} dni.", removed: "Z Twojego członkostwa PRO odjęto {0} dni.",
    foreverLine: "Twoje członkostwo PRO jest teraz bezterminowe. Korzystaj ze wszystkich funkcji PRO bez daty końcowej.",
    removeLine: "Nasz zespół zakończył Twoje członkostwo PRO. Ustawienia i dane zostają.",
    note: "Notatka od zespołu",
    foot: "Zmiana pojawi się w SRTR Pitwall w ciągu kilku minut (uruchom aplikację ponownie, aby zobaczyć ją od razu).",
  },
  "sv": {
    add: "Ditt PRO-medlemskap har förlängts", cut: "Din PRO-tid har uppdaterats", set: "Slutdatumet för ditt PRO har uppdaterats",
    forever: "Du är nu PRO-medlem utan tidsgräns", remove: "Ditt PRO-medlemskap har avslutats",
    until: "Nytt slutdatum: {0}", added: "{0} dagar har lagts till ditt PRO-medlemskap.", removed: "{0} dagar har dragits från ditt PRO-medlemskap.",
    foreverLine: "Ditt PRO-medlemskap gäller nu utan tidsgräns. Använd alla PRO-funktioner utan slutdatum.",
    removeLine: "Vårt team har avslutat ditt PRO-medlemskap. Dina inställningar och data finns kvar.",
    note: "Meddelande från teamet",
    foot: "Ändringen syns i SRTR Pitwall inom några minuter (starta om appen för att se den direkt).",
  },
  "fi": {
    add: "PRO-jäsenyyttäsi jatkettiin", cut: "PRO-aikasi päivitettiin", set: "PRO-jäsenyytesi päättymispäivä päivitettiin",
    forever: "Olet nyt rajaton PRO-jäsen", remove: "PRO-jäsenyytesi päätettiin",
    until: "Uusi päättymispäivä: {0}", added: "PRO-jäsenyyteesi lisättiin {0} päivää.", removed: "PRO-jäsenyydestäsi vähennettiin {0} päivää.",
    foreverLine: "PRO-jäsenyytesi on nyt rajaton. Käytä kaikkia PRO-ominaisuuksia ilman päättymispäivää.",
    removeLine: "Tiimimme päätti PRO-jäsenyytesi. Asetukset ja tiedot säilyvät.",
    note: "Tiimin viesti",
    foot: "Muutos näkyy SRTR Pitwallissa muutamassa minuutissa (käynnistä sovellus uudelleen nähdäksesi sen heti).",
  },
  "ru": {
    add: "Твоя PRO-подписка продлена", cut: "Срок PRO обновлён", set: "Дата окончания PRO обновлена",
    forever: "Теперь у тебя бессрочный PRO", remove: "Твоя PRO-подписка отключена",
    until: "Новая дата окончания: {0}", added: "К твоей PRO-подписке добавлено дней: {0}.", removed: "Из твоей PRO-подписки вычтено дней: {0}.",
    foreverLine: "Твоя PRO-подписка теперь бессрочная. Пользуйся всеми PRO-функциями без ограничений по времени.",
    removeLine: "Наша команда отключила твою PRO-подписку. Настройки и данные сохраняются.",
    note: "Сообщение от команды",
    foot: "Изменение появится в SRTR Pitwall в течение нескольких минут (перезапусти программу, чтобы увидеть его сразу).",
  },
  "zh-CN": {
    add: "你的 PRO 会员已延长", cut: "你的 PRO 时长已更新", set: "你的 PRO 到期日已更新",
    forever: "你现在是永久 PRO 会员", remove: "你的 PRO 会员已终止",
    until: "新的到期日：{0}", added: "已为你的 PRO 会员增加 {0} 天。", removed: "已从你的 PRO 会员中扣除 {0} 天。",
    foreverLine: "你的 PRO 会员现已永久有效，可无限期使用所有 PRO 功能。",
    removeLine: "我们的团队已终止你的 PRO 会员。你的设置和数据会保留。",
    note: "团队留言",
    foot: "更改将在几分钟内显示在 SRTR Pitwall 中（重启程序可立即看到）。",
  },
  "ja": {
    add: "PRO メンバーシップが延長されました", cut: "PRO の期間が更新されました", set: "PRO の終了日が更新されました",
    forever: "無期限の PRO メンバーになりました", remove: "PRO メンバーシップが終了しました",
    until: "新しい終了日：{0}", added: "PRO メンバーシップに {0} 日追加されました。", removed: "PRO メンバーシップから {0} 日差し引かれました。",
    foreverLine: "PRO メンバーシップが無期限になりました。すべての PRO 機能を期限なしで利用できます。",
    removeLine: "チームにより PRO メンバーシップが終了されました。設定とデータは保持されます。",
    note: "チームからのメモ",
    foot: "変更は数分以内に SRTR Pitwall に反映されます（すぐに確認するにはアプリを再起動してください）。",
  },
};

async function proChanged(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "pro_changed") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(PRO_CHG, u.lang);
  const d = n.data ?? {};
  const nu = d.new_until ? new Date(d.new_until) : null;
  const ou = d.old_until ? new Date(d.old_until) : null;
  const forever = !!nu && nu.getTime() - Date.now() > 3000 * 86400000;
  const ended = !nu || nu.getTime() <= Date.now() + 60000;
  const days = Number(d.days ?? 0);
  const shorter = !!nu && !!ou && nu.getTime() < ou.getTime();
  let subject: string;
  let line: string;
  if (ended) {
    subject = m.remove;
    line = m.removeLine;
  } else if (forever) {
    subject = m.forever;
    line = m.foreverLine;
  } else if (d.mode === "add" && days !== 0) {
    subject = days > 0 ? m.add : m.cut;
    line = (days > 0 ? m.added : m.removed).replace("{0}", String(Math.abs(days)));
  } else {
    subject = shorter ? m.cut : ou && nu && nu.getTime() > ou.getTime() ? m.add : m.set;
    line = "";
  }
  const big = ended ? "—" : forever ? "∞" : String(Math.max(1, Math.ceil((nu!.getTime() - Date.now()) / 86400000)));
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid ${ended ? "#e5322d" : "#262b36"};border-radius:10px;text-align:center">
      <div style="font:800 40px/1 Arial,Helvetica,sans-serif;color:${ended ? "#ff5a4f" : "#ff8a2a"}">${esc(big)}</div>
      <div style="font-size:12px;letter-spacing:1px;color:#8a93a4;text-transform:uppercase;margin-top:6px">PRO</div>
    </div>
    ${line ? `<p style="margin:0 0 10px">${esc(line)}</p>` : ""}
    ${!ended && !forever ? `<p style="margin:0 0 14px"><b style="color:#ffb35c">${esc(m.until.replace("{0}", fmtDay(nu!, u.lang)))}</b></p>` : ""}
    ${d.note ? `<div style="${BOX}"><div style="font-size:12px;color:#8a93a4;margin-bottom:4px">${esc(m.note)}</div>${esc(d.note)}</div>` : ""}
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.foot)}</p>`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line || subject, u.lang));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Destek talepleri
// ---------------------------------------------------------------------------

const SITE = "https://pitwall.simracetr.com";

const SUPPORT_CATS: Record<string, { tr: string; en: string }> = {
  bug: { tr: "Hata bildirimi", en: "Bug report" },
  payment: { tr: "Ödeme / abonelik", en: "Payment / subscription" },
  account: { tr: "Hesap", en: "Account" },
  feature: { tr: "Öneri / istek", en: "Suggestion / request" },
  overlay: { tr: "Overlay / görünüm", en: "Overlay / appearance" },
  other: { tr: "Diğer", en: "Other" },
};

const SUPPORT_REPLY: Record<string, { subject: string; line: string; how: string; button: string }> = {
  "tr": { subject: "Destek talebine yanıt: {0}", line: "Destek ekibi \"{0}\" konulu talebini yanıtladı:", how: "Yanıtlamak ya da talebi kapatmak için SRTR Pitwall'da sol menüden Destek'i aç ya da hesap sayfana git.", button: "Talebi görüntüle" },
  "en": { subject: "Reply to your support ticket: {0}", line: "Our support team replied to your ticket \"{0}\":", how: "To reply or close the ticket, open Support in the left menu of SRTR Pitwall or visit your account page.", button: "View ticket" },
  "de": { subject: "Antwort auf deine Support-Anfrage: {0}", line: "Unser Support-Team hat auf deine Anfrage „{0}“ geantwortet:", how: "Um zu antworten oder die Anfrage zu schließen, öffne in SRTR Pitwall links Support oder besuche deine Kontoseite.", button: "Anfrage ansehen" },
  "es": { subject: "Respuesta a tu solicitud de soporte: {0}", line: "Nuestro equipo de soporte ha respondido a tu solicitud «{0}»:", how: "Para responder o cerrar la solicitud, abre Soporte en el menú izquierdo de SRTR Pitwall o visita la página de tu cuenta.", button: "Ver solicitud" },
  "pt-BR": { subject: "Resposta ao seu chamado de suporte: {0}", line: "Nossa equipe de suporte respondeu ao seu chamado \"{0}\":", how: "Para responder ou fechar o chamado, abra Suporte no menu à esquerda do SRTR Pitwall ou acesse a página da sua conta.", button: "Ver chamado" },
  "pt-PT": { subject: "Resposta ao teu pedido de suporte: {0}", line: "A nossa equipa de suporte respondeu ao teu pedido \"{0}\":", how: "Para responder ou fechar o pedido, abre Suporte no menu à esquerda do SRTR Pitwall ou visita a página da tua conta.", button: "Ver pedido" },
  "fr": { subject: "Réponse à ta demande d'assistance : {0}", line: "Notre équipe d'assistance a répondu à ta demande « {0} » :", how: "Pour répondre ou fermer la demande, ouvre Assistance dans le menu de gauche de SRTR Pitwall ou va sur la page de ton compte.", button: "Voir la demande" },
  "it": { subject: "Risposta alla tua richiesta di supporto: {0}", line: "Il nostro team di supporto ha risposto alla tua richiesta \"{0}\":", how: "Per rispondere o chiudere la richiesta, apri Supporto nel menu a sinistra di SRTR Pitwall o visita la pagina del tuo account.", button: "Vedi richiesta" },
  "nl": { subject: "Antwoord op je supportverzoek: {0}", line: "Ons supportteam heeft je verzoek \"{0}\" beantwoord:", how: "Open Support in het linkermenu van SRTR Pitwall of ga naar je accountpagina om te antwoorden of het verzoek te sluiten.", button: "Verzoek bekijken" },
  "pl": { subject: "Odpowiedź na Twoje zgłoszenie: {0}", line: "Nasz zespół wsparcia odpowiedział na Twoje zgłoszenie „{0}”:", how: "Aby odpowiedzieć lub zamknąć zgłoszenie, otwórz Wsparcie w lewym menu SRTR Pitwall albo wejdź na stronę swojego konta.", button: "Zobacz zgłoszenie" },
  "sv": { subject: "Svar på ditt supportärende: {0}", line: "Vårt supportteam har svarat på ditt ärende \"{0}\":", how: "Öppna Support i vänstermenyn i SRTR Pitwall eller gå till din kontosida för att svara eller stänga ärendet.", button: "Visa ärendet" },
  "fi": { subject: "Vastaus tukipyyntöösi: {0}", line: "Tukitiimimme vastasi pyyntöösi \"{0}\":", how: "Vastaa tai sulje pyyntö avaamalla SRTR Pitwallin vasemmasta valikosta Tuki tai siirtymällä tilisivullesi.", button: "Näytä pyyntö" },
  "ru": { subject: "Ответ на твоё обращение в поддержку: {0}", line: "Команда поддержки ответила на твоё обращение «{0}»:", how: "Чтобы ответить или закрыть обращение, открой «Поддержка» в левом меню SRTR Pitwall или зайди на страницу аккаунта.", button: "Открыть обращение" },
  "zh-CN": { subject: "你的支持工单有新回复：{0}", line: "支持团队已回复你的工单“{0}”：", how: "如需回复或关闭工单，请在 SRTR Pitwall 左侧菜单打开“支持”，或访问你的账户页面。", button: "查看工单" },
  "ja": { subject: "サポートへのお問い合わせに返信がありました：{0}", line: "サポートチームがお問い合わせ「{0}」に返信しました：", how: "返信やクローズは、SRTR Pitwall の左メニューの「サポート」またはアカウントページから行えます。", button: "お問い合わせを見る" },
};

/** Talebin son mesajı (isteğe göre personel/kullanıcı) ve görsellerinin 7 günlük imzalı adresleri */
async function lastMessage(ticket: string, staff: boolean) {
  const { data } = await db
    .from("support_messages")
    .select("body,images,is_staff,created_at")
    .eq("ticket_id", ticket)
    .eq("is_staff", staff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const imgs: string[] = [];
  if (data?.images?.length) {
    const { data: signed } = await db.storage.from("support").createSignedUrls(data.images, 7 * 86400);
    for (const s of signed ?? []) if (s.signedUrl) imgs.push(s.signedUrl);
  }
  return { body: String(data?.body ?? ""), imgs };
}

const quote = (text: string) =>
  `<div style="margin:0 0 14px;padding:12px 14px;background:#10131a;border:1px solid #262b36;border-left:3px solid #ff8a2a;border-radius:8px;color:#e9ecf2;font-size:14px;white-space:pre-wrap">${esc(text)}</div>`;
const thumbs = (imgs: string[]) =>
  imgs.length
    ? `<div style="margin:0 0 14px">${imgs
        .map((u) => `<a href="${esc(u)}"><img src="${esc(u)}" alt="" style="width:118px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #262b36;margin:0 6px 6px 0"></a>`)
        .join("")}</div>`
    : "";

// Yöneticiye: yeni talep ya da talep sahibinden yeni mesaj
async function supportAdmin(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "support_new" && n.kind !== "support_user_reply") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const isNew = n.kind === "support_new";
  const msg = await lastMessage(String(d.ticket), false);
  const title = isNew ? (L === "tr" ? "Yeni destek talebi" : "New support ticket") : L === "tr" ? "Destek talebine yeni mesaj" : "New message on a support ticket";
  const row = (k: string, v: string) =>
    `<tr><td style="color:#8b93a3;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`;
  const body = `
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 14px">
      ${row(L === "tr" ? "Konu" : "Subject", `<b style="color:#ffb35c">${esc(d.subject ?? "?")}</b>`)}
      ${row(L === "tr" ? "Kategori" : "Category", esc(SUPPORT_CATS[d.category]?.[L] ?? d.category ?? "?"))}
      ${row(L === "tr" ? "Üye" : "Member", esc(d.name ?? "?"))}
    </table>
    ${msg.body ? quote(msg.body) : ""}
    ${thumbs(msg.imgs)}
    <p style="color:#8b93a3;font-size:13px;margin:0">${
      L === "tr" ? "Uygulamada Yönetim → Destek bölümünden ya da web yönetim panelinden yanıtlayabilirsin." : "Reply in the app under Management → Support or in the web admin panel."
    }</p>
    ${button(`${SITE}/yonetim.html#destek`, L === "tr" ? "Yönetim panelinde aç" : "Open in admin panel")}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${d.subject ?? ""}`, page(title, body, String(d.subject ?? "")));
  return { ok: true, sent };
}

// Kullanıcıya: talebine yanıt geldi (kendi dilinde)
async function supportReply(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "support_reply") return { ok: true, skipped: true };
  if (!(await emailPrefOn(n.user_id, "support"))) return { ok: true, skipped: "tercih" };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(SUPPORT_REPLY, u.lang);
  const d = n.data ?? {};
  const subj = String(d.subject ?? "");
  const msg = await lastMessage(String(d.ticket), true);
  const body = `
    <p style="margin:0 0 12px">${esc(m.line.replace("{0}", subj))}</p>
    ${msg.body ? quote(msg.body) : ""}
    ${thumbs(msg.imgs)}
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.how)}</p>
    ${button(`${SITE}/hesap.html#destek`, m.button)}`;
  const subject = m.subject.replace("{0}", subj);
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, m.line.replace("{0}", subj), u.lang));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Reklamlar: reklam verene (kendi dilinde) yayında / reddedildi-durduruldu / bitti;
// yöneticiye (tr/en) rapor ve onay bekleyen reklam
// ---------------------------------------------------------------------------

type AdMail = {
  live: string; liveLine: string; resumedLine: string; until: string; bought: string;
  rejected: string; rejectedLine: string; paused: string; pausedLine: string; reportsLine: string;
  ended: string; endedLine: string; stats: string; note: string; button: string;
};
const AD_MAIL: Record<string, AdMail> = {
  "tr": {
    live: "Reklamın yayında: {0}", liveLine: "\"{0}\" başlıklı reklamın yayına girdi.", resumedLine: "\"{0}\" başlıklı reklamın yeniden yayında.",
    until: "Bitiş: {0}", bought: "Satın alınan gösterim: {0}",
    rejected: "Reklamın reddedildi: {0}", rejectedLine: "\"{0}\" başlıklı reklamın incelendi ve yayınlanmayacak. Ödeme yaptıysan iade için bize destek talebiyle ulaşabilirsin.",
    paused: "Reklamın durduruldu: {0}", pausedLine: "\"{0}\" başlıklı reklamın bir yönetici tarafından durduruldu.",
    reportsLine: "\"{0}\" başlıklı reklamın kullanıcı raporları nedeniyle geçici olarak gizlendi; yöneticiler inceleyecek.",
    ended: "Reklamın sona erdi: {0}", endedLine: "\"{0}\" başlıklı reklamının yayını tamamlandı. Teşekkürler!",
    stats: "{0} gösterim · {1} tıklama", note: "Not", button: "Reklamlarımı gör",
  },
  "en": {
    live: "Your ad is live: {0}", liveLine: "Your ad \"{0}\" is now live.", resumedLine: "Your ad \"{0}\" is live again.",
    until: "Ends: {0}", bought: "Purchased impressions: {0}",
    rejected: "Your ad was rejected: {0}", rejectedLine: "Your ad \"{0}\" was reviewed and will not be published. If you paid, open a support ticket for a refund.",
    paused: "Your ad was paused: {0}", pausedLine: "Your ad \"{0}\" was paused by an administrator.",
    reportsLine: "Your ad \"{0}\" was temporarily hidden because of user reports; an administrator will review it.",
    ended: "Your ad has ended: {0}", endedLine: "Your ad \"{0}\" has finished its run. Thank you!",
    stats: "{0} impressions · {1} clicks", note: "Note", button: "View my ads",
  },
  "de": {
    live: "Deine Anzeige ist live: {0}", liveLine: "Deine Anzeige „{0}“ ist jetzt live.", resumedLine: "Deine Anzeige „{0}“ ist wieder live.",
    until: "Endet: {0}", bought: "Gekaufte Impressionen: {0}",
    rejected: "Deine Anzeige wurde abgelehnt: {0}", rejectedLine: "Deine Anzeige „{0}“ wurde geprüft und wird nicht veröffentlicht. Wenn du bezahlt hast, eröffne für eine Erstattung eine Support-Anfrage.",
    paused: "Deine Anzeige wurde pausiert: {0}", pausedLine: "Deine Anzeige „{0}“ wurde von einem Administrator pausiert.",
    reportsLine: "Deine Anzeige „{0}“ wurde wegen Nutzermeldungen vorübergehend ausgeblendet; ein Administrator prüft sie.",
    ended: "Deine Anzeige ist beendet: {0}", endedLine: "Deine Anzeige „{0}“ ist vollständig ausgeliefert. Vielen Dank!",
    stats: "{0} Impressionen · {1} Klicks", note: "Hinweis", button: "Meine Anzeigen ansehen",
  },
  "es": {
    live: "Tu anuncio está publicado: {0}", liveLine: "Tu anuncio «{0}» ya está publicado.", resumedLine: "Tu anuncio «{0}» vuelve a estar publicado.",
    until: "Finaliza: {0}", bought: "Impresiones compradas: {0}",
    rejected: "Tu anuncio fue rechazado: {0}", rejectedLine: "Tu anuncio «{0}» fue revisado y no se publicará. Si ya pagaste, abre una solicitud de soporte para el reembolso.",
    paused: "Tu anuncio fue pausado: {0}", pausedLine: "Un administrador ha pausado tu anuncio «{0}».",
    reportsLine: "Tu anuncio «{0}» se ha ocultado temporalmente por denuncias de usuarios; un administrador lo revisará.",
    ended: "Tu anuncio ha finalizado: {0}", endedLine: "Tu anuncio «{0}» ha completado su campaña. ¡Gracias!",
    stats: "{0} impresiones · {1} clics", note: "Nota", button: "Ver mis anuncios",
  },
  "pt-BR": {
    live: "Seu anúncio está no ar: {0}", liveLine: "Seu anúncio \"{0}\" já está no ar.", resumedLine: "Seu anúncio \"{0}\" está no ar novamente.",
    until: "Termina em: {0}", bought: "Impressões compradas: {0}",
    rejected: "Seu anúncio foi recusado: {0}", rejectedLine: "Seu anúncio \"{0}\" foi analisado e não será publicado. Se você já pagou, abra um chamado de suporte para o reembolso.",
    paused: "Seu anúncio foi pausado: {0}", pausedLine: "Seu anúncio \"{0}\" foi pausado por um administrador.",
    reportsLine: "Seu anúncio \"{0}\" foi ocultado temporariamente por denúncias de usuários; um administrador vai analisá-lo.",
    ended: "Seu anúncio terminou: {0}", endedLine: "A veiculação do seu anúncio \"{0}\" foi concluída. Obrigado!",
    stats: "{0} impressões · {1} cliques", note: "Observação", button: "Ver meus anúncios",
  },
  "pt-PT": {
    live: "O teu anúncio está publicado: {0}", liveLine: "O teu anúncio \"{0}\" já está publicado.", resumedLine: "O teu anúncio \"{0}\" voltou a estar publicado.",
    until: "Termina: {0}", bought: "Impressões compradas: {0}",
    rejected: "O teu anúncio foi recusado: {0}", rejectedLine: "O teu anúncio \"{0}\" foi analisado e não será publicado. Se já pagaste, abre um pedido de suporte para o reembolso.",
    paused: "O teu anúncio foi pausado: {0}", pausedLine: "O teu anúncio \"{0}\" foi pausado por um administrador.",
    reportsLine: "O teu anúncio \"{0}\" foi ocultado temporariamente devido a denúncias de utilizadores; um administrador vai analisá-lo.",
    ended: "O teu anúncio terminou: {0}", endedLine: "A campanha do teu anúncio \"{0}\" terminou. Obrigado!",
    stats: "{0} impressões · {1} cliques", note: "Nota", button: "Ver os meus anúncios",
  },
  "fr": {
    live: "Ton annonce est en ligne : {0}", liveLine: "Ton annonce « {0} » est maintenant en ligne.", resumedLine: "Ton annonce « {0} » est de nouveau en ligne.",
    until: "Fin : {0}", bought: "Impressions achetées : {0}",
    rejected: "Ton annonce a été refusée : {0}", rejectedLine: "Ton annonce « {0} » a été examinée et ne sera pas publiée. Si tu as payé, ouvre une demande d'assistance pour un remboursement.",
    paused: "Ton annonce a été suspendue : {0}", pausedLine: "Ton annonce « {0} » a été suspendue par un administrateur.",
    reportsLine: "Ton annonce « {0} » a été masquée temporairement suite à des signalements ; un administrateur va l'examiner.",
    ended: "Ton annonce est terminée : {0}", endedLine: "La diffusion de ton annonce « {0} » est terminée. Merci !",
    stats: "{0} impressions · {1} clics", note: "Remarque", button: "Voir mes annonces",
  },
  "it": {
    live: "Il tuo annuncio è online: {0}", liveLine: "Il tuo annuncio \"{0}\" è ora online.", resumedLine: "Il tuo annuncio \"{0}\" è di nuovo online.",
    until: "Termina: {0}", bought: "Impression acquistate: {0}",
    rejected: "Il tuo annuncio è stato rifiutato: {0}", rejectedLine: "Il tuo annuncio \"{0}\" è stato esaminato e non verrà pubblicato. Se hai già pagato, apri una richiesta di supporto per il rimborso.",
    paused: "Il tuo annuncio è stato sospeso: {0}", pausedLine: "Il tuo annuncio \"{0}\" è stato sospeso da un amministratore.",
    reportsLine: "Il tuo annuncio \"{0}\" è stato nascosto temporaneamente a causa di segnalazioni degli utenti; un amministratore lo esaminerà.",
    ended: "Il tuo annuncio è terminato: {0}", endedLine: "La campagna del tuo annuncio \"{0}\" è terminata. Grazie!",
    stats: "{0} impression · {1} clic", note: "Nota", button: "Vedi i miei annunci",
  },
  "nl": {
    live: "Je advertentie is live: {0}", liveLine: "Je advertentie \"{0}\" is nu live.", resumedLine: "Je advertentie \"{0}\" is weer live.",
    until: "Eindigt: {0}", bought: "Gekochte vertoningen: {0}",
    rejected: "Je advertentie is afgewezen: {0}", rejectedLine: "Je advertentie \"{0}\" is beoordeeld en wordt niet gepubliceerd. Heb je al betaald, open dan een supportverzoek voor een terugbetaling.",
    paused: "Je advertentie is gepauzeerd: {0}", pausedLine: "Je advertentie \"{0}\" is door een beheerder gepauzeerd.",
    reportsLine: "Je advertentie \"{0}\" is tijdelijk verborgen vanwege meldingen van gebruikers; een beheerder bekijkt hem.",
    ended: "Je advertentie is afgelopen: {0}", endedLine: "Je advertentie \"{0}\" is volledig vertoond. Bedankt!",
    stats: "{0} vertoningen · {1} klikken", note: "Opmerking", button: "Mijn advertenties bekijken",
  },
  "pl": {
    live: "Twoja reklama jest aktywna: {0}", liveLine: "Twoja reklama „{0}” jest już wyświetlana.", resumedLine: "Twoja reklama „{0}” jest ponownie wyświetlana.",
    until: "Koniec: {0}", bought: "Zakupione wyświetlenia: {0}",
    rejected: "Twoja reklama została odrzucona: {0}", rejectedLine: "Twoja reklama „{0}” została sprawdzona i nie zostanie opublikowana. Jeśli już zapłaciłeś, otwórz zgłoszenie do wsparcia w sprawie zwrotu.",
    paused: "Twoja reklama została wstrzymana: {0}", pausedLine: "Twoja reklama „{0}” została wstrzymana przez administratora.",
    reportsLine: "Twoja reklama „{0}” została tymczasowo ukryta z powodu zgłoszeń użytkowników; administrator ją sprawdzi.",
    ended: "Twoja reklama zakończyła się: {0}", endedLine: "Emisja Twojej reklamy „{0}” została zakończona. Dziękujemy!",
    stats: "{0} wyświetleń · {1} kliknięć", note: "Uwaga", button: "Zobacz moje reklamy",
  },
  "sv": {
    live: "Din annons är publicerad: {0}", liveLine: "Din annons \"{0}\" visas nu.", resumedLine: "Din annons \"{0}\" visas igen.",
    until: "Slutar: {0}", bought: "Köpta visningar: {0}",
    rejected: "Din annons avvisades: {0}", rejectedLine: "Din annons \"{0}\" har granskats och kommer inte att publiceras. Om du har betalat, öppna ett supportärende för återbetalning.",
    paused: "Din annons har pausats: {0}", pausedLine: "Din annons \"{0}\" har pausats av en administratör.",
    reportsLine: "Din annons \"{0}\" har tillfälligt dolts på grund av rapporter från användare; en administratör granskar den.",
    ended: "Din annons har avslutats: {0}", endedLine: "Din annons \"{0}\" har visats klart. Tack!",
    stats: "{0} visningar · {1} klick", note: "Notering", button: "Visa mina annonser",
  },
  "fi": {
    live: "Mainoksesi on julkaistu: {0}", liveLine: "Mainoksesi \"{0}\" näkyy nyt.", resumedLine: "Mainoksesi \"{0}\" näkyy taas.",
    until: "Päättyy: {0}", bought: "Ostetut näyttökerrat: {0}",
    rejected: "Mainoksesi hylättiin: {0}", rejectedLine: "Mainoksesi \"{0}\" tarkistettiin, eikä sitä julkaista. Jos olet jo maksanut, avaa tukipyyntö hyvitystä varten.",
    paused: "Mainoksesi keskeytettiin: {0}", pausedLine: "Ylläpitäjä keskeytti mainoksesi \"{0}\".",
    reportsLine: "Mainoksesi \"{0}\" piilotettiin väliaikaisesti käyttäjien ilmoitusten vuoksi; ylläpitäjä tarkistaa sen.",
    ended: "Mainoksesi on päättynyt: {0}", endedLine: "Mainoksesi \"{0}\" kampanja on päättynyt. Kiitos!",
    stats: "{0} näyttökertaa · {1} klikkausta", note: "Huomautus", button: "Näytä mainokseni",
  },
  "ru": {
    live: "Твоя реклама запущена: {0}", liveLine: "Твоя реклама «{0}» теперь показывается.", resumedLine: "Твоя реклама «{0}» снова показывается.",
    until: "Окончание: {0}", bought: "Куплено показов: {0}",
    rejected: "Твоя реклама отклонена: {0}", rejectedLine: "Твоя реклама «{0}» проверена и не будет опубликована. Если ты уже оплатил, создай обращение в поддержку для возврата средств.",
    paused: "Твоя реклама приостановлена: {0}", pausedLine: "Администратор приостановил твою рекламу «{0}».",
    reportsLine: "Твоя реклама «{0}» временно скрыта из-за жалоб пользователей; администратор её проверит.",
    ended: "Показ твоей рекламы завершён: {0}", endedLine: "Показ рекламы «{0}» полностью завершён. Спасибо!",
    stats: "Показов: {0} · кликов: {1}", note: "Примечание", button: "Мои объявления",
  },
  "zh-CN": {
    live: "你的广告已上线：{0}", liveLine: "你的广告“{0}”现已上线。", resumedLine: "你的广告“{0}”已重新上线。",
    until: "结束时间：{0}", bought: "已购买展示次数：{0}",
    rejected: "你的广告未通过审核：{0}", rejectedLine: "你的广告“{0}”经审核后不会发布。如已付款，请提交支持工单申请退款。",
    paused: "你的广告已暂停：{0}", pausedLine: "你的广告“{0}”已被管理员暂停。",
    reportsLine: "由于用户举报，你的广告“{0}”已被暂时隐藏，管理员将进行审核。",
    ended: "你的广告已结束：{0}", endedLine: "你的广告“{0}”已投放完毕。感谢支持！",
    stats: "{0} 次展示 · {1} 次点击", note: "备注", button: "查看我的广告",
  },
  "ja": {
    live: "広告が公開されました：{0}", liveLine: "広告「{0}」の掲載が始まりました。", resumedLine: "広告「{0}」の掲載が再開されました。",
    until: "終了：{0}", bought: "購入したインプレッション数：{0}",
    rejected: "広告が承認されませんでした：{0}", rejectedLine: "広告「{0}」は審査の結果、掲載されません。お支払い済みの場合は、返金のためサポートにお問い合わせください。",
    paused: "広告が一時停止されました：{0}", pausedLine: "広告「{0}」は管理者によって一時停止されました。",
    reportsLine: "広告「{0}」はユーザーからの報告により一時的に非表示になりました。管理者が確認します。",
    ended: "広告の掲載が終了しました：{0}", endedLine: "広告「{0}」の掲載が完了しました。ありがとうございました！",
    stats: "{0} インプレッション · {1} クリック", note: "メモ", button: "自分の広告を見る",
  },
};

const AD_PLACES: Record<string, { tr: string; en: string }> = {
  panel_banner: { tr: "Uygulama · geniş banner", en: "App · wide banner" },
  panel_card: { tr: "Uygulama · kare kart", en: "App · square card" },
  site_home: { tr: "Site · ana sayfa banner", en: "Website · home banner" },
  site_account: { tr: "Site · hesap sayfası kartı", en: "Website · account page card" },
};
const AD_REASONS: Record<string, { tr: string; en: string }> = {
  inappropriate: { tr: "Uygunsuz", en: "Inappropriate" },
  misleading: { tr: "Yanıltıcı / dolandırıcılık", en: "Misleading / scam" },
  spam: { tr: "Spam", en: "Spam" },
  other: { tr: "Diğer", en: "Other" },
};

async function adOwner(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (!["ad_live", "ad_rejected", "ad_ended"].includes(n.kind)) return { ok: true, skipped: true };
  if (!(await emailPrefOn(n.user_id, "ads"))) return { ok: true, skipped: "tercih" };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(AD_MAIL, u.lang);
  const d = n.data ?? {};
  const title = String(d.title ?? "");
  const f = (s: string) => s.replace("{0}", title);
  const nf = (v: unknown) => Number(v ?? 0).toLocaleString(LOCALES[u.lang] ?? "en-GB");
  let subject: string;
  let line: string;
  let color = "#ff8a2a";
  let extra = "";
  if (n.kind === "ad_live") {
    subject = f(m.live);
    line = f(d.resumed ? m.resumedLine : m.liveLine);
    if (d.model === "days" && d.ends_at) extra = m.until.replace("{0}", fmtDay(new Date(d.ends_at), u.lang, true));
    else if (d.model === "impressions") extra = m.bought.replace("{0}", nf(d.quantity));
  } else if (n.kind === "ad_rejected") {
    color = "#e5322d";
    subject = f(d.mode === "rejected" ? m.rejected : m.paused);
    line = f(d.mode === "rejected" ? m.rejectedLine : d.mode === "reports" ? m.reportsLine : m.pausedLine);
  } else {
    subject = f(m.ended);
    line = f(m.endedLine);
    extra = m.stats.replace("{0}", nf(d.impressions)).replace("{1}", nf(d.clicks));
  }
  const place = AD_PLACES[d.placement]?.[u.lang === "tr" ? "tr" : "en"] ?? String(d.placement ?? "");
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid #262b36;border-left:3px solid ${color};border-radius:10px">
      <div style="font:700 16px/1.3 'Segoe UI',Arial,Helvetica,sans-serif;color:#ffffff">${esc(title)}</div>
      <div style="font-size:12px;color:#8a93a4;margin-top:4px">${esc(place)}</div>
    </div>
    <p style="margin:0 0 12px">${esc(line)}</p>
    ${extra ? `<p style="margin:0 0 14px"><b style="color:#ffb35c">${esc(extra)}</b></p>` : ""}
    ${d.note ? `<div style="${BOX}"><div style="font-size:12px;color:#8a93a4;margin-bottom:4px">${esc(m.note)}</div>${esc(d.note)}</div>` : ""}
    ${button(`${SITE}/reklam.html`, m.button)}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line, u.lang));
  return { ok: true, sent };
}

// Yöneticiye: reklam raporlandı / gizlendi, ya da ödendi ve onay bekliyor
async function adAdmin(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "ad_reported" && n.kind !== "ad_pending") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const pending = n.kind === "ad_pending";
  const title = pending
    ? L === "tr" ? "Onay bekleyen reklam" : "Ad awaiting approval"
    : d.hidden ? (L === "tr" ? "Reklam raporlarla gizlendi" : "Ad hidden by reports") : L === "tr" ? "Reklam raporlandı" : "Ad reported";
  const row = (k: string, v: string) =>
    `<tr><td style="color:#8b93a3;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`;
  const body = `
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 14px">
      ${row(L === "tr" ? "Reklam" : "Ad", `<b style="color:#ffb35c">${esc(d.title ?? "?")}</b>`)}
      ${row(L === "tr" ? "Yer" : "Placement", esc(AD_PLACES[d.placement]?.[L] ?? d.placement ?? "?"))}
      ${row(L === "tr" ? "Reklam veren" : "Advertiser", esc(d.name ?? "?"))}
      ${pending ? "" : row(L === "tr" ? "Sebep" : "Reason", esc(AD_REASONS[d.reason]?.[L] ?? d.reason ?? "?"))}
      ${pending ? "" : row(L === "tr" ? "Toplam rapor" : "Total reports", esc(d.reports ?? "?"))}
    </table>
    <p style="color:#8b93a3;font-size:13px;margin:0">${
      pending
        ? L === "tr" ? "Ödeme alındı; otomatik onay kapalı olduğu için reklam yayına girmeden önce onayını bekliyor." : "Payment received; auto-approve is off, so the ad waits for your approval before going live."
        : d.hidden
          ? L === "tr" ? "Rapor sınırı aşıldığı için reklam yayından kaldırıldı. İnceleyip sürdürebilir ya da reddedebilirsin." : "The report threshold was reached, so the ad was taken down. Review it and resume or reject it."
          : L === "tr" ? "Reklam yayında kalıyor; raporları yönetim panelinden inceleyebilirsin." : "The ad stays live; review the reports in the admin panel."
    }</p>
    ${button(`${SITE}/yonetim.html#reklamlar`, L === "tr" ? "Yönetim panelinde aç" : "Open in admin panel")}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${d.title ?? ""}`, page(title, body, String(d.title ?? "")));
  return { ok: true, sent };
}

// Yöneticiye: bir üye arkadaşından gelen mesajı raporladı
const MSG_REASONS: Record<string, { tr: string; en: string }> = {
  harassment: { tr: "Hakaret / taciz", en: "Harassment / abuse" },
  spam: { tr: "Spam", en: "Spam" },
  inappropriate: { tr: "Uygunsuz içerik", en: "Inappropriate content" },
  scam: { tr: "Dolandırıcılık", en: "Scam / fraud" },
  other: { tr: "Diğer", en: "Other" },
};

async function messageReportAdmin(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "message_reported") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const reason = MSG_REASONS[d.reason]?.[L] ?? String(d.reason ?? "?");
  const title = L === "tr" ? "Mesaj raporlandı" : "Message reported";
  const row = (k: string, v: string) =>
    `<tr><td style="color:#8b93a3;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`;
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid #262b36;border-left:3px solid #e5322d;border-radius:10px">
      <div style="font-size:12px;color:#8a93a4;margin-bottom:6px">${esc(d.reported_name ?? "?")}</div>
      <div style="font-size:15px;line-height:1.5;color:#ffffff;white-space:pre-line;word-break:break-word">${esc(d.text ?? "")}</div>
    </div>
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 14px">
      ${row(L === "tr" ? "Sebep" : "Reason", `<b style="color:#ffb35c">${esc(reason)}</b>`)}
      ${row(L === "tr" ? "Gönderen" : "Sender", esc(d.reported_name ?? "?"))}
      ${row(L === "tr" ? "Raporlayan" : "Reported by", esc(d.reporter_name ?? "?"))}
      ${d.note ? row(L === "tr" ? "Not" : "Note", esc(d.note)) : ""}
    </table>
    <p style="color:#8b93a3;font-size:13px;margin:0">${
      L === "tr"
        ? "Raporu yönetim panelinde ya da uygulamada Yönetim → Moderasyon → Mesaj raporları bölümünde inceleyebilir, yoksayabilir ya da mesajı silebilirsin."
        : "Review it in the admin panel or in the app under Admin → Moderation → Message reports, where you can dismiss it or delete the message."
    }</p>
    ${button(`${SITE}/yonetim.html#mesajlar`, L === "tr" ? "Yönetim panelinde aç" : "Open in admin panel")}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${reason}`, page(title, body, String(d.text ?? "").slice(0, 120)));
  return { ok: true, sent };
}

// Yöneticiye: yeni ödeme / iade (PRO, reklam, Patreon, Ko-fi)
const PAY_SOURCES: Record<string, string> = { lemon: "Lemon Squeezy", patreon: "Patreon", kofi: "Ko-fi" };
// pro-webhook reklam planı: "Reklam: <yer>" (yer adları pro-webhook AD_PLACES ile aynı)
const AD_PLAN_KEYS: Record<string, string> = {
  "Uygulama banner": "panel_banner", "Uygulama kart": "panel_card", "Site ana sayfa": "site_home", "Site hesap sayfası": "site_account",
};
function adPlanPlace(plan: unknown, L: "tr" | "en") {
  const raw = String(plan ?? "").replace(/^Reklam:\s*/, "");
  return AD_PLACES[AD_PLAN_KEYS[raw] ?? raw]?.[L] ?? raw;
}
function fmtMoney(amount: unknown, currency: unknown, lang: string) {
  const loc = LOCALES[lang] ?? LOCALES[lang.split("-")[0]] ?? "en-GB";
  const n = Number(amount ?? 0);
  const cur = String(currency ?? "").toUpperCase();
  try {
    return n.toLocaleString(loc, { style: "currency", currency: cur || "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return `${n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
  }
}
const infoRow = (k: string, v: string) =>
  `<tr><td style="color:#8b93a3;padding:6px 14px 6px 0;vertical-align:top;white-space:nowrap;font-size:13px">${esc(k)}</td><td style="padding:6px 0;color:#e9ecf2;font-size:14px">${v}</td></tr>`;
// Büyük tutar kutusu (yeşil: ödeme, kırmızı: iade)
const amountBox = (label: string, money: string, refund: boolean, sub = "") =>
  `<div style="margin:0 0 18px;padding:16px 18px;background:#10131a;border:1px solid #262b36;border-left:3px solid ${refund ? "#e5322d" : "#3ddc84"};border-radius:10px">
      <div style="font-size:12px;color:#8a93a4;text-transform:uppercase;letter-spacing:.6px">${esc(label)}</div>
      <div style="font:800 30px/1.2 'Segoe UI',Arial,Helvetica,sans-serif;color:${refund ? "#ff6b66" : "#3ddc84"};margin-top:4px">${refund ? "&minus;" : ""}${esc(money)}</div>
      ${sub ? `<div style="font-size:13px;color:#cfd5e1;margin-top:6px">${sub}</div>` : ""}
    </div>`;

async function paymentAdmin(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data,created_at").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "payment_new") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const refund = d.kind === "refund";
  const ad = d.ad === true || /^Reklam:/.test(String(d.plan ?? ""));
  const money = fmtMoney(d.amount, d.currency, L);
  const type = ad ? (L === "tr" ? "Reklam" : "Advertising") : L === "tr" ? "PRO üyelik" : "PRO membership";
  const title = refund
    ? L === "tr" ? `İade yapıldı · ${type}` : `Refund issued · ${type}`
    : L === "tr" ? `Yeni satış · ${type}` : `New sale · ${type}`;
  const plan = ad ? adPlanPlace(d.plan, L) : String(d.plan ?? "");
  const body = `
    ${amountBox(refund ? (L === "tr" ? "İade tutarı" : "Refunded") : L === "tr" ? "Tutar" : "Amount", money, refund,
      esc(fmtDay(new Date(n.created_at ?? Date.now()), L, true)))}
    <table role="presentation" style="border-collapse:collapse;margin:0 0 6px;width:100%">
      ${infoRow(L === "tr" ? "Üye" : "Member", d.name ? `<b>${esc(d.name)}</b>` : `<span style="color:#8b93a3">${L === "tr" ? "(hesap eşleşmedi)" : "(no linked account)"}</span>`)}
      ${infoRow(L === "tr" ? "E-posta" : "Email", esc(d.email || "—"))}
      ${infoRow(ad ? (L === "tr" ? "Reklam yeri" : "Ad placement") : "Plan", esc(plan || "—"))}
      ${d.gift ? infoRow(L === "tr" ? "Hediye" : "Gift", `🎁 <b>${esc(d.gift_name || "?")}</b>`) : ""}
      ${infoRow(L === "tr" ? "Kaynak" : "Source", esc(PAY_SOURCES[d.source] ?? d.source ?? "—"))}
      ${infoRow(L === "tr" ? "Kayıt" : "Record", `<span style="font-family:Consolas,monospace;font-size:12px;color:#8b93a3">${esc(d.payment ?? "—")}</span>`)}
    </table>
    ${button(`${SITE}/yonetim.html#satislar`, L === "tr" ? "Satışları aç" : "Open sales")}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${refund ? "−" : "+"}${money}`, page(title, body, `${title}: ${money}`));
  return { ok: true, sent };
}

// Yöneticiye: bir üye kendi dilinde kaydettiği ses paketini gönderdi ("Paketimi gönder")
async function voiceSubmissionAdmin(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data,created_at").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "voice_submission") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const title = L === "tr" ? "Yeni ses paketi gönderildi" : "New voice pack submitted";
  const link = String(d.link ?? "");
  const safeLink = /^https:\/\//i.test(link) ? link : "";
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid #262b36;border-left:3px solid #e5322d;border-radius:10px">
      <div style="font-size:12px;color:#8a93a4;text-transform:uppercase;letter-spacing:.6px">${esc(d.language ?? "?")}</div>
      <div style="font:700 20px/1.3 'Segoe UI',Arial,Helvetica,sans-serif;color:#ffffff;margin-top:4px">${esc(d.pack_name ?? "?")}</div>
    </div>
    <table role="presentation" style="border-collapse:collapse;margin:0 0 14px;width:100%">
      ${infoRow(L === "tr" ? "Gönderen" : "Sent by", `<b>${esc(d.name || "?")}</b>`)}
      ${infoRow(L === "tr" ? "Dil" : "Language", esc(d.language ?? "?"))}
      ${infoRow(L === "tr" ? "Bağlantı" : "Link", safeLink ? `<a href="${esc(safeLink)}" style="color:#ff6b66;word-break:break-all">${esc(safeLink)}</a>` : esc(link))}
      ${d.message ? infoRow(L === "tr" ? "Mesaj" : "Message", `<span style="white-space:pre-line">${esc(d.message)}</span>`) : ""}
    </table>
    <p style="color:#8b93a3;font-size:13px;margin:0">${
      L === "tr"
        ? "Paketi indirip uygulamada Sesli Mühendis → Kendi dilinde ses paketi yap → Eksik kontrolü ile inceleyebilirsin. Uygunsa zip'i GitHub Releases'e yükleyip Yönetim → Ses paketleri bölümünden ekle ve gönderiyi \"Kabul edildi\" yap."
        : "Download it and review it in the app under Voice Engineer → Make a voice pack in your language → Missing check. If it's good, upload the zip to GitHub Releases, add it under Admin → Voice packs and mark the submission \"Accepted\"."
    }</p>
    ${button(`${SITE}/yonetim.html#ses-paketleri`, L === "tr" ? "Yönetim panelinde aç" : "Open in admin panel")}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}: ${d.pack_name ?? ""} (${d.language ?? ""})`, page(title, body, `${d.name ?? ""}: ${d.pack_name ?? ""}`));
  return { ok: true, sent };
}

// Ödeyene: ödeme makbuzu / teşekkür (PRO, reklam) ya da iade onayı — kendi dilinde
type PayMail = {
  proTitle: string; proLine: string; payTitle: string; payLine: string; adTitle: string; adLine: string;
  refundTitle: string; refundLine: string; paid: string; refunded: string; plan: string; place: string; until: string;
  renew: string; account: string; ads: string;
};
const PAY_MAIL: Record<string, PayMail> = {
  "tr": {
    proTitle: "PRO üyeliğin aktif — teşekkürler!", proLine: "Ödemen alındı ve PRO üyeliğin aktif. Desteğin için çok teşekkür ederiz!",
    payTitle: "Ödemen alındı — teşekkürler!", payLine: "Ödemen alındı. Desteğin için çok teşekkür ederiz!",
    adTitle: "Reklam ödemen alındı", adLine: "Reklam ödemen alındı, teşekkürler! Reklamının durumunu reklam panelinden takip edebilirsin.",
    refundTitle: "İaden yapıldı", refundLine: "İaden işleme alındı. Tutarın hesabına yansıması bankana göre birkaç iş günü sürebilir.",
    paid: "Ödenen tutar", refunded: "İade tutarı", plan: "Plan", place: "Reklam yeri", until: "PRO geçerlilik: {0}",
    renew: "Aboneliğin her dönemin sonunda otomatik olarak yenilenir. İptal etmek ya da aboneliğini yönetmek için hesap sayfanı kullanabilirsin.",
    account: "Hesabımı aç", ads: "Reklamlarımı gör",
  },
  "en": {
    proTitle: "Your PRO membership is active — thank you!", proLine: "We received your payment and your PRO membership is active. Thank you so much for your support!",
    payTitle: "Payment received — thank you!", payLine: "We received your payment. Thank you so much for your support!",
    adTitle: "Your ad payment was received", adLine: "We received your ad payment, thank you! You can follow your ad's status in the advertiser panel.",
    refundTitle: "Your refund has been issued", refundLine: "Your refund has been processed. Depending on your bank, it may take a few business days to appear on your account.",
    paid: "Amount paid", refunded: "Amount refunded", plan: "Plan", place: "Ad placement", until: "PRO valid until: {0}",
    renew: "Your subscription renews automatically at the end of each period. You can cancel or manage it from your account page.",
    account: "Open my account", ads: "View my ads",
  },
  "de": {
    proTitle: "Deine PRO-Mitgliedschaft ist aktiv — danke!", proLine: "Wir haben deine Zahlung erhalten und deine PRO-Mitgliedschaft ist aktiv. Vielen Dank für deine Unterstützung!",
    payTitle: "Zahlung erhalten — danke!", payLine: "Wir haben deine Zahlung erhalten. Vielen Dank für deine Unterstützung!",
    adTitle: "Deine Anzeigenzahlung ist eingegangen", adLine: "Wir haben deine Anzeigenzahlung erhalten, danke! Den Status deiner Anzeige kannst du im Werbe-Bereich verfolgen.",
    refundTitle: "Deine Erstattung wurde veranlasst", refundLine: "Deine Erstattung wurde bearbeitet. Je nach Bank kann es einige Werktage dauern, bis sie auf deinem Konto erscheint.",
    paid: "Gezahlter Betrag", refunded: "Erstatteter Betrag", plan: "Plan", place: "Anzeigenplatz", until: "PRO gültig bis: {0}",
    renew: "Dein Abo verlängert sich am Ende jedes Zeitraums automatisch. Kündigen oder verwalten kannst du es auf deiner Kontoseite.",
    account: "Mein Konto öffnen", ads: "Meine Anzeigen ansehen",
  },
  "es": {
    proTitle: "Tu membresía PRO está activa — ¡gracias!", proLine: "Hemos recibido tu pago y tu membresía PRO está activa. ¡Muchas gracias por tu apoyo!",
    payTitle: "Pago recibido — ¡gracias!", payLine: "Hemos recibido tu pago. ¡Muchas gracias por tu apoyo!",
    adTitle: "Hemos recibido el pago de tu anuncio", adLine: "Hemos recibido el pago de tu anuncio, ¡gracias! Puedes seguir el estado de tu anuncio en el panel de anunciante.",
    refundTitle: "Tu reembolso se ha emitido", refundLine: "Tu reembolso se ha procesado. Según tu banco, puede tardar unos días hábiles en aparecer en tu cuenta.",
    paid: "Importe pagado", refunded: "Importe reembolsado", plan: "Plan", place: "Ubicación del anuncio", until: "PRO válido hasta: {0}",
    renew: "Tu suscripción se renueva automáticamente al final de cada periodo. Puedes cancelarla o gestionarla desde la página de tu cuenta.",
    account: "Abrir mi cuenta", ads: "Ver mis anuncios",
  },
  "pt-BR": {
    proTitle: "Sua assinatura PRO está ativa — obrigado!", proLine: "Recebemos seu pagamento e sua assinatura PRO está ativa. Muito obrigado pelo apoio!",
    payTitle: "Pagamento recebido — obrigado!", payLine: "Recebemos seu pagamento. Muito obrigado pelo apoio!",
    adTitle: "Recebemos o pagamento do seu anúncio", adLine: "Recebemos o pagamento do seu anúncio, obrigado! Você pode acompanhar o status do anúncio no painel do anunciante.",
    refundTitle: "Seu reembolso foi emitido", refundLine: "Seu reembolso foi processado. Dependendo do seu banco, pode levar alguns dias úteis para aparecer na sua conta.",
    paid: "Valor pago", refunded: "Valor reembolsado", plan: "Plano", place: "Posição do anúncio", until: "PRO válido até: {0}",
    renew: "Sua assinatura é renovada automaticamente no fim de cada período. Você pode cancelá-la ou gerenciá-la na página da sua conta.",
    account: "Abrir minha conta", ads: "Ver meus anúncios",
  },
  "pt-PT": {
    proTitle: "A tua subscrição PRO está ativa — obrigado!", proLine: "Recebemos o teu pagamento e a tua subscrição PRO está ativa. Muito obrigado pelo apoio!",
    payTitle: "Pagamento recebido — obrigado!", payLine: "Recebemos o teu pagamento. Muito obrigado pelo apoio!",
    adTitle: "Recebemos o pagamento do teu anúncio", adLine: "Recebemos o pagamento do teu anúncio, obrigado! Podes acompanhar o estado do anúncio no painel do anunciante.",
    refundTitle: "O teu reembolso foi emitido", refundLine: "O teu reembolso foi processado. Consoante o teu banco, pode demorar alguns dias úteis a aparecer na tua conta.",
    paid: "Valor pago", refunded: "Valor reembolsado", plan: "Plano", place: "Posição do anúncio", until: "PRO válido até: {0}",
    renew: "A tua subscrição renova-se automaticamente no fim de cada período. Podes cancelá-la ou geri-la na página da tua conta.",
    account: "Abrir a minha conta", ads: "Ver os meus anúncios",
  },
  "fr": {
    proTitle: "Ton abonnement PRO est actif — merci !", proLine: "Nous avons bien reçu ton paiement et ton abonnement PRO est actif. Merci beaucoup pour ton soutien !",
    payTitle: "Paiement reçu — merci !", payLine: "Nous avons bien reçu ton paiement. Merci beaucoup pour ton soutien !",
    adTitle: "Le paiement de ton annonce a été reçu", adLine: "Nous avons bien reçu le paiement de ton annonce, merci ! Tu peux suivre son statut dans l'espace annonceur.",
    refundTitle: "Ton remboursement a été effectué", refundLine: "Ton remboursement a été traité. Selon ta banque, il peut falloir quelques jours ouvrés pour qu'il apparaisse sur ton compte.",
    paid: "Montant payé", refunded: "Montant remboursé", plan: "Formule", place: "Emplacement de l'annonce", until: "PRO valable jusqu'au : {0}",
    renew: "Ton abonnement se renouvelle automatiquement à la fin de chaque période. Tu peux le résilier ou le gérer depuis la page de ton compte.",
    account: "Ouvrir mon compte", ads: "Voir mes annonces",
  },
  "it": {
    proTitle: "Il tuo abbonamento PRO è attivo — grazie!", proLine: "Abbiamo ricevuto il tuo pagamento e il tuo abbonamento PRO è attivo. Grazie mille per il supporto!",
    payTitle: "Pagamento ricevuto — grazie!", payLine: "Abbiamo ricevuto il tuo pagamento. Grazie mille per il supporto!",
    adTitle: "Abbiamo ricevuto il pagamento del tuo annuncio", adLine: "Abbiamo ricevuto il pagamento del tuo annuncio, grazie! Puoi seguirne lo stato nel pannello inserzionista.",
    refundTitle: "Il tuo rimborso è stato emesso", refundLine: "Il tuo rimborso è stato elaborato. A seconda della banca, potrebbero servire alcuni giorni lavorativi prima che compaia sul conto.",
    paid: "Importo pagato", refunded: "Importo rimborsato", plan: "Piano", place: "Posizione dell'annuncio", until: "PRO valido fino al: {0}",
    renew: "Il tuo abbonamento si rinnova automaticamente alla fine di ogni periodo. Puoi annullarlo o gestirlo dalla pagina del tuo account.",
    account: "Apri il mio account", ads: "Vedi i miei annunci",
  },
  "nl": {
    proTitle: "Je PRO-lidmaatschap is actief — bedankt!", proLine: "We hebben je betaling ontvangen en je PRO-lidmaatschap is actief. Heel erg bedankt voor je steun!",
    payTitle: "Betaling ontvangen — bedankt!", payLine: "We hebben je betaling ontvangen. Heel erg bedankt voor je steun!",
    adTitle: "Je advertentiebetaling is ontvangen", adLine: "We hebben je advertentiebetaling ontvangen, bedankt! Je kunt de status van je advertentie volgen in het adverteerderspaneel.",
    refundTitle: "Je terugbetaling is uitgevoerd", refundLine: "Je terugbetaling is verwerkt. Afhankelijk van je bank kan het enkele werkdagen duren voordat deze op je rekening staat.",
    paid: "Betaald bedrag", refunded: "Terugbetaald bedrag", plan: "Abonnement", place: "Advertentieplek", until: "PRO geldig tot: {0}",
    renew: "Je abonnement wordt aan het einde van elke periode automatisch verlengd. Opzeggen of beheren kan via je accountpagina.",
    account: "Mijn account openen", ads: "Mijn advertenties bekijken",
  },
  "pl": {
    proTitle: "Twoje członkostwo PRO jest aktywne — dziękujemy!", proLine: "Otrzymaliśmy Twoją płatność i Twoje członkostwo PRO jest aktywne. Bardzo dziękujemy za wsparcie!",
    payTitle: "Płatność otrzymana — dziękujemy!", payLine: "Otrzymaliśmy Twoją płatność. Bardzo dziękujemy za wsparcie!",
    adTitle: "Otrzymaliśmy płatność za reklamę", adLine: "Otrzymaliśmy płatność za Twoją reklamę, dziękujemy! Status reklamy możesz śledzić w panelu reklamodawcy.",
    refundTitle: "Zwrot został zlecony", refundLine: "Twój zwrot został przetworzony. W zależności od banku pojawienie się środków na koncie może potrwać kilka dni roboczych.",
    paid: "Zapłacona kwota", refunded: "Zwrócona kwota", plan: "Plan", place: "Miejsce reklamy", until: "PRO ważne do: {0}",
    renew: "Twoja subskrypcja odnawia się automatycznie na koniec każdego okresu. Możesz ją anulować lub nią zarządzać na stronie konta.",
    account: "Otwórz moje konto", ads: "Zobacz moje reklamy",
  },
  "sv": {
    proTitle: "Ditt PRO-medlemskap är aktivt — tack!", proLine: "Vi har tagit emot din betalning och ditt PRO-medlemskap är aktivt. Stort tack för ditt stöd!",
    payTitle: "Betalning mottagen — tack!", payLine: "Vi har tagit emot din betalning. Stort tack för ditt stöd!",
    adTitle: "Din annonsbetalning har tagits emot", adLine: "Vi har tagit emot din annonsbetalning, tack! Du kan följa annonsens status i annonsörspanelen.",
    refundTitle: "Din återbetalning är genomförd", refundLine: "Din återbetalning har behandlats. Beroende på din bank kan det ta några bankdagar innan den syns på ditt konto.",
    paid: "Betalt belopp", refunded: "Återbetalt belopp", plan: "Plan", place: "Annonsplats", until: "PRO giltigt till: {0}",
    renew: "Din prenumeration förnyas automatiskt i slutet av varje period. Du kan avsluta eller hantera den på din kontosida.",
    account: "Öppna mitt konto", ads: "Visa mina annonser",
  },
  "fi": {
    proTitle: "PRO-jäsenyytesi on voimassa — kiitos!", proLine: "Maksusi on vastaanotettu ja PRO-jäsenyytesi on voimassa. Kiitos paljon tuestasi!",
    payTitle: "Maksu vastaanotettu — kiitos!", payLine: "Maksusi on vastaanotettu. Kiitos paljon tuestasi!",
    adTitle: "Mainosmaksusi on vastaanotettu", adLine: "Mainosmaksusi on vastaanotettu, kiitos! Voit seurata mainoksesi tilaa mainostajan paneelissa.",
    refundTitle: "Hyvityksesi on maksettu", refundLine: "Hyvityksesi on käsitelty. Pankista riippuen sen näkyminen tililläsi voi kestää muutaman arkipäivän.",
    paid: "Maksettu summa", refunded: "Hyvitetty summa", plan: "Tilaus", place: "Mainospaikka", until: "PRO voimassa: {0} asti",
    renew: "Tilauksesi uusiutuu automaattisesti jokaisen jakson lopussa. Voit perua tai hallita sitä tilisivullasi.",
    account: "Avaa tilini", ads: "Näytä mainokseni",
  },
  "ru": {
    proTitle: "Подписка PRO активна — спасибо!", proLine: "Мы получили твой платёж, подписка PRO активна. Большое спасибо за поддержку!",
    payTitle: "Платёж получен — спасибо!", payLine: "Мы получили твой платёж. Большое спасибо за поддержку!",
    adTitle: "Оплата рекламы получена", adLine: "Мы получили оплату твоей рекламы, спасибо! Статус объявления можно отслеживать в кабинете рекламодателя.",
    refundTitle: "Возврат средств оформлен", refundLine: "Возврат обработан. В зависимости от банка средства могут поступить на счёт в течение нескольких рабочих дней.",
    paid: "Оплачено", refunded: "Возвращено", plan: "Тариф", place: "Место размещения", until: "PRO действует до: {0}",
    renew: "Подписка автоматически продлевается в конце каждого периода. Отменить её или управлять ею можно на странице аккаунта.",
    account: "Открыть мой аккаунт", ads: "Мои объявления",
  },
  "zh-CN": {
    proTitle: "你的 PRO 会员已生效 — 谢谢！", proLine: "我们已收到你的付款，你的 PRO 会员已生效。非常感谢你的支持！",
    payTitle: "已收到付款 — 谢谢！", payLine: "我们已收到你的付款。非常感谢你的支持！",
    adTitle: "已收到你的广告付款", adLine: "我们已收到你的广告付款，谢谢！你可以在广告主面板中查看广告状态。",
    refundTitle: "你的退款已发放", refundLine: "你的退款已处理。根据银行不同，可能需要几个工作日才会到账。",
    paid: "支付金额", refunded: "退款金额", plan: "套餐", place: "广告位置", until: "PRO 有效期至：{0}",
    renew: "你的订阅会在每个周期结束时自动续订。你可以在账户页面取消或管理订阅。",
    account: "打开我的账户", ads: "查看我的广告",
  },
  "ja": {
    proTitle: "PRO メンバーシップが有効になりました — ありがとうございます！", proLine: "お支払いを確認し、PRO メンバーシップが有効になりました。ご支援ありがとうございます！",
    payTitle: "お支払いを受け付けました — ありがとうございます！", payLine: "お支払いを確認しました。ご支援ありがとうございます！",
    adTitle: "広告のお支払いを受け付けました", adLine: "広告のお支払いを確認しました。ありがとうございます！広告のステータスは広告主パネルで確認できます。",
    refundTitle: "返金が完了しました", refundLine: "返金を処理しました。銀行によっては、口座に反映されるまで数営業日かかる場合があります。",
    paid: "お支払い金額", refunded: "返金額", plan: "プラン", place: "広告枠", until: "PRO 有効期限：{0}",
    renew: "サブスクリプションは各期間の終わりに自動更新されます。解約や管理はアカウントページから行えます。",
    account: "アカウントを開く", ads: "自分の広告を見る",
  },
};

async function paymentReceipt(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data,created_at").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "payment_receipt") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(PAY_MAIL, u.lang);
  const L = u.lang === "tr" ? "tr" : "en";
  const d = n.data ?? {};
  const refund = d.kind === "refund";
  const ad = d.ad === true || /^Reklam:/.test(String(d.plan ?? ""));
  // Hediye PRO ödemesi: ödeyen hediye edendir; kendi PRO süresi yazılmaz, alıcının adı gösterilir
  const gift = d.gift === true;
  const gm = pick(PRO_GIFT, u.lang);
  const giftName = String(d.gift_name || "").trim() || "?";
  const money = fmtMoney(d.amount, d.currency, u.lang);
  let title: string;
  let line: string;
  let until: Date | null = null;
  if (!ad && !refund && !gift) {
    // Ödeme kaydı abonelik olayından önce gelebilir: PRO süresinin güncellenmesi için kısa bekle, sonra güncel değeri oku
    // (pg_net isteği 5 sn'de zaman aşımına uğrar; bekleme + gönderim bunun altında kalmalı). Süre bulunamazsa genel teşekkür gider.
    await new Promise((r) => setTimeout(r, 2500));
    const { data: p } = await db.from("profiles").select("pro_until").eq("id", n.user_id).maybeSingle();
    const times = [p?.pro_until, d.pro_until].filter(Boolean).map((x) => new Date(String(x)).getTime()).filter((x) => !isNaN(x));
    const best = times.length ? Math.max(...times) : 0;
    if (best > Date.now()) until = new Date(best);
  }
  if (refund) {
    title = m.refundTitle;
    line = m.refundLine;
  } else if (ad) {
    title = m.adTitle;
    line = m.adLine;
  } else if (gift) {
    title = gm.payTitle;
    line = gm.payLine.replace("{0}", giftName);
  } else if (until) {
    title = m.proTitle;
    line = m.proLine;
  } else {
    title = m.payTitle;
    line = m.payLine;
  }
  const plan = ad ? adPlanPlace(d.plan, L) : String(d.plan ?? "");
  const body = `
    <p style="margin:0 0 16px">${esc(line)}</p>
    ${amountBox(refund ? m.refunded : m.paid, money, refund, esc(fmtDay(new Date(n.created_at ?? Date.now()), u.lang)))}
    ${plan || gift ? `<table role="presentation" style="border-collapse:collapse;margin:0 0 12px">${plan ? infoRow(ad ? m.place : m.plan, `<b>${esc(plan)}</b>`) : ""}${gift ? infoRow(gm.to, `<b>🎁 ${esc(giftName)}</b>`) : ""}</table>` : ""}
    ${until ? `<p style="margin:0 0 14px"><b style="color:#ffb35c">${esc(m.until.replace("{0}", fmtDay(until, u.lang)))}</b></p>` : ""}
    ${!ad && !refund && d.source === "lemon" ? `<div style="${BOX}">${esc(gift ? gm.renew : m.renew)}</div>` : ""}
    ${button(ad ? `${SITE}/reklam.html` : `${SITE}/hesap.html`, ad ? m.ads : m.account)}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${title}`, page(title, body, line, u.lang));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Hediye PRO (15 dil): alıcıya hediye paketi temalı e-posta, hediye edene makbuz ve "hediyen ulaştı", alıcıya "hediye sonlandırıldı"
// ---------------------------------------------------------------------------

type GiftMail = {
  // Alıcıya: hediye geldi
  subject: string; heading: string; line: string; tag: string; from: string; until: string;
  perksTitle: string; perks: [string, string, string]; note: string; button: string;
  // Hediye edene: makbuz (payment_receipt)
  payTitle: string; payLine: string; to: string; renew: string;
  // Hediye edene: hediye ulaştı (pro_gift_sent)
  sentSubject: string; sentLine: string; sentNext: string; sentManage: string; sentButton: string;
  // Alıcıya: hediye sonlandırıldı (pro_gift_ended)
  endSubject: string; endLine: string; endLineNow: string; endHint: string; endButton: string;
};
const PRO_GIFT: Record<string, GiftMail> = {
  "tr": {
    subject: "{0} sana bir hediye gönderdi! 🎁", heading: "{0} sana bir hediye gönderdi!",
    line: "{0} sana SRTR Pitwall PRO üyeliği hediye etti. Tüm PRO özellikleri hesabında açıldı — iyi yarışlar!",
    tag: "Hediye", from: "Kimden: {0}", until: "Geçerlilik: {0} tarihine kadar",
    perksTitle: "Hediyende neler var?",
    perks: ["PRO overlay'ler, sesli spotter ve yarış mühendisi", "Reklamsız SRTR Pitwall", "SRTR Pitwall'un geliştirilmesine destek"],
    note: "Hediye aboneliği hediye eden tarafından yönetilir; senden hiçbir ödeme alınmaz.", button: "Hediyemi gör",
    payTitle: "Hediye PRO ödemen alındı — teşekkürler!", payLine: "{0} için hediye PRO ödemen alındı. Bu güzel jest için teşekkür ederiz!", to: "Hediye edilen",
    renew: "Hediye aboneliği her dönemin sonunda senin ödeme yönteminden otomatik yenilenir. İstediğin zaman hesap sayfandaki \"Hediye ettiğim abonelikler\" bölümünden sonlandırabilirsin; ödenen dönem bitene kadar PRO sürer.",
    sentSubject: "Hediyen ulaştı! 🎁", sentLine: "{0} adlı üyeye hediye ettiğin PRO aboneliği başladı; tüm PRO özellikleri onun hesabında açıldı. Bu güzel jest için teşekkürler!",
    sentNext: "Sonraki yenileme: {0}", sentManage: "Hediyeyi hesap sayfandaki \"Hediye ettiğim abonelikler\" bölümünden istediğin zaman sonlandırabilirsin.", sentButton: "Hediyelerimi gör",
    endSubject: "{0} hediye PRO aboneliğini sonlandırdı", endLine: "{0} hediye ettiği PRO aboneliğini sonlandırdı. PRO {1} tarihine kadar devam eder.",
    endLineNow: "{0} hediye ettiği PRO aboneliğini sonlandırdı.", endHint: "Süre bitince istersen PRO'yu kendin de alabilirsin. Ayarların ve verilerin silinmez.", endButton: "Hesabımı aç",
  },
  "en": {
    subject: "{0} sent you a gift! 🎁", heading: "{0} sent you a gift!",
    line: "{0} gifted you an SRTR Pitwall PRO membership. Every PRO feature is now unlocked on your account — enjoy the races!",
    tag: "Gift", from: "From: {0}", until: "Valid until {0}",
    perksTitle: "What's inside your gift?",
    perks: ["PRO overlays, voice spotter and race engineer", "Ad-free SRTR Pitwall", "Support for SRTR Pitwall's development"],
    note: "The gift subscription is managed by the person who gave it; you won't be charged anything.", button: "See my gift",
    payTitle: "Your PRO gift payment was received — thank you!", payLine: "We received your PRO gift payment for {0}. Thank you for such a kind gesture!", to: "Gift for",
    renew: "The gift subscription renews automatically from your payment method at the end of each period. You can end it anytime under \"Subscriptions I gifted\" on your account page; PRO lasts until the paid period ends.",
    sentSubject: "Your gift has arrived! 🎁", sentLine: "The PRO subscription you gifted to {0} has started, and every PRO feature is now unlocked on their account. Thank you for such a kind gesture!",
    sentNext: "Next renewal: {0}", sentManage: "You can end the gift anytime under \"Subscriptions I gifted\" on your account page.", sentButton: "View my gifts",
    endSubject: "{0} ended your PRO gift subscription", endLine: "{0} ended the PRO subscription they gifted you. Your PRO continues until {1}.",
    endLineNow: "{0} ended the PRO subscription they gifted you.", endHint: "When it ends you can get PRO yourself anytime. Your settings and data are kept.", endButton: "Open my account",
  },
  "de": {
    subject: "{0} hat dir ein Geschenk geschickt! 🎁", heading: "{0} hat dir ein Geschenk geschickt!",
    line: "{0} hat dir eine SRTR Pitwall PRO-Mitgliedschaft geschenkt. Alle PRO-Funktionen sind jetzt in deinem Konto freigeschaltet — viel Spaß beim Rennen!",
    tag: "Geschenk", from: "Von: {0}", until: "Gültig bis {0}",
    perksTitle: "Was steckt in deinem Geschenk?",
    perks: ["PRO-Overlays, Sprach-Spotter und Renningenieur", "SRTR Pitwall ohne Werbung", "Unterstützung der Weiterentwicklung von SRTR Pitwall"],
    note: "Das Geschenk-Abo wird von der schenkenden Person verwaltet; dir wird nichts berechnet.", button: "Mein Geschenk ansehen",
    payTitle: "Deine PRO-Geschenkzahlung ist eingegangen — danke!", payLine: "Wir haben deine PRO-Geschenkzahlung für {0} erhalten. Danke für diese tolle Geste!", to: "Geschenk für",
    renew: "Das Geschenk-Abo verlängert sich am Ende jedes Zeitraums automatisch über deine Zahlungsmethode. Du kannst es jederzeit auf deiner Kontoseite unter \"Verschenkte Abos\" beenden; PRO bleibt bis zum Ende des bezahlten Zeitraums aktiv.",
    sentSubject: "Dein Geschenk ist angekommen! 🎁", sentLine: "Das PRO-Abo, das du {0} geschenkt hast, hat begonnen; alle PRO-Funktionen sind in seinem Konto freigeschaltet. Danke für diese tolle Geste!",
    sentNext: "Nächste Verlängerung: {0}", sentManage: "Du kannst das Geschenk jederzeit auf deiner Kontoseite unter \"Verschenkte Abos\" beenden.", sentButton: "Meine Geschenke ansehen",
    endSubject: "{0} hat dein PRO-Geschenk-Abo beendet", endLine: "{0} hat das PRO-Abo beendet, das er/sie dir geschenkt hat. Dein PRO läuft noch bis {1}.",
    endLineNow: "{0} hat das PRO-Abo beendet, das er/sie dir geschenkt hat.", endHint: "Danach kannst du PRO jederzeit selbst holen. Deine Einstellungen und Daten bleiben erhalten.", endButton: "Mein Konto öffnen",
  },
  "es": {
    subject: "¡{0} te ha enviado un regalo! 🎁", heading: "¡{0} te ha enviado un regalo!",
    line: "{0} te ha regalado una membresía SRTR Pitwall PRO. Todas las funciones PRO ya están activas en tu cuenta. ¡Disfruta de las carreras!",
    tag: "Regalo", from: "De: {0}", until: "Válido hasta el {0}",
    perksTitle: "¿Qué incluye tu regalo?",
    perks: ["Overlays PRO, spotter por voz e ingeniero de carrera", "SRTR Pitwall sin anuncios", "Apoyo al desarrollo de SRTR Pitwall"],
    note: "La suscripción de regalo la gestiona quien te la regaló; no se te cobrará nada.", button: "Ver mi regalo",
    payTitle: "Hemos recibido el pago de tu regalo PRO — ¡gracias!", payLine: "Hemos recibido el pago de tu regalo PRO para {0}. ¡Gracias por este bonito gesto!", to: "Regalo para",
    renew: "La suscripción de regalo se renueva automáticamente con tu método de pago al final de cada periodo. Puedes finalizarla cuando quieras en \"Suscripciones que regalé\" en la página de tu cuenta; el PRO dura hasta el final del periodo pagado.",
    sentSubject: "¡Tu regalo ha llegado! 🎁", sentLine: "La suscripción PRO que regalaste a {0} ya ha comenzado y todas las funciones PRO están activas en su cuenta. ¡Gracias por este bonito gesto!",
    sentNext: "Próxima renovación: {0}", sentManage: "Puedes finalizar el regalo cuando quieras en \"Suscripciones que regalé\" en la página de tu cuenta.", sentButton: "Ver mis regalos",
    endSubject: "{0} ha finalizado tu suscripción PRO de regalo", endLine: "{0} ha finalizado la suscripción PRO que te regaló. Tu PRO sigue activo hasta el {1}.",
    endLineNow: "{0} ha finalizado la suscripción PRO que te regaló.", endHint: "Cuando termine, puedes conseguir PRO tú mismo cuando quieras. Tus ajustes y datos se conservan.", endButton: "Abrir mi cuenta",
  },
  "pt-BR": {
    subject: "{0} te enviou um presente! 🎁", heading: "{0} te enviou um presente!",
    line: "{0} te deu de presente uma assinatura SRTR Pitwall PRO. Todos os recursos PRO já estão liberados na sua conta — boas corridas!",
    tag: "Presente", from: "De: {0}", until: "Válido até {0}",
    perksTitle: "O que vem no seu presente?",
    perks: ["Overlays PRO, spotter por voz e engenheiro de corrida", "SRTR Pitwall sem anúncios", "Apoio ao desenvolvimento do SRTR Pitwall"],
    note: "A assinatura de presente é gerenciada por quem a deu; você não será cobrado.", button: "Ver meu presente",
    payTitle: "Recebemos o pagamento do seu presente PRO — obrigado!", payLine: "Recebemos o pagamento do presente PRO para {0}. Obrigado por esse gesto tão legal!", to: "Presente para",
    renew: "A assinatura de presente é renovada automaticamente no seu método de pagamento ao fim de cada período. Você pode encerrá-la quando quiser em \"Assinaturas que presenteei\" na página da sua conta; o PRO dura até o fim do período pago.",
    sentSubject: "Seu presente chegou! 🎁", sentLine: "A assinatura PRO que você deu para {0} começou, e todos os recursos PRO estão liberados na conta. Obrigado por esse gesto tão legal!",
    sentNext: "Próxima renovação: {0}", sentManage: "Você pode encerrar o presente quando quiser em \"Assinaturas que presenteei\" na página da sua conta.", sentButton: "Ver meus presentes",
    endSubject: "{0} encerrou sua assinatura PRO de presente", endLine: "{0} encerrou a assinatura PRO que te deu de presente. Seu PRO continua até {1}.",
    endLineNow: "{0} encerrou a assinatura PRO que te deu de presente.", endHint: "Quando terminar, você pode assinar o PRO por conta própria quando quiser. Suas configurações e dados são mantidos.", endButton: "Abrir minha conta",
  },
  "pt-PT": {
    subject: "{0} enviou-te um presente! 🎁", heading: "{0} enviou-te um presente!",
    line: "{0} ofereceu-te uma subscrição SRTR Pitwall PRO. Todas as funcionalidades PRO já estão ativas na tua conta — boas corridas!",
    tag: "Presente", from: "De: {0}", until: "Válido até {0}",
    perksTitle: "O que traz o teu presente?",
    perks: ["Overlays PRO, spotter por voz e engenheiro de corrida", "SRTR Pitwall sem anúncios", "Apoio ao desenvolvimento do SRTR Pitwall"],
    note: "A subscrição oferecida é gerida por quem a ofereceu; não te será cobrado nada.", button: "Ver o meu presente",
    payTitle: "Recebemos o pagamento da tua oferta PRO — obrigado!", payLine: "Recebemos o pagamento da oferta PRO para {0}. Obrigado por este gesto tão simpático!", to: "Oferta para",
    renew: "A subscrição oferecida renova-se automaticamente no teu método de pagamento no fim de cada período. Podes terminá-la quando quiseres em \"Subscrições que ofereci\" na página da tua conta; o PRO dura até ao fim do período pago.",
    sentSubject: "O teu presente chegou! 🎁", sentLine: "A subscrição PRO que ofereceste a {0} começou, e todas as funcionalidades PRO estão ativas na conta. Obrigado por este gesto tão simpático!",
    sentNext: "Próxima renovação: {0}", sentManage: "Podes terminar a oferta quando quiseres em \"Subscrições que ofereci\" na página da tua conta.", sentButton: "Ver as minhas ofertas",
    endSubject: "{0} terminou a tua subscrição PRO oferecida", endLine: "{0} terminou a subscrição PRO que te ofereceu. O teu PRO continua até {1}.",
    endLineNow: "{0} terminou a subscrição PRO que te ofereceu.", endHint: "Quando terminar, podes subscrever o PRO tu mesmo quando quiseres. As tuas definições e dados mantêm-se.", endButton: "Abrir a minha conta",
  },
  "fr": {
    subject: "{0} t'a envoyé un cadeau ! 🎁", heading: "{0} t'a envoyé un cadeau !",
    line: "{0} t'a offert un abonnement SRTR Pitwall PRO. Toutes les fonctions PRO sont maintenant débloquées sur ton compte — bonnes courses !",
    tag: "Cadeau", from: "De la part de : {0}", until: "Valable jusqu'au {0}",
    perksTitle: "Que contient ton cadeau ?",
    perks: ["Overlays PRO, spotter vocal et ingénieur de course", "SRTR Pitwall sans publicité", "Un soutien au développement de SRTR Pitwall"],
    note: "L'abonnement offert est géré par la personne qui te l'a offert ; rien ne te sera facturé.", button: "Voir mon cadeau",
    payTitle: "Le paiement de ton cadeau PRO a été reçu — merci !", payLine: "Nous avons bien reçu le paiement de ton cadeau PRO pour {0}. Merci pour ce joli geste !", to: "Cadeau pour",
    renew: "L'abonnement offert se renouvelle automatiquement avec ton moyen de paiement à la fin de chaque période. Tu peux y mettre fin à tout moment dans « Abonnements offerts » sur la page de ton compte ; le PRO reste actif jusqu'à la fin de la période payée.",
    sentSubject: "Ton cadeau est arrivé ! 🎁", sentLine: "L'abonnement PRO que tu as offert à {0} a commencé, et toutes les fonctions PRO sont débloquées sur son compte. Merci pour ce joli geste !",
    sentNext: "Prochain renouvellement : {0}", sentManage: "Tu peux mettre fin au cadeau à tout moment dans « Abonnements offerts » sur la page de ton compte.", sentButton: "Voir mes cadeaux",
    endSubject: "{0} a mis fin à ton abonnement PRO offert", endLine: "{0} a mis fin à l'abonnement PRO qu'il/elle t'a offert. Ton PRO continue jusqu'au {1}.",
    endLineNow: "{0} a mis fin à l'abonnement PRO qu'il/elle t'a offert.", endHint: "Ensuite, tu peux prendre PRO toi-même quand tu veux. Tes réglages et données sont conservés.", endButton: "Ouvrir mon compte",
  },
  "it": {
    subject: "{0} ti ha mandato un regalo! 🎁", heading: "{0} ti ha mandato un regalo!",
    line: "{0} ti ha regalato un abbonamento SRTR Pitwall PRO. Tutte le funzioni PRO sono ora attive sul tuo account — buone gare!",
    tag: "Regalo", from: "Da: {0}", until: "Valido fino al {0}",
    perksTitle: "Cosa contiene il tuo regalo?",
    perks: ["Overlay PRO, spotter vocale e ingegnere di gara", "SRTR Pitwall senza pubblicità", "Supporto allo sviluppo di SRTR Pitwall"],
    note: "L'abbonamento regalo è gestito da chi te l'ha regalato; non ti verrà addebitato nulla.", button: "Vedi il mio regalo",
    payTitle: "Abbiamo ricevuto il pagamento del tuo regalo PRO — grazie!", payLine: "Abbiamo ricevuto il pagamento del regalo PRO per {0}. Grazie per questo bel gesto!", to: "Regalo per",
    renew: "L'abbonamento regalo si rinnova automaticamente con il tuo metodo di pagamento alla fine di ogni periodo. Puoi terminarlo quando vuoi in \"Abbonamenti regalati\" nella pagina del tuo account; il PRO dura fino alla fine del periodo pagato.",
    sentSubject: "Il tuo regalo è arrivato! 🎁", sentLine: "L'abbonamento PRO che hai regalato a {0} è iniziato e tutte le funzioni PRO sono attive sul suo account. Grazie per questo bel gesto!",
    sentNext: "Prossimo rinnovo: {0}", sentManage: "Puoi terminare il regalo quando vuoi in \"Abbonamenti regalati\" nella pagina del tuo account.", sentButton: "Vedi i miei regali",
    endSubject: "{0} ha terminato il tuo abbonamento PRO regalo", endLine: "{0} ha terminato l'abbonamento PRO che ti aveva regalato. Il tuo PRO continua fino al {1}.",
    endLineNow: "{0} ha terminato l'abbonamento PRO che ti aveva regalato.", endHint: "Alla scadenza puoi attivare PRO tu stesso quando vuoi. Impostazioni e dati restano.", endButton: "Apri il mio account",
  },
  "nl": {
    subject: "{0} heeft je een cadeau gestuurd! 🎁", heading: "{0} heeft je een cadeau gestuurd!",
    line: "{0} heeft je een SRTR Pitwall PRO-lidmaatschap cadeau gegeven. Alle PRO-functies zijn nu ontgrendeld op je account — veel raceplezier!",
    tag: "Cadeau", from: "Van: {0}", until: "Geldig tot {0}",
    perksTitle: "Wat zit er in je cadeau?",
    perks: ["PRO-overlays, gesproken spotter en race-engineer", "SRTR Pitwall zonder advertenties", "Steun voor de ontwikkeling van SRTR Pitwall"],
    note: "Het cadeau-abonnement wordt beheerd door de gever; jij betaalt niets.", button: "Mijn cadeau bekijken",
    payTitle: "Je PRO-cadeaubetaling is ontvangen — bedankt!", payLine: "We hebben je PRO-cadeaubetaling voor {0} ontvangen. Bedankt voor dit mooie gebaar!", to: "Cadeau voor",
    renew: "Het cadeau-abonnement wordt aan het einde van elke periode automatisch verlengd via jouw betaalmethode. Je kunt het altijd beëindigen onder \"Cadeau-abonnementen\" op je accountpagina; PRO blijft tot het einde van de betaalde periode.",
    sentSubject: "Je cadeau is aangekomen! 🎁", sentLine: "Het PRO-abonnement dat je aan {0} hebt gegeven is gestart; alle PRO-functies zijn ontgrendeld op diens account. Bedankt voor dit mooie gebaar!",
    sentNext: "Volgende verlenging: {0}", sentManage: "Je kunt het cadeau altijd beëindigen onder \"Cadeau-abonnementen\" op je accountpagina.", sentButton: "Mijn cadeaus bekijken",
    endSubject: "{0} heeft je PRO-cadeau-abonnement beëindigd", endLine: "{0} heeft het PRO-abonnement beëindigd dat je cadeau kreeg. Je PRO loopt door tot {1}.",
    endLineNow: "{0} heeft het PRO-abonnement beëindigd dat je cadeau kreeg.", endHint: "Daarna kun je PRO altijd zelf nemen. Je instellingen en gegevens blijven bewaard.", endButton: "Mijn account openen",
  },
  "pl": {
    subject: "{0} wysłał(a) Ci prezent! 🎁", heading: "{0} wysłał(a) Ci prezent!",
    line: "{0} podarował(a) Ci członkostwo SRTR Pitwall PRO. Wszystkie funkcje PRO są już odblokowane na Twoim koncie — udanych wyścigów!",
    tag: "Prezent", from: "Od: {0}", until: "Ważne do {0}",
    perksTitle: "Co jest w Twoim prezencie?",
    perks: ["Overlaye PRO, głosowy spotter i inżynier wyścigowy", "SRTR Pitwall bez reklam", "Wsparcie rozwoju SRTR Pitwall"],
    note: "Podarowaną subskrypcją zarządza osoba, która ją podarowała; nic nie zapłacisz.", button: "Zobacz mój prezent",
    payTitle: "Otrzymaliśmy płatność za prezent PRO — dziękujemy!", payLine: "Otrzymaliśmy płatność za prezent PRO dla {0}. Dziękujemy za ten miły gest!", to: "Prezent dla",
    renew: "Podarowana subskrypcja odnawia się automatycznie z Twojej metody płatności na koniec każdego okresu. Możesz ją zakończyć w dowolnej chwili w sekcji \"Podarowane subskrypcje\" na stronie konta; PRO trwa do końca opłaconego okresu.",
    sentSubject: "Twój prezent dotarł! 🎁", sentLine: "Subskrypcja PRO, którą podarowałeś(-aś) {0}, wystartowała — wszystkie funkcje PRO są odblokowane na tym koncie. Dziękujemy za ten miły gest!",
    sentNext: "Następne odnowienie: {0}", sentManage: "Możesz zakończyć prezent w dowolnej chwili w sekcji \"Podarowane subskrypcje\" na stronie konta.", sentButton: "Zobacz moje prezenty",
    endSubject: "{0} zakończył(a) podarowaną Ci subskrypcję PRO", endLine: "{0} zakończył(a) podarowaną Ci subskrypcję PRO. Twoje PRO trwa do {1}.",
    endLineNow: "{0} zakończył(a) podarowaną Ci subskrypcję PRO.", endHint: "Potem możesz w każdej chwili wykupić PRO samodzielnie. Ustawienia i dane zostają.", endButton: "Otwórz moje konto",
  },
  "sv": {
    subject: "{0} har skickat en present till dig! 🎁", heading: "{0} har skickat en present till dig!",
    line: "{0} har gett dig ett SRTR Pitwall PRO-medlemskap i present. Alla PRO-funktioner är nu upplåsta på ditt konto — lycka till på banan!",
    tag: "Present", from: "Från: {0}", until: "Giltigt till {0}",
    perksTitle: "Vad ingår i din present?",
    perks: ["PRO-overlays, röst-spotter och tävlingsingenjör", "SRTR Pitwall utan annonser", "Stöd för utvecklingen av SRTR Pitwall"],
    note: "Presentprenumerationen hanteras av den som gav den; du debiteras ingenting.", button: "Visa min present",
    payTitle: "Din PRO-presentbetalning har tagits emot — tack!", payLine: "Vi har tagit emot din PRO-presentbetalning för {0}. Tack för en fin gest!", to: "Present till",
    renew: "Presentprenumerationen förnyas automatiskt via din betalmetod i slutet av varje period. Du kan avsluta den när som helst under \"Prenumerationer jag gett bort\" på din kontosida; PRO gäller till slutet av den betalda perioden.",
    sentSubject: "Din present har kommit fram! 🎁", sentLine: "PRO-prenumerationen du gav till {0} har startat, och alla PRO-funktioner är upplåsta på kontot. Tack för en fin gest!",
    sentNext: "Nästa förnyelse: {0}", sentManage: "Du kan avsluta presenten när som helst under \"Prenumerationer jag gett bort\" på din kontosida.", sentButton: "Visa mina presenter",
    endSubject: "{0} har avslutat din PRO-presentprenumeration", endLine: "{0} har avslutat PRO-prenumerationen du fick i present. Ditt PRO gäller till {1}.",
    endLineNow: "{0} har avslutat PRO-prenumerationen du fick i present.", endHint: "Därefter kan du skaffa PRO själv när du vill. Dina inställningar och data finns kvar.", endButton: "Öppna mitt konto",
  },
  "fi": {
    subject: "{0} lähetti sinulle lahjan! 🎁", heading: "{0} lähetti sinulle lahjan!",
    line: "{0} antoi sinulle SRTR Pitwall PRO -jäsenyyden lahjaksi. Kaikki PRO-ominaisuudet ovat nyt käytössä tililläsi — hyviä kisoja!",
    tag: "Lahja", from: "Lähettäjä: {0}", until: "Voimassa {0} asti",
    perksTitle: "Mitä lahjasi sisältää?",
    perks: ["PRO-overlayt, puhuva spotteri ja kilpainsinööri", "Mainokseton SRTR Pitwall", "Tukea SRTR Pitwallin kehitykselle"],
    note: "Lahjatilausta hallinnoi sen antaja; sinulta ei veloiteta mitään.", button: "Katso lahjani",
    payTitle: "PRO-lahjasi maksu on vastaanotettu — kiitos!", payLine: "Olemme vastaanottaneet PRO-lahjan maksun käyttäjälle {0}. Kiitos hienosta eleestä!", to: "Lahja käyttäjälle",
    renew: "Lahjatilaus uusiutuu automaattisesti maksutavallasi jokaisen jakson lopussa. Voit lopettaa sen milloin tahansa tilisivusi kohdasta \"Lahjoittamani tilaukset\"; PRO on voimassa maksetun jakson loppuun.",
    sentSubject: "Lahjasi on perillä! 🎁", sentLine: "Käyttäjälle {0} lahjoittamasi PRO-tilaus on alkanut, ja kaikki PRO-ominaisuudet ovat käytössä hänen tilillään. Kiitos hienosta eleestä!",
    sentNext: "Seuraava uusinta: {0}", sentManage: "Voit lopettaa lahjan milloin tahansa tilisivusi kohdasta \"Lahjoittamani tilaukset\".", sentButton: "Katso lahjani",
    endSubject: "{0} lopetti sinulle lahjoittamansa PRO-tilauksen", endLine: "{0} lopetti sinulle lahjoittamansa PRO-tilauksen. PRO jatkuu {1} asti.",
    endLineNow: "{0} lopetti sinulle lahjoittamansa PRO-tilauksen.", endHint: "Sen jälkeen voit hankkia PRO:n itse milloin tahansa. Asetukset ja tiedot säilyvät.", endButton: "Avaa tilini",
  },
  "ru": {
    subject: "{0} отправил(а) тебе подарок! 🎁", heading: "{0} отправил(а) тебе подарок!",
    line: "{0} подарил(а) тебе подписку SRTR Pitwall PRO. Все PRO-функции уже открыты в твоём аккаунте — удачных гонок!",
    tag: "Подарок", from: "От: {0}", until: "Действует до {0}",
    perksTitle: "Что в твоём подарке?",
    perks: ["PRO-оверлеи, голосовой споттер и гоночный инженер", "SRTR Pitwall без рекламы", "Поддержка развития SRTR Pitwall"],
    note: "Подарочной подпиской управляет тот, кто её подарил; с тебя ничего не спишут.", button: "Посмотреть подарок",
    payTitle: "Оплата подарка PRO получена — спасибо!", payLine: "Мы получили оплату подарка PRO для {0}. Спасибо за такой приятный жест!", to: "Подарок для",
    renew: "Подарочная подписка автоматически продлевается с твоего способа оплаты в конце каждого периода. Ты можешь завершить её в любой момент в разделе \"Подаренные подписки\" на странице аккаунта; PRO действует до конца оплаченного периода.",
    sentSubject: "Твой подарок доставлен! 🎁", sentLine: "Подписка PRO, которую ты подарил(а) {0}, началась — все PRO-функции открыты в его аккаунте. Спасибо за такой приятный жест!",
    sentNext: "Следующее продление: {0}", sentManage: "Ты можешь завершить подарок в любой момент в разделе \"Подаренные подписки\" на странице аккаунта.", sentButton: "Мои подарки",
    endSubject: "{0} завершил(а) подаренную тебе подписку PRO", endLine: "{0} завершил(а) подаренную тебе подписку PRO. PRO действует до {1}.",
    endLineNow: "{0} завершил(а) подаренную тебе подписку PRO.", endHint: "После этого ты можешь в любой момент оформить PRO сам(а). Настройки и данные сохраняются.", endButton: "Открыть мой аккаунт",
  },
  "zh-CN": {
    subject: "{0} 给你送来了一份礼物！🎁", heading: "{0} 给你送来了一份礼物！",
    line: "{0} 送了你一份 SRTR Pitwall PRO 会员。你的账户已解锁所有 PRO 功能——祝你比赛愉快！",
    tag: "礼物", from: "来自：{0}", until: "有效期至 {0}",
    perksTitle: "你的礼物包含什么？",
    perks: ["PRO 叠加层、语音观察员和比赛工程师", "无广告的 SRTR Pitwall", "支持 SRTR Pitwall 的持续开发"],
    note: "礼物订阅由赠送者管理，你无需支付任何费用。", button: "查看我的礼物",
    payTitle: "已收到你的 PRO 礼物付款 — 谢谢！", payLine: "我们已收到你赠送给 {0} 的 PRO 礼物付款。感谢你的这份心意！", to: "赠送给",
    renew: "礼物订阅会在每个周期结束时通过你的付款方式自动续订。你可以随时在账户页面的“我赠送的订阅”中终止；PRO 会持续到已付费周期结束。",
    sentSubject: "你的礼物已送达！🎁", sentLine: "你赠送给 {0} 的 PRO 订阅已开始，对方账户已解锁所有 PRO 功能。感谢你的这份心意！",
    sentNext: "下次续订：{0}", sentManage: "你可以随时在账户页面的“我赠送的订阅”中终止这份礼物。", sentButton: "查看我的礼物",
    endSubject: "{0} 终止了赠送给你的 PRO 订阅", endLine: "{0} 终止了赠送给你的 PRO 订阅。你的 PRO 将持续到 {1}。",
    endLineNow: "{0} 终止了赠送给你的 PRO 订阅。", endHint: "到期后你可以随时自行订阅 PRO。你的设置和数据会保留。", endButton: "打开我的账户",
  },
  "ja": {
    subject: "{0} さんからギフトが届きました！🎁", heading: "{0} さんからギフトが届きました！",
    line: "{0} さんから SRTR Pitwall PRO メンバーシップがプレゼントされました。アカウントですべての PRO 機能が使えるようになりました。レースを楽しんでください！",
    tag: "ギフト", from: "贈り主：{0}", until: "有効期限：{0}",
    perksTitle: "ギフトの中身",
    perks: ["PRO オーバーレイ、音声スポッターとレースエンジニア", "広告なしの SRTR Pitwall", "SRTR Pitwall の開発支援"],
    note: "ギフトのサブスクリプションは贈り主が管理します。あなたに請求されることはありません。", button: "ギフトを見る",
    payTitle: "PRO ギフトのお支払いを受け付けました — ありがとうございます！", payLine: "{0} さんへの PRO ギフトのお支払いを確認しました。素敵な贈り物をありがとうございます！", to: "贈り先",
    renew: "ギフトのサブスクリプションは各期間の終わりにあなたのお支払い方法で自動更新されます。アカウントページの「贈ったサブスクリプション」からいつでも終了でき、PRO は支払い済み期間の終わりまで続きます。",
    sentSubject: "ギフトが届きました！🎁", sentLine: "{0} さんに贈った PRO サブスクリプションが始まり、相手のアカウントですべての PRO 機能が使えるようになりました。素敵な贈り物をありがとうございます！",
    sentNext: "次回更新：{0}", sentManage: "アカウントページの「贈ったサブスクリプション」からいつでもギフトを終了できます。", sentButton: "贈ったギフトを見る",
    endSubject: "{0} さんがギフトの PRO サブスクリプションを終了しました", endLine: "{0} さんが贈った PRO サブスクリプションを終了しました。PRO は {1} まで続きます。",
    endLineNow: "{0} さんが贈った PRO サブスクリプションを終了しました。", endHint: "終了後はいつでもご自身で PRO に登録できます。設定とデータは保持されます。", endButton: "アカウントを開く",
  },
};

// Hediye kutusu başlığı (e-posta istemcilerinde güvenli: sadece tablo + satır içi stil, kırmızı kutu, altın kurdele)
function giftBox(label: string) {
  const red = "#c62a24";
  const redDark = "#9e1f1a";
  const gold = "#ffc94a";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
  <tr><td align="center" style="font:400 46px/1 Arial,Helvetica,sans-serif;padding:0 0 2px">🎀</td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background:${red};height:24px;border-radius:10px 0 0 0;border-bottom:3px solid ${redDark};font-size:0;line-height:0">&nbsp;</td>
    <td width="34" style="width:34px;background:${gold};border-bottom:3px solid #c9971c;font-size:0;line-height:0">&nbsp;</td>
    <td style="background:${red};border-radius:0 10px 0 0;border-bottom:3px solid ${redDark};font-size:0;line-height:0">&nbsp;</td>
  </tr></table></td></tr>
  <tr><td style="padding:0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" align="center" style="background:${redDark};padding:22px 8px;border-radius:0 0 0 10px">
      <div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#ffe3a3">${esc(label)}</div>
      <div style="font:900 34px/1.15 Arial,Helvetica,sans-serif;color:${gold};margin-top:6px;letter-spacing:2px">PRO</div>
    </td>
    <td width="34" style="width:34px;background:${gold};font-size:0;line-height:0">&nbsp;</td>
    <td width="50%" align="center" style="background:${redDark};padding:22px 8px;border-radius:0 0 10px 0;font:400 44px/1 Arial,Helvetica,sans-serif">🎁</td>
  </tr></table></td></tr>
</table>`;
}

// Hediye etiketi kartı: "SRTR Pitwall PRO · <plan>", kimden, geçerlilik
function giftTag(title: string, lines: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#1b1610;border:1px dashed #ffc94a;border-radius:12px">
  <tr><td style="padding:14px 18px;font-family:'Segoe UI',Arial,Helvetica,sans-serif">
    <div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#ffc94a">🏷️ &nbsp;SRTR Pitwall</div>
    <div style="font:800 20px/1.3 'Segoe UI',Arial,Helvetica,sans-serif;color:#ffffff;margin-top:6px">${title}</div>
    ${lines.map((l) => `<div style="font-size:13px;color:#e8d9b5;margin-top:4px">${l}</div>`).join("")}
  </td></tr></table>`;
}

async function giftNotice(id: string, kind: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { n: null, res: { ok: false, error: error?.message ?? "bildirim yok" } };
  if (n.kind !== kind) return { n: null, res: { ok: true, skipped: true } };
  return { n, res: null };
}

// Alıcıya: bir üye PRO hediye etti (hediye paketi temalı)
async function proGift(id: string) {
  const { n, res } = await giftNotice(id, "pro_gift");
  if (!n) return res!;
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(PRO_GIFT, u.lang);
  const d = n.data ?? {};
  const name = String(d.name || "").trim() || "SRTR Pitwall";
  const until = d.until ? new Date(d.until) : null;
  const valid = !!until && !isNaN(until.getTime()) && until.getTime() > Date.now();
  const forever = valid && until!.getTime() - Date.now() > 3000 * 86400000;
  const subject = m.subject.replace("{0}", name);
  const heading = m.heading.replace("{0}", name);
  const line = m.line.replace("{0}", name);
  const tagLines = [esc(m.from.replace("{0}", name))];
  if (valid && !forever) tagLines.push(`<b style="color:#ffb35c">${esc(m.until.replace("{0}", fmtDay(until!, u.lang)))}</b>`);
  const perks = m.perks
    .map((p) => `<tr><td width="26" valign="top" style="width:26px;color:#ffc94a;font:700 15px/1.5 Arial,Helvetica,sans-serif">✦</td><td style="color:#e9ecf2;font-size:14px;line-height:1.5;padding:0 0 6px">${esc(p)}</td></tr>`)
    .join("");
  const body = `
    ${giftBox(m.tag)}
    <p style="margin:0 0 16px;font-size:15px">${esc(line)}</p>
    ${giftTag(`SRTR Pitwall PRO${d.plan ? ` · ${esc(d.plan)}` : ""}`, tagLines)}
    <div style="margin:0 0 6px;font:700 13px/1.4 'Segoe UI',Arial,Helvetica,sans-serif;letter-spacing:.5px;color:#ffc94a">${esc(m.perksTitle)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${perks}</table>
    <p style="margin:0 0 4px;color:#8a93a4;font-size:13px">${esc(m.note)}</p>
    ${button(`${SITE}/hesap.html`, `🎁 ${m.button}`)}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(heading, body, line, u.lang));
  return { ok: true, sent };
}

// Hediye edene: hediyen ulaştı
async function proGiftSent(id: string) {
  const { n, res } = await giftNotice(id, "pro_gift_sent");
  if (!n) return res!;
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(PRO_GIFT, u.lang);
  const d = n.data ?? {};
  const name = String(d.name || "").trim() || "?";
  const renews = d.renews_at ? new Date(d.renews_at) : null;
  const line = m.sentLine.replace("{0}", name);
  const tagLines = [`🎁 ${esc(name)}`];
  if (renews && !isNaN(renews.getTime())) tagLines.push(esc(m.sentNext.replace("{0}", fmtDay(renews, u.lang))));
  const body = `
    <div style="text-align:center;font:400 48px/1 Arial,Helvetica,sans-serif;margin:0 0 14px">🎁</div>
    <p style="margin:0 0 16px">${esc(line)}</p>
    ${giftTag(`SRTR Pitwall PRO${d.plan ? ` · ${esc(d.plan)}` : ""}`, tagLines)}
    <div style="${BOX}">${esc(m.sentManage)}</div>
    ${button(`${SITE}/hesap.html#hediye`, m.sentButton)}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${m.sentSubject}`, page(m.sentSubject, body, line, u.lang));
  return { ok: true, sent };
}

// Alıcıya: hediye eden aboneliği sonlandırdı (PRO ödenen dönemin sonuna kadar sürer)
async function proGiftEnded(id: string) {
  const { n, res } = await giftNotice(id, "pro_gift_ended");
  if (!n) return res!;
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(PRO_GIFT, u.lang);
  const d = n.data ?? {};
  const name = String(d.name || "").trim() || "?";
  // Güncel PRO bitişi (bildirimdeki değer ya da şimdiki)
  const { data: p } = await db.from("profiles").select("pro_until").eq("id", n.user_id).maybeSingle();
  const times = [p?.pro_until, d.until].filter(Boolean).map((x) => new Date(String(x)).getTime()).filter((x) => !isNaN(x));
  const best = times.length ? Math.max(...times) : 0;
  const until = best > Date.now() ? new Date(best) : null;
  const subject = m.endSubject.replace("{0}", name);
  const line = until ? m.endLine.replace("{0}", name).replace("{1}", fmtDay(until, u.lang)) : m.endLineNow.replace("{0}", name);
  const days = until ? Math.max(1, Math.ceil((until.getTime() - Date.now()) / 86400000)) : 0;
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid #262b36;border-radius:10px;text-align:center">
      <div style="font:400 34px/1 Arial,Helvetica,sans-serif">🎁</div>
      <div style="font:800 34px/1.2 Arial,Helvetica,sans-serif;color:#ff8a2a;margin-top:6px">${until ? esc(String(days)) : "—"}</div>
      <div style="font-size:12px;letter-spacing:1px;color:#8a93a4;text-transform:uppercase;margin-top:4px">PRO${d.plan ? ` · ${esc(d.plan)}` : ""}</div>
    </div>
    <div style="${BOX}">${esc(line)}</div>
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.endHint)}</p>
    ${button(`${SITE}/hesap.html`, m.endButton)}`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line, u.lang));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Takım bildirimleri (c30 türleri; kullanıcının "teams" tercihi açıksa, kendi dilinde):
//   team_invite (davet edilene), team_request (sahip/yöneticilere), team_accepted (katılma isteği onaylanana),
//   team_announcement (üyelere; tetikleyici takım başına saatte en fazla bir e-posta gönderir), team_role (yönetici/sahip yapılana)
// {0}: kişi adı, {1}: "[ETİKET] Takım adı"
// ---------------------------------------------------------------------------

type TeamMail = {
  invite: string; inviteLine: string; inviteHow: string;
  request: string; requestLine: string; requestMore: string; requestHow: string;
  accepted: string; acceptedLine: string;
  announce: string; announceLine: string; announceMore: string;
  roleAdmin: string; roleAdminLine: string; roleOwner: string; roleOwnerLine: string;
  button: string; why: string;
};
const TEAM_MAIL: Record<string, TeamMail> = {
  "tr": {
    invite: "{0} seni {1} takımına davet etti",
    inviteLine: "{0}, SRTR Pitwall'da seni {1} takımına davet etti.",
    inviteHow: "SRTR Pitwall'u aç ve Takımlar sayfasından (ya da üstteki zil simgesinden) daveti kabul et ya da reddet.",
    request: "{0} {1} takımına katılmak istiyor",
    requestLine: "{0}, yönettiğin {1} takımına katılmak istiyor.",
    requestMore: "Onay bekleyen katılma isteği: {0}",
    requestHow: "SRTR Pitwall'u aç, Takımlar sayfasında takımını seç ve isteği onayla ya da reddet.",
    accepted: "{1} takımına hoş geldin",
    acceptedLine: "Katılma isteğin onaylandı; artık {1} takımının üyesisin. Duyuruları, takım sohbetini ve anketleri SRTR Pitwall'daki Takımlar sayfasında bulabilirsin.",
    announce: "{1}: yeni duyuru",
    announceLine: "{0}, {1} takımında yeni bir duyuru paylaştı:",
    announceMore: "Gelen kutunu doldurmamak için her takımdan saatte en fazla bir duyuru e-postası gönderiyoruz; diğer duyuruları uygulamada görebilirsin.",
    roleAdmin: "Artık {1} takımının yöneticisisin",
    roleAdminLine: "{0} seni {1} takımına yönetici yaptı. Artık üye davet edebilir, katılma isteklerini onaylayabilir ve duyuru yazabilirsin.",
    roleOwner: "{1} takımının sahibi artık sensin",
    roleOwnerLine: "{0}, {1} takımının sahipliğini sana devretti. Takımın ayarları, yöneticileri ve üyeleri artık senin elinde.",
    button: "Takımı görüntüle",
    why: "Takım e-postalarını açtığın için bu e-postayı alıyorsun. İstediğin zaman e-posta tercihlerinden kapatabilirsin.",
  },
  "en": {
    invite: "{0} invited you to join {1}",
    inviteLine: "{0} invited you to join the team {1} on SRTR Pitwall.",
    inviteHow: "Open SRTR Pitwall and accept or decline the invite on the Teams page (or via the bell icon at the top).",
    request: "{0} wants to join {1}",
    requestLine: "{0} wants to join {1}, a team you manage.",
    requestMore: "Join requests waiting for approval: {0}",
    requestHow: "Open SRTR Pitwall, pick your team on the Teams page and approve or decline the request.",
    accepted: "Welcome to {1}",
    acceptedLine: "Your join request was approved, you're now a member of {1}. Find announcements, the team chat and polls on the Teams page in SRTR Pitwall.",
    announce: "{1}: new announcement",
    announceLine: "{0} posted a new announcement in {1}:",
    announceMore: "To keep your inbox tidy we send at most one announcement e-mail per team per hour; see the rest in the app.",
    roleAdmin: "You're now an admin of {1}",
    roleAdminLine: "{0} made you an admin of {1}. You can now invite members, approve join requests and post announcements.",
    roleOwner: "You're now the owner of {1}",
    roleOwnerLine: "{0} transferred ownership of {1} to you. The team's settings, admins and members are now in your hands.",
    button: "View team",
    why: "You're receiving this because team e-mails are turned on. You can turn them off any time in your e-mail preferences.",
  },
  "de": {
    invite: "{0} hat dich zu {1} eingeladen",
    inviteLine: "{0} hat dich in SRTR Pitwall in das Team {1} eingeladen.",
    inviteHow: "Öffne SRTR Pitwall und nimm die Einladung auf der Seite Teams (oder über die Glocke oben) an oder lehne sie ab.",
    request: "{0} möchte {1} beitreten",
    requestLine: "{0} möchte dem Team {1} beitreten, das du verwaltest.",
    requestMore: "Offene Beitrittsanfragen: {0}",
    requestHow: "Öffne SRTR Pitwall, wähle auf der Seite Teams dein Team und nimm die Anfrage an oder lehne sie ab.",
    accepted: "Willkommen bei {1}",
    acceptedLine: "Deine Beitrittsanfrage wurde angenommen, du bist jetzt Mitglied von {1}. Ankündigungen, Team-Chat und Umfragen findest du in SRTR Pitwall auf der Seite Teams.",
    announce: "{1}: neue Ankündigung",
    announceLine: "{0} hat in {1} eine neue Ankündigung veröffentlicht:",
    announceMore: "Damit dein Postfach übersichtlich bleibt, senden wir pro Team höchstens eine Ankündigungs-E-Mail pro Stunde; alle weiteren findest du in der App.",
    roleAdmin: "Du bist jetzt Admin von {1}",
    roleAdminLine: "{0} hat dich zum Admin von {1} gemacht. Du kannst jetzt Mitglieder einladen, Beitrittsanfragen annehmen und Ankündigungen schreiben.",
    roleOwner: "Du bist jetzt Besitzer von {1}",
    roleOwnerLine: "{0} hat dir die Besitzerrechte an {1} übertragen. Einstellungen, Admins und Mitglieder des Teams liegen jetzt in deiner Hand.",
    button: "Team ansehen",
    why: "Du erhältst diese E-Mail, weil Team-E-Mails aktiviert sind. Du kannst sie jederzeit in deinen E-Mail-Einstellungen abschalten.",
  },
  "es": {
    invite: "{0} te ha invitado a unirte a {1}",
    inviteLine: "{0} te ha invitado a unirte al equipo {1} en SRTR Pitwall.",
    inviteHow: "Abre SRTR Pitwall y acepta o rechaza la invitación en la página Equipos (o desde la campana de arriba).",
    request: "{0} quiere unirse a {1}",
    requestLine: "{0} quiere unirse a {1}, un equipo que administras.",
    requestMore: "Solicitudes pendientes de aprobación: {0}",
    requestHow: "Abre SRTR Pitwall, elige tu equipo en la página Equipos y acepta o rechaza la solicitud.",
    accepted: "Bienvenido a {1}",
    acceptedLine: "Tu solicitud ha sido aprobada: ya eres miembro de {1}. Encontrarás los anuncios, el chat del equipo y las encuestas en la página Equipos de SRTR Pitwall.",
    announce: "{1}: nuevo anuncio",
    announceLine: "{0} ha publicado un nuevo anuncio en {1}:",
    announceMore: "Para no llenar tu bandeja de entrada, enviamos como máximo un correo de anuncios por equipo cada hora; el resto lo verás en la app.",
    roleAdmin: "Ahora eres administrador de {1}",
    roleAdminLine: "{0} te ha nombrado administrador de {1}. Ahora puedes invitar miembros, aprobar solicitudes y publicar anuncios.",
    roleOwner: "Ahora eres el propietario de {1}",
    roleOwnerLine: "{0} te ha transferido la propiedad de {1}. Los ajustes, administradores y miembros del equipo quedan en tus manos.",
    button: "Ver equipo",
    why: "Recibes este correo porque tienes activados los correos de equipos. Puedes desactivarlos cuando quieras en tus preferencias de correo.",
  },
  "fr": {
    invite: "{0} t'invite à rejoindre {1}",
    inviteLine: "{0} t'invite à rejoindre l'équipe {1} sur SRTR Pitwall.",
    inviteHow: "Ouvre SRTR Pitwall et accepte ou refuse l'invitation sur la page Équipes (ou via la cloche en haut).",
    request: "{0} souhaite rejoindre {1}",
    requestLine: "{0} souhaite rejoindre {1}, une équipe que tu gères.",
    requestMore: "Demandes en attente d'approbation : {0}",
    requestHow: "Ouvre SRTR Pitwall, choisis ton équipe sur la page Équipes et accepte ou refuse la demande.",
    accepted: "Bienvenue dans {1}",
    acceptedLine: "Ta demande a été acceptée : tu es maintenant membre de {1}. Annonces, discussion d'équipe et sondages t'attendent sur la page Équipes de SRTR Pitwall.",
    announce: "{1} : nouvelle annonce",
    announceLine: "{0} a publié une nouvelle annonce dans {1} :",
    announceMore: "Pour ne pas encombrer ta boîte mail, nous envoyons au maximum un e-mail d'annonce par équipe et par heure ; retrouve les autres dans l'application.",
    roleAdmin: "Tu es maintenant administrateur de {1}",
    roleAdminLine: "{0} t'a nommé administrateur de {1}. Tu peux désormais inviter des membres, accepter les demandes et publier des annonces.",
    roleOwner: "Tu es maintenant propriétaire de {1}",
    roleOwnerLine: "{0} t'a transféré la propriété de {1}. Les réglages, les administrateurs et les membres de l'équipe sont désormais entre tes mains.",
    button: "Voir l'équipe",
    why: "Tu reçois cet e-mail car les e-mails d'équipe sont activés. Tu peux les désactiver à tout moment dans tes préférences e-mail.",
  },
  "it": {
    invite: "{0} ti ha invitato a entrare in {1}",
    inviteLine: "{0} ti ha invitato a entrare nel team {1} su SRTR Pitwall.",
    inviteHow: "Apri SRTR Pitwall e accetta o rifiuta l'invito nella pagina Team (o dalla campanella in alto).",
    request: "{0} vuole entrare in {1}",
    requestLine: "{0} vuole entrare in {1}, un team che gestisci.",
    requestMore: "Richieste in attesa di approvazione: {0}",
    requestHow: "Apri SRTR Pitwall, scegli il tuo team nella pagina Team e accetta o rifiuta la richiesta.",
    accepted: "Benvenuto in {1}",
    acceptedLine: "La tua richiesta è stata accettata: ora fai parte di {1}. Annunci, chat del team e sondaggi ti aspettano nella pagina Team di SRTR Pitwall.",
    announce: "{1}: nuovo annuncio",
    announceLine: "{0} ha pubblicato un nuovo annuncio in {1}:",
    announceMore: "Per non intasare la tua casella inviamo al massimo un'e-mail di annunci per team ogni ora; gli altri li trovi nell'app.",
    roleAdmin: "Ora sei amministratore di {1}",
    roleAdminLine: "{0} ti ha nominato amministratore di {1}. Ora puoi invitare membri, accettare richieste e pubblicare annunci.",
    roleOwner: "Ora sei il proprietario di {1}",
    roleOwnerLine: "{0} ti ha trasferito la proprietà di {1}. Impostazioni, amministratori e membri del team sono ora nelle tue mani.",
    button: "Vedi il team",
    why: "Ricevi questa e-mail perché le e-mail dei team sono attive. Puoi disattivarle quando vuoi nelle preferenze e-mail.",
  },
  "pt-BR": {
    invite: "{0} convidou você para entrar em {1}",
    inviteLine: "{0} convidou você para entrar na equipe {1} no SRTR Pitwall.",
    inviteHow: "Abra o SRTR Pitwall e aceite ou recuse o convite na página Equipes (ou pelo sino no topo).",
    request: "{0} quer entrar em {1}",
    requestLine: "{0} quer entrar em {1}, uma equipe que você administra.",
    requestMore: "Pedidos aguardando aprovação: {0}",
    requestHow: "Abra o SRTR Pitwall, escolha sua equipe na página Equipes e aprove ou recuse o pedido.",
    accepted: "Agora você faz parte de {1}",
    acceptedLine: "Seu pedido foi aprovado: agora você é membro de {1}. Anúncios, chat da equipe e enquetes estão na página Equipes do SRTR Pitwall.",
    announce: "{1}: novo anúncio",
    announceLine: "{0} publicou um novo anúncio em {1}:",
    announceMore: "Para não lotar sua caixa de entrada, enviamos no máximo um e-mail de anúncio por equipe a cada hora; veja os demais no app.",
    roleAdmin: "Agora você é administrador de {1}",
    roleAdminLine: "{0} tornou você administrador de {1}. Agora você pode convidar membros, aprovar pedidos e publicar anúncios.",
    roleOwner: "Agora você é o dono de {1}",
    roleOwnerLine: "{0} transferiu a propriedade de {1} para você. As configurações, os administradores e os membros da equipe agora estão nas suas mãos.",
    button: "Ver equipe",
    why: "Você recebe este e-mail porque os e-mails de equipes estão ativados. Desative quando quiser nas suas preferências de e-mail.",
  },
  "pt-PT": {
    invite: "{0} convidou-te para entrares em {1}",
    inviteLine: "{0} convidou-te para entrares na equipa {1} no SRTR Pitwall.",
    inviteHow: "Abre o SRTR Pitwall e aceita ou recusa o convite na página Equipas (ou no sino no topo).",
    request: "{0} quer entrar em {1}",
    requestLine: "{0} quer entrar em {1}, uma equipa que geres.",
    requestMore: "Pedidos a aguardar aprovação: {0}",
    requestHow: "Abre o SRTR Pitwall, escolhe a tua equipa na página Equipas e aprova ou recusa o pedido.",
    accepted: "Agora fazes parte de {1}",
    acceptedLine: "O teu pedido foi aprovado: agora és membro de {1}. Anúncios, chat da equipa e sondagens estão na página Equipas do SRTR Pitwall.",
    announce: "{1}: novo anúncio",
    announceLine: "{0} publicou um novo anúncio em {1}:",
    announceMore: "Para não encher a tua caixa de correio, enviamos no máximo um e-mail de anúncios por equipa a cada hora; vê os restantes na aplicação.",
    roleAdmin: "Agora és administrador de {1}",
    roleAdminLine: "{0} tornou-te administrador de {1}. Agora podes convidar membros, aprovar pedidos e publicar anúncios.",
    roleOwner: "Agora és o dono de {1}",
    roleOwnerLine: "{0} transferiu para ti a propriedade de {1}. As definições, os administradores e os membros da equipa estão agora nas tuas mãos.",
    button: "Ver equipa",
    why: "Recebes este e-mail porque os e-mails de equipas estão ativados. Podes desativá-los quando quiseres nas tuas preferências de e-mail.",
  },
  "nl": {
    invite: "{0} heeft je uitgenodigd voor {1}",
    inviteLine: "{0} heeft je in SRTR Pitwall uitgenodigd voor het team {1}.",
    inviteHow: "Open SRTR Pitwall en accepteer of weiger de uitnodiging op de pagina Teams (of via de bel bovenaan).",
    request: "{0} wil lid worden van {1}",
    requestLine: "{0} wil lid worden van {1}, een team dat jij beheert.",
    requestMore: "Verzoeken die op goedkeuring wachten: {0}",
    requestHow: "Open SRTR Pitwall, kies je team op de pagina Teams en accepteer of weiger het verzoek.",
    accepted: "Welkom bij {1}",
    acceptedLine: "Je verzoek is goedgekeurd: je bent nu lid van {1}. Aankondigingen, teamchat en polls vind je op de pagina Teams in SRTR Pitwall.",
    announce: "{1}: nieuwe aankondiging",
    announceLine: "{0} heeft een nieuwe aankondiging geplaatst in {1}:",
    announceMore: "Om je inbox overzichtelijk te houden sturen we per team hooguit één aankondigingsmail per uur; de rest zie je in de app.",
    roleAdmin: "Je bent nu beheerder van {1}",
    roleAdminLine: "{0} heeft je beheerder van {1} gemaakt. Je kunt nu leden uitnodigen, verzoeken goedkeuren en aankondigingen plaatsen.",
    roleOwner: "Je bent nu eigenaar van {1}",
    roleOwnerLine: "{0} heeft het eigenaarschap van {1} aan jou overgedragen. Instellingen, beheerders en leden van het team liggen nu in jouw handen.",
    button: "Team bekijken",
    why: "Je ontvangt deze e-mail omdat team-e-mails aan staan. Je kunt ze altijd uitzetten in je e-mailvoorkeuren.",
  },
  "pl": {
    invite: "{0} zaprasza Cię do {1}",
    inviteLine: "{0} zaprasza Cię do zespołu {1} w SRTR Pitwall.",
    inviteHow: "Otwórz SRTR Pitwall i zaakceptuj lub odrzuć zaproszenie na stronie Zespoły (albo przez dzwonek u góry).",
    request: "{0} chce dołączyć do {1}",
    requestLine: "{0} chce dołączyć do {1} – zespołu, którym zarządzasz.",
    requestMore: "Prośby czekające na zatwierdzenie: {0}",
    requestHow: "Otwórz SRTR Pitwall, wybierz swój zespół na stronie Zespoły i zaakceptuj lub odrzuć prośbę.",
    accepted: "Witaj w {1}",
    acceptedLine: "Twoja prośba została zaakceptowana – jesteś teraz członkiem {1}. Ogłoszenia, czat zespołu i ankiety znajdziesz na stronie Zespoły w SRTR Pitwall.",
    announce: "{1}: nowe ogłoszenie",
    announceLine: "{0} opublikował(a) nowe ogłoszenie w {1}:",
    announceMore: "Aby nie zapychać Twojej skrzynki, wysyłamy najwyżej jeden e-mail z ogłoszeniem na zespół na godzinę; pozostałe zobaczysz w aplikacji.",
    roleAdmin: "Jesteś teraz administratorem {1}",
    roleAdminLine: "{0} mianował(a) Cię administratorem {1}. Możesz teraz zapraszać członków, zatwierdzać prośby i publikować ogłoszenia.",
    roleOwner: "Jesteś teraz właścicielem {1}",
    roleOwnerLine: "{0} przekazał(a) Ci własność {1}. Ustawienia, administratorzy i członkowie zespołu są teraz w Twoich rękach.",
    button: "Zobacz zespół",
    why: "Otrzymujesz ten e-mail, ponieważ masz włączone e-maile zespołów. Możesz je wyłączyć w dowolnej chwili w preferencjach e-mail.",
  },
  "sv": {
    invite: "{0} har bjudit in dig till {1}",
    inviteLine: "{0} har bjudit in dig till teamet {1} i SRTR Pitwall.",
    inviteHow: "Öppna SRTR Pitwall och godkänn eller avvisa inbjudan på sidan Team (eller via klockan högst upp).",
    request: "{0} vill gå med i {1}",
    requestLine: "{0} vill gå med i {1}, ett team som du administrerar.",
    requestMore: "Förfrågningar som väntar på godkännande: {0}",
    requestHow: "Öppna SRTR Pitwall, välj ditt team på sidan Team och godkänn eller avvisa förfrågan.",
    accepted: "Välkommen till {1}",
    acceptedLine: "Din förfrågan har godkänts – du är nu medlem i {1}. Meddelanden, teamchatt och omröstningar hittar du på sidan Team i SRTR Pitwall.",
    announce: "{1}: nytt meddelande",
    announceLine: "{0} har publicerat ett nytt meddelande i {1}:",
    announceMore: "För att inte fylla din inkorg skickar vi högst ett meddelandemejl per team och timme; resten ser du i appen.",
    roleAdmin: "Du är nu administratör för {1}",
    roleAdminLine: "{0} har gjort dig till administratör för {1}. Du kan nu bjuda in medlemmar, godkänna förfrågningar och publicera meddelanden.",
    roleOwner: "Du är nu ägare av {1}",
    roleOwnerLine: "{0} har överlåtit ägarskapet av {1} till dig. Teamets inställningar, administratörer och medlemmar ligger nu i dina händer.",
    button: "Visa teamet",
    why: "Du får det här mejlet eftersom team-mejl är aktiverade. Du kan stänga av dem när som helst i dina e-postinställningar.",
  },
  "fi": {
    invite: "{0} kutsui sinut tiimiin {1}",
    inviteLine: "{0} kutsui sinut SRTR Pitwallissa tiimiin {1}.",
    inviteHow: "Avaa SRTR Pitwall ja hyväksy tai hylkää kutsu Tiimit-sivulla (tai ylhäällä olevasta kellosta).",
    request: "{0} haluaa liittyä tiimiin {1}",
    requestLine: "{0} haluaa liittyä tiimiin {1}, jota sinä hallinnoit.",
    requestMore: "Hyväksyntää odottavat liittymispyynnöt: {0}",
    requestHow: "Avaa SRTR Pitwall, valitse tiimisi Tiimit-sivulla ja hyväksy tai hylkää pyyntö.",
    accepted: "Tervetuloa tiimiin {1}",
    acceptedLine: "Liittymispyyntösi hyväksyttiin – olet nyt tiimin {1} jäsen. Tiedotteet, tiimin chatin ja kyselyt löydät SRTR Pitwallin Tiimit-sivulta.",
    announce: "{1}: uusi tiedote",
    announceLine: "{0} julkaisi uuden tiedotteen tiimissä {1}:",
    announceMore: "Jotta postilaatikkosi ei täyty, lähetämme kustakin tiimistä enintään yhden tiedotesähköpostin tunnissa; loput näet sovelluksessa.",
    roleAdmin: "Olet nyt tiimin {1} ylläpitäjä",
    roleAdminLine: "{0} teki sinusta tiimin {1} ylläpitäjän. Voit nyt kutsua jäseniä, hyväksyä liittymispyyntöjä ja julkaista tiedotteita.",
    roleOwner: "Olet nyt tiimin {1} omistaja",
    roleOwnerLine: "{0} siirsi tiimin {1} omistajuuden sinulle. Tiimin asetukset, ylläpitäjät ja jäsenet ovat nyt sinun käsissäsi.",
    button: "Näytä tiimi",
    why: "Saat tämän viestin, koska tiimisähköpostit ovat käytössä. Voit poistaa ne käytöstä milloin tahansa sähköpostiasetuksista.",
  },
  "ru": {
    invite: "{0} приглашает тебя в команду {1}",
    inviteLine: "{0} приглашает тебя в команду {1} в SRTR Pitwall.",
    inviteHow: "Открой SRTR Pitwall и прими или отклони приглашение на странице «Команды» (или через колокольчик вверху).",
    request: "{0} хочет вступить в {1}",
    requestLine: "{0} хочет вступить в команду {1}, которой ты управляешь.",
    requestMore: "Заявок ждут одобрения: {0}",
    requestHow: "Открой SRTR Pitwall, выбери свою команду на странице «Команды» и одобри или отклони заявку.",
    accepted: "Добро пожаловать в {1}",
    acceptedLine: "Твоя заявка одобрена — теперь ты участник команды {1}. Объявления, командный чат и опросы ждут тебя на странице «Команды» в SRTR Pitwall.",
    announce: "{1}: новое объявление",
    announceLine: "{0} опубликовал(а) новое объявление в команде {1}:",
    announceMore: "Чтобы не засорять почту, мы отправляем не больше одного письма с объявлениями от каждой команды в час; остальные смотри в приложении.",
    roleAdmin: "Теперь ты администратор команды {1}",
    roleAdminLine: "{0} назначил(а) тебя администратором команды {1}. Теперь ты можешь приглашать участников, одобрять заявки и публиковать объявления.",
    roleOwner: "Теперь ты владелец команды {1}",
    roleOwnerLine: "{0} передал(а) тебе права владельца команды {1}. Настройки, администраторы и участники команды теперь в твоих руках.",
    button: "Открыть команду",
    why: "Ты получаешь это письмо, потому что включены письма о командах. Отключить их можно в любой момент в настройках писем.",
  },
  "zh-CN": {
    invite: "{0} 邀请你加入 {1}",
    inviteLine: "{0} 在 SRTR Pitwall 中邀请你加入车队 {1}。",
    inviteHow: "打开 SRTR Pitwall，在“车队”页面（或顶部的铃铛图标）接受或拒绝邀请。",
    request: "{0} 申请加入 {1}",
    requestLine: "{0} 申请加入你管理的车队 {1}。",
    requestMore: "待审批的加入申请：{0}",
    requestHow: "打开 SRTR Pitwall，在“车队”页面选择你的车队，然后批准或拒绝申请。",
    accepted: "欢迎加入 {1}",
    acceptedLine: "你的加入申请已通过，现在你是 {1} 的成员了。公告、车队聊天和投票都在 SRTR Pitwall 的“车队”页面。",
    announce: "{1}：新公告",
    announceLine: "{0} 在 {1} 发布了一条新公告：",
    announceMore: "为避免打扰，每个车队每小时最多发送一封公告邮件；其余公告请在应用中查看。",
    roleAdmin: "你已成为 {1} 的管理员",
    roleAdminLine: "{0} 已将你设为 {1} 的管理员。现在你可以邀请成员、批准加入申请并发布公告。",
    roleOwner: "你已成为 {1} 的所有者",
    roleOwnerLine: "{0} 已将 {1} 的所有权转让给你。车队的设置、管理员和成员现在都由你掌管。",
    button: "查看车队",
    why: "你收到这封邮件是因为你开启了车队邮件。你可以随时在邮件偏好设置中关闭。",
  },
  "ja": {
    invite: "{0} さんから {1} への招待が届きました",
    inviteLine: "{0} さんが SRTR Pitwall でチーム {1} にあなたを招待しました。",
    inviteHow: "SRTR Pitwall を開き、「チーム」ページ（または上部のベルアイコン）から招待を承認または拒否してください。",
    request: "{0} さんが {1} への参加を希望しています",
    requestLine: "{0} さんが、あなたが管理するチーム {1} への参加を希望しています。",
    requestMore: "承認待ちの参加リクエスト：{0} 件",
    requestHow: "SRTR Pitwall を開き、「チーム」ページで自分のチームを選んでリクエストを承認または拒否してください。",
    accepted: "{1} へようこそ",
    acceptedLine: "参加リクエストが承認され、{1} のメンバーになりました。お知らせ、チームチャット、投票は SRTR Pitwall の「チーム」ページにあります。",
    announce: "{1}：新しいお知らせ",
    announceLine: "{0} さんが {1} に新しいお知らせを投稿しました：",
    announceMore: "受信トレイがあふれないよう、お知らせメールは 1 チームにつき 1 時間に最大 1 通です。そのほかのお知らせはアプリで確認できます。",
    roleAdmin: "{1} の管理者になりました",
    roleAdminLine: "{0} さんがあなたを {1} の管理者に任命しました。メンバーの招待、参加リクエストの承認、お知らせの投稿ができるようになりました。",
    roleOwner: "{1} のオーナーになりました",
    roleOwnerLine: "{0} さんが {1} のオーナー権限をあなたに譲渡しました。チームの設定、管理者、メンバーの管理はあなたに任されています。",
    button: "チームを見る",
    why: "チームメールをオンにしているため、このメールが届いています。メール設定からいつでもオフにできます。",
  },
};

const TEAM_KINDS = ["team_invite", "team_request", "team_accepted", "team_announcement", "team_role"];

/** Takım rozeti: logo (varsa) ya da takım renginde etiket kutusu, yanında ad ve etiket */
function teamBadge(t: { name: string; tag: string; color: string; logo_path: string }) {
  const color = /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : "#4ea1ff";
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  const ink = r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#111111" : "#ffffff";
  const logo = t.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/teams/${t.logo_path}` : "";
  const mark = logo
    ? `<img src="${esc(logo)}" alt="" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:12px;object-fit:cover">`
    : esc(t.tag);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;width:100%;background:#10131a;border:1px solid #262b36;border-left:3px solid ${color};border-radius:10px"><tr>
      <td style="padding:12px 0 12px 14px;width:52px">
        <div style="width:52px;height:52px;background:${color};border-radius:12px;text-align:center;font:800 15px/52px Arial,Helvetica,sans-serif;color:${ink};letter-spacing:.5px;overflow:hidden">${mark}</div>
      </td>
      <td style="padding:12px 14px;vertical-align:middle">
        <div style="font:700 17px/1.3 'Segoe UI',Arial,Helvetica,sans-serif;color:#ffffff">${esc(t.name)}</div>
        <div style="font-size:13px;color:#8a93a4;margin-top:2px">[${esc(t.tag)}]</div>
      </td>
    </tr></table>`;
}

async function teamMail(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (!TEAM_KINDS.includes(n.kind)) return { ok: true, skipped: true };
  if (!(await emailPrefOn(n.user_id, "teams"))) return { ok: true, skipped: "tercih" };
  const d = n.data ?? {};
  const teamId = String(d.team ?? "");
  const { data: t } = await db.from("teams").select("id,name,tag,color,logo_path").eq("id", teamId).maybeSingle();
  if (!t) return { ok: true, skipped: "takım yok" };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const m = pick(TEAM_MAIL, u.lang);
  const who = String(d.name || "").trim() || "?";
  const label = `[${t.tag}] ${t.name}`;
  const fill = (s: string) => s.replace("{0}", who).replace("{1}", label);
  let subject = "";
  let line = "";
  let extra = "";
  if (n.kind === "team_invite") {
    subject = fill(m.invite);
    line = fill(m.inviteLine);
    extra = `<div style="${BOX}">${esc(m.inviteHow)}</div>`;
  } else if (n.kind === "team_request") {
    subject = fill(m.request);
    line = fill(m.requestLine);
    const { count } = await db.from("team_invites").select("id", { count: "exact", head: true }).eq("team_id", t.id).eq("kind", "request");
    extra = `${(count ?? 0) > 1 ? `<p style="margin:0 0 14px"><b style="color:#ffb35c">${esc(m.requestMore.replace("{0}", String(count)))}</b></p>` : ""}
      <div style="${BOX}">${esc(m.requestHow)}</div>`;
  } else if (n.kind === "team_accepted") {
    subject = fill(m.accepted);
    line = fill(m.acceptedLine);
  } else if (n.kind === "team_announcement") {
    // Duyurunun güncel metni (silindiyse e-posta gönderilmez); uzunsa kısaltılır
    const { data: post } = await db.from("team_posts").select("body").eq("id", String(d.post ?? "")).maybeSingle();
    if (!post) return { ok: true, skipped: "duyuru yok" };
    const text = String(post.body ?? d.text ?? "");
    subject = fill(m.announce);
    line = fill(m.announceLine);
    extra = `${quote(text.length > 700 ? `${text.slice(0, 700).trimEnd()}…` : text)}
      <p style="margin:0 0 4px;color:#8a93a4;font-size:12px">${esc(m.announceMore)}</p>`;
  } else {
    const owner = d.role === "owner";
    subject = fill(owner ? m.roleOwner : m.roleAdmin);
    line = fill(owner ? m.roleOwnerLine : m.roleAdminLine);
  }
  const body = `
    ${teamBadge({ name: String(t.name ?? ""), tag: String(t.tag ?? ""), color: String(t.color ?? ""), logo_path: String(t.logo_path ?? "") })}
    <p style="margin:0 0 14px">${esc(line)}</p>
    ${extra}
    ${button(`${SITE}/takimlar.html?id=${encodeURIComponent(t.id)}`, m.button)}
    <p style="margin:14px 0 0;color:#6b7383;font-size:12px">${esc(m.why)}</p>`;
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line, u.lang));
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// 6 aydır açılmayan görsellerin silinmesi
// ---------------------------------------------------------------------------

const EXPIRED: Record<string, { subject: string; line: string; hint: string }> = {
  tr: {
    subject: "Görselin otomatik olarak silindi",
    line: "Görselin 6 aydır görüntülenmediği için otomatik olarak silinmiştir:",
    hint: "Yer açmak için uzun süre açılmayan görseller kaldırılır. İstersen yeniden paylaşabilirsin.",
  },
  en: {
    subject: "Your screenshot was deleted automatically",
    line: "Your screenshot was deleted automatically because it hasn't been viewed for 6 months:",
    hint: "Images that haven't been opened for a long time are removed to save space. You can share it again anytime.",
  },
  de: {
    subject: "Dein Screenshot wurde automatisch gelöscht",
    line: "Dein Screenshot wurde automatisch gelöscht, weil er 6 Monate lang nicht angesehen wurde:",
    hint: "Bilder, die lange nicht geöffnet wurden, werden entfernt, um Speicher zu sparen. Du kannst es jederzeit erneut teilen.",
  },
  es: {
    subject: "Tu captura se ha eliminado automáticamente",
    line: "Tu captura se ha eliminado automáticamente porque no se ha visto en 6 meses:",
    hint: "Las imágenes que no se abren durante mucho tiempo se eliminan para ahorrar espacio. Puedes volver a compartirla cuando quieras.",
  },
  "pt-BR": {
    subject: "Sua captura foi excluída automaticamente",
    line: "Sua captura foi excluída automaticamente porque não foi visualizada por 6 meses:",
    hint: "Imagens que não são abertas por muito tempo são removidas para economizar espaço. Você pode compartilhá-la de novo quando quiser.",
  },
  "pt-PT": {
    subject: "A tua captura foi eliminada automaticamente",
    line: "A tua captura foi eliminada automaticamente porque não foi vista durante 6 meses:",
    hint: "As imagens que não são abertas durante muito tempo são removidas para poupar espaço. Podes voltar a partilhá-la quando quiseres.",
  },
  fr: {
    subject: "Ta capture a été supprimée automatiquement",
    line: "Ta capture a été supprimée automatiquement car elle n'a pas été consultée depuis 6 mois :",
    hint: "Les images qui ne sont pas ouvertes pendant longtemps sont supprimées pour libérer de l'espace. Tu peux la repartager quand tu veux.",
  },
  it: {
    subject: "Il tuo screenshot è stato eliminato automaticamente",
    line: "Il tuo screenshot è stato eliminato automaticamente perché non è stato visualizzato per 6 mesi:",
    hint: "Le immagini non aperte da molto tempo vengono rimosse per risparmiare spazio. Puoi ricondividerlo quando vuoi.",
  },
  nl: {
    subject: "Je screenshot is automatisch verwijderd",
    line: "Je screenshot is automatisch verwijderd omdat hij 6 maanden niet is bekeken:",
    hint: "Afbeeldingen die lang niet zijn geopend, worden verwijderd om ruimte te besparen. Je kunt hem altijd opnieuw delen.",
  },
  pl: {
    subject: "Twój zrzut ekranu został automatycznie usunięty",
    line: "Twój zrzut ekranu został automatycznie usunięty, ponieważ nie był oglądany od 6 miesięcy:",
    hint: "Obrazy, które długo nie były otwierane, są usuwane, aby oszczędzać miejsce. Możesz udostępnić go ponownie w każdej chwili.",
  },
  sv: {
    subject: "Din skärmdump har raderats automatiskt",
    line: "Din skärmdump har raderats automatiskt eftersom den inte har visats på 6 månader:",
    hint: "Bilder som inte har öppnats på länge tas bort för att spara utrymme. Du kan dela den igen när du vill.",
  },
  fi: {
    subject: "Kuvakaappauksesi poistettiin automaattisesti",
    line: "Kuvakaappauksesi poistettiin automaattisesti, koska sitä ei ole katsottu 6 kuukauteen:",
    hint: "Pitkään avaamattomat kuvat poistetaan tilan säästämiseksi. Voit jakaa sen uudelleen milloin tahansa.",
  },
  ru: {
    subject: "Твой скриншот удалён автоматически",
    line: "Твой скриншот удалён автоматически, так как его не просматривали 6 месяцев:",
    hint: "Изображения, которые долго не открывали, удаляются для экономии места. Ты можешь снова поделиться им в любое время.",
  },
  "zh-CN": {
    subject: "你的截图已被自动删除",
    line: "你的截图因 6 个月未被查看，已被自动删除：",
    hint: "长时间未被打开的图片会被删除以节省空间。你可以随时重新分享。",
  },
  ja: {
    subject: "スクリーンショットが自動的に削除されました",
    line: "6か月間閲覧されなかったため、スクリーンショットが自動的に削除されました:",
    hint: "長期間開かれていない画像は容量節約のため削除されます。いつでも再共有できます。",
  },
};

async function cleanup() {
  const before = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
  const { data: rows, error } = await db
    .from("screenshots")
    .select("id,user_id,title,path,thumb_path,created_at")
    .lt("last_viewed_at", before)
    .limit(500);
  if (error) return { ok: false, error: error.message };
  if (!rows?.length) return { ok: true, deleted: 0 };

  const paths = rows.flatMap((r) => [r.path, r.thumb_path]);
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from("screenshots").remove(paths.slice(i, i + 100));
  }
  await db.from("screenshots").delete().in("id", rows.map((r) => r.id));
  await db.from("notifications").insert(
    rows.map((r) => ({ user_id: r.user_id, kind: "shot_expired", data: { title: r.title, created_at: r.created_at } })),
  );

  // Her kullanıcıya tek e-posta
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let mails = 0;
  for (const [uid, list] of byUser) {
    if (!(await emailPrefOn(uid, "shots"))) continue;
    const u = await userInfo(uid);
    if (!u.email) continue;
    const m = EXPIRED[u.lang] ?? EXPIRED[u.lang.split("-")[0]] ?? EXPIRED.en;
    const items = list.map((r) => `<li style="margin:4px 0"><b>${esc(r.title)}</b></li>`).join("");
    const body = `<p style="margin:0 0 8px">${esc(m.line)}</p><ul style="padding-left:18px;margin:0 0 12px">${items}</ul>
      <p style="color:#8b93a3;font-size:13px;margin:0">${esc(m.hint)}</p>`;
    try {
      if (await sendMail([u.email], `SRTR Pitwall · ${m.subject}`, page(m.subject, body, "", u.lang))) mails++;
    } catch (e) {
      console.error("mail", uid, e);
    }
  }
  return { ok: true, deleted: rows.length, mails };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("SRTR Pitwall jobs", { status: 200 });
  let body: { type?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* boş */
  }
  try {
    const res =
      body.type === "report" && body.id
        ? await report(body.id)
        : body.type === "friend_request" && body.id
          ? await friendRequest(body.id)
          : body.type === "pro_expiring" && body.id
            ? await proExpiring(body.id)
            : body.type === "device_alert" && body.id
              ? await deviceAlert(body.id)
              : body.type === "pro_changed" && body.id
                ? await proChanged(body.id)
                : (body.type === "support_new" || body.type === "support_user_reply") && body.id
                  ? await supportAdmin(body.id)
                  : body.type === "support_reply" && body.id
                    ? await supportReply(body.id)
                    : (body.type === "ad_live" || body.type === "ad_rejected" || body.type === "ad_ended") && body.id
                      ? await adOwner(body.id)
                      : (body.type === "ad_reported" || body.type === "ad_pending") && body.id
                        ? await adAdmin(body.id)
                        : body.type === "payment_new" && body.id
                          ? await paymentAdmin(body.id)
                          : body.type === "payment_receipt" && body.id
                            ? await paymentReceipt(body.id)
                            : body.type === "pro_gift" && body.id
                              ? await proGift(body.id)
                              : body.type === "pro_gift_sent" && body.id
                                ? await proGiftSent(body.id)
                                : body.type === "pro_gift_ended" && body.id
                                  ? await proGiftEnded(body.id)
                                  : body.type === "message_reported" && body.id
                                    ? await messageReportAdmin(body.id)
                                  : body.type === "voice_submission" && body.id
                                    ? await voiceSubmissionAdmin(body.id)
                                    : TEAM_KINDS.includes(String(body.type)) && body.id
                                      ? await teamMail(body.id)
          : body.type === "cleanup" ? await cleanup() : { ok: false, error: "bilinmeyen iş" };
    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
