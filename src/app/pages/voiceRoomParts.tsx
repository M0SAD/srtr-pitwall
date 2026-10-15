// Ses odası sayfalarının ortak parçaları (oda listesi: VoiceRoomsPage, oda görünümü: VoiceRoomStage).

import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { friendRequest, friendRespond, myFriends, type Friend } from "@/cloud/social";
import { realAdmin } from "@/cloud/account";
import { voiceInvite, voiceMods, voiceRoomDelete, voiceRoomMeta, voiceRoomUpdate, type VoiceKind, type VoiceMod, type VoiceRole } from "@/cloud/voiceRooms";
import { announce, leaveRoom, voice } from "@/voice/engine";
import { askConfirm } from "../confirm";
import { categories, refreshRooms, rooms } from "@/voice/roomsStore";
import { RoomIconPicker } from "../components/RoomIcon";
import { Stepper, Switch } from "../components/SettingsForm";
import * as I from "../icons";

export const TALK_CHOICES = [15, 30, 45, 60, 90, 120, 180, 300, 600];
export const fmtSec = (s: number) => (s >= 60 ? (s % 60 ? t("{0} dk {1} sn", Math.floor(s / 60), s % 60) : t("{0} dk", s / 60)) : t("{0} sn", s));
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const KIND_LABEL: Record<VoiceKind, string> = {
  public: "Herkese açık",
  private: "Özel (davet kodu)",
  team: "Takım odası",
};
export const ROLE_LABEL: Record<VoiceRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  mod: "Moderatör",
  speaker: "Konuşmacı",
  member: "Üye",
};
export const errText = (e: unknown) => String((e as Error)?.message ?? e);

export function waitText(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? t("{0} sn önce", s) : t("{0} dk önce", Math.floor(s / 60));
}

export function Countdown(props: { until: number; total: number; label?: boolean }) {
  const left = () => Math.max(0, props.until - voice.now());
  const pct = () => Math.max(0, Math.min(100, (left() / Math.max(1000, props.total)) * 100));
  return (
    <span class="vr-cd" classList={{ low: left() < 10000 }}>
      <i style={{ width: `${pct()}%` }} />
      <Show when={props.label}>
        <em data-no-i18n>{clock(left())}</em>
      </Show>
    </span>
  );
}

// Arkadaşlık durumu (odadakiler menüsündeki "Arkadaş ekle" için): kişi → durum
const [friendMap, setFriendMap] = createSignal<Record<string, Friend["status"]>>({});
let friendsLoaded = 0;
function loadFriends(force = false) {
  if (!force && Date.now() - friendsLoaded < 60_000) return;
  friendsLoaded = Date.now();
  void myFriends()
    .then((l) => setFriendMap(Object.fromEntries((l ?? []).map((f) => [f.friend_id, f.status]))))
    .catch(() => {});
}

export function FriendButton(props: { user: string }) {
  const [msg, setMsg] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  loadFriends();
  const st = () => friendMap()[props.user];
  return (
    <div class="vr-mem-mod">
      <Show
        when={!st()}
        fallback={
          <small class="muted">
            {st() === "accepted" ? t("Arkadaşın") : st() === "pending_out" ? t("Arkadaşlık isteği gönderildi") : t("Sana arkadaşlık isteği gönderdi")}
          </small>
        }
      >
        <button
          class="btn small"
          disabled={busy()}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await friendRequest(props.user);
              setFriendMap({ ...friendMap(), [props.user]: "pending_out" });
              loadFriends(true);
            } catch (e) {
              setMsg(errText(e));
            }
            setBusy(false);
          }}
        >
          <I.UserPlus /> Arkadaş ekle
        </button>
      </Show>
      <Show when={st() === "pending_in"}>
        <button
          class="btn small primary"
          onClick={async () => {
            try {
              await friendRespond(props.user, true);
              setFriendMap({ ...friendMap(), [props.user]: "accepted" });
            } catch (e) {
              setMsg(errText(e));
            }
          }}
        >
          <I.Check /> Kabul et
        </button>
      </Show>
      <Show when={msg()}>
        <small class="sc-err">{msg()}</small>
      </Show>
    </div>
  );
}

export function RoomSettings(props: { inline?: boolean }) {
  const r = () => voice.room()!;
  const st = () => voice.state();
  const [open, setOpen] = createSignal(!!props.inline);
  const [name, setName] = createSignal("");
  const [desc, setDesc] = createSignal("");
  const [max, setMax] = createSignal(20);
  const [err, setErr] = createSignal("");
  createEffect(() => {
    if (open()) {
      setName(st()?.name ?? r().name);
      setDesc(st()?.description ?? r().description);
      setMax(st()?.max_members ?? r().max_members);
    }
  });
  const row = () => rooms().find((x) => x.id === r().id);
  const meta = async (o: Parameters<typeof voiceRoomMeta>[1]) => {
    setErr("");
    try {
      await voiceRoomMeta(r().id, o);
      await refreshRooms();
      announce();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const save = async (patch: Parameters<typeof voiceRoomUpdate>[1]) => {
    setErr("");
    try {
      await voiceRoomUpdate(r().id, patch);
      announce();
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <section class={props.inline ? "vr-settings-inline" : "panel"}>
      <Show when={!props.inline}>
        <button class="vr-fold" onClick={() => setOpen(!open())}>
          {open() ? <I.ChevronDown /> : <I.ChevronRight />} Oda ayarları
        </button>
      </Show>
      <Show when={open()}>
        <div class="row">
          <span>Oda adı</span>
          <input class="input" maxLength={40} value={name()} onInput={(e) => setName(e.currentTarget.value)} onChange={() => void save({ name: name() })} />
        </div>
        <div class="row">
          <span>Açıklama</span>
          <input
            class="input"
            maxLength={200}
            value={desc()}
            onInput={(e) => setDesc(e.currentTarget.value)}
            onChange={() => void save({ description: desc() })}
          />
        </div>
        <div class="row">
          <span>Konuşma</span>
          <div class="seg">
            <button classList={{ on: st()?.mode === "open" }} onClick={() => void save({ mode: "open" })}>
              Herkes konuşur
            </button>
            <button classList={{ on: st()?.mode === "moderated" }} onClick={() => void save({ mode: "moderated" })}>
              Söz hakkıyla
            </button>
          </div>
        </div>
        <div class="row">
          <span>En çok kişi</span>
          <Stepper
            value={max()}
            min={2}
            max={60}
            onChange={(v) => {
              setMax(v);
              void save({ max: v });
            }}
          />
        </div>
        <div class="row">
          <span>Simge</span>
          <RoomIconPicker value={row()?.icon ?? r().icon ?? ""} onChange={(v) => void meta({ icon: v })} />
        </div>
        <div class="row">
          <div>
            <span>Sadece PRO üyeler girebilsin</span>
            <small>Yöneticiler, moderatörler ve odada yetki verdiklerin her zaman girer.</small>
          </div>
          <Switch checked={!!(row()?.pro_only ?? r().pro_only)} onChange={(v) => void meta({ proOnly: v })} />
        </div>
        <Show when={realAdmin()}>
          <div class="row">
            <div>
              <span>Kategori</span>
              <small>Kategoriye konan oda kalıcıdır (boş kalınca silinmez).</small>
            </div>
            <select
              class="input"
              value={row()?.auto_delete ? "_private" : (row()?.category_id ?? "")}
              onChange={(e) => void meta({ category: e.currentTarget.value === "_private" ? null : e.currentTarget.value || null, setCategory: true })}
            >
              <option value="">{t("Topluluk odaları")}</option>
              <For each={categories()}>
                {(c) => (
                  <option value={c.id} data-no-i18n>
                    {c.name}
                  </option>
                )}
              </For>
              <Show when={row()?.auto_delete}>
                <option value="_private">{t("Özel odalar")}</option>
              </Show>
            </select>
          </div>
        </Show>
        <Show when={err()}>
          <p class="vr-err">{err()}</p>
        </Show>
        <Show when={r().owner === session()?.user.id || realAdmin()}>
          <div class="vr-form-act">
            <button
              class="btn danger small"
              onClick={async () => {
                if (
                  !(await askConfirm(t("“{0}” odası silinsin mi?", r().name), {
                    danger: true,
                    ok: t("Sil"),
                  }))
                )
                  return;
                const id = r().id;
                await leaveRoom();
                await voiceRoomDelete(id).catch(() => {});
              }}
            >
              <I.Trash /> Odayı sil
            </button>
          </div>
        </Show>
      </Show>
    </section>
  );
}

// Ses Odası Moderatörleri: bütün odalarda söz verir / alır, sırayı yönetir, odadan çıkarır
export const [globalMods, setGlobalMods] = createSignal<VoiceMod[]>([]);
export async function loadGlobalMods() {
  if (!realAdmin()) return;
  setGlobalMods(await voiceMods().catch(() => globalMods()));
}
export const isGlobalMod = (u: string) => globalMods().some((m) => m.user_id === u);

// ---------------------------------------------------------------------------
// Arkadaş davet et (mesaj olarak gider; arkadaş mesajdaki "Katıl" ile girer)
// ---------------------------------------------------------------------------

export function InvitePanel(props: { room: string }) {
  const [list] = createResource(() => myFriends().catch(() => [] as Friend[]));
  const [sent, setSent] = createSignal<Record<string, string>>({});
  const [q, setQ] = createSignal("");
  const inRoom = (id: string) => voice.members().some((m) => m.user_id === id);
  const shown = () =>
    (list() ?? [])
      .filter((f) => f.status === "accepted" && !inRoom(f.friend_id))
      .filter((f) => !q().trim() || f.display_name.toLocaleLowerCase("tr").includes(q().trim().toLocaleLowerCase("tr")))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.display_name.localeCompare(b.display_name));
  const invite = async (id: string) => {
    setSent({ ...sent(), [id]: "…" });
    try {
      await voiceInvite(props.room, id);
      setSent({ ...sent(), [id]: "ok" });
    } catch (e) {
      setSent({ ...sent(), [id]: errText(e) });
    }
  };
  return (
    <div class="vr-invite-panel">
      <input class="input" placeholder={t("Arkadaş ara")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <div class="vr-invite-list">
        <For each={shown()} fallback={<small class="muted">{list.loading ? t("Yükleniyor…") : t("Davet edilecek arkadaş yok.")}</small>}>
          {(f) => (
            <div class="vr-invite-row">
              <span class="vr-invite-dot" classList={{ on: f.online }} />
              <span class="vr-cat-name" data-no-i18n>
                {f.display_name}
              </span>
              <Show
                when={!sent()[f.friend_id] || (sent()[f.friend_id] !== "ok" && sent()[f.friend_id] !== "…")}
                fallback={<small class={sent()[f.friend_id] === "ok" ? "vr-ok" : "muted"}>{sent()[f.friend_id] === "ok" ? t("Davet gönderildi") : "…"}</small>}
              >
                <Show when={sent()[f.friend_id]}>
                  <small class="sc-err">{sent()[f.friend_id]}</small>
                </Show>
                <button class="btn small" onClick={() => void invite(f.friend_id)}>
                  <I.MailPlus /> Davet et
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
