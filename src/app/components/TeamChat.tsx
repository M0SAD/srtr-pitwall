// Takım sohbet odası (arkadaş listesinde oda olarak açılır): Realtime mesajlar, emoji seçici, anketler
// (soru, 2-6 seçenek, tek/çok seçim, süre; canlı sonuç, bitince "Bitti" ve kazanan), mesaja sağ tık:
// kopyala, benden sil, herkesten sil (kendi mesajın; sahip/yönetici her mesajı).

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { EMOJI_PICKS, emojiOnly, emojiParts, emojify, emojifyTyped, hashColor } from "@/cloud/social";
import {
  POLL_DURATIONS,
  closePoll,
  createPoll,
  deleteTeamMessage,
  hideTeamMessage,
  markTeamRead,
  pollEnded,
  pollWinners,
  sendTeamMessage,
  teamChat,
  teamLogo,
  teamProfile,
  votePoll,
  type MyTeam,
  type TeamMember,
  type TeamMessage,
  type TeamPoll,
} from "@/cloud/teams";
import * as I from "../icons";
import Smile from "lucide-solid/icons/face-slightly-smiling";
import SendHorizontal from "lucide-solid/icons/send-horizontal";
import ChartBar from "lucide-solid/icons/chart-bar";
import { ChatStage, chatLookClass, chatLookStyle } from "../chatLook";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "./ProLock";
import { BgNote, RoomBgPanel, useRoomBg } from "./ConvBg";
import "../teams.css";

/** Odaya gelen anlık olay (FriendsPanel'deki Realtime aboneliğinden) */
export type TeamEvent =
  | { kind: "insert" | "update"; m: TeamMessage }
  | { kind: "poll"; p: Omit<TeamPoll, "mine"> };

/** Takım logosu: yüklenen görsel ya da renkli zemin üstünde etiket */
export function TeamLogo(props: { team: { logo_path: string; color: string; tag: string }; size?: number }) {
  return (
    <span class="tlogo" style={{ "--sz": `${props.size ?? 44}px`, "--tc": props.team.color }}>
      <Show when={props.team.logo_path} fallback={<span data-no-i18n>{props.team.tag}</span>}>
        <img src={teamLogo(props.team.logo_path)} alt="" loading="lazy" />
      </Show>
    </span>
  );
}

function MsgText(props: { text: string }) {
  return <For each={emojiParts(emojify(props.text))}>{(p) => (p.emo ? <span class="emo">{p.t}</span> : p.t)}</For>;
}

function dayLabel(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t("Bugün");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("Dün");
  return d.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** Saniyede bir değil, 15 sn'de bir ilerleyen saat (anket bitişi ve kalan süre için) */
function useNow() {
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => setNow(Date.now()), 15_000);
  onCleanup(() => clearInterval(iv));
  return now;
}

function leftText(ms: number) {
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return t("{0} dk kaldı", m);
  const h = Math.floor(m / 60);
  if (h < 48) return t("{0} sa kaldı", h);
  return t("{0} gün kaldı", Math.floor(h / 24));
}

export function TeamChat(props: {
  team: MyTeam;
  event: TeamEvent | null;
  onRead: () => void;
  /** Listedeki son mesaj önizlemesi (gönderilen / silinen) */
  onLast: (m: TeamMessage | null) => void;
  /** "Sohbet arka planı" paneli açık (sadece takım sahibi açabilir) */
  bgAsk?: boolean;
  onBgDone?: () => void;
}) {
  const me = () => session()?.user.id;
  // Takım sahibinin seçtiği ortak arka plan (c45); yoksa genel sohbet görünümü
  const room = useRoomBg("team", () => props.team.team_id);
  const [msgs, setMsgs] = createSignal<TeamMessage[]>([]);
  const [members, setMembers] = createSignal<TeamMember[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [more, setMore] = createSignal(false);
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  const [picker, setPicker] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [polling, setPolling] = createSignal(false);
  const [ctx, setCtx] = createSignal<{ x: number; y: number; m: TeamMessage } | null>(null);
  const now = useNow();
  let box: HTMLDivElement | undefined;
  let ta: HTMLTextAreaElement | undefined;
  const scroll = () => requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight));

  const myRole = () => members().find((m) => m.user_id === me())?.role ?? props.team.role;
  const isAdmin = () => myRole() === "owner" || myRole() === "admin";
  const nameOf = (m: TeamMessage) => m.sender_name || members().find((x) => x.user_id === m.sender)?.display_name || "?";

  onMount(async () => {
    try {
      const [list, prof] = await Promise.all([teamChat(props.team.team_id), teamProfile(props.team.team_id).catch(() => null)]);
      setMsgs(list);
      setMore(list.length >= 80);
      if (prof) setMembers(prof.members);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setLoaded(true);
    markTeamRead(props.team.team_id);
    props.onRead();
    scroll();
    ta?.focus();
  });

  /** Son mesajları yeniden al ve eksikleri ekle (anket gönderince; Realtime gecikse de görünsün) */
  const reload = async () => {
    try {
      const list = await teamChat(props.team.team_id);
      const have = new Set(msgs().map((x) => x.id));
      const add = list.filter((x) => !have.has(x.id));
      if (add.length) {
        setMsgs([...msgs(), ...add].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
        props.onLast(add[add.length - 1]);
      }
      scroll();
    } catch {
      /* Realtime getirir */
    }
  };

  const loadOlder = async () => {
    const first = msgs()[0];
    if (!first) return;
    const h = box?.scrollHeight ?? 0;
    try {
      const older = await teamChat(props.team.team_id, first.created_at);
      setMore(older.length >= 80);
      setMsgs([...older.filter((o) => !msgs().some((x) => x.id === o.id)), ...msgs()]);
      requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight - h));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  // Anlık olaylar: yeni mesaj, silinen mesaj, anket sayıları
  createEffect(
    on(
      () => props.event,
      (ev) => {
        if (!ev) return;
        if (ev.kind === "poll") {
          if (ev.p.team_id !== props.team.team_id) return;
          setMsgs(msgs().map((m) => (m.poll_id === ev.p.id && m.poll ? { ...m, poll: { ...ev.p, mine: m.poll.mine } } : m)));
          return;
        }
        const m = ev.m;
        if (m.team_id !== props.team.team_id) return;
        if (ev.kind === "update") {
          setMsgs(msgs().map((x) => (x.id === m.id ? { ...x, deleted: m.deleted, body: m.body, poll: m.deleted ? null : x.poll } : x)));
          return;
        }
        if (msgs().some((x) => x.id === m.id)) return;
        if (m.meta?.t === "bg") void room.refresh();
        // Anket mesajı: anketin tamamı (seçenekler) sohbet geçmişinden alınır
        if (m.poll_id) {
          teamChat(props.team.team_id)
            .then((list) => {
              const full = list.find((x) => x.id === m.id);
              if (full && !msgs().some((x) => x.id === m.id)) setMsgs([...msgs(), full]);
              scroll();
            })
            .catch(() => {});
        } else {
          setMsgs([...msgs(), m]);
          scroll();
        }
        if (m.sender !== me()) {
          markTeamRead(props.team.team_id);
          props.onRead();
        }
        // Yeni katılan üyenin adı listede yoksa üyeler yenilenir
        if (m.sender && !members().some((x) => x.user_id === m.sender)) {
          teamProfile(props.team.team_id)
            .then((p) => p && setMembers(p.members))
            .catch(() => {});
        }
      },
      { defer: true },
    ),
  );

  // Gün ayraçları; aynı kişinin art arda (5 dk içinde) mesajları gruplanır
  const rows = createMemo(() => {
    const out: ({ day: string } | { m: TeamMessage; first: boolean; lastOfRun: boolean })[] = [];
    const list = msgs();
    let prevDay = "";
    const near = (a?: TeamMessage, b?: TeamMessage) =>
      !!a && !!b && !a.poll_id && !b.poll_id && !a.meta && !b.meta && a.sender === b.sender &&
      Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 5 * 60_000 &&
      new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
    list.forEach((m, i) => {
      const d = new Date(m.created_at);
      if (d.toDateString() !== prevDay) {
        out.push({ day: dayLabel(d) });
        prevDay = d.toDateString();
      }
      out.push({ m, first: !near(list[i - 1], m), lastOfRun: !near(m, list[i + 1]) });
    });
    return out;
  });

  const grow = () => {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`;
  };
  const onInput = (el: HTMLTextAreaElement) => {
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
      const id = String(await sendTeamMessage(props.team.team_id, b));
      const m: TeamMessage = { id, team_id: props.team.team_id, sender: me() ?? null, body: b, deleted: false, poll_id: null, created_at: new Date().toISOString() };
      if (!msgs().some((x) => x.id === id)) setMsgs([...msgs(), m]);
      props.onLast(m);
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
  const openCtx = (e: MouseEvent, m: TeamMessage) => {
    e.preventDefault();
    e.stopPropagation();
    if (m.deleted) return;
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 140), m });
  };
  const lastVisible = (list: TeamMessage[]) => [...list].reverse().find((x) => !x.deleted) ?? null;
  const hide = async (m: TeamMessage) => {
    setCtx(null);
    setErr("");
    try {
      await hideTeamMessage(m.id);
      const rest = msgs().filter((x) => x.id !== m.id);
      setMsgs(rest);
      props.onLast(lastVisible(rest));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const remove = async (m: TeamMessage) => {
    setCtx(null);
    if (!confirm(t("Bu mesaj herkesten silinsin mi?"))) return;
    setErr("");
    try {
      await deleteTeamMessage(m.id);
      const next = msgs().map((x) => (x.id === m.id ? { ...x, deleted: true, body: "", poll: null } : x));
      setMsgs(next);
      props.onLast(lastVisible(next));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const copy = (m: TeamMessage) => {
    setCtx(null);
    navigator.clipboard?.writeText(m.body).catch(() => {});
  };

  /** Ankete oy ver (iyimser: sayılar sunucudan Realtime ile gelir) */
  const vote = async (m: TeamMessage, opts: number[]) => {
    const p = m.poll;
    if (!p) return;
    setErr("");
    try {
      await votePoll(p.id, opts);
      setMsgs(msgs().map((x) => (x.id === m.id && x.poll ? { ...x, poll: { ...x.poll, mine: opts } } : x)));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const endPoll = async (p: TeamPoll) => {
    if (!confirm(t("Anket şimdi bitirilsin mi?"))) return;
    try {
      await closePoll(p.id);
      setMsgs(msgs().map((x) => (x.poll?.id === p.id ? { ...x, poll: { ...x.poll, ends_at: new Date().toISOString() } } : x)));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  return (
    <div class="fchat tchat" classList={chatLookClass(room.look())} style={chatLookStyle(room.look())}>
      <Show when={props.bgAsk}>
        <RoomBgPanel scope="team" room={props.team.team_id} st={room} onClose={() => props.onBgDone?.()} />
      </Show>
      <ChatStage look={room.look()} img={room.img()}>
      <div class="fchat-msgs" ref={box} onScroll={() => ctx() && setCtx(null)}>
        <Show when={more()}>
          <button class="btn ghost small tchat-more" onClick={loadOlder}>
            Daha eski mesajlar
          </button>
        </Show>
        <Show
          when={msgs().length > 0}
          fallback={
            <Show when={loaded()}>
              <div class="fempty">
                <div class="fempty-ico wave">👋</div>
                <b>Henüz mesaj yok</b>
                <p class="muted small">{t("{0} odasında ilk mesajı sen yaz.", props.team.name)}</p>
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
              ) : r.m.meta?.t === "bg" && !r.m.deleted ? (
                <BgNote
                  meta={r.m.meta}
                  who={nameOf(r.m)}
                  mine={r.m.sender === me()}
                  time={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                />
              ) : (
                <Show
                  when={r.m.poll && !r.m.deleted}
                  fallback={
                    <div
                      class="fmsg tmsg"
                      classList={{ mine: r.m.sender === me(), first: r.first, tail: r.lastOfRun, gone: r.m.deleted, jumbo: !r.m.deleted && emojiOnly(emojify(r.m.body)) }}
                      title={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                      onContextMenu={(e) => openCtx(e, r.m)}
                    >
                      <Show when={r.first && r.m.sender !== me()}>
                        <b class="tmsg-who" style={{ color: hashColor(r.m.sender ?? "?") }} data-no-i18n>
                          {nameOf(r.m)}
                        </b>
                      </Show>
                      <Show when={!r.m.deleted} fallback={<p class="tmsg-gone">Bu mesaj silindi</p>}>
                        <p data-no-i18n>
                          <MsgText text={r.m.body} />
                        </p>
                      </Show>
                      <Show when={r.lastOfRun}>
                        <small>{time(r.m.created_at)}</small>
                      </Show>
                    </div>
                  }
                >
                  <PollCard
                    m={r.m}
                    poll={r.m.poll!}
                    who={nameOf(r.m)}
                    mine={r.m.sender === me()}
                    canClose={r.m.sender === me() || isAdmin()}
                    now={now()}
                    onVote={(o) => vote(r.m, o)}
                    onClose={() => endPoll(r.m.poll!)}
                    onMenu={(e) => openCtx(e, r.m)}
                  />
                </Show>
              )
            }
          </For>
        </Show>
      </div>
      </ChatStage>
      <Show when={err()}>
        <p class="error small tchat-err" onClick={() => setErr("")}>
          {err()}
        </p>
      </Show>
      <Show when={ctx()}>
        {(c) => (
          <div class="frow-menu fmsg-menu" style={{ left: `${c().x}px`, top: `${c().y}px` }}>
            <button onClick={() => copy(c().m)}>
              <I.Copy /> Kopyala
            </button>
            <button onClick={() => hide(c().m)} title="Mesaj sadece senin görünümünden silinir">
              <I.EyeOff /> Benden sil
            </button>
            <Show when={c().m.sender === me() || isAdmin()}>
              <button class="danger" onClick={() => remove(c().m)} title="Mesaj odadaki herkesten silinir">
                <I.Trash /> Herkesten sil
              </button>
            </Show>
          </div>
        )}
      </Show>
      <Show when={polling()}>
        <PollForm team={props.team.team_id} onClose={() => setPolling(false)} onCreated={() => (setPolling(false), reload())} />
      </Show>
      <Show when={!polling()}>
        <ProLockNote feature={F.teamChat} text="Takım sohbetine yazmak PRO üyelere özel. Mesajları okuyabilir, anketlere oy verebilirsin." />
        <div class="fcompose">
          <Show when={picker()}>
            <div class="femo" role="dialog">
              <For each={EMOJI_PICKS}>
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
          <button
            class="icon-btn femo-btn"
            disabled={proLocked(F.teamPoll)}
            title={proLocked(F.teamPoll) ? "Anket oluşturmak PRO üyelere özel" : "Anket oluştur"}
            onClick={() => (setPicker(false), setPolling(true))}
          >
            <ChartBar />
          </button>
          <textarea
            ref={ta}
            class="input"
            rows={1}
            maxLength={1000}
            placeholder={proLocked(F.teamChat) ? "Yazmak PRO üyelere özel" : "Odaya yaz…"}
            disabled={proLocked(F.teamChat)}
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
          <button class="btn primary fsend" disabled={!text().trim() || sending() || proLocked(F.teamChat)} title="Gönder" onClick={send}>
            <SendHorizontal />
          </button>
        </div>
      </Show>
    </div>
  );
}

/** Sohbetteki anket kartı: seçenekler oy çubuklarıyla; bitince "Bitti" ve kazanan */
function PollCard(props: {
  m: TeamMessage;
  poll: TeamPoll;
  who: string;
  mine: boolean;
  canClose: boolean;
  now: number;
  onVote: (opts: number[]) => void;
  onClose: () => void;
  onMenu: (e: MouseEvent) => void;
}) {
  const p = () => props.poll;
  const ended = () => pollEnded(p(), props.now);
  const total = () => p().counts.reduce((a, b) => a + b, 0);
  const winners = () => pollWinners(p());
  const voted = () => p().mine.length > 0;
  const pick = (i: number) => {
    if (ended()) return;
    const mine = p().mine;
    if (p().multi) props.onVote(mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i].sort((a, b) => a - b));
    else props.onVote(mine.includes(i) ? [] : [i]);
  };
  return (
    <div class="tpoll" classList={{ mine: props.mine, ended: ended() }} onContextMenu={props.onMenu}>
      <div class="tpoll-head">
        <ChartBar />
        <span>{p().multi ? "Anket · birden çok seçim" : "Anket"}</span>
        <span class="lt-sp" />
        <small data-no-i18n>{props.who}</small>
      </div>
      <b class="tpoll-q" data-no-i18n>
        <MsgText text={p().question} />
      </b>
      <div class="tpoll-opts">
        <For each={p().options}>
          {(o, i) => {
            const pct = () => (total() > 0 ? Math.round((p().counts[i()] / total()) * 100) : 0);
            const on = () => p().mine.includes(i());
            const win = () => ended() && winners().includes(i());
            return (
              <button class="tpoll-opt" classList={{ on: on(), win: win() }} disabled={ended()} onClick={() => pick(i())}>
                <i class="tpoll-bar" style={{ width: `${voted() || ended() ? pct() : 0}%` }} />
                <span class="tpoll-mark">{p().multi ? (on() ? "☑" : "☐") : on() ? "◉" : "○"}</span>
                <span class="tpoll-label" data-no-i18n>
                  {o}
                </span>
                <Show when={win()}>
                  <I.Trophy />
                </Show>
                <Show when={voted() || ended()}>
                  <span class="tpoll-pct">
                    {pct()}% <small>({p().counts[i()]})</small>
                  </span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
      <div class="tpoll-foot">
        <span>{t("{0} kişi oy verdi", p().voters)}</span>
        <span>·</span>
        <Show
          when={ended()}
          fallback={
            <span title={new Date(p().ends_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}>
              {leftText(new Date(p().ends_at).getTime() - props.now)}
            </span>
          }
        >
          <b class="tpoll-done">Bitti</b>
          <Show when={winners().length > 0} fallback={<span>Oy verilmedi</span>}>
            <span data-no-i18n>
              {winners().length > 1 ? t("Berabere: {0}", winners().map((i) => p().options[i]).join(", ")) : t("Kazanan: {0}", p().options[winners()[0]])}
            </span>
          </Show>
        </Show>
        <span class="lt-sp" />
        <Show when={!ended() && props.canClose}>
          <button class="link" onClick={props.onClose}>
            Bitir
          </button>
        </Show>
      </div>
    </div>
  );
}

/** Anket oluşturma (sohbetin altında satır içi) */
function PollForm(props: { team: string; onClose: () => void; onCreated: () => void }) {
  const [q, setQ] = createSignal("");
  const [opts, setOpts] = createSignal<string[]>(["", ""]);
  const [multi, setMulti] = createSignal(false);
  const [dur, setDur] = createSignal("1d");
  const pad = (n: number) => String(n).padStart(2, "0");
  const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [custom, setCustom] = createSignal(localInput(new Date(Date.now() + 2 * 3600_000)));
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const filled = () => opts().map((o) => o.trim()).filter(Boolean);
  const endsAt = () => {
    if (dur() === "custom") return new Date(custom());
    const h = POLL_DURATIONS.find((d) => d.id === dur())?.hours ?? 24;
    return new Date(Date.now() + h * 3600_000);
  };
  const valid = () => q().trim().length > 0 && filled().length >= 2 && !isNaN(endsAt().getTime());
  const submit = async () => {
    if (!valid() || busy()) return;
    const end = endsAt();
    if (end.getTime() < Date.now() + 60_000) return setErr(t("Bitiş zamanı en az 1 dakika sonra olmalı"));
    setBusy(true);
    setErr("");
    try {
      await createPoll(props.team, emojify(q().trim()), filled().map(emojify), multi(), end);
      props.onCreated();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="freport tpoll-form" onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
      <div class="freport-head">
        <b>
          <ChartBar /> Anket oluştur
        </b>
        <span class="lt-sp" />
        <button class="icon-btn" title="Kapat" onClick={props.onClose}>
          <I.X />
        </button>
      </div>
      <input class="input" maxLength={200} placeholder="Soru" value={q()} ref={(el) => setTimeout(() => el.focus())} onInput={(e) => setQ(e.currentTarget.value)} />
      <For each={opts()}>
        {(o, i) => (
          <div class="tpoll-row">
            <input
              class="input"
              maxLength={80}
              placeholder={t("{0}. seçenek", i() + 1)}
              value={o}
              onInput={(e) => setOpts(opts().map((x, j) => (j === i() ? e.currentTarget.value : x)))}
            />
            <Show when={opts().length > 2}>
              <button class="icon-btn" title="Seçeneği kaldır" onClick={() => setOpts(opts().filter((_, j) => j !== i()))}>
                <I.X />
              </button>
            </Show>
          </div>
        )}
      </For>
      <Show when={opts().length < 6}>
        <button class="btn ghost small tpoll-add" onClick={() => setOpts([...opts(), ""])}>
          <I.Plus /> Seçenek ekle
        </button>
      </Show>
      <label class="tpoll-check">
        <input type="checkbox" checked={multi()} onChange={(e) => setMulti(e.currentTarget.checked)} /> Birden çok seçim yapılabilsin
      </label>
      <div class="freport-reasons">
        <For each={POLL_DURATIONS}>
          {(d) => (
            <button class="fme-chip" classList={{ on: dur() === d.id }} aria-pressed={dur() === d.id} onClick={() => setDur(d.id)}>
              {d.label}
            </button>
          )}
        </For>
        <button class="fme-chip" classList={{ on: dur() === "custom" }} aria-pressed={dur() === "custom"} onClick={() => setDur("custom")}>
          Bitiş zamanı seç
        </button>
      </div>
      <Show when={dur() === "custom"}>
        <input class="input" type="datetime-local" value={custom()} min={localInput(new Date())} onInput={(e) => setCustom(e.currentTarget.value)} />
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <div class="freport-btns">
        <button class="btn ghost small" onClick={props.onClose}>
          Vazgeç
        </button>
        <button class="btn primary small" disabled={!valid() || busy()} onClick={submit}>
          {busy() ? "Gönderiliyor…" : "Anketi gönder"}
        </button>
      </div>
    </div>
  );
}
