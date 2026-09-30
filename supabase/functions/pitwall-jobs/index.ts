// SRTR Pitwall sunucu işleri (veritabanı tarafından çağrılır, uygulama çağırmaz):
//   {"type":"report","id":"<rapor id>"}  Yeni rapor: yöneticilere e-posta gönderir
//   {"type":"friend_request","id":"<bildirim id>"}  Yeni arkadaşlık isteği: karşı tarafa temalı e-posta gönderir
//   {"type":"pro_expiring","id":"<bildirim id>"}  PRO bitmesine 15 gün kala hatırlatma e-postası
//   {"type":"device_alert","id":"<bildirim id>"}   Yöneticiye: hesap cihaz sınırını aştı
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

async function proExpiring(id: string) {
  const { data: n, error } = await db.from("notifications").select("user_id,kind,data").eq("id", id).maybeSingle();
  if (error || !n) return { ok: false, error: error?.message ?? "bildirim yok" };
  if (n.kind !== "pro_expiring") return { ok: true, skipped: true };
  const u = await userInfo(n.user_id);
  if (!u.email) return { ok: true, skipped: "e-posta yok" };
  const until = new Date(n.data?.until ?? Date.now());
  const days = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 86400000));
  const m = PRO_EXP[u.lang] ?? PRO_EXP[u.lang.split("-")[0]] ?? PRO_EXP.en;
  const date = until.toLocaleDateString(u.lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const fill = (t: string) => t.replace("{0}", String(days)).replace("{1}", date);
  const body = `
    <div style="margin:0 0 16px;padding:14px 16px;background:#10131a;border:1px solid #262b36;border-radius:10px;text-align:center">
      <div style="font:800 40px/1 Arial,Helvetica,sans-serif;color:#ff8a2a">${days}</div>
      <div style="font-size:12px;letter-spacing:1px;color:#8a93a4;text-transform:uppercase;margin-top:6px">PRO</div>
    </div>
    <p style="margin:0 0 14px">${esc(fill(m.line))}</p>
    <div style="margin:0 0 14px;padding:12px 14px;background:#10131a;border:1px solid #262b36;border-left:3px solid #ff8a2a;border-radius:8px;color:#cfd5e1;font-size:14px">${esc(m.how)}</div>
    <p style="margin:0;color:#8a93a4;font-size:13px">${esc(m.note)}</p>`;
  const subject = fill(m.subject);
  const sent = await sendMail([u.email], `SRTR Pitwall · ${subject}`, page(subject, body, fill(m.line)));
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
          : body.type === "cleanup" ? await cleanup() : { ok: false, error: "bilinmeyen iş" };
    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
