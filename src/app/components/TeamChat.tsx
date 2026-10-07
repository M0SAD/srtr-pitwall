// Takım sohbet odası (arkadaş listesinde oda olarak açılır): Realtime mesajlar, emoji seçici, mesaja sağ tık:
// kopyala, benden sil, herkesten sil (kendi mesajın; sahip/yönetici her mesajı).

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { EMOJI_PICKS, emojiOnly, emojiParts, emojify, emojifyTyped, hashColor } from "@/cloud/social";
import {
  deleteTeamMessage,
  hideTeamMessage,
  markTeamRead,
  reportTeamMessage,
  sendTeamMessage,
  teamChat,
  teamLogo,
  teamProfile,
  type MyTeam,
  type TeamMember,
  type TeamMessage,
} from "@/cloud/teams";
import Smile from "lucide-solid/icons/face-slightly-smiling";
import SendHorizontal from "lucide-solid/icons/send-horizontal";
import { ChatStage } from "../chatLook";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "./ProLock";
import { BgNote, RoomBgPanel, useRoomBg } from "./ConvBg";
import { ReportMessage } from "./FriendsDock";
import { MsgMenu, ReactionRow, msgClickOpens, msgMenuPos } from "./MsgMenu";
import { useReactions } from "@/cloud/reactions";
import { useSeen } from "../chatSeen";
import "../teams.css";

/** Odaya gelen anlık olay (FriendsPanel'deki Realtime aboneliğinden) */
export type TeamEvent = { kind: "insert" | "update"; m: TeamMessage };

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
  const seen = useSeen(() => (void markTeamRead(props.team.team_id), props.onRead()));
  const reacts = useReactions("team", () => msgs().map((m) => m.id), () => props.team.team_id);
  const [members, setMembers] = createSignal<TeamMember[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [more, setMore] = createSignal(false);
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  const [picker, setPicker] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [ctx, setCtx] = createSignal<{ x: number; y: number; m: TeamMessage } | null>(null);
  const [reporting, setReporting] = createSignal<TeamMessage | null>(null);
  let box: HTMLDivElement | undefined;
  let ta: HTMLTextAreaElement | undefined;
  // En alta in: yerleşim (fotoğraflar, yazı tipi, ifadeler) birkaç adımda oturduğu için kısa aralıklarla yinelenir;
  // geç gelen içerik (ifade çipleri) için son deneme yalnızca kullanıcı hâlâ alta yakınsa yapılır
  const scroll = () => {
    const end = () => box && (box.scrollTop = box.scrollHeight);
    requestAnimationFrame(end);
    for (const ms of [60, 200, 500]) setTimeout(end, ms);
    setTimeout(() => box && box.scrollHeight - box.scrollTop - box.clientHeight < 160 && end(), 1600);
  };

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
    seen();
    scroll();
    ta?.focus();
  });

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

  // Anlık olaylar: yeni mesaj, silinen mesaj
  createEffect(
    on(
      () => props.event,
      (ev) => {
        if (!ev) return;
        const m = ev.m;
        if (m.team_id !== props.team.team_id) return;
        if (ev.kind === "update") {
          setMsgs(msgs().map((x) => (x.id === m.id ? { ...x, deleted: m.deleted, body: m.body } : x)));
          return;
        }
        if (msgs().some((x) => x.id === m.id)) return;
        if (m.meta?.t === "bg") void room.refresh();
        setMsgs([...msgs(), m]);
        scroll();
        if (m.sender !== me()) {
          seen();
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
      !!a && !!b && !a.meta && !b.meta && a.sender === b.sender &&
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
      const m: TeamMessage = { id, team_id: props.team.team_id, sender: me() ?? null, body: b, deleted: false, created_at: new Date().toISOString() };
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
    setCtx({ ...msgMenuPos(e), m });
  };
  /** Sol tık da menüyü açar (bağlantıya tıklanmadıysa, metin seçilmiyorsa). Ankette sol tık oy vermek içindir. */
  const clickCtx = (e: MouseEvent, m: TeamMessage) => msgClickOpens(e) && openCtx(e, m);
  const lastVisible = (list: TeamMessage[]) => [...list].reverse().find((x) => !x.deleted) ?? null;
  const hide = async (m: TeamMessage) => {
    setCtx(null);
    setErr("");
    try {
      await hideTeamMessage(m.id);
      const rest = msgs().filter((x) => x.id !== m.id);
      setMsgs(rest);
      props.onLast(lastVisible(rest));
      if (reporting()?.id === m.id) setReporting(null);
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
      const next = msgs().map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x));
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

  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  return (
    <div class="fchat tchat stm">
      <Show when={props.bgAsk}>
        <RoomBgPanel scope="team" room={props.team.team_id} st={room} onClose={() => props.onBgDone?.()} />
      </Show>
      <ChatStage>
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
                <div class="fsys-wrap" onContextMenu={(e) => openCtx(e, r.m)}>
                  <BgNote
                    meta={r.m.meta}
                    who={nameOf(r.m)}
                    mine={r.m.sender === me()}
                    time={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                  />
                </div>
              ) : (
              <div
                class="fmsg tmsg"
                classList={{ mine: r.m.sender === me(), first: r.first, tail: r.lastOfRun, gone: r.m.deleted, jumbo: !r.m.deleted && emojiOnly(emojify(r.m.body)) }}
                title={new Date(r.m.created_at).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
                onContextMenu={(e) => openCtx(e, r.m)}
                onClick={(e) => clickCtx(e, r.m)}
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
                <ReactionRow list={reacts.of(r.m.id)} onToggle={(e) => void reacts.toggle(r.m.id, e).catch(() => {})} />
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
        <p class="error small tchat-err" onClick={() => setErr("")}>
          {err()}
        </p>
      </Show>
      <Show when={reporting()}>
        {(m) => (
          <ReportMessage
            m={{ id: m().id, body: m().body }}
            name={nameOf(m())}
            report={(reason, note) => reportTeamMessage(m().id, reason, note)}
            onHide={() => hide(m())}
            onClose={() => setReporting(null)}
          />
        )}
      </Show>
      <Show when={ctx()}>
        {(c) => (
          <MsgMenu
            pos={c()}
            onReact={!c().m.deleted && !c().m.meta ? (e) => (void reacts.toggle(c().m.id, e).catch(() => {}), setCtx(null)) : undefined}
            onCopy={c().m.deleted || c().m.meta || !c().m.body ? undefined : () => copy(c().m)}
            onHide={() => hide(c().m)}
            hideTitle={t("Mesaj sadece senin görünümünden silinir")}
            onDelete={!c().m.deleted && (c().m.sender === me() || isAdmin()) ? () => remove(c().m) : undefined}
            deleteTitle={t("Mesaj odadaki herkesten silinir")}
            onReport={!c().m.deleted && !c().m.meta && c().m.sender !== me() ? () => (setReporting(c().m), setCtx(null)) : undefined}
          />
        )}
      </Show>
      <Show when={!reporting()}>
        <ProLockNote feature={F.teamChat} text="Takım sohbetine yazmak PRO üyelere özel. Mesajları okuyabilirsin." />
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
