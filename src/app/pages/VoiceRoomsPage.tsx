// Ses Odaları (sol menüde ayrı bölüm): Discord benzeri sade sesli odalar (herkese açık / davet kodlu özel / takım).
// Kalabalık odalarda "söz hakkıyla" mod: yöneticiler süreli söz verir, uzatır, geri alır; diğerleri söz ister.
// Motor: src/voice/engine.ts (Cloudflare Realtime SFU), veri: src/cloud/voiceRooms.ts (c116).

import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { findPeople, friendRequest, friendRespond, initialOf, myFriends, type Friend, type Person } from "@/cloud/social";
import { cachedAvatar, loadAvatars } from "@/cloud/profile";
import { myTeams, type MyTeam } from "@/cloud/teams";
import { settings } from "@/sdk/settings";
import { config, isPro, realAdmin, saveConfig } from "@/cloud/account";
import {
  voiceDismissRequest,
  voiceExtend,
  voiceGrant,
  voiceGrantNext,
  voiceKick,
  voiceRequestFloor,
  voiceRevoke,
  voiceRoomCreate,
  voiceRoomDelete,
  voiceRoomNewCode,
  voiceRoomUpdate,
  voiceRoomMeta,
  voiceCategorySave,
  voiceCategoryDelete,
  voiceMods,
  voiceModSet,
  voiceInvite,
  voiceSetRole,
  type VoiceKind,
  type VoiceMode,
  type VoiceRole,
  type VoiceRoomRow,
  type VoiceMod,
} from "@/cloud/voiceRooms";
import {
  amAdmin,
  amMod,
  announce,
  announceKick,
  canSpeak,
  grantUntil,
  inputMode,
  joinRoom,
  leaveRoom,
  requested,
  roleOf,
  setUserVolume,
  toggleDeafen,
  toggleLocalMute,
  toggleMic,
  transmitting,
  levelOf,
  isTalking,
  userVolumes,
  voice,
  type VoiceMember,
} from "@/voice/engine";
import { askConfirm } from "../confirm";
import { categories, refreshRooms, rooms, roomSections, roomsErr, watchRooms } from "@/voice/roomsStore";
import { RoomIcon, RoomIconPicker } from "../components/RoomIcon";
import { Slider, Stepper, Switch } from "../components/SettingsForm";
import * as I from "../icons";
import { go } from "../ui";
import { VoiceRoomSettings } from "./VoiceRoomSettings";
import "../voicerooms.css";

const TALK_CHOICES = [15, 30, 45, 60, 90, 120, 180, 300, 600];
const fmtSec = (s: number) => (s >= 60 ? (s % 60 ? t("{0} dk {1} sn", Math.floor(s / 60), s % 60) : t("{0} dk", s / 60)) : t("{0} sn", s));
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const KIND_LABEL: Record<VoiceKind, string> = {
  public: "Herkese açık",
  private: "Özel (davet kodu)",
  team: "Takım odası",
};
const ROLE_LABEL: Record<VoiceRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  mod: "Moderatör",
  speaker: "Konuşmacı",
  member: "Üye",
};
const errText = (e: unknown) => String((e as Error)?.message ?? e);

export function VoiceRoomsPage(props: { sub?: string }) {
  return (
    <div class="page vr-page">
      <Show when={props.sub === "settings"}>
        <VoiceRoomSettings />
      </Show>
      <Show when={props.sub !== "settings"}>
        <Show when={cloudEnabled} fallback={<p class="muted">Bulut bağlantısı yapılandırılmamış.</p>}>
          <Show when={session()} fallback={<p class="muted">Ses odalarını kullanmak için giriş yapmalısın (Hesap).</p>}>
            <Show when={voice.room() || voice.status() === "connecting" || voice.status() === "reconnecting"} fallback={<Lobby />}>
              <RoomView />
              {/* Odadayken de bütün odalar görünür; başka odaya "Gir" bu odadan çıkıp oraya geçer */}
              <Lobby inRoom />
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oda listesi
// ---------------------------------------------------------------------------

function Lobby(props: { inRoom?: boolean }) {
  const [err, setErr] = createSignal("");
  const refetch = () => refreshRooms();
  const [code, setCode] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  onCleanup(watchRooms());

  // Oda kurma izni (c117, Yönetim: app_config.voice_create); sunucu ayrıca denetler
  const createWho = () => config()?.voice_create ?? "pro";
  const [teamsAdm] = createResource(() => (createWho() === "team" && !realAdmin() ? myTeams().catch(() => [] as MyTeam[]) : Promise.resolve([] as MyTeam[])));
  const canCreate = () =>
    realAdmin() ||
    createWho() === "all" ||
    ((createWho() === "pro" || createWho() === "team") && isPro()) ||
    (createWho() === "team" && (teamsAdm() ?? []).some((x) => x.role === "owner" || x.role === "admin"));

  const enter = async (id: string | null, c: string | null) => {
    setBusy(id ?? "code");
    setErr("");
    await joinRoom(id, c);
    setBusy("");
  };

  return (
    <>
      <Show when={!props.inRoom && voice.status() === "error" && voice.error()}>
        <p class="vr-err">{voice.error()}</p>
      </Show>
      <section class="panel vr-intro">
        <div class="vr-intro-txt">
          <h3>{props.inRoom ? t("Odalar") : t("Ses Odaları")}</h3>
          <p class="muted small" classList={{ "vr-hide": !!props.inRoom }}>
            Takımınla ya da turnuvada sesli konuş. Konuşmalar kaydedilmez. Kalabalık odalarda “söz hakkıyla” modunu seç: yöneticiler süreli söz verir, diğerleri
            sıraya girer.
          </p>
        </div>
        <div class="vr-intro-act">
          <Show when={canCreate()}>
            <button class="btn primary" onClick={() => setCreating(!creating())}>
              <I.Plus /> Oda kur
            </button>
          </Show>
          <form
            class="vr-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (code().trim()) void enter(null, code().trim());
            }}
          >
            <input class="input" placeholder={t("Davet kodu")} maxLength={12} value={code()} onInput={(e) => setCode(e.currentTarget.value.toUpperCase())} />
            <button class="btn" disabled={!code().trim() || !!busy()}>
              <I.KeyRound /> Katıl
            </button>
          </form>
        </div>
      </section>
      <Show when={realAdmin()}>
        <section class="panel vr-admin">
          <div class="row">
            <div>
              <span>Kimler oda kurabilir</span>
              <small>
                Odalara herkes girebilir; bu ayar sadece yeni oda kurmayı sınırlar. Yöneticiler her zaman kurar ve odaları kalıcıdır; diğerlerinin odası içinde
                kimse kalmadıktan 1 saat sonra silinir. Yalnızca yöneticiler görür.
              </small>
            </div>
            <select
              class="input"
              value={createWho()}
              onChange={(e) => void saveConfig({ voice_create: e.currentTarget.value as "admin" | "team" | "all" }).catch((x) => setErr(errText(x)))}
            >
              <option value="admin">{t("Sadece yöneticiler")}</option>
              <option value="pro">{t("PRO üyeler")}</option>
              <option value="team">{t("PRO üyeler ve takım yöneticileri (takım odası)")}</option>
              <option value="all">{t("Herkes")}</option>
            </select>
          </div>
          <CategoryManager />
          <VoiceModsPanel />
        </section>
      </Show>
      <Show when={err()}>
        <p class="vr-err">{err()}</p>
      </Show>
      <Show when={creating()}>
        <CreateRoom
          onDone={(id) => {
            setCreating(false);
            void refetch();
            if (id) void enter(id, null);
          }}
        />
      </Show>
      <Show when={roomsErr()}>
        <p class="vr-err">{roomsErr()}</p>
      </Show>
      <For each={roomSections().filter((sec) => sec.rooms.length || sec.id === "_private" || (realAdmin() && !sec.fixed))}>
        {(sec) => (
          <RoomGroup
            title={sec.title}
            raw={!sec.fixed}
            note={sec.id === "_private" ? "PRO üyelerin kurduğu odalar. İçinde kimse kalmadıktan 1 saat sonra silinir." : undefined}
            rows={sec.rooms}
            busy={busy()}
            onJoin={(id) => void enter(id, null)}
            onChanged={() => void refetch()}
            empty={sec.id === "_private" ? (canCreate() && !realAdmin() ? "Şu an özel oda yok. İlk odayı sen kur." : "Şu an özel oda yok.") : "Henüz oda yok."}
          />
        )}
      </For>
    </>
  );
}

function RoomGroup(props: {
  title: string;
  /** başlık kullanıcı adı (kategori): çevrilmez */
  raw?: boolean;
  note?: string;
  rows: VoiceRoomRow[];
  busy: string;
  onJoin: (id: string) => void;
  onChanged: () => void;
  empty?: string;
}) {
  return (
    <Show when={props.rows.length || props.empty}>
      <section class="panel">
        <h3>{props.raw ? <span data-no-i18n>{props.title}</span> : t(props.title)}</h3>
        <Show when={props.note}>
          <p class="muted small vr-group-note">{props.note}</p>
        </Show>
        <Show when={props.rows.length} fallback={<p class="muted small">{props.empty}</p>}>
          <div class="vr-rooms">
            <For each={props.rows}>
              {(r) => (
                <div class="vr-room" classList={{ here: voice.room()?.id === r.id }}>
                  <div class="vr-room-ic" classList={{ live: r.members > 0 }}>
                    <RoomIcon icon={r.icon} kind={r.kind} />
                  </div>
                  <div class="vr-room-main">
                    <b class="vr-room-name">
                      <span data-no-i18n>{r.name}</span>
                      <Show when={r.pro_only}>
                        <span class="vr-pro" title={t("Sadece PRO üyeler girebilir")}>
                          PRO
                        </span>
                      </Show>
                      <Show when={r.mode === "moderated"}>
                        <span class="vr-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
                          <I.Hand />
                        </span>
                      </Show>
                    </b>
                    <small class="muted">
                      {t(KIND_LABEL[r.kind])}
                      {r.team_name ? ` · ${r.team_name}` : ""}
                      {r.mode === "moderated" ? ` · ${t("Söz hakkıyla")} (${fmtSec(r.talk_seconds)})` : ""}
                      {r.owner_name && !r.is_mine ? ` · ${r.owner_name}` : ""}
                    </small>
                    <Show when={r.is_mine && r.auto_delete}>
                      <small class="muted">{t("Boş kalınca 1 saat sonra silinir")}</small>
                    </Show>
                    <Show when={r.description}>
                      <small class="vr-desc" data-no-i18n>
                        {r.description}
                      </small>
                    </Show>
                  </div>
                  <span class="vr-count" classList={{ live: r.members > 0 }} title={t("Odada / en çok")}>
                    <I.Headphones /> {r.members}/{r.max_members}
                  </span>
                  <Show
                    when={voice.room()?.id !== r.id}
                    fallback={
                      <span class="vr-here">
                        <I.AudioLines /> {t("Buradasın")}
                      </span>
                    }
                  >
                    <button
                      class="btn primary small"
                      disabled={!!props.busy || r.can_enter === false}
                      title={r.can_enter === false ? (r.pro_only ? t("Bu oda PRO üyelere özel") : t("Bu odaya giremezsin")) : ""}
                      onClick={() => props.onJoin(r.id)}
                    >
                      {props.busy === r.id ? t("Bağlanıyor…") : t("Gir")}
                    </button>
                  </Show>
                  <Show when={r.is_mine || realAdmin()}>
                    <button
                      class="btn ghost small"
                      title={r.is_mine ? t("Odayı sil") : t("Odayı sil (yönetici)")}
                      onClick={async () => {
                        const note = !r.is_mine ? t("Odadaki herkes çıkarılır. Oda sahibi: {0}", r.owner_name ?? "?") : undefined;
                        if (!(await askConfirm(t("“{0}” odası silinsin mi?", r.name), { danger: true, ok: t("Sil"), note }))) return;
                        if (voice.room()?.id === r.id) await leaveRoom();
                        await voiceRoomDelete(r.id).catch(() => {});
                        props.onChanged();
                      }}
                    >
                      <I.Trash />
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  );
}

function CreateRoom(props: { onDone: (id: string | null) => void }) {
  const [name, setName] = createSignal("");
  const [desc, setDesc] = createSignal("");
  const [kind, setKind] = createSignal<VoiceKind>("public");
  const [team, setTeam] = createSignal("");
  const [mode, setMode] = createSignal<VoiceMode>("open");
  const [talk, setTalk] = createSignal(60);
  const [max, setMax] = createSignal(20);
  const [icon, setIcon] = createSignal("");
  const [proOnly, setProOnly] = createSignal(false);
  const [cat, setCat] = createSignal("");
  const [err, setErr] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [teams] = createResource(() => myTeams().catch(() => [] as MyTeam[]));
  const adminTeams = () => (teams() ?? []).filter((x) => x.role === "owner" || x.role === "admin");
  createEffect(() => {
    if (kind() === "team" && !team() && adminTeams()[0]) setTeam(adminTeams()[0].team_id);
  });
  // Kalabalık oda: söz hakkı modu önerilir
  createEffect(() => {
    if (max() >= 15 && mode() === "open") setErr("");
  });
  const submit = async () => {
    setErr("");
    if (name().trim().length < 2) return setErr(t("Oda adı en az 2 harf olmalı"));
    if (kind() === "team" && !team()) return setErr(t("Takım seç"));
    setBusy(true);
    try {
      const id = await voiceRoomCreate({
        name: name().trim(),
        kind: kind(),
        team: kind() === "team" ? team() : null,
        mode: mode(),
        talkSeconds: talk(),
        max: max(),
        description: desc().trim(),
        icon: icon(),
        proOnly: proOnly(),
        category: realAdmin() && cat() ? cat() : null,
      });
      props.onDone(String(id));
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  return (
    <section class="panel vr-create">
      <h3>Yeni oda</h3>
      <div class="row">
        <span>Oda adı</span>
        <input class="input" maxLength={40} value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder={t("ör. Pazar turnuvası")} />
      </div>
      <div class="row">
        <span>Açıklama</span>
        <input class="input" maxLength={200} value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} placeholder={t("İsteğe bağlı")} />
      </div>
      <div class="row">
        <span>Simge</span>
        <RoomIconPicker value={icon()} onChange={setIcon} />
      </div>
      <Show when={realAdmin()}>
        <div class="row">
          <span>Kategori</span>
          <select class="input" value={cat()} onChange={(e) => setCat(e.currentTarget.value)}>
            <option value="">{t("Topluluk odaları")}</option>
            <For each={categories()}>
              {(c) => (
                <option value={c.id} data-no-i18n>
                  {c.name}
                </option>
              )}
            </For>
          </select>
        </div>
      </Show>
      <div class="row">
        <div>
          <span>Sadece PRO üyeler girebilsin</span>
          <small>Yöneticiler, moderatörler ve odada yetki verdiklerin her zaman girer.</small>
        </div>
        <Switch checked={proOnly()} onChange={setProOnly} />
      </div>
      <div class="row">
        <span>Tür</span>
        <div class="seg">
          <For each={["public", "private", "team"] as VoiceKind[]}>
            {(k) => (
              <button classList={{ on: kind() === k }} onClick={() => setKind(k)} disabled={k === "team" && !adminTeams().length}>
                {t(KIND_LABEL[k])}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={kind() === "private"}>
        <p class="muted small">Oda listede görünmez; kurunca bir davet kodu alırsın, girmek isteyen bu kodu yazar.</p>
      </Show>
      <Show when={kind() === "team"}>
        <div class="row">
          <span>Takım</span>
          <select value={team()} onChange={(e) => setTeam(e.currentTarget.value)}>
            <For each={adminTeams()}>{(x) => <option value={x.team_id}>{x.name}</option>}</For>
          </select>
        </div>
      </Show>
      <div class="row">
        <span>Konuşma</span>
        <div class="seg">
          <button classList={{ on: mode() === "open" }} onClick={() => setMode("open")}>
            Herkes konuşur
          </button>
          <button classList={{ on: mode() === "moderated" }} onClick={() => setMode("moderated")}>
            Söz hakkıyla
          </button>
        </div>
      </div>
      <Show when={mode() === "moderated"}>
        <div class="row">
          <span>Konuşma süresi</span>
          <select value={talk()} onChange={(e) => setTalk(Number(e.currentTarget.value))}>
            <For each={TALK_CHOICES}>{(s) => <option value={s}>{fmtSec(s)}</option>}</For>
          </select>
        </div>
        <p class="muted small">
          Yöneticiler ve moderatörler her zaman konuşur. Diğerleri “Söz iste”ye basar; söz verilince bu süre kadar konuşur, yönetici uzatabilir ya da geri
          alabilir.
        </p>
      </Show>
      <Show when={mode() === "open" && max() >= 15}>
        <p class="vr-hint">15 kişiden kalabalık odalarda “Söz hakkıyla” önerilir: herkes aynı anda konuşunca anlaşılmaz ve veri kullanımı artar.</p>
      </Show>
      <div class="row">
        <span>En çok kişi</span>
        <Stepper value={max()} min={2} max={60} onChange={setMax} />
      </div>
      <Show when={!realAdmin()}>
        <p class="muted small">Odada kimse kalmadıktan 1 saat sonra oda kendiliğinden silinir.</p>
      </Show>
      <Show when={err()}>
        <p class="vr-err">{err()}</p>
      </Show>
      <div class="vr-form-act">
        <button class="btn" onClick={() => props.onDone(null)}>
          Vazgeç
        </button>
        <button class="btn primary" disabled={busy()} onClick={() => void submit()}>
          Oluştur ve gir
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Oda
// ---------------------------------------------------------------------------

function RoomView() {
  const r = () => voice.room();
  const st = () => voice.state();
  const me = () => session()?.user.id ?? "";
  const moderated = () => (st()?.mode ?? r()?.mode) === "moderated";
  const [err, setErr] = createSignal("");
  const [openUser, setOpenUser] = createSignal("");
  const [inviting, setInviting] = createSignal(false);
  const [code, setCode] = createSignal<string | null>(null);
  createEffect(() => setCode(r()?.invite_code ?? null));
  createEffect(() => {
    const ids = voice.members().map((m) => m.user_id);
    if (ids.length) void loadAvatars(ids);
  });

  /** Yönetici işlemi: hata gösterilir, başarıda odadakilere bildirilir */
  const act = async (f: () => Promise<unknown>) => {
    setErr("");
    try {
      await f();
      announce();
    } catch (e) {
      setErr(errText(e));
    }
  };

  const myUntil = () => grantUntil(me());
  const privileged = () => ["owner", "admin", "mod", "speaker"].includes(roleOf(me())) || r()?.owner === me();
  const queuePos = () => (st()?.requests ?? []).findIndex((q) => q.user_id === me()) + 1;
  const present = (u: string) => voice.members().some((m) => m.user_id === u);
  const speakers = createMemo(() => (st()?.grants ?? []).filter((g) => Date.parse(g.until) > voice.now()));

  const rank = (u: string) => {
    const ro = r()?.owner === u ? "owner" : roleOf(u);
    if (ro === "owner" || ro === "admin") return 0;
    if (ro === "mod") return 1;
    if (ro === "speaker" || grantUntil(u)) return 2;
    return 3;
  };

  // Liste: konuşabilenler üstte
  const sorted = createMemo(() =>
    [...voice.members()].sort((a, b) => {
      const ra = rank(a.user_id),
        rb = rank(b.user_id);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    }),
  );
  return (
    <>
      <section class="panel vr-head">
        <div class="vr-head-main">
          <h3 class="vr-room-name">
            <span data-no-i18n>{r()?.name ?? "…"}</span>
            <Show when={moderated()}>
              <span class="vr-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
                <I.Hand />
              </span>
            </Show>
          </h3>
          <small class="muted">
            {r() ? t(KIND_LABEL[r()!.kind]) : ""}
            {moderated() ? ` · ${t("Söz hakkıyla")} (${fmtSec(st()?.talk_seconds ?? r()?.talk_seconds ?? 60)})` : ` · ${t("Herkes konuşur")}`}
            {` · ${voice.members().length}/${st()?.max_members ?? r()?.max_members ?? "?"}`}
          </small>
          <Show when={voice.status() === "connecting" || voice.status() === "reconnecting"}>
            <small class="vr-conn">{voice.status() === "reconnecting" ? t("Bağlantı koptu, yeniden bağlanılıyor…") : t("Bağlanıyor…")}</small>
          </Show>
        </div>
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
                const c = await voiceRoomNewCode(r()!.id).catch((e) => (setErr(errText(e)), null));
                if (c) setCode(c);
              }}
            >
              <I.RefreshCw />
            </button>
          </div>
        </Show>
      </section>

      <Show when={err() || voice.error()}>
        <p class="vr-err">{err() || voice.error()}</p>
      </Show>

      {/* Kontroller */}
      <section class="panel vr-ctrl">
        <div class="vr-ctrl-btns">
          <Show
            when={inputMode() === "open"}
            fallback={
              <span class="vr-ptt" classList={{ on: voice.pttHeld() }}>
                <I.Mic /> {voice.pttHeld() ? t("Konuşuyorsun") : t("Bas-konuş")}
              </span>
            }
          >
            <button class="vr-big" classList={{ off: !voice.micOn() }} onClick={toggleMic} title={t("Mikrofonu aç / kapat")}>
              {voice.micOn() ? <I.Mic /> : <I.MicOff />}
            </button>
          </Show>
          <button class="vr-big" classList={{ off: voice.deafened() }} onClick={toggleDeafen} title={t("Sesi kapat (kimseyi duyma)")}>
            {voice.deafened() ? <I.HeadphoneOff /> : <I.Headphones />}
          </button>
          <div class="vr-meter" title={t("Mikrofon seviyesi")}>
            <i style={{ width: `${Math.round(voice.myLevel() * 100)}%` }} />
          </div>
          <button class="btn ghost small" onClick={() => go("voicerooms", "settings")}>
            <I.Settings /> Ses ayarları
          </button>
          <button class="btn ghost small" classList={{ on: inviting() }} onClick={() => setInviting(!inviting())}>
            <I.MailPlus /> Arkadaş davet et
          </button>
          <button class="btn danger" onClick={() => void leaveRoom()}>
            <I.PhoneOff /> Ayrıl
          </button>
        </div>
        <Show when={inviting()}>
          <InvitePanel room={r()!.id} />
        </Show>
        <Show when={inputMode() === "ptt" && !settings().general.voiceRoom.key && !settings().general.voiceRoom.button}>
          <p class="vr-hint">Bas-konuş için bir tuş ya da direksiyon düğmesi ata (Ses ayarları).</p>
        </Show>
        <Show when={!canSpeak(me()) && moderated()}>
          <p class="muted small">Şu an dinleyicisin. Konuşmak için söz iste.</p>
        </Show>
      </section>

      {/* Söz hakkı (dinleyici) */}
      <Show when={moderated() && !privileged()}>
        <section class="panel vr-floor" classList={{ mine: !!myUntil() }}>
          <Show
            when={myUntil()}
            fallback={
              <Show
                when={requested()}
                fallback={
                  <>
                    <span>Konuşmak istiyorsan söz iste; yönetici sıraya göre söz verir.</span>
                    <button class="btn primary" onClick={() => void act(() => voiceRequestFloor(r()!.id, true))}>
                      <I.Hand /> Söz iste
                    </button>
                  </>
                }
              >
                <span>{t("Sıradasın: {0}. kişi", queuePos() || "?")}</span>
                <button class="btn" onClick={() => void act(() => voiceRequestFloor(r()!.id, false))}>
                  İsteği geri çek
                </button>
              </Show>
            }
          >
            {(until) => (
              <>
                <span class="vr-floor-on">
                  <I.Mic /> {t("Söz sende · {0}", clock(until() - voice.now()))}
                </span>
                <Countdown until={until()} total={(st()?.talk_seconds ?? 60) * 1000} />
                <button class="btn" onClick={() => void act(() => voiceRevoke(r()!.id, me()))}>
                  Sözü bırak
                </button>
              </>
            )}
          </Show>
        </section>
      </Show>

      {/* Moderatör masası */}
      <Show when={moderated() && amMod()}>
        <section class="panel vr-mod">
          <div class="vr-mod-head">
            <h3>Söz yönetimi</h3>
            <div class="vr-mod-tools">
              <label class="vr-inline">
                <span>Süre</span>
                <select
                  value={st()?.talk_seconds ?? 60}
                  onChange={(e) =>
                    void act(() =>
                      voiceRoomUpdate(r()!.id, {
                        talkSeconds: Number(e.currentTarget.value),
                      }),
                    )
                  }
                >
                  <For each={TALK_CHOICES}>{(s) => <option value={s}>{fmtSec(s)}</option>}</For>
                </select>
              </label>
              <label class="vr-inline" title={t("Söz süresi bitince sıradaki kişiye kendiliğinden verilir")}>
                <Switch checked={!!st()?.auto_next} onChange={(v) => void act(() => voiceRoomUpdate(r()!.id, { autoNext: v }))} />
                <span>Otomatik sıra</span>
              </label>
              <button class="btn small primary" disabled={!st()?.requests.length} onClick={() => void act(() => voiceGrantNext(r()!.id))}>
                <I.SkipForward /> Sıradakine ver
              </button>
              <button class="btn small warn" disabled={!speakers().length} onClick={() => void act(() => voiceRevoke(r()!.id, null))}>
                <I.MicOff /> Herkesi sustur
              </button>
            </div>
          </div>

          <Show when={speakers().length}>
            <h4>Konuşanlar</h4>
            <For each={speakers()}>
              {(g) => (
                <div class="vr-q">
                  <b data-no-i18n>{g.name ?? "?"}</b>
                  <Countdown until={Date.parse(g.until)} total={(st()?.talk_seconds ?? 60) * 1000} label />
                  <button class="btn small" onClick={() => void act(() => voiceExtend(r()!.id, g.user_id, 30))}>
                    +30 sn
                  </button>
                  <button class="btn small" onClick={() => void act(() => voiceExtend(r()!.id, g.user_id, 60))}>
                    +1 dk
                  </button>
                  <button class="btn small danger" onClick={() => void act(() => voiceRevoke(r()!.id, g.user_id))}>
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
                  <small class="muted">{waitText(Date.parse(q.at), voice.now())}</small>
                  <Show when={!present(q.user_id)}>
                    <small class="muted">odada değil</small>
                  </Show>
                  <span class="vr-q-sp" />
                  <button class="btn small primary" onClick={() => void act(() => voiceGrant(r()!.id, q.user_id))}>
                    {t("Söz ver ({0})", fmtSec(st()?.talk_seconds ?? 60))}
                  </button>
                  <select
                    class="vr-q-sel"
                    title={t("Farklı süreyle ver")}
                    value=""
                    onChange={(e) => {
                      const s = Number(e.currentTarget.value);
                      e.currentTarget.value = "";
                      if (s) void act(() => voiceGrant(r()!.id, q.user_id, s));
                    }}
                  >
                    <option value="">{t("Süre…")}</option>
                    <For each={TALK_CHOICES}>{(s) => <option value={s}>{fmtSec(s)}</option>}</For>
                  </select>
                  <button class="btn small ghost" title={t("İsteği düşür")} onClick={() => void act(() => voiceDismissRequest(r()!.id, q.user_id))}>
                    <I.X />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </section>
      </Show>

      {/* Odadakiler */}
      <section class="panel">
        <h3>{t("Odadakiler ({0})", voice.members().length)}</h3>
        <div class="vr-members">
          <For each={sorted()}>
            {(m) => (
              <MemberRow
                m={m}
                me={m.user_id === me()}
                open={openUser() === m.user_id}
                onToggle={() => setOpenUser(openUser() === m.user_id ? "" : m.user_id)}
                act={act}
                moderated={moderated()}
              />
            )}
          </For>
        </div>
      </section>

      <Show when={amAdmin()}>
        <RoomSettings />
      </Show>
    </>
  );
}

function waitText(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? t("{0} sn önce", s) : t("{0} dk önce", Math.floor(s / 60));
}

function Countdown(props: { until: number; total: number; label?: boolean }) {
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

function FriendButton(props: { user: string }) {
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

function MemberRow(props: {
  m: VoiceMember;
  me: boolean;
  open: boolean;
  onToggle: () => void;
  act: (f: () => Promise<unknown>) => Promise<void>;
  moderated: boolean;
}) {
  const room = () => voice.room()!;
  const u = () => props.m.user_id;
  const role = (): VoiceRole => (room()?.owner === u() ? "owner" : roleOf(u()));
  const until = () => grantUntil(u());
  const speaks = () => canSpeak(u());
  const muted = () => voice.localMuted().includes(u());
  const talking = () => isTalking(u()) && (props.me ? transmitting() : speaks());
  const av = () => cachedAvatar(u());
  const canManage = () => amMod() && !props.me && !["owner", "admin"].includes(role());
  return (
    <div class="vr-mem" classList={{ open: props.open, talking: talking() }}>
      <button class="vr-mem-row" onClick={props.onToggle}>
        <span class="vr-av" style={{ "--lv": String(levelOf(u())) }}>
          <Show when={av()} fallback={<span>{initialOf(props.m.name)}</span>}>
            <img src={av()} alt="" />
          </Show>
        </span>
        <span class="vr-mem-name" data-no-i18n>
          {props.m.name}
          {props.me ? " (" + t("Sen") + ")" : ""}
        </span>
        <Show when={role() !== "member"}>
          <span class={`vr-role r-${role()}`}>
            {role() === "owner" ? <I.Crown /> : null}
            {t(ROLE_LABEL[role()])}
          </span>
        </Show>
        <Show when={props.moderated && until()}>
          <span class="vr-role r-grant">
            <I.Mic /> {clock(until()! - voice.now())}
          </span>
        </Show>
        <span class="vr-mem-sp" />
        <Show when={props.moderated && !speaks()}>
          <span class="vr-mem-ic muted" title={t("Söz hakkı yok")}>
            <I.MicOff />
          </span>
        </Show>
        <Show when={props.m.deaf}>
          <span class="vr-mem-ic muted" title={t("Sesi kapalı")}>
            <I.HeadphoneOff />
          </span>
        </Show>
        <Show when={muted()}>
          <span class="vr-mem-ic warn" title={t("Senin için susturuldu")}>
            <I.VolumeX />
          </span>
        </Show>
      </button>
      <Show when={props.open}>
        <div class="vr-mem-act">
          <Show when={!props.me}>
            <FriendButton user={u()} />
            <div class="vr-vol">
              <span>Ses</span>
              <Slider value={userVolumes()[u()] ?? 100} min={0} max={200} step={5} unit="%" onInput={(v) => setUserVolume(u(), v)} />
              <button class="btn small" onClick={() => toggleLocalMute(u())}>
                {muted() ? <I.Volume2 /> : <I.VolumeX />} {muted() ? t("Sesini aç") : t("Benim için sustur")}
              </button>
            </div>
          </Show>
          <Show when={props.moderated && amMod() && !props.me && !["owner", "admin", "mod", "speaker"].includes(role())}>
            <div class="vr-mem-mod">
              <Show
                when={until()}
                fallback={
                  <button class="btn small primary" onClick={() => void props.act(() => voiceGrant(room().id, u()))}>
                    <I.Mic /> Söz ver
                  </button>
                }
              >
                <button class="btn small" onClick={() => void props.act(() => voiceExtend(room().id, u(), 30))}>
                  <I.TimerReset /> +30 sn
                </button>
                <button class="btn small danger" onClick={() => void props.act(() => voiceRevoke(room().id, u()))}>
                  <I.MicOff /> Sözü al
                </button>
              </Show>
            </div>
          </Show>
          <Show when={amAdmin() && !props.me && role() !== "owner"}>
            <div class="vr-mem-mod">
              <small class="muted">Yetki:</small>
              <For each={["member", "speaker", "mod", "admin"] as VoiceRole[]}>
                {(x) => (
                  <button
                    class="btn small"
                    classList={{ on: role() === x }}
                    disabled={role() === x}
                    onClick={() => void props.act(() => voiceSetRole(room().id, u(), x === "member" ? null : (x as "admin" | "mod" | "speaker")))}
                  >
                    {t(ROLE_LABEL[x])}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={realAdmin() && !props.me && role() !== "owner"}>
            <div class="vr-mem-mod">
              <Show
                when={isGlobalMod(u())}
                fallback={
                  <button class="btn small" onClick={() => void props.act(() => voiceModSet(u(), true).then(loadGlobalMods))}>
                    <I.ShieldCheck /> Ses Odası Moderatörü yap
                  </button>
                }
              >
                <small class="muted">{t("Ses Odası Moderatörü (bütün odalarda)")}</small>
                <button class="btn small" onClick={() => void props.act(() => voiceModSet(u(), false).then(loadGlobalMods))}>
                  Moderatörlüğü kaldır
                </button>
              </Show>
            </div>
          </Show>
          <Show when={canManage()}>
            <div class="vr-mem-mod">
              <button
                class="btn small"
                onClick={() =>
                  void props.act(async () => {
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
                  void props.act(async () => {
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
                  if (!(await askConfirm(t("{0} bu odaya bir daha giremesin mi?", props.m.name), { danger: true, ok: t("Kalıcı yasakla") }))) return;
                  await props.act(async () => {
                    await voiceKick(room().id, u(), null);
                    announceKick(u());
                  });
                }}
              >
                <I.Ban /> Kalıcı yasakla
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function RoomSettings() {
  const r = () => voice.room()!;
  const st = () => voice.state();
  const [open, setOpen] = createSignal(false);
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
    <section class="panel">
      <button class="vr-fold" onClick={() => setOpen(!open())}>
        {open() ? <I.ChevronDown /> : <I.ChevronRight />} Oda ayarları
      </button>
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

// ---------------------------------------------------------------------------
// Yönetici: kategoriler ve Ses Odası Moderatörleri
// ---------------------------------------------------------------------------

function CategoryManager() {
  const [name, setName] = createSignal("");
  const [err, setErr] = createSignal("");
  const run = async (f: () => Promise<unknown>) => {
    setErr("");
    try {
      await f();
      await refreshRooms();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const move = (i: number, d: number) =>
    run(async () => {
      const list = [...categories()];
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((c, k) => (c.sort !== k ? voiceCategorySave(c.id, c.name, k) : null)));
    });
  return (
    <div class="vr-cats">
      <div class="row">
        <div>
          <span>Kategoriler</span>
          <small>
            Odaları sol menüde ve oda listesinde başlıklar altında toplar. Odayı kurarken ya da oda ayarlarından kategorisini seç. PRO üyelerin odaları her
            zaman “Özel odalar” altında görünür.
          </small>
        </div>
      </div>
      <For each={categories()}>
        {(c, i) => (
          <div class="vr-cat">
            <input
              class="input"
              maxLength={40}
              value={c.name}
              onChange={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== c.name) void run(() => voiceCategorySave(c.id, v));
              }}
            />
            <button class="btn ghost small" disabled={i() === 0} title={t("Yukarı")} onClick={() => void move(i(), -1)}>
              <I.ArrowUp />
            </button>
            <button class="btn ghost small" disabled={i() === categories().length - 1} title={t("Aşağı")} onClick={() => void move(i(), 1)}>
              <I.ArrowDown />
            </button>
            <button
              class="btn ghost small"
              title={t("Kategoriyi sil")}
              onClick={async () => {
                if (
                  !(await askConfirm(t("“{0}” kategorisi silinsin mi?", c.name), {
                    danger: true,
                    ok: t("Sil"),
                    note: t("İçindeki odalar silinmez, “Topluluk odaları” altına geçer."),
                  }))
                )
                  return;
                void run(() => voiceCategoryDelete(c.id));
              }}
            >
              <I.Trash />
            </button>
          </div>
        )}
      </For>
      <form
        class="vr-cat"
        onSubmit={(e) => {
          e.preventDefault();
          const v = name().trim();
          if (!v) return;
          void run(async () => {
            await voiceCategorySave(null, v);
            setName("");
          });
        }}
      >
        <input class="input" maxLength={40} placeholder={t("Yeni kategori adı")} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        <button class="btn small" disabled={!name().trim()}>
          <I.FolderPlus /> Kategori ekle
        </button>
      </form>
      <Show when={err()}>
        <p class="vr-err">{err()}</p>
      </Show>
    </div>
  );
}

// Ses Odası Moderatörleri: bütün odalarda söz verir / alır, sırayı yönetir, odadan çıkarır
const [globalMods, setGlobalMods] = createSignal<VoiceMod[]>([]);
async function loadGlobalMods() {
  if (!realAdmin()) return;
  setGlobalMods(await voiceMods().catch(() => globalMods()));
}
const isGlobalMod = (u: string) => globalMods().some((m) => m.user_id === u);

function VoiceModsPanel() {
  const [q, setQ] = createSignal("");
  const [found, setFound] = createSignal<Person[]>([]);
  const [err, setErr] = createSignal("");
  void loadGlobalMods();
  let tmr = 0;
  const search = (v: string) => {
    setQ(v);
    clearTimeout(tmr);
    if (v.trim().length < 2) return setFound([]);
    tmr = window.setTimeout(
      () =>
        void findPeople(v.trim())
          .then((r) => setFound(r ?? []))
          .catch(() => setFound([])),
      300,
    );
  };
  const set = async (id: string, on: boolean) => {
    setErr("");
    try {
      await voiceModSet(id, on);
      await loadGlobalMods();
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <div class="vr-cats">
      <div class="row">
        <div>
          <span>Ses Odası Moderatörleri</span>
          <small>Bütün odalarda söz isteyenlere söz verir, süre uzatır, sözü alır, sırayı yönetir ve odadan çıkarabilir. Odalarda her zaman konuşabilir.</small>
        </div>
      </div>
      <For each={globalMods()} fallback={<small class="muted">Henüz moderatör yok.</small>}>
        {(m) => (
          <div class="vr-cat">
            <span class="vr-cat-name" data-no-i18n>
              <I.ShieldCheck /> {m.name ?? "?"}
            </span>
            <button class="btn ghost small" onClick={() => void set(m.user_id, false)}>
              Kaldır
            </button>
          </div>
        )}
      </For>
      <div class="vr-cat">
        <input class="input" placeholder={t("Kullanıcı ara (ad ya da iRacing adı)")} value={q()} onInput={(e) => search(e.currentTarget.value)} />
      </div>
      <For each={found().filter((p) => !isGlobalMod(p.id))}>
        {(p) => (
          <div class="vr-cat">
            <span class="vr-cat-name" data-no-i18n>
              {p.display_name}
              {p.iracing_name ? ` · ${p.iracing_name}` : ""}
            </span>
            <button class="btn small primary" onClick={() => void set(p.id, true)}>
              <I.ShieldCheck /> Moderatör yap
            </button>
          </div>
        )}
      </For>
      <Show when={err()}>
        <p class="vr-err">{err()}</p>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arkadaş davet et (mesaj olarak gider; arkadaş mesajdaki "Katıl" ile girer)
// ---------------------------------------------------------------------------

function InvitePanel(props: { room: string }) {
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
