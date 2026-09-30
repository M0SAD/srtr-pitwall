// Arkadaş listesi (iRacing'deki sağ alt köşe listesi gibi): çevrimiçi / yarışta durumu, istekler,
// anlık mesajlar, güvenilir işaretleme (verilerimi görebilir) ve yarıştaki arkadaşın canlı verisi.
// Sadece giriş yapanlara görünür. Mesaj göndermek ve güvenilir işaretlemek PRO.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { settings, updateSettings } from "@/sdk/settings";
import { session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import {
  conversation,
  findPeople,
  friendRemove,
  friendRequest,
  friendRespond,
  friendSet,
  getLive,
  markRead,
  messageBeep,
  myFriends,
  onLive,
  onMessages,
  sendMessage,
  type Friend,
  type LiveData,
  type Message,
  type Person,
} from "@/cloud/social";
import { appState } from "../App";
import { go } from "../ui";
import * as I from "../icons";

type View = { kind: "list" } | { kind: "chat"; f: Friend } | { kind: "live"; f: Friend } | { kind: "add" };

export function FriendsDock() {
  const [open, setOpen] = createSignal(false);
  const [view, setView] = createSignal<View>({ kind: "list" });
  const [list, { refetch, mutate }] = createResource(
    () => (session() ? session()!.user.id : null),
    () => myFriends().catch(() => [] as Friend[]),
  );
  const [err, setErr] = createSignal("");
  const friends = () => list() ?? [];
  const accepted = () => friends().filter((f) => f.status === "accepted");
  const online = () => accepted().filter((f) => f.online).length;
  const unread = () => friends().reduce((a, f) => a + (f.unread || 0), 0);
  const requests = () => friends().filter((f) => f.status === "pending_in").length;

  // Liste açıkken 20 sn'de bir, kapalıyken 60 sn'de bir yenile
  onMount(() => {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (open() || n % 3 === 0) refetch();
    }, 20_000);
    onCleanup(() => clearInterval(iv));
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
          const v = view();
          const chatting = open() && v.kind === "chat" && v.f.friend_id === m.sender;
          if (!chatting) mutate(friends().map((f) => (f.friend_id === m.sender ? { ...f, unread: (f.unread || 0) + 1 } : f)));
          // Yarışta değilken panel ses çalar (yarıştayken overlay ekranı gösterir)
          if (!appState().connected && settings().general.social.sound && !chatting) messageBeep();
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
    <Show when={session()}>
      <div class="fdock" classList={{ open: open() }}>
        <Show when={open()}>
          <div class="fdock-panel" onContextMenu={(e) => e.preventDefault()}>
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
              <Show when={view().kind === "list"}>
                <button class="icon-btn" title="Arkadaş ekle" onClick={() => setView({ kind: "add" })}>
                  <I.UserPlus />
                </button>
              </Show>
              <button class="icon-btn" title="Kapat" onClick={() => setOpen(false)}>
                <I.X />
              </button>
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
                  <For each={friends()}>
                    {(f) => (
                      <FriendRow
                        f={f}
                        onChat={() => setView({ kind: "chat", f })}
                        onLive={() => setView({ kind: "live", f })}
                        act={act}
                      />
                    )}
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
              <LiveView f={(view() as { f: Friend }).f} />
            </Show>
          </div>
        </Show>
        <button class="fdock-btn" onClick={() => (setOpen(!open()), setView({ kind: "list" }), refetch())}>
          <I.Users />
          <span>Arkadaşlar</span>
          <small>{t("{0} çevrimiçi", online())}</small>
          <Show when={unread() + requests() > 0}>
            <i class="fdock-badge">{unread() + requests()}</i>
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

function FriendRow(props: { f: Friend; onChat: () => void; onLive: () => void; act: (fn: () => Promise<unknown>) => void }) {
  const f = () => props.f;
  const [menu, setMenu] = createSignal(false);
  return (
    <div class="frow" classList={{ racing: f().racing, online: f().online && !f().racing, pending: f().status !== "accepted" }}>
      <i class="frow-dot" />
      <div class="frow-main" onClick={() => f().status === "accepted" && props.onChat()}>
        <b data-no-i18n>{f().display_name || "?"}</b>
        <small data-no-i18n={f().racing ? true : undefined}>{statusText(f())}</small>
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
        <Show when={f().racing && f().trusts_me}>
          <button class="btn small live-btn" title="Verilerini gör (yakıt, turlar…)" onClick={props.onLive}>
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
            when={isPro() || f().trusted}
            fallback={
              <button onClick={() => go("pro")} title="Kod vermeden güvenilir işaretleme PRO özelliğidir">
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

function LiveView(props: { f: Friend }) {
  const [d, setD] = createSignal<LiveData | null>(null);
  const [at, setAt] = createSignal(0);
  onMount(async () => {
    const r = await getLive(props.f.friend_id).catch(() => null);
    if (r) {
      setD(r.data);
      setAt(new Date(r.updated_at).getTime());
    }
    const stop = await onLive([props.f.friend_id], (_u, x) => {
      setD(x);
      setAt(Date.now());
    });
    onCleanup(stop);
  });
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(iv));
  const age = createMemo(() => Math.max(0, Math.round((now() - at()) / 1000)));
  const f1 = (v: number | undefined, u = "") => (v === undefined || !isFinite(v) ? "—" : `${v.toFixed(1)}${u}`);
  return (
    <div class="flive">
      <Show when={d()} fallback={<p class="muted small fdock-empty">Veri bekleniyor… (arkadaşın pistte olmalı)</p>}>
        <div class="flive-head" data-no-i18n>
          <b>
            #{d()!.number} {d()!.car}
          </b>
          <small>{[d()!.session, d()!.track].filter(Boolean).join(" · ")}</small>
        </div>
        <div class="flive-grid">
          <div>
            <small>Yakıt</small>
            <b>{f1(d()!.level, " L")}</b>
            <i>{Math.round((d()!.pct || 0) * 100)}%</i>
          </div>
          <div>
            <small>Kalan tur</small>
            <b>{f1(d()!.lapsLeft)}</b>
          </div>
          <div>
            <small>Tur başı</small>
            <b>{f1(d()!.usage, " L")}</b>
          </div>
          <div>
            <small>Bitiş için eklenecek</small>
            <b>{f1(d()!.refuel, " L")}</b>
          </div>
          <div>
            <small>Tur</small>
            <b>{d()!.lap}</b>
          </div>
          <div>
            <small>Pit</small>
            <b>{d()!.onPit ? t("Pitte") : "—"}</b>
          </div>
        </div>
        <small class="muted">{age() < 10 ? t("Canlı") : t("{0} sn önce", age())}</small>
        <p class="muted small">Bu veri Yakıt overlay'inin takım bölümünde ve SRTR Pitwall panelinde de görünür.</p>
      </Show>
    </div>
  );
}
