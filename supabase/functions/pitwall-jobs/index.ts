// SRTR Pitwall sunucu işleri (veritabanı tarafından çağrılır, uygulama çağırmaz):
//   {"type":"report","id":"<rapor id>"}  Yeni rapor: yöneticilere e-posta gönderir
//   {"type":"friend_request","id":"<bildirim id>"}  Yeni arkadaşlık isteği: karşı tarafa temalı e-posta gönderir
//   {"type":"pro_expiring","id":"<bildirim id>"}  PRO bitmesine 10 gün ve son 1 gün kala hatırlatma e-postası
//   {"type":"device_alert","id":"<bildirim id>"}   Yöneticiye: hesap cihaz sınırını aştı
//   {"type":"pro_changed","id":"<bildirim id>"}   Yönetici PRO süresini elle değiştirdi (kullanıcıya, kendi dilinde)
//   {"type":"support_new" | "support_user_reply","id":"<bildirim id>"}  Yöneticiye: yeni destek talebi / yeni mesaj
//   {"type":"support_reply","id":"<bildirim id>"}  Kullanıcıya: destek talebine yanıt geldi (kendi dilinde)
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
function page(title: string, body: string, preheader = "") {
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
    SRTR Pitwall &middot; <a href="https://pitwall.simracetr.com" style="color:#8a93a4;text-decoration:none">pitwall.simracetr.com</a>
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
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, fill(m.line)));
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
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line));
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
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, line || subject));
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
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, m.line.replace("{0}", subj)));
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
    const u = await userInfo(uid);
    if (!u.email) continue;
    const m = EXPIRED[u.lang] ?? EXPIRED[u.lang.split("-")[0]] ?? EXPIRED.en;
    const items = list.map((r) => `<li style="margin:4px 0"><b>${esc(r.title)}</b></li>`).join("");
    const body = `<p style="margin:0 0 8px">${esc(m.line)}</p><ul style="padding-left:18px;margin:0 0 12px">${items}</ul>
      <p style="color:#8b93a3;font-size:13px;margin:0">${esc(m.hint)}</p>`;
    try {
      if (await sendMail([u.email], `SRTR Pitwall · ${m.subject}`, page(m.subject, body))) mails++;
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
          : body.type === "cleanup" ? await cleanup() : { ok: false, error: "bilinmeyen iş" };
    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
