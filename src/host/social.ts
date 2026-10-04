// Overlay penceresinde (uygulama açık olduğu sürece çalışır) arkadaş listesi işleri:
//  - durumumu (çevrimiçi / yarışta, rahatsız etme) arkadaşlara bildir
//  - yarışırken canlı verimi (yakıt vb.) güvendiğim arkadaşlara gönder (sadece PRO)
//  - bana güvenen arkadaşların verisini Yakıt overlay'i / Pitwall takım bölümüne ekle
//  - yarıştayken gelen mesajları ekranda göster ve ses çal (rahatsız etme açıksa sadece alt köşede sayaç)
//  - arkadaşa özel "bildirimleri kapat" / "sesi kapat" ve takım odası mesajları (sessize alınan oda hariç)

import { createSignal, type Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { api, cloudEnabled, refreshSession, session } from "@/cloud/supabase";
import { settings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import type { Status } from "@/sdk/types";
import { osNotify } from "@/cloud/notify";
import { proLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import {
  emojify,
  friendLook,
  friendShares,
  hashColor,
  messageBeep,
  msgPreview,
  myFriends,
  onLive,
  onMessages,
  chatOpenKey,
  chatFront,
  realtimeKeepAlive,
  socialLog,
  unreadFrom,
  pushLive,
  setMyStatus,
  pingLink,
  type PingLink,
  shareTrustGet,
  type Friend,
  type LiveData,
  type Message,
  type MsgMeta,
  type ToastPayload,
} from "@/cloud/social";
import { liveWatch, statusChannel } from "@/cloud/pings";
import { myTeams, onTeamChat, teamChatKey, teamLogo, teamProfile, type MyTeam } from "@/cloud/teams";
import { groupChatKey, myGroups, onGroupChat, type MyGroup } from "@/cloud/groups";
import { broadcastOvMsg, ovMsgShown, OVMSG_CLEAR_EVENT, type OvMsg } from "@/sdk/ovmsg";
import { crewLiveExtra, crewWatching, isDriving } from "./crew";
import { syncIracingStats } from "@/cloud/iracingStats";

/** Mesajlar overlay'ine giden kayıt: takım mesajı */
function teamOv(m: { id: string; team_id: string; sender: string | null; body: string; poll_id?: string | null; meta?: MsgMeta | null }, tm: MyTeam, who: string, mine: boolean): OvMsg {
  const look = friendLook(m.sender ?? "");
  return {
    id: `t-${m.id}`,
    kind: "team",
    from: m.sender ?? "",
    peer: tm.team_id,
    name: who,
    color: look.color,
    photo: look.photo || undefined,
    team: `[${tm.tag}]`,
    body: m.poll_id ? `📊 ${emojify(m.body)}` : emojify(msgPreview(m)),
    mine,
    ts: Date.now(),
  };
}

/** Mesajlar overlay'ine giden kayıt: arkadaştan gelen mesaj */
function friendOv(m: { id: string; sender: string; body: string; meta?: MsgMeta | null }, name: string): OvMsg {
  const look = friendLook(m.sender);
  return { id: `f-${m.id}`, kind: "friend", from: m.sender, peer: m.sender, name, color: look.color, photo: look.photo || undefined, body: emojify(msgPreview(m)), mine: false, ts: Date.now() };
}

export interface MsgToast {
  id: string;
  from: string;
  body: string;
}

const [toast, setToast] = createSignal<MsgToast | null>(null);
const [pending, setPending] = createSignal(0);
export { toast as msgToast, pending as msgPending };
/** Oyun içi bildirim kutusunu göster (ekip komutları da bunu kullanır) */
export function showMsgToast(x: MsgToast, ms = 7000) {
  setToast(x);
  setTimeout(() => setToast((c) => (c?.id === x.id ? null : c)), ms);
}
export const clearPending = () => setPending(0);

let friends: Friend[] = [];
/** "Tüm arkadaşlarım" açık: kabul edilmiş her arkadaş verimi görebilir (c44) */
let trustAll = false;
let teams: MyTeam[] = [];
/** Sohbet gruplarım (c45) */
let groups: MyGroup[] = [];
/** Takım üyelerinin adları (takım id → kullanıcı id → ad) */
const teamNames = new Map<string, Map<string, string>>();
let started = false;
/** Yoklamada okunmamış sayısı artan arkadaşlar: Realtime'ın kaçırdığı mesajı bildir (startSocial içinde kurulur) */
let catchUp: (ids: string[]) => Promise<void> = async () => {};
/** Sunucudaki okunmamış sayısı bendeki sayıdan büyük olan (kabul edilmiş) arkadaşlar */
function grown(prev: Friend[], next: Friend[]): string[] {
  if (!prev.length) return [];
  return next
    .filter((f) => f.status === "accepted" && (f.unread || 0) > 0)
    .filter((f) => (f.unread || 0) > (prev.find((x) => x.friend_id === f.friend_id)?.unread || 0))
    .map((f) => f.friend_id);
}
/** Sunucunun kabul ettiği sim kimlikleri (user_status.sim, c31) */
const SIM_IDS = ["iracing", "acc", "ac", "lmu", "rf2", "ams2"];

/** Mesajları zaten gösteren bir pencere (panel ya da Arkadaşlar penceresi) şu an önde mi */
async function chatVisible(): Promise<boolean> {
  try {
    const { Window } = await import("@tauri-apps/api/window");
    for (const label of ["main", "friends"]) {
      const w = await Window.getByLabel(label);
      if (w && (await w.isVisible()) && !(await w.isMinimized()) && (await w.isFocused())) return true;
    }
  } catch {
    /* pencere bilgisi alınamazsa bildirim gösterilir */
  }
  return false;
}

/**
 * Steam benzeri açılır pencere (sağ alt köşe, görev çubuğunun üstü). Windows bildirim sistemine
 * bağlı değildir. Açılamazsa (eski sürüm/izin) Windows bildirimine düşer.
 */
/**
 * Öndeki sohbet penceresinin (panel ya da Arkadaşlar penceresi) şu an gösterdiği özel sohbet: arkadaş kimliği,
 * sohbet açık değilse "", hiçbir sohbet penceresi önde değilse null
 */
async function focusedChat(sender?: string): Promise<string | null> {
  try {
    const { Window } = await import("@tauri-apps/api/window");
    // Arkadaşın kendi sohbet penceresi önde mi
    if (sender) {
      const c = await Window.getByLabel("chat");
      if (c && (await c.isVisible()) && !(await c.isMinimized()) && (await c.isFocused()) && localStorage.getItem(chatOpenKey("chat")) === sender) return sender;
    }
    for (const label of ["main", "friends"]) {
      const w = await Window.getByLabel(label);
      if (w && (await w.isVisible()) && !(await w.isMinimized()) && (await w.isFocused())) return localStorage.getItem(chatOpenKey(label)) ?? "";
    }
  } catch {
    /* pencere bilgisi alınamazsa bildirim gösterilir */
  }
  return null;
}

async function popup(
  kind: ToastPayload["kind"],
  f: Pick<Friend, "friend_id" | "display_name">,
  body: string,
  id?: string,
  look: { color: string; photo: string } = friendLook(f.friend_id),
) {
  const payload: ToastPayload = {
    id: id ?? `${kind}-${f.friend_id}-${Date.now()}`,
    kind,
    friendId: f.friend_id,
    name: f.display_name || "?",
    body,
    color: look.color,
    photo: look.photo || undefined,
    ts: Date.now(),
  };
  try {
    await invoke("toast_show", { payload });
  } catch (e) {
    socialLog(`acilir pencere gosterilemedi (${String((e as Error)?.message ?? e).slice(0, 120)}) -> Windows bildirimi`);
    // Yedek: Windows bildirim merkezi (açılır pencere gösterilemediyse; ikisi birden çıkmasın)
    void osNotify(kind === "message" ? payload.name : "SRTR Pitwall", body);
  }
}

export function startSocial(status: Accessor<Status | undefined>) {
  if (started || !cloudEnabled) return;
  started = true;

  const racing = () => {
    const s = status();
    return !!s?.connected && !s.demo && !s.preview;
  };
  // Kendi aracımın sürücüsüyüm (izleyici / spotter / tekrar / araçta takım arkadaşı değil): arkadaşlara "yarışta"
  // durumu ve canlı veri yalnızca bu doğruyken gider. `racing()` ise "simdeyim" demektir (oyun içi bildirimler).
  const driving = () => isDriving(status());
  const soc = () => settings().general.social;

  // Uzakta: 10 dakikadır klavye / fare kullanılmıyor (yarışta sayılmaz: direksiyon girişi klavye / fare değildir)
  let away = false;
  setInterval(() => {
    invoke<number>("idle_seconds")
      .then((sec) => {
        const next = sec >= 600;
        if (next !== away) {
          away = next;
          pushStatus();
        }
      })
      .catch(() => {});
  }, 30_000);
  // Durum: 90 sn'de bir (sunucu 3 dk içinde görüleni çevrimiçi sayar) ve yarış durumu değişince
  let lastKey = "";
  let stLink: PingLink | null = null;
  let lvLink: PingLink | null = null;
  let lvAt = 0;
  let stFor = "";
  const pushStatus = (force = false) => {
    if (!session()) return;
    const s = status();
    const st = {
      racing: driving(),
      track: driving() ? s?.track ?? "" : "",
      car: driving() ? s?.carName ?? "" : "",
      session: driving() ? s?.sessionType ?? "" : "",
      dnd: soc().dnd,
      invisible: !!soc().invisible,
      away: away && !driving(),
      accept_messages: soc().acceptMessages,
      // Arkadaş listesinde "iRacing'de" rozeti (PRO gerekmez; canlı veri değil, sadece oyun)
      sim: racing() && SIM_IDS.includes(s?.sim ?? "") ? s!.sim! : racing() && !s?.sim ? "iracing" : "",
    };
    const key = JSON.stringify(st);
    if (!force && key === lastKey) return;
    const changed = key !== lastKey;
    lastKey = key;
    // Durum gerçekten değiştiyse arkadaşlara haber (listelerini hemen tazelerler); 90 sn'lik nabızda haber yok
    const me = session()!.user.id;
    if (stFor !== me) {
      stLink?.close();
      stLink = pingLink(statusChannel(me));
      lvLink?.close();
      lvLink = pingLink(liveWatch(me), () => (lvAt = Date.now()));
      stFor = me;
    }
    void Promise.resolve(setMyStatus(st)).then(() => changed && stLink?.ping());
  };
  // Nabız: yarışta 60 sn (sunucu 2 dk içinde görüleni "yarışta" sayar), değilken 90 sn
  let hb = 0;
  setInterval(() => {
    hb++;
    if (driving() ? hb % 2 === 0 : hb % 3 === 0) pushStatus(true);
  }, 30_000);

  // Çıkış yapıldı / hesap değişti: önceki hesabın arkadaşları, takım ve grup odaları, canlı verisi, okunmamış
  // sayacı ve ekrandaki bildirimi hemen bırakılır; Realtime abonelikleri kapatılır (yeni hesap için yeniden kurulur).
  let accountUid = session()?.user.id ?? "";
  const resetAccount = () => {
    friends = [];
    trustAll = false;
    teams = [];
    groups = [];
    teamNames.clear();
    setToast(null);
    setPending(0);
    lastKey = "";
    linkedFor = "";
    stopLive();
    stopLive = () => {};
    liveKey = "";
    for (const uid of liveIds) invoke("team_remote_set", { key: uid, fuel: null }).catch(() => {});
    liveIds = [];
    stopTeams();
    stopTeams = () => {};
    teamKey = "";
    stopGroups();
    stopGroups = () => {};
    groupKey = "";
    stopMsg();
    stopMsg = () => {};
    msgUser = "";
    void emit(OVMSG_CLEAR_EVENT).catch(() => {});
  };
  setInterval(() => {
    // Çıkış ana pencerede yapılır: bu penceredeki oturum bilgisini güncelle
    refreshSession();
    const uidNow = session()?.user.id ?? "";
    if (uidNow !== accountUid) {
      accountUid = uidNow;
      resetAccount();
      if (uidNow) {
        void refreshFriends();
        void subscribeMessages();
      }
    }
    pushStatus(false);
    syncTray();
    if (hiddenKey() !== lastHidden) {
      lastHidden = hiddenKey();
      void applyLive();
    }
    // Yarış bitince alt köşedeki sayaç kalkar (mesajlar panelde okunur)
    if (!racing() && pending()) setPending(0);
  }, 3000);

  // Tepsi simgesi (Steam gibi): okunmamış arkadaş mesajı varken kırmızı nokta + ipucunda sayı. Rahatsız Etme
  // açıkken ve sessize alınan arkadaş için gösterilmez (mesaj yine gelir, listede okunmamış sayılır).
  let trayN = -1;
  const syncTray = () => {
    const n = session() && !soc().dnd ? friends.reduce((a, f) => a + (f.status === "accepted" && !f.muted ? f.unread || 0 : 0), 0) : 0;
    if (n === trayN) return;
    trayN = n;
    invoke("tray_unread", { count: n, text: n > 0 ? t("{0} okunmamış mesaj", n) : null }).catch(() => {});
  };
  // Okunmamış sayılarını sunucudan tazele (hafif: sadece arkadaş listesi)
  const refreshUnread = async () => {
    const uid = session()?.user.id;
    if (!uid) return;
    const got = await api<Friend[]>("POST", "rpc/my_friends", { body: {} }).catch(() => null);
    if (!got || session()?.user.id !== uid) return;
    const n = new Map(got.map((f) => [f.friend_id, f.unread || 0]));
    const missed = grown(friends, got);
    friends = friends.map((f) => (n.has(f.friend_id) ? { ...f, unread: n.get(f.friend_id)! } : f));
    syncTray();
    if (missed.length) void catchUp(missed);
  };
  // Panel ya da Arkadaşlar penceresinde sohbet okundu: işaret hemen kalkar
  let readTimer = 0;
  listen<string>("social-read", (e) => {
    friends = friends.map((f) => (f.friend_id === e.payload ? { ...f, unread: 0 } : f));
    syncTray();
    // Aynı anda gelen mesajla yarış olduysa sunucudaki gerçek sayıya dön
    clearTimeout(readTimer);
    readTimer = window.setTimeout(() => void refreshUnread(), 2500);
  });

  // Arkadaş listesi (güvenilirler ve bana güvenenler) 2 dakikada bir yenilenir
  let stopLive: () => void = () => {};
  let liveKey = "";
  const refreshFriends = async () => {
    if (!session()) {
      friends = [];
      return;
    }
    try {
      const prev = friends;
      const uid = session()!.user.id;
      const got = (await myFriends()) ?? [];
      if (session()?.user.id !== uid) return; // yanıt gelene kadar çıkış yapıldı
      const missed = grown(prev, got);
      friends = got;
      syncTray();
      if (missed.length) void catchUp(missed);
      trustAll = await shareTrustGet().then((r) => !!r?.trust_all).catch(() => false);
      // Açılır pencere: beni güvenilir seçen ya da istek gönderen yeni arkadaş (yarıştayken oyun içi bildirim)
      if (prev.length && !soc().dnd) {
        for (const f of friends) {
          const was = prev.find((x) => x.friend_id === f.friend_id);
          let text = "";
          let kind: ToastPayload["kind"] = "request";
          if (f.status === "accepted" && f.trusts_me && !f.muted && !f.notify_muted && !was?.trusts_me) {
            kind = "trusted";
            text = t("Seni güvenilir olarak işaretledi; verilerini görebilirsin");
          } else if (f.status === "pending_in" && !was) {
            text = t("Sana arkadaşlık isteği gönderdi");
          }
          if (!text) continue;
          if (racing()) {
            const id = `${kind}-${f.friend_id}`;
            setToast({ id, from: f.display_name || "?", body: text });
            setTimeout(() => setToast((x) => (x?.id === id ? null : x)), 7000);
          } else {
            void chatVisible().then((v) => {
              if (v) return;
              void popup(kind, f, text);
              if (!f.sound_muted) messageBeep();
            });
          }
        }
      }
      // Kabul edilen arkadaşlar panel kapalıyken de renk/simge listesine eklenir
      syncAccountFriends(friends);
      const gotTeams = await myTeams().catch(() => teams);
      const gotGroups = await myGroups().catch(() => groups);
      if (session()?.user.id !== uid) return;
      teams = gotTeams;
      void subscribeTeams();
      groups = gotGroups;
      void subscribeGroups();
    } catch {
      return;
    }
    await applyLive();
  };
  // Bana güvenen arkadaşların verisini dinle -> takım bölümüne (kod gerekmez).
  // Ayarlar › Paylaşım'da gizlenen arkadaşlar (sharing.hiddenFriends) dinlenmez.
  let liveIds: string[] = [];
  // Simdeyken bana güvenen arkadaşlara "verine bakıyorum" haberi (20 sn'de bir): onlar yalnızca bakan varken gönderir
  const watchLinks = new Map<string, PingLink>();
  const syncWatch = () => {
    for (const [id, l] of watchLinks) {
      if (!liveIds.includes(id)) {
        l.close();
        watchLinks.delete(id);
      }
    }
    for (const id of liveIds.slice(0, 40)) if (!watchLinks.has(id)) watchLinks.set(id, pingLink(liveWatch(id)));
  };
  setInterval(() => {
    if (session() && racing()) for (const l of watchLinks.values()) l.ping();
  }, 20_000);
  const hiddenKey = () => (settings().general.sharing.hiddenFriends ?? []).join(",");
  let lastHidden = hiddenKey();
  const applyLive = async () => {
    const hidden = new Set(settings().general.sharing.hiddenFriends ?? []);
    const trustsMe = friends.filter((f) => f.status === "accepted" && f.trusts_me && !hidden.has(f.friend_id)).map((f) => f.friend_id);
    const key = trustsMe.join(",");
    if (key === liveKey) return;
    liveKey = key;
    stopLive();
    stopLive = () => {};
    // Artık görmediğim (güveni kaldıran, arkadaşlıktan çıkan ya da gizlediğim) arkadaşın verisi listeden kalkar
    for (const uid of liveIds) if (!trustsMe.includes(uid)) invoke("team_remote_set", { key: uid, fuel: null }).catch(() => {});
    liveIds = trustsMe;
    const put = (uid: string, d: LiveData | null | undefined) => {
      if (!d || !liveIds.includes(uid)) return;
      const f = friends.find((x) => x.friend_id === uid);
      invoke("team_remote_set", { key: uid, fuel: { ...d, sender: d.sender || f?.display_name || "?" } }).catch(() => {});
    };
    stopLive = await onLive(trustsMe, put);
    syncWatch();
    // İlk durum: şu an paylaşan arkadaşların son verisi (Realtime sadece sonraki değişiklikleri getirir)
    try {
      for (const s of (await friendShares()) ?? []) if (s.live) put(s.friend_id, s.data);
    } catch {
      /* eski sunucu (c44 yok): veri ilk Realtime olayıyla gelir */
    }
  };
  // Ayarlar ekranından: güven listesi değişti -> hemen yenile
  listen("social-refresh", () => void refreshFriends());
  // iRacing hesabı: iRacing'e bağlanınca oturumdaki üye no ve ad hesaba kendiliğinden yazılır
  // (hesapta iRacing bilgisi yoksa ya da farklı bir iRacing hesabı açıksa; oturum başına bir kez)
  let linkedFor = "";
  setInterval(async () => {
    const s = status();
    const uid = session()?.user.id;
    if (!uid || !driving() || !s || !(s.userId > 0) || (s.sim && s.sim !== "iracing")) return;
    // Kendi iRating / lisans / ülke bilgim profilime (c56; sadece değişince, kendi içinde sınırlı)
    void syncIracingStats();
    const key = `${uid}:${s.userId}`;
    if (linkedFor === key) return;
    linkedFor = key;
    try {
      const rows = await api<{ iracing_id: number | null; iracing_name: string | null }[]>("GET", `profiles?id=eq.${uid}&select=iracing_id,iracing_name`);
      const p = rows?.[0];
      if (p && (p.iracing_id !== s.userId || p.iracing_name !== s.userName)) {
        await api("PATCH", `profiles?id=eq.${uid}`, { body: { iracing_id: s.userId, iracing_name: s.userName } });
      }
    } catch {
      linkedFor = "";
    }
  }, 20_000);

  setTimeout(refreshFriends, 4000);
  setInterval(refreshFriends, 120_000);

  // Yarışırken canlı verimi gönder (sadece PRO isem ve güvendiğim en az bir arkadaş varsa, 10 sn'de bir, yalnızca bakan varken).
  // Veri paylaşımı PRO üyelere özel; PRO olmayan, onu güvenilir seçen PRO arkadaşının verisini görebilir.
  let lastPush = 0;
  listen<LiveData>("team-fuel-local", (e) => {
    // Ekip (c53): ekibimde izleyen varsa veri paylaşımı kapalı / PRO olmasa da gönderilir (sadece ekip görür)
    // Yalnızca bakan varken: güvendiğim bir arkadaş "bakıyorum" demişse (lv:<ben>, 20 sn'de bir) ya da pit duvarımı izleyen varsa
    const share = !proLocked("social.data_share") && Date.now() - lvAt < 50_000 && friends.some((f) => f.status === "accepted" && (f.trusted || trustAll));
    const crew = crewWatching() ? crewLiveExtra() : null;
    // Sürücü değilken (izleyici / spotter / tekrar) veri gönderilmez: sunucu taze live_data'yı "yarışta" sayar (c75)
    if (!session() || !driving() || (!share && !crew)) return;
    const now = Date.now();
    if (now - lastPush < 10_000) return;
    lastPush = now;
    const s = status();
    pushLive({ ...e.payload, track: s?.track ?? "", session: s?.sessionType ?? "", ...(crew ? { crew } : {}) }, !share);
  });

  // Takım odaları: sessize alınmamış odadaki yeni mesaj açılır pencere / oyun içi bildirim + ses
  let stopTeams: () => void = () => {};
  let teamKey = "";
  const senderName = async (team: string, user: string | null) => {
    if (!user) return "?";
    let names = teamNames.get(team);
    if (!names || !names.has(user)) {
      try {
        const p = await teamProfile(team);
        names = new Map((p?.members ?? []).map((x) => [x.user_id, x.display_name]));
        teamNames.set(team, names);
      } catch {
        /* ad alınamadı */
      }
    }
    return names?.get(user) ?? "?";
  };
  async function subscribeTeams() {
    const key = teams.map((x) => x.team_id).sort().join(",");
    if (key === teamKey) return;
    teamKey = key;
    stopTeams();
    stopTeams = () => {};
    if (!key) return;
    stopTeams = await onTeamChat(key.split(","), {
      message: (m, kind) => {
        const me = session()?.user.id;
        // Mesajlar overlay'i (sessize alınan odalar dahil; ayarına göre süzer). Rahatsız etme açıkken gönderilmez.
        if (kind === "insert" && !soc().dnd) {
          const tm0 = teams.find((x) => x.team_id === m.team_id);
          if (tm0) void senderName(m.team_id, m.sender).then((who) => broadcastOvMsg(teamOv(m, tm0, who, m.sender === me)));
        }
        if (kind !== "insert" || m.sender === me) return;
        const tm = teams.find((x) => x.team_id === m.team_id);
        if (!tm || tm.muted || soc().dnd) {
          if (tm && !tm.muted && racing() && soc().dnd) setPending(pending() + 1);
          return;
        }
        void (async () => {
          const who = await senderName(m.team_id, m.sender);
          const body = m.poll_id ? `${who}: 📊 ${emojify(m.body)}` : `${who}: ${emojify(msgPreview(m))}`;
          if (racing()) {
            // Mesajlar overlay'i bu mesajı gösteriyorsa alt köşedeki kutu ayrıca çıkmaz
            if (!ovMsgShown(teamOv(m, tm, who, false))) setToast({ id: m.id, from: `[${tm.tag}] ${tm.name}`, body });
            messageBeep();
            setTimeout(() => setToast((x) => (x?.id === m.id ? null : x)), 7000);
            return;
          }
          if (chatFront() === teamChatKey(tm.team_id) || (await chatVisible())) return;
          void popup("team", { friend_id: teamChatKey(tm.team_id), display_name: `[${tm.tag}] ${tm.name}` }, body, m.id, {
            color: tm.color,
            photo: teamLogo(tm.logo_path),
          });
          invoke("chat_window_notify", { friend: teamChatKey(tm.team_id) }).catch(() => {});
          messageBeep();
        })();
      },
    });
  }

  // Grup sohbetleri (c45): takım odası gibi — sessize alınmamış gruptaki yeni mesaj açılır pencere / oyun içi bildirim + ses.
  // Sistem satırları (eklendi, ayrıldı, arka plan değişti) bildirim üretmez.
  let stopGroups: () => void = () => {};
  let groupKey = "";
  async function subscribeGroups() {
    const key = groups.map((x) => x.group_id).sort().join(",");
    if (key === groupKey) return;
    groupKey = key;
    stopGroups();
    stopGroups = () => {};
    if (!key) return;
    stopGroups = await onGroupChat(key.split(","), (m, kind) => {
      const me = session()?.user.id;
      if (kind !== "insert" || m.meta || m.deleted) return;
      const g = groups.find((x) => x.group_id === m.group_id);
      if (!g) return;
      void (async () => {
        let who = friends.find((x) => x.friend_id === m.sender)?.display_name ?? "";
        if (!who && m.sender && m.sender !== me) {
          who = (await api<{ display_name: string }[]>("GET", `profiles_public?id=eq.${m.sender}&select=display_name`).catch(() => null))?.[0]?.display_name ?? "?";
        }
        const look = friendLook(m.sender ?? "");
        const ov: OvMsg = {
          id: `g-${m.id}`,
          kind: "team",
          from: m.sender ?? "",
          peer: g.group_id,
          name: m.sender === me ? "" : who,
          color: look.color,
          photo: look.photo || undefined,
          team: g.name,
          body: emojify(m.body),
          mine: m.sender === me,
          ts: Date.now(),
        };
        // Mesajlar overlay'i (takım mesajları gibi süzülür). Rahatsız etme açıkken gönderilmez.
        if (!soc().dnd) broadcastOvMsg(ov);
        if (m.sender === me) return;
        if (g.muted || soc().dnd) {
          if (!g.muted && racing() && soc().dnd) setPending(pending() + 1);
          return;
        }
        const body = `${who}: ${emojify(m.body)}`;
        if (racing()) {
          if (!ovMsgShown(ov)) setToast({ id: m.id, from: g.name, body });
          messageBeep();
          setTimeout(() => setToast((x) => (x?.id === m.id ? null : x)), 7000);
          return;
        }
        if (chatFront() === groupChatKey(g.group_id) || (await chatVisible())) return;
        void popup("group", { friend_id: groupChatKey(g.group_id), display_name: g.name }, body, m.id, { color: hashColor(g.group_id), photo: "" });
        invoke("chat_window_notify", { friend: groupChatKey(g.group_id) }).catch(() => {});
        messageBeep();
      })();
    });
  }

  // Mesajlar. Gelen mesajın bildirimi (açılır pencere / oyun içi kutu / ses / tepsi işareti) yalnızca burada,
  // uygulama açık olduğu sürece yaşayan overlay penceresinde üretilir; panel ve Arkadaşlar penceresi sadece
  // kendi listelerini günceller. Kaynak: Realtime (anında) + arkadaş listesi yoklaması (kaçan mesaj için yedek).
  const notified = new Set<string>();
  const notifyMessage = (m: Message, via: "realtime" | "yoklama") => {
    if (!m?.id || notified.has(m.id)) return;
    if (notified.size > 500) notified.clear();
    notified.add(m.id);
    const f = friends.find((x) => x.friend_id === m.sender);
    const tag = `mesaj ${m.id.slice(0, 8)} (${via})`;
    const dnd = soc().dnd;
    // Mesajlar overlay'i: arkadaşa özel bildirim kapatma dikkate alınmaz (overlay kendi seçili kişilerine göre süzer)
    const ov = friendOv(m, f?.display_name ?? "?");
    if (!f?.muted && !dnd && soc().acceptMessages) broadcastOvMsg(ov);
    if (f?.muted) return socialLog(`${tag}: bildirim yok (arkadas sessize alinmis)`);
    // Rahatsız etme: açılır pencere, ses ve tepsi işareti yok; yarışta sadece alt köşedeki sayaç artar
    if (dnd) {
      if (racing()) setPending(pending() + 1);
      return socialLog(`${tag}: bildirim yok (rahatsiz etme acik)`);
    }
    if (racing()) {
      // Yarışta: oyun içi kutu (Mesajlar overlay'i bu mesajı gösteriyorsa kutu ayrıca çıkmaz) + ses
      const box = !f?.notify_muted && !ovMsgShown(ov);
      if (box) setToast({ id: m.id, from: f?.display_name ?? "?", body: emojify(msgPreview(m)) });
      const snd = !f?.sound_muted;
      if (snd) messageBeep();
      setTimeout(() => setToast((t) => (t?.id === m.id ? null : t)), 7000);
      return socialLog(`${tag}: yarista -> oyun ici kutu=${box} ses=${snd}`);
    }
    if (!soc().acceptMessages) return socialLog(`${tag}: bildirim yok (mesajlar kapali)`);
    if (f?.notify_muted) return socialLog(`${tag}: bildirim yok (arkadasin bildirimleri kapali)`);
    // Steam gibi sağ alt açılır pencere + ses. Yalnızca öndeki pencere zaten bu sohbeti gösteriyorsa çıkmaz
    // (panel önde ama başka bir sayfadaysa da çıkar: eskiden panel öndeyken hiç bildirim gelmiyordu).
    void (async () => {
      if (chatFront() === m.sender || (await focusedChat(m.sender)) === m.sender) return socialLog(`${tag}: bildirim yok (sohbet acik ve onde)`);
      // Yeni eklenen arkadaş listede henüz yoksa adını almak için listeyi yenile
      let who = f;
      if (!who) {
        await refreshFriends();
        who = friends.find((x) => x.friend_id === m.sender);
        if (who?.muted || who?.notify_muted) return socialLog(`${tag}: bildirim yok (arkadas sessize alinmis)`);
      }
      const snd = !who?.sound_muted;
      socialLog(`${tag}: acilir pencere isteniyor, ses=${snd}`);
      if (snd) messageBeep();
      void popup("message", who ?? { friend_id: m.sender, display_name: "?" }, emojify(msgPreview(m)), m.id);
      // Steam gibi: arkadaşın sohbet penceresi görev çubuğunda belirir ve yanıp söner (odak çalmaz; yarışta yapılmaz)
      invoke("chat_window_notify", { friend: m.sender }).catch(() => {});
    })();
  };
  // Yoklamada okunmamış sayısı artmış ama Realtime o mesajı getirmemiş (bağlantı kopuktu): en yeni mesajı bildir
  catchUp = async (ids) => {
    for (const id of ids.slice(0, 5)) {
      const list = await unreadFrom(id).catch(() => [] as Message[]);
      const fresh = list.filter((m) => !notified.has(m.id) && Date.now() - Date.parse(m.created_at) < 10 * 60_000);
      if (!fresh.length) continue;
      socialLog(`yoklama: ${fresh.length} mesaj Realtime ile gelmemis`);
      // Art arda kart yağmasın: en yenisi bildirilir, eskileri bildirilmiş sayılır
      for (const m of fresh.slice(1)) notified.add(m.id);
      notifyMessage(fresh[0], "yoklama");
    }
  };

  let stopMsg: () => void = () => {};
  let msgUser = "";
  let subState = "";
  /** Abonelik ne zamandır kurulu değil (0: kurulu) */
  let downSince = 0;
  const subscribeMessages = async () => {
    const uid = session()?.user.id ?? "";
    // Abonelik 90 sn'dir kurulamıyorsa (kanal hatası / zaman aşımı) baştan kur
    if (uid && uid === msgUser && downSince && Date.now() - downSince > 90_000) {
      socialLog("abonelik: 90 sn'dir kurulamadi, yeniden kuruluyor");
      msgUser = "";
    }
    if (uid === msgUser) return;
    msgUser = uid;
    stopMsg();
    stopMsg = () => {};
    subState = "";
    downSince = uid ? Date.now() : 0;
    if (!uid) return;
    const stop = await onMessages(
      (m) => {
        socialLog(`mesaj ${String(m?.id).slice(0, 8)} geldi (realtime)`);
        if (notified.has(m.id)) return;
        // Tepsi simgesindeki okunmamış işareti (sohbet açıksa "social-read" hemen geri alır)
        if (friends.some((x) => x.friend_id === m.sender)) {
          friends = friends.map((x) => (x.friend_id === m.sender ? { ...x, unread: (x.unread || 0) + 1 } : x));
          syncTray();
        } else {
          window.setTimeout(() => void refreshUnread(), 3000);
        }
        notifyMessage(m, "realtime");
      },
      (st) => {
        if (uid !== msgUser || st === subState) return;
        const was = subState;
        subState = st;
        socialLog(`abonelik: ${st}`);
        if (st === "NO_CLIENT") {
          // Oturum anahtarı alınamadı (ör. açılışta ağ yok): sonraki denemede yeniden kur
          msgUser = "";
        } else if (st === "SUBSCRIBED") {
          downSince = 0;
          // Kopukluktan sonra: arada gelen mesajları yakala
          if (was) void refreshUnread();
        } else if (!downSince) {
          downSince = Date.now();
        }
      },
    );
    if (uid !== msgUser) stop();
    else stopMsg = stop;
  };
  subscribeMessages();
  setInterval(subscribeMessages, 30_000);

  // Rust tarafındaki saat (15 sn): overlay penceresi gizliyken tarayıcı zamanlayıcıları kısıldığı için
  // Realtime bağlantısı ve abonelik buradan canlı tutulur
  invoke("social_tick_start").catch(() => {});
  listen("social-tick", () => {
    void realtimeKeepAlive();
    void subscribeMessages();
  });
}
