// Arkadaş listesi (iRacing'deki sağ alt köşe listesi gibi): çevrimiçi / yarışta durumu, istekler,
// anlık mesajlar, güvenilir işaretleme (verilerimi görebilir) ve yarıştaki arkadaşın canlı verisi.
// Sadece giriş yapanlara görünür. Mesajlaşmak herkese açık; mesajı/sohbeti kendi görünümünden silme ve
// gelen mesajı raporlama sağ tıkla. Veri paylaşımı (güvenilir işaretleme) ve arkadaş görünümünü özelleştirme PRO.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
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
  hashColor,
  hideMessage,
  initialOf,
  markRead,
  messageBeep,
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
import FriendData from "./FriendData";
import { ProfileDialog, SimBadge, SIM_SHORT } from "./Profile";
import { TeamChat, TeamLogo, type TeamEvent } from "./TeamChat";
import { crewDrivers, crewList as myCrewList, crewSet, setCrewFocus, type CrewMember } from "@/cloud/crew";
import { muteTeamChat, myTeams, onTeamChat, setTeamFocus, type MyTeam, type TeamMessage } from "@/cloud/teams";
import { ChatStage, chatLookClass, chatLookStyle } from "../chatLook";
import { BgNote, ConvBgPanel, ConvBgRequest, adoptBg, useConvBg } from "./ConvBg";
import { MsgMenu, msgClickOpens, msgMenuPos } from "./MsgMenu";
import { GroupAvatar, GroupChat, NewGroup, type GroupEvent, type GroupPanel } from "./GroupChat";
import { muteGroup, myGroups, onGroupChat, type GroupMessage, type MyGroup } from "@/cloud/groups";
import { broadcastOvMsg, ovMsgShowsPerson, ovMsgTogglePerson } from "@/sdk/ovmsg";
import "../friends.css";
import "../teams.css";

type View =
  | { kind: "list" }
  | { kind: "chat"; f: Friend }
  | { kind: "live"; f: Friend }
  | { kind: "add" }
  | { kind: "team"; t: MyTeam }
  | { kind: "group"; g: MyGroup }
  | { kind: "newgroup" };
type Presence = "racing" | "online" | "dnd" | "offline" | "pending";

/** Pencere dışından (ayrı arkadaş penceresi) panele yönlendirme */
function panelGo(what: { sec?: string; sub?: string; friend?: string; team?: string; crew?: string }) {
  invoke("panel_front").catch(() => {});
  setTimeout(() => emit("panel-go", what).catch(() => {}), 400);
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
}

function presence(f: Friend): Presence {
  if (f.status !== "accepted") return "pending";
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
    ? { pro: () => panelGo({ sec: "pro" }), look: (id) => panelGo({ friend: id }), team: (id) => panelGo({ sec: "drivers", sub: "teams", team: id }), crew: (id) => panelGo({ sec: "drivers", sub: "crew", crew: id }) }
    : { pro: () => go("pro"), look: (id) => editFriendLook(id), team: (id) => (setTeamFocus(id), go("drivers", "teams")), crew: (id) => (setCrewFocus(id), go("drivers", "crew")) };
  const [view, setView] = createSignal<View>({ kind: "list" });
  /** Profil penceresi açık olan üye */
  const [profileOf, setProfileOf] = createSignal<string | null>(null);
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
          const muted = fr?.muted || fr?.sound_muted;
          // Bu pencere öndeyken ses burada çalar; arkadaysa sağ alttaki açılır pencere sesi çalar
          // (yarıştayken overlay ekranı gösterir)
          const front = !inTauri || document.hasFocus();
          if (front && !props.racing?.() && settings().general.social.sound && !settings().general.social.dnd && !muted && !chatting) messageBeep();
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
            if (front && !props.racing?.() && soc.sound && !soc.dnd) messageBeep();
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
        if (front && !props.racing?.() && soc.sound && !soc.dnd) messageBeep();
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

  // Sağ tık menüsü: arkadaşı ekibime ekle / yetkisini değiştir / çıkar (crew_set; değiştirebilir => görebilir)
  const setCrewRole = async (f: Friend, view: boolean, control: boolean) => {
    setErr("");
    setMineCrew((l) => {
      const rest = (l ?? []).filter((m) => m.member_id !== f.friend_id);
      if (!view && !control) return rest;
      const cur = (l ?? []).find((m) => m.member_id === f.friend_id);
      return [...rest, { member_id: f.friend_id, display_name: f.display_name, avatar_path: f.avatar_path ?? null, can_view: true, can_control: control, watching: !!cur?.watching, seen_at: cur?.seen_at ?? null }];
    });
    try {
      await crewSet(f.friend_id, view || control, control);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    // Overlay penceresindeki ekip servisi ve Ayarlar › Paylaşım › Ekip yenilensin
    void emit("crew-refresh").catch(() => {});
    void emit("crew-changed").catch(() => {});
    void refetchMine();
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
  const lastTs = (f: Friend) => {
    const m = last()[f.friend_id];
    return m ? new Date(m.created_at).getTime() : 0;
  };
  const groups = createMemo(() => {
    const s = norm(q().trim());
    const match = (f: Friend) => !s || norm(`${f.display_name} ${f.iracing_name ?? ""}`).includes(s);
    const all = friends().filter(match);
    // Okunmamış mesajı olan ve son yazışılan üstte, sonra ada göre
    const byName = (a: Friend, b: Friend) => a.display_name.localeCompare(b.display_name, localeTag());
    const sort = (a: Friend, b: Friend) => Number(b.unread > 0) - Number(a.unread > 0) || lastTs(b) - lastTs(a);
    const acc = all.filter((f) => f.status === "accepted");
    return [
      { key: "pending", title: "Onay bekleyenler", list: [...all.filter((f) => f.status === "pending_in"), ...all.filter((f) => f.status === "pending_out")] },
      { key: "racing", title: "Yarışta", list: acc.filter((f) => f.racing).sort((a, b) => sort(a, b) || byName(a, b)) },
      { key: "online", title: "Çevrimiçi", list: acc.filter((f) => f.online && !f.racing).sort((a, b) => sort(a, b) || byName(a, b)) },
      {
        key: "offline",
        title: "Çevrimdışı",
        list: acc
          .filter((f) => !f.online && !f.racing)
          .sort((a, b) => sort(a, b) || (b.last_seen ?? "").localeCompare(a.last_seen ?? "") || byName(a, b)),
      },
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
            {v.kind === "live" ? t("{0} · canlı veri", f.display_name) : f.display_name} <SimBadge sim={f.online ? f.sim : ""} />
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
        <Show when={view().kind === "chat" && cur((view() as { f: Friend }).f).trusts_me}>
          <button class="icon-btn" title="Canlı veri: yakıt, turlar, pistteki yeri" onClick={() => setView({ kind: "live", f: (view() as { f: Friend }).f })}>
            <I.Gauge />
          </button>
        </Show>
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
        <Show when={view().kind === "live"}>
          <button class="icon-btn" title="Ayrı pencerede aç" onClick={() => openFriendWindow((view() as { f: Friend }).f)}>
            <I.ExternalLink />
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
              <For each={groupRows()}>{(g) => <GroupRow g={g} onOpen={() => setView({ kind: "group", g })} />}</For>
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
                            onCrewRole={(v, c) => void setCrewRole(f, v, c)}
                            onChat={() => setView({ kind: "chat", f })}
                            onLive={() => setView({ kind: "live", f })}
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
      <Show when={view().kind === "live"}>
        <FriendData f={(view() as { f: Friend }).f} />
      </Show>
      <Show when={profileOf()}>
        {(id) => <ProfileDialog id={id()} onClose={() => setProfileOf(null)} onTeam={nav.team} />}
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
function GroupRow(props: { g: MyGroup; onOpen: () => void }) {
  const g = () => props.g;
  const who = () => (g().last_system ? null : g().last_sender === session()?.user.id ? t("Sen") : g().last_sender_name);
  return (
    <div class="frow troom" classList={{ unread: g().unread > 0 && !g().muted }} onClick={props.onOpen}>
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
          <small class="frow-prev" data-no-i18n={g().last_body ? true : undefined}>
            <Show when={g().last_body} fallback={t("{0} üye · henüz mesaj yok", g().member_count)}>
              <Show when={who()}>
                <span class="frow-you">{who()}: </span>
              </Show>
              <MsgText text={g().last_body!} />
            </Show>
          </small>
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
          <small class="frow-prev" data-no-i18n={tm().last_body ? true : undefined}>
            <Show when={tm().last_body} fallback={t("{0} üye · henüz mesaj yok", tm().member_count)}>
              <Show when={tm().last_sender}>
                <span class="frow-you">{tm().last_sender}: </span>
              </Show>
              {tm().last_poll ? "📊 " : ""}
              <MsgText text={tm().last_body!} />
            </Show>
          </small>
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

function MyStatusBar() {
  const soc = () => settings().general.social;
  const set = (k: "dnd" | "acceptMessages" | "sound", v: boolean) => updateSettings((d) => (d.general.social[k] = v));
  const chip = (k: "dnd" | "acceptMessages" | "sound", icon: JSX.Element, label: string, title: string) => (
    <button class={`fme-chip c-${k}`} classList={{ on: soc()[k] }} aria-pressed={soc()[k]} title={title} onClick={() => set(k, !soc()[k])}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div class="fdock-me">
      {chip("dnd", <I.BellOff />, "Rahatsız etme", "Açıkken mesaj bildirimi gösterilmez ve ses çalmaz; yarışta sadece alt köşede sayaç görünür")}
      {chip("acceptMessages", <I.MessageSquare />, "Mesajlar açık", "Kapalıyken kimse sana mesaj gönderemez")}
      {chip("sound", soc().sound ? <I.Volume2 /> : <I.VolumeX />, "Ses", "Yeni mesajda kısa bir ses çal")}
    </div>
  );
}

function statusText(f: Friend) {
  if (f.status === "pending_in") return t("Arkadaşlık isteği gönderdi");
  if (f.status === "pending_out") return t("İstek gönderildi");
  if (f.racing) return [f.session, f.track, f.car].filter(Boolean).join(" · ") || (f.sim && SIM_SHORT[f.sim] ? t("Oyunda: {0}", SIM_SHORT[f.sim]) : t("Yarışta"));
  if (f.online) return f.dnd ? t("Çevrimiçi · rahatsız etme") : t("Çevrimiçi");
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
  onCrewRole?: (view: boolean, control: boolean) => void;
  onChat: () => void;
  onLive: () => void;
  onProfile: () => void;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const f = () => props.f;
  const [menu, setMenu] = createSignal(false);
  const [up, setUp] = createSignal(false);
  let el: HTMLDivElement | undefined;
  const openMenu = () => {
    // Listenin altındaysa menü yukarı açılır
    const r = el?.getBoundingClientRect();
    setUp(!!r && r.bottom + 380 > window.innerHeight && r.top > 300);
    setMenu(true);
  };
  const mine = () => props.last && props.last.sender !== f().friend_id;
  const second = () => {
    if (f().status !== "accepted" || f().racing || !props.last) return null;
    return props.last;
  };
  return (
    <div
      ref={el}
      class="frow"
      classList={{ racing: f().racing, online: f().online && !f().racing, pending: f().status !== "accepted", unread: f().unread > 0, menu: menu() }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (f().status === "accepted") openMenu();
      }}
    >
      <button class="fav-btn" title="Profili gör" onClick={props.onProfile}>
        <Avatar id={f().friend_id} name={f().display_name} presence={presence(f())} />
      </button>
      <div class="frow-main" onClick={() => f().status === "accepted" && props.onChat()}>
        <div class="frow-l1">
          <b data-no-i18n>{f().display_name || "?"}</b>
          <SimBadge sim={f().online ? f().sim : ""} />
          <Show when={f().trusted}>
            <span
              class="frow-flag trust"
              classList={{ off: proLocked("social.data_share") }}
              title={!proLocked("social.data_share") ? "Güvenilir: yarışırken verilerini görebilir" : "Güvenilir, ama verilerin paylaşılmıyor: veri paylaşımı PRO üyelere özel"}
            >
              <I.ShieldCheck />
            </span>
          </Show>
          <Show when={f().muted}>
            <span class="frow-flag" title="Mesajlarını kapattın">
              <I.MessageSquare />
            </span>
          </Show>
          <Show when={!f().muted && f().notify_muted}>
            <span class="frow-flag" title="Bildirimlerini kapattın">
              <I.BellOff />
            </span>
          </Show>
          <Show when={!f().muted && f().sound_muted}>
            <span class="frow-flag" title="Sesini kapattın">
              <I.VolumeX />
            </span>
          </Show>
          <span class="lt-sp" />
          <Show when={f().status === "accepted" && props.last}>
            <time>{shortTime(props.last!.created_at)}</time>
          </Show>
        </div>
        <div class="frow-l2">
          <Show
            when={second()}
            fallback={
              <small class="frow-status" data-no-i18n={f().racing ? true : undefined} title={statusText(f())}>
                <Show when={f().racing}>
                  <I.Flag />
                </Show>
                {statusText(f())}
              </small>
            }
          >
            {(m) => (
              <small class="frow-prev" title={msgPreview(m())} data-no-i18n>
                <Show when={mine()}>
                  <span class="frow-you">{t("Sen:")} </span>
                </Show>
                <MsgText text={msgPreview(m())} />
              </small>
            )}
          </Show>
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
          <Show when={f().trusts_me}>
            <button class="icon-btn live" classList={{ idle: !f().racing }} title="Verilerini gör (yakıt, turlar, pistteki yeri)" onClick={props.onLive}>
              <I.Gauge />
            </button>
          </Show>
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
        <div class="frow-menu" classList={{ up: up() }} onMouseLeave={() => setMenu(false)}>
          <button onClick={() => (setMenu(false), props.onChat())}>
            <I.MessageSquare /> Mesaj
          </button>
          <button onClick={() => (setMenu(false), props.onProfile())}>
            <I.User /> Profili gör
          </button>
          <Show
            when={f().trusts_me}
            fallback={
              <button disabled title="PRO üye olan arkadaşın seni güvenilir işaretleyince yakıtını, turlarını ve pistteki yerini görebilirsin">
                <I.Gauge /> Canlı veri (seninle paylaşmıyor)
              </button>
            }
          >
            <button onClick={() => (setMenu(false), props.onLive())}>
              <I.Gauge /> Canlı veri: yakıt, turlar, pistteki yeri
            </button>
            <button onClick={() => (setMenu(false), openFriendWindow(f()))}>
              <I.ExternalLink /> Canlı veriyi ayrı pencerede aç
            </button>
          </Show>
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
          <Show
            when={!proLocked("social.data_share")}
            fallback={
              <>
                <Show when={f().trusted}>
                  <button onClick={() => (setMenu(false), props.act(() => friendSet(f().friend_id, false, f().muted)))}>
                    <I.ShieldCheck /> Güvenilirden çıkar
                  </button>
                </Show>
                <button onClick={() => (setMenu(false), props.nav.pro())} title={SHARE_PRO_HINT}>
                  <I.Lock /> Verilerimi paylaş <span class="pro-badge small">PRO</span>
                </button>
                <p class="frow-menu-note">{SHARE_PRO_HINT}</p>
              </>
            }
          >
            <button onClick={() => (setMenu(false), props.act(() => friendSet(f().friend_id, !f().trusted, f().muted)))}>
              <I.ShieldCheck /> {f().trusted ? "Güvenilirden çıkar" : "Güvenilir işaretle (verilerimi görsün)"}
            </button>
          </Show>
          <Show when={props.crew}>
            <button onClick={() => (setMenu(false), props.nav.crew(f().friend_id))} title="Ekip Pitwall'ı: çevresindeki araçları, farkları ve spotter durumunu canlı izle, hazır mesaj gönder">
              <I.Gauge /> Pitwall'ını izle
            </button>
          </Show>
          <Show when={props.onCrewRole}>
            <button
              classList={{ on: !!props.crewRole }}
              onClick={() => (setMenu(false), props.crewRole === "view" ? props.onCrewRole!(false, false) : props.onCrewRole!(true, false))}
              title="Ekibine ekle: sen yarışırken yarış bilgilerini (yakıt, tur, pit servisi) ve canlı pitwall'ını izleyebilir. İzleme yetkisi ücretsizdir."
            >
              {props.crewRole ? <I.Check /> : <I.Eye />} Ekibe ekle (görebilir)
            </button>
            <button
              classList={{ on: props.crewRole === "control" }}
              disabled={proLocked(F.crew) && props.crewRole !== "control"}
              onClick={() => (setMenu(false), props.crewRole === "control" ? props.onCrewRole!(true, false) : props.onCrewRole!(true, true))}
              title="Ekibine ekle: izleyebilir ve pit ayarlarını (yakıt, lastik, hızlı tamir) senin yerine değiştirebilir. PRO üyelere özel."
            >
              {props.crewRole === "control" ? <I.Check /> : <Wrench />} Pit ayarlarını değiştirebilir <ProLockTag feature={F.crew} />
            </button>
            <Show when={props.crewRole}>
              <button onClick={() => (setMenu(false), props.onCrewRole!(false, false))}>
                <I.UserMinus /> Ekipten çıkar
              </button>
            </Show>
          </Show>
          <button
            onClick={() => (setMenu(false), props.act(() => setFriendPrefs(f().friend_id, !f().notify_muted, !!f().sound_muted)))}
            title="Kapalıyken bu arkadaştan gelen mesajlarda açılır pencere ve oyun içi bildirim gösterilmez (mesajlar yine gelir)"
          >
            <I.BellOff /> {f().notify_muted ? "Bildirimleri aç" : "Bildirimleri kapat"}
          </button>
          <button
            onClick={() => (setMenu(false), props.act(() => setFriendPrefs(f().friend_id, !!f().notify_muted, !f().sound_muted)))}
            title="Kapalıyken bu arkadaştan gelen mesajlarda ses çalmaz"
          >
            {f().sound_muted ? <I.Volume2 /> : <I.VolumeX />} {f().sound_muted ? "Sesi aç" : "Sesi kapat"}
          </button>
          <button onClick={() => (setMenu(false), props.act(() => friendSet(f().friend_id, f().trusted, !f().muted)))}>
            <I.MessageSquare /> {f().muted ? "Mesajlarını aç" : "Mesajlarını kapat"}
          </button>
          <button
            onClick={() => {
              setMenu(false);
              ovMsgTogglePerson(
                f().friend_id,
                settings().friends.list.map((x) => x.accountId ?? "").filter(Boolean),
              );
            }}
            title="Yarışırken bu arkadaşın mesajları Mesajlar overlay'inde görünsün mü (overlay'i Overlay'ler bölümünden açabilirsin)"
          >
            <I.Monitor /> {ovMsgShowsPerson(f().friend_id) ? "Mesajlar overlay'inde gizle" : "Mesajlar overlay'inde göster"}
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
    markRead(props.f.friend_id);
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
          markRead(props.f.friend_id);
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
