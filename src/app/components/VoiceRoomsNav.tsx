// Sol alt menü (Ses Odaları bölümü, Discord benzeri): en üstte Ses ayarları ve Tüm odalar, altında bölümler
// (kategoriler, Topluluk odaları, Özel odalar; başlığa tıklayınca katlanır), odaların altında içindeki kişiler
// (konuşan yeşil halkalı), en altta ses bağlantısı ve kendi mikrofon / ses düğmelerim.

import { For, Show, createEffect, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { initialOf } from "@/cloud/social";
import { cachedAvatar, loadAvatars } from "@/cloud/profile";
import { config, isPro, profile, realAdmin } from "@/cloud/account";
import { uiPref } from "@/sdk/settings";
import type { VoiceRoomRow } from "@/cloud/voiceRooms";
import { canSpeak, inputMode, isTalking, joinRoom, leaveRoom, toggleDeafen, toggleMic, transmitting, voice } from "@/voice/engine";
import { peopleIn, roomSections, setCreateOpen, watchRooms } from "@/voice/roomsStore";
import { RoomIcon } from "./RoomIcon";
import { DragGhost, PersonMenuHost, canMoveFrom, dropRoom, moveMsg, openPersonMenu, personDrag, personMenu, startPersonDrag } from "./VoicePeople";
import { go, sub } from "../ui";
import * as I from "../icons";
import "../voicerooms.css";

const [folded, setFolded] = uiPref<string[]>("voice.nav.folded", []);
const MAX_PEOPLE = 8;

interface NavPerson {
  id: string;
  name: string;
  live: boolean;
  muted?: boolean;
  deaf?: boolean;
}

function RoomItem(props: { r: VoiceRoomRow }) {
  const here = () => voice.room()?.id === props.r.id;
  const me = () => session()?.user.id ?? "";
  // Bulunduğum odada canlı liste (konuşan, susturulmuş), diğerlerinde sunucudaki liste
  const people = (): NavPerson[] =>
    here()
      ? voice.members().map((m) => ({ id: m.user_id, name: m.name, live: true, muted: m.muted, deaf: m.deaf }))
      : peopleIn(props.r.id).map((p) => ({ id: p.user_id, name: p.name ?? "?", live: false }));
  const talking = (p: NavPerson) => p.live && isTalking(p.id) && (p.id === me() ? transmitting() : canSpeak(p.id));
  const drop = () => !!personDrag() && dropRoom() === props.r.id;
  return (
    <div class="vrn-drop" data-vr-drop={props.r.id} classList={{ over: drop(), dragging: !!personDrag() }}>
      <button
        class="vrn-room"
        classList={{ active: here() && sub() !== "settings" && sub() !== "all", here: here(), dim: props.r.can_enter === false }}
        title={props.r.description || props.r.name}
        onClick={() => {
          go("voicerooms", "rooms");
          if (!here()) void joinRoom(props.r.id, null);
        }}
      >
        <span class="vrn-ic">
          <RoomIcon icon={props.r.icon} kind={props.r.kind} />
        </span>
        <span class="vrn-name" data-no-i18n>
          {props.r.name}
        </span>
        <Show when={props.r.pro_only}>
          <span class="vr-pro" title={t("Sadece PRO üyeler girebilir")}>
            PRO
          </span>
        </Show>
        <Show when={props.r.mode === "moderated"}>
          <span class="vrn-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
            <I.Hand />
          </span>
        </Show>
        <Show when={props.r.members > 0 && !people().length}>
          <span class="vrn-count">{props.r.members}</span>
        </Show>
      </button>
      <Show when={people().length}>
        <div class="vrn-people">
          <For each={people().slice(0, MAX_PEOPLE)}>
            {(p) => (
              <div
                class="vrn-person"
                classList={{
                  talking: talking(p),
                  me: p.id === me(),
                  open: personMenu()?.user === p.id,
                  dragged: personDrag()?.user === p.id,
                  movable: canMoveFrom(props.r.id),
                }}
                onClick={(e) => openPersonMenu(e, { user: p.id, name: p.name, room: props.r.id })}
                onContextMenu={(e) => openPersonMenu(e, { user: p.id, name: p.name, room: props.r.id })}
                onPointerDown={(e) => startPersonDrag(e, { user: p.id, name: p.name, from: props.r.id })}
              >
                <span class="vrn-pav">
                  <Show when={cachedAvatar(p.id)} fallback={<span>{initialOf(p.name)}</span>}>
                    <img src={cachedAvatar(p.id)} alt="" />
                  </Show>
                </span>
                <span class="vrn-pname" data-no-i18n>
                  {p.name}
                </span>
                <Show when={p.muted && !p.deaf}>
                  <I.MicOff />
                </Show>
                <Show when={p.deaf}>
                  <I.HeadphoneOff />
                </Show>
              </div>
            )}
          </For>
          <Show when={people().length > MAX_PEOPLE}>
            <small class="vrn-more">{t("+{0} kişi daha", String(people().length - MAX_PEOPLE))}</small>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Alt panel: ses bağlantısı + kendi düğmelerim (Discord'daki kullanıcı paneli) */
function MePanel() {
  const live = () => !!voice.room() && voice.status() !== "idle" && voice.status() !== "error";
  const me = () => session()?.user.id ?? "";
  const name = () => profile()?.display_name ?? "";
  const status = () =>
    !live()
      ? t("Bir odaya gir")
      : transmitting()
        ? t("Konuşuyor")
        : voice.deafened()
          ? t("Sesi kapalı")
          : !voice.micOn() && inputMode() === "open"
            ? t("Mikrofonu kapalı")
            : t("Bağlı");
  return (
    <div class="vrn-me">
      <Show when={live()}>
        <div class="vrn-conn" classList={{ warn: voice.status() !== "connected" }}>
          <button class="vrn-conn-txt" onClick={() => go("voicerooms", "rooms")} title={t("Ses odasını aç")}>
            <b>{voice.status() === "connected" ? t("Ses bağlı") : voice.status() === "reconnecting" ? t("Yeniden bağlanıyor…") : t("Bağlanıyor…")}</b>
            <small data-no-i18n>{voice.room()?.name}</small>
          </button>
          <button class="vrn-ib leave" title={t("Ayrıl")} onClick={() => void leaveRoom()}>
            <I.PhoneOff />
          </button>
        </div>
      </Show>
      <div class="vrn-user">
        <span class="vrn-pav big" classList={{ talking: live() && transmitting() }}>
          <Show when={cachedAvatar(me())} fallback={<span>{initialOf(name() || "?")}</span>}>
            <img src={cachedAvatar(me())} alt="" />
          </Show>
        </span>
        <span class="vrn-user-txt">
          <b data-no-i18n>{name()}</b>
          <small>{status()}</small>
        </span>
        <Show when={live() && inputMode() === "open"}>
          <button class="vrn-ib" classList={{ off: !voice.micOn() }} title={voice.micOn() ? t("Mikrofonu kapat") : t("Mikrofonu aç")} onClick={toggleMic}>
            {voice.micOn() ? <I.Mic /> : <I.MicOff />}
          </button>
        </Show>
        <Show when={live()}>
          <button
            class="vrn-ib"
            classList={{ off: voice.deafened() }}
            title={voice.deafened() ? t("Sesi aç") : t("Sesi kapat (kimseyi duyma)")}
            onClick={toggleDeafen}
          >
            {voice.deafened() ? <I.HeadphoneOff /> : <I.Headphones />}
          </button>
        </Show>
        <button class="vrn-ib" classList={{ on: sub() === "settings" }} title={t("Ses ayarları")} onClick={() => go("voicerooms", "settings")}>
          <I.Settings />
        </button>
      </div>
    </div>
  );
}

export function VoiceRoomsNav() {
  onCleanup(watchRooms());
  createEffect(() => {
    const ids = roomSections().flatMap((s) => s.rooms.flatMap((r) => peopleIn(r.id).map((p) => p.user_id)));
    const me = session()?.user.id;
    if (me) ids.push(me);
    if (ids.length) void loadAvatars(ids);
  });
  const isFolded = (id: string) => folded().includes(id);
  const fold = (id: string) => setFolded(isFolded(id) ? folded().filter((x) => x !== id) : [...folded(), id]);
  // "+": yönetici her bölüme, oda kurabilen PRO üye "Özel odalar"a oda kurar
  const canAdd = (id: string) => realAdmin() || (id === "_private" && config()?.voice_create !== "admin" && (isPro() || config()?.voice_create === "all"));
  const add = (id: string) => {
    setCreateOpen({ cat: id.startsWith("_") ? "" : id });
    go("voicerooms", "all");
  };
  return (
    <div class="vrn">
      <button class="vrn-top" classList={{ active: sub() === "settings" }} onClick={() => go("voicerooms", "settings")}>
        <I.Settings /> Ses ayarları
      </button>
      <button class="vrn-top" classList={{ active: sub() === "all" || (sub() !== "settings" && !voice.room()) }} onClick={() => go("voicerooms", "all")}>
        <I.Grid3x3 /> Tüm odalar
      </button>
      <Show when={session()}>
        <div class="vrn-scroll">
          <For each={roomSections().filter((sec) => sec.rooms.length || sec.id === "_private")}>
            {(sec) => (
              <div class="vrn-sec" classList={{ folded: isFolded(sec.id) }}>
                <div class="vrn-head">
                  <button class="vrn-head-btn" onClick={() => fold(sec.id)} title={isFolded(sec.id) ? t("Aç") : t("Katla")}>
                    {isFolded(sec.id) ? <I.ChevronRight /> : <I.ChevronDown />}
                    {sec.fixed ? t(sec.title) : <span data-no-i18n>{sec.title}</span>}
                  </button>
                  <Show when={canAdd(sec.id)}>
                    <button class="vrn-add" title={t("Oda kur")} onClick={() => add(sec.id)}>
                      <I.Plus />
                    </button>
                  </Show>
                </div>
                <Show
                  when={!isFolded(sec.id)}
                  fallback={
                    // Katlanmışken yalnızca bulunduğum oda görünür (Discord gibi)
                    <For each={sec.rooms.filter((r) => voice.room()?.id === r.id)}>{(r) => <RoomItem r={r} />}</For>
                  }
                >
                  <For each={sec.rooms} fallback={<small class="vrn-empty">{sec.id === "_private" ? t("Şu an özel oda yok") : t("Henüz oda yok")}</small>}>
                    {(r) => <RoomItem r={r} />}
                  </For>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={moveMsg()}>
          {(m) => (
            <div class="vrn-toast" classList={{ ok: m().ok }}>
              {m().ok ? <I.ArrowRightLeft /> : <I.TriangleAlert />}
              <span>{m().text}</span>
            </div>
          )}
        </Show>
        <MePanel />
        <PersonMenuHost />
        <DragGhost />
      </Show>
    </div>
  );
}
