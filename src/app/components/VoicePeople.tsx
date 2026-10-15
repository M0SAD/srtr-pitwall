// Ses odalarındaki kişiler için ortak parçalar:
//   * Kişi menüsü: oda kutusuna ya da sol menüdeki kişiye tıklayınca / sağ tıklayınca açılır (arkadaş ekle, ses,
//     söz, yetki, çıkar, başka odaya taşı).
//   * Sürükle-bırak taşıma: yönetici / moderatör bir kişiyi tutup sol menüdeki başka bir odanın üstüne bırakır (c122).
//     Tauri penceresinde HTML sürükle-bırak dosya bırakmayla çakıştığı için fare olaylarıyla yapılır.

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { initialOf } from "@/cloud/social";
import { cachedAvatar } from "@/cloud/profile";
import { realAdmin } from "@/cloud/account";
import { voiceExtend, voiceGrant, voiceKick, voiceModSet, voiceMove, voiceRevoke, voiceSetRole, type VoiceRole, type VoiceRoomRow } from "@/cloud/voiceRooms";
import { amAdmin, amMod, announce, announceKick, grantUntil, roleOf, setUserVolume, toggleLocalMute, userVolumes, voice } from "@/voice/engine";
import { refreshRooms, rooms, roomSections } from "@/voice/roomsStore";
import { askConfirm } from "../confirm";
import { Slider } from "./SettingsForm";
import { RoomIcon } from "./RoomIcon";
import { FriendButton, ROLE_LABEL, errText, isGlobalMod, loadGlobalMods } from "../pages/voiceRoomParts";
import * as I from "../icons";

const me = () => session()?.user.id ?? "";

/** Kişiye özgü yumuşak arka plan rengi */
export const tint = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return `hsl(${(h >>> 0) % 360} 20% 22%)`;
};

/** Yönetici işlemi: hata gösterilir, başarıda odadakilere bildirilir */
export const [actErr, setActErr] = createSignal("");
export async function act(f: () => Promise<unknown>) {
  setActErr("");
  try {
    await f();
    announce();
  } catch (e) {
    setActErr(errText(e));
  }
}

// ---------------------------------------------------------------------------
// Taşıma izni ve taşıma
// ---------------------------------------------------------------------------

const MOVER: string[] = ["owner", "admin", "mod"];
const roomRow = (id: string): VoiceRoomRow | undefined => rooms().find((r) => r.id === id);
/** Bu odada taşıma yetkim var mı (site yöneticisi / Ses Odası Moderatörü her odada; sunucu ayrıca denetler) */
const canMoveIn = (id: string) => realAdmin() || MOVER.includes(roomRow(id)?.my_role ?? "") || (voice.room()?.id === id && amMod());
export const canMove = (from: string, to: string) => from !== to && canMoveIn(from) && canMoveIn(to);
/** Bu odadan biri başka bir odaya taşınabilir mi (sürüklemeyi başlatmak için) */
export const canMoveFrom = (from: string) => canMoveIn(from) && rooms().some((r) => canMove(from, r.id));

export const [moveMsg, setMoveMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
let msgTimer = 0;
const flash = (ok: boolean, text: string) => {
  setMoveMsg({ ok, text });
  clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => setMoveMsg(null), ok ? 3500 : 7000);
};

export async function movePerson(user: string, name: string, to: string) {
  try {
    await voiceMove(user, to);
    flash(true, t("{0}, “{1}” odasına taşınıyor…", name, roomRow(to)?.name ?? ""));
    setTimeout(() => void refreshRooms(), 2500);
  } catch (e) {
    flash(false, errText(e));
  }
}

// ---------------------------------------------------------------------------
// Sürükle-bırak
// ---------------------------------------------------------------------------

export interface DragPerson {
  user: string;
  name: string;
  /** kişinin bulunduğu oda */
  from: string;
}
const [drag, setDrag] = createSignal<(DragPerson & { x: number; y: number }) | null>(null);
const [dropRoom, setDropRoom] = createSignal<string | null>(null);
export { drag as personDrag, dropRoom };

/** Kişi satırına / kutusuna pointerdown: 6 px sürüklenince taşıma başlar; bırakılan oda [data-vr-drop] */
export function startPersonDrag(e: PointerEvent, p: DragPerson) {
  if (e.button !== 0 || !canMoveFrom(p.from)) return;
  const sx = e.clientX,
    sy = e.clientY;
  let active = false;
  const target = (x: number, y: number) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.("[data-vr-drop]");
    const id = el?.getAttribute("data-vr-drop") ?? null;
    return id && canMove(p.from, id) ? id : null;
  };
  const move = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      active = true;
      closePersonMenu();
      document.body.classList.add("vr-dragging");
    }
    setDrag({ ...p, x: ev.clientX, y: ev.clientY });
    setDropRoom(target(ev.clientX, ev.clientY));
  };
  const done = (drop: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key);
    if (!active) return;
    document.body.classList.remove("vr-dragging");
    // Bırakınca ardından gelen tıklama (odaya girme / menü) çalışmasın
    const eat = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 50);
    const to = dropRoom();
    setDrag(null);
    setDropRoom(null);
    if (drop && to) void movePerson(p.user, p.name, to);
  };
  const up = () => done(true);
  const key = (ev: KeyboardEvent) => ev.key === "Escape" && done(false);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("keydown", key);
}

/** İmleçle birlikte giden kişi kartı */
export function DragGhost() {
  return (
    <Show when={drag()}>
      {(d) => (
        <Portal>
          <div class="vr-ghost" classList={{ ok: !!dropRoom() }} style={{ left: `${d().x + 14}px`, top: `${d().y + 10}px` }}>
            <span class="vrn-pav">
              <Show when={cachedAvatar(d().user)} fallback={<span>{initialOf(d().name)}</span>}>
                <img src={cachedAvatar(d().user)} alt="" />
              </Show>
            </span>
            <span data-no-i18n>{d().name}</span>
            <small>{dropRoom() ? t("Bırak: {0}", roomRow(dropRoom()!)?.name ?? "") : t("Bir odanın üstüne bırak")}</small>
          </div>
        </Portal>
      )}
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Kişi menüsü
// ---------------------------------------------------------------------------

export interface MenuTarget {
  user: string;
  name: string;
  /** kişinin bulunduğu oda */
  room: string;
  x: number;
  y: number;
}
const [menu, setMenu] = createSignal<MenuTarget | null>(null);
export { menu as personMenu };
export const closePersonMenu = () => setMenu(null);

/** Tıklama / sağ tıklama: imlecin yanında menü aç (aynı kişiye sol tık tekrar basınca kapanır) */
export function openPersonMenu(e: MouseEvent, p: { user: string; name: string; room: string }) {
  e.preventDefault();
  e.stopPropagation();
  const cur = menu();
  if (cur && cur.user === p.user && e.type === "click") return setMenu(null);
  setMenu({ ...p, x: e.clientX, y: e.clientY });
}

export function PersonMenuHost() {
  // Kendi odamdaki kişi odadan çıkınca menü kapanır
  const valid = () => {
    const m = menu();
    if (!m) return null;
    if (voice.room()?.id === m.room && !voice.members().some((x) => x.user_id === m.user)) return null;
    return m;
  };
  return <Show when={valid()}>{(m) => <PersonMenu target={m()} onClose={closePersonMenu} />}</Show>;
}

function PersonMenu(props: { target: MenuTarget; onClose: () => void }) {
  let el!: HTMLDivElement;
  const u = () => props.target.user;
  const mine = () => u() === me();
  const here = () => voice.room()?.id === props.target.room;
  const room = () => voice.room()!;
  const moderated = () => (voice.state()?.mode ?? voice.room()?.mode) === "moderated";
  const role = (): VoiceRole => (here() ? (room().owner === u() ? "owner" : roleOf(u())) : "member");
  const until = () => grantUntil(u());
  const muted = () => voice.localMuted().includes(u());
  const canManage = () => here() && amMod() && !mine() && !["owner", "admin"].includes(role());
  const targets = () =>
    roomSections()
      .flatMap((s) => s.rooms)
      .filter((r) => canMove(props.target.room, r.id));
  const [pos, setPos] = createSignal({ left: props.target.x, top: props.target.y });
  const [moving, setMoving] = createSignal(false);
  void loadGlobalMods();

  // İmlecin yanında; ekrandan taşmasın
  const place = () => {
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const x = props.target.x,
      y = props.target.y;
    setPos({
      left: x + w + 8 > window.innerWidth ? Math.max(8, x - w) : x + 4,
      top: Math.max(8, Math.min(window.innerHeight - h - 8, y)),
    });
  };
  onMount(() => {
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    const down = (e: PointerEvent) => !el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".vrs-tile, .vrn-person") && props.onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    const scroll = (e: Event) => !el.contains(e.target as Node) && props.onClose();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", props.onClose);
    onCleanup(() => {
      ro.disconnect();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("blur", props.onClose);
    });
  });

  return (
    <Portal>
      <div class="vrs-menu" ref={el} style={{ left: `${pos().left}px`, top: `${pos().top}px` }} onContextMenu={(e) => e.preventDefault()}>
        <div class="vrs-menu-head" style={{ "--tint": tint(u()) }}>
          <span class="vrs-av">
            <Show when={cachedAvatar(u())} fallback={<span>{initialOf(props.target.name)}</span>}>
              <img src={cachedAvatar(u())} alt="" />
            </Show>
          </span>
          <div>
            <b data-no-i18n>{props.target.name}</b>
            <Show
              when={here()}
              fallback={
                <small class="muted vrs-menu-room">
                  <I.Volume2 /> <span data-no-i18n>{roomRow(props.target.room)?.name ?? ""}</span>
                </small>
              }
            >
              <Show when={role() !== "member"}>
                <span class={`vr-role r-${role()}`}>
                  {role() === "owner" ? <I.Crown /> : null}
                  {t(ROLE_LABEL[role()])}
                </span>
              </Show>
            </Show>
          </div>
        </div>
        <div class="vrs-menu-body">
          <Show when={mine() && here()}>
            <small class="muted">{t("Bu sensin. Mikrofon ve ses için alttaki düğmeleri kullan.")}</small>
          </Show>
          <Show when={!mine()}>
            <FriendButton user={u()} />
          </Show>
          <Show when={!mine() && here()}>
            <div class="vr-vol">
              <span>Ses</span>
              <Slider value={userVolumes()[u()] ?? 100} min={0} max={200} step={5} unit="%" onInput={(v) => setUserVolume(u(), v)} />
            </div>
            <button class="btn small" onClick={() => toggleLocalMute(u())}>
              {muted() ? <I.Volume2 /> : <I.VolumeX />} {muted() ? t("Sesini aç") : t("Benim için sustur")}
            </button>
          </Show>
          <Show when={here() && moderated() && amMod() && !mine() && !["owner", "admin", "mod", "speaker"].includes(role())}>
            <div class="vr-mem-mod">
              <Show
                when={until()}
                fallback={
                  <button class="btn small primary" onClick={() => void act(() => voiceGrant(room().id, u()))}>
                    <I.Mic /> Söz ver
                  </button>
                }
              >
                <button class="btn small" onClick={() => void act(() => voiceExtend(room().id, u(), 30))}>
                  <I.TimerReset /> +30 sn
                </button>
                <button class="btn small danger" onClick={() => void act(() => voiceRevoke(room().id, u()))}>
                  <I.MicOff /> Sözü al
                </button>
              </Show>
            </div>
          </Show>
          <Show when={here() && amAdmin() && !mine() && role() !== "owner"}>
            <div class="vr-mem-mod">
              <small class="muted">Yetki:</small>
              <For each={["member", "speaker", "mod", "admin"] as VoiceRole[]}>
                {(x) => (
                  <button
                    class="btn small"
                    classList={{ on: role() === x }}
                    disabled={role() === x}
                    onClick={() => void act(() => voiceSetRole(room().id, u(), x === "member" ? null : (x as "admin" | "mod" | "speaker")))}
                  >
                    {t(ROLE_LABEL[x])}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={realAdmin() && !mine() && role() !== "owner"}>
            <div class="vr-mem-mod">
              <Show
                when={isGlobalMod(u())}
                fallback={
                  <button class="btn small" onClick={() => void act(() => voiceModSet(u(), true).then(loadGlobalMods))}>
                    <I.ShieldCheck /> Ses Odası Moderatörü yap
                  </button>
                }
              >
                <small class="muted">{t("Ses Odası Moderatörü (bütün odalarda)")}</small>
                <button class="btn small" onClick={() => void act(() => voiceModSet(u(), false).then(loadGlobalMods))}>
                  Moderatörlüğü kaldır
                </button>
              </Show>
            </div>
          </Show>
          <Show when={targets().length && (!mine() || realAdmin())}>
            <div class="vrs-move">
              <small class="muted">
                <I.ArrowRightLeft /> {t("Başka odaya taşı")}
              </small>
              <div class="vrs-move-list">
                <For each={targets()}>
                  {(r) => (
                    <button
                      class="vrs-move-room"
                      disabled={moving()}
                      onClick={async () => {
                        setMoving(true);
                        await movePerson(u(), props.target.name, r.id);
                        setMoving(false);
                        props.onClose();
                      }}
                    >
                      <RoomIcon icon={r.icon} kind={r.kind} />
                      <span data-no-i18n>{r.name}</span>
                      <Show when={r.members > 0}>
                        <em data-no-i18n>{r.members}</em>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
              <small class="muted">{t("İpucu: kişiyi tutup sol menüdeki odanın üstüne de sürükleyebilirsin.")}</small>
            </div>
          </Show>
          <Show when={canManage()}>
            <div class="vr-mem-mod">
              <button
                class="btn small"
                onClick={() =>
                  void act(async () => {
                    await voiceKick(room().id, u(), 0);
                    announceKick(u());
                  })
                }
              >
                <I.UserX /> Çıkar
              </button>
              <button
                class="btn small warn"
                onClick={() =>
                  void act(async () => {
                    await voiceKick(room().id, u(), 10);
                    announceKick(u());
                  })
                }
              >
                <I.Ban /> 10 dk uzaklaştır
              </button>
              <button
                class="btn small danger"
                onClick={async () => {
                  if (!(await askConfirm(t("{0} bu odaya bir daha giremesin mi?", props.target.name), { danger: true, ok: t("Kalıcı yasakla") }))) return;
                  await act(async () => {
                    await voiceKick(room().id, u(), null);
                    announceKick(u());
                  });
                }}
              >
                <I.Ban /> Kalıcı yasakla
              </button>
            </div>
          </Show>
          <Show when={actErr()}>
            <small class="sc-err">{actErr()}</small>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
