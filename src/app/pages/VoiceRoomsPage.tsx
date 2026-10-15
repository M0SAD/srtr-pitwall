// Ses Odaları (sol menüde ayrı bölüm): Discord benzeri sade sesli odalar (herkese açık / davet kodlu özel / takım).
// Kalabalık odalarda "söz hakkıyla" mod: yöneticiler süreli söz verir, uzatır, geri alır; diğerleri söz ister.
// Motor: src/voice/engine.ts (Cloudflare Realtime SFU), veri: src/cloud/voiceRooms.ts (c116).

import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { initialOf } from "@/cloud/social";
import { cachedAvatar, loadAvatars } from "@/cloud/profile";
import { myTeams, type MyTeam } from "@/cloud/teams";
import { settings } from "@/sdk/settings";
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
  voiceRooms,
  voiceSetRole,
  type VoiceKind,
  type VoiceMode,
  type VoiceRole,
  type VoiceRoomRow,
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

function Lobby() {
  const [list, { refetch }] = createResource(() => voiceRooms().catch((e) => (setErr(errText(e)), [] as VoiceRoomRow[])));
  const [err, setErr] = createSignal("");
  const [code, setCode] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  const iv = window.setInterval(() => void refetch(), 15000);
  onCleanup(() => clearInterval(iv));

  const mine = () => (list() ?? []).filter((r) => r.is_mine);
  const team = () => (list() ?? []).filter((r) => !r.is_mine && r.kind === "team");
  const others = () => (list() ?? []).filter((r) => !r.is_mine && r.kind !== "team");

  const enter = async (id: string | null, c: string | null) => {
    setBusy(id ?? "code");
    setErr("");
    await joinRoom(id, c);
    setBusy("");
  };

  return (
    <>
      <Show when={voice.status() === "error" && voice.error()}>
        <p class="vr-err">{voice.error()}</p>
      </Show>
      <section class="panel vr-intro">
        <div class="vr-intro-txt">
          <h3>Ses Odaları</h3>
          <p class="muted small">
            Takımınla ya da turnuvada sesli konuş. Konuşmalar kaydedilmez. Kalabalık odalarda “söz hakkıyla” modunu seç: yöneticiler süreli söz verir, diğerleri
            sıraya girer.
          </p>
        </div>
        <div class="vr-intro-act">
          <button class="btn primary" onClick={() => setCreating(!creating())}>
            <I.Plus /> Oda kur
          </button>
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
      <RoomGroup title="Odalarım" rows={mine()} busy={busy()} onJoin={(id) => void enter(id, null)} onChanged={() => void refetch()} />
      <RoomGroup title="Takım odaları" rows={team()} busy={busy()} onJoin={(id) => void enter(id, null)} onChanged={() => void refetch()} />
      <RoomGroup
        title="Herkese açık odalar"
        rows={others()}
        busy={busy()}
        onJoin={(id) => void enter(id, null)}
        onChanged={() => void refetch()}
        empty="Şu an açık oda yok. İlk odayı sen kur."
      />
    </>
  );
}

function RoomGroup(props: { title: string; rows: VoiceRoomRow[]; busy: string; onJoin: (id: string) => void; onChanged: () => void; empty?: string }) {
  return (
    <Show when={props.rows.length || props.empty}>
      <section class="panel">
        <h3>{props.title}</h3>
        <Show when={props.rows.length} fallback={<p class="muted small">{props.empty}</p>}>
          <div class="vr-rooms">
            <For each={props.rows}>
              {(r) => (
                <div class="vr-room">
                  <div class="vr-room-ic" classList={{ live: r.members > 0 }}>
                    {r.kind === "private" ? <I.Lock /> : r.kind === "team" ? <I.Users /> : <I.Globe />}
                  </div>
                  <div class="vr-room-main">
                    <b data-no-i18n>{r.name}</b>
                    <small class="muted">
                      {t(KIND_LABEL[r.kind])}
                      {r.team_name ? ` · ${r.team_name}` : ""}
                      {r.mode === "moderated" ? ` · ${t("Söz hakkıyla")} (${fmtSec(r.talk_seconds)})` : ""}
                      {r.owner_name && !r.is_mine ? ` · ${r.owner_name}` : ""}
                    </small>
                    <Show when={r.description}>
                      <small class="vr-desc" data-no-i18n>
                        {r.description}
                      </small>
                    </Show>
                  </div>
                  <span class="vr-count" classList={{ live: r.members > 0 }} title={t("Odada / en çok")}>
                    <I.Headphones /> {r.members}/{r.max_members}
                  </span>
                  <button class="btn primary small" disabled={!!props.busy} onClick={() => props.onJoin(r.id)}>
                    {props.busy === r.id ? t("Bağlanıyor…") : t("Gir")}
                  </button>
                  <Show when={r.is_mine}>
                    <button
                      class="btn ghost small"
                      title={t("Odayı sil")}
                      onClick={async () => {
                        if (!(await askConfirm(t("“{0}” odası silinsin mi?", r.name), { danger: true, ok: t("Sil") }))) return;
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
          <h3 data-no-i18n>{r()?.name ?? "…"}</h3>
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
          <button class="btn danger" onClick={() => void leaveRoom()}>
            <I.PhoneOff /> Ayrıl
          </button>
        </div>
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
        <Show when={err()}>
          <p class="vr-err">{err()}</p>
        </Show>
        <Show when={r().owner === session()?.user.id}>
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
