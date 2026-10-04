// Arkadaş listesi (iRacing'deki sağ alt köşe listesi gibi): çevrimiçi / yarışta durumu, istekler,
// anlık mesajlar, güvenilir işaretleme (verilerimi görebilir) ve yarıştaki arkadaşın canlı verisi.
// Sadece giriş yapanlara görünür. Mesajlaşmak herkese açık; mesajı/sohbeti kendi görünümünden silme ve
// gelen mesajı raporlama sağ tıkla. Veri paylaşımı (güvenilir işaretleme) ve arkadaş görünümünü özelleştirme PRO.

import { Portal } from "solid-js/web";
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { settings, updateSettings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import { inTauri } from "@/sdk/platform";
import { cloudEnabled, session } from "@/cloud/supabase";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "./ProLock";
import {
  EMOJI_PICKS,
  MESSAGE_REPORT_REASONS,
  clearConversation,
  conversation,
  emojiOnly,
  emojiParts,
  emojify,
  emojifyTyped,
  findPeople,
  friendLook,
  friendRemove,
  friendRequest,
  friendRespond,
  friendSet,
  friendTrust,
  hashColor,
  hideMessage,
  initialOf,
  markRead,
  messageBeep,
  chatOpenKey,
  msgPreview,
  myFriends,
  onMessages,
  recentMessages,
  reportMessage,
  sendMessage,
  setFriendPrefs,
  type Friend,
  type Message,
  type Person,
} from "@/cloud/social";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { editFriendLook, go } from "../ui";
import * as I from "../icons";
import Wrench from "lucide-solid/icons/wrench";
import Smile from "lucide-solid/icons/face-slightly-smiling";
import SendHorizontal from "lucide-solid/icons/send-horizontal";
import Wallpaper from "lucide-solid/icons/wallpaper";
import { SimBadge, SIM_SHORT } from "./Profile";
import { TeamChat, TeamLogo, type TeamEvent } from "./TeamChat";
import { crewDrivers, crewList as myCrewList, setCrewFocus, type CrewMember } from "@/cloud/crew";
import { muteTeamChat, myTeams, onTeamChat, setTeamFocus, type MyTeam, type TeamMessage } from "@/cloud/teams";
import { ChatStage, chatLookClass, chatLookStyle } from "../chatLook";
import { BgNote, ConvBgPanel, ConvBgRequest, adoptBg, useConvBg } from "./ConvBg";
import { MsgMenu, msgClickOpens, msgMenuPos } from "./MsgMenu";
import { GroupAvatar, GroupChat, NewGroup, type GroupEvent, type GroupPanel } from "./GroupChat";
import { deleteGroup, leaveGroup, muteGroup, myGroups, onGroupChat, type GroupMessage, type MyGroup } from "@/cloud/groups";
import { clearRoomBg } from "@/cloud/chatBg";
import { broadcastOvMsg } from "@/sdk/ovmsg";
import "../friends.css";
import "../teams.css";

type View =
  | { kind: "list" }
  | { kind: "chat"; f: Friend }
  | { kind: "add" }
  | { kind: "team"; t: MyTeam }
  | { kind: "group"; g: MyGroup }
  | { kind: "newgroup" };
type Presence = "racing" | "online" | "dnd" | "offline" | "pending" | "hidden";

/** Pencere dışından (ayrı arkadaş penceresi) panele yönlendirme */
function panelGo(what: { sec?: string; sub?: string; friend?: string; team?: string; crew?: string; tele?: string }) {
  invoke("panel_front").catch(() => {});
  setTimeout(() => emit("panel-go", what).catch(() => {}), 400);
}

/**
 * Arkadaşın Ekip Pitwall'ını ayrı pencerede aç (crew_window_open). Program dışında (tarayıcı) ya da komut
 * yoksa / hata verirse verilen yedek (panel içi gezinme) çalışır.
 */
export function openCrewWindow(owner: string, fallback: () => void) {
  if (!inTauri) return fallback();
  invoke("crew_window_open", { owner }).catch(() => fallback());
}

/** Arkadaşın canlı verisini ayrı pencerede aç */
export function openFriendWindow(f: Friend) {
  invoke("window_open", { view: `friend:${f.friend_id}` }).catch(() => {});
}

export interface Nav {
  pro: () => void;
  look: (id: string) => void;
  /** Takımlar sayfasında takımı aç */
  team: (id: string) => void;
  /** Sürücüler › Ekip sayfasında bu sürücünün panelini aç */
  crew: (id: string) => void;
  /** Telemetri sayfasında bu üyenin profilini aç (telemetrisi gizli / boş olsa da profil görünür) */
  profile: (id: string) => void;
}

/** Sohbet okundu: sunucuya yaz, sonra overlay penceresindeki servise bildir (tepsi simgesindeki okunmamış işareti kalkar) */
function markReadSync(id: string) {
  void markRead(id).then(() => {
    if (inTauri) emit("social-read", id).catch(() => {});
  });
}

function presence(f: Friend): Presence {
  if (f.status !== "accepted") return "pending";
  // Sadece yöneticiye gelir: çevrimiçi ama "Çevrimdışı" durumunu seçmiş
  if (f.invisible) return "hidden";
  if (f.racing) return "racing";
  if (f.online) return f.dnd ? "dnd" : "online";
  return "offline";
}

/** Avatar: arkadaşa özel fotoğraf ya da baş harf (rengi Arkadaşlar sayfasındaki ayardan, yoksa kimlikten) */
export function Avatar(props: { id: string; name: string; size?: number; presence?: Presence }) {
  const look = () => friendLook(props.id);
  return (
    <span
      class="fav"
      classList={{ [`p-${props.presence}`]: !!props.presence }}
      style={{ "--sz": `${props.size ?? 36}px`, "--fc": look().color }}
    >
      <Show when={look().photo} fallback={<span data-no-i18n>{initialOf(props.name)}</span>}>
        <img src={look().photo} alt="" />
      </Show>
      <Show when={props.presence}>
        <i class="fav-dot" />
      </Show>
    </span>
  );
}

/** Mesaj metni: ifadeler emojiye çevrilir, emojiler biraz büyük */
export function MsgText(props: { text: string }) {
  return <For each={emojiParts(emojify(props.text))}>{(p) => (p.emo ? <span class="emo">{p.t}</span> : p.t)}</For>;
}

const COLLAPSE_KEY = "pitwall.friends.collapsed";
function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

/** Veri paylaşımı kuralı (menü ipuçlarında ve kilitli düğmelerde) */
export const SHARE_PRO_HINT = "Veri paylaşımı PRO üyelere özel; PRO bir arkadaşın seni güvenilir yaparsa onun verilerini görebilirsin.";

const norm = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Arkadaş listesi paneli: panelin sağ altındaki kutuda ya da ayrı "Arkadaşlar" penceresinde */
export function FriendsPanel(props: {
  standalone?: boolean;
  open: () => boolean;
  onClose?: () => void;
  racing?: () => boolean;
  onCounts?: (online: number, badge: number) => void;
  /** Açılışta gösterilecek sohbet (mesaj açılır penceresinden) */
  initialChat?: string;
}) {
  const nav: Nav = props.standalone
    ? { pro: () => panelGo({ sec: "pro" }), look: (id) => panelGo({ friend: id }), team: (id) => panelGo({ sec: "drivers", sub: "teams", team: id }), crew: (id) => panelGo({ sec: "drivers", sub: "crew", crew: id }), profile: (id) => panelGo({ tele: id }) }
    : { pro: () => go("pro"), look: (id) => editFriendLook(id), team: (id) => (setTeamFocus(id), go("drivers", "teams")), crew: (id) => (setCrewFocus(id), go("drivers", "crew")), profile: (id) => (void import("../pages/TelemetryPage").then((m) => m.openDriverTelemetry(id)), props.onClose?.()) };
  const [view, setView] = createSignal<View>({ kind: "list" });
  /** Profil: Telemetri sayfasındaki üye profili */
  const setProfileOf = (id: string) => nav.profile(id);
  const [last, setLast] = createSignal<Record<string, Message>>({});
  let lastList: Friend[] = [];
  const [list, { refetch, mutate }] = createResource<Friend[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        const uid = session()?.user.id;
        const [l, recent] = await Promise.all([myFriends(), recentMessages().catch(() => null)]);
        // Yanıt gelene kadar çıkış yapıldıysa / hesap değiştiyse önceki hesabın listesi yazılmaz
        if (session()?.user.id !== uid) return [];
        lastList = l ?? [];
        // "Mesajlarını kapat" menüden kalktı: eskiden sessize alınmış arkadaş görünmez biçimde sessiz kalmasın
        for (const f of lastList) {
          if (f.status === "accepted" && f.muted) {
            f.muted = false;
            void friendSet(f.friend_id, f.trusted, false).catch(() => {});
          }
        }
        // Kabul edilen arkadaşlar Arkadaşlar sayfasındaki listeye (renk/simge ayarıyla) otomatik eklenir
        syncAccountFriends(lastList);
        if (recent) {
          const me = session()?.user.id;
          const map: Record<string, Message> = {};
          for (const m of recent) {
            const other = m.sender === me ? m.recipient : m.sender;
            if (!map[other]) map[other] = m;
          }
          setLast(map);
        }
      } catch {
        /* çevrimdışı: son liste kalsın */
      }
      return lastList;
    },
  );
  // Takım odaları (takım sohbetleri): sunucu c30 yoksa boş
  let lastTeams: MyTeam[] = [];
  const [teamList, { refetch: refetchTeams, mutate: mutateTeams }] = createResource<MyTeam[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        lastTeams = await myTeams();
      } catch {
        /* çevrimdışı ya da takımlar yok */
      }
      return lastTeams;
    },
  );
  const teams = () => teamList() ?? [];
  // Ekibinde olduğum sürücüler (c53): arkadaş satırında "Ekip" düğmesi. Sunucu güncel değilse boş.
  let lastCrew: string[] = [];
  const [crewList, { refetch: refetchCrew }] = createResource<string[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        lastCrew = (await crewDrivers()).map((d) => d.owner_id);
      } catch {
        /* çevrimdışı ya da ekip yok */
      }
      return lastCrew;
    },
  );
  const crewOf = (id: string) => (crewList() ?? []).includes(id);
  // Benim ekibim (c53): arkadaşın sağ tık menüsündeki "Ekibime ekle" maddelerinin durumu
  let lastMine: CrewMember[] = [];
  const [mineCrew, { refetch: refetchMine, mutate: setMineCrew }] = createResource<CrewMember[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        lastMine = await myCrewList();
      } catch {
        /* çevrimdışı ya da sunucu güncel değil */
      }
      return lastMine;
    },
  );
  const crewRoleOf = (id: string): "view" | "control" | null => {
    const m = (mineCrew() ?? []).find((x) => x.member_id === id);
    return m ? (m.can_control ? "control" : "view") : null;
  };
  // Sohbet grupları (c45): sunucu güncel değilse boş
  let lastGroups: MyGroup[] = [];
  const [groupList, { refetch: refetchGroups, mutate: mutateGroups }] = createResource<MyGroup[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        lastGroups = await myGroups();
      } catch {
        /* çevrimdışı ya da gruplar yok */
      }
      return lastGroups;
    },
  );
  const chatGroups = () => groupList() ?? [];
  const curG = (g: MyGroup) => chatGroups().find((x) => x.group_id === g.group_id) ?? g;
  const groupG = () => {
    const v = view();
    return v.kind === "group" ? curG(v.g) : null;
  };
  const patchGroup = (id: string, fn: (g: MyGroup) => MyGroup) => mutateGroups(chatGroups().map((x) => (x.group_id === id ? fn(x) : x)));
  // Açık olan grup artık listede yoksa (çıkarıldım ya da grup silindi) listeye dön
  createEffect(() => {
    const v = view();
    if (v.kind === "group" && groupList() && !groupList.loading && !chatGroups().some((x) => x.group_id === v.g.group_id)) setView({ kind: "list" });
  });
  /** Grup sohbetinin üstündeki panel: üyeler / arka plan */
  const [groupPanel, setGroupPanel] = createSignal<GroupPanel>("none");
  const [err, setErr] = createSignal("");
  const friends = () => list() ?? [];
  const accepted = () => friends().filter((f) => f.status === "accepted");
  const online = () => accepted().filter((f) => f.online).length;
  const unread = () =>
    friends().reduce((a, f) => a + (f.unread || 0), 0) +
    teams().reduce((a, tm) => a + (tm.muted ? 0 : tm.unread || 0), 0) +
    chatGroups().reduce((a, g) => a + (g.muted ? 0 : g.unread || 0), 0);
  const requests = () => friends().filter((f) => f.status === "pending_in").length;
  createEffect(() => props.onCounts?.(online(), unread() + requests()));
  /** Görünümdeki arkadaşın en güncel hali (durum değişince başlık da güncellensin) */
  const cur = (f: Friend) => friends().find((x) => x.friend_id === f.friend_id) ?? f;
  const chatF = () => {
    const v = view();
    return v.kind === "chat" ? cur(v.f) : null;
  };
  /** Görünümdeki takımın en güncel hali */
  const curT = (tm: MyTeam) => teams().find((x) => x.team_id === tm.team_id) ?? tm;
  const teamT = () => {
    const v = view();
    return v.kind === "team" ? curT(v.t) : null;
  };
  const patchTeam = (id: string, fn: (tm: MyTeam) => MyTeam) => mutateTeams(teams().map((x) => (x.team_id === id ? fn(x) : x)));
  const noteLast = (m: Message) => {
    const me = session()?.user.id;
    const other = m.sender === me ? m.recipient : m.sender;
    setLast({ ...last(), [other]: m });
  };
  /** Mesaj silinince / sohbet temizlenince listedeki son mesaj önizlemesi */
  const setLastFor = (id: string, m: Message | null) => {
    const c = { ...last() };
    if (m) c[id] = m;
    else delete c[id];
    setLast(c);
  };
  // "Sohbeti temizle" onayı (başlıktaki düğme açar, sohbetin üstünde satır içi sorulur)
  const [clearAsk, setClearAsk] = createSignal(false);
  createEffect(on(view, () => setClearAsk(false), { defer: true }));
  // "Sohbet arka planı" paneli (başlıktaki düğme açar)
  const [bgAsk, setBgAsk] = createSignal(false);
  createEffect(on(view, () => (setBgAsk(false), setGroupPanel("none")), { defer: true }));

  // Liste açıkken 20 sn'de bir, kapalıyken 60 sn'de bir yenile
  onMount(() => {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (props.open() || n % 3 === 0) {
        refetch();
        refetchTeams();
        refetchGroups();
        if (n % 3 === 0) refetchCrew();
      }
    }, 20_000);
    onCleanup(() => clearInterval(iv));
  });
  createEffect(on(props.open, (o) => o && (setView({ kind: "list" }), refetch(), refetchTeams(), refetchGroups(), refetchCrew(), refetchMine()), { defer: true }));

  // Mesaj açılır penceresinden gelen "şu sohbeti aç" isteği
  const [wantChat, setWantChat] = createSignal(props.initialChat || "");
  if (props.standalone && inTauri) {
    const take = () =>
      invoke<string | null>("friends_take_chat")
        .then((id) => {
          // Mesaj kartı → o sohbet; istek kartı → liste (onay bekleyenler en üstte)
          if (id) setWantChat(id);
          else setView({ kind: "list" });
        })
        .catch(() => {});
    onMount(() => {
      take();
      let un: (() => void) | undefined;
      listen("friends-chat", take).then((u) => (un = u));
      onCleanup(() => un?.());
    });
  }
  createEffect(() => {
    const id = wantChat();
    if (!id) return;
    // Takım odası: "team:<takım id>"
    if (id.startsWith("team:")) {
      if (!teamList()) return;
      const tm = teams().find((x) => x.team_id === id.slice(5));
      setWantChat("");
      if (tm) setView({ kind: "team", t: tm });
      else refetchTeams();
      return;
    }
    // Grup sohbeti: "group:<grup id>"
    if (id.startsWith("group:")) {
      if (!groupList()) return;
      const g = chatGroups().find((x) => x.group_id === id.slice(6));
      setWantChat("");
      if (g) setView({ kind: "group", g });
      else refetchGroups();
      return;
    }
    if (!list()) return;
    const f = friends().find((x) => x.friend_id === id && x.status === "accepted");
    setWantChat("");
    if (f) setView({ kind: "chat", f });
  });

  // Bu pencerenin şu an gösterdiği özel sohbet (arkadaş servisi: pencere önde ve bu sohbet açıksa bildirim çıkarmaz)
  if (inTauri) {
    const key = chatOpenKey(props.standalone ? "friends" : "main");
    const put = (id: string) => {
      try {
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
      } catch {
        /* depo yok */
      }
    };
    createEffect(() => {
      const v = view();
      put(props.open() && v.kind === "chat" ? v.f.friend_id : "");
    });
    const clear = () => put("");
    window.addEventListener("pagehide", clear);
    onCleanup(() => (window.removeEventListener("pagehide", clear), clear()));
  }

  // Gelen mesajlar
  const [incoming, setIncoming] = createSignal<Message | null>(null);
  createEffect(
    on(
      () => session()?.user.id,
      (uid, _p, prev?: () => void) => {
        prev?.();
        if (!uid) return undefined;
        let stop = () => {};
        onMessages((m) => {
          setIncoming(m);
          noteLast(m);
          const v = view();
          const chatting = props.open() && v.kind === "chat" && v.f.friend_id === m.sender;
          if (!chatting) mutate(friends().map((f) => (f.friend_id === m.sender ? { ...f, unread: (f.unread || 0) + 1 } : f)));
          const fr = friends().find((f) => f.friend_id === m.sender);
          const muted = fr?.muted;
          // Programda özel mesajın bildirimi (açılır pencere + ses) tek yerden, overlay penceresindeki arkadaş
          // servisinden gelir (src/host/social.ts); burada çalınırsa ses iki kez duyulur. Tarayıcıda burada çalar.
          if (!inTauri && !props.racing?.() && !settings().general.social.dnd && !muted && !chatting) messageBeep();
        }).then((s) => (stop = s));
        const cleanup = () => stop();
        onCleanup(cleanup);
        return cleanup;
      },
    ),
  );

  // Takım odaları: yeni mesaj (okunmamış sayısı, ses), silinen mesaj, anket sayıları
  const [teamEvent, setTeamEvent] = createSignal<TeamEvent | null>(null);
  // Anahtar memo: sadece takım kümesi değişince yeniden abone olunur (her mesajda değil)
  const teamKey = createMemo(() => teams().map((x) => x.team_id).sort().join(","));
  createEffect(
    on(
      teamKey,
      (key) => {
        if (!key) return;
        let stop = () => {};
        let dead = false;
        onTeamChat(key.split(","), {
          message: (m, kind) => {
            setTeamEvent({ kind, m });
            const me = session()?.user.id;
            if (kind === "update") {
              if (m.deleted) patchTeam(m.team_id, (x) => (x.last_at === m.created_at ? { ...x, last_body: null, last_poll: false } : x));
              return;
            }
            const v = view();
            const open = props.open() && v.kind === "team" && v.t.team_id === m.team_id;
            const tm = teams().find((x) => x.team_id === m.team_id);
            patchTeam(m.team_id, (x) => ({
              ...x,
              last_body: msgPreview(m),
              last_at: m.created_at,
              last_poll: !!m.poll_id,
              last_sender: m.sender === me ? t("Sen") : null,
              unread: !open && m.sender !== me ? (x.unread || 0) + 1 : x.unread,
            }));
            if (m.sender === me || open || !tm || tm.muted) return;
            const front = !inTauri || document.hasFocus();
            const soc = settings().general.social;
            if (front && !props.racing?.() && !soc.dnd) messageBeep();
          },
          poll: (p) => setTeamEvent({ kind: "poll", p }),
        }).then((s) => (dead ? s() : (stop = s)));
        onCleanup(() => {
          dead = true;
          stop();
        });
      },
    ),
  );

  // Gruplar: yeni mesaj (okunmamış sayısı, ses), silinen mesaj, sistem olayları (üye / ad değişti)
  const [groupEvent, setGroupEvent] = createSignal<GroupEvent | null>(null);
  const groupKey = createMemo(() => chatGroups().map((x) => x.group_id).sort().join(","));
  createEffect(
    on(groupKey, (key) => {
      if (!key) return;
      let stop = () => {};
      let dead = false;
      onGroupChat(key.split(","), (m, kind) => {
        setGroupEvent({ kind, m });
        const me = session()?.user.id;
        if (kind === "update") {
          if (m.deleted) patchGroup(m.group_id, (x) => (x.last_at === m.created_at ? { ...x, last_body: null } : x));
          return;
        }
        const v = view();
        const open = props.open() && v.kind === "group" && v.g.group_id === m.group_id;
        const g = chatGroups().find((x) => x.group_id === m.group_id);
        patchGroup(m.group_id, (x) => ({
          ...x,
          last_body: msgPreview(m),
          last_at: m.created_at,
          last_sender: m.sender,
          last_sender_name: m.sender === me ? t("Sen") : null,
          last_system: !!m.meta,
          unread: !open && m.sender !== me ? (x.unread || 0) + 1 : x.unread,
        }));
        // Üye sayısı / ad / sahiplik değişti (ya da gruptan çıkarıldım): listeyi yenile
        if (m.meta && m.meta.t !== "bg") refetchGroups();
        if (m.sender === me || open || !g || g.muted || m.meta) return;
        const front = !inTauri || document.hasFocus();
        const soc = settings().general.social;
        if (front && !props.racing?.() && !soc.dnd) messageBeep();
      }).then((s) => (dead ? s() : (stop = s)));
      onCleanup(() => {
        dead = true;
        stop();
      });
    }),
  );

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refetch();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  // Sağ tık menüsü: güvenilir yap / güvenilirden çıkar. Güvenilir arkadaş ekibime girer (pitwall'ı izler, pit
  // ayarlarını değiştirir); güvenilirden çıkınca ekipten de çıkar (c78; friendTrust eski sunucuda da ikisini yazar).
  const setTrust = async (f: Friend, on: boolean) => {
    setErr("");
    mutate(friends().map((x) => (x.friend_id === f.friend_id ? { ...x, trusted: on } : x)));
    setMineCrew((l) => {
      const rest = (l ?? []).filter((m) => m.member_id !== f.friend_id);
      if (!on) return rest;
      const cur = (l ?? []).find((m) => m.member_id === f.friend_id);
      return [...rest, { member_id: f.friend_id, display_name: f.display_name, avatar_path: f.avatar_path ?? null, can_view: true, can_control: !proLocked(F.crew) || !!cur?.can_control, watching: !!cur?.watching, seen_at: cur?.seen_at ?? null }];
    });
    try {
      await friendTrust(f.friend_id, on);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    // Overlay penceresindeki ekip servisi ve Ayarlar › Paylaşım › Ekip yenilensin
    void emit("crew-refresh").catch(() => {});
    void emit("crew-changed").catch(() => {});
    void refetchMine();
    refetch();
  };

  // Liste: arama ve gruplar
  const [q, setQ] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>(loadCollapsed());
  const toggle = (k: string) => {
    const c = { ...collapsed(), [k]: !collapsed()[k] };
    setCollapsed(c);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(c));
    } catch {
      /* depolama yok */
    }
  };
  const groups = createMemo(() => {
    const s = norm(q().trim());
    const match = (f: Friend) => !s || norm(`${f.display_name} ${f.iracing_name ?? ""}`).includes(s);
    const all = friends().filter(match);
    // Steam gibi: önce yarışta, sonra çevrimiçi, en altta çevrimdışı; her bölümde ada göre (alfabetik)
    const byName = (a: Friend, b: Friend) => a.display_name.localeCompare(b.display_name, localeTag(), { sensitivity: "base" });
    const acc = all.filter((f) => f.status === "accepted");
    return [
      { key: "pending", title: "Onay bekleyenler", list: [...all.filter((f) => f.status === "pending_in"), ...all.filter((f) => f.status === "pending_out")] },
      { key: "racing", title: "Yarışta", list: acc.filter((f) => f.racing && !f.invisible).sort(byName) },
      { key: "online", title: "Çevrimiçi", list: acc.filter((f) => !f.invisible && f.online && !f.racing).sort((a, b) => Number(!!a.dnd) - Number(!!b.dnd) || byName(a, b)) },
      // Sadece yöneticide dolar: "Çevrimdışı görün" seçmiş ama programda olanlar (yarışta olanlar üstte)
      { key: "hidden", title: "Gizli", list: acc.filter((f) => f.invisible).sort((a, b) => Number(!!b.racing) - Number(!!a.racing) || byName(a, b)) },
      { key: "offline", title: "Çevrimdışı", list: acc.filter((f) => !f.invisible && !f.online && !f.racing).sort(byName) },
    ].filter((g) => g.list.length > 0);
  });

  const groupRows = createMemo(() => {
    const s = norm(q().trim());
    return chatGroups().filter((g) => !s || norm(g.name).includes(s));
  });

  const teamRows = createMemo(() => {
    const s = norm(q().trim());
    return teams().filter((tm) => !s || norm(`${tm.name} ${tm.tag}`).includes(s));
  });

  const title = () => {
    const v = view();
    if (v.kind === "add") return <b>Arkadaş ekle</b>;
    if (v.kind === "newgroup") return <b>Yeni grup</b>;
    if (v.kind === "group") {
      const g = curG(v.g);
      return (
        <div class="fhead-who">
          <GroupAvatar group={g} size={30} />
          <div class="fhead-title">
            <b data-no-i18n>{g.name}</b>
            <small>{t("{0} üye", g.member_count)}</small>
          </div>
        </div>
      );
    }
    if (v.kind === "list")
      return (
        <div class="fhead-title">
          <b>Arkadaşlar</b>
          <small>{t("{0} çevrimiçi", online())}</small>
        </div>
      );
    if (v.kind === "team") {
      const tm = curT(v.t);
      return (
        <div class="fhead-who">
          <TeamLogo team={tm} size={30} />
          <div class="fhead-title">
            <b data-no-i18n>{tm.name}</b>
            <small>{t("{0} üye", tm.member_count)}</small>
          </div>
        </div>
      );
    }
    const f = cur(v.f);
    return (
      <div class="fhead-who">
        <button class="fav-btn" title="Profili gör" onClick={() => setProfileOf(f.friend_id)}>
          <Avatar id={f.friend_id} name={f.display_name} size={30} presence={presence(f)} />
        </button>
        <div class="fhead-title">
          <b data-no-i18n>
            {f.display_name} <SimBadge sim={f.online ? f.sim : ""} />
          </b>
          <small classList={{ racing: f.racing }} data-no-i18n={f.racing ? true : undefined}>
            {statusText(f)}
          </small>
        </div>
      </div>
    );
  };

  return (
    <div class="fdock-panel fx" classList={{ standalone: !!props.standalone }} onContextMenu={(e) => e.preventDefault()}>
      <header>
        <Show when={view().kind !== "list"}>
          <button class="icon-btn" title="Geri" onClick={() => setView({ kind: "list" })}>
            <I.ChevronLeft />
          </button>
        </Show>
        {title()}
        <span class="lt-sp" />
        <Show when={teamT()}>
          {(tm) => (
            <>
              <button
                class="icon-btn"
                classList={{ on: tm().muted }}
                title={tm().muted ? "Oda sessizde: bildirim ve ses yok (açmak için tıkla)" : "Odayı sessize al (bildirim ve ses yok)"}
                onClick={() => {
                  const next = !tm().muted;
                  patchTeam(tm().team_id, (x) => ({ ...x, muted: next }));
                  muteTeamChat(tm().team_id, next).catch((e) => (setErr(String((e as Error).message)), patchTeam(tm().team_id, (x) => ({ ...x, muted: !next }))));
                }}
              >
                {tm().muted ? <I.BellOff /> : <I.Bell />}
              </button>
              <button class="icon-btn" title="Takım sayfası: üyeler ve duyurular" onClick={() => nav.team(tm().team_id)}>
                <I.Users />
              </button>
              <Show when={tm().role === "owner"}>
                <button class="icon-btn" classList={{ on: bgAsk() }} title="Sohbet arka planı (sadece takım sahibi değiştirebilir)" onClick={() => setBgAsk(!bgAsk())}>
                  <Wallpaper />
                </button>
              </Show>
            </>
          )}
        </Show>
        <Show when={groupG()}>
          {(g) => (
            <>
              <button
                class="icon-btn"
                classList={{ on: g().muted }}
                title={g().muted ? "Grup sessizde: bildirim ve ses yok (açmak için tıkla)" : "Grubu sessize al (bildirim ve ses yok)"}
                onClick={() => {
                  const next = !g().muted;
                  patchGroup(g().group_id, (x) => ({ ...x, muted: next }));
                  muteGroup(g().group_id, next).catch((e) => (setErr(String((e as Error).message)), patchGroup(g().group_id, (x) => ({ ...x, muted: !next }))));
                }}
              >
                {g().muted ? <I.BellOff /> : <I.Bell />}
              </button>
              <button
                class="icon-btn"
                classList={{ on: groupPanel() === "members" }}
                title="Üyeler: davet et, gruptan ayrıl"
                onClick={() => setGroupPanel(groupPanel() === "members" ? "none" : "members")}
              >
                <I.Users />
              </button>
              <Show when={g().is_owner}>
                <button
                  class="icon-btn"
                  classList={{ on: groupPanel() === "bg" }}
                  title="Sohbet arka planı (sadece grup sahibi değiştirebilir)"
                  onClick={() => setGroupPanel(groupPanel() === "bg" ? "none" : "bg")}
                >
                  <Wallpaper />
                </button>
              </Show>
            </>
          )}
        </Show>
        <Show when={view().kind === "chat"}>
          <button class="icon-btn" classList={{ on: bgAsk() }} title="Sohbet arka planı" onClick={() => setBgAsk(!bgAsk())}>
            <Wallpaper />
          </button>
          <button class="icon-btn" classList={{ on: clearAsk() }} title="Sohbeti temizle (sadece senin görünümünden)" onClick={() => setClearAsk(!clearAsk())}>
            <I.Trash />
          </button>
        </Show>
        <Show when={view().kind === "list"}>
          <button class="icon-btn" title="Arkadaş ekle" onClick={() => setView({ kind: "add" })}>
            <I.UserPlus />
          </button>
          <button class="icon-btn" title="Grup kur: arkadaşlarınla grup sohbeti" onClick={() => setView({ kind: "newgroup" })}>
            <I.MessagesSquare />
          </button>
          <Show when={!props.standalone}>
            <button class="icon-btn" title="Ayrı pencerede aç (Steam gibi)" onClick={() => (invoke("window_open", { view: "friends" }).catch(() => {}), props.onClose?.())}>
              <I.ExternalLink />
            </button>
          </Show>
        </Show>
        <Show when={props.onClose}>
          <button class="icon-btn" title="Kapat" onClick={() => props.onClose?.()}>
            <I.X />
          </button>
        </Show>
      </header>
      <Show when={err()}>
        <p class="error small fdock-err" onClick={() => setErr("")}>
          {err()}
        </p>
      </Show>

      <Show when={view().kind === "list"}>
        <MyStatusBar />
        <Show when={friends().length > 0 || teams().length > 0 || chatGroups().length > 0}>
          <div class="fsearch">
            <I.Search />
            <input
              class="input"
              placeholder="Arkadaş ara"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Escape" && setQ("")}
            />
            <Show when={q()}>
              <button class="icon-btn" title="Temizle" onClick={() => setQ("")}>
                <I.X />
              </button>
            </Show>
          </div>
        </Show>
        <div class="fdock-list">
          <Show when={teamRows().length > 0}>
            <button class="fdock-sec fsec-teams" classList={{ closed: !!collapsed().teams && !q() }} onClick={() => toggle("teams")}>
              <I.ChevronDown />
              <span>Takım odaları</span>
              <i>{teamRows().length}</i>
            </button>
            <Show when={!collapsed().teams || q()}>
              <For each={teamRows()}>
                {(tm) => <TeamRow t={tm} onOpen={() => setView({ kind: "team", t: tm })} onPage={() => nav.team(tm.team_id)} />}
              </For>
            </Show>
          </Show>
          <Show when={groupRows().length > 0}>
            <button class="fdock-sec fsec-teams" classList={{ closed: !!collapsed().groups && !q() }} onClick={() => toggle("groups")}>
              <I.ChevronDown />
              <span>Gruplar</span>
              <i>{groupRows().length}</i>
            </button>
            <Show when={!collapsed().groups || q()}>
              <For each={groupRows()}>{(g) => (
                  <GroupRow
                    g={g}
                    onOpen={() => setView({ kind: "group", g })}
                    onMembers={() => (setView({ kind: "group", g }), setGroupPanel("members"))}
                    onMute={() => {
                      const next = !g.muted;
                      patchGroup(g.group_id, (x) => ({ ...x, muted: next }));
                      muteGroup(g.group_id, next).catch((e) => (setErr(String((e as Error).message)), patchGroup(g.group_id, (x) => ({ ...x, muted: !next }))));
                    }}
                    onGone={() => (mutateGroups(chatGroups().filter((x) => x.group_id !== g.group_id)), refetchGroups())}
                    onErr={setErr}
                  />
                )}</For>
            </Show>
          </Show>
          <Show
            when={friends().length > 0 || teams().length > 0 || chatGroups().length > 0}
            fallback={
              <Show when={!list.loading} fallback={<p class="muted small fdock-empty">Yükleniyor…</p>}>
                <div class="fempty">
                  <div class="fempty-ico">
                    <I.Users />
                  </div>
                  <b>Henüz arkadaşın yok</b>
                  <p class="muted small">Arkadaşlarını ekle; çevrimiçi ve yarışta olduklarını gör, mesajlaş, yakıt verilerini paylaş.</p>
                  <button class="btn primary small" onClick={() => setView({ kind: "add" })}>
                    <I.UserPlus /> Arkadaş ekle
                  </button>
                </div>
              </Show>
            }
          >
            <Show when={groups().length > 0} fallback={<Show when={friends().length > 0 && teamRows().length === 0 && groupRows().length === 0}><p class="muted small fdock-empty">Eşleşen arkadaş yok.</p></Show>}>
              <For each={groups()}>
                {(g) => (
                  <>
                    <button class={`fdock-sec fsec-${g.key}`} classList={{ closed: !!collapsed()[g.key] && !q() }} onClick={() => toggle(g.key)}>
                      <I.ChevronDown />
                      <span>{g.title}</span>
                      <i>{g.list.length}</i>
                    </button>
                    <Show when={!collapsed()[g.key] || q()}>
                      <For each={g.list}>
                        {(f) => (
                          <FriendRow
                            f={f}
                            last={last()[f.friend_id]}
                            nav={nav}
                            crew={crewOf(f.friend_id)}
                            crewRole={crewRoleOf(f.friend_id)}
                            onTrust={(on) => void setTrust(f, on)}
                            onChat={() => setView({ kind: "chat", f })}
                            onProfile={() => setProfileOf(f.friend_id)}
                            act={act}
                          />
                        )}
                      </For>
                    </Show>
                  </>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </Show>
      <Show when={view().kind === "add"}>
        <AddFriend friends={friends()} act={act} />
      </Show>
      <Show when={chatF()?.friend_id} keyed>
        {(id) => (
          <Chat
            f={chatF() ?? friends().find((x) => x.friend_id === id)!}
            incoming={incoming()}
            nav={nav}
            onSent={noteLast}
            onLast={(m) => setLastFor(id, m)}
            clearAsk={clearAsk()}
            bgAsk={bgAsk()}
            onBgDone={() => setBgAsk(false)}
            onError={setErr}
            onClearDone={() => setClearAsk(false)}
            onRead={() => mutate(friends().map((x) => (x.friend_id === id ? { ...x, unread: 0 } : x)))}
          />
        )}
      </Show>
      <Show when={teamT()?.team_id} keyed>
        {(id) => (
          <TeamChat
            team={teamT() ?? teams().find((x) => x.team_id === id)!}
            event={teamEvent()}
            bgAsk={bgAsk()}
            onBgDone={() => setBgAsk(false)}
            onRead={() => patchTeam(id, (x) => ({ ...x, unread: 0 }))}
            onLast={(m: TeamMessage | null) =>
              patchTeam(id, (x) => ({
                ...x,
                last_body: m ? msgPreview(m) : null,
                last_at: m ? m.created_at : null,
                last_poll: !!m?.poll_id,
                last_sender: m && m.sender === session()?.user.id ? t("Sen") : null,
              }))
            }
          />
        )}
      </Show>
      <Show when={view().kind === "newgroup"}>
        <NewGroup
          friends={accepted()}
          onCancel={() => setView({ kind: "list" })}
          onCreated={(id) => {
            setView({ kind: "list" });
            setWantChat(`group:${id}`);
            refetchGroups();
          }}
        />
      </Show>
      <Show when={groupG()?.group_id} keyed>
        {(id) => (
          <GroupChat
            group={groupG() ?? chatGroups().find((x) => x.group_id === id)!}
            event={groupEvent()}
            friends={accepted()}
            panel={groupPanel()}
            onPanel={setGroupPanel}
            onRead={() => patchGroup(id, (x) => ({ ...x, unread: 0 }))}
            onChanged={() => refetchGroups()}
            onGone={() => {
              setView({ kind: "list" });
              mutateGroups(chatGroups().filter((x) => x.group_id !== id));
              refetchGroups();
            }}
            onLast={(m: GroupMessage | null) =>
              patchGroup(id, (x) => ({
                ...x,
                last_body: m ? msgPreview(m) : null,
                last_at: m ? m.created_at : null,
                last_sender: m?.sender ?? null,
                last_sender_name: m && m.sender === session()?.user.id ? t("Sen") : null,
                last_system: !!m?.meta,
              }))
            }
          />
        )}
      </Show>
    </div>
  );
}

/** Arkadaş listesindeki grup sohbeti satırı */
function GroupRow(props: { g: MyGroup; onOpen: () => void; onMembers: () => void; onMute: () => void; onGone: () => void; onErr: (m: string) => void }) {
  const g = () => props.g;
  // Sağ tık menüsü: arkadaş satırındaki gibi en üst katmanda (Portal), ekran koordinatlarıyla
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [pos, setPos] = createSignal<{ x: number; y: number } | null>(null);
  const placeMenu = (m: HTMLDivElement) => {
    requestAnimationFrame(() => {
      const at = menu();
      if (!m.isConnected || !at) return;
      const pad = 6;
      const x = Math.max(pad, Math.min(at.x, window.innerWidth - pad - m.offsetWidth));
      const y = Math.max(pad, Math.min(at.y, window.innerHeight - pad - m.offsetHeight));
      setPos({ x, y });
    });
  };
  createEffect(() => {
    if (!menu()) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && (e.target as Element).closest?.(".frow-menu")) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const tm = window.setTimeout(() => {
      document.addEventListener("pointerdown", close, true);
      document.addEventListener("wheel", close, true);
    }, 0);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("keydown", key);
    onCleanup(() => {
      clearTimeout(tm);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("keydown", key);
    });
  });
  const run = (fn: () => Promise<unknown>) =>
    fn().then(
      () => props.onGone(),
      (e) => props.onErr(String((e as Error)?.message ?? e)),
    );
  const leave = () => {
    setMenu(null);
    const alone = g().member_count <= 1;
    const q = alone
      ? t("Grupta başka kimse yok; ayrılırsan grup ve mesajları silinir. Ayrılmak istiyor musun?")
      : g().is_owner
        ? t("Gruptan ayrılırsan sahiplik en eski üyeye geçer. Ayrılmak istiyor musun?")
        : t("{0} grubundan ayrılmak istiyor musun?", g().name);
    if (!confirm(q)) return;
    void run(async () => {
      // Son üye ayrılınca grup silinir: ortak arka plan görseli önce kovadan temizlenir
      if (alone) await clearRoomBg("group", g().group_id, true).catch(() => {});
      await leaveGroup(g().group_id);
    });
  };
  const remove = () => {
    setMenu(null);
    if (!confirm(t("{0} grubu ve tüm mesajları herkes için silinsin mi? Bu işlem geri alınamaz.", g().name))) return;
    void run(async () => {
      await clearRoomBg("group", g().group_id, true).catch(() => {});
      await deleteGroup(g().group_id);
    });
  };
  return (
    <div
      class="frow troom"
      classList={{ unread: g().unread > 0 && !g().muted, menu: !!menu() }}
      onClick={props.onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPos(null);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <Show when={menu()}>
        <Portal>
          <div class="fx frow-menu-layer" onContextMenu={(e) => e.preventDefault()}>
            <div
              ref={placeMenu}
              class="frow-menu floating"
              style={{ left: `${pos()?.x ?? 0}px`, top: `${pos()?.y ?? 0}px`, visibility: pos() ? "visible" : "hidden" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => (setMenu(null), props.onOpen())}>
                <I.MessageSquare /> Sohbeti aç
              </button>
              <button onClick={() => (setMenu(null), props.onMembers())}>
                <I.Users /> Üyeler
              </button>
              <button onClick={() => (setMenu(null), props.onMute())}>
                {g().muted ? <I.Bell /> : <I.BellOff />} {g().muted ? "Sessizden çıkar" : "Sessize al"}
              </button>
              <button class="danger" onClick={leave} title="Sohbet listenden kalkar; grup diğer üyeler için sürer">
                <I.UserMinus /> Gruptan ayrıl
              </button>
              <Show when={g().is_owner}>
                <button class="danger" onClick={remove} title="Grup ve tüm mesajları herkes için silinir">
                  <I.Trash /> Grubu sil
                </button>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
      <GroupAvatar group={g()} size={36} />
      <div class="frow-main">
        <div class="frow-l1">
          <b data-no-i18n>{g().name}</b>
          <Show when={g().is_owner}>
            <span class="frow-flag" title="Bu grubun sahibisin">
              <I.Star />
            </span>
          </Show>
          <Show when={g().muted}>
            <span class="frow-flag" title="Grup sessizde">
              <I.BellOff />
            </span>
          </Show>
          <span class="lt-sp" />
          <Show when={g().last_at}>
            <time>{shortTime(g().last_at!)}</time>
          </Show>
        </div>
        <div class="frow-l2">
          <small class="frow-prev">{t("{0} üye", g().member_count)}</small>
          <Show when={g().unread > 0}>
            <span class="frow-unread" classList={{ muted: g().muted }}>
              {g().unread}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}

/** Arkadaş listesindeki takım odası satırı */
function TeamRow(props: { t: MyTeam; onOpen: () => void; onPage: () => void }) {
  const tm = () => props.t;
  return (
    <div class="frow troom" classList={{ unread: tm().unread > 0 && !tm().muted }} onClick={props.onOpen}>
      <TeamLogo team={tm()} size={36} />
      <div class="frow-main">
        <div class="frow-l1">
          <b data-no-i18n>{tm().name}</b>
          <span class="ttag" style={{ "--tc": tm().color }} data-no-i18n>
            {tm().tag}
          </span>
          <Show when={tm().muted}>
            <span class="frow-flag" title="Oda sessizde">
              <I.BellOff />
            </span>
          </Show>
          <span class="lt-sp" />
          <Show when={tm().last_at}>
            <time>{shortTime(tm().last_at!)}</time>
          </Show>
        </div>
        <div class="frow-l2">
          <small class="frow-prev">{t("{0} üye", tm().member_count)}</small>
          <Show when={tm().unread > 0}>
            <span class="frow-unread" classList={{ muted: tm().muted }}>
              {tm().unread}
            </span>
          </Show>
        </div>
      </div>
      <div class="frow-acts">
        <button class="icon-btn" title="Takım sayfası" onClick={(e) => (e.stopPropagation(), props.onPage())}>
          <I.Users />
        </button>
      </div>
    </div>
  );
}

export function FriendsDock(props: { racing?: () => boolean }) {
  const [open, setOpen] = createSignal(false);
  const [counts, setCounts] = createSignal<[number, number]>([0, 0]);
  // Tepsi simgesine okunmamış mesaj varken tıklandı: panel açılır ve arkadaş listesi gösterilir
  if (inTauri) {
    const take = () =>
      invoke<boolean>("tray_take_open")
        .then((yes) => yes && session() && setOpen(true))
        .catch(() => {});
    onMount(() => {
      take();
      let un: (() => void) | undefined;
      listen("tray-open-friends", take).then((u) => (un = u));
      onCleanup(() => un?.());
    });
  }
  // Çıkış yapınca (ya da hesap değişince) panel kapanır ve önceki hesabın sayıları sıfırlanır
  createEffect(
    on(
      () => session()?.user.id ?? "",
      () => {
        setOpen(false);
        setCounts([0, 0]);
      },
      { defer: true },
    ),
  );
  return (
    <Show
      when={session()}
      fallback={
        // Giriş yapmamış kullanıcı da düğmeyi görür; tıklayınca giriş yapması istenir
        <Show when={cloudEnabled}>
          <div class="fdock" classList={{ open: open() }}>
            <Show when={open()}>
              <div class="fdock-login">
                <I.Lock />
                <p>Sohbet ve arkadaşlar için giriş yapmalısın</p>
                <div class="fdock-login-btns">
                  <button class="btn small" onClick={() => (setOpen(false), go("account"))}>
                    Giriş yap
                  </button>
                  <button class="btn ghost small" onClick={() => setOpen(false)}>
                    Kapat
                  </button>
                </div>
              </div>
            </Show>
            <button class="fdock-btn" onClick={() => setOpen(!open())}>
              <I.Users />
              <span>Arkadaşlar</span>
            </button>
          </div>
        </Show>
      }
    >
      <div class="fdock" classList={{ open: open() }}>
        <div style={{ display: open() ? "contents" : "none" }}>
          <FriendsPanel open={open} onClose={() => setOpen(false)} racing={props.racing} onCounts={(o, b) => setCounts([o, b])} />
        </div>
        <button class="fdock-btn" onClick={() => setOpen(!open())}>
          <I.Users />
          <span>Arkadaşlar</span>
          <small>{t("{0} çevrimiçi", counts()[0])}</small>
          <Show when={counts()[1] > 0}>
            <i class="fdock-badge">{counts()[1]}</i>
          </Show>
        </button>
      </div>
    </Show>
  );
}

type MyMode = "online" | "dnd" | "offline";
const MY_MODES: { id: MyMode; label: string; hint: string }[] = [
  { id: "online", label: "Çevrimiçi", hint: "Arkadaşların seni çevrimiçi görür; mesaj bildirimleri ve sesleri açık" },
  { id: "dnd", label: "Rahatsız Etme", hint: "Mesaj bildirimi gösterilmez ve ses çalmaz; yarışta sadece alt köşede sayaç görünür" },
  { id: "offline", label: "Çevrimdışı", hint: "Çevrimdışı görünürsün: arkadaşların seni çevrimdışı görür, mesajlar yine gelir" },
];

function MyStatusBar() {
  const soc = () => settings().general.social;
  const mode = (): MyMode => (soc().invisible ? "offline" : soc().dnd ? "dnd" : "online");
  const setMode = (m: MyMode) =>
    updateSettings((d) => {
      d.general.social.dnd = m === "dnd";
      d.general.social.invisible = m === "offline";
    });
  const cur = () => MY_MODES.find((x) => x.id === mode())!;
  const [open, setOpen] = createSignal(false);
  let box: HTMLDivElement | undefined;
  createEffect(() => {
    if (!open()) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && box?.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", close);
    onCleanup(() => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", close);
    });
  });
  return (
    <div class="fdock-me">
      <div class="fme-status" ref={box}>
        <button
          class={`fme-chip fme-mode m-${mode()}`}
          classList={{ open: open() }}
          aria-haspopup="menu"
          aria-expanded={open()}
          title={t("Durumun: {0}", t(cur().label))}
          onClick={() => setOpen(!open())}
        >
          <i class="fme-dot" />
          <span>{t(cur().label)}</span>
          <I.ChevronDown />
        </button>
        <Show when={open()}>
          <div class="fme-menu" role="menu">
            <For each={MY_MODES}>
              {(m) => (
                <button role="menuitemradio" aria-checked={mode() === m.id} class={`m-${m.id}`} classList={{ on: mode() === m.id }} onClick={() => (setMode(m.id), setOpen(false))}>
                  <i class="fme-dot" />
                  <span>
                    <b>{t(m.label)}</b>
                    <small>{t(m.hint)}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function statusText(f: Friend) {
  if (f.status === "pending_in") return t("Arkadaşlık isteği gönderdi");
  if (f.status === "pending_out") return t("İstek gönderildi");
  const sim = f.sim && SIM_SHORT[f.sim] ? SIM_SHORT[f.sim] : "";
  // Sadece yöneticiye gelir: "Çevrimdışı görün" seçmiş ama programda (yarıştaysa oyun / oturum / pist / araç eklenir)
  if (f.invisible) return [t("Çevrimdışı (gizli)"), ...(f.racing ? [sim, f.session, f.track, f.car] : [sim])].filter(Boolean).join(" · ");
  if (f.racing) return [sim, f.session, f.track, f.car].filter(Boolean).join(" · ") || (sim ? t("Oyunda: {0}", sim) : t("Yarışta"));
  if (f.online) return (f.dnd ? t("Çevrimiçi · rahatsız etme") : t("Çevrimiçi")) + (sim ? ` · ${sim}` : "");
  return f.last_seen ? t("Son görülme: {0}", ago(f.last_seen)) : t("Çevrimdışı");
}

/** "5 dk", "3 sa", "dün", tarih */
function ago(iso: string) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return t("az önce");
  if (s < 3600) return t("{0} dk önce", Math.floor(s / 60));
  if (s < 86400) return t("{0} sa önce", Math.floor(s / 3600));
  if (s < 2 * 86400) return t("dün");
  return d.toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
}

/** Satırdaki son mesaj saati: bugünse saat, değilse gün */
function shortTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("dün");
  return d.toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
}

function FriendRow(props: {
  f: Friend;
  last?: Message;
  nav: Nav;
  /** Bu arkadaşın ekibindeyim (c53): "Ekip" düğmesi çıkar */
  crew?: boolean;
  /** Bu arkadaş BENİM ekibimde mi ve yetkisi (sağ tık menüsü) */
  crewRole?: "view" | "control" | null;
  /** Güvenilir yap / güvenilirden çıkar (ekip üyeliğini de açar / kapatır) */
  onTrust: (on: boolean) => void;
  onChat: () => void;
  onProfile: () => void;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const f = () => props.f;
  // Güvenilir: işaretli ya da (eski sunucu / PRO olmayan) ekibimde
  const trusted = () => f().trusted || !!props.crewRole;
  const [menu, setMenu] = createSignal(false);
  let el: HTMLDivElement | undefined;
  // Menü sayfanın en üst katmanında (Portal) ve ekran koordinatlarıyla açılır: liste başlığının / kaydırma alanının
  // altında kalmaz, pencereden taşmaz. at: sağ tık noktası; yoksa satırın sağ altı (⋯ düğmesi).
  const [pos, setPos] = createSignal<{ x: number; y: number; h: number } | null>(null);
  let anchor: { x: number; y: number; right: boolean } = { x: 0, y: 0, right: false };
  const openMenu = (at?: { x: number; y: number }) => {
    const r = el?.getBoundingClientRect();
    anchor = at ? { ...at, right: false } : { x: (r?.right ?? 0) - 8, y: (r?.bottom ?? 0) - 2, right: true };
    setPos(null);
    setMenu(true);
  };
  const placeMenu = (m: HTMLDivElement) => {
    requestAnimationFrame(() => {
      if (!m.isConnected) return;
      const pad = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = m.offsetWidth;
      const h = Math.min(m.scrollHeight, vh - pad * 2);
      let x = anchor.right ? anchor.x - w : anchor.x;
      let y = anchor.y;
      if (y + h > vh - pad) y = Math.max(pad, vh - pad - h);
      x = Math.max(pad, Math.min(x, vw - pad - w));
      setPos({ x, y, h: vh - pad * 2 });
    });
  };
  createEffect(() => {
    if (!menu()) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && (e.target as Element).closest?.(".frow-menu")) return;
      setMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    // Bir sonraki tıkta / kaydırmada / pencere boyutu değişince kapanır
    const tm = window.setTimeout(() => {
      document.addEventListener("pointerdown", close, true);
      document.addEventListener("wheel", close, true);
    }, 0);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("keydown", key);
    onCleanup(() => {
      clearTimeout(tm);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("keydown", key);
    });
  });
  // Steam gibi: adın altında her zaman durum yazar (son mesaj gösterilmez; okunmamış sayısı sağda durur)
  return (
    <div
      ref={el}
      class="frow"
      classList={{ hid: !!f().invisible, racing: f().racing && !f().invisible, online: f().online && !f().racing && !f().invisible, dnd: f().online && !f().racing && !!f().dnd && !f().invisible, offline: f().status === "accepted" && !f().online && !f().racing, pending: f().status !== "accepted", unread: f().unread > 0, menu: menu() }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (f().status === "accepted") openMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button class="fav-btn" title="Profili gör" onClick={props.onProfile}>
        <Avatar id={f().friend_id} name={f().display_name} presence={presence(f())} />
      </button>
      <div class="frow-main" onClick={() => f().status === "accepted" && props.onChat()}>
        <div class="frow-l1">
          <b data-no-i18n>{f().display_name || "?"}</b>
          <SimBadge sim={f().online ? f().sim : ""} />
          <Show when={f().invisible}>
            <span class="frow-flag hidden-flag" title="Gizli: bu üye &quot;Çevrimdışı&quot; durumunu seçti ama şu an programda. Diğer üyeler onu çevrimdışı görür; bunu sadece yöneticiler görür.">
              <I.EyeOff />
            </span>
          </Show>
          <Show when={trusted()}>
            <span
              class="frow-flag trust"
              title={props.crewRole === "view" ? "Güvenilir: pitwall'ını izleyebilir" : "Güvenilir: pitwall'ına girebilir ve pit ayarlarını değiştirebilir"}
            >
              <I.ShieldCheck />
            </span>
          </Show>
          <Show when={f().notify_muted}>
            <span class="frow-flag" title="Bildirimlerini kapattın">
              <I.BellOff />
            </span>
          </Show>
          <span class="lt-sp" />
        </div>
        <div class="frow-l2">
          <small class="frow-status" data-no-i18n={f().racing ? true : undefined} title={statusText(f())}>
            <Show when={f().racing}>
              <I.Flag />
            </Show>
            {statusText(f())}
          </small>
          <Show when={f().unread > 0}>
            <span class="frow-unread">{f().unread}</span>
          </Show>
        </div>
      </div>
      <Show when={f().status === "pending_in"}>
        <div class="frow-req">
          <button class="btn primary small" onClick={() => props.act(() => friendRespond(f().friend_id, true))}>
            Kabul et
          </button>
          <button class="btn ghost small" onClick={() => props.act(() => friendRespond(f().friend_id, false))}>
            Reddet
          </button>
        </div>
      </Show>
      <Show when={f().status === "pending_out"}>
        <button class="btn ghost small" onClick={() => props.act(() => friendRemove(f().friend_id))}>
          İptal
        </button>
      </Show>
      <Show when={f().status === "accepted"}>
        <div class="frow-acts">
          <button class="icon-btn" title="Mesaj" onClick={props.onChat}>
            <I.MessageSquare />
          </button>
          <Show when={props.crew}>
            <button
              class="icon-btn live"
              classList={{ idle: !f().racing }}
              title="Ekip paneli: yarışını izle, izin verdiyse pit ayarlarını değiştir"
              onClick={() => props.nav.crew(f().friend_id)}
            >
              <Wrench />
            </button>
          </Show>
          <button class="icon-btn" title="Seçenekler" onClick={() => (menu() ? setMenu(false) : openMenu())}>
            <I.MoreVertical />
          </button>
        </div>
      </Show>
      <Show when={menu()}>
        <Portal>
          <div class="fx frow-menu-layer" onContextMenu={(e) => e.preventDefault()}>
        <div
          ref={placeMenu}
          class="frow-menu floating"
          style={{ left: `${pos()?.x ?? 0}px`, top: `${pos()?.y ?? 0}px`, "max-height": pos() ? `${pos()!.h}px` : undefined, visibility: pos() ? "visible" : "hidden" }}
        >
          <button onClick={() => (setMenu(false), props.onChat())}>
            <I.MessageSquare /> Mesaj
          </button>
          <button onClick={() => (setMenu(false), props.onProfile())}>
            <I.User /> Profil
          </button>
          <Show
            when={!proLocked("social.friend_look")}
            fallback={
              <button onClick={() => (setMenu(false), props.nav.pro())} title="Arkadaş görünümünü (renk, simge, fotoğraf, etiket) özelleştirmek PRO özelliğidir">
                <I.Palette /> Görünümü düzenle <span class="pro-badge small">PRO</span>
              </button>
            }
          >
            <button onClick={() => (setMenu(false), props.nav.look(f().friend_id))} title="Rengini, simgesini, fotoğrafını ve etiketini ona özel ayarla">
              <I.Palette /> Görünümü düzenle
            </button>
          </Show>
          <button
            classList={{ on: trusted() }}
            onClick={() => (setMenu(false), props.onTrust(!trusted()))}
            title="Güvenilir arkadaşın sen yarışırken pitwall'ına girebilir ve pit ayarlarını (yakıt, lastik, hızlı tamir) senin yerine değiştirebilir."
          >
            <I.ShieldCheck /> {trusted() ? "Güvenilirden çıkar" : "Güvenilir yap"}
          </button>
          <Show when={proLocked(F.crew)}>
            <p class="frow-menu-note">Güvenilir arkadaşın pitwall'ını izleyebilir. Pit ayarlarını değiştirebilmesi PRO üyelere özel.</p>
          </Show>
          <Show when={props.crew}>
            <button onClick={() => (setMenu(false), openCrewWindow(f().friend_id, () => props.nav.crew(f().friend_id)))} title="Ekip Pitwall'ı: çevresindeki araçları, farkları ve spotter durumunu canlı izle, hazır mesaj gönder">
              <I.Gauge /> Pitwall'ını izle
            </button>
          </Show>
          <button
            onClick={() => (setMenu(false), props.act(() => setFriendPrefs(f().friend_id, !f().notify_muted, false)))}
            title="Kapalıyken bu arkadaştan gelen mesajlarda açılır pencere ve oyun içi bildirim gösterilmez (mesajlar yine gelir)"
          >
            <I.BellOff /> {f().notify_muted ? "Bildirimleri aç" : "Bildirimleri kapat"}
          </button>
          <button
            class="danger"
            onClick={() => {
              setMenu(false);
              if (confirm(t("{0} arkadaşlıktan çıkarılsın mı?", f().display_name))) props.act(() => friendRemove(f().friend_id));
            }}
          >
            <I.UserMinus /> Arkadaşlıktan çıkar
          </button>
        </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
}

function AddFriend(props: { friends: Friend[]; act: (fn: () => Promise<unknown>) => void }) {
  const [q, setQ] = createSignal("");
  const [res, setRes] = createSignal<Person[] | null>(null);
  const [busy, setBusy] = createSignal(false);
  const search = async () => {
    if (q().trim().length < 2) return;
    setBusy(true);
    try {
      setRes((await findPeople(q().trim())) ?? []);
    } finally {
      setBusy(false);
    }
  };
  const state = (id: string) => props.friends.find((f) => f.friend_id === id)?.status;
  return (
    <div class="fdock-add">
      <div class="fsearch">
        <I.Search />
        <input
          class="input"
          placeholder="Görünen ad ya da iRacing adı"
          value={q()}
          ref={(el) => setTimeout(() => el.focus())}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button class="btn small" disabled={busy() || q().trim().length < 2} onClick={search}>
          Ara
        </button>
      </div>
      <div class="fdock-list">
        <Show when={res() && res()!.length === 0}>
          <p class="muted small fdock-empty">Kimse bulunamadı. Adın en az 2 harfini yaz.</p>
        </Show>
        <For each={res() ?? []}>
          {(p) => (
            <div class="frow">
              <span class="fav" style={{ "--sz": "34px", "--fc": hashColor(p.id) }}>
                <span data-no-i18n>{initialOf(p.display_name)}</span>
              </span>
              <div class="frow-main">
                <div class="frow-l1">
                  <b data-no-i18n>{p.display_name || "?"}</b>
                </div>
                <Show when={p.iracing_name}>
                  <small class="frow-status" data-no-i18n>
                    iRacing: {p.iracing_name}
                  </small>
                </Show>
              </div>
              <Show
                when={!state(p.id)}
                fallback={<small class="muted">{state(p.id) === "accepted" ? "Arkadaşın" : "İstek bekliyor"}</small>}
              >
                <button class="btn primary small" disabled={proLocked(F.friendAdd)} onClick={() => props.act(() => friendRequest(p.id))}>
                  <I.UserPlus /> Ekle
                  <ProLockTag feature={F.friendAdd} />
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
      <p class="muted small fadd-help">
        İstek kabul edilince arkadaşının çevrimiçi ve yarışta olduğunu görür, mesajlaşabilirsin. PRO isen "güvenilir" işaretlediğin arkadaşların,
        sen yarışırken yakıt ve tur bilgilerini kod girmeden görebilir.
      </p>
    </div>
  );
}

/** Seçilebilen ifadeler */
const EMOJIS = EMOJI_PICKS;

function dayLabel(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t("Bugün");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("Dün");
  return d.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function Chat(props: {
  f: Friend;
  incoming: Message | null;
  nav: Nav;
  onRead: () => void;
  onSent: (m: Message) => void;
  /** Listedeki son mesaj önizlemesi değişti (mesaj silindi / sohbet temizlendi) */
  onLast: (m: Message | null) => void;
  clearAsk: boolean;
  onClearDone: () => void;
  /** "Sohbet arka planı" paneli açık */
  bgAsk?: boolean;
  onBgDone?: () => void;
  onError?: (msg: string) => void;
}) {
  const [msgs, setMsgs] = createSignal<Message[]>([]);
  // Mesaja sağ tık menüsü ve raporlama
  const [ctx, setCtx] = createSignal<{ x: number; y: number; m: Message } | null>(null);
  const [reporting, setReporting] = createSignal<Message | null>(null);
  const [clearing, setClearing] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  const [picker, setPicker] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  let box: HTMLDivElement | undefined;
  let ta: HTMLTextAreaElement | undefined;
  const scroll = () => requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight));
  const me = () => session()?.user.id;
  onMount(async () => {
    setMsgs(await conversation(props.f.friend_id).catch(() => []));
    setLoaded(true);
    markReadSync(props.f.friend_id);
    props.onRead();
    scroll();
    ta?.focus();
  });
  createEffect(
    on(
      () => props.incoming,
      (m) => {
        if (m && m.sender === props.f.friend_id && !msgs().some((x) => x.id === m.id)) {
          setMsgs([...msgs(), m]);
          markReadSync(props.f.friend_id);
          props.onRead();
          scroll();
        }
      },
      { defer: true },
    ),
  );

  // Mesajlar gün ayraçlarıyla; aynı kişinin art arda (5 dk içinde) mesajları gruplanır
  const rows = createMemo(() => {
    const out: ({ day: string } | { m: Message; first: boolean; lastOfRun: boolean })[] = [];
    const list = msgs();
    let prevDay = "";
    list.forEach((m, i) => {
      const d = new Date(m.created_at);
      const dk = d.toDateString();
      if (dk !== prevDay) {
        out.push({ day: dayLabel(d) });
        prevDay = dk;
      }
      const p = list[i - 1];
      const n = list[i + 1];
      const near = (a?: Message, b?: Message) =>
        !!a && !!b && !a.meta && !b.meta && a.sender === b.sender && Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 5 * 60_000 && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
      out.push({ m, first: !near(p, m), lastOfRun: !near(m, n) });
    });
    return out;
  });

  const grow = () => {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`;
  };
  const onInput = (el: HTMLTextAreaElement) => {
    // Yazarken ":D " gibi tamamlanan ifadeler emojiye döner (imleç yerinde kalır)
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const nb = emojifyTyped(before);
    if (nb !== before) {
      el.value = nb + el.value.slice(caret);
      el.setSelectionRange(nb.length, nb.length);
    }
    setText(el.value);
    grow();
  };
  const insert = (emo: string) => {
    if (!ta) return setText(text() + emo);
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? s;
    ta.value = ta.value.slice(0, s) + emo + ta.value.slice(e);
    ta.setSelectionRange(s + emo.length, s + emo.length);
    setText(ta.value);
    ta.focus();
    grow();
  };
  const send = async () => {
    const b = emojify(text().trim());
    if (!b || sending()) return;
    setErr("");
    setSending(true);
    try {
      const id = await sendMessage(props.f.friend_id, b);
      const m: Message = { id: String(id), sender: me()!, recipient: props.f.friend_id, body: b, created_at: new Date().toISOString(), read_at: null };
      setMsgs([...msgs(), m]);
      props.onSent(m);
      // Mesajlar overlay'i: "Kendi mesajlarımı da göster" açıksa
      broadcastOvMsg({
        id: `f-${m.id}`,
        kind: "friend",
        from: m.sender,
        peer: props.f.friend_id,
        name: t("Sen"),
        color: "#ff8a2a",
        body: b,
        mine: true,
        ts: Date.now(),
      });
      setText("");
      if (ta) ta.value = "";
      grow();
      setPicker(false);
      scroll();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setSending(false);
      ta?.focus();
    }
  };
  // Seçici ve sağ tık menüsü dışına tıklayınca kapanır
  const outside = (e: MouseEvent) => {
    if (picker() && !(e.target as HTMLElement).closest(".femo, .femo-btn")) setPicker(false);
    if (ctx() && !(e.target as HTMLElement).closest(".fmsg-menu")) setCtx(null);
  };
  const closeCtx = () => setCtx(null);
  document.addEventListener("mousedown", outside);
  window.addEventListener("blur", closeCtx);
  onCleanup(() => {
    document.removeEventListener("mousedown", outside);
    window.removeEventListener("blur", closeCtx);
  });

  const openCtx = (e: MouseEvent, m: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ ...msgMenuPos(e), m });
  };
  /** Sol tık da menüyü açar (bağlantıya tıklanmadıysa, metin seçilmiyorsa) */
  const clickCtx = (e: MouseEvent, m: Message) => msgClickOpens(e) && openCtx(e, m);
  /** Mesajı sadece kendi görünümünden kaldır */
  const hide = async (m: Message) => {
    setCtx(null);
    setErr("");
    try {
      await hideMessage(m.id);
      const rest = msgs().filter((x) => x.id !== m.id);
      setMsgs(rest);
      props.onLast(rest[rest.length - 1] ?? null);
      if (reporting()?.id === m.id) setReporting(null);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const copy = (m: Message) => {
    setCtx(null);
    navigator.clipboard?.writeText(msgPreview(m)).catch(() => {});
  };
  /** Sohbeti kendi görünümünden temizle (karşı taraf mesajları görmeye devam eder) */
  const clearAll = async () => {
    setErr("");
    setClearing(true);
    try {
      await clearConversation(props.f.friend_id);
      setMsgs([]);
      setReporting(null);
      props.onLast(null);
      props.onClearDone();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setClearing(false);
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  // Sohbete özel arka plan (kendi seçimin ya da kabul edilen ortak arka plan)
  const conv = useConvBg(() => props.f.friend_id);
  return (
    <div class="fchat" classList={chatLookClass(conv.look())} style={chatLookStyle(conv.look())}>
      <Show when={props.bgAsk}>
        <ConvBgPanel
          f={props.f}
          st={conv}
          onClose={() => props.onBgDone?.()}
          onError={props.onError}
          onAnnounced={(m) => {
            // Arka planı değiştirdim: sohbete düşen mesaj (karşı taraf tıklayıp aynısını kullanabilir)
            if (m.id && !msgs().some((x) => x.id === m.id)) setMsgs([...msgs(), m]);
            props.onSent(m);
            scroll();
          }}
        />
      </Show>
      <ConvBgRequest f={props.f} st={conv} />
      <Show when={props.clearAsk}>
        <div class="fclear">
          <p class="small">
            {t("Bu sohbetteki tüm mesajlar senin görünümünden silinsin mi? {0} mesajları görmeye devam eder.", props.f.display_name || "?")}
          </p>
          <div class="fclear-btns">
            <button class="btn ghost small" disabled={clearing()} onClick={() => props.onClearDone()}>
              Vazgeç
            </button>
            <button class="btn small danger" disabled={clearing()} onClick={clearAll}>
              <I.Trash /> {clearing() ? "Temizleniyor…" : "Sohbeti temizle"}
            </button>
          </div>
        </div>
      </Show>
      <ChatStage look={conv.look()} img={conv.img()}>
      <div class="fchat-msgs" ref={box} onScroll={() => ctx() && setCtx(null)}>
        <Show
          when={msgs().length > 0}
          fallback={
            <Show when={loaded()}>
              <div class="fempty">
                <div class="fempty-ico wave">👋</div>
                <b>Henüz mesaj yok</b>
                <p class="muted small">{t("{0} ile ilk mesajı sen başlat.", props.f.display_name)}</p>
              </div>
            </Show>
          }
        >
          <For each={rows()}>
            {(r) =>
              "day" in r ? (
                <div class="fday">
                  <span>{r.day}</span>
                </div>
              ) : r.m.meta?.t === "bg" ? (
                <div class="fsys-wrap" onContextMenu={(e) => openCtx(e, r.m)} onClick={(e) => clickCtx(e, r.m)}>
                  <BgNote
                    meta={r.m.meta}
                    who={props.f.display_name || "?"}
                    mine={r.m.sender === me()}
                    time={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                    onUse={() => adoptBg(props.f.friend_id, r.m.meta!)}
                  />
                </div>
              ) : (
                <div
                  class="fmsg"
                  classList={{ mine: r.m.sender === me(), first: r.first, tail: r.lastOfRun, jumbo: emojiOnly(emojify(r.m.body)) }}
                  title={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                  onContextMenu={(e) => openCtx(e, r.m)}
                  onClick={(e) => clickCtx(e, r.m)}
                >
                  <p data-no-i18n>
                    <MsgText text={r.m.body} />
                  </p>
                  <Show when={r.lastOfRun}>
                    <small>{time(r.m.created_at)}</small>
                  </Show>
                </div>
              )
            }
          </For>
        </Show>
      </div>
      </ChatStage>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show when={reporting()}>
        {(m) => <ReportMessage m={m()} name={props.f.display_name} onHide={() => hide(m())} onClose={() => setReporting(null)} />}
      </Show>
      <Show when={ctx()}>
        {(c) => (
          <MsgMenu
            pos={c()}
            onCopy={() => copy(c().m)}
            onHide={() => hide(c().m)}
            hideTitle={t("Mesaj sadece senin görünümünden silinir; karşı taraf görmeye devam eder")}
            onReport={c().m.sender !== me() && !c().m.meta ? () => (setReporting(c().m), setCtx(null)) : undefined}
          />
        )}
      </Show>
      <Show when={!reporting()}>
        <Show when={props.f.accept_messages} fallback={<p class="muted small fchat-off">Bu kişi mesajları kapatmış.</p>}>
          <ProLockNote feature={F.messages} text="Mesaj göndermek PRO üyelere özel. Gelen mesajları okuyabilirsin." class="fchat-prolock" />
          <div class="fcompose" classList={{ "prolock-dim": proLocked(F.messages) }}>
            <Show when={picker()}>
              <div class="femo" role="dialog">
                <For each={EMOJIS}>
                  {(e) => (
                    <button onClick={() => insert(e)} title={e}>
                      {e}
                    </button>
                  )}
                </For>
                <small class="muted">:) :D ;) :( :P :O &lt;3 xD :'( 8) :+1:</small>
              </div>
            </Show>
            <button class="icon-btn femo-btn" classList={{ on: picker() }} title="İfadeler" onClick={() => setPicker(!picker())}>
              <Smile />
            </button>
            <textarea
              ref={ta}
              class="input"
              rows={1}
              maxLength={1000}
              placeholder="Mesaj yaz…"
              disabled={proLocked(F.messages)}
              title="Enter: gönder · Shift+Enter: yeni satır"
              value={text()}
              onInput={(e) => onInput(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  send();
                } else if (e.key === "Escape" && picker()) setPicker(false);
              }}
            />
            <button class="btn primary fsend" disabled={!text().trim() || sending()} title="Gönder" onClick={send}>
              <SendHorizontal />
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/** Gelen mesajı raporla: sebep + isteğe bağlı not (sohbetin altında satır içi) */
export function ReportMessage(props: {
  m: { id: string; body: string };
  name: string;
  /** Verilmezse "benden sil" düğmesi çıkmaz (grup sohbeti) */
  onHide?: () => void;
  onClose: () => void;
  /** Verilmezse 1:1 mesaj raporu (grup sohbeti kendi RPC'sini verir) */
  report?: (reason: string, note: string) => Promise<unknown>;
}) {
  const [reason, setReason] = createSignal("");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [err, setErr] = createSignal("");
  const submit = async () => {
    if (!reason() || busy()) return;
    setBusy(true);
    setErr("");
    try {
      await (props.report ? props.report(reason(), note().trim()) : reportMessage(props.m.id, reason(), note().trim()));
      setDone(true);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="freport" onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
      <div class="freport-head">
        <b>
          <I.Flag /> Mesajı raporla
        </b>
        <span class="lt-sp" />
        <button class="icon-btn" title="Kapat" onClick={props.onClose}>
          <I.X />
        </button>
      </div>
      <blockquote class="freport-quote" data-no-i18n>
        <small>{props.name || "?"}</small>
        <MsgText text={props.m.body.length > 240 ? `${props.m.body.slice(0, 240)}…` : props.m.body} />
      </blockquote>
      <Show
        when={!done()}
        fallback={
          <>
            <p class="success small">Teşekkürler, raporun yöneticilere iletildi.</p>
            <div class="freport-btns">
              <Show when={props.onHide}>
                <button class="btn ghost small" onClick={() => props.onHide?.()}>
                  <I.Trash /> Mesajı benden sil
                </button>
              </Show>
              <button class="btn primary small" onClick={props.onClose}>
                Tamam
              </button>
            </div>
          </>
        }
      >
        <div class="freport-reasons">
          <For each={MESSAGE_REPORT_REASONS}>
            {(r) => (
              <button class="fme-chip" classList={{ on: reason() === r.id }} aria-pressed={reason() === r.id} onClick={() => setReason(r.id)}>
                {r.label}
              </button>
            )}
          </For>
        </div>
        <textarea
          class="input"
          rows={2}
          maxLength={500}
          placeholder="Not (isteğe bağlı)"
          value={note()}
          onInput={(e) => setNote(e.currentTarget.value)}
        />
        <Show when={err()}>
          <p class="error small">{err()}</p>
        </Show>
        <div class="freport-btns">
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
          <button class="btn primary small" disabled={!reason() || busy()} onClick={submit}>
            {busy() ? "Gönderiliyor…" : "Raporla"}
          </button>
        </div>
      </Show>
    </div>
  );
}
