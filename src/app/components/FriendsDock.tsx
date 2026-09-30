// Arkadaş listesi (iRacing'deki sağ alt köşe listesi gibi): çevrimiçi / yarışta durumu, istekler,
// anlık mesajlar, güvenilir işaretleme (verilerimi görebilir) ve yarıştaki arkadaşın canlı verisi.
// Sadece giriş yapanlara görünür. Mesaj göndermek ve güvenilir işaretlemek PRO.

import { For, Show, createEffect, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { settings, updateSettings } from "@/sdk/settings";
import { syncAccountFriends } from "@/sdk/friends";
import { session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import {
  conversation,
  findPeople,
  friendRemove,
  friendRequest,
  friendRespond,
  friendSet,
  markRead,
  messageBeep,
  myFriends,
  onMessages,
  sendMessage,
  type Friend,
  type Message,
  type Person,
} from "@/cloud/social";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { editFriendLook, go } from "../ui";
import * as I from "../icons";
import FriendData from "./FriendData";

type View = { kind: "list" } | { kind: "chat"; f: Friend } | { kind: "live"; f: Friend } | { kind: "add" };

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

/** Arkadaş listesi paneli: panelin sağ altındaki kutuda ya da ayrı "Arkadaşlar" penceresinde */
export function FriendsPanel(props: { standalone?: boolean; open: () => boolean; onClose?: () => void; racing?: () => boolean; onCounts?: (online: number, badge: number) => void }) {
  const nav: Nav = props.standalone
    ? { pro: () => panelGo({ sec: "pro" }), look: (id) => panelGo({ friend: id }) }
    : { pro: () => go("pro"), look: (id) => editFriendLook(id) };
  const [view, setView] = createSignal<View>({ kind: "list" });
  let lastList: Friend[] = [];
  const [list, { refetch, mutate }] = createResource<Friend[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      try {
        lastList = (await myFriends()) ?? [];
        // Kabul edilen arkadaşlar Arkadaşlar sayfasındaki listeye (renk/simge ayarıyla) otomatik eklenir
        syncAccountFriends(lastList);
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
          const v = view();
          const chatting = props.open() && v.kind === "chat" && v.f.friend_id === m.sender;
          if (!chatting) mutate(friends().map((f) => (f.friend_id === m.sender ? { ...f, unread: (f.unread || 0) + 1 } : f)));
          const muted = friends().find((f) => f.friend_id === m.sender)?.muted;
          // Yarışta değilken panel ses çalar (yarıştayken overlay ekranı gösterir)
          if (!props.racing?.() && settings().general.social.sound && !settings().general.social.dnd && !muted && !chatting) messageBeep();
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

  return (
    <div class="fdock-panel" classList={{ standalone: !!props.standalone }} onContextMenu={(e) => e.preventDefault()}>
      <header>
        <Show when={view().kind !== "list"}>
          <button class="icon-btn" title="Geri" onClick={() => setView({ kind: "list" })}>
            <I.ChevronLeft />
          </button>
        </Show>
        <b>
          {view().kind === "chat"
            ? (view() as { f: Friend }).f.display_name
            : view().kind === "live"
              ? t("{0} · canlı veri", (view() as { f: Friend }).f.display_name)
              : view().kind === "add"
                ? "Arkadaş ekle"
                : "Arkadaşlar"}
        </b>
        <span class="lt-sp" />
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
        <div class="fdock-list">
          <Show when={friends().length > 0} fallback={<p class="muted small fdock-empty">Henüz arkadaşın yok. Sağ üstten ekleyebilirsin.</p>}>
            <Show when={friends().some((f) => f.status !== "accepted")}>
              <div class="fdock-sec">
                Onay bekleyenler <i>{friends().filter((f) => f.status !== "accepted").length}</i>
              </div>
              <For each={[...friends().filter((f) => f.status === "pending_in"), ...friends().filter((f) => f.status === "pending_out")]}>
                {(f) => <FriendRow f={f} nav={nav} onChat={() => {}} onLive={() => {}} act={act} />}
              </For>
              <div class="fdock-sec">Arkadaşlar</div>
            </Show>
            <For each={accepted().slice().sort((a, b) => Number(b.racing) - Number(a.racing) || Number(b.online) - Number(a.online) || a.display_name.localeCompare(b.display_name))}>
              {(f) => <FriendRow f={f} nav={nav} onChat={() => setView({ kind: "chat", f })} onLive={() => setView({ kind: "live", f })} act={act} />}
            </For>
          </Show>
        </div>
      </Show>
      <Show when={view().kind === "add"}>
        <AddFriend friends={friends()} act={act} />
      </Show>
      <Show when={view().kind === "chat"}>
        <Chat
          f={(view() as { f: Friend }).f}
          incoming={incoming()}
          onRead={() => mutate(friends().map((x) => (x.friend_id === (view() as { f: Friend }).f.friend_id ? { ...x, unread: 0 } : x)))}
        />
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
  return (
    <div class="fdock-me">
      <label class="check" title="Yarıştayken mesajlar ekranda gösterilmez ve ses çalmaz; sadece alt köşede sayaç görünür">
        <input type="checkbox" checked={soc().dnd} onChange={(e) => set("dnd", e.currentTarget.checked)} />
        <span>Rahatsız etme</span>
      </label>
      <label class="check" title="Kapalıyken kimse sana mesaj gönderemez">
        <input type="checkbox" checked={soc().acceptMessages} onChange={(e) => set("acceptMessages", e.currentTarget.checked)} />
        <span>Mesajlar açık</span>
      </label>
      <label class="check">
        <input type="checkbox" checked={soc().sound} onChange={(e) => set("sound", e.currentTarget.checked)} />
        <span>Ses</span>
      </label>
    </div>
  );
}

function statusText(f: Friend) {
  if (f.status === "pending_in") return t("Arkadaşlık isteği gönderdi");
  if (f.status === "pending_out") return t("İstek gönderildi");
  if (f.racing) return [f.session, f.track, f.car].filter(Boolean).join(" · ") || t("Yarışta");
  if (f.online) return f.dnd ? t("Çevrimiçi · rahatsız etme") : t("Çevrimiçi");
  return f.last_seen ? t("Son görülme: {0}", new Date(f.last_seen).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" })) : t("Çevrimdışı");
}

function FriendRow(props: { f: Friend; nav: Nav; onChat: () => void; onLive: () => void; act: (fn: () => Promise<unknown>) => void }) {
  const f = () => props.f;
  const [menu, setMenu] = createSignal(false);
  return (
    <div
      class="frow"
      classList={{ racing: f().racing, online: f().online && !f().racing, pending: f().status !== "accepted" }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (f().status === "accepted") setMenu(true);
      }}
    >
      <i class="frow-dot" />
      <div class="frow-main" onClick={() => f().status === "accepted" && props.onChat()}>
        <b data-no-i18n>{f().display_name || "?"}</b>
        <small data-no-i18n={f().racing ? true : undefined} title={statusText(f())}>
          {statusText(f())}
        </small>
      </div>
      <Show when={f().unread > 0}>
        <span class="frow-unread">{f().unread}</span>
      </Show>
      <Show when={f().status === "pending_in"}>
        <button class="btn primary small" onClick={() => props.act(() => friendRespond(f().friend_id, true))}>
          Kabul et
        </button>
        <button class="btn ghost small" onClick={() => props.act(() => friendRespond(f().friend_id, false))}>
          Reddet
        </button>
      </Show>
      <Show when={f().status === "pending_out"}>
        <button class="btn ghost small" onClick={() => props.act(() => friendRemove(f().friend_id))}>
          İptal
        </button>
      </Show>
      <Show when={f().status === "accepted"}>
        <Show when={f().trusts_me}>
          <button class="btn small live-btn" classList={{ idle: !f().racing }} title="Verilerini gör (yakıt, turlar, pistteki yeri)" onClick={props.onLive}>
            <I.Gauge /> Veriler
          </button>
        </Show>
        <Show when={f().trusted}>
          <span class="frow-trust" title="Güvenilir: yarışırken verilerini görebilir">
            <I.ShieldCheck />
          </span>
        </Show>
        <button class="icon-btn" title="Seçenekler" onClick={() => setMenu(!menu())}>
          <I.MoreVertical />
        </button>
      </Show>
      <Show when={menu()}>
        <div class="frow-menu" onMouseLeave={() => setMenu(false)}>
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
  const [res, setRes] = createSignal<Person[]>([]);
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
      <div class="fr-add">
        <input class="input" placeholder="Görünen ad ya da iRacing adı" value={q()} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <button class="btn small" disabled={busy()} onClick={search}>
          Ara
        </button>
      </div>
      <div class="fdock-list">
        <For each={res()}>
          {(p) => (
            <div class="frow">
              <div class="frow-main">
                <b data-no-i18n>{p.display_name || "?"}</b>
                <Show when={p.iracing_name}>
                  <small data-no-i18n>iRacing: {p.iracing_name}</small>
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
      <p class="muted small">
        İstek kabul edilince arkadaşının çevrimiçi ve yarışta olduğunu görürsün. "Güvenilir" işaretlediğin arkadaşların, sen yarışırken yakıt
        ve tur bilgilerini kod girmeden görebilir.
      </p>
    </div>
  );
}

function Chat(props: { f: Friend; incoming: Message | null; onRead: () => void }) {
  const [msgs, setMsgs] = createSignal<Message[]>([]);
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  let box: HTMLDivElement | undefined;
  const scroll = () => requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight));
  const me = () => session()?.user.id;
  onMount(async () => {
    setMsgs(await conversation(props.f.friend_id).catch(() => []));
    markRead(props.f.friend_id);
    props.onRead();
    scroll();
  });
  createEffect(
    on(
      () => props.incoming,
      (m) => {
        if (m && m.sender === props.f.friend_id && !msgs().some((x) => x.id === m.id)) {
          setMsgs([...msgs(), m]);
          markRead(props.f.friend_id);
          scroll();
        }
      },
      { defer: true },
    ),
  );
  const send = async () => {
    const b = text().trim();
    if (!b) return;
    setErr("");
    try {
      const id = await sendMessage(props.f.friend_id, b);
      setMsgs([...msgs(), { id: String(id), sender: me()!, recipient: props.f.friend_id, body: b, created_at: new Date().toISOString(), read_at: null }]);
      setText("");
      scroll();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  return (
    <div class="fchat">
      <div class="fchat-msgs" ref={box}>
        <Show when={msgs().length > 0} fallback={<p class="muted small fdock-empty">Henüz mesaj yok.</p>}>
          <For each={msgs()}>
            {(m) => (
              <div class="fmsg" classList={{ mine: m.sender === me() }}>
                <p data-no-i18n>{m.body}</p>
                <small>{new Date(m.created_at).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show
        when={isPro()}
        fallback={
          <button class="btn ghost pro-lock" onClick={() => go("pro")}>
            <I.Lock /> Mesaj göndermek PRO özelliğidir
          </button>
        }
      >
        <Show when={props.f.accept_messages} fallback={<p class="muted small">Bu kişi mesajları kapatmış.</p>}>
          <div class="fr-add">
            <input
              class="input"
              maxLength={1000}
              placeholder="Mesaj yaz"
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button class="btn small" onClick={send}>
              Gönder
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
