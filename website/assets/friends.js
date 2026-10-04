// Arkadaşlar ve mesajlar (sitenin tüm sayfalarında, giriş yapılınca sağ altta).
// Programdaki Arkadaşlar paneliyle aynı sunucu işlevlerini kullanır (src/cloud/social.ts):
// my_friends, friend_request / friend_respond / friend_remove, send_message, mark_read,
// hide_message ("benden sil"), clear_conversation, message_report ve messages tablosu (Realtime).
// Gruplar (c45: my_groups, group_chat / group_send / group_read / group_mute / group_members / group_leave) ve
// takım sohbetleri (c30: my_teams, team_chat / team_send / team_chat_read / team_chat_mute) de burada listelenir.
// Mesaja tıklayınca (sağ tık / basılı tutma) menü: Kopyala, Benden sil, Herkesten sil, Raporla (c55).
// Ekibinde olduğum arkadaşlar (c53: crew_drivers) "Ekip" düğmesi ve canlı satır alır; panel crewpanel.js'ten gelir.
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
  fr_bg_removed: ["🖼️ Sohbet arka planını kaldırdı", "🖼️ Removed the chat background"],
  fr_groups: ["Gruplar", "Groups"],
  fr_teams: ["Takımlar", "Teams"],
  fr_members_n: ["{0} üye", "{0} members"],
  fr_members: ["Üyeler", "Members"],
  fr_owner: ["Sahip", "Owner"],
  fr_role_admin: ["Yönetici", "Admin"],
  fr_mute: ["Sessize al", "Mute"],
  fr_unmute: ["Sesi aç", "Unmute"],
  fr_muted: ["Sessizde", "Muted"],
  fr_leave_group: ["Gruptan ayrıl", "Leave group"],
  fr_leave_group_ask: ["\"{0}\" grubundan ayrılmak istiyor musun?", "Leave the group \"{0}\"?"],
  fr_delete_group: ["Grubu sil", "Delete group"],
  fr_delete_group_ask: ["\"{0}\" grubu ve tüm mesajları herkes için silinsin mi? Bu işlem geri alınamaz.", "Delete the group \"{0}\" and all its messages for everyone? This cannot be undone."],
  fr_kick: ["Gruptan çıkar", "Remove from group"],
  fr_kick_ask: ["{0} gruptan çıkarılsın mı?", "Remove {0} from the group?"],
  fr_leave_owner_ask: ["\"{0}\" grubundan ayrılırsan sahiplik en eski üyeye geçer. Ayrılmak istiyor musun?", "If you leave \"{0}\", ownership passes to the longest-standing member. Leave?"],
  fr_hidden_st: ["Çevrimdışı (gizli)", "Offline (hidden)"],
  fr_hidden_sec: ["Gizli", "Hidden"],
  fr_hiding_tip: ["Bu üye \"Çevrimdışı\" durumunu seçti ama şu an çevrimiçi. Diğer üyeler onu çevrimdışı görür; bunu sadece yöneticiler görür.", "This member chose to appear offline but is online right now. Other members see them as offline; only admins can see this."],
  fr_leave_team: ["Takımdan ayrıl", "Leave team"],
  fr_leave_team_ask: ["\"{0}\" takımından ayrılmak istiyor musun?", "Leave the team \"{0}\"?"],
  fr_team_page: ["Takım sayfası", "Team page"],
  fr_copy: ["Kopyala", "Copy"],
  fr_copied: ["Kopyalandı", "Copied"],
  fr_del_all: ["Herkesten sil", "Delete for everyone"],
  fr_del_all_ask: ["Bu mesaj herkesten silinsin mi?", "Delete this message for everyone?"],
  fr_deleted: ["Bu mesaj silindi", "This message was deleted"],
  fr_poll_last: ["📊 Anket", "📊 Poll"],
  fr_poll_votes: ["{0} oy", "{0} votes"],
  fr_poll_ended: ["Anket bitti", "Poll ended"],
  fr_poll_app: ["Oy vermek için SRTR Pitwall programını kullan", "Use the SRTR Pitwall app to vote"],
  fr_sys_join: ["{0}, {1} adlı kişiyi gruba ekledi", "{0} added {1} to the group"],
  fr_sys_leave: ["{0} gruptan ayrıldı", "{0} left the group"],
  fr_sys_kick: ["{0} gruptan çıkarıldı", "{0} was removed from the group"],
  fr_sys_owner: ["{0} grubun yeni sahibi oldu", "{0} is the new group owner"],
  fr_sys_rename: ["Grubun adı değişti: {0}", "The group was renamed: {0}"],
  fr_sys_bg: ["{0} sohbet arka planını değiştirdi", "{0} changed the chat background"],
  fr_sys_bg_none: ["{0} sohbet arka planını kaldırdı", "{0} removed the chat background"],
  fr_room_app: [
    "Grup kurma ve davet etme SRTR Pitwall programından yapılır.",
    "Creating groups and inviting members is done in the SRTR Pitwall app.",
  ],
  fr_crew: ["Ekip", "Crew"],
  fr_crew_open: ["Ekip paneli: yarışını canlı izle, izin verdiyse pit ayarlarını değiştir", "Crew panel: watch their race live and change pit settings if allowed"],
  fr_crew_fuel: ["{0} tur yakıt", "{0} laps of fuel"],
  fr_trust_on: ["Güvenilir yap", "Mark as trusted"],
  fr_trust_off: ["Güvenilirden çıkar", "Remove from trusted"],
  fr_trust_tip: ["Güvenilir arkadaşın sen yarışırken pitwall'ına girebilir ve pit ayarlarını senin yerine değiştirebilir.", "A trusted friend can open your pitwall while you race and change your pit settings for you."],
  fr_trust_free: ["Güvenilir arkadaşın pitwall'ını izleyebilir. Pit ayarlarını değiştirebilmesi PRO üyelere özel.", "A trusted friend can watch your pitwall. Letting them change pit settings is for PRO members."],
  fr_profile: ["Profil", "Profile"],
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
const BG_RE = /^🖼️? ?Sohbet arka planını (değiştirdi|kaldırdı)$/u;
const isBg = (m) => BG_RE.test((m && m.body) || "");
function bodyOf(m) {
  const b = (m && m.body) || "";
  const x = BG_RE.exec(b);
  return x ? T(x[1] === "kaldırdı" ? "fr_bg_removed" : "fr_bg_changed") : b;
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
  view: "list", // list | add | chat (1:1) | room (grup / takım) | crew (ekip paneli)
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
  groups: [], // my_groups()
  teams: [], // my_teams()
  crew: [], // crew_drivers(): ekibinde olduğum sürücüler
  room: null, // açık grup / takım sohbeti: { kind: "group" | "team", id }
  members: null, // null: kapalı | "loading" | üye listesi
  crewId: null, // ekip paneli açık olan arkadaş
  mine: [], // crew_list(): benim ekibim (sohbet menüsündeki "Ekibime ekle" maddeleri)
  crewLock: true, // crew_state().needs_pro: PRO değilim (maddeler görünür ama tıklanamaz)
  crewPanel: null,
  crewTimer: 0,
  roomCh: null,
  roomKey: "",
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
// Sessize alınan grup / takım toplam rozete sayılmaz (satırında sayısı görünür)
const roomUnread = () => [...S.groups, ...S.teams].reduce((a, r) => a + (r.muted ? 0 : r.unread || 0), 0);
const badgeCount = () =>
  S.friends.reduce((a, f) => a + (f.status === "accepted" ? f.unread || 0 : 0), 0) +
  S.friends.filter((f) => f.status === "pending_in").length +
  roomUnread();

// Grup ve takım sohbeti aynı akışı kullanır; sadece sunucu işlevlerinin adı farklıdır
const ROOM = {
  group: {
    chat: "group_chat", send: "group_send", read: "group_read", mute: "group_mute", hide: "group_message_hide",
    del: "group_message_delete", report: "group_message_report", leave: "group_leave", arg: "p_group",
    table: "group_messages", col: "group_id",
  },
  team: {
    chat: "team_chat", send: "team_send", read: "team_chat_read", mute: "team_chat_mute", hide: "team_message_hide",
    del: "team_message_delete", report: "team_message_report", leave: "team_leave", arg: "p_team",
    table: "team_messages", col: "team_id",
  },
};
const roomId = (kind, r) => (kind === "group" ? r.group_id : r.team_id);
const roomOf = (kind, id) => (kind === "group" ? S.groups.find((g) => g.group_id === id) : S.teams.find((t) => t.team_id === id)) || null;
const curRoom = () => (S.room ? roomOf(S.room.kind, S.room.id) : null);
const inRoom = () => S.view === "room" && !!S.room;
const crewOf = (id) => S.crew.find((d) => d.owner_id === id) || null;
const visible = () => document.visibilityState === "visible";

/** Gruplarım, takımlarım ve ekibinde olduğum sürücüler (sunucu güncel değilse / ağ yoksa eski liste kalır) */
async function loadRooms() {
  if (!S.me) return;
  const get = (fn) => rpc(fn).then((r) => (Array.isArray(r) ? r : [])).catch(() => null);
  const [g, t, c, mine, st] = await Promise.all([get("my_groups"), get("my_teams"), get("crew_drivers"), get("crew_list"), rpc("crew_state").catch(() => null)]);
  if (mine) S.mine = mine;
  if (st && typeof st === "object") S.crewLock = !!st.needs_pro;
  if (g) S.groups = g;
  if (t) S.teams = t;
  if (c) S.crew = c;
  // Açık sohbetin grubu / takımı artık yoksa (çıkarıldım, silindi) listeye dön
  if (inRoom() && g && t && !curRoom()) {
    S.view = "list";
    S.room = null;
    S.members = null;
  }
  // Açık odanın okunmamışı sayılmasın
  const r = curRoom();
  if (r && S.open && inRoom() && r.unread) {
    r.unread = 0;
    rpc(ROOM[S.room.kind].read, { [ROOM[S.room.kind].arg]: S.room.id }).catch(() => {});
  }
  syncRoomSub();
}
/** Ekip satırı (5 sn'de bir, sadece panel açıkken): değişiklik varsa listeyi yeniden çizer */
async function loadCrew() {
  try {
    const c = await rpc("crew_drivers");
    if (!Array.isArray(c)) return;
    const before = S.crew.map((d) => d.owner_id + crewLine(d)).join("|");
    S.crew = c;
    if (S.open && S.view === "list" && before !== c.map((d) => d.owner_id + crewLine(d)).join("|")) render();
  } catch {}
}

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
  await loadRooms();
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
  // invisible: sadece yöneticiye gelir (c65) — çevrimiçi ama "Çevrimdışı" durumunu seçmiş
  const simL = f.sim ? SIM_LABEL[f.sim] || f.sim : "";
  if (f.invisible) return { dot: "hid", text: [T("fr_hidden_st"), ...(f.racing ? [simL, f.session, f.track, f.car] : [simL])].filter(Boolean).join(" · "), tip: T("fr_hiding_tip") };
  if (f.racing) return { dot: "race", text: [simL || T("fr_racing"), f.session, f.track, f.car].filter(Boolean).join(" · ") };
  if (f.online) return { dot: f.dnd ? "dnd" : "on", text: (f.dnd ? [T("fr_dnd")] : [T("fr_online"), simL]).filter(Boolean).join(" · ") };
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

/** Ekibinde olduğum sürücünün canlı satırı: pist · sıra · yakıtla kaç tur. Veri güvenilmez: sayı olmayan atlanır. */
function crewLine(d) {
  const x = d && d.live ? d.data : null;
  if (!x || typeof x !== "object") return "";
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
  const track = typeof x.track === "string" && x.track ? x.track : typeof d.track === "string" ? d.track : "";
  return [track, num(x.position) > 0 ? `P${Math.round(num(x.position))}` : "", num(x.lapsLeft) > 0 ? T("fr_crew_fuel", num(x.lapsLeft).toFixed(1)) : ""]
    .filter(Boolean)
    .join(" · ");
}

const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "");
/** Grup: adının baş harfi; takım: etiketi (ve varsa logosu) */
function roomAvatar(kind, r, size = "") {
  const id = String(roomId(kind, r));
  if (kind === "group")
    return `<span class="fr-av fr-rav${size ? " " + size : ""}" style="background:${hashColor(id)}" aria-hidden="true">${esc(initialOf(r.name))}</span>`;
  const logo = r.logo_path && typeof r.logo_path === "string" ? `${SUPABASE_URL}/storage/v1/object/public/teams/${r.logo_path.split("/").map(encodeURIComponent).join("/")}` : "";
  return `<span class="fr-av fr-rav team${size ? " " + size : ""}" style="background:${safeColor(r.color) || hashColor(id)}" aria-hidden="true">${esc(String(r.tag || "?").slice(0, 4))}${
    logo ? `<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""
  }</span>`;
}

function roomRowHtml(kind, r) {
  const id = roomId(kind, r);
  // Ad altında son mesaj gösterilmez (Steam gibi): sadece üye sayısı
  const sub = T("fr_members_n", r.member_count || 0);
  const right = r.unread ? `<span class="fr-count${r.muted ? " muted" : ""}">${r.unread > 99 ? "99+" : r.unread}</span>` : r.last_at ? `<span class="fr-when">${esc(ago(r.last_at))}</span>` : "";
  return `<button class="fr-row${r.unread ? " unread" : ""}" type="button" data-act="room" data-kind="${kind}" data-id="${esc(id)}">
    ${roomAvatar(kind, r)}
    <span class="fr-main"><b>${esc(r.name || "?")}${r.muted ? ` <i class="fr-mute" title="${esc(T("fr_muted"))}">🔕</i>` : ""}</b><small>${esc(sub)}</small></span>
    ${right}
  </button>`;
}

function rowHtml(f) {
  const p = presence(f);
  const sub =
    f.status === "pending_in"
      ? T("fr_wants")
      : f.status === "pending_out"
        ? T("fr_waiting")
        : p.text;
  let right = "";
  if (f.status === "pending_in")
    right = `<span class="fr-acts"><button class="btn btn-sm btn-accent" data-act="accept" data-id="${esc(f.friend_id)}">${esc(T("fr_accept"))}</button><button class="fr-ib" data-act="decline" data-id="${esc(f.friend_id)}" title="${esc(T("fr_decline"))}" aria-label="${esc(T("fr_decline"))}">${IC.x}</button></span>`;
  else if (f.status === "pending_out")
    right = `<button class="fr-ib" data-act="cancel" data-id="${esc(f.friend_id)}" title="${esc(T("fr_cancel_req"))}" aria-label="${esc(T("fr_cancel_req"))}">${IC.x}</button>`;
  else if (f.unread) right = `<span class="fr-count">${f.unread > 99 ? "99+" : f.unread}</span>`;
  // Ekibinde olduğum arkadaş: "Ekip" düğmesi + yarıştayken canlı satır (satır div olur: içinde düğme var)
  const cw = f.status === "accepted" ? crewOf(f.friend_id) : null;
  const live = cw ? crewLine(cw) : "";
  if (cw)
    right += `<button type="button" class="fr-crewb${cw.live ? " live" : ""}" data-act="crew" data-id="${esc(f.friend_id)}" title="${esc(T("fr_crew_open"))}">${esc(T("fr_crew"))}</button>`;
  const tag = f.status === "accepted" && !cw ? "button" : "div";
  return `<${tag} class="fr-row${f.unread ? " unread" : ""}${f.status !== "accepted" ? " pend" : ` rs-${p.dot || "off"}`}${cw ? " fr-click" : ""}"${
    f.status === "accepted" ? `${cw ? ' role="button" tabindex="0"' : ' type="button"'} data-act="chat" data-id="${esc(f.friend_id)}"` : ""
  }>
    ${avatarHtml(f.friend_id, f.display_name, f, f.status === "accepted" ? p.dot || "off" : "")}
    <span class="fr-main st-${f.status === "accepted" ? p.dot || "off" : "pend"}"><b>${esc(f.display_name || "?")}</b><small class="${p.dot === "race" && f.status === "accepted" ? "race" : ""}">${esc(sub)}</small>${
      live ? `<small class="fr-live">${esc(live)}</small>` : ""
    }</span>
    ${right}
  </${tag}>`;
}

function listView() {
  const inc = S.friends.filter((f) => f.status === "pending_in");
  const out = S.friends.filter((f) => f.status === "pending_out");
  const acc = accepted();
  const on = acc.filter((f) => f.online).length;
  const rooms = S.groups.length + S.teams.length > 0;
  // Steam gibi: yarışta (yeşil) üstte, sonra çevrimiçi (mavi), en altta çevrimdışı (gri); bölüm içinde alfabetik
  const byName = (a, b) => String(a.display_name || "").localeCompare(String(b.display_name || ""), locale(), { sensitivity: "base" });
  const stSec = (k, title, arr) => (arr.length ? `<div class="fr-sec fr-st st-${k}">${esc(title)} <span>${arr.length}</span></div>${[...arr].sort(byName).map(rowHtml).join("")}` : "");
  const sec = (title, arr) => (arr.length ? `<div class="fr-sec">${esc(title)} <span>${arr.length}</span></div>${arr.map(rowHtml).join("")}` : "");
  return `<div class="fr-head">
      <div class="fr-ttl"><b>${esc(T("fr_title"))}</b><small>${esc(T("fr_online_n", on))}</small></div>
      <button class="fr-ib" data-act="add" title="${esc(T("fr_add"))}" aria-label="${esc(T("fr_add"))}">${IC.add}</button>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    <div class="fr-body fr-list">
      ${!S.loaded ? `<p class="fr-empty">${esc(T("loading"))}</p>` : ""}
      ${sec(T("fr_requests"), inc)}
      ${acc.length ? `${inc.length || out.length || rooms ? `<div class="fr-sec">${esc(T("fr_friends"))} <span>${acc.length}</span></div>` : ""}${stSec("race", T("fr_racing"), acc.filter((f) => f.racing && !f.invisible))}${stSec("on", T("fr_online"), acc.filter((f) => !f.invisible && f.online && !f.racing && !f.dnd))}${stSec("dnd", T("fr_dnd"), acc.filter((f) => !f.invisible && f.online && !f.racing && f.dnd))}${stSec("hid", T("fr_hidden_sec"), acc.filter((f) => f.invisible))}${stSec("off", T("fr_offline"), acc.filter((f) => !f.invisible && !f.online && !f.racing))}` : ""}
      ${S.groups.length ? `<div class="fr-sec">${esc(T("fr_groups"))} <span>${S.groups.length}</span></div>${S.groups.map((g) => roomRowHtml("group", g)).join("")}` : ""}
      ${S.teams.length ? `<div class="fr-sec">${esc(T("fr_teams"))} <span>${S.teams.length}</span></div>${S.teams.map((t) => roomRowHtml("team", t)).join("")}` : ""}
      ${sec(T("fr_sent"), out)}
      ${S.loaded && !S.friends.length && !rooms ? `<div class="fr-empty"><p>${esc(T("fr_empty"))}</p><button class="btn btn-sm btn-accent" data-act="add">${IC.add}${esc(T("fr_add"))}</button></div>` : ""}
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

/** Grup / takım sistem mesajı (meta) ziyaretçinin dilinde */
function sysTextOf(m) {
  const x = m.meta && typeof m.meta === "object" ? m.meta : {};
  const who = m.sender_name || "?";
  switch (x.t) {
    case "bg":
      return T(x.kind === "none" ? "fr_sys_bg_none" : "fr_sys_bg", who);
    case "join":
      return T("fr_sys_join", x.by_name || who, x.name || "?");
    case "leave":
      return T("fr_sys_leave", x.name || who);
    case "kick":
      return T("fr_sys_kick", x.name || "?");
    case "owner":
      return T("fr_sys_owner", x.name || who);
    case "rename":
      return T("fr_sys_rename", x.name || "");
    default:
      return bodyOf(m);
  }
}

/** Takım sohbetindeki anket: sitede sadece okunur (oy vermek programdan) */
function pollHtml(p) {
  const counts = Array.isArray(p.counts) ? p.counts.map((c) => Number(c) || 0) : [];
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = Array.isArray(p.mine) ? p.mine : [];
  const ended = new Date(p.ends_at).getTime() <= Date.now();
  const opts = (Array.isArray(p.options) ? p.options : [])
    .map((o, i) => {
      const c = counts[i] || 0;
      const pct = total ? Math.round((c * 100) / total) : 0;
      return `<span class="fr-popt${mine.includes(i) ? " mine" : ""}"><i style="width:${pct}%"></i><span>${esc(o)}</span><em>${c}</em></span>`;
    })
    .join("");
  return `<span class="fr-poll"><b>📊 ${esc(p.question || "")}</b>${opts}<small>${esc(T("fr_poll_votes", Number(p.voters) || 0))} · ${esc(T(ended ? "fr_poll_ended" : "fr_poll_app"))}</small></span>`;
}

function msgsHtml() {
  if (!S.msgs.length) return `<p class="fr-empty">${esc(T("fr_no_msgs"))}</p>`;
  const me = S.me.id;
  const room = inRoom();
  const isSys = (m) => room && !!m.meta && !m.deleted;
  let out = S.more ? `<div class="fr-older"><button class="linkbtn small" data-act="older">${esc(T("fr_older"))}</button></div>` : "";
  let day = "";
  S.msgs.forEach((m, i) => {
    const d = dayOf(m.created_at);
    if (d !== day) {
      day = d;
      out += `<div class="fr-day"><span>${esc(d)}</span></div>`;
    }
    if (isSys(m)) {
      // Sistem mesajı: ortada küçük not (tıklayınca menü: Benden sil)
      out += `<div class="fr-sys" data-mid="${esc(m.id)}"><span title="${esc(timeOf(m.created_at))}">${esc(sysTextOf(m))}</span></div>`;
    } else {
      const mine = m.sender === me;
      const prev = S.msgs[i - 1];
      const cont = prev && !isSys(prev) && prev.sender === m.sender && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && dayOf(prev.created_at) === d;
      const text = bodyOf(m);
      const big = !m.deleted && !m.poll && emojiOnly(text);
      const who = room && !mine && !cont ? `<b class="fr-who" style="color:${hashColor(String(m.sender || "?"))}">${esc(m.sender_name || "?")}</b>` : "";
      const inner = m.deleted ? `<i class="fr-gone">${esc(T("fr_deleted"))}</i>` : m.poll ? pollHtml(m.poll) : msgHtml(text);
      out += `<div class="fr-msg ${mine ? "me" : "them"}${cont ? " cont" : ""}" data-mid="${esc(m.id)}">
      <div class="fr-bub${big ? " big" : ""}">${who}${inner}<time>${esc(timeOf(m.created_at))}</time></div>
    </div>`;
    }
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

const composerHtml = () => `<form class="fr-comp" id="fr-comp">
      <span id="fr-emo"></span>
      <textarea id="fr-text" rows="1" maxlength="1000" placeholder="${esc(T("fr_msg_ph"))}"></textarea>
      <button class="fr-send" title="${esc(T("fr_send"))}" aria-label="${esc(T("fr_send"))}">${IC.send}</button>
    </form>`;

/** Grup / takım sohbeti */
function roomView() {
  const kind = S.room.kind;
  const r = curRoom() || { name: "?", member_count: 0 };
  const kickId = S.ask.startsWith("kick:") ? S.ask.slice(5) : "";
  const askText = kickId
    ? T("fr_kick_ask", (Array.isArray(S.members) && S.members.find((m) => m.user_id === kickId)?.display_name) || "?")
    : S.ask === "delete"
      ? T("fr_delete_group_ask", r.name)
      : kind === "group"
        ? T(r.is_owner && (r.member_count || 0) > 1 ? "fr_leave_owner_ask" : "fr_leave_group_ask", r.name)
        : T("fr_leave_team_ask", r.name);
  const ask = S.ask
    ? `<div class="fr-ask"><span>${esc(askText)}</span><span class="fr-acts"><button class="btn btn-sm btn-ghost" data-act="ask-x">${esc(
        T("fr_no"),
      )}</button><button class="btn btn-sm btn-danger" data-act="ask-ok">${esc(T("fr_yes"))}</button></span></div>`
    : "";
  const menu = S.menu
    ? `<span class="fr-menu"><button data-act="members">${esc(T("fr_members"))}</button><button data-act="room-mute">${esc(T(r.muted ? "fr_unmute" : "fr_mute"))}</button>${
        kind === "team" ? `<a href="takimlar.html?id=${encodeURIComponent(S.room.id)}">${esc(T("fr_team_page"))}</a>` : ""
      }<button class="bad" data-act="ask-leave">${esc(T(kind === "group" ? "fr_leave_group" : "fr_leave_team"))}</button>${
        kind === "group" && r.is_owner ? `<button class="bad" data-act="ask-delete">${esc(T("fr_delete_group"))}</button>` : ""
      }</span>`
    : "";
  let body;
  if (S.members !== null) {
    const list = Array.isArray(S.members) ? S.members : null;
    body = `<div class="fr-body fr-list">
      <div class="fr-sec">${esc(T("fr_members"))}${list ? ` <span>${list.length}</span>` : ""}<button class="linkbtn small fr-sec-x" data-act="members">${esc(T("fr_back"))}</button></div>
      ${
        list
          ? list
              .map((m) => {
                const role = m.is_owner || m.role === "owner" ? T("fr_owner") : m.role === "admin" ? T("fr_role_admin") : "";
                // Grup sahibi: üyeyi çıkarabilir (satır bağlantı yerine düğmeli)
                if (kind === "group" && r.is_owner && m.user_id !== S.me.id)
                  return `<div class="fr-row">${avatarHtml(m.user_id, m.display_name, m)}<span class="fr-main"><a href="yarisci.html?u=${encodeURIComponent(m.user_id)}"><b>${esc(
                    m.display_name || "?",
                  )}</b></a></span>${role ? `<span class="badge">${esc(role)}</span>` : ""}<button type="button" class="fr-ib" data-act="ask-kick" data-id="${esc(m.user_id)}" title="${esc(T("fr_kick"))}" aria-label="${esc(
                    T("fr_kick"),
                  )}">${IC.x}</button></div>`;
                return `<a class="fr-row fr-click" href="yarisci.html?u=${encodeURIComponent(m.user_id)}">${avatarHtml(m.user_id, m.display_name, m)}<span class="fr-main"><b>${esc(
                  m.display_name || "?",
                )}</b></span>${role ? `<span class="badge">${esc(role)}</span>` : ""}</a>`;
              })
              .join("")
          : `<p class="fr-empty">${esc(T("loading"))}</p>`
      }
      ${kind === "group" ? `<p class="fr-note">${esc(T("fr_room_app"))}</p>` : ""}
    </div>`;
  } else {
    body = `<div class="fr-body fr-msgs" id="fr-msgs">${S.msgs === null ? `<p class="fr-empty">${esc(T("loading"))}</p>` : msgsHtml()}</div>${composerHtml()}`;
  }
  return `<div class="fr-head">
      <button class="fr-ib" data-act="list" title="${esc(T("fr_back"))}" aria-label="${esc(T("fr_back"))}">${IC.back}</button>
      ${roomAvatar(kind, r, "sm")}
      <div class="fr-ttl"><b>${esc(r.name || "?")}</b><small>${esc(T("fr_members_n", r.member_count || 0))}${r.muted ? ` · ${esc(T("fr_muted"))}` : ""}</small></div>
      <span class="fr-menu-w">
        <button class="fr-ib" data-act="menu" title="${esc(T("fr_more"))}" aria-label="${esc(T("fr_more"))}">${IC.more}</button>
        ${menu}
      </span>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    ${ask}
    ${body}`;
}

/** Sohbet menüsü: Profil + tek "Güvenilir yap / Güvenilirden çıkar" (c78: güvenilir arkadaş ekibime girer: pitwall + pit ayarları). */
const isTrusted = (f) => !!f.trusted || S.mine.some((x) => x.member_id === f.friend_id);
function crewMenu(f) {
  if (f.status !== "accepted") return "";
  const on = isTrusted(f);
  return (
    `<a href="yarisci.html?u=${encodeURIComponent(f.friend_id)}">${esc(T("fr_profile"))}</a>` +
    `<button data-act="trust" title="${esc(T(S.crewLock ? "fr_trust_free" : "fr_trust_tip"))}">${on ? "✓ " : ""}${esc(T(on ? "fr_trust_off" : "fr_trust_on"))}</button>`
  );
}

/** Ekip paneli (crewpanel.js bu kaba kurulur; panel kendi kendini yeniler) */
function crewView() {
  const f = friend(S.crewId) || { friend_id: S.crewId, display_name: "?" };
  return `<div class="fr-head">
      <button class="fr-ib" data-act="list" title="${esc(T("fr_back"))}" aria-label="${esc(T("fr_back"))}">${IC.back}</button>
      ${avatarHtml(f.friend_id, f.display_name, f, "", "sm")}
      <div class="fr-ttl"><b>${esc(f.display_name || "?")}</b><small>${esc(T("fr_crew"))}</small></div>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    <div class="fr-body fr-crew" id="fr-crew"><p class="fr-empty">${esc(T("loading"))}</p></div>`;
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
        ${S.menu ? `<span class="fr-menu">${crewMenu(f)}<button data-act="ask-clear">${esc(T("fr_clear"))}</button><button class="bad" data-act="ask-remove">${esc(T("fr_remove"))}</button></span>` : ""}
      </span>
      <button class="fr-ib" data-act="close" title="${esc(T("fr_close"))}" aria-label="${esc(T("fr_close"))}">${IC.x}</button>
    </div>
    ${ask}
    <div class="fr-body fr-msgs" id="fr-msgs">${S.msgs === null ? `<p class="fr-empty">${esc(T("loading"))}</p>` : msgsHtml()}</div>
    ${
      closed
        ? `<div class="fr-closed">${esc(T("fr_closed_msgs"))}</div>`
        : composerHtml()
    }`;
}

/** Paneli yeniden çizer; sohbet yazısı ve kaydırma konumu korunur */
function render() {
  renderFab();
  if (!root) return;
  root.hidden = !S.open;
  document.documentElement.classList.toggle("fr-lock", S.open);
  if (!S.open) return;
  // Ekip paneli kendi kabını kendisi çizer: üstüne yazma
  if (S.view === "crew" && S.crewPanel && $("#fr-crew", root)) return;
  // Mesaj menüsü: mesajı hâlâ ekrandaysa arka plandaki yenilemeler kapatmasın
  if (ctxEl && !((S.view === "chat" || S.view === "room") && msgById(ctxEl.dataset.id))) closeCtx();
  const rep = $("#fr-report", root);
  const repKeep = rep ? { reason: rep.elements.reason.value, note: rep.elements.note.value, focus: document.activeElement === rep.elements.note } : null;
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

  root.innerHTML =
    S.view === "add" ? addView() : S.view === "chat" ? chatView() : S.view === "room" && S.room ? roomView() : S.view === "crew" ? crewView() : listView();
  const nrep = $("#fr-report", root);
  if (nrep && repKeep) {
    nrep.elements.reason.value = repKeep.reason;
    nrep.elements.note.value = repKeep.note;
    if (repKeep.focus) nrep.elements.note.focus();
  }

  if (S.view === "chat" || S.view === "room") {
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
  closeCrewPanel();
  closeCtx();
  if (o) {
    S.view = S.view === "chat" && S.chat ? "chat" : S.view === "room" && S.room ? "room" : "list";
    loadFriends();
    if (S.view === "room") reloadRoom();
    hidePeek();
  } else if (S.view === "crew") S.view = "list";
  S.menu = false;
  render();
}

async function openChat(id) {
  closeCrewPanel();
  S.room = null;
  S.members = null;
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

// ---- Grup / takım sohbeti ----
async function fetchRoom(kind, id, before = null) {
  const R = ROOM[kind];
  const rows = await rpc(R.chat, { [R.arg]: id, p_before: before, p_limit: PAGE });
  return Array.isArray(rows) ? rows : [];
}
const isTmp = (m) => String(m.id).startsWith("tmp-");
/** Açık odanın son sayfasını sunucudan yeniden okur (yeni mesaj, silinme, anket oyları) ve okundu yazar */
async function reloadRoom(first = false) {
  const r = S.room;
  if (!r) return;
  try {
    const rows = await fetchRoom(r.kind, r.id);
    if (S.room !== r) return;
    if (first || !Array.isArray(S.msgs)) {
      S.msgs = rows;
      S.more = rows.length >= PAGE;
      S._scrollEnd = true;
    } else {
      // Daha önce yüklenen eski sayfalar ve henüz sunucuya ulaşmamış kendi mesajım korunur
      const t0 = rows.length >= PAGE ? new Date(rows[0].created_at).getTime() : 0;
      const older = t0 ? S.msgs.filter((m) => !isTmp(m) && new Date(m.created_at).getTime() < t0) : [];
      const pending = S.msgs.filter((m) => isTmp(m) && !rows.some((x) => x.sender === m.sender && x.body === m.body && new Date(x.created_at) >= new Date(m.created_at) - 5000));
      S.msgs = [...older, ...rows, ...pending];
    }
  } catch (e) {
    if (S.room !== r) return;
    if (first) {
      S.msgs = [];
      toast(errMsg(e), true);
    }
  }
  const row = curRoom();
  if (S.open && visible()) {
    if (row) row.unread = 0;
    rpc(ROOM[r.kind].read, { [ROOM[r.kind].arg]: r.id }).catch(() => {});
  }
  render();
}
let roomT = 0;
const scheduleRoom = () => {
  clearTimeout(roomT);
  roomT = setTimeout(() => reloadRoom(), 250);
};
let roomsT = 0;
const scheduleRooms = () => {
  clearTimeout(roomsT);
  roomsT = setTimeout(() => loadRooms().then(render), 500);
};

async function openRoom(kind, id) {
  closeCrewPanel();
  Object.assign(S, { view: "room", room: { kind, id }, chat: null, msgs: null, more: false, ask: "", menu: false, report: null, members: null, open: true });
  render();
  await reloadRoom(true);
  if (!matchMedia("(max-width: 560px)").matches) $("#fr-text", root)?.focus();
}

async function loadMembers() {
  const r = S.room;
  if (!r) return;
  S.members = "loading";
  render();
  try {
    let list;
    if (r.kind === "group") list = await rpc("group_members", { p_group: r.id });
    else list = (await rpc("team_profile", { p_team: r.id }))?.members;
    if (S.room !== r || S.members === null) return;
    S.members = Array.isArray(list) ? list : [];
  } catch (e) {
    if (S.room !== r) return;
    S.members = null;
    toast(errMsg(e), true);
  }
  render();
}

// ---- Ekip paneli ----
function closeCrewPanel() {
  try {
    S.crewPanel?.destroy();
  } catch {}
  S.crewPanel = null;
}
function ensureCrewCss() {
  if (document.querySelector('link[rel="stylesheet"][href*="crew.css"]')) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = new URL("./crew.css", import.meta.url).href;
  document.head.append(l);
}
async function openCrew(id) {
  closeCrewPanel();
  Object.assign(S, { view: "crew", crewId: id, chat: null, room: null, members: null, menu: false, ask: "", report: null, open: true });
  render();
  ensureCrewCss();
  try {
    const mod = await import("./crewpanel.js");
    const host = $("#fr-crew", root);
    if (S.view !== "crew" || S.crewId !== id || !host || S.crewPanel) return;
    host.textContent = "";
    S.crewPanel = mod.mountCrewPanel(host, id, {
      // Ekipten çıkarıldım: listeye dön
      onGone: () => S.view === "crew" && S.crewId === id && act("list"),
    });
  } catch (e) {
    toast(errMsg(e), true);
    act("list");
  }
}

// ---- Mesaj menüsü (tıkla / sağ tık / basılı tut): Kopyala · Benden sil · Herkesten sil · Raporla ----
let ctxEl = null;
function closeCtx() {
  ctxEl?.remove();
  ctxEl = null;
}
const msgById = (id) => (Array.isArray(S.msgs) ? S.msgs.find((m) => String(m.id) === String(id)) : null) || null;
/** Herkesten sil: grup → kendi mesajım ya da grup sahibi; takım → kendi mesajım ya da sahip / yönetici. 1:1'de yok. */
function canDeleteAll(m) {
  if (!inRoom() || m.deleted) return false;
  const r = curRoom();
  if (!r) return false;
  if (S.room.kind === "group") return !m.meta && (m.sender === S.me.id || !!r.is_owner);
  return m.sender === S.me.id || r.role === "owner" || r.role === "admin";
}
function openCtx(id, x, y) {
  closeCtx();
  const m = msgById(id);
  if (!m || isTmp(m)) return;
  const sys = inRoom() ? !!m.meta : isBg(m);
  const items = [];
  if (!m.deleted && !(inRoom() && m.meta) && m.body) items.push(["m-copy", T("fr_copy"), ""]);
  items.push(["m-hide", T("fr_hide"), ""]);
  if (canDeleteAll(m)) items.push(["m-del", T("fr_del_all"), "bad"]);
  if (m.sender !== S.me.id && !sys && !m.deleted) items.push(["m-report", T("fr_report"), "bad"]);
  const el = document.createElement("div");
  el.className = "fr-menu fr-ctx";
  el.setAttribute("role", "menu");
  el.dataset.id = String(id);
  el.innerHTML = items.map(([a, l, c]) => `<button type="button" role="menuitem" class="${c}" data-act="${a}">${esc(l)}</button>`).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    closeCtx();
    act(b.dataset.act, id, null);
  });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.append(el);
  el.style.left = Math.max(6, Math.min(x, innerWidth - el.offsetWidth - 6)) + "px";
  el.style.top = Math.max(6, Math.min(y, innerHeight - el.offsetHeight - 6)) + "px";
  ctxEl = el;
}
const onDocDown = (e) => {
  if (ctxEl && !ctxEl.contains(e.target)) closeCtx();
};

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
  if (!ta || !(S.chat || inRoom())) return;
  if (inRoom()) return sendRoomMsg(ta);
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

async function sendRoomMsg(ta) {
  const body = emojify(ta.value).trim();
  if (!body) return;
  const r = S.room;
  const R = ROOM[r.kind];
  ta.value = "";
  grow(ta);
  const tmp = { id: "tmp-" + Date.now(), sender: S.me.id, sender_name: "", body: body.slice(0, 1000), deleted: false, created_at: new Date().toISOString() };
  S.msgs = [...(S.msgs || []), tmp];
  S._scrollEnd = true;
  render();
  try {
    const id = await rpc(R.send, { [R.arg]: r.id, p_body: body });
    if (id && Array.isArray(S.msgs) && S.msgs.some((m) => m !== tmp && m.id === id)) S.msgs = S.msgs.filter((m) => m !== tmp);
    else tmp.id = id || tmp.id;
    scheduleRooms();
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

async function act(a, id, el, src = null) {
  try {
    switch (a) {
      case "close":
        return setOpen(false);
      case "list":
        closeCrewPanel();
        S.view = "list";
        S.chat = null;
        S.room = null;
        S.members = null;
        S.crewId = null;
        S.ask = "";
        S.report = null;
        S.menu = false;
        loadFriends();
        return render();
      case "room":
        return openRoom(src?.dataset.kind === "team" ? "team" : "group", id);
      case "crew":
        return openCrew(id);
      case "members":
        S.menu = false;
        if (S.members !== null) {
          S.members = null;
          S._scrollEnd = true;
          return render();
        }
        return loadMembers();
      case "room-mute": {
        const r = curRoom();
        if (!r || !S.room) return;
        const R = ROOM[S.room.kind];
        S.menu = false;
        await rpc(R.mute, { [R.arg]: S.room.id, p_muted: !r.muted });
        r.muted = !r.muted;
        return render();
      }
      case "ask-leave":
        S.ask = "leave";
        S.menu = false;
        return render();
      case "m-copy": {
        const m = msgById(id);
        if (!m) return;
        await navigator.clipboard?.writeText(bodyOf(m));
        return toast(T("fr_copied"));
      }
      case "m-hide": {
        // Benden sil: sadece benim görünümümden kalkar
        await rpc(inRoom() ? ROOM[S.room.kind].hide : "hide_message", { p_id: id });
        S.msgs = (S.msgs || []).filter((m) => m.id !== id);
        if (S.report === id) S.report = null;
        if (inRoom()) scheduleRooms();
        return render();
      }
      case "m-del": {
        if (!inRoom() || !confirm(T("fr_del_all_ask"))) return;
        await rpc(ROOM[S.room.kind].del, { p_id: id });
        S.msgs = (S.msgs || []).map((m) => (m.id === id ? { ...m, deleted: true, body: "", meta: null, poll: null } : m));
        scheduleRooms();
        return render();
      }
      case "m-report":
        S.report = id;
        render();
        return $("#fr-report", root)?.scrollIntoView({ block: "nearest" });
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
        if (inRoom()) {
          const r = S.room;
          const rows = await fetchRoom(r.kind, r.id, S.msgs[0].created_at);
          if (S.room !== r) return;
          S.more = rows.length >= PAGE;
          S.msgs = [...rows, ...S.msgs];
          S._scrollOld = true;
          return render();
        }
        const older = await fetchMsgs(S.chat, S.msgs[0].created_at);
        S.msgs = [...older, ...S.msgs];
        S._scrollOld = true;
        return render();
      }
      case "report-x":
        S.report = null;
        return render();
      case "menu":
        S.menu = !S.menu;
        return render();
      case "trust": {
        const fid = S.chat;
        const f = fid && friend(fid);
        if (!f) return;
        const on = !isTrusted(f);
        S.menu = false;
        // c78'li sunucu güvenilir işaretini ekip üyeliğine kendisi çevirir; eski sunucu için ekip yetkisi ayrıca yazılır
        let trustErr = null;
        try {
          await rpc("friend_trust_set", { p_user: fid, p_trusted: on });
          f.trusted = on;
        } catch (e) {
          trustErr = e;
        }
        try {
          await rpc("crew_set", { p_friend: fid, p_view: on, p_control: on && !S.crewLock });
          trustErr = on ? null : trustErr;
        } catch (e) {
          if (trustErr) trustErr = e;
        }
        try {
          const l = await rpc("crew_list");
          if (Array.isArray(l)) S.mine = l;
        } catch {
          /* liste sonraki yenilemede gelir */
        }
        if (trustErr) toast(errMsg(trustErr), true);
        else if (on && S.crewLock) toast(T("fr_trust_free"));
        return render();
      }
      case "ask-clear":
      case "ask-remove":
        S.ask = a === "ask-clear" ? "clear" : "remove";
        S.menu = false;
        return render();
      case "ask-x":
        S.ask = "";
        return render();
      case "ask-delete":
        S.ask = "delete";
        S.menu = false;
        return render();
      case "ask-kick":
        S.ask = "kick:" + id;
        return render();
      case "ask-ok": {
        if (S.ask === "delete" && S.room?.kind === "group") {
          const r = S.room;
          await rpc("group_delete", { p_group: r.id });
          S.groups = S.groups.filter((g) => g.group_id !== r.id);
          return act("list");
        }
        if (S.ask.startsWith("kick:") && S.room?.kind === "group") {
          const r = S.room;
          const u = S.ask.slice(5);
          S.ask = "";
          await rpc("group_kick", { p_group: r.id, p_user: u });
          if (Array.isArray(S.members)) S.members = S.members.filter((m) => m.user_id !== u);
          const g = S.groups.find((x) => x.group_id === r.id);
          if (g && g.member_count) g.member_count -= 1;
          return render();
        }
        if (S.ask === "leave" && S.room) {
          const r = S.room;
          await rpc(ROOM[r.kind].leave, { [ROOM[r.kind].arg]: r.id });
          if (r.kind === "group") S.groups = S.groups.filter((g) => g.group_id !== r.id);
          else S.teams = S.teams.filter((t) => t.team_id !== r.id);
          return act("list");
        }
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

/** Grup / takım mesajı (Realtime): açık odaysa yeniden oku; değilse listeyi (okunmamış, son mesaj) tazele */
function onRoomMsg(kind, m, ev) {
  if (!m || !S.me) return;
  const id = m[ROOM[kind].col];
  const row = roomOf(kind, id);
  const open = inRoom() && S.room.kind === kind && S.room.id === id;
  if (open) scheduleRoom();
  if (ev === "INSERT" && row && m.sender !== S.me.id && !(open && S.open && visible())) {
    row.unread = (row.unread || 0) + 1;
    if (!row.muted && !m.meta && m.body) showRoomPeek(kind, row, m);
    renderFab();
  }
  scheduleRooms();
}
/** Gruplarımın / takımlarımın mesajlarına abone ol (liste değişince yeniden). Okuma kuralı sunucuda: sadece üyeler. */
function syncRoomSub() {
  if (!S.me) return;
  const gs = S.groups.map((g) => g.group_id).sort();
  const ts = S.teams.map((t) => t.team_id).sort();
  const key = gs.join(",") + "|" + ts.join(",");
  if (key === S.roomKey && S.roomCh) return;
  dropRoomSub();
  S.roomKey = key;
  if (!gs.length && !ts.length) return;
  let ch = sb.channel(`site-rooms-${S.me.id}-${Math.random().toString(36).slice(2, 7)}`);
  for (const [kind, ids] of [["group", gs], ["team", ts]]) {
    if (!ids.length) continue;
    const R = ROOM[kind];
    const filter = `${R.col}=in.(${ids.slice(0, 100).join(",")})`;
    for (const event of ["INSERT", "UPDATE"])
      ch = ch.on("postgres_changes", { event, schema: "public", table: R.table, filter }, (p) => onRoomMsg(kind, p.new, event));
  }
  // Anket oyları: açık takım sohbetindeki sayılar tazelensin
  if (ts.length)
    ch = ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "team_polls", filter: `team_id=in.(${ts.slice(0, 100).join(",")})` }, (p) => {
      if (inRoom() && S.room.kind === "team" && S.room.id === p.new?.team_id) scheduleRoom();
    });
  S.roomCh = ch.subscribe();
}
function dropRoomSub() {
  if (S.roomCh) {
    try {
      sb.removeChannel(S.roomCh);
    } catch {}
    S.roomCh = null;
  }
  S.roomKey = "";
}
function showRoomPeek(kind, row, m) {
  if (!peekEl || S.open) return;
  peekEl.innerHTML = `${roomAvatar(kind, row, "sm")}<span class="fr-main"><b>${esc(row.name || "?")}</b><small>${esc(bodyOf(m))}</small></span>`;
  peekEl.dataset.id = roomId(kind, row);
  peekEl.dataset.kind = kind;
  peekEl.classList.add("show");
  clearTimeout(S.peek);
  S.peek = setTimeout(hidePeek, 6000);
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
  peekEl.dataset.kind = "";
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
const onLang = () => {
  if (!root) return;
  root.setAttribute("aria-label", T("fr_title"));
  // Ekip paneli açıksa başlığıyla birlikte yeniden kurulur
  if (S.view === "crew" && S.crewId && S.open) return void openCrew(S.crewId);
  render();
};

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
    const { id, kind } = peekEl.dataset;
    if (id && kind) openRoom(kind, id);
    else if (id) openChat(id);
  });

  root = document.createElement("div");
  root.className = "fr-panel";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", T("fr_title"));
  root.addEventListener("click", (e) => {
    // Mesaja tıklayınca menü (bağlantıya tıklanmadıysa, metin seçilmiyorsa)
    const bub = e.target.closest(".fr-bub, .fr-sys span");
    if (bub && root.contains(bub) && !e.target.closest("a, [data-act]")) {
      const sel = window.getSelection?.();
      const row = bub.closest("[data-mid]");
      if (row && (!sel || sel.isCollapsed)) openCtx(row.dataset.mid, e.clientX, e.clientY);
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b || !root.contains(b)) {
      if (S.menu && !e.target.closest(".fr-menu-w")) {
        S.menu = false;
        render();
      }
      return;
    }
    e.preventDefault();
    act(b.dataset.act, b.dataset.id, b.tagName === "BUTTON" ? b : null, b);
  });
  // Sağ tık / dokunmatikte basılı tutma: aynı menü
  root.addEventListener("contextmenu", (e) => {
    const row = e.target.closest("[data-mid]");
    if (!row || !root.contains(row) || e.target.closest("a")) return;
    e.preventDefault();
    openCtx(row.dataset.mid, e.clientX, e.clientY);
  });
  root.addEventListener("scroll", closeCtx, true);
  document.addEventListener("pointerdown", onDocDown, true);
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
    if (e.key === "Enter" && e.target.matches?.(".fr-click[data-act]")) {
      e.preventDefault();
      return void act(e.target.dataset.act, e.target.dataset.id, null, e.target);
    }
    if (e.key === "Escape" && !document.querySelector(".emo-pop")) {
      if (ctxEl) closeCtx();
      else if (S.report || S.ask || S.menu) {
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
        await rpc(inRoom() ? ROOM[S.room.kind].report : "message_report", { p_message: S.report, p_reason: String(fd.get("reason")), p_note: String(fd.get("note") || "") });
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
  document.addEventListener("langchange", onLang);
}

function unmount() {
  unsubscribe();
  dropRoomSub();
  closeCrewPanel();
  closeCtx();
  clearTimeout(roomT);
  clearTimeout(roomsT);
  clearInterval(S.crewTimer);
  document.removeEventListener("pointerdown", onDocDown, true);
  document.removeEventListener("langchange", onLang);
  clearInterval(S.timer);
  hidePeek();
  fab?.remove();
  root?.remove();
  peekEl?.remove();
  fab = root = peekEl = null;
  document.documentElement.classList.remove("fr-lock");
  Object.assign(S, { open: false, view: "list", friends: [], loaded: false, last: {}, chat: null, msgs: [], ask: "", menu: false, report: null, q: "", found: null, groups: [], teams: [], crew: [], room: null, members: null, crewId: null });
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
    // Realtime kaçırdıysa: açık grup / takım sohbeti de tazelenir
    if (S.open && inRoom() && Array.isArray(S.msgs) && S.members === null) reloadRoom();
  }, 20000);
  // Ekibinde olduğum arkadaşların canlı satırı: sadece panel ve liste açıkken 5 sn'de bir
  S.crewTimer = setInterval(() => {
    if (S.open && S.view === "list" && visible() && S.crew.length) loadCrew();
  }, 5000);
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
    if (document.visibilityState === "visible" && S.me) {
      loadFriends();
      if (S.open && inRoom()) reloadRoom();
    }
  });
});
