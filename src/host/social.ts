// Overlay penceresinde (uygulama açık olduğu sürece çalışır) arkadaş listesi işleri:
//  - durumumu (çevrimiçi / yarışta, rahatsız etme) arkadaşlara bildir
//  - yarışırken canlı verimi (yakıt vb.) güvendiğim arkadaşlara gönder
//  - bana güvenen arkadaşların verisini Yakıt overlay'i / Pitwall takım bölümüne ekle
//  - yarıştayken gelen mesajları ekranda göster ve ses çal (rahatsız etme açıksa sadece alt köşede sayaç)

import { createSignal, type Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cloudEnabled, session } from "@/cloud/supabase";
import { settings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import type { Status } from "@/sdk/types";
import { messageBeep, myFriends, onLive, onMessages, pushLive, setMyStatus, type Friend, type LiveData } from "@/cloud/social";

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
      friends = (await myFriends()) ?? [];
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
  setTimeout(refreshFriends, 4000);
  setInterval(refreshFriends, 2 * 60_000);

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
      if (!racing()) return; // yarışta değilken panel gösterir
      const f = friends.find((x) => x.friend_id === m.sender);
      if (soc().dnd) {
        setPending(pending() + 1);
        return;
      }
      setToast({ id: m.id, from: f?.display_name ?? "?", body: m.body });
      if (soc().sound) messageBeep();
      setTimeout(() => setToast((t) => (t?.id === m.id ? null : t)), 7000);
    });
  };
  subscribeMessages();
  setInterval(subscribeMessages, 30_000);
}
