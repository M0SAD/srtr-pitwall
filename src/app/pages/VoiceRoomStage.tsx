// Ses odası görünümü (Discord benzeri): üst çubuk, ortada kişi kutuları (konuşan yeşil çerçeve), altta denetim çubuğu,
// sağda açılır panel: Sohbet (c121) / Söz sırası / Arkadaş davet et / Oda ayarları. Kişiye tıklayınca kişi menüsü açılır.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { initialOf } from "@/cloud/social";
import { cachedAvatar, loadAvatars } from "@/cloud/profile";
import { settings, uiPref } from "@/sdk/settings";
import {
  voiceDismissRequest,
  voiceExtend,
  voiceGrant,
  voiceGrantNext,
  voiceRequestFloor,
  voiceRevoke,
  voiceRoomNewCode,
  voiceRoomUpdate,
  type VoiceRole,
} from "@/cloud/voiceRooms";
import {
  amAdmin,
  amMod,
  canSpeak,
  grantUntil,
  inputMode,
  isTalking,
  leaveRoom,
  levelOf,
  requested,
  roleOf,
  toggleDeafen,
  toggleMic,
  transmitting,
  voice,
  type VoiceMember,
} from "@/voice/engine";
import { chatErr, chatHasOlder, chatLoading, chatMsgs, chatUnread, deleteChat, loadOlder, sendChat, senderName, setChatVisible } from "@/voice/chatStore";
import { askConfirm } from "../confirm";
import { RoomIcon } from "../components/RoomIcon";
import { movedNotice } from "@/voice/moveWatch";
import { act, actErr, openPersonMenu, personDrag, personMenu, setActErr, startPersonDrag, tint } from "../components/VoicePeople";
import { Switch } from "../components/SettingsForm";
import { LinkA, LinkPreview, splitLinks } from "../components/LinkPreview";
import * as I from "../icons";
import { go } from "../ui";
import { Countdown, InvitePanel, KIND_LABEL, RoomSettings, TALK_CHOICES, clock, errText, fmtSec, waitText } from "./voiceRoomParts";

type Side = "chat" | "queue" | "invite" | "settings" | "";
const [side, setSide] = uiPref<Side>("voice.room.side", "chat");

const me = () => session()?.user.id ?? "";
const moderated = () => (voice.state()?.mode ?? voice.room()?.mode) === "moderated";
const roleFor = (u: string): VoiceRole => (voice.room()?.owner === u ? "owner" : roleOf(u));

export function VoiceRoomStage() {
  const r = () => voice.room();
  const st = () => voice.state();
  createEffect(() => {
    const ids = voice.members().map((m) => m.user_id);
    if (ids.length) void loadAvatars(ids);
  });
  createEffect(() => setChatVisible(side() === "chat"));
  onCleanup(() => setChatVisible(false));
  // Yetki gidince ilgili panel kapanır
  createEffect(() => {
    if (side() === "queue" && !(moderated() && amMod())) setSide("chat");
    if (side() === "settings" && !amAdmin()) setSide("chat");
  });

  const rank = (u: string) => {
    const ro = roleFor(u);
    if (ro === "owner" || ro === "admin") return 0;
    if (ro === "mod") return 1;
    if (ro === "speaker" || grantUntil(u)) return 2;
    return 3;
  };
  // Konuşabilenler önde
  const sorted = createMemo(() =>
    [...voice.members()].sort((a, b) => {
      const ra = rank(a.user_id),
        rb = rank(b.user_id);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    }),
  );
  const cols = () => {
    const n = sorted().length;
    return n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5;
  };
  const toggle = (s: Side) => setSide(side() === s ? "" : s);
  const reqCount = () => st()?.requests.length ?? 0;

  return (
    <div class="vrs" classList={{ "with-side": !!side() }}>
      <div class="vrs-main">
        <header class="vrs-top">
          <span class="vrs-top-ic">
            <RoomIcon icon={r()?.icon} kind={r()?.kind ?? "public"} />
          </span>
          <b class="vrs-top-name" data-no-i18n>
            {r()?.name ?? "…"}
          </b>
          <Show when={moderated()}>
            <span class="vr-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
              <I.Hand />
            </span>
          </Show>
          <span class="vrs-top-sep" />
          <span class="vrs-top-desc muted">
            <Show when={st()?.description || r()?.description} fallback={r() ? t(KIND_LABEL[r()!.kind]) : ""}>
              <span data-no-i18n>{st()?.description || r()?.description}</span>
            </Show>
          </span>
          <span class="vrs-top-sp" />
          <Show when={voice.status() === "connecting" || voice.status() === "reconnecting"}>
            <span class="vrs-conn">{voice.status() === "reconnecting" ? t("Bağlantı koptu, yeniden bağlanılıyor…") : t("Bağlanıyor…")}</span>
          </Show>
          <span class="vrs-top-count" title={t("Odada / en çok")}>
            <I.Users /> {voice.members().length}/{st()?.max_members ?? r()?.max_members ?? "?"}
          </span>
          <Show when={moderated() && amMod()}>
            <TopBtn on={side() === "queue"} title={t("Söz sırası")} badge={reqCount()} onClick={() => toggle("queue")}>
              <I.Hand />
            </TopBtn>
          </Show>
          <TopBtn on={side() === "invite"} title={t("Arkadaş davet et")} onClick={() => toggle("invite")}>
            <I.MailPlus />
          </TopBtn>
          <TopBtn on={side() === "chat"} title={t("Sohbet")} badge={side() === "chat" ? 0 : chatUnread()} onClick={() => toggle("chat")}>
            <I.MessageSquare />
          </TopBtn>
          <Show when={amAdmin()}>
            <TopBtn on={side() === "settings"} title={t("Oda ayarları")} onClick={() => toggle("settings")}>
              <I.Settings />
            </TopBtn>
          </Show>
        </header>

        <Show when={movedNotice()}>
          {(n) => (
            <p class="vr-hint vrs-msg vrs-moved">
              <I.ArrowRightLeft /> {n().by ? t("{0} seni “{1}” odasına taşıdı.", n().by, n().room) : t("“{0}” odasına taşındın.", n().room)}
            </p>
          )}
        </Show>
        <Show when={actErr() || voice.error()}>
          <p class="vr-err vrs-msg">{actErr() || voice.error()}</p>
        </Show>
        <Show when={inputMode() === "ptt" && !settings().general.voiceRoom.key && !settings().general.voiceRoom.button}>
          <p class="vr-hint vrs-msg">Bas-konuş için bir tuş ya da direksiyon düğmesi ata (Ses ayarları).</p>
        </Show>

        <div class="vrs-stage">
          <div class="vrs-grid" style={{ "--cols": String(cols()) }}>
            <For each={sorted()}>{(m) => <Tile m={m} />}</For>
          </div>
        </div>

        <ControlBar />
      </div>

      <Show when={side()}>
        <aside class="vrs-side">
          <header class="vrs-side-head">
            <b>{side() === "chat" ? t("Sohbet") : side() === "queue" ? t("Söz sırası") : side() === "invite" ? t("Arkadaş davet et") : t("Oda ayarları")}</b>
            <button class="vrs-x" title={t("Kapat")} onClick={() => setSide("")}>
              <I.X />
            </button>
          </header>
          <div class="vrs-side-body" classList={{ chat: side() === "chat" }}>
            <Show when={side() === "chat"}>
              <ChatPanel />
            </Show>
            <Show when={side() === "queue"}>
              <ModDesk />
            </Show>
            <Show when={side() === "invite"}>
              <InviteSide />
            </Show>
            <Show when={side() === "settings"}>
              <RoomSettings inline />
            </Show>
          </div>
        </aside>
      </Show>
    </div>
  );
}

function TopBtn(props: { on: boolean; title: string; badge?: number; onClick: () => void; children: JSX.Element }) {
  return (
    <button class="vrs-tb" classList={{ on: props.on }} title={props.title} onClick={props.onClick}>
      {props.children}
      <Show when={(props.badge ?? 0) > 0}>
        <i class="vrs-badge" data-no-i18n>
          {props.badge! > 99 ? "99+" : props.badge}
        </i>
      </Show>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Kişi kutusu
// ---------------------------------------------------------------------------

function Tile(props: { m: VoiceMember }) {
  const u = () => props.m.user_id;
  const mine = () => u() === me();
  const role = () => roleFor(u());
  const until = () => grantUntil(u());
  const speaks = () => canSpeak(u());
  const muted = () => voice.localMuted().includes(u());
  const talking = () => isTalking(u()) && (mine() ? transmitting() : speaks());
  const av = () => cachedAvatar(u());
  const who = () => ({ user: u(), name: props.m.name, room: voice.room()?.id ?? "" });
  return (
    <button
      class="vrs-tile"
      classList={{ talking: talking(), open: personMenu()?.user === u(), me: mine(), listener: moderated() && !speaks(), dragged: personDrag()?.user === u() }}
      style={{ "--tint": tint(u()), "--lv": String(levelOf(u())) }}
      onClick={(e) => openPersonMenu(e, who())}
      onContextMenu={(e) => openPersonMenu(e, who())}
      onPointerDown={(e) => startPersonDrag(e, { user: u(), name: props.m.name, from: voice.room()?.id ?? "" })}
    >
      <span class="vrs-av">
        <Show when={av()} fallback={<span>{initialOf(props.m.name)}</span>}>
          <img src={av()} alt="" />
        </Show>
      </span>
      <Show when={moderated() && until()}>
        <span class="vrs-grant">
          <I.Mic /> {clock(until()! - voice.now())}
        </span>
      </Show>
      <span class="vrs-name">
        <Show when={role() === "owner"}>
          <I.Crown />
        </Show>
        <Show when={role() === "admin" || role() === "mod"}>
          <I.ShieldCheck />
        </Show>
        <span data-no-i18n>{props.m.name}</span>
        {mine() ? <em> ({t("Sen")})</em> : null}
      </span>
      <span class="vrs-state">
        <Show when={(moderated() && !speaks()) || (props.m.muted && !props.m.deaf)}>
          <i title={moderated() && !speaks() ? t("Söz hakkı yok") : t("Mikrofonu kapalı")}>
            <I.MicOff />
          </i>
        </Show>
        <Show when={props.m.deaf}>
          <i title={t("Sesi kapalı")}>
            <I.HeadphoneOff />
          </i>
        </Show>
        <Show when={muted()}>
          <i class="warn" title={t("Senin için susturuldu")}>
            <I.VolumeX />
          </i>
        </Show>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Alt denetim çubuğu
// ---------------------------------------------------------------------------

function ControlBar() {
  const r = () => voice.room();
  const st = () => voice.state();
  const myUntil = () => grantUntil(me());
  const privileged = () => ["owner", "admin", "mod", "speaker"].includes(roleOf(me())) || r()?.owner === me();
  const queuePos = () => (st()?.requests ?? []).findIndex((q) => q.user_id === me()) + 1;
  return (
    <div class="vrs-bar">
      <div class="vrs-bar-l">
        <span class="vrs-dot" classList={{ ok: voice.status() === "connected", warn: voice.status() !== "connected" }} />
        <div>
          <b class="vrs-bar-st">
            {voice.status() === "connected" ? t("Ses bağlı") : voice.status() === "reconnecting" ? t("Yeniden bağlanıyor…") : t("Bağlanıyor…")}
          </b>
          <div class="vr-meter" title={t("Mikrofon seviyesi")}>
            <i style={{ width: `${Math.round(voice.myLevel() * 100)}%` }} />
          </div>
        </div>
      </div>
      <div class="vrs-bar-c">
        <Show
          when={inputMode() === "open"}
          fallback={
            <span class="vrs-ptt" classList={{ on: voice.pttHeld() }} title={t("Bas-konuş")}>
              <I.Mic /> {voice.pttHeld() ? t("Konuşuyorsun") : t("Bas-konuş")}
            </span>
          }
        >
          <button class="vrs-cb" classList={{ off: !voice.micOn() }} onClick={toggleMic} title={voice.micOn() ? t("Mikrofonu kapat") : t("Mikrofonu aç")}>
            {voice.micOn() ? <I.Mic /> : <I.MicOff />}
          </button>
        </Show>
        <button
          class="vrs-cb"
          classList={{ off: voice.deafened() }}
          onClick={toggleDeafen}
          title={voice.deafened() ? t("Sesi aç") : t("Sesi kapat (kimseyi duyma)")}
        >
          {voice.deafened() ? <I.HeadphoneOff /> : <I.Headphones />}
        </button>
        <Show when={moderated() && !privileged()}>
          <Show
            when={myUntil()}
            fallback={
              <Show
                when={requested()}
                fallback={
                  <button class="vrs-pill primary" onClick={() => void act(() => voiceRequestFloor(r()!.id, true))} title={t("Konuşmak istiyorsan söz iste")}>
                    <I.Hand /> Söz iste
                  </button>
                }
              >
                <button class="vrs-pill" onClick={() => void act(() => voiceRequestFloor(r()!.id, false))} title={t("İsteği geri çek")}>
                  <I.Hand /> {t("Sıradasın: {0}. kişi", queuePos() || "?")} <I.X />
                </button>
              </Show>
            }
          >
            {(until) => (
              <span class="vrs-pill mine">
                <I.Mic /> {t("Söz sende · {0}", clock(until() - voice.now()))}
                <Countdown until={until()} total={(st()?.talk_seconds ?? 60) * 1000} />
                <button class="btn small" onClick={() => void act(() => voiceRevoke(r()!.id, me()))}>
                  Sözü bırak
                </button>
              </span>
            )}
          </Show>
        </Show>
        <button class="vrs-cb" onClick={() => go("voicerooms", "settings")} title={t("Ses ayarları")}>
          <I.Settings />
        </button>
        <button class="vrs-cb leave" onClick={() => void leaveRoom()} title={t("Ayrıl")}>
          <I.PhoneOff />
        </button>
      </div>
      <div class="vrs-bar-r">
        <Show when={moderated() && !canSpeak(me())}>
          <small class="muted">{t("Dinleyicisin")}</small>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Söz sırası (moderatör)
// ---------------------------------------------------------------------------

function ModDesk() {
  const r = () => voice.room()!;
  const st = () => voice.state();
  const present = (u: string) => voice.members().some((m) => m.user_id === u);
  const speakers = createMemo(() => (st()?.grants ?? []).filter((g) => Date.parse(g.until) > voice.now()));
  return (
    <div class="vr-mod">
      <div class="vr-mod-tools">
        <label class="vr-inline">
          <span>Süre</span>
          <select value={st()?.talk_seconds ?? 60} onChange={(e) => void act(() => voiceRoomUpdate(r().id, { talkSeconds: Number(e.currentTarget.value) }))}>
            <For each={TALK_CHOICES}>{(s) => <option value={s}>{fmtSec(s)}</option>}</For>
          </select>
        </label>
        <label class="vr-inline" title={t("Söz süresi bitince sıradaki kişiye kendiliğinden verilir")}>
          <Switch checked={!!st()?.auto_next} onChange={(v) => void act(() => voiceRoomUpdate(r().id, { autoNext: v }))} />
          <span>Otomatik sıra</span>
        </label>
      </div>
      <div class="vr-mod-tools">
        <button class="btn small primary" disabled={!st()?.requests.length} onClick={() => void act(() => voiceGrantNext(r().id))}>
          <I.SkipForward /> Sıradakine ver
        </button>
        <button class="btn small warn" disabled={!speakers().length} onClick={() => void act(() => voiceRevoke(r().id, null))}>
          <I.MicOff /> Herkesi sustur
        </button>
      </div>

      <Show when={speakers().length}>
        <h4>Konuşanlar</h4>
        <For each={speakers()}>
          {(g) => (
            <div class="vr-q">
              <b data-no-i18n>{g.name ?? "?"}</b>
              <Countdown until={Date.parse(g.until)} total={(st()?.talk_seconds ?? 60) * 1000} label />
              <span class="vr-q-sp" />
              <button class="btn small" onClick={() => void act(() => voiceExtend(r().id, g.user_id, 30))}>
                +30 sn
              </button>
              <button class="btn small" onClick={() => void act(() => voiceExtend(r().id, g.user_id, 60))}>
                +1 dk
              </button>
              <button class="btn small danger" onClick={() => void act(() => voiceRevoke(r().id, g.user_id))}>
                Al
              </button>
            </div>
          )}
        </For>
      </Show>

      <h4>{t("Söz isteyenler ({0})", st()?.requests.length ?? 0)}</h4>
      <Show when={st()?.requests.length} fallback={<p class="muted small">Şu an söz isteyen yok.</p>}>
        <For each={st()!.requests}>
          {(q, i) => (
            <div class="vr-q" classList={{ away: !present(q.user_id) }}>
              <span class="vr-q-n">{i() + 1}</span>
              <b data-no-i18n>{q.name ?? "?"}</b>
              <small class="muted">{present(q.user_id) ? waitText(Date.parse(q.at), voice.now()) : t("odada değil")}</small>
              <span class="vr-q-sp" />
              <button class="btn small primary" onClick={() => void act(() => voiceGrant(r().id, q.user_id))}>
                {t("Söz ver ({0})", fmtSec(st()?.talk_seconds ?? 60))}
              </button>
              <select
                class="vr-q-sel"
                title={t("Farklı süreyle ver")}
                value=""
                onChange={(e) => {
                  const s = Number(e.currentTarget.value);
                  e.currentTarget.value = "";
                  if (s) void act(() => voiceGrant(r().id, q.user_id, s));
                }}
              >
                <option value="">{t("Süre…")}</option>
                <For each={TALK_CHOICES}>{(s) => <option value={s}>{fmtSec(s)}</option>}</For>
              </select>
              <button class="btn small ghost" title={t("İsteği düşür")} onClick={() => void act(() => voiceDismissRequest(r().id, q.user_id))}>
                <I.X />
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arkadaş davet et + davet kodu
// ---------------------------------------------------------------------------

function InviteSide() {
  const r = () => voice.room()!;
  const [code, setCode] = createSignal<string | null>(null);
  createEffect(() => setCode(r()?.invite_code ?? null));
  return (
    <>
      <Show when={code() && amAdmin()}>
        <div class="vr-invite">
          <small class="muted">Davet kodu</small>
          <b data-no-i18n>{code()}</b>
          <button class="btn ghost small" title={t("Kopyala")} onClick={() => void navigator.clipboard?.writeText(code()!)}>
            <I.Copy />
          </button>
          <button
            class="btn ghost small"
            title={t("Yeni kod (eskisi geçersiz olur)")}
            onClick={async () => {
              const c = await voiceRoomNewCode(r().id).catch((e) => (setActErr(errText(e)), null));
              if (c) setCode(c);
            }}
          >
            <I.RefreshCw />
          </button>
        </div>
      </Show>
      <p class="muted small">Arkadaşına mesaj olarak davet gider; mesajdaki “Katıl” ile doğrudan bu odaya girer.</p>
      <InvitePanel room={r().id} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sohbet
// ---------------------------------------------------------------------------

const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return t("Bugün");
  if (d.toDateString() === y.toDateString()) return t("Dün");
  return d.toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric" });
}
const hm = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });

function ChatPanel() {
  let list!: HTMLDivElement;
  let ta!: HTMLTextAreaElement;
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [older, setOlder] = createSignal(false);
  let stick = true;

  const rows = createMemo(() => {
    const ms = chatMsgs();
    return ms.map((m, i) => {
      const p = ms[i - 1];
      const day = !p || dayKey(p.created_at) !== dayKey(m.created_at);
      const head = day || !p || p.sender !== m.sender || Date.parse(m.created_at) - Date.parse(p.created_at) > 5 * 60_000;
      return { m, head, day };
    });
  });

  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const toBottom = () => requestAnimationFrame(() => list && (list.scrollTop = list.scrollHeight));
  createEffect(() => {
    rows();
    if (stick) toBottom();
  });
  onMount(() => {
    toBottom();
    ta?.focus();
  });

  const grow = () => {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };
  const send = async () => {
    const v = text().trim();
    if (!v || sending()) return;
    setSending(true);
    setErr("");
    try {
      await sendChat(v);
      setText("");
      ta.value = "";
      grow();
      stick = true;
      toBottom();
    } catch (e) {
      setErr(errText(e));
    }
    setSending(false);
    ta.focus();
  };
  const canDel = (sender: string | null) => sender === me() || amMod();
  const nameClass = (sender: string | null) => {
    if (!sender) return "";
    const ro = roleFor(sender);
    return ro === "owner" || ro === "admin" ? "r-admin" : ro === "mod" ? "r-mod" : "";
  };

  return (
    <div class="vrc">
      <div class="vrc-list" ref={list} onScroll={() => (stick = atBottom())}>
        <div class="vrc-welcome">
          <span class="vrc-welcome-ic">
            <I.MessageSquare />
          </span>
          <b>{t("{0} sohbeti", voice.room()?.name ?? "")}</b>
          <small class="muted">{t("Sadece o an odada olanlar görür. Mesajlar 7 gün saklanır.")}</small>
        </div>
        <Show when={chatHasOlder()}>
          <button
            class="btn ghost small vrc-older"
            disabled={older()}
            onClick={async () => {
              setOlder(true);
              const h = list.scrollHeight;
              await loadOlder().catch((e) => setErr(errText(e)));
              requestAnimationFrame(() => (list.scrollTop = list.scrollHeight - h));
              setOlder(false);
            }}
          >
            {older() ? t("Yükleniyor…") : t("Daha eski mesajlar")}
          </button>
        </Show>
        <Show when={chatLoading() && !chatMsgs().length}>
          <small class="muted vrc-empty">{t("Yükleniyor…")}</small>
        </Show>
        <Show when={!chatLoading() && !chatMsgs().length && !chatErr()}>
          <small class="muted vrc-empty">{t("Henüz mesaj yok. İlk mesajı sen yaz.")}</small>
        </Show>
        <For each={rows()}>
          {(row) => (
            <>
              <Show when={row.day}>
                <div class="vrc-day">
                  <span>{dayLabel(row.m.created_at)}</span>
                </div>
              </Show>
              <div class="vrc-msg" classList={{ head: row.head, mine: row.m.sender === me() }}>
                <div class="vrc-gut">
                  <Show when={row.head} fallback={<small class="vrc-hm">{hm(row.m.created_at)}</small>}>
                    <span class="vrc-av" style={{ "--tint": tint(row.m.sender ?? "?") }}>
                      <Show when={row.m.sender && cachedAvatar(row.m.sender)} fallback={<span>{initialOf(senderName(row.m))}</span>}>
                        <img src={cachedAvatar(row.m.sender!)} alt="" />
                      </Show>
                    </span>
                  </Show>
                </div>
                <div class="vrc-body">
                  <Show when={row.head}>
                    <div class="vrc-meta">
                      <b class={nameClass(row.m.sender)} data-no-i18n>
                        {senderName(row.m)}
                      </b>
                      <small class="muted">{hm(row.m.created_at)}</small>
                    </div>
                  </Show>
                  <Show when={!row.m.deleted} fallback={<i class="muted vrc-del">{t("Bu mesaj silindi")}</i>}>
                    <div class="vrc-text" data-no-i18n>
                      <For each={splitLinks(row.m.body)}>{(part) => (part.url ? <LinkA url={part.url} text={part.text} /> : part.text)}</For>
                    </div>
                    <LinkPreview text={row.m.body} />
                  </Show>
                </div>
                <Show when={!row.m.deleted && canDel(row.m.sender)}>
                  <button
                    class="vrc-act"
                    title={t("Mesajı sil")}
                    onClick={async () => {
                      if (!(await askConfirm(t("Mesaj herkesten silinsin mi?"), { danger: true, ok: t("Sil") }))) return;
                      await deleteChat(row.m.id).catch((e) => setErr(errText(e)));
                    }}
                  >
                    <I.Trash />
                  </button>
                </Show>
              </div>
            </>
          )}
        </For>
      </div>
      <Show when={err() || chatErr()}>
        <p class="vr-err vrc-err">{err() || chatErr()}</p>
      </Show>
      <form
        class="vrc-box"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={ta}
          rows={1}
          maxLength={1000}
          placeholder={t("{0} odasına mesaj yaz", voice.room()?.name ?? "")}
          value={text()}
          disabled={voice.status() !== "connected"}
          onInput={(e) => {
            setText(e.currentTarget.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button class="vrc-send" disabled={!text().trim() || sending()} title={t("Gönder (Enter)")}>
          <I.Send />
        </button>
      </form>
      <Show when={text().length > 900}>
        <small class="muted vrc-left" data-no-i18n>
          {1000 - text().length}
        </small>
      </Show>
    </div>
  );
}
