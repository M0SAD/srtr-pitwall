// Arkadaşlar ve mesajlar (sitenin tüm sayfalarında, giriş yapılınca sağ altta).
// Programdaki Arkadaşlar paneliyle aynı sunucu işlevlerini kullanır (src/cloud/social.ts):
// my_friends, friend_request / friend_respond / friend_remove, send_message, mark_read,
// hide_message ("benden sil"), clear_conversation, message_report ve messages tablosu (Realtime).
// Site kendini "çevrimiçi / yarışta" olarak bildirmez (user_status'a yazmaz): bu durum programa aittir.
import { $, SUPABASE_URL, T, addDict, esc, lang, locale, sb, toast } from "./core.js";
import { attachEmoji } from "./emoji.js";

addDict({
  fr_title: ["Arkadaşlar", "Friends"],
  fr_open: ["Arkadaşlar ve mesajlar", "Friends and messages"],
  fr_close: ["Kapat", "Close"],
  fr_back: ["Geri", "Back"],
  fr_online_n: ["{0} çevrimiçi", "{0} online"],
  fr_requests: ["Arkadaşlık istekleri", "Friend requests"],
  fr_sent: ["Gönderilen istekler", "Sent requests"],
  fr_friends: ["Arkadaşlar", "Friends"],
  fr_accept: ["Kabul et", "Accept"],
  fr_decline: ["Reddet", "Decline"],
  fr_cancel_req: ["İsteği geri al", "Cancel request"],
  fr_wants: ["Seni arkadaş olarak eklemek istiyor", "Wants to add you as a friend"],
  fr_waiting: ["Yanıt bekleniyor", "Waiting for reply"],
  fr_add: ["Arkadaş ekle", "Add friend"],
  fr_add_ph: ["Görünen ad ya da iRacing adı", "Display name or iRacing name"],
  fr_add_hint: ["Aramak için en az 2 harf yaz.", "Type at least 2 letters to search."],
  fr_no_result: ["Kimse bulunamadı.", "No one found."],
  fr_req_sent: ["İstek gönderildi", "Request sent"],
  fr_now_friends: ["Artık arkadaşsınız", "You are now friends"],
  fr_is_friend: ["Arkadaş", "Friend"],
  fr_empty: [
    "Henüz arkadaşın yok. Yukarıdaki düğmeyle arkadaş ekleyebilirsin.",
    "No friends yet. Use the button above to add friends.",
  ],
  fr_online: ["Çevrimiçi", "Online"],
  fr_offline: ["Çevrimdışı", "Offline"],
  fr_racing: ["Yarışta", "Racing"],
  fr_dnd: ["Rahatsız etmeyin", "Do not disturb"],
  fr_last_seen: ["Son görülme: {0}", "Last seen {0}"],
  fr_you: ["Sen: {0}", "You: {0}"],
  fr_msg_ph: ["Mesaj yaz…", "Write a message…"],
  fr_send: ["Gönder", "Send"],
  fr_emoji: ["İfade ekle", "Add emoji"],
  fr_no_msgs: ["Henüz mesaj yok. İlk mesajı sen yaz!", "No messages yet. Say hi!"],
  fr_older: ["Daha eski mesajlar", "Older messages"],
  fr_closed_msgs: ["Bu kişi mesajları kapatmış.", "This person has turned off messages."],
  fr_hide: ["Benden sil", "Delete for me"],
  fr_report: ["Raporla", "Report"],
  fr_report_t: ["Mesajı raporla", "Report message"],
  fr_report_note: ["Not (isteğe bağlı)", "Note (optional)"],
  fr_report_send: ["Raporu gönder", "Send report"],
  fr_report_ok: ["Rapor yöneticilere gönderildi. Teşekkürler.", "Report sent to the admins. Thank you."],
  fr_r_harassment: ["Hakaret / taciz", "Insult / harassment"],
  fr_r_spam: ["Spam", "Spam"],
  fr_r_inappropriate: ["Uygunsuz içerik", "Inappropriate content"],
  fr_r_scam: ["Dolandırıcılık", "Scam"],
  fr_r_other: ["Diğer", "Other"],
  fr_more: ["Diğer işlemler", "More actions"],
  fr_clear: ["Sohbeti temizle", "Clear conversation"],
  fr_clear_ask: [
    "Bu sohbetteki tüm mesajlar senin görünümünden kaldırılsın mı? Karşı taraf görmeye devam eder.",
    "Remove all messages in this conversation from your view? The other person still sees them.",
  ],
  fr_remove: ["Arkadaşlıktan çıkar", "Remove friend"],
  fr_remove_ask: ["{0} arkadaş listenden çıkarılsın mı?", "Remove {0} from your friends?"],
  fr_yes: ["Evet", "Yes"],
  fr_no: ["Vazgeç", "Cancel"],
  fr_today: ["Bugün", "Today"],
  fr_yesterday: ["Dün", "Yesterday"],
  fr_new_msg: ["Yeni mesaj", "New message"],
  fr_bg_changed: ["🖼️ Sohbet arka planını değiştirdi", "🖼️ Changed the chat background"],
  fr_app_note: [
    "Çevrimiçi durumu SRTR Pitwall programından gelir; site seni çevrimiçi göstermez.",
    "Online status comes from the SRTR Pitwall app; the website does not show you as online.",
  ],
});

const SIM_LABEL = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "Automobilista 2" };
const REASONS = ["harassment", "spam", "inappropriate", "scam", "other"];
const PAGE = 60;

// ---------------------------------------------------------------------------
// İfadeler: programdaki gibi ":)" → 🙂 (sadece tek başına yazılanlar)
// ---------------------------------------------------------------------------
const EMOTICONS = [
  [":'(", "😢"], [":+1:", "👍"], [":-)", "🙂"], [":)", "🙂"], [":-D", "😄"], [":D", "😄"], [";-)", "😉"], [";)", "😉"],
  [":-(", "🙁"], [":(", "🙁"], [":-P", "😛"], [":P", "😛"], [":p", "😛"], [":-O", "😮"], [":O", "😮"], [":o", "😮"],
  ["<3", "❤️"], ["xD", "😆"], ["XD", "😆"], ["8)", "😎"], ["B)", "😎"],
];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EMO_ALT = EMOTICONS.map(([k]) => escRe(k)).join("|");
const EMO_ALL = new RegExp(`(^|\\s)(${EMO_ALT})(?=$|\\s|[.,!?])`, "g");
const EMO_TYPED = new RegExp(`(^|\\s)(${EMO_ALT})(?=\\s)`, "g");
const EMO_MAP = new Map(EMOTICONS);
const emojify = (t) => t.replace(EMO_ALL, (_m, pre, k) => pre + (EMO_MAP.get(k) ?? k));
const emojifyTyped = (t) => t.replace(EMO_TYPED, (_m, pre, k) => pre + (EMO_MAP.get(k) ?? k));
const EMOJI_RE = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/gu;
// Uygulamadan gelen "sohbet arka planını değiştirdi" sistem mesajı (c45): gövdesi sabit Türkçe metindir, burada
// ziyaretçinin dilinde gösterilir (arka planı uygulamak sadece masaüstü uygulamasında).
function bodyOf(m) {
  const b = (m && m.body) || "";
  return /^🖼️? ?Sohbet arka planını değiştirdi$/u.test(b) ? T("fr_bg_changed") : b;
}

function emojiOnly(text) {
  const p = text.trim().split(EMOJI_RE).filter((x) => x.trim() !== "");
  return p.length > 0 && p.length <= 3 && p.every((x) => /\p{Extended_Pictographic}/u.test(x));
}
/** Mesaj metni: kaçışlı, bağlantılar tıklanabilir, emojiler biraz büyük */
function msgHtml(text) {
  return esc(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,!?:;)"'])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')
    .replace(EMOJI_RE, '<span class="fr-emo">$1</span>');
}

// ---------------------------------------------------------------------------
// Avatar: profil fotoğrafı (avatars kovası) yoksa kimlikten renk + baş harf
// ---------------------------------------------------------------------------
function hashColor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `hsl(${h % 360} 58% 50%)`;
}
const initialOf = (name) => ([...(name || "?").trim()][0] ?? "?").toLocaleUpperCase(lang === "tr" ? "tr" : undefined);
function avatarUrl(p) {
  const path = p?.avatar_path || p?.avatar;
  if (!path || typeof path !== "string") return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function avatarHtml(id, name, p, dot = "", size = "") {
  const url = avatarUrl(p);
  return `<span class="fr-av${size ? " " + size : ""}" style="background:${hashColor(String(id))}" aria-hidden="true">${esc(initialOf(name))}${
    url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : ""
  }${dot ? `<i class="fr-dot ${dot}"></i>` : ""}</span>`;
}

// Simgeler
const IC = {
  chat: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  add: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M19 8v6M16 11h6"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------
const S = {
  me: null,
  open: false,
  view: "list", // list | add | chat
  friends: [],
  loaded: false,
  last: {}, // arkadaş → son mesaj
  chat: null, // arkadaş kimliği
  msgs: [],
  more: false,
  ask: "", // sohbet başlığındaki satır içi onay: clear | remove
  menu: false,
  report: null, // raporlanan mesaj kimliği
  q: "",
  found: null,
  inbox: null,
  timer: 0,
  tick: 0,
  peek: 0,
};
let root = null;
let fab = null;
let peekEl = null;

const rpc = async (fn, args = {}) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
};
const errMsg = (e) => e?.message || T("error");

const friend = (id) => S.friends.find((f) => f.friend_id === id) || null;
const accepted = () => S.friends.filter((f) => f.status === "accepted");
const badgeCount = () =>
  S.friends.reduce((a, f) => a + (f.status === "accepted" ? f.unread || 0 : 0), 0) + S.friends.filter((f) => f.status === "pending_in").length;

async function loadFriends() {
  if (!S.me) return;
  try {
    const list = await rpc("my_friends");
    S.friends = Array.isArray(list) ? list : [];
    S.loaded = true;
  } catch {
    /* ağ yok: son liste kalsın */
  }
  try {
    const me = S.me.id;
    const { data } = await sb
      .from("messages")
      .select("id,sender,recipient,body,created_at,read_at")
      .or(`sender.eq.${me},recipient.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(200);
    const map = {};
    for (const m of data || []) {
      const other = m.sender === me ? m.recipient : m.sender;
      if (!map[other]) map[other] = m;
    }
    S.last = map;
  } catch {}
  // Açık sohbetteki arkadaşın okunmamışı sayılmasın
  if (S.open && S.view === "chat" && S.chat) {
    const f = friend(S.chat);
    if (f && f.unread) {
      f.unread = 0;
      rpc("mark_read", { p_from: S.chat }).catch(() => {});
    }
  }
  render();
}

// ---------------------------------------------------------------------------
// Biçimler
// ---------------------------------------------------------------------------
function ago(v) {
  if (!v) return "";
  const s = Math.round((new Date(v).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
    if (a < 60) return rtf.format(s, "second");
    if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
    if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
    return rtf.format(Math.round(s / 86400), "day");
  } catch {
    return new Date(v).toLocaleString();
  }
}
const timeOf = (v) => new Date(v).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
function dayOf(v) {
  const d = new Date(v);
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === t.toDateString()) return T("fr_today");
  if (d.toDateString() === y.toDateString()) return T("fr_yesterday");
  return d.toLocaleDateString(locale(), { dateStyle: "medium" });
}
function presence(f) {
  if (f.racing) return { dot: "race", text: [T("fr_racing"), f.track].filter(Boolean).join(" · ") };
  if (f.online) {
    const sim = f.sim ? SIM_LABEL[f.sim] || f.sim : "";
    return { dot: f.dnd ? "dnd" : "on", text: f.dnd ? T("fr_dnd") : [T("fr_online"), sim].filter(Boolean).join(" · ") };
  }
  return { dot: "", text: f.last_seen ? T("fr_last_seen", ago(f.last_seen)) : T("fr_offline") };
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------
function renderFab() {
  if (!fab) return;
  const n = badgeCount();
  const on = accepted().filter((f) => f.online).length;
  fab.querySelector(".fr-badge").textContent = n > 99 ? "99+" : String(n);
  fab.querySelector(".fr-badge").hidden = n === 0;
  fab.querySelector(".fr-fab-on").hidden = on === 0 || n > 0;
  fab.title = T("fr_open");
  fab.setAttribute("aria-label", T("fr_open"));
  fab.classList.toggle("on", S.open);
}

function rowHtml(f) {
  const p = presence(f);
  const lm = S.last[f.friend_id];
  const sub =
    f.status === "pending_in"
      ? T("fr_wants")
      : f.status === "pending_out"
        ? T("fr_waiting")
        : f.unread && lm && lm.sender === f.friend_id
          ? bodyOf(lm)
          : p.dot
            ? p.text
            : lm
              ? lm.sender === S.me.id
                ? T("fr_you", bodyOf(lm))
                : bodyOf(lm)
              : p.text;
  let right = "";
  if (f.status === "pending_in")
    right = `<span class="fr-acts"><button class="btn btn-sm btn-accent" data-act="accept" data-id="${esc(f.friend_id)}">${esc(T("fr_accept"))}</button><button class="fr-ib" data-act="decline" data-id="${esc(f.friend_id)}" title="${esc(T("fr_decline"))}" aria-label="${esc(T("fr_decline"))}">${IC.x}</button></span>`;
  else if (f.status === "pending_out")
    right = `<button class="fr-ib" data-act="cancel" data-id="${esc(f.friend_id)}" title="${esc(T("fr_cancel_req"))}" aria-label="${esc(T("fr_cancel_req"))}">${IC.x}</button>`;
  else if (f.unread) right = `<span class="fr-count">${f.unread > 99 ? "99+" : f.unread}</span>`;
  else if (lm) right = `<span class="fr-when">${esc(ago(lm.created_at))}</span>`;
  const tag = f.status === "accepted" ? "button" : "div";
  return `<${tag} class="fr-row${f.unread ? " unread" : ""}${f.status !== "accepted" ? " pend" : ""}"${
    f.status === "accepted" ? ` type="button" data-act="chat" data-id="${esc(f.friend_id)}"` : ""
  }>
    ${avatarHtml(f.friend_id, f.display_name, f, f.status === "accepted" ? p.dot || "off" : "")}
    <span class="fr-main"><b>${esc(f.display_name || "?")}</b><small class="${p.dot === "race" && f.status === "accepted" ? "race" : ""}">${esc(sub)}</small></span>
    ${right}
  </${tag}>`;
}

function listView() {
  const inc = S.friends.filter((f) => f.status === "pending_in");
  const out = S.friends.filter((f) => f.status === "pending_out");
  const acc = accepted();
  const on = acc.filter((f) => f.online).length;
  const sec = (title, arr) => (arr.length ? `<div class="fr-sec">${esc(title)} <span>${arr.length}</span></div>${arr.map(rowHtml).join("")}` : "");
  return `<div class="fr-head">
      <div class="fr-ttl"><b>${esc(T("fr_title"))}</b><small>${esc(T("fr_online_n", on))}</small></div>
      <button class="fr-ib" data-act="add" title="${esc(T("fr_add"))}" aria-label="${esc(T("fr_add"))}">${IC.add}</button>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    <div class="fr-body fr-list">
      ${!S.loaded ? `<p class="fr-empty">${esc(T("loading"))}</p>` : ""}
      ${sec(T("fr_requests"), inc)}
      ${acc.length ? `${inc.length || out.length ? `<div class="fr-sec">${esc(T("fr_friends"))} <span>${acc.length}</span></div>` : ""}${acc.map(rowHtml).join("")}` : ""}
      ${sec(T("fr_sent"), out)}
      ${S.loaded && !S.friends.length ? `<div class="fr-empty"><p>${esc(T("fr_empty"))}</p><button class="btn btn-sm btn-accent" data-act="add">${IC.add}${esc(T("fr_add"))}</button></div>` : ""}
    </div>
    <div class="fr-foot">${esc(T("fr_app_note"))}</div>`;
}

function addView() {
  let res = "";
  if (S.found === null) res = `<p class="fr-empty">${esc(T("fr_add_hint"))}</p>`;
  else if (S.found === "loading") res = `<p class="fr-empty">${esc(T("loading"))}</p>`;
  else if (!S.found.length) res = `<p class="fr-empty">${esc(T("fr_no_result"))}</p>`;
  else
    res = S.found
      .map((p) => {
        const f = friend(p.id);
        const st = f?.status;
        const btn =
          st === "accepted"
            ? `<span class="badge ok">${esc(T("fr_is_friend"))}</span>`
            : st === "pending_out"
              ? `<span class="badge">${esc(T("fr_req_sent"))}</span>`
              : `<button class="btn btn-sm${st === "pending_in" ? " btn-accent" : ""}" data-act="${st === "pending_in" ? "accept" : "request"}" data-id="${esc(p.id)}">${esc(T(st === "pending_in" ? "fr_accept" : "fr_add"))}</button>`;
        return `<div class="fr-row pend">${avatarHtml(p.id, p.display_name, p)}<span class="fr-main"><b>${esc(p.display_name || "?")}</b>${
          p.iracing_name ? `<small>${esc(p.iracing_name)}</small>` : ""
        }</span>${btn}</div>`;
      })
      .join("");
  return `<div class="fr-head">
      <button class="fr-ib" data-act="list" title="${esc(T("fr_back"))}" aria-label="${esc(T("fr_back"))}">${IC.back}</button>
      <div class="fr-ttl"><b>${esc(T("fr_add"))}</b></div>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    <div class="fr-search"><input id="fr-q" type="search" autocomplete="off" maxlength="40" placeholder="${esc(T("fr_add_ph"))}" value="${esc(S.q)}"></div>
    <div class="fr-body fr-list" id="fr-found">${res}</div>`;
}

function msgsHtml() {
  if (!S.msgs.length) return `<p class="fr-empty">${esc(T("fr_no_msgs"))}</p>`;
  const me = S.me.id;
  let out = S.more ? `<div class="fr-older"><button class="linkbtn small" data-act="older">${esc(T("fr_older"))}</button></div>` : "";
  let day = "";
  S.msgs.forEach((m, i) => {
    const d = dayOf(m.created_at);
    if (d !== day) {
      day = d;
      out += `<div class="fr-day"><span>${esc(d)}</span></div>`;
    }
    const mine = m.sender === me;
    const prev = S.msgs[i - 1];
    const cont = prev && prev.sender === m.sender && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && dayOf(prev.created_at) === d;
    const big = emojiOnly(bodyOf(m));
    out += `<div class="fr-msg ${mine ? "me" : "them"}${cont ? " cont" : ""}" data-mid="${esc(m.id)}">
      <div class="fr-bub${big ? " big" : ""}">${msgHtml(bodyOf(m))}<time>${esc(timeOf(m.created_at))}</time></div>
      <span class="fr-mact">
        <button type="button" data-act="hide" data-id="${esc(m.id)}">${esc(T("fr_hide"))}</button>
        ${mine ? "" : `<button type="button" data-act="report" data-id="${esc(m.id)}">${esc(T("fr_report"))}</button>`}
      </span>
    </div>`;
    if (S.report === m.id) {
      out += `<form class="fr-report" id="fr-report">
        <b>${esc(T("fr_report_t"))}</b>
        <select name="reason">${REASONS.map((r) => `<option value="${r}">${esc(T("fr_r_" + r))}</option>`).join("")}</select>
        <input name="note" maxlength="500" placeholder="${esc(T("fr_report_note"))}">
        <div class="fr-acts"><button type="button" class="btn btn-sm btn-ghost" data-act="report-x">${esc(T("fr_no"))}</button><button class="btn btn-sm btn-danger">${esc(T("fr_report_send"))}</button></div>
      </form>`;
    }
  });
  return out;
}

function chatView() {
  const f = friend(S.chat) || { friend_id: S.chat, display_name: "?" };
  const p = presence(f);
  const closed = f.accept_messages === false;
  const ask = S.ask
    ? `<div class="fr-ask"><span>${esc(S.ask === "clear" ? T("fr_clear_ask") : T("fr_remove_ask", f.display_name))}</span><span class="fr-acts"><button class="btn btn-sm btn-ghost" data-act="ask-x">${esc(
        T("fr_no"),
      )}</button><button class="btn btn-sm btn-danger" data-act="ask-ok">${esc(T("fr_yes"))}</button></span></div>`
    : "";
  return `<div class="fr-head">
      <button class="fr-ib" data-act="list" title="${esc(T("fr_back"))}" aria-label="${esc(T("fr_back"))}">${IC.back}</button>
      ${avatarHtml(f.friend_id, f.display_name, f, p.dot || "off", "sm")}
      <div class="fr-ttl"><b>${esc(f.display_name || "?")}</b><small class="${p.dot === "race" ? "race" : ""}">${esc(p.text)}</small></div>
      <span class="fr-menu-w">
        <button class="fr-ib" data-act="menu" title="${esc(T("fr_more"))}" aria-label="${esc(T("fr_more"))}">${IC.more}</button>
        ${S.menu ? `<span class="fr-menu"><button data-act="ask-clear">${esc(T("fr_clear"))}</button><button class="bad" data-act="ask-remove">${esc(T("fr_remove"))}</button></span>` : ""}
      </span>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    ${ask}
    <div class="fr-body fr-msgs" id="fr-msgs">${S.msgs === null ? `<p class="fr-empty">${esc(T("loading"))}</p>` : msgsHtml()}</div>
    ${
      closed
        ? `<div class="fr-closed">${esc(T("fr_closed_msgs"))}</div>`
        : `<form class="fr-comp" id="fr-comp">
      <span id="fr-emo"></span>
      <textarea id="fr-text" rows="1" maxlength="1000" placeholder="${esc(T("fr_msg_ph"))}"></textarea>
      <button class="fr-send" title="${esc(T("fr_send"))}" aria-label="${esc(T("fr_send"))}">${IC.send}</button>
    </form>`
    }`;
}

/** Paneli yeniden çizer; sohbet yazısı ve kaydırma konumu korunur */
function render() {
  renderFab();
  if (!root) return;
  root.hidden = !S.open;
  document.documentElement.classList.toggle("fr-lock", S.open);
  if (!S.open) return;
  const ta = $("#fr-text", root);
  const draft = ta ? ta.value : null;
  const hadFocus = ta && document.activeElement === ta;
  const q = $("#fr-q", root);
  const qFocus = q && document.activeElement === q;
  const box = $("#fr-msgs", root);
  const atBottom = box ? box.scrollHeight - box.scrollTop - box.clientHeight < 40 : true;
  const keep = box ? box.scrollHeight - box.scrollTop : 0;
  const listBox = $(".fr-list", root);
  const listTop = listBox ? listBox.scrollTop : 0;

  root.innerHTML = S.view === "add" ? addView() : S.view === "chat" ? chatView() : listView();

  if (S.view === "chat") {
    const nta = $("#fr-text", root);
    if (nta) {
      if (draft != null) nta.value = draft;
      grow(nta);
      attachEmoji(nta, { host: $("#fr-emo", root), title: T("fr_emoji"), up: true });
      if (hadFocus) nta.focus();
    }
    const nb = $("#fr-msgs", root);
    if (nb) nb.scrollTop = S._scrollOld ? nb.scrollHeight - keep : atBottom || S._scrollEnd ? nb.scrollHeight : nb.scrollHeight - keep;
    S._scrollOld = false;
    S._scrollEnd = false;
  } else if (S.view === "add") {
    const nq = $("#fr-q", root);
    if (nq && (qFocus || S._focusQ)) {
      nq.focus();
      nq.setSelectionRange(nq.value.length, nq.value.length);
    }
    S._focusQ = false;
  } else {
    const nl = $(".fr-list", root);
    if (nl) nl.scrollTop = listTop;
  }
}

function grow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------
function setOpen(o) {
  S.open = o;
  if (o) {
    S.view = S.view === "chat" && S.chat ? "chat" : "list";
    loadFriends();
    hidePeek();
  }
  S.menu = false;
  render();
}

async function openChat(id) {
  S.view = "chat";
  S.chat = id;
  S.msgs = null;
  S.more = false;
  S.ask = "";
  S.menu = false;
  S.report = null;
  S.open = true;
  render();
  try {
    const rows = await fetchMsgs(id);
    if (S.chat !== id) return;
    S.msgs = rows;
    S._scrollEnd = true;
  } catch (e) {
    S.msgs = [];
    toast(errMsg(e), true);
  }
  const f = friend(id);
  if (f && f.unread) f.unread = 0;
  rpc("mark_read", { p_from: id }).catch(() => {});
  render();
  if (!matchMedia("(max-width: 560px)").matches) $("#fr-text", root)?.focus();
}

async function fetchMsgs(id, before = null) {
  const me = S.me.id;
  let q = sb
    .from("messages")
    .select("id,sender,recipient,body,created_at,read_at")
    .or(`and(sender.eq.${me},recipient.eq.${id}),and(sender.eq.${id},recipient.eq.${me})`)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  S.more = (data || []).length >= PAGE;
  return (data || []).reverse();
}

async function sendMsg() {
  const ta = $("#fr-text", root);
  if (!ta || !S.chat) return;
  const body = emojify(ta.value).trim();
  if (!body) return;
  const to = S.chat;
  ta.value = "";
  grow(ta);
  const tmp = { id: "tmp-" + Date.now(), sender: S.me.id, recipient: to, body: body.slice(0, 1000), created_at: new Date().toISOString(), read_at: null };
  S.msgs = [...(S.msgs || []), tmp];
  S.last[to] = tmp;
  S._scrollEnd = true;
  render();
  try {
    const id = await rpc("send_message", { p_to: to, p_body: body });
    tmp.id = id || tmp.id;
    render();
  } catch (e) {
    S.msgs = (S.msgs || []).filter((m) => m !== tmp);
    const nta = $("#fr-text", root);
    if (nta && !nta.value) nta.value = body;
    render();
    toast(errMsg(e), true);
  }
}

let searchT = 0;
function search(q) {
  S.q = q;
  clearTimeout(searchT);
  const t = q.replace(/[(),*%\\]/g, " ").trim();
  if (t.length < 2) {
    S.found = null;
    return render();
  }
  if (S.found === null) {
    S.found = "loading";
    render();
  }
  searchT = setTimeout(async () => {
    const run = (cols) =>
      sb
        .from("profiles")
        .select(cols)
        .or(`display_name.ilike.*${t}*,iracing_name.ilike.*${t}*`)
        .neq("id", S.me.id)
        .limit(20);
    let { data, error } = await run("id,display_name,iracing_name,avatar_path");
    // avatar_path sütunu henüz yoksa onsuz dene
    if (error) ({ data, error } = await run("id,display_name,iracing_name"));
    if (S.q !== q) return;
    S.found = error ? [] : data || [];
    render();
  }, 300);
}

async function act(a, id, el) {
  try {
    switch (a) {
      case "close":
        return setOpen(false);
      case "list":
        S.view = "list";
        S.chat = null;
        S.menu = false;
        loadFriends();
        return render();
      case "add":
        S.view = "add";
        S._focusQ = true;
        return render();
      case "chat":
        return openChat(id);
      case "accept":
        if (el) el.disabled = true;
        await rpc("friend_respond", { p_user: id, p_accept: true });
        toast(T("fr_now_friends"));
        return loadFriends();
      case "decline":
        if (el) el.disabled = true;
        await rpc("friend_respond", { p_user: id, p_accept: false });
        return loadFriends();
      case "cancel":
        if (el) el.disabled = true;
        await rpc("friend_remove", { p_user: id });
        return loadFriends();
      case "request": {
        if (el) el.disabled = true;
        const r = await rpc("friend_request", { p_user: id });
        toast(T(r === "accepted" ? "fr_now_friends" : "fr_req_sent"));
        return loadFriends();
      }
      case "older": {
        if (!S.msgs?.length) return;
        const older = await fetchMsgs(S.chat, S.msgs[0].created_at);
        S.msgs = [...older, ...S.msgs];
        S._scrollOld = true;
        return render();
      }
      case "hide": {
        await rpc("hide_message", { p_id: id });
        S.msgs = (S.msgs || []).filter((m) => m.id !== id);
        return render();
      }
      case "report":
        S.report = S.report === id ? null : id;
        return render();
      case "report-x":
        S.report = null;
        return render();
      case "menu":
        S.menu = !S.menu;
        return render();
      case "ask-clear":
      case "ask-remove":
        S.ask = a === "ask-clear" ? "clear" : "remove";
        S.menu = false;
        return render();
      case "ask-x":
        S.ask = "";
        return render();
      case "ask-ok": {
        const f = S.chat;
        if (S.ask === "clear") {
          await rpc("clear_conversation", { p_friend: f });
          S.msgs = [];
          delete S.last[f];
          S.ask = "";
          return render();
        }
        await rpc("friend_remove", { p_user: f });
        S.ask = "";
        S.view = "list";
        S.chat = null;
        return loadFriends();
      }
    }
  } catch (e) {
    if (el) el.disabled = false;
    toast(errMsg(e), true);
  }
}

// ---------------------------------------------------------------------------
// Gelen mesaj (Realtime)
// ---------------------------------------------------------------------------
function onIncoming(m) {
  if (!m || m.recipient !== S.me?.id) return;
  S.last[m.sender] = m;
  const chatting = S.open && S.view === "chat" && S.chat === m.sender && document.visibilityState === "visible";
  if (S.view === "chat" && S.chat === m.sender && Array.isArray(S.msgs) && !S.msgs.some((x) => x.id === m.id)) S.msgs = [...S.msgs, m];
  const f = friend(m.sender);
  if (chatting) rpc("mark_read", { p_from: m.sender }).catch(() => {});
  else if (f) f.unread = (f.unread || 0) + 1;
  else loadFriends();
  if (!chatting && !(f && f.muted)) showPeek(f, m);
  render();
}

function hidePeek() {
  clearTimeout(S.peek);
  peekEl?.classList.remove("show");
}
function showPeek(f, m) {
  if (!peekEl || S.open) return;
  const name = f?.display_name || T("fr_new_msg");
  peekEl.innerHTML = `${avatarHtml(m.sender, name, f || {}, "", "sm")}<span class="fr-main"><b>${esc(name)}</b><small>${esc(bodyOf(m))}</small></span>`;
  peekEl.dataset.id = m.sender;
  peekEl.classList.add("show");
  clearTimeout(S.peek);
  S.peek = setTimeout(hidePeek, 6000);
}

function subscribe() {
  unsubscribe();
  if (!S.me) return;
  const ch = sb
    .channel(`site-inbox-${S.me.id}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${S.me.id}` }, (p) => onIncoming(p.new))
    .subscribe();
  S.inbox = ch;
}
function unsubscribe() {
  if (S.inbox) {
    try {
      sb.removeChannel(S.inbox);
    } catch {}
    S.inbox = null;
  }
}

// ---------------------------------------------------------------------------
// Kurulum
// ---------------------------------------------------------------------------
function mount() {
  if (fab) return;
  fab = document.createElement("button");
  fab.type = "button";
  fab.className = "fr-fab";
  fab.innerHTML = `${IC.chat}<span class="fr-badge" hidden></span><i class="fr-fab-on" hidden></i>`;
  fab.addEventListener("click", () => setOpen(!S.open));

  peekEl = document.createElement("button");
  peekEl.type = "button";
  peekEl.className = "fr-peek";
  peekEl.addEventListener("click", () => {
    hidePeek();
    if (peekEl.dataset.id) openChat(peekEl.dataset.id);
  });

  root = document.createElement("div");
  root.className = "fr-panel";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", T("fr_title"));
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || !root.contains(b)) {
      if (S.menu && !e.target.closest(".fr-menu-w")) {
        S.menu = false;
        render();
      }
      return;
    }
    e.preventDefault();
    act(b.dataset.act, b.dataset.id, b.tagName === "BUTTON" ? b : null);
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "fr-q") search(e.target.value);
    if (e.target.id === "fr-text") {
      const ta = e.target;
      const v = emojifyTyped(ta.value);
      if (v !== ta.value) {
        const d = ta.value.length - (ta.selectionStart ?? ta.value.length);
        ta.value = v;
        const p = v.length - d;
        ta.setSelectionRange(p, p);
      }
      grow(ta);
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.target.id === "fr-text" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMsg();
    }
    if (e.key === "Escape" && !document.querySelector(".emo-pop")) {
      if (S.report || S.ask || S.menu) {
        S.report = null;
        S.ask = "";
        S.menu = false;
        render();
      } else setOpen(false);
    }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.target.id === "fr-comp") return sendMsg();
    if (e.target.id === "fr-report") {
      const fd = new FormData(e.target);
      const btn = e.target.querySelector(".btn-danger");
      btn.disabled = true;
      try {
        await rpc("message_report", { p_message: S.report, p_reason: String(fd.get("reason")), p_note: String(fd.get("note") || "") });
        toast(T("fr_report_ok"));
        S.report = null;
        render();
      } catch (err) {
        btn.disabled = false;
        toast(errMsg(err), true);
      }
    }
  });
  document.body.append(peekEl, root, fab);
  document.addEventListener("langchange", () => {
    root.setAttribute("aria-label", T("fr_title"));
    render();
  });
}

function unmount() {
  unsubscribe();
  clearInterval(S.timer);
  hidePeek();
  fab?.remove();
  root?.remove();
  peekEl?.remove();
  fab = root = peekEl = null;
  document.documentElement.classList.remove("fr-lock");
  Object.assign(S, { open: false, view: "list", friends: [], loaded: false, last: {}, chat: null, msgs: [], ask: "", menu: false, report: null, q: "", found: null });
}

async function start(user) {
  if (S.me?.id === user?.id && fab) return;
  unmount();
  S.me = user;
  if (!user) return;
  mount();
  render();
  await loadFriends();
  subscribe();
  // Panel açıkken 20 sn'de bir, kapalıyken 60 sn'de bir yenile (programdaki gibi)
  S.tick = 0;
  S.timer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    S.tick++;
    if (S.open || S.tick % 3 === 0) loadFriends();
  }, 20000);
}

/** Sayfa iskeleti (boot: dil + üst menü) hazır olunca başla */
function whenBooted() {
  return new Promise((resolve) => {
    if (document.querySelector("header.top")) return resolve();
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (document.querySelector("header.top") || Date.now() - t0 > 8000) {
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
}

whenBooted().then(async () => {
  const { data } = await sb.auth.getSession();
  start(data.session?.user ?? null);
  sb.auth.onAuthStateChange((_ev, session) => {
    // Oturum olayları supabase-js kilidinin içinde gelir: işi bir sonraki tura bırak
    setTimeout(() => start(session?.user ?? null), 0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.me) loadFriends();
  });
});
