// Telemetri: kaydedilen turlarım (genel bakış, oturumlar, kişisel en iyiler), oturum ayrıntısı,
// tur analizi (iki turun hız/gaz/fren/vites/direksiyon izleri ve fark) ve Yarışçılar dizini.
// Kayıt ve yükleme: src-tauri/src/laprec.rs + src/cloud/telemetry.ts

import { localeTag, t } from "@/sdk/i18n";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "@/sdk/platform";
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { friendRequest } from "@/cloud/social";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockBox, ProLockNote, ProLockTag } from "../components/ProLock";
import { settings, updateSettings } from "@/sdk/settings";
import { lapTime } from "@/sdk/format";
import {
  SESSION_LABEL,
  SIM_LABEL,
  SIM_TABS,
  comboLaps,
  deleteSession,
  deltaSeries,
  flushTelemetry,
  lapsInfo,
  leaderboard,
  loadTelemetryPublic,
  loadTrace,
  queueCount,
  refreshQueueCount,
  setTelemetryPublic,
  telemetryDrivers,
  telemetryOverview,
  telemetryPublic,
  telemetrySession,
  telemetrySessions,
  isAiSession,
  trackLabel,
  uploadError,
  type BestLap,
  type DriverRow,
  type LapInfo,
  type SimId,
  type Trace,
  type TelemetrySession,
} from "@/cloud/telemetry";
import { go } from "../ui";
import { setTeamFocus } from "@/cloud/teams";
import { ProfileCard } from "../components/Profile";
import * as I from "../icons";
import "../telemetry.css";

/** İki turun renkleri (koyu zeminde renk körlüğü denetiminden geçti) */
const COLORS = ["#e0701a", "#3a84e0"];

type View =
  | { kind: "home" }
  | { kind: "user"; id: string }
  | { kind: "session"; id: string }
  | { kind: "analysis"; laps: string[] }
  | { kind: "board"; sim: string; track_id: string; track_config: string; car_id: string; title: string };

const [stack, setStack] = createSignal<View[]>([]);
const view = (): View => stack()[stack().length - 1] ?? { kind: "home" };
const push = (v: View) => setStack([...stack(), v]);
const back = () => setStack(stack().slice(0, -1));
const replaceTop = (v: View) => setStack([...stack().slice(0, -1), v]);

/** Başka sayfadan (Yarışçılar) bir üyenin telemetrisini aç */
export function openDriverTelemetry(id: string) {
  go("telemetry", "overview");
  setStack([{ kind: "user", id }]);
}

// Ayrı arkadaş penceresinden "Profil" (panel-go { tele }): panel penceresi bu üyenin telemetri profilini açar
if (inTauri && !/(window|overlay|dash)\.html$/.test(location.pathname)) {
  void listen<{ tele?: string }>("panel-go", (e) => {
    if (e.payload?.tele) openDriverTelemetry(e.payload.tele);
  }).catch(() => {});
}

/** Başka sayfadan (Takımlar → Son aktiviteler) bir oturumu aç */
export function openTelemetrySession(id: string) {
  go("telemetry", "overview");
  setStack([{ kind: "session", id }]);
}

const fmtDate = (v: string | null | undefined, time = true) =>
  v ? new Date(v).toLocaleString(localeTag(), time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "—";

const fmtHours = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
};

const errText = (e: unknown) => String((e as Error)?.message ?? e);

export function TelemetryPage(p: { sub: string }) {
  return (
    <div class="page narrow tele">
      <Switch>
        <Match when={!cloudEnabled}>
          <section class="panel">
            <p class="muted">Bu derleme bir bulut sunucusuna bağlı değil; telemetri sadece hesapla kullanılabilir.</p>
          </section>
        </Match>
        <Match when={!session()}>
          <section class="panel empty-state">
            <I.Activity />
            <h3>Telemetri için giriş yap</h3>
            <p>
              SRTR Pitwall bir simde sürdüğün her turu kaydeder: süre, geçerlilik, olaylar, sektörler ve hız/gaz/fren izi. Giriş
              yapınca turların hesabına yüklenir; buradan oturumlarına, kişisel en iyilerine bakabilir ve turlarını başkalarıyla
              karşılaştırabilirsin.
            </p>
            <button class="btn primary" onClick={() => go("account")}>
              Giriş yap
            </button>
          </section>
        </Match>
        <Match when={p.sub === "racers"}>
          <ProLockBox feature={F.teleOthers} text="Başkalarının telemetrisini görmek PRO üyelere özel. Kendi turlarına Telemetrim'den bakabilirsin.">
            <RacersView />
          </ProLockBox>
        </Match>
        <Match when={true}>
          <Show when={stack().length}>
            <button class="btn ghost small tele-back" onClick={back}>
              <I.ChevronLeft /> Geri
            </button>
          </Show>
          <Switch>
            <Match when={view().kind === "home"}>
              <OverviewView />
            </Match>
            <Match when={view().kind === "user" && (view() as { id: string }).id}>
              {(id) => (
                <Show when={id() !== session()?.user.id && proLocked(F.teleOthers)} fallback={<OverviewView user={id()} />}>
                  {/* Profil herkese açık; kilitli olan yalnızca telemetri bölümü */}
                  <section class="panel">
                    <ProfileCard id={id()} onTeam={(tid) => (setTeamFocus(tid), go("drivers", "teams"))} />
                  </section>
                  <ProLockBox feature={F.teleOthers} text="Başkalarının telemetrisini görmek PRO üyelere özel.">
                    <section class="panel">
                      <h3>Telemetri</h3>
                    </section>
                  </ProLockBox>
                </Show>
              )}
            </Match>
            <Match when={view().kind === "session" && (view() as { id: string }).id}>
              {(id) => <SessionView id={id()} />}
            </Match>
            <Match when={view().kind === "analysis" && (view() as { laps: string[] })}>
              {(v) => (
                <Show when={v().laps.length > 1} fallback={<AnalysisView laps={v().laps} />}>
                  <ProLockBox feature={F.teleCompare} text="Turları karşılaştırmak PRO üyelere özel. Tek bir turun izlerine bakabilirsin.">
                    <AnalysisView laps={v().laps} />
                  </ProLockBox>
                </Show>
              )}
            </Match>
            <Match when={view().kind === "board" && (view() as Extract<View, { kind: "board" }>)}>
              {(v) => (
                <ProLockBox feature={F.teleBoard} text="Pist / araç sıralaması PRO üyelere özel.">
                  <BoardView v={v()} />
                </ProLockBox>
              )}
            </Match>
          </Switch>
        </Match>
      </Switch>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ayarlar (bu sayfada ve Hesap sayfasında)
// ---------------------------------------------------------------------------

/** "Telemetri verilerimi başkaları görebilsin" anahtarı */
export function TelemetryPrivacyRow() {
  const [err, setErr] = createSignal("");
  onMount(() => {
    if (telemetryPublic() === null) void loadTelemetryPublic();
  });
  return (
    <>
      <div class="row">
        <div>
          <b>Telemetri verilerimi başkaları görebilsin</b>
          <small>
            Açıkken tur kayıtların, kişisel en iyilerin ve tur izlerin diğer üyelere ve sitedeki Yarışçılar sayfasına açık olur;
            lider tablolarında görünürsün. Kapalıyken sadece sen ve takım arkadaşların görebilir. Yarışçılar listesinde sim adın
            yine görünür (arkadaş eklenebilmen için).
          </small>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={telemetryPublic() ?? true}
            disabled={telemetryPublic() === null}
            onChange={(e) => {
              setErr("");
              setTelemetryPublic(e.currentTarget.checked).catch((x) => setErr(errText(x)));
            }}
          />
          <i />
        </label>
      </div>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
    </>
  );
}

/** Hesap sayfası için küçük bölüm */
export function TelemetryPrivacyPanel() {
  return (
    <section class="panel">
      <h3>Telemetri</h3>
      <TelemetryPrivacyRow />
    </section>
  );
}

function SettingsPanel() {
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal("");
  onMount(() => void refreshQueueCount());
  const flush = async () => {
    setBusy(true);
    setMsg("");
    try {
      const n = await flushTelemetry();
      setMsg(n ? t("{0} tur yüklendi", n) : uploadError() || "Yüklenecek tur yok");
    } finally {
      setBusy(false);
      void refreshQueueCount();
    }
  };
  return (
    <section class="panel">
      <h3>Kayıt ve paylaşım</h3>
      <ProLockNote feature={F.teleRecord} text="Turları buluta yüklemek PRO üyelere özel. Turlar bu bilgisayarda bekler; PRO olunca yüklenir." />
      <div class="row">
        <div>
          <b>Turlarımı kaydet</b>
          <small>
            Bir simde (iRacing, ACC, AC, LMU/rF2, AMS2) sürerken tamamlanan her tur kaydedilir ve hesabına yüklenir. Demo ve önizleme
            verisi kaydedilmez. Tur izi (hız, gaz, fren, vites) her oturumun en iyi turu için saklanır.
          </small>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={settings().general.telemetryRecord}
            onChange={(e) => {
              const v = e.currentTarget.checked;
              updateSettings((d) => (d.general.telemetryRecord = v));
            }}
          />
          <i />
        </label>
      </div>
      <TelemetryPrivacyRow />
      <div class="row">
        <div>
          <b>Yükleme kuyruğu</b>
          <small>
            {queueCount() === null
              ? "Kuyruk okunamadı"
              : queueCount()
                ? t("{0} tur yüklenmeyi bekliyor (program açıkken kendiliğinden yüklenir)", queueCount()!)
                : "Bekleyen tur yok"}
            <Show when={msg()}> · {msg()}</Show>
          </small>
        </div>
        <button class="btn small" disabled={busy() || !queueCount()} onClick={flush}>
          <I.RefreshCw /> Şimdi yükle
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Genel bakış (kendim ya da başka bir üye)
// ---------------------------------------------------------------------------

function FriendButton(p: { id: string; status: string | null }) {
  const [st, setSt] = createSignal(p.status);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  createEffect(on(() => p.status, (s) => setSt(s), { defer: true }));
  const add = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await friendRequest(p.id, st() === "pending_in");
      setSt(r === "accepted" ? "accepted" : "pending_out");
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Switch>
      <Match when={st() === "accepted"}>
        <span class="tele-tag ok">Arkadaş</span>
      </Match>
      <Match when={st() === "pending_out"}>
        <span class="tele-tag">İstek gönderildi</span>
      </Match>
      <Match when={true}>
        <button
          class="btn small"
          disabled={busy() || (st() !== "pending_in" && proLocked(F.friendAdd))}
          title={err() || (st() !== "pending_in" && proLocked(F.friendAdd) ? "Arkadaş eklemek PRO üyelere özel" : undefined)}
          onClick={add}
        >
          <I.UserPlus /> {st() === "pending_in" ? "İsteği kabul et" : "Arkadaş ekle"}
          <Show when={st() !== "pending_in"}>
            <ProLockTag feature={F.friendAdd} />
          </Show>
        </button>
      </Match>
    </Switch>
  );
}

function OverviewView(p: { user?: string }) {
  const [data, { refetch }] = createResource(() => p.user ?? "me", (u) => telemetryOverview(u === "me" ? null : u));
  const isMe = () => !p.user || data()?.profile.is_me;
  return (
    <>
      <Show when={isMe()}>
        <SettingsPanel />
      </Show>
      <Show when={data.error}>
        {/* Telemetri okunamadı: başka bir üyenin profili yine de görünür */}
        <Show when={p.user && p.user !== session()?.user.id}>
          <section class="panel">
            <ProfileCard id={p.user!} onTeam={(id) => (setTeamFocus(id), go("drivers", "teams"))} />
          </section>
        </Show>
        <p class="error">{errText(data.error)}</p>
      </Show>
      <Show when={data.loading && !data()}>
        <p class="muted">Yükleniyor…</p>
      </Show>
      <Show when={data()}>
        {(d) => (
          <>
            <Show when={!isMe()}>
              <section class="panel">
                <ProfileCard id={d().profile.id} onTeam={(id) => (setTeamFocus(id), go("drivers", "teams"))} />
              </section>
            </Show>
            <section class="panel">
              <div class="tele-head">
                <div>
                  <h3>{isMe() ? "Telemetrim" : "Telemetri"}</h3>
                  <div class="tele-ids" hidden={!isMe()}>
                    <For each={d().identities}>
                      {(x) => (
                        <span class="tele-tag" title={x.sim_id ? t("Üye no {0}", x.sim_id) : undefined}>
                          <b>{SIM_LABEL[x.sim] ?? x.sim}</b> {x.sim_name}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </div>
              <Show
                when={d().visible}
                fallback={<p class="muted">Telemetrisi gizli: bu yarışçı telemetri verilerini paylaşmıyor. Aynı takımdaysanız görebilirsin.</p>}
              >
                <Show
                  when={(d().totals?.laps ?? 0) > 0}
                  fallback={
                    <p class="muted">
                      {isMe()
                        ? "Henüz kayıtlı tur yok. Bir simde birkaç tur at; turların program açıkken kendiliğinden buraya gelir."
                        : "Henüz veri yok: bu yarışçının kayıtlı turu yok."}
                    </p>
                  }
                >
                  <div class="stat-grid">
                    <div class="stat race">
                      <b>{d().totals!.laps}</b>
                      <small>Tur ({d().totals!.valid_laps} geçerli)</small>
                    </div>
                    <div class="stat">
                      <b>{d().totals!.sessions}</b>
                      <small>Oturum</small>
                    </div>
                    <div class="stat">
                      <b>{Math.round(d().totals!.distance_km).toLocaleString(localeTag())}</b>
                      <small>km</small>
                    </div>
                    <div class="stat">
                      <b>{fmtHours(d().totals!.drive_time)}</b>
                      <small>Sürüş süresi</small>
                    </div>
                    <div class="stat">
                      <b>{d().totals!.tracks}</b>
                      <small>Pist</small>
                    </div>
                    <div class="stat">
                      <b>{d().totals!.cars}</b>
                      <small>Araç</small>
                    </div>
                    <div class="stat">
                      <b>{d().totals!.incidents}x</b>
                      <small>Olay</small>
                    </div>
                  </div>
                  <div class="tele-ids">
                    <For each={d().sims}>
                      {(s) => (
                        <span class="tele-tag">
                          {SIM_LABEL[s.sim] ?? s.sim}: {t("{0} tur", s.laps)}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </section>
            <Show when={d().visible && (d().recent?.length ?? 0) > 0}>
              <SessionsPanel sessions={d().recent!} mine={!!isMe()} user={isMe() ? null : d().profile.id} onDeleted={refetch} />
              <BestsPanel bests={d().bests ?? []} />
            </Show>
          </>
        )}
      </Show>
    </>
  );
}

const TYPE_FILTERS = ["race", "qualify", "practice", "warmup", "hotlap", "other"] as const;
const PAGE = 50;

function SessionsPanel(p: { sessions: TelemetrySession[]; mine: boolean; user: string | null; onDeleted: () => void }) {
  const [err, setErr] = createSignal("");
  // Liste: genel bakışın son oturumları + "Daha fazla yükle" ile gelen sayfalar (süzgeçler istemcide)
  const [list, setList] = createSignal<TelemetrySession[]>(p.sessions);
  const [done, setDone] = createSignal(p.sessions.length < 20);
  const [loading, setLoading] = createSignal(false);
  const [fSim, setFSim] = createSignal("");
  const [fTrack, setFTrack] = createSignal("");
  const [fCar, setFCar] = createSignal("");
  const [fTypes, setFTypes] = createSignal<string[]>([]);
  const [fAi, setFAi] = createSignal<"" | "ai" | "human">("");
  createEffect(on(() => p.sessions, (v) => (setList(v), setDone(v.length < 20)), { defer: true }));

  const del = async (s: TelemetrySession) => {
    if (!confirm(t("{0} oturumu silinsin mi? Turları ve izleri kalıcı olarak silinir.", trackLabel(s)))) return;
    setErr("");
    try {
      await deleteSession(s.id);
      setList((l) => l.filter((x) => x.id !== s.id));
      p.onDeleted();
    } catch (e) {
      setErr(errText(e));
    }
  };

  const typeOf = (s: TelemetrySession) => ((TYPE_FILTERS as readonly string[]).includes(s.session_type) ? s.session_type : "other");
  /** Süzgeç seçenekleri: yüklenmiş oturumlardan (sim seçiliyse o simin pist/araçları) */
  const sims = createMemo(() => [...new Set(list().map((s) => s.sim))]);
  const tracks = createMemo(() =>
    [...new Set(list().filter((s) => !fSim() || s.sim === fSim()).map((s) => trackLabel(s)))].sort((a, b) => a.localeCompare(b, localeTag())),
  );
  const cars = createMemo(() =>
    [...new Set(list().filter((s) => (!fSim() || s.sim === fSim()) && (!fTrack() || trackLabel(s) === fTrack())).map((s) => s.car_name).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, localeTag()),
    ),
  );
  const match = (s: TelemetrySession) =>
    (!fSim() || s.sim === fSim()) &&
    (!fTrack() || trackLabel(s) === fTrack()) &&
    (!fCar() || s.car_name === fCar()) &&
    (fTypes().length === 0 || fTypes().includes(typeOf(s))) &&
    (!fAi() || (fAi() === "ai") === isAiSession(s));
  const shown = createMemo(() => list().filter(match));
  const active = () => !!(fSim() || fTrack() || fCar() || fTypes().length || fAi());
  const clear = () => {
    setFSim("");
    setFTrack("");
    setFCar("");
    setFTypes([]);
    setFAi("");
  };
  const toggleType = (k: string) => setFTypes((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  /** Sonraki sayfaları getir; süzgeç varken en az birkaç eşleşme bulana kadar (en çok 4 sayfa) devam et */
  const loadMore = async () => {
    if (loading() || done()) return;
    setLoading(true);
    setErr("");
    try {
      const before = shown().length;
      for (let i = 0; i < 4; i++) {
        const rows = await telemetrySessions(p.user, "", PAGE, list().length);
        const have = new Set(list().map((x) => x.id));
        const add = (rows ?? []).filter((x) => !have.has(x.id));
        setList((l) => [...l, ...add]);
        if ((rows?.length ?? 0) < PAGE) {
          setDone(true);
          break;
        }
        if (!active() || shown().length - before >= 10) break;
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section class="panel">
      <div class="tele-head">
        <h3>Oturumlar</h3>
        <small class="muted">
          {active() ? t("{0} / {1} oturum", shown().length, list().length) : t("{0} oturum", list().length)}
          {done() ? "" : "+"}
        </small>
      </div>
      <div class="tele-filters">
        <div class="tf-row">
          <span class="tf-label">Oyun</span>
          <div class="chips">
            <button class="chip" classList={{ on: !fSim() }} onClick={() => (setFSim(""), setFTrack(""), setFCar(""))}>
              Tümü
            </button>
            <For each={sims()}>
              {(x) => (
                <button class="chip" classList={{ on: fSim() === x }} onClick={() => (setFSim(fSim() === x ? "" : x), setFTrack(""), setFCar(""))}>
                  {SIM_LABEL[x] ?? x}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="tf-row">
          <span class="tf-label">Oturum</span>
          <div class="chips">
            <For each={TYPE_FILTERS}>
              {(k) => (
                <button class="chip" classList={{ on: fTypes().includes(k) }} onClick={() => toggleType(k)}>
                  {k === "other" ? t("Diğer") : t(SESSION_LABEL[k])}
                </button>
              )}
            </For>
            <span class="tf-sep" />
            <button class="chip" classList={{ on: fAi() === "ai" }} title="Rakipleri yapay zekâ olan oturumlar" onClick={() => setFAi(fAi() === "ai" ? "" : "ai")}>
              🤖 Botlarla yarış
            </button>
            <button class="chip" classList={{ on: fAi() === "human" }} title="Botsuz (çevrimiçi ya da tek başına)" onClick={() => setFAi(fAi() === "human" ? "" : "human")}>
              Botsuz
            </button>
          </div>
        </div>
        <div class="tf-row">
          <span class="tf-label">Pist / araç</span>
          <div class="tf-selects">
            <select class="input" value={fTrack()} onChange={(e) => (setFTrack(e.currentTarget.value), setFCar(""))}>
              <option value="">Tüm pistler</option>
              <For each={tracks()}>{(x) => <option value={x}>{x}</option>}</For>
            </select>
            <select class="input" value={fCar()} onChange={(e) => setFCar(e.currentTarget.value)}>
              <option value="">Tüm araçlar</option>
              <For each={cars()}>{(x) => <option value={x}>{x}</option>}</For>
            </select>
            <Show when={active()}>
              <button class="btn ghost small" onClick={clear}>
                Süzgeçleri temizle
              </button>
            </Show>
          </div>
        </div>
      </div>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
      <Show
        when={shown().length > 0}
        fallback={<p class="muted">{done() ? "Bu süzgeçlere uyan oturum yok." : "Yüklenen oturumlarda eşleşme yok; daha fazlasını yükle."}</p>}
      >
        <div class="tele-scroll">
          <table class="tele-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Sim</th>
                <th>Pist</th>
                <th>Araç</th>
                <th>Oturum</th>
                <th class="num">Tur</th>
                <th class="num">En iyi</th>
                <th class="num">Olay</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={shown()}>
                {(s) => (
                  <tr class="click" onClick={() => push({ kind: "session", id: s.id })}>
                    <td class="nowrap">{fmtDate(s.started_at)}</td>
                    <td>{SIM_LABEL[s.sim] ?? s.sim}</td>
                    <td>{trackLabel(s)}</td>
                    <td>
                      {s.car_name}
                      <Show when={s.car_class}>
                        <small class="muted"> · {s.car_class}</small>
                      </Show>
                    </td>
                    <td>
                      {t(SESSION_LABEL[s.session_type] ?? "Oturum")}
                      <Show when={isAiSession(s)}>
                        <span class="tele-tag ai" title="Rakipler yapay zekâ">
                          Bot
                        </span>
                      </Show>
                    </td>
                    <td class="num">
                      {s.laps}
                      <Show when={s.invalid_laps}>
                        <small class="bad" title="Geçersiz tur">
                          {" "}
                          ({s.invalid_laps}✕)
                        </small>
                      </Show>
                    </td>
                    <td class="num mono">{lapTime(s.best_lap)}</td>
                    <td class="num">{s.incidents ? `${s.incidents}x` : "—"}</td>
                    <td class="act">
                      <Show when={p.mine}>
                        <button
                          class="icon-btn small"
                          title="Oturumu sil"
                          onClick={(e) => {
                            e.stopPropagation();
                            void del(s);
                          }}
                        >
                          <I.Trash />
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <Show when={!done()}>
        <div class="tele-more">
          <button class="btn ghost" disabled={loading()} onClick={() => void loadMore()}>
            {loading() ? "Yükleniyor…" : "Daha fazla yükle"}
          </button>
        </div>
      </Show>
    </section>
  );
}

function BestsPanel(p: { bests: BestLap[] }) {
  return (
    <Show when={p.bests.length}>
      <section class="panel">
        <h3>Kişisel en iyiler</h3>
        <div class="tele-scroll">
          <table class="tele-table">
            <thead>
              <tr>
                <th>Sim</th>
                <th>Pist</th>
                <th>Araç</th>
                <th class="num">En iyi tur</th>
                <th class="num">Tur</th>
                <th>Tarih</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={p.bests}>
                {(b) => (
                  <tr>
                    <td>{SIM_LABEL[b.sim] ?? b.sim}</td>
                    <td>{trackLabel(b)}</td>
                    <td>
                      {b.car_name}
                      <Show when={b.car_class}>
                        <small class="muted"> · {b.car_class}</small>
                      </Show>
                    </td>
                    <td class="num mono best">{lapTime(b.lap_time)}</td>
                    <td class="num">{b.laps}</td>
                    <td class="nowrap">{fmtDate(b.driven_at, false)}</td>
                    <td class="act nowrap">
                      <button
                        class="btn ghost small"
                        title="Bu pist ve araçta diğer yarışçıların en iyileri"
                        onClick={() =>
                          push({
                            kind: "board",
                            sim: b.sim,
                            track_id: b.track_id,
                            track_config: b.track_config,
                            car_id: b.car_id,
                            title: `${trackLabel(b)} · ${b.car_name}`,
                          })
                        }
                      >
                        <I.Trophy /> Sıralama
                      </button>
                      <Show when={b.has_trace}>
                        <button class="btn small" onClick={() => push({ kind: "analysis", laps: [b.lap_id] })}>
                          <I.Activity /> Analiz
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Oturum ayrıntısı
// ---------------------------------------------------------------------------

function SessionView(p: { id: string }) {
  const [data] = createResource(() => p.id, telemetrySession);
  const best = createMemo(() => {
    const laps = (data()?.laps ?? []).filter((l) => l.valid && !l.pit);
    const lap = laps.reduce<(typeof laps)[number] | null>((a, l) => (!a || l.lap_time < a.lap_time ? l : a), null);
    const sec = [0, 1, 2].map((i) => Math.min(...laps.map((l) => (l.sectors?.[i] > 0 ? l.sectors[i] : Infinity))));
    return { id: lap?.id ?? "", sec };
  });
  const reasons = (l: { off_track: boolean; sim_invalid: boolean; incidents: number }) =>
    [l.off_track && "pist dışı", l.incidents > 0 && "olay", l.sim_invalid && "sim geçersiz saydı"].filter(Boolean).map((x) => t(x as string)).join(", ");
  return (
    <>
      <Show when={data.error}>
        <p class="error">{errText(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(d) => {
          const s = () => d().session;
          return (
            <>
              <section class="panel">
                <div class="tele-head">
                  <div>
                    <h3>{trackLabel(s())}</h3>
                    <p class="muted small">
                      {SIM_LABEL[s().sim]} · {s().car_name}
                      {s().car_class ? ` (${s().car_class})` : ""} · {t(SESSION_LABEL[s().session_type] ?? "Oturum")} · {fmtDate(s().started_at)}
                      <Show when={!session() || d().owner.id !== session()!.user.id}>
                        {" "}
                        · {d().owner.display_name}
                      </Show>
                    </p>
                  </div>
                </div>
                <div class="stat-grid">
                  <div class="stat race">
                    <b class="mono">{lapTime(s().best_lap)}</b>
                    <small>En iyi tur</small>
                  </div>
                  <div class="stat">
                    <b>{s().laps}</b>
                    <small>
                      Tur ({s().valid_laps} geçerli, {s().invalid_laps} geçersiz)
                    </small>
                  </div>
                  <div class="stat">
                    <b>{s().incidents}x</b>
                    <small>Olay</small>
                  </div>
                  <div class="stat">
                    <b>{Math.round(s().distance_km)}</b>
                    <small>km</small>
                  </div>
                  <Show when={s().air_temp != null}>
                    <div class="stat">
                      <b>
                        {Math.round(s().air_temp!)}° / {Math.round(s().track_temp ?? 0)}°
                      </b>
                      <small>Hava / pist</small>
                    </div>
                  </Show>
                </div>
              </section>
              <section class="panel">
                <h3>Turlar</h3>
                <div class="tele-scroll">
                  <table class="tele-table">
                    <thead>
                      <tr>
                        <th class="num">Tur</th>
                        <th class="num">Süre</th>
                        <th class="num">S1</th>
                        <th class="num">S2</th>
                        <th class="num">S3</th>
                        <th>Durum</th>
                        <th class="num">Olay</th>
                        <th class="num">Yakıt</th>
                        <th class="num">Sıra</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d().laps}>
                        {(l) => (
                          <tr classList={{ "best-row": l.id === best().id, invalid: !l.valid }}>
                            <td class="num">{l.lap}</td>
                            <td class="num mono" classList={{ best: l.id === best().id }}>
                              {lapTime(l.lap_time)}
                            </td>
                            <For each={[0, 1, 2]}>
                              {(i) => (
                                <td class="num mono" classList={{ purple: l.valid && !l.pit && l.sectors?.[i] > 0 && l.sectors[i] === best().sec[i] }}>
                                  {l.sectors?.[i] > 0 ? l.sectors[i].toFixed(3) : "—"}
                                </td>
                              )}
                            </For>
                            <td>
                              <Show when={l.valid} fallback={<span class="tele-tag bad" title={reasons(l)}>Geçersiz</span>}>
                                <span class="tele-tag ok">Geçerli</span>
                              </Show>
                              <Show when={l.pit}>
                                <span class="tele-tag">Pit</span>
                              </Show>
                            </td>
                            <td class="num">{l.incidents ? `${l.incidents}x` : "—"}</td>
                            <td class="num">{l.fuel_used ? `${l.fuel_used.toFixed(2)} L` : "—"}</td>
                            <td class="num">{l.position ? `P${l.position}` : "—"}</td>
                            <td class="act">
                              <Show when={l.has_trace}>
                                <button class="btn small" onClick={() => push({ kind: "analysis", laps: [l.id] })}>
                                  <I.Activity /> Analiz
                                </button>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
                <p class="muted small">Mor: oturumun en iyi sektörü. Tur izi (analiz) oturumun en iyi geçerli turu için saklanır.</p>
              </section>
            </>
          );
        }}
      </Show>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lider tablosu (pist + araç)
// ---------------------------------------------------------------------------

function BoardView(p: { v: Extract<View, { kind: "board" }> }) {
  const [allCars, setAllCars] = createSignal(false);
  const [rows] = createResource(
    () => ({ ...p.v, all: allCars() }),
    (x) => leaderboard(x, x.all ? null : x.car_id, 100),
  );
  const [sel, setSel] = createSignal<string[]>([]);
  const toggle = (id: string) => setSel(sel().includes(id) ? sel().filter((x) => x !== id) : [...sel(), id].slice(-2));
  return (
    <section class="panel">
      <div class="tele-head">
        <div>
          <h3>Sıralama</h3>
          <p class="muted small">
            {SIM_LABEL[p.v.sim]} · {p.v.title}
          </p>
        </div>
        <div class="tele-tools">
          <label class="chk">
            <input type="checkbox" checked={allCars()} onChange={(e) => setAllCars(e.currentTarget.checked)} /> Tüm araçlar
          </label>
          <button class="btn primary small" disabled={!sel().length} onClick={() => push({ kind: "analysis", laps: sel() })}>
            <I.Activity /> Karşılaştır ({sel().length}/2)
          </button>
        </div>
      </div>
      <Show when={rows.error}>
        <p class="error">{errText(rows.error)}</p>
      </Show>
      <div class="tele-scroll">
        <table class="tele-table">
          <thead>
            <tr>
              <th />
              <th class="num">#</th>
              <th>Yarışçı</th>
              <th>Araç</th>
              <th class="num">En iyi tur</th>
              <th class="num">S1</th>
              <th class="num">S2</th>
              <th class="num">S3</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows() ?? []} fallback={<tr><td colspan="9" class="muted">{rows.loading ? "Yükleniyor…" : "Bu pistte görünür tur yok."}</td></tr>}>
              {(r) => (
                <tr classList={{ me: r.is_me }}>
                  <td>
                    <input type="checkbox" disabled={!r.has_trace} title={r.has_trace ? "" : "Bu turun izi yok"} checked={sel().includes(r.lap_id)} onChange={() => toggle(r.lap_id)} />
                  </td>
                  <td class="num">{r.rank}</td>
                  <td>
                    <button class="link" onClick={() => push(r.is_me ? { kind: "home" } : { kind: "user", id: r.user_id })}>
                      {r.sim_name || r.display_name}
                    </button>
                    <Show when={r.sim_name && r.display_name && r.sim_name !== r.display_name}>
                      <small class="muted"> · {r.display_name}</small>
                    </Show>
                  </td>
                  <td>{r.car_name}</td>
                  <td class="num mono" classList={{ best: r.rank === 1 }}>
                    {lapTime(r.lap_time)}
                  </td>
                  <For each={[0, 1, 2]}>{(i) => <td class="num mono">{r.sectors?.[i] > 0 ? r.sectors[i].toFixed(3) : "—"}</td>}</For>
                  <td class="nowrap">{fmtDate(r.driven_at, false)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tur analizi
// ---------------------------------------------------------------------------

interface Loaded {
  info: LapInfo;
  trace: Trace | null;
}

function AnalysisView(p: { laps: string[] }) {
  const [data] = createResource(
    () => p.laps.join(","),
    async () => {
      const infos = await lapsInfo(p.laps);
      const ordered = p.laps.map((id) => infos.find((x) => x.id === id)).filter((x): x is LapInfo => !!x);
      return Promise.all(ordered.map(async (info) => ({ info, trace: await loadTrace(info.trace_path) }) as Loaded));
    },
  );
  const [picker, setPicker] = createSignal(false);
  const setLaps = (laps: string[]) => replaceTop({ kind: "analysis", laps });
  const first = () => data()?.[0]?.info;
  return (
    <>
      <Show when={data.error}>
        <p class="error">{errText(data.error)}</p>
      </Show>
      <Show when={data.loading}>
        <p class="muted">Yükleniyor…</p>
      </Show>
      <Show when={data()}>
        {(list) => (
          <>
            <section class="panel">
              <div class="tele-head">
                <div>
                  <h3>Tur analizi</h3>
                  <Show when={first()}>
                    <p class="muted small">
                      {SIM_LABEL[first()!.sim]} · {trackLabel(first()!)}
                    </p>
                  </Show>
                </div>
                <Show when={list().length < 2 && first()}>
                  <button class="btn primary small" onClick={() => setPicker(!picker())}>
                    <I.Plus /> Karşılaştırılacak tur ekle
                  </button>
                </Show>
              </div>
              <div class="lap-cards">
                <For each={list()}>
                  {(x, i) => (
                    <div class="lap-card" style={{ "--c": COLORS[i()] }}>
                      <i class="sw" />
                      <div>
                        <b>
                          {"AB"[i()]} · {x.info.driver_name || x.info.display_name}
                        </b>
                        <small>
                          {x.info.car_name} · {t("Tur {0}", x.info.lap)} · {fmtDate(x.info.driven_at, false)}
                        </small>
                      </div>
                      <span class="mono lap-time">{lapTime(x.info.lap_time)}</span>
                      <Show when={list().length > 1}>
                        <button class="icon-btn small" title="Çıkar" onClick={() => setLaps(p.laps.filter((id) => id !== x.info.id))}>
                          <I.X />
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
              <Show when={list().length === 2}>
                <SectorCompare a={list()[0].info} b={list()[1].info} />
              </Show>
              <Show when={picker() && first()}>
                <LapPicker
                  base={first()!}
                  exclude={p.laps}
                  onPick={(id) => {
                    setPicker(false);
                    setLaps([...p.laps.slice(0, 1), id]);
                  }}
                />
              </Show>
            </section>
            <Show
              when={list().every((x) => x.trace)}
              fallback={<p class="muted">Bu turların izi bulunamadı (sadece oturumların en iyi turlarının izi saklanır).</p>}
            >
              <TraceCharts laps={list()} />
            </Show>
          </>
        )}
      </Show>
    </>
  );
}

function SectorCompare(p: { a: LapInfo; b: LapInfo }) {
  const cell = (x?: number, y?: number) => {
    if (!(x! > 0) || !(y! > 0)) return "—";
    const d = y! - x!;
    return `${d >= 0 ? "+" : ""}${d.toFixed(3)}`;
  };
  return (
    <table class="tele-table compact">
      <thead>
        <tr>
          <th />
          <th class="num">S1</th>
          <th class="num">S2</th>
          <th class="num">S3</th>
          <th class="num">Tur</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>A</td>
          <For each={[0, 1, 2]}>{(i) => <td class="num mono">{p.a.sectors?.[i]?.toFixed(3) ?? "—"}</td>}</For>
          <td class="num mono">{lapTime(p.a.lap_time)}</td>
        </tr>
        <tr>
          <td>B</td>
          <For each={[0, 1, 2]}>{(i) => <td class="num mono">{p.b.sectors?.[i]?.toFixed(3) ?? "—"}</td>}</For>
          <td class="num mono">{lapTime(p.b.lap_time)}</td>
        </tr>
        <tr class="diff">
          <td>B − A</td>
          <For each={[0, 1, 2]}>{(i) => <td class="num mono">{cell(p.a.sectors?.[i], p.b.sectors?.[i])}</td>}</For>
          <td class="num mono">{cell(p.a.lap_time, p.b.lap_time)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function LapPicker(p: { base: LapInfo; exclude: string[]; onPick: (id: string) => void }) {
  const [tab, setTab] = createSignal<"mine" | "others">("mine");
  const combo = () => ({ sim: p.base.sim, track_id: p.base.track_id, track_config: p.base.track_config, car_id: p.base.car_id });
  const [mine] = createResource(() => (tab() === "mine" ? combo() : null), (c) => comboLaps(c));
  const [others] = createResource(() => (tab() === "others" ? combo() : null), (c) => leaderboard(c, c.car_id, 50));
  return (
    <div class="lap-picker">
      <div class="seg small">
        <button classList={{ on: tab() === "mine" }} onClick={() => setTab("mine")}>
          Benim turlarım
        </button>
        <button classList={{ on: tab() === "others" }} onClick={() => setTab("others")}>
          Diğer yarışçılar
        </button>
      </div>
      <p class="muted small">Aynı pist ve araçta, izi olan turlar.</p>
      <div class="tele-scroll short">
        <table class="tele-table compact">
          <tbody>
            <Show when={tab() === "mine"}>
              <For each={(mine() ?? []).filter((l) => !p.exclude.includes(l.id))} fallback={<tr><td class="muted">{mine.loading ? "Yükleniyor…" : "Başka tur yok."}</td></tr>}>
                {(l) => (
                  <tr class="click" onClick={() => p.onPick(l.id)}>
                    <td class="mono">{lapTime(l.lap_time)}</td>
                    <td>{t(SESSION_LABEL[l.session_type] ?? "Oturum")}</td>
                    <td>{t("Tur {0}", l.lap)}</td>
                    <td class="nowrap">{fmtDate(l.driven_at)}</td>
                  </tr>
                )}
              </For>
            </Show>
            <Show when={tab() === "others"}>
              <For each={(others() ?? []).filter((r) => r.has_trace && !p.exclude.includes(r.lap_id))} fallback={<tr><td class="muted">{others.loading ? "Yükleniyor…" : "Görünür tur yok."}</td></tr>}>
                {(r) => (
                  <tr class="click" onClick={() => p.onPick(r.lap_id)}>
                    <td class="num">{r.rank}.</td>
                    <td>{r.sim_name || r.display_name}</td>
                    <td class="mono">{lapTime(r.lap_time)}</td>
                    <td class="nowrap">{fmtDate(r.driven_at, false)}</td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grafikler: ortak imleçli, mesafeye göre panolar (SVG)
// ---------------------------------------------------------------------------

interface SeriesDef {
  label: string;
  color: string;
  values: number[];
}

const W = 1000;

function linePath(values: number[], min: number, max: number, h: number, step = false) {
  const n = values.length;
  if (n < 2) return "";
  const span = max - min || 1;
  // Üst/alt kenarda çizgi kesilmesin
  const pad = 4;
  const y = (v: number) => (h - pad - ((v - min) / span) * (h - 2 * pad)).toFixed(1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * W).toFixed(1);
    if (i === 0) d += `M${x},${y(values[0])}`;
    else if (step && values[i] !== values[i - 1]) d += `H${x}V${y(values[i])}`;
    else d += `L${x},${y(values[i])}`;
  }
  return d;
}

function ChartPanel(p: {
  title: string;
  series: SeriesDef[];
  height: number;
  min?: number;
  max?: number;
  step?: boolean;
  zero?: boolean;
  fmt: (v: number) => string;
  cursor: number | null;
  setCursor: (i: number | null) => void;
}) {
  const range = createMemo(() => {
    const all = p.series.flatMap((s) => s.values);
    let lo = p.min ?? Math.min(...all);
    let hi = p.max ?? Math.max(...all);
    if (p.zero) {
      const m = Math.max(Math.abs(lo), Math.abs(hi), 0.05);
      lo = -m;
      hi = m;
    }
    return { lo, hi: hi === lo ? lo + 1 : hi };
  });
  const n = () => p.series[0]?.values.length ?? 0;
  let box!: HTMLDivElement;
  const move = (e: PointerEvent) => {
    const r = box.getBoundingClientRect();
    const k = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    p.setCursor(Math.round(k * (n() - 1)));
  };
  const zeroY = () => {
    const { lo, hi } = range();
    return p.height - 4 - ((0 - lo) / (hi - lo)) * (p.height - 8);
  };
  return (
    <div class="tchart">
      <div class="tchart-head">
        <b>{p.title}</b>
        <span class="tchart-read">
          <For each={p.series}>
            {(s) => (
              <span>
                <i style={{ background: s.color }} />
                {s.label} <b class="mono">{p.cursor != null ? p.fmt(s.values[p.cursor] ?? 0) : "—"}</b>
              </span>
            )}
          </For>
        </span>
      </div>
      <div class="tchart-plot" ref={box} onPointerMove={move} onPointerLeave={() => p.setCursor(null)} style={{ height: `${p.height}px` }}>
        <svg viewBox={`0 0 ${W} ${p.height}`} preserveAspectRatio="none" width="100%" height={p.height}>
          <line x1="0" x2={W} y1={p.height / 2} y2={p.height / 2} class="grid" vector-effect="non-scaling-stroke" />
          <Show when={p.zero}>
            <line x1="0" x2={W} y1={zeroY()} y2={zeroY()} class="zero" vector-effect="non-scaling-stroke" />
          </Show>
          <For each={p.series}>
            {(s) => <path d={linePath(s.values, range().lo, range().hi, p.height, p.step)} stroke={s.color} class="ln" vector-effect="non-scaling-stroke" />}
          </For>
        </svg>
        <span class="tchart-axis top">{p.fmt(range().hi)}</span>
        <span class="tchart-axis bottom">{p.fmt(range().lo)}</span>
        <Show when={p.cursor != null && n() > 1}>
          <i class="tchart-cursor" style={{ left: `${(p.cursor! / (n() - 1)) * 100}%` }} />
        </Show>
      </div>
    </div>
  );
}

function TraceCharts(p: { laps: Loaded[] }) {
  const [cursor, setCursor] = createSignal<number | null>(null);
  const len = () => p.laps[0]?.info.track_length_km ?? 0;
  const mk = (pick: (t: Trace) => number[], scale = 1): SeriesDef[] =>
    p.laps.map((x, i) => ({ label: "AB"[i], color: COLORS[i], values: pick(x.trace!).map((v) => v * scale) }));
  const n = () => p.laps[0]?.trace?.n ?? 0;
  const pos = () => {
    const c = cursor();
    if (c == null || !n()) return "";
    const k = c / Math.max(n() - 1, 1);
    return len() > 0 ? `${Math.round(k * len() * 1000)} m` : `%${Math.round(k * 100)}`;
  };
  const delta = createMemo(() => (p.laps.length === 2 ? deltaSeries(p.laps[0].trace!, p.laps[1].trace!) : null));
  // Klavye: imleci oklarla gezdir
  const key = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const c = cursor() ?? 0;
    setCursor(Math.min(Math.max(c + (e.key === "ArrowLeft" ? -1 : 1), 0), n() - 1));
  };
  onMount(() => window.addEventListener("keydown", key));
  onCleanup(() => window.removeEventListener("keydown", key));
  return (
    <section class="panel tcharts">
      <div class="tele-head">
        <h3>İzler</h3>
        <span class="muted small">{pos() ? t("Konum: {0}", pos()) : "Değerleri görmek için grafiğin üzerine gel"}</span>
      </div>
      <Show when={delta()}>
        <ChartPanel
          title="Fark (B − A, sn; + B daha yavaş)"
          series={[{ label: "B−A", color: COLORS[1], values: delta()! }]}
          height={90}
          zero
          fmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
          cursor={cursor()}
          setCursor={setCursor}
        />
      </Show>
      <ChartPanel title="Hız (km/h)" series={mk((t) => t.speed, 0.1)} height={150} fmt={(v) => v.toFixed(0)} cursor={cursor()} setCursor={setCursor} />
      <ChartPanel title="Gaz (%)" series={mk((t) => t.throttle)} height={70} min={0} max={100} fmt={(v) => v.toFixed(0)} cursor={cursor()} setCursor={setCursor} />
      <ChartPanel title="Fren (%)" series={mk((t) => t.brake)} height={70} min={0} max={100} fmt={(v) => v.toFixed(0)} cursor={cursor()} setCursor={setCursor} />
      <ChartPanel title="Vites" series={mk((t) => t.gear)} height={70} step fmt={(v) => (v < 0 ? "R" : v === 0 ? "N" : v.toFixed(0))} cursor={cursor()} setCursor={setCursor} />
      <ChartPanel title="Direksiyon (°)" series={mk((t) => t.steer)} height={80} zero fmt={(v) => v.toFixed(0)} cursor={cursor()} setCursor={setCursor} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Yarışçılar
// ---------------------------------------------------------------------------

function RacersView() {
  const [sim, setSim] = createSignal<SimId>("iracing");
  const [q, setQ] = createSignal("");
  const [query, setQuery] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const typed = (v: string) => {
    setQ(v);
    clearTimeout(timer);
    timer = setTimeout(() => setQuery(v), 300);
  };
  onCleanup(() => clearTimeout(timer));
  const [rows] = createResource(
    () => ({ sim: sim(), q: query() }),
    async (x) => {
      const tab = SIM_TABS.find((s) => s.id === x.sim)!;
      const parts = await Promise.all([x.sim, ...(tab.also ?? [])].map((s) => telemetryDrivers(s, x.q, 100)));
      return parts.flat().sort((a, b) => (b.last_active ?? "").localeCompare(a.last_active ?? ""));
    },
  );
  const open = (r: DriverRow) => {
    go("telemetry", "overview");
    setStack(r.is_me ? [] : [{ kind: "user", id: r.user_id }]);
  };
  return (
    <section class="panel">
      <div class="tele-head">
        <div class="seg">
          <For each={SIM_TABS}>
            {(s) => (
              <button classList={{ on: sim() === s.id }} onClick={() => setSim(s.id)}>
                {s.label}
              </button>
            )}
          </For>
        </div>
        <div class="tele-search">
          <I.Search />
          <input class="input" placeholder={t("Sim adı ya da kullanıcı adı ara")} value={q()} onInput={(e) => typed(e.currentTarget.value)} />
        </div>
      </div>
      <p class="muted small">
        {t("{0} yarışçıları", SIM_LABEL[sim()])}: SRTR Pitwall ile en az bir tur kaydetmiş üyeler. Telemetrisini gizleyenlerin sadece adı görünür.
      </p>
      <Show when={rows.error}>
        <p class="error">{errText(rows.error)}</p>
      </Show>
      <div class="tele-scroll">
        <table class="tele-table">
          <thead>
            <tr>
              <th>Sim adı</th>
              <th>Kullanıcı</th>
              <th class="num">Tur</th>
              <th class="num">Pist</th>
              <th>Son etkinlik</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={rows() ?? []} fallback={<tr><td colspan="6" class="muted">{rows.loading ? "Yükleniyor…" : "Yarışçı bulunamadı."}</td></tr>}>
              {(r) => (
                <tr classList={{ me: r.is_me }}>
                  <td>
                    <b>{r.sim_name}</b>
                    <Show when={r.sim !== sim()}>
                      <small class="muted"> · {SIM_LABEL[r.sim]}</small>
                    </Show>
                  </td>
                  <td>{r.display_name}</td>
                  <td class="num">{r.visible ? (r.laps ?? 0) : "—"}</td>
                  <td class="num">{r.visible ? (r.tracks ?? 0) : "—"}</td>
                  <td class="nowrap">{r.visible ? fmtDate(r.last_active, false) : <span class="muted">Gizli</span>}</td>
                  <td class="act nowrap">
                    <Show when={r.visible}>
                      <button class="btn ghost small" onClick={() => open(r)}>
                        <I.Activity /> Telemetri
                      </button>
                    </Show>
                    <Show when={!r.is_me}>
                      <FriendButton id={r.user_id} status={r.friend} />
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

