// Ses Odaları (sol menüde ayrı bölüm): Discord benzeri sesli odalar (herkese açık / davet kodlu özel / takım).
// Kalabalık odalarda "söz hakkıyla" mod: yöneticiler süreli söz verir, uzatır, geri alır; diğerleri söz ister.
// Odadayken: VoiceRoomStage (kişi kutuları, alt denetim çubuğu, sağda sohbet). "Tüm odalar": bu dosyadaki Lobby.
// Motor: src/voice/engine.ts (Cloudflare Realtime SFU), veri: src/cloud/voiceRooms.ts (c116…c121).

import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { findPeople, initialOf, type Person } from "@/cloud/social";
import { cachedAvatar } from "@/cloud/profile";
import { myTeams, type MyTeam } from "@/cloud/teams";
import { config, isPro, realAdmin, saveConfig } from "@/cloud/account";
import {
  voiceRoomCreate,
  voiceRoomDelete,
  voiceCategorySave,
  voiceCategoryDelete,
  voiceModSet,
  type VoiceKind,
  type VoiceMode,
  type VoiceRoomRow,
} from "@/cloud/voiceRooms";
import { joinRoom, leaveRoom, voice } from "@/voice/engine";
import { askConfirm } from "../confirm";
import { categories, createOpen, peopleIn, refreshRooms, roomSections, roomsErr, setCreateOpen, watchRooms } from "@/voice/roomsStore";
import { RoomIcon, RoomIconPicker } from "../components/RoomIcon";
import { Stepper, Switch } from "../components/SettingsForm";
import * as I from "../icons";
import { go } from "../ui";
import { VoiceRoomSettings } from "./VoiceRoomSettings";
import { VoiceRoomStage } from "./VoiceRoomStage";
import { KIND_LABEL, TALK_CHOICES, errText, fmtSec, globalMods, isGlobalMod, loadGlobalMods } from "./voiceRoomParts";
import { themeClass, tileStyle } from "@/voice/roomTheme";
import "../voicerooms.css";

export function VoiceRoomsPage(props: { sub?: string }) {
  const inRoom = () => !!voice.room() || voice.status() === "connecting" || voice.status() === "reconnecting";
  const stage = () => props.sub !== "settings" && props.sub !== "all" && inRoom();
  return (
    <div class={`page vr-page ${themeClass()} vr-tiles-${tileStyle()}`} classList={{ "vr-page-stage": stage() }}>
      <Show when={props.sub === "settings"}>
        <VoiceRoomSettings />
      </Show>
      <Show when={props.sub !== "settings"}>
        <Show when={cloudEnabled} fallback={<p class="muted">Bulut bağlantısı yapılandırılmamış.</p>}>
          <Show when={session()} fallback={<p class="muted">Ses odalarını kullanmak için giriş yapmalısın (Hesap).</p>}>
            <Show when={stage()} fallback={<Lobby />}>
              <VoiceRoomStage />
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tüm odalar
// ---------------------------------------------------------------------------

/** Oda kurma izni (c117, Yönetim: app_config.voice_create); sunucu ayrıca denetler */
function useCanCreate() {
  const createWho = () => config()?.voice_create ?? "pro";
  const [teamsAdm] = createResource(() => (createWho() === "team" && !realAdmin() ? myTeams().catch(() => [] as MyTeam[]) : Promise.resolve([] as MyTeam[])));
  return () =>
    realAdmin() ||
    createWho() === "all" ||
    ((createWho() === "pro" || createWho() === "team") && isPro()) ||
    (createWho() === "team" && (teamsAdm() ?? []).some((x) => x.role === "owner" || x.role === "admin"));
}

function Lobby() {
  const [err, setErr] = createSignal("");
  const refetch = () => refreshRooms();
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [adminOpen, setAdminOpen] = createSignal(false);
  onCleanup(watchRooms());
  const canCreate = useCanCreate();
  const createWho = () => config()?.voice_create ?? "pro";

  const enter = async (id: string | null, c: string | null) => {
    setBusy(id ?? "code");
    setErr("");
    await joinRoom(id, c);
    setBusy("");
    if (voice.room()) go("voicerooms", "rooms");
  };
  const total = () => roomSections().reduce((n, s) => n + s.rooms.reduce((k, r) => k + r.members, 0), 0);

  return (
    <div class="vrl">
      <Show when={voice.status() === "error" && voice.error()}>
        <p class="vr-err">{voice.error()}</p>
      </Show>
      <section class="vrl-hero">
        <div class="vrl-hero-ic">
          <I.AudioLines />
        </div>
        <div class="vrl-hero-txt">
          <h2>Ses Odaları</h2>
          <p class="muted small">
            Takımınla ya da turnuvada sesli konuş, odanın sohbetine yaz. Konuşmalar kaydedilmez. Kalabalık odalarda “söz hakkıyla” modunu seç: yöneticiler
            süreli söz verir, diğerleri sıraya girer.
          </p>
          <Show when={total() > 0}>
            <span class="vrl-live">
              <i /> {t("Şu an ses odalarında {0} kişi var", String(total()))}
            </span>
          </Show>
        </div>
        <div class="vrl-hero-act">
          <Show when={canCreate()}>
            <button class="btn primary" onClick={() => setCreateOpen(createOpen() ? null : { cat: "" })}>
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
          <button class="vr-fold" onClick={() => setAdminOpen(!adminOpen())}>
            {adminOpen() ? <I.ChevronDown /> : <I.ChevronRight />} <I.ShieldCheck /> Yönetim: oda kurma izni, kategoriler, moderatörler
          </button>
          <Show when={adminOpen()}>
            <div class="row">
              <div>
                <span>Kimler oda kurabilir</span>
                <small>
                  Odalara herkes girebilir; bu ayar sadece yeni oda kurmayı sınırlar. Yöneticiler her zaman kurar ve odaları kalıcıdır; diğerlerinin odası
                  içinde kimse kalmadıktan 1 saat sonra silinir. Yalnızca yöneticiler görür.
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
          </Show>
        </section>
      </Show>
      <Show when={err()}>
        <p class="vr-err">{err()}</p>
      </Show>
      <Show when={createOpen()}>
        {(o) => (
          <CreateRoom
            cat={o().cat}
            onDone={(id) => {
              setCreateOpen(null);
              void refetch();
              if (id) void enter(id, null);
            }}
          />
        )}
      </Show>
      <Show when={roomsErr()}>
        <p class="vr-err">{roomsErr()}</p>
      </Show>
      <div class="vrl-groups">
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
              empty={
                sec.id === "_private" ? (canCreate() && !realAdmin() ? "Şu an özel oda yok. İlk odayı sen kur." : "Şu an özel oda yok.") : "Henüz oda yok."
              }
            />
          )}
        </For>
      </div>
    </div>
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
      <section class="vrl-group" classList={{ wide: props.rows.length > 3 }}>
        <h4 class="vrl-group-title">
          {props.raw ? <span data-no-i18n>{props.title}</span> : t(props.title)}
          <Show when={props.rows.length}>
            <em data-no-i18n>{props.rows.length}</em>
          </Show>
        </h4>
        <Show when={props.note}>
          <p class="muted small vr-group-note">{props.note}</p>
        </Show>
        <Show when={props.rows.length} fallback={<p class="muted small">{props.empty}</p>}>
          <div class="vrl-grid">
            <For each={props.rows}>{(r) => <RoomCard r={r} busy={props.busy} onJoin={props.onJoin} onChanged={props.onChanged} />}</For>
          </div>
        </Show>
      </section>
    </Show>
  );
}

function RoomCard(props: { r: VoiceRoomRow; busy: string; onJoin: (id: string) => void; onChanged: () => void }) {
  const r = () => props.r;
  const here = () => voice.room()?.id === r().id;
  const ppl = () => peopleIn(r().id);
  return (
    <div class="vrl-card" classList={{ here: here(), live: r().members > 0, locked: r().can_enter === false }}>
      <div class="vrl-card-top">
        <div class="vrl-card-ic" classList={{ live: r().members > 0 }}>
          <RoomIcon icon={r().icon} kind={r().kind} />
        </div>
        <div class="vrl-card-main">
          <b class="vr-room-name">
            <span data-no-i18n>{r().name}</span>
            <Show when={r().pro_only}>
              <span class="vr-pro" title={t("Sadece PRO üyeler girebilir")}>
                PRO
              </span>
            </Show>
            <Show when={r().mode === "moderated"}>
              <span class="vr-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
                <I.Hand />
              </span>
            </Show>
          </b>
          <small class="muted">
            {t(KIND_LABEL[r().kind])}
            {r().team_name ? ` · ${r().team_name}` : ""}
            {r().mode === "moderated" ? ` · ${t("Söz hakkıyla")} (${fmtSec(r().talk_seconds)})` : ""}
            {r().owner_name && !r().is_mine ? ` · ${r().owner_name}` : ""}
          </small>
        </div>
        <Show when={r().is_mine || realAdmin()}>
          <button
            class="btn ghost small vrl-del"
            title={r().is_mine ? t("Odayı sil") : t("Odayı sil (yönetici)")}
            onClick={async () => {
              const note = !r().is_mine ? t("Odadaki herkes çıkarılır. Oda sahibi: {0}", r().owner_name ?? "?") : undefined;
              if (!(await askConfirm(t("“{0}” odası silinsin mi?", r().name), { danger: true, ok: t("Sil"), note }))) return;
              if (here()) await leaveRoom();
              await voiceRoomDelete(r().id).catch(() => {});
              props.onChanged();
            }}
          >
            <I.Trash />
          </button>
        </Show>
      </div>
      <Show when={r().description}>
        <small class="vr-desc" data-no-i18n>
          {r().description}
        </small>
      </Show>
      <Show when={r().is_mine && r().auto_delete}>
        <small class="muted">{t("Boş kalınca 1 saat sonra silinir")}</small>
      </Show>
      <div class="vrl-card-foot">
        <div class="vrl-faces">
          <For each={ppl().slice(0, 5)}>
            {(p) => (
              <span class="vrl-face" title={p.name ?? ""}>
                <Show when={cachedAvatar(p.user_id)} fallback={<span>{initialOf(p.name ?? "?")}</span>}>
                  <img src={cachedAvatar(p.user_id)} alt="" />
                </Show>
              </span>
            )}
          </For>
          <Show when={ppl().length > 5}>
            <span class="vrl-face more" data-no-i18n>
              +{ppl().length - 5}
            </span>
          </Show>
          <span class="vr-count" classList={{ live: r().members > 0 }} title={t("Odada / en çok")}>
            <I.Headphones /> {r().members}/{r().max_members}
          </span>
        </div>
        <Show
          when={!here()}
          fallback={
            <button class="btn small vr-here" onClick={() => go("voicerooms", "rooms")}>
              <I.AudioLines /> {t("Buradasın")}
            </button>
          }
        >
          <button
            class="btn primary small"
            disabled={!!props.busy || r().can_enter === false}
            title={r().can_enter === false ? (r().pro_only ? t("Bu oda PRO üyelere özel") : t("Bu odaya giremezsin")) : ""}
            onClick={() => props.onJoin(r().id)}
          >
            {props.busy === r().id ? t("Bağlanıyor…") : t("Gir")}
          </button>
        </Show>
      </div>
    </div>
  );
}

function CreateRoom(props: { cat?: string; onDone: (id: string | null) => void }) {
  const [name, setName] = createSignal("");
  const [desc, setDesc] = createSignal("");
  const [kind, setKind] = createSignal<VoiceKind>("public");
  const [team, setTeam] = createSignal("");
  const [mode, setMode] = createSignal<VoiceMode>("open");
  const [talk, setTalk] = createSignal(60);
  const [max, setMax] = createSignal(20);
  const [icon, setIcon] = createSignal("");
  const [proOnly, setProOnly] = createSignal(false);
  const [cat, setCat] = createSignal(props.cat ?? "");
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
  // Sıra: kategoriler + "Topluluk odaları" + "Özel odalar" birlikte (app_config.voice_order; herkes aynı sırayla görür)
  const order = () => roomSections().map((x) => ({ id: x.id, title: x.title, fixed: x.fixed }));
  const move = (i: number, d: number) =>
    run(async () => {
      const list = order().map((x) => x.id);
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await saveConfig({ voice_order: list });
    });
  return (
    <div class="vr-cats">
      <div class="row">
        <div>
          <span>Kategoriler</span>
          <small>
            Odaları sol menüde ve oda listesinde başlıklar altında toplar. Odayı kurarken ya da oda ayarlarından kategorisini seç. PRO üyelerin odaları her
            zaman “Özel odalar” altında görünür. Okla sırayı değiştir; “Topluluk odaları” ve “Özel odalar” da taşınabilir. Herkes bu sırayla görür.
          </small>
        </div>
      </div>
      <For each={order()}>
        {(c, i) => (
          <div class="vr-cat">
            <Show
              when={!c.fixed}
              fallback={
                <span class="vr-cat-fixed">
                  <I.Lock /> {t(c.title)}
                </span>
              }
            >
              <input
                class="input"
                maxLength={40}
                value={c.title}
                onChange={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v && v !== c.title) void run(() => voiceCategorySave(c.id, v));
                }}
              />
            </Show>
            <button class="btn ghost small" disabled={i() === 0} title={t("Yukarı")} onClick={() => void move(i(), -1)}>
              <I.ArrowUp />
            </button>
            <button class="btn ghost small" disabled={i() === order().length - 1} title={t("Aşağı")} onClick={() => void move(i(), 1)}>
              <I.ArrowDown />
            </button>
            <Show when={!c.fixed} fallback={<span class="vr-cat-gap" />}>
              <button
                class="btn ghost small"
                title={t("Kategoriyi sil")}
                onClick={async () => {
                  if (
                    !(await askConfirm(t("“{0}” kategorisi silinsin mi?", c.title), {
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
            </Show>
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
            const id = await voiceCategorySave(null, v);
            // Sıra önceden ayarlandıysa yeni kategori "Topluluk odaları"nın üstüne girer
            const cur = config()?.voice_order ?? [];
            if (cur.length && id) {
              const ids = cur.filter((x) => x !== id);
              const k = ids.indexOf("_community");
              ids.splice(k < 0 ? ids.length : k, 0, String(id));
              await saveConfig({ voice_order: ids });
            }
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
