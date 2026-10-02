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
  pushLive,
  setMyStatus,
  shareTrustGet,
  type Friend,
  type LiveData,
  type MsgMeta,
  type ToastPayload,
} from "@/cloud/social";
import { myTeams, onTeamChat, teamChatKey, teamLogo, teamProfile, type MyTeam } from "@/cloud/teams";
import { groupChatKey, myGroups, onGroupChat, type MyGroup } from "@/cloud/groups";
import { broadcastOvMsg, ovMsgShown, OVMSG_CLEAR_EVENT, type OvMsg } from "@/sdk/ovmsg";

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
  } catch {
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
  const soc = () => settings().general.social;

  // Durum: 45 sn'de bir ve yarış durumu değişince
  let lastKey = "";
  const pushStatus = (force = false) => {
    if (!session()) return;
    const s = status();
    const st = {
      racing: racing(),
      track: racing() ? s?.track ?? "" : "",
      car: racing() ? s?.carName ?? "" : "",
      session: racing() ? s?.sessionType ?? "" : "",
      dnd: soc().dnd,
      accept_messages: soc().acceptMessages,
      // Arkadaş listesinde "iRacing'de" rozeti (PRO gerekmez; canlı veri değil, sadece oyun)
      sim: racing() && SIM_IDS.includes(s?.sim ?? "") ? s!.sim! : racing() && !s?.sim ? "iracing" : "",
    };
    const key = JSON.stringify(st);
    if (!force && key === lastKey) return;
    lastKey = key;
    setMyStatus(st);
  };
  setInterval(() => pushStatus(true), 45_000);

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
    if (hiddenKey() !== lastHidden) {
      lastHidden = hiddenKey();
      void applyLive();
    }
    // Yarış bitince alt köşedeki sayaç kalkar (mesajlar panelde okunur)
    if (!racing() && pending()) setPending(0);
  }, 3000);

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
      friends = got;
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
              if (soc().sound && !f.sound_muted) messageBeep();
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
    if (!uid || !racing() || !s || !(s.userId > 0) || (s.sim && s.sim !== "iracing")) return;
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
  setInterval(refreshFriends, 60_000);

  // Yarışırken canlı verimi gönder (sadece PRO isem ve güvendiğim en az bir arkadaş varsa, 3 sn'de bir).
  // Veri paylaşımı PRO üyelere özel; PRO olmayan, onu güvenilir seçen PRO arkadaşının verisini görebilir.
  let lastPush = 0;
  listen<LiveData>("team-fuel-local", (e) => {
    if (!session() || proLocked("social.data_share") || !friends.some((f) => f.status === "accepted" && (f.trusted || trustAll))) return;
    const now = Date.now();
    if (now - lastPush < 3000) return;
    lastPush = now;
    const s = status();
    pushLive({ ...e.payload, track: s?.track ?? "", session: s?.sessionType ?? "" });
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
            if (soc().sound) messageBeep();
            setTimeout(() => setToast((x) => (x?.id === m.id ? null : x)), 7000);
            return;
          }
          if (await chatVisible()) return;
          void popup("team", { friend_id: teamChatKey(tm.team_id), display_name: `[${tm.tag}] ${tm.name}` }, body, m.id, {
            color: tm.color,
            photo: teamLogo(tm.logo_path),
          });
          if (soc().sound) messageBeep();
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
          who = (await api<{ display_name: string }[]>("GET", `profiles?id=eq.${m.sender}&select=display_name`).catch(() => null))?.[0]?.display_name ?? "?";
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
          if (soc().sound) messageBeep();
          setTimeout(() => setToast((x) => (x?.id === m.id ? null : x)), 7000);
          return;
        }
        if (await chatVisible()) return;
        void popup("group", { friend_id: groupChatKey(g.group_id), display_name: g.name }, body, m.id, { color: hashColor(g.group_id), photo: "" });
        if (soc().sound) messageBeep();
      })();
    });
  }

  // Mesajlar: yarıştayken ekranda göster
  let stopMsg: () => void = () => {};
  let msgUser = "";
  const subscribeMessages = async () => {
    const uid = session()?.user.id ?? "";
    if (uid === msgUser) return;
    msgUser = uid;
    stopMsg();
    if (!uid) return;
    stopMsg = await onMessages((m) => {
      const f = friends.find((x) => x.friend_id === m.sender);
      // Mesajlar overlay'i: arkadaşa özel bildirim kapatma dikkate alınmaz (overlay kendi seçili kişilerine göre süzer)
      const ov = friendOv(m, f?.display_name ?? "?");
      if (!f?.muted && !soc().dnd && soc().acceptMessages) broadcastOvMsg(ov);
      // Steam gibi sağ alt açılır pencere: panel ya da Arkadaşlar penceresi önde değilken (öndeyse
      // mesajı zaten o gösterir ve sesi o çalar); sessize alınan arkadaştan, mesajlar kapalıyken ve
      // rahatsız etme açıkken gelmez; yarıştayken bunun yerine oyun içi bildirim gösterilir
      if (!racing() && !soc().dnd && soc().acceptMessages && !f?.muted && !f?.notify_muted) {
        void (async () => {
          if (await chatVisible()) return;
          // Yeni eklenen arkadaş listede henüz yoksa adını almak için listeyi yenile
          let who = f;
          if (!who) {
            await refreshFriends();
            who = friends.find((x) => x.friend_id === m.sender);
            if (who?.muted || who?.notify_muted) return;
          }
          void popup("message", who ?? { friend_id: m.sender, display_name: "?" }, emojify(msgPreview(m)), m.id);
          if (soc().sound && !who?.sound_muted) messageBeep();
        })();
      }
      if (f?.muted || !racing()) return; // yarışta değilken panel gösterir
      if (soc().dnd) {
        setPending(pending() + 1);
        return;
      }
      if (!f?.notify_muted && !ovMsgShown(ov)) setToast({ id: m.id, from: f?.display_name ?? "?", body: emojify(msgPreview(m)) });
      if (soc().sound && !f?.sound_muted) messageBeep();
      setTimeout(() => setToast((t) => (t?.id === m.id ? null : t)), 7000);
    });
  };
  subscribeMessages();
  setInterval(subscribeMessages, 30_000);
}
