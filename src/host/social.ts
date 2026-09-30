// Overlay penceresinde (uygulama açık olduğu sürece çalışır) arkadaş listesi işleri:
//  - durumumu (çevrimiçi / yarışta, rahatsız etme) arkadaşlara bildir
//  - yarışırken canlı verimi (yakıt vb.) güvendiğim arkadaşlara gönder
//  - bana güvenen arkadaşların verisini Yakıt overlay'i / Pitwall takım bölümüne ekle
//  - yarıştayken gelen mesajları ekranda göster ve ses çal (rahatsız etme açıksa sadece alt köşede sayaç)

import { createSignal, type Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, cloudEnabled, session } from "@/cloud/supabase";
import { settings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import type { Status } from "@/sdk/types";
import { osNotify } from "@/cloud/notify";
import { t } from "@/sdk/i18n";
import {
  emojify,
  friendLook,
  messageBeep,
  myFriends,
  onLive,
  onMessages,
  pushLive,
  setMyStatus,
  type Friend,
  type LiveData,
  type ToastPayload,
} from "@/cloud/social";

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
let started = false;

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
async function popup(kind: ToastPayload["kind"], f: Pick<Friend, "friend_id" | "display_name">, body: string, id?: string) {
  const look = friendLook(f.friend_id);
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
    };
    const key = JSON.stringify(st);
    if (!force && key === lastKey) return;
    lastKey = key;
    setMyStatus(st);
  };
  setInterval(() => pushStatus(true), 45_000);
  setInterval(() => {
    pushStatus(false);
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
      friends = (await myFriends()) ?? [];
      // Açılır pencere: beni güvenilir seçen ya da istek gönderen yeni arkadaş (yarıştayken oyun içi bildirim)
      if (prev.length && !soc().dnd) {
        for (const f of friends) {
          const was = prev.find((x) => x.friend_id === f.friend_id);
          let text = "";
          let kind: ToastPayload["kind"] = "request";
          if (f.status === "accepted" && f.trusts_me && !f.muted && !was?.trusts_me) {
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
              if (soc().sound) messageBeep();
            });
          }
        }
      }
      // Kabul edilen arkadaşlar panel kapalıyken de renk/simge listesine eklenir
      syncAccountFriends(friends);
    } catch {
      return;
    }
    // Bana güvenen arkadaşların verisini dinle -> takım bölümüne
    const trustsMe = friends.filter((f) => f.status === "accepted" && f.trusts_me).map((f) => f.friend_id);
    const key = trustsMe.join(",");
    if (key !== liveKey) {
      liveKey = key;
      stopLive();
      stopLive = await onLive(trustsMe, (uid, d) => {
        const f = friends.find((x) => x.friend_id === uid);
        invoke("team_remote_set", { key: uid, fuel: { ...d, sender: d.sender || f?.display_name || "?" } }).catch(() => {});
      });
    }
  };
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

  // Yarışırken canlı verimi gönder (sadece güvendiğim en az bir arkadaş varsa, 3 sn'de bir)
  let lastPush = 0;
  listen<LiveData>("team-fuel-local", (e) => {
    if (!session() || !friends.some((f) => f.status === "accepted" && f.trusted)) return;
    const now = Date.now();
    if (now - lastPush < 3000) return;
    lastPush = now;
    const s = status();
    pushLive({ ...e.payload, track: s?.track ?? "", session: s?.sessionType ?? "" });
  });

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
      // Steam gibi sağ alt açılır pencere: panel ya da Arkadaşlar penceresi önde değilken (öndeyse
      // mesajı zaten o gösterir ve sesi o çalar); sessize alınan arkadaştan, mesajlar kapalıyken ve
      // rahatsız etme açıkken gelmez; yarıştayken bunun yerine oyun içi bildirim gösterilir
      if (!racing() && !soc().dnd && soc().acceptMessages && !f?.muted) {
        void (async () => {
          if (await chatVisible()) return;
          // Yeni eklenen arkadaş listede henüz yoksa adını almak için listeyi yenile
          let who = f;
          if (!who) {
            await refreshFriends();
            who = friends.find((x) => x.friend_id === m.sender);
            if (who?.muted) return;
          }
          void popup("message", who ?? { friend_id: m.sender, display_name: "?" }, emojify(m.body), m.id);
          if (soc().sound) messageBeep();
        })();
      }
      if (f?.muted || !racing()) return; // yarışta değilken panel gösterir
      if (soc().dnd) {
        setPending(pending() + 1);
        return;
      }
      setToast({ id: m.id, from: f?.display_name ?? "?", body: emojify(m.body) });
      if (soc().sound) messageBeep();
      setTimeout(() => setToast((t) => (t?.id === m.id ? null : t)), 7000);
    });
  };
  subscribeMessages();
  setInterval(subscribeMessages, 30_000);
}
