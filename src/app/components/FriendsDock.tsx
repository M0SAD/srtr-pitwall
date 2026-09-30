// Arkadaş listesi (iRacing'deki sağ alt köşe listesi gibi): çevrimiçi / yarışta durumu, istekler,
// anlık mesajlar, güvenilir işaretleme (verilerimi görebilir) ve yarıştaki arkadaşın canlı verisi.
// Sadece giriş yapanlara görünür. Mesaj göndermek ve güvenilir işaretlemek PRO.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { settings, updateSettings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import { inTauri } from "@/sdk/platform";
import { session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import {
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
  initialOf,
  markRead,
  messageBeep,
  myFriends,
  onMessages,
  recentMessages,
  sendMessage,
  type Friend,
  type Message,
  type Person,
} from "@/cloud/social";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { editFriendLook, go } from "../ui";
import * as I from "../icons";
import Smile from "lucide-solid/icons/face-slightly-smiling";
import SendHorizontal from "lucide-solid/icons/send-horizontal";
import FriendData from "./FriendData";
import "../friends.css";

type View = { kind: "list" } | { kind: "chat"; f: Friend } | { kind: "live"; f: Friend } | { kind: "add" };
type Presence = "racing" | "online" | "dnd" | "offline" | "pending";

/** Pencere dışından (ayrı arkadaş penceresi) panele yönlendirme */
function panelGo(what: { sec?: string; sub?: string; friend?: string }) {
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
    ? { pro: () => panelGo({ sec: "pro" }), look: (id) => panelGo({ friend: id }) }
    : { pro: () => go("pro"), look: (id) => editFriendLook(id) };
  const [view, setView] = createSignal<View>({ kind: "list" });
  const [last, setLast] = createSignal<Record<string, Message>>({});
  let lastList: Friend[] = [];
  const [list, { refetch, mutate }] = createResource<Friend[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        const [l, recent] = await Promise.all([myFriends(), recentMessages().catch(() => null)]);
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
  const [err, setErr] = createSignal("");
  const friends = () => list() ?? [];
  const accepted = () => friends().filter((f) => f.status === "accepted");
  const online = () => accepted().filter((f) => f.online).length;
  const unread = () => friends().reduce((a, f) => a + (f.unread || 0), 0);
  const requests = () => friends().filter((f) => f.status === "pending_in").length;
  createEffect(() => props.onCounts?.(online(), unread() + requests()));
  /** Görünümdeki arkadaşın en güncel hali (durum değişince başlık da güncellensin) */
  const cur = (f: Friend) => friends().find((x) => x.friend_id === f.friend_id) ?? f;
  const chatF = () => {
    const v = view();
    return v.kind === "chat" ? cur(v.f) : null;
  };
  const noteLast = (m: Message) => {
    const me = session()?.user.id;
    const other = m.sender === me ? m.recipient : m.sender;
    setLast({ ...last(), [other]: m });
  };

  // Liste açıkken 20 sn'de bir, kapalıyken 60 sn'de bir yenile
  onMount(() => {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (props.open() || n % 3 === 0) refetch();
    }, 20_000);
    onCleanup(() => clearInterval(iv));
  });
  createEffect(on(props.open, (o) => o && (setView({ kind: "list" }), refetch()), { defer: true }));

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
    if (!id || !list()) return;
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
          const muted = friends().find((f) => f.friend_id === m.sender)?.muted;
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

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refetch();
    } catch (e) {
      setErr(String((e as Error).message));
    }
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

  const title = () => {
    const v = view();
    if (v.kind === "add") return <b>Arkadaş ekle</b>;
    if (v.kind === "list")
      return (
        <div class="fhead-title">
          <b>Arkadaşlar</b>
          <small>{t("{0} çevrimiçi", online())}</small>
        </div>
      );
    const f = cur(v.f);
    return (
      <div class="fhead-who">
        <Avatar id={f.friend_id} name={f.display_name} size={30} presence={presence(f)} />
        <div class="fhead-title">
          <b data-no-i18n>{v.kind === "live" ? t("{0} · canlı veri", f.display_name) : f.display_name}</b>
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
        <Show when={view().kind === "live"}>
          <button class="icon-btn" title="Ayrı pencerede aç" onClick={() => openFriendWindow((view() as { f: Friend }).f)}>
            <I.ExternalLink />
          </button>
        </Show>
        <Show when={view().kind === "list"}>
          <button class="icon-btn" title="Arkadaş ekle" onClick={() => setView({ kind: "add" })}>
            <I.UserPlus />
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
        <Show when={friends().length > 0}>
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
          <Show
            when={friends().length > 0}
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
            <Show when={groups().length > 0} fallback={<p class="muted small fdock-empty">Eşleşen arkadaş yok.</p>}>
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
                            onChat={() => setView({ kind: "chat", f })}
                            onLive={() => setView({ kind: "live", f })}
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
            onRead={() => mutate(friends().map((x) => (x.friend_id === id ? { ...x, unread: 0 } : x)))}
          />
        )}
      </Show>
      <Show when={view().kind === "live"}>
        <FriendData f={(view() as { f: Friend }).f} />
      </Show>
    </div>
  );
}

export function FriendsDock(props: { racing?: () => boolean }) {
  const [open, setOpen] = createSignal(false);
  const [counts, setCounts] = createSignal<[number, number]>([0, 0]);
  return (
    <Show when={session()}>
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
  if (f.racing) return [f.session, f.track, f.car].filter(Boolean).join(" · ") || t("Yarışta");
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

function FriendRow(props: { f: Friend; last?: Message; nav: Nav; onChat: () => void; onLive: () => void; act: (fn: () => Promise<unknown>) => void }) {
  const f = () => props.f;
  const [menu, setMenu] = createSignal(false);
  const [up, setUp] = createSignal(false);
  let el: HTMLDivElement | undefined;
  const openMenu = () => {
    // Listenin altındaysa menü yukarı açılır
    const r = el?.getBoundingClientRect();
    setUp(!!r && r.bottom + 300 > window.innerHeight && r.top > 300);
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
      <Avatar id={f().friend_id} name={f().display_name} presence={presence(f())} />
      <div class="frow-main" onClick={() => f().status === "accepted" && props.onChat()}>
        <div class="frow-l1">
          <b data-no-i18n>{f().display_name || "?"}</b>
          <Show when={f().trusted}>
            <span class="frow-flag trust" title="Güvenilir: yarışırken verilerini görebilir">
              <I.ShieldCheck />
            </span>
          </Show>
          <Show when={f().muted}>
            <span class="frow-flag" title="Mesajlarını kapattın">
              <I.BellOff />
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
              <small class="frow-prev" title={m().body} data-no-i18n>
                <Show when={mine()}>
                  <span class="frow-you">{t("Sen:")} </span>
                </Show>
                <MsgText text={m().body} />
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
          <Show
            when={f().trusts_me}
            fallback={
              <button disabled title="Arkadaşın seni güvenilir işaretleyince yakıtını, turlarını ve pistteki yerini görebilirsin">
                <I.Gauge /> Canlı veri (seni güvenilir seçmedi)
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
          <button onClick={() => (setMenu(false), props.nav.look(f().friend_id))} title="Rengini, simgesini, fotoğrafını ve etiketini ona özel ayarla">
            <I.Palette /> Görünümü düzenle
          </button>
          <Show
            when={isPro() || f().trusted}
            fallback={
              <button onClick={() => props.nav.pro()} title="Kod vermeden güvenilir işaretleme PRO özelliğidir">
                <I.Lock /> Güvenilir işaretle (PRO)
              </button>
            }
          >
            <button onClick={() => (setMenu(false), props.act(() => friendSet(f().friend_id, !f().trusted, f().muted)))}>
              <I.ShieldCheck /> {f().trusted ? "Güvenilirden çıkar" : "Güvenilir işaretle (verilerimi görsün)"}
            </button>
          </Show>
          <button onClick={() => (setMenu(false), props.act(() => friendSet(f().friend_id, f().trusted, !f().muted)))}>
            <I.BellOff /> {f().muted ? "Mesajlarını aç" : "Mesajlarını kapat"}
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
                <button class="btn primary small" onClick={() => props.act(() => friendRequest(p.id))}>
                  <I.UserPlus /> Ekle
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
      <p class="muted small fadd-help">
        İstek kabul edilince arkadaşının çevrimiçi ve yarışta olduğunu görürsün. "Güvenilir" işaretlediğin arkadaşların, sen yarışırken yakıt
        ve tur bilgilerini kod girmeden görebilir.
      </p>
    </div>
  );
}

/** Seçilebilen ifadeler */
const EMOJIS = [
  "😀", "😄", "😂", "🤣", "😊", "🙂", "😉", "😍",
  "😘", "😎", "🤔", "😮", "😢", "😭", "😡", "🙁",
  "😛", "😆", "😅", "🙃", "😴", "🥳", "🤯", "😬",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "👋", "🤝",
  "❤️", "🔥", "💯", "🎉", "🏁", "🏆", "🚗", "⛽",
];

function dayLabel(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t("Bugün");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("Dün");
  return d.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function Chat(props: { f: Friend; incoming: Message | null; nav: Nav; onRead: () => void; onSent: (m: Message) => void }) {
  const [msgs, setMsgs] = createSignal<Message[]>([]);
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
        !!a && !!b && a.sender === b.sender && Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 5 * 60_000 && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
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
  // Seçici dışına tıklayınca kapanır
  const outside = (e: MouseEvent) => {
    if (picker() && !(e.target as HTMLElement).closest(".femo, .femo-btn")) setPicker(false);
  };
  document.addEventListener("mousedown", outside);
  onCleanup(() => document.removeEventListener("mousedown", outside));

  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  return (
    <div class="fchat">
      <div class="fchat-msgs" ref={box}>
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
              ) : (
                <div
                  class="fmsg"
                  classList={{ mine: r.m.sender === me(), first: r.first, tail: r.lastOfRun, jumbo: emojiOnly(emojify(r.m.body)) }}
                  title={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
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
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show
        when={isPro()}
        fallback={
          <button class="btn ghost pro-lock" onClick={() => props.nav.pro()}>
            <I.Lock /> Mesaj göndermek PRO özelliğidir
          </button>
        }
      >
        <Show when={props.f.accept_messages} fallback={<p class="muted small fchat-off">Bu kişi mesajları kapatmış.</p>}>
          <div class="fcompose">
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
