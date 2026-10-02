// Grup sohbeti (c45; arkadaş listesinde "Gruplar" altında açılır): Realtime mesajlar, emoji seçici, üyeler paneli
// (arkadaş davet et, sahip üye çıkarır / adı değiştirir / grubu siler, herkes ayrılabilir), sistem satırları
// (eklendi, ayrıldı, çıkarıldı, yeni sahip, ad değişti, arka plan değişti) ve sahibin seçtiği ortak arka plan.
// Mesaja sağ tık: kopyala, herkesten sil (kendi mesajın; sahip her mesajı), raporla (başkasının mesajı).

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { EMOJI_PICKS, emojiOnly, emojiParts, emojify, emojifyTyped, hashColor, initialOf, msgPreview, type Friend } from "@/cloud/social";
import {
  GROUP_MAX_MEMBERS,
  createGroup,
  deleteGroup,
  deleteGroupMessage,
  groupChat,
  groupMembers,
  hideGroupMessage,
  inviteToGroup,
  kickFromGroup,
  leaveGroup,
  markGroupRead,
  renameGroup,
  reportGroupMessage,
  sendGroupMessage,
  type GroupMember,
  type GroupMessage,
  type MyGroup,
} from "@/cloud/groups";
import { clearRoomBg } from "@/cloud/chatBg";
import * as I from "../icons";
import Smile from "lucide-solid/icons/face-slightly-smiling";
import SendHorizontal from "lucide-solid/icons/send-horizontal";
import { ChatStage, chatLookClass, chatLookStyle } from "../chatLook";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "./ProLock";
import { BgNote, RoomBgPanel, SysNote, useRoomBg } from "./ConvBg";
import { Avatar, ReportMessage } from "./FriendsDock";
import { MsgMenu, msgClickOpens, msgMenuPos } from "./MsgMenu";
import "../teams.css";

/** Odaya gelen anlık olay (FriendsPanel'deki Realtime aboneliğinden) */
export type GroupEvent = { kind: "insert" | "update"; m: GroupMessage };
export type GroupPanel = "none" | "members" | "bg";

/** Grup simgesi: kimlikten renk + adın baş harfi */
export function GroupAvatar(props: { group: { group_id: string; name: string }; size?: number }) {
  return (
    <span class="gavatar" style={{ "--sz": `${props.size ?? 36}px`, "--fc": hashColor(props.group.group_id) }} data-no-i18n>
      {initialOf(props.group.name)}
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

/** Arkadaş seçme listesi (grup kurarken ve davet ederken) */
function FriendPicker(props: { friends: Friend[]; picked: string[]; onToggle: (id: string) => void; empty: string }) {
  return (
    <div class="gmem-list">
      <Show when={props.friends.length > 0} fallback={<p class="muted small">{props.empty}</p>}>
        <For each={props.friends}>
          {(f) => (
            <div class="gmem">
              <label>
                <input type="checkbox" checked={props.picked.includes(f.friend_id)} onChange={() => props.onToggle(f.friend_id)} />
                <Avatar id={f.friend_id} name={f.display_name} size={24} />
                <b data-no-i18n>{f.display_name || "?"}</b>
              </label>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

/** Yeni grup: ad + davet edilecek arkadaşlar */
export function NewGroup(props: { friends: Friend[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = createSignal("");
  const [picked, setPicked] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const toggle = (id: string) => setPicked(picked().includes(id) ? picked().filter((x) => x !== id) : [...picked(), id]);
  const valid = () => name().trim().length >= 2 && picked().length < GROUP_MAX_MEMBERS;
  const submit = async () => {
    if (!valid() || busy()) return;
    setBusy(true);
    setErr("");
    try {
      props.onCreated(String(await createGroup(name().trim(), picked())));
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="gnew">
      <ProLockNote feature={F.messages} text="Grup kurmak PRO üyelere özel." />
      <input
        class="input"
        maxLength={40}
        placeholder="Grup adı"
        value={name()}
        ref={(el) => setTimeout(() => el.focus())}
        onInput={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <small class="muted">{t("Davet edilecek arkadaşlar ({0} seçildi)", picked().length)}</small>
      <FriendPicker friends={props.friends} picked={picked()} onToggle={toggle} empty={t("Henüz arkadaşın yok. Grubu kurup sonra da davet edebilirsin.")} />
      <p class="muted small">
        Gruba sadece arkadaşlarını ekleyebilirsin. Dilediğin zaman gruptan ayrılabilir ya da grubu silebilirsin; grupta kimse kalmazsa grup
        kendiliğinden kapanır.
      </p>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <div class="freport-btns">
        <button class="btn ghost small" onClick={props.onCancel}>
          Vazgeç
        </button>
        <button class="btn primary small" disabled={!valid() || busy() || proLocked(F.messages)} onClick={submit}>
          <I.Users /> {busy() ? "Kuruluyor…" : "Grubu kur"}
        </button>
      </div>
    </div>
  );
}

export function GroupChat(props: {
  group: MyGroup;
  event: GroupEvent | null;
  /** Kabul edilmiş arkadaşlarım (davet için) */
  friends: Friend[];
  panel: GroupPanel;
  onPanel: (p: GroupPanel) => void;
  onRead: () => void;
  /** Listedeki son mesaj önizlemesi (gönderilen / silinen) */
  onLast: (m: GroupMessage | null) => void;
  /** Üyeler / ad değişti: grup listesini yenile */
  onChanged: () => void;
  /** Gruptan ayrıldım ya da grubu sildim: listeye dön */
  onGone: () => void;
}) {
  const me = () => session()?.user.id;
  const gid = () => props.group.group_id;
  const [msgs, setMsgs] = createSignal<GroupMessage[]>([]);
  const [members, setMembers] = createSignal<GroupMember[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [more, setMore] = createSignal(false);
  const [text, setText] = createSignal("");
  const [err, setErr] = createSignal("");
  const [picker, setPicker] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [ctx, setCtx] = createSignal<{ x: number; y: number; m: GroupMessage } | null>(null);
  const [reporting, setReporting] = createSignal<GroupMessage | null>(null);
  let box: HTMLDivElement | undefined;
  let ta: HTMLTextAreaElement | undefined;
  const scroll = () => requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight));

  const isOwner = () => (members().length ? members().some((m) => m.user_id === me() && m.is_owner) : props.group.is_owner);
  const nameOf = (m: GroupMessage) => m.sender_name || members().find((x) => x.user_id === m.sender)?.display_name || "?";
  const loadMembers = () =>
    groupMembers(gid())
      .then(setMembers)
      .catch(() => {});
  const room = useRoomBg("group", gid);

  onMount(async () => {
    try {
      const [list] = await Promise.all([groupChat(gid()), loadMembers()]);
      setMsgs(list);
      setMore(list.length >= 80);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setLoaded(true);
    markGroupRead(gid());
    props.onRead();
    scroll();
    ta?.focus();
  });

  const loadOlder = async () => {
    const first = msgs()[0];
    if (!first) return;
    const h = box?.scrollHeight ?? 0;
    try {
      const older = await groupChat(gid(), first.created_at);
      setMore(older.length >= 80);
      setMsgs([...older.filter((o) => !msgs().some((x) => x.id === o.id)), ...msgs()]);
      requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight - h));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  /** Sistem mesajı geldi: üyeler / ad / arka plan değişmiş olabilir */
  const onSystem = (m: GroupMessage) => {
    const k = m.meta?.t;
    if (k === "bg") void room.refresh();
    else {
      void loadMembers();
      props.onChanged();
    }
  };

  // Anlık olaylar: yeni mesaj, silinen mesaj
  createEffect(
    on(
      () => props.event,
      (ev) => {
        if (!ev || ev.m.group_id !== gid()) return;
        const m = ev.m;
        if (ev.kind === "update") {
          setMsgs(msgs().map((x) => (x.id === m.id ? { ...x, deleted: m.deleted, body: m.body, meta: m.meta } : x)));
          return;
        }
        if (msgs().some((x) => x.id === m.id)) return;
        setMsgs([...msgs(), m]);
        scroll();
        if (m.meta) onSystem(m);
        if (m.sender !== me()) {
          markGroupRead(gid());
          props.onRead();
        }
        if (m.sender && !members().some((x) => x.user_id === m.sender)) void loadMembers();
      },
      { defer: true },
    ),
  );

  // Gün ayraçları; aynı kişinin art arda (5 dk içinde) mesajları gruplanır (sistem satırları grubu böler)
  const rows = createMemo(() => {
    const out: ({ day: string } | { m: GroupMessage; first: boolean; lastOfRun: boolean })[] = [];
    const list = msgs();
    let prevDay = "";
    const near = (a?: GroupMessage, b?: GroupMessage) =>
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
      const id = String(await sendGroupMessage(gid(), b));
      const m: GroupMessage = { id, group_id: gid(), sender: me() ?? null, body: b, deleted: false, created_at: new Date().toISOString() };
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
  const openCtx = (e: MouseEvent, m: GroupMessage) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ ...msgMenuPos(e), m });
  };
  /** Sol tık da menüyü açar (bağlantıya tıklanmadıysa, metin seçilmiyorsa) */
  const clickCtx = (e: MouseEvent, m: GroupMessage) => msgClickOpens(e) && openCtx(e, m);
  /** Mesajı sadece kendi görünümünden kaldır (c55) */
  const hide = async (m: GroupMessage) => {
    setCtx(null);
    setErr("");
    try {
      await hideGroupMessage(m.id);
      const rest = msgs().filter((x) => x.id !== m.id);
      setMsgs(rest);
      props.onLast(lastVisible(rest));
      if (reporting()?.id === m.id) setReporting(null);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const lastVisible = (list: GroupMessage[]) => [...list].reverse().find((x) => !x.deleted) ?? null;
  const remove = async (m: GroupMessage) => {
    setCtx(null);
    if (!confirm(t("Bu mesaj herkesten silinsin mi?"))) return;
    setErr("");
    try {
      await deleteGroupMessage(m.id);
      const next = msgs().map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x));
      setMsgs(next);
      props.onLast(lastVisible(next));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const copy = (m: GroupMessage) => {
    setCtx(null);
    navigator.clipboard?.writeText(m.body).catch(() => {});
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  const full = (iso: string) => new Date(iso).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" });
  /** Sistem satırının metni (kullanıcının dilinde) */
  const sysText = (m: GroupMessage) => {
    const x = m.meta!;
    if (x.t === "join") return t("{0}, {1} adlı kişiyi gruba ekledi", x.by_name ?? nameOf(m), x.name ?? "?");
    return msgPreview(m);
  };

  return (
    <div class="fchat tchat" classList={chatLookClass(room.look())} style={chatLookStyle(room.look())}>
      <Show when={props.panel === "bg"}>
        <RoomBgPanel scope="group" room={gid()} st={room} onClose={() => props.onPanel("none")} />
      </Show>
      <Show when={props.panel === "members"}>
        <MembersPanel
          group={props.group}
          members={members()}
          friends={props.friends}
          owner={isOwner()}
          onClose={() => props.onPanel("none")}
          onChanged={() => (void loadMembers(), props.onChanged())}
          onGone={props.onGone}
        />
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
                  <p class="muted small">{t("{0} grubunda ilk mesajı sen yaz.", props.group.name)}</p>
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
                ) : r.m.meta && !r.m.deleted ? (
                  <div class="fsys-wrap" onContextMenu={(e) => openCtx(e, r.m)}>
                    {r.m.meta.t === "bg" ? (
                      <BgNote meta={r.m.meta} who={nameOf(r.m)} mine={r.m.sender === me()} time={full(r.m.created_at)} />
                    ) : (
                      <SysNote text={sysText(r.m)} time={full(r.m.created_at)} />
                    )}
                  </div>
                ) : (
                  <div
                    class="fmsg tmsg"
                    classList={{ mine: r.m.sender === me(), first: r.first, tail: r.lastOfRun, gone: r.m.deleted, jumbo: !r.m.deleted && emojiOnly(emojify(r.m.body)) }}
                    title={full(r.m.created_at)}
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
            m={m()}
            name={nameOf(m())}
            report={(reason, note) => reportGroupMessage(m().id, reason, note)}
            onHide={() => hide(m())}
            onClose={() => setReporting(null)}
          />
        )}
      </Show>
      <Show when={ctx()}>
        {(c) => (
          <MsgMenu
            pos={c()}
            onCopy={c().m.deleted || c().m.meta ? undefined : () => copy(c().m)}
            onHide={() => hide(c().m)}
            hideTitle={t("Mesaj sadece senin görünümünden silinir")}
            onDelete={!c().m.deleted && !c().m.meta && (c().m.sender === me() || isOwner()) ? () => remove(c().m) : undefined}
            deleteTitle={t("Mesaj gruptaki herkesten silinir")}
            onReport={!c().m.deleted && !c().m.meta && c().m.sender !== me() ? () => (setReporting(c().m), setCtx(null)) : undefined}
          />
        )}
      </Show>
      <Show when={!reporting()}>
        <ProLockNote feature={F.messages} text="Mesaj göndermek PRO üyelere özel. Gelen mesajları okuyabilirsin." class="fchat-prolock" />
        <div class="fcompose" classList={{ "prolock-dim": proLocked(F.messages) }}>
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
            placeholder="Gruba yaz…"
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
          <button class="btn primary fsend" disabled={!text().trim() || sending() || proLocked(F.messages)} title="Gönder" onClick={send}>
            <SendHorizontal />
          </button>
        </div>
      </Show>
    </div>
  );
}

/** Üyeler paneli (sohbetin üstünde): üyeler, arkadaş davet et, adı değiştir, ayrıl, grubu sil */
function MembersPanel(props: {
  group: MyGroup;
  members: GroupMember[];
  friends: Friend[];
  owner: boolean;
  onClose: () => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const me = () => session()?.user.id;
  const gid = () => props.group.group_id;
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [note, setNote] = createSignal("");
  const [inviting, setInviting] = createSignal(false);
  const [picked, setPicked] = createSignal<string[]>([]);
  const [renaming, setRenaming] = createSignal(false);
  const [name, setName] = createSignal(props.group.name);
  const toggle = (id: string) => setPicked(picked().includes(id) ? picked().filter((x) => x !== id) : [...picked(), id]);
  const candidates = () => props.friends.filter((f) => !props.members.some((m) => m.user_id === f.friend_id));
  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    setNote("");
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setErr(String((e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const invite = () =>
    run(async () => {
      const want = picked().length;
      const n = await inviteToGroup(gid(), picked());
      setPicked([]);
      setInviting(false);
      props.onChanged();
      setNote(
        n === want
          ? t("{0} kişi gruba eklendi.", n)
          : t("{0} kişi eklendi; {1} kişi eklenemedi (mesajları kapalı ya da seni sessize almış).", n, want - n),
      );
    });
  const kick = (m: GroupMember) => {
    if (!confirm(t("{0} gruptan çıkarılsın mı?", m.display_name))) return;
    void run(async () => {
      await kickFromGroup(gid(), m.user_id);
      props.onChanged();
    });
  };
  const rename = () =>
    run(async () => {
      await renameGroup(gid(), name().trim());
      setRenaming(false);
      props.onChanged();
    });
  const leave = async () => {
    const alone = props.members.length <= 1;
    const q = alone
      ? t("Grupta başka kimse yok; ayrılırsan grup ve mesajları silinir. Ayrılmak istiyor musun?")
      : props.owner
        ? t("Gruptan ayrılırsan sahiplik en eski üyeye geçer. Ayrılmak istiyor musun?")
        : t("{0} grubundan ayrılmak istiyor musun?", props.group.name);
    if (!confirm(q)) return;
    if (
      await run(async () => {
        // Son üye ayrılınca grup silinir: ortak arka plan görseli önce kovadan temizlenir
        if (alone) await clearRoomBg("group", gid(), true);
        await leaveGroup(gid());
      })
    )
      props.onGone();
  };
  const remove = async () => {
    if (!confirm(t("{0} grubu ve tüm mesajları herkes için silinsin mi? Bu işlem geri alınamaz.", props.group.name))) return;
    if (
      await run(async () => {
        await clearRoomBg("group", gid(), true);
        await deleteGroup(gid());
      })
    )
      props.onGone();
  };
  return (
    <div class="cbg-panel">
      <div class="cbg-head">
        <b>{t("Üyeler ({0}/{1})", props.members.length, GROUP_MAX_MEMBERS)}</b>
        <button class="icon-btn" title="Kapat" onClick={props.onClose}>
          <I.X />
        </button>
      </div>
      <Show
        when={!inviting()}
        fallback={
          <>
            <small class="muted">Davet edilecek arkadaşlar</small>
            <FriendPicker friends={candidates()} picked={picked()} onToggle={toggle} empty={t("Davet edebileceğin başka arkadaşın yok.")} />
            <div class="gmem-acts">
              <button class="btn ghost small" disabled={busy()} onClick={() => (setInviting(false), setPicked([]))}>
                Vazgeç
              </button>
              <button class="btn primary small" disabled={busy() || picked().length === 0} onClick={invite}>
                <I.UserPlus /> {t("Gruba ekle ({0})", picked().length)}
              </button>
            </div>
          </>
        }
      >
        <div class="gmem-list">
          <For each={props.members}>
            {(m) => (
              <div class="gmem">
                <Avatar id={m.user_id} name={m.display_name} size={24} />
                <b data-no-i18n>{m.display_name}</b>
                <Show when={m.user_id === me()}>
                  <small class="muted">(sen)</small>
                </Show>
                <Show when={m.is_owner}>
                  <span class="gmem-tag">Sahip</span>
                </Show>
                <span class="lt-sp" />
                <Show when={props.owner && m.user_id !== me()}>
                  <button class="icon-btn" title="Gruptan çıkar" disabled={busy()} onClick={() => kick(m)}>
                    <I.UserMinus />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={renaming()}>
          <div class="tpoll-row">
            <input class="input" maxLength={40} placeholder="Grup adı" value={name()} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && rename()} />
            <button class="btn primary small" disabled={busy() || name().trim().length < 2} onClick={rename}>
              Kaydet
            </button>
          </div>
        </Show>
        <div class="gmem-acts">
          <button class="btn ghost small" disabled={busy() || props.members.length >= GROUP_MAX_MEMBERS} onClick={() => setInviting(true)}>
            <I.UserPlus /> Arkadaş davet et
          </button>
          <Show when={props.owner}>
            <button class="btn ghost small" disabled={busy()} onClick={() => setRenaming(!renaming())}>
              <I.Pencil /> Adı değiştir
            </button>
          </Show>
          <button class="btn ghost small danger" disabled={busy()} onClick={leave}>
            Gruptan ayrıl
          </button>
          <Show when={props.owner}>
            <button class="btn small danger" disabled={busy()} onClick={remove}>
              <I.Trash /> Grubu sil
            </button>
          </Show>
        </div>
      </Show>
      <Show when={note()}>
        <p class="cbg-ok small">{note()}</p>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
    </div>
  );
}
