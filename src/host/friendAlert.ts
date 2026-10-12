// Arkadaş Uyarısı: atanan tuşa / direksiyon düğmesine basınca (Rust: voicecmd.rs "friend-alert-press") aynı yarıştaki
// arkadaşların ekranında "DİKKAT" uyarısı yanıp söner (overlay: src/overlays/friendalert).
//
// Aynı yarış: arkadaşın simdeki adı (profildeki iracing_name; program her sürüşte günceller) bağlı oturumun sürücü
// listesinde var (Rust: session_driver_names). Uyarı Realtime BROADCAST ile gider (veritabanına yazılmaz): her üye kendi
// `falert:<üye id>` kanalını dinler. Yayın kanalları yetkilendirilmediği için alıcı, gönderenin kabul edilmiş
// (susturulmamış) arkadaşı ve aynı oturumda olduğunu kendisi denetler.
//
// Ana overlay penceresinde bir kez çalışır (Host.tsx).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Accessor } from "solid-js";
import { session } from "@/cloud/supabase";
import { castLink, castOnce, myFriends, type CastLink, type Friend } from "@/cloud/social";
import type { Status } from "@/sdk/types";
import { overlayKey, proLocked } from "@/sdk/proFeatures";

export const FRIEND_ALERT_SHOW = "friend-alert-show";
export interface FriendAlertShow {
  /** Gönderenin adı (arkadaş listesindeki görünen ad) */
  name: string;
  /** Kendi gönderdiğim uyarının önizlemesi (demo) */
  self?: boolean;
}

const EVENT = "alert";
const chan = (uid: string) => `falert:${uid}`;
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

let started = false;

export function startFriendAlert(status: Accessor<Status | undefined>) {
  if (started) return;
  started = true;

  // Arkadaş listesi önbelleği (en çok 2 dk eski)
  let friends: Friend[] = [];
  let friendsAt = 0;
  const loadFriends = async (force = false) => {
    if (!session()) return [];
    if (force || Date.now() - friendsAt > 120_000) {
      try {
        friends = await myFriends();
        friendsAt = Date.now();
      } catch {
        /* son liste kalır */
      }
    }
    return friends;
  };
  const driverNames = async () => {
    try {
      return new Set((await invoke<string[]>("session_driver_names")).map(norm));
    } catch {
      return new Set<string>();
    }
  };
  /** Aynı oturumdaki kabul edilmiş arkadaşlar */
  const inMyRace = async (force = false) => {
    const [list, names] = await Promise.all([loadFriends(force), driverNames()]);
    if (!names.size) return [];
    return list.filter((f) => f.status === "accepted" && !!f.iracing_name && names.has(norm(f.iracing_name)));
  };

  // ---- Gönder ----
  let lastSend = 0;
  void listen("friend-alert-press", async () => {
    const st = status();
    if (st?.demo) {
      // Demo: overlay'in nasıl göründüğünü dene
      void emit(FRIEND_ALERT_SHOW, { name: "SRTR Pitwall", self: true } satisfies FriendAlertShow);
      return;
    }
    const me = session()?.user.id;
    if (!me) {
      void invoke("osd_push", { key: "friendAlertLogin" }).catch(() => {});
      return;
    }
    // PRO overlay: göndermek de PRO ister (alıcıda overlay kilitliyse zaten görünmez)
    if (proLocked(overlayKey("friendalert"))) {
      void invoke("osd_push", { key: "friendAlertPro" }).catch(() => {});
      return;
    }
    if (Date.now() - lastSend < 1500) return;
    lastSend = Date.now();
    const targets = await inMyRace(true);
    if (!targets.length) {
      void invoke("osd_push", { key: "friendAlertNone" }).catch(() => {});
      return;
    }
    // Alıcı gönderenin adını kendi arkadaş listesinden alır (yükteki ada güvenilmez)
    const sent = await Promise.all(targets.map((f) => castOnce(chan(f.friend_id), EVENT, { from: me, ts: Date.now() })));
    const n = sent.filter(Boolean).length;
    void invoke("osd_push", { key: n ? "friendAlertSent" : "friendAlertFail" }).catch(() => {});
  });

  // ---- Al ----
  let link: CastLink | null = null;
  let linkFor = "";
  const ensureLink = () => {
    const me = session()?.user.id ?? "";
    if (me === linkFor) return;
    link?.close();
    link = null;
    linkFor = me;
    if (!me) return;
    link = castLink(chan(me), EVENT, async (p: { from?: string; ts?: number } | undefined) => {
      const from = String(p?.from ?? "");
      if (!from || from === me) return;
      // Eski (gecikmiş) uyarı gösterilmez
      if (typeof p?.ts === "number" && Math.abs(Date.now() - p.ts) > 30_000) return;
      let f = (await loadFriends()).find((x) => x.friend_id === from);
      if (!f) f = (await loadFriends(true)).find((x) => x.friend_id === from);
      if (!f || f.status !== "accepted" || f.muted) return;
      // Gönderen gerçekten bu oturumda mı (adı sürücü listesinde)
      const names = await driverNames();
      if (!names.size || !f.iracing_name || !names.has(norm(f.iracing_name))) return;
      void emit(FRIEND_ALERT_SHOW, { name: f.display_name || f.iracing_name || "" } satisfies FriendAlertShow);
    });
  };
  ensureLink();
  setInterval(ensureLink, 5000);
}
