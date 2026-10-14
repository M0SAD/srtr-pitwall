// Telemetri: kaydedilen turlarım (genel bakış, oturumlar, kişisel en iyiler), oturum ayrıntısı,
// tur analizi (iki turun hız/gaz/fren/vites/direksiyon izleri ve fark) ve Yarışçılar dizini.
// Kayıt ve yükleme: src-tauri/src/laprec.rs + src/cloud/telemetry.ts

import { localeTag, t } from "@/sdk/i18n";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { friendLook, friendRequest } from "@/cloud/social";
import { loadAvatars } from "@/cloud/profile";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockBox, ProLockTag } from "../components/ProLock";
import { lapTime } from "@/sdk/format";
import { uiPref } from "@/sdk/settings";
import {
  SESSION_LABEL,
  SIM_LABEL,
  SIM_TABS,
  comboLaps,
  deltaSeries,
  lapsInfo,
  leaderboard,
  loadTrace,
  telemetryDrivers,
  telemetryOverview,
  telemetrySession,
  telemetrySessions,
  isAiSession,
  trackLabel,
  MAX_COMPARE,
  createShare,
  myShares,
  revokeShare,
  shapeForShare,
  shareLink,
  type BestLap,
  type DriverRow,
  type LapInfo,
  type BoardRow,
  type SimId,
  type Trace,
  type TelemetrySession,
  resampleTo,
} from "@/cloud/telemetry";
import { go } from "../ui";
import { setTeamFocus } from "@/cloud/teams";
import { ProfileCard } from "../components/Profile";
import * as I from "../icons";
import { MiniMap, TeleMap, trackShapeFor } from "../components/TeleMap";
import { analyzeCorners, coachNotes, theoreticalBest, type CoachReason } from "@/sdk/teleAnalysis";
import { loadRef } from "@/cloud/teleref";
import "../telemetry.css";

/** İki turun renkleri (koyu zeminde renk körlüğü denetiminden geçti) */
/** Kıyaslanan turların renkleri ve harfleri (A referans; en çok MAX_COMPARE tur) */
const COLORS = ["#e0701a", "#3a84e0", "#2ecc71", "#c061e0", "#e8c53a"];
const LETTERS = "ABCDE";

type View =
  | { kind: "home" }
  | { kind: "user"; id: string }
  | { kind: "session"; id: string }
  | { kind: "analysis"; laps: string[] }
  | { kind: "board"; sim: string; track_id: string; track_config: string; car_id: string; title: string };

const [stack, setStack] = createSignal<View[]>([]);

/** Web sitesindeki karşılığı (yarisci.html): giriş yapmış her üye bağlantıyla açabilir. Analiz ekranının sitede
 *  karşılığı yok: o turun oturum sayfası paylaşılır. */
const SITE = "https://pitwall.simracetr.com/yarisci.html";
function shareUrl(v: View, me: string | undefined, sessionOf?: string): string | null {
  switch (v.kind) {
    case "home":
      return me ? `${SITE}?u=${me}` : null;
    case "user":
      return `${SITE}?u=${v.id}`;
    case "session":
      return `${SITE}?s=${v.id}`;
    case "board":
      return `${SITE}?b=${encodeURIComponent([v.sim, v.track_id, v.track_config, v.car_id].join("|"))}`;
    case "analysis":
      return sessionOf ? `${SITE}?s=${sessionOf}` : null;
  }
}
/** Analiz ekranındaki ilk turun oturumu (üye bağlantısı için; AnalysisView yükleyince yazar) */
const [analysisSession, setAnalysisSession] = createSignal<string | undefined>();
/** Analiz ekranındaki turlar (herkese açık paylaşım bağlantısı için) */
const [analysisLaps, setAnalysisLaps] = createSignal<LapInfo[]>([]);
/** Açık oturum sayfası (kendi oturumunsa herkese açık paylaşılabilir) */
const [sessionShare, setSessionShare] = createSignal<{
  id: string;
  owner: string;
  title: string;
  shapeOf: { sim: SimId; track_id: string; track_name: string; track_config: string };
} | null>(null);

async function copyText(u: string) {
  try {
    await navigator.clipboard.writeText(u);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = u;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** Pist şekli (bu bilgisayarda öğrenilmişse) paylaşıma eklenir: sitede harita ancak böyle çizilir */
async function shareShape(x: { sim: SimId; track_id: string; track_name: string; track_config: string }) {
  const s = await trackShapeFor(x).catch(() => null);
  return shapeForShare(s?.pts ?? null);
}

function ShareButton() {
  const [state, setState] = createSignal<"" | "busy" | "done">("");
  const [err, setErr] = createSignal("");
  const [mgr, setMgr] = createSignal(false);
  const me = () => session()?.user.id;
  /** Herkese açık bağlantı: tur analizi (kıyaslama) ve kendi oturumun */
  const pub = (): "laps" | "session" | null => {
    const v = view();
    if (!me()) return null;
    if (v.kind === "analysis") return analysisLaps().length ? "laps" : null;
    if (v.kind === "session") {
      const s = sessionShare();
      return s && s.id === v.id && s.owner === me() ? "session" : null;
    }
    return null;
  };
  const memberUrl = () => (pub() ? null : shareUrl(view(), me(), analysisSession()));
  const run = async () => {
    setErr("");
    setState("busy");
    try {
      let u: string | null = null;
      const kind = pub();
      if (kind === "laps") {
        const laps = analysisLaps();
        const f = laps[0];
        const title = `${trackLabel(f)} · ${f.car_name}`;
        u = shareLink(await createShare({ kind: "laps", laps: laps.map((l) => l.id), title, shape: await shareShape(f) }));
      } else if (kind === "session") {
        const s = sessionShare()!;
        u = shareLink(await createShare({ kind: "session", session: s.id, title: s.title, shape: await shareShape(s.shapeOf) }));
      } else u = memberUrl();
      if (!u) return setState("");
      await copyText(u);
      setState("done");
      setTimeout(() => setState(""), 2600);
    } catch (e) {
      setErr(errText(e));
      setState("");
    }
  };
  return (
    <span class="tele-share-wrap">
      <Show when={pub() || memberUrl()}>
        <button
          class="btn ghost small tele-share"
          classList={{ ok: state() === "done" }}
          disabled={state() === "busy"}
          title={
            pub()
              ? t("Herkese açık bağlantı oluşturup kopyala: giriş yapmadan herkes görebilir (yalnızca bu sayfadakiler)")
              : t("Bağlantıyı kopyala: giriş yapmış her üye web sitesinde açıp görebilir")
          }
          onClick={run}
        >
          <Show when={state() === "done"} fallback={<><I.Share2 /> {pub() ? t("Paylaş (herkese açık)") : t("Paylaş")}</>}>
            <I.Check /> Bağlantı kopyalandı
          </Show>
        </button>
      </Show>
      <Show when={me()}>
        <button class="btn ghost small" title={t("Paylaşım bağlantılarım: kopyala ya da kaldır")} onClick={() => setMgr(true)}>
          <I.Link2 /> Paylaşımlarım
        </button>
      </Show>
      <Show when={err()}>
        <small class="error">{err()}</small>
      </Show>
      <Show when={mgr()}>
        <SharesDialog onClose={() => setMgr(false)} />
      </Show>
    </span>
  );
}

function SharesDialog(p: { onClose: () => void }) {
  const [list, { refetch }] = createResource(() => myShares());
  const [copied, setCopied] = createSignal("");
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="modal tele-shares">
        <header>
          <h3>Paylaşım bağlantılarım</h3>
          <button class="btn ghost small" onClick={p.onClose} title="Kapat">
            <I.X />
          </button>
        </header>
        <p class="muted small">Bu bağlantıları bilen herkes giriş yapmadan görebilir. Kaldırınca bağlantı çalışmaz.</p>
        <Show when={list.error}>
          <p class="error">{errText(list.error)}</p>
        </Show>
        <div class="tele-scroll short">
          <table class="tele-table compact">
            <tbody>
              <For each={list() ?? []} fallback={<tr><td class="muted">{list.loading ? "Yükleniyor…" : "Henüz paylaşım yok."}</td></tr>}>
                {(s) => (
                  <tr>
                    <td>
                      <b data-no-i18n>{s.title || "—"}</b>
                      <br />
                      <small class="muted">
                        {s.kind === "session" ? t("Oturum") : t("{0} tur", s.laps)} · {fmtDate(s.created_at)} · {t("{0} görüntülenme", s.views)}
                      </small>
                    </td>
                    <td class="act nowrap">
                      <button
                        class="btn ghost small"
                        onClick={async () => {
                          await copyText(shareLink(s.id));
                          setCopied(s.id);
                          setTimeout(() => setCopied(""), 2000);
                        }}
                      >
                        <Show when={copied() === s.id} fallback={<><I.Copy /> Kopyala</>}>
                          <I.Check /> Kopyalandı
                        </Show>
                      </button>
                      <button
                        class="btn ghost small danger"
                        onClick={async () => {
                          await revokeShare(s.id).catch(() => {});
                          refetch();
                        }}
                      >
                        <I.Trash /> Kaldır
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
const view = (): View => stack()[stack().length - 1] ?? { kind: "home" };
const push = (v: View) => setStack([...stack(), v]);
const back = () => setStack(stack().slice(0, -1));
const replaceTop = (v: View) => setStack([...stack().slice(0, -1), v]);

/** Başka sayfadan (Yarışçılar) bir üyenin telemetrisini aç */
export function openDriverTelemetry(id: string) {
  go("telemetry", "overview");
  setCmpNote("");
  setStack([{ kind: "user", id }]);
}

const [cmpNote, setCmpNote] = createSignal("");

/** Arkadaş menüsü › "Telemetri kıyasla": ikimizin de aynı pistte (tercihen aynı araçla) izli en iyi turu varsa
 *  doğrudan tur analizini açar; yoksa üyenin telemetri profilini açıp nedenini yazar. */
export async function compareWithDriver(id: string) {
  openDriverTelemetry(id);
  setCmpNote("");
  const me = session()?.user.id;
  if (!me || me === id || proLocked(F.teleOthers)) return;
  try {
    const [mine, theirs] = await Promise.all([telemetryOverview(me), telemetryOverview(id)]);
    const a = (mine?.bests ?? []).filter((b) => b.has_trace);
    const b = (theirs?.bests ?? []).filter((x) => x.has_trace);
    let best: { my: string; their: string; score: number } | null = null;
    for (const t of b) {
      for (const m of a) {
        if (m.sim !== t.sim || m.track_id !== t.track_id || m.track_config !== t.track_config) continue;
        // Aynı araç önce; sonra en yeni sürülen
        const score = (m.car_id === t.car_id ? 1e15 : 0) + Math.max(Date.parse(t.driven_at) || 0, Date.parse(m.driven_at) || 0);
        if (!best || score > best.score) best = { my: m.lap_id, their: t.lap_id, score };
      }
    }
    const cur = view();
    if (cur.kind !== "user" || cur.id !== id) return; // bu arada başka yere geçildi
    if (best) push({ kind: "analysis", laps: [best.my, best.their] });
    else setCmpNote(t("Kıyaslanacak ortak pist bulunamadı: ikinizin de aynı pistte telemetri kaydı olan bir turu olmalı."));
  } catch {
    // profil açık kalır
  }
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
  const total = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t("{0} sa {1} dk", h.toLocaleString(localeTag()), m) : t("{0} dk", m);
};

/** İstatistik kutusu değeri: sayılar büyük, birimler ("sa", "dk") küçük yazılır; dar kutuya sığar */
function StatValue(p: { text: string }) {
  return (
    <b class="th-val" data-no-i18n>
      <For each={p.text.split(/([\d.,]+)/).filter((x) => x !== "")}>
        {(part) => (/^[\d.,]+$/.test(part) ? <>{part}</> : <span class="th-unit">{part.trim()}</span>)}
      </For>
    </b>
  );
}

/** Sınıf adı (eski kayıtlarda da): anlamsız iRacing sınıf adları gösterilmez, "GT3 Class" → "GT3" */
const classLabel = (cls: string | null | undefined, car: string | null | undefined) => {
  const c = (cls ?? "").trim();
  if (!c || /hosted|all cars/i.test(c) || /^\d+$/.test(c) || c.toLowerCase() === (car ?? "").trim().toLowerCase()) return "";
  return c.replace(/\s+class$/i, "").trim();
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
              karşılaştırabilirsin. Turların ve izlerin topluluğa açıktır; sıralamalarda ve topluluk kıyaslamalarında kullanılır.
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
          <div class="tele-topbar">
            <Show when={stack().length} fallback={<span />}>
              <button class="btn ghost small tele-back" onClick={back}>
                <I.ChevronLeft /> Geri
              </button>
            </Show>
            <span class="tele-topbar-r">
              <Show when={inTauri && view().kind === "home"}>
                <IbtImport />
              </Show>
              <ShareButton />
            </span>
          </div>
          <Show when={cmpNote() && view().kind === "user"}>
            <p class="muted small" onClick={() => setCmpNote("")}>
              {cmpNote()}
            </p>
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

// Tur kaydı her zaman açıktır ve turlar topluluğa açıktır (ayar yok); bekleyen turlar program açıkken kendiliğinden yüklenir.

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

/** Profil fotoğrafı (yoksa ""): önbellekte yoksa sunucudan istenir */
const avatarOf = (id: string) => (id ? friendLook(id).photo : "");

function OverviewView(p: { user?: string }) {
  const [data, { refetch }] = createResource(() => p.user ?? "me", (u) => telemetryOverview(u === "me" ? null : u));
  createEffect(() => {
    const id = data()?.profile.id;
    if (id && !avatarOf(id)) void loadAvatars([id]);
  });
  const isMe = () => !p.user || data()?.profile.is_me;
  return (
    <>
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
            <section class="panel tele-hero">
              <div class="th-top">
                <span class="th-avatar" classList={{ photo: !!avatarOf(d().profile.id) }} data-no-i18n>
                  <Show
                    when={avatarOf(d().profile.id)}
                    fallback={(d().profile.display_name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                  >
                    <img src={avatarOf(d().profile.id)} alt="" />
                  </Show>
                </span>
                <div class="th-who">
                  <small>{isMe() ? "Telemetrim" : "Telemetri"}</small>
                  <h3 data-no-i18n>{d().profile.display_name || "—"}</h3>
                  <div class="tele-ids">
                    <For each={d().identities}>
                      {(x) => (
                        <span class="tele-tag" title={x.sim_id ? t("Üye no {0}", x.sim_id) : undefined}>
                          <b>{SIM_LABEL[x.sim] ?? x.sim}</b> {x.sim_name}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
                <div class="th-sims">
                  <For each={d().sims}>
                    {(s) => (
                      <span class="th-sim">
                        <b>{s.laps}</b>
                        <small>{SIM_LABEL[s.sim] ?? s.sim}</small>
                      </span>
                    )}
                  </For>
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
                  <div class="th-stats">
                    <div class="th-stat accent">
                      <I.Flag />
                      <b>{d().totals!.laps.toLocaleString(localeTag())}</b>
                      <small>{t("Tur ({0} geçerli)", d().totals!.valid_laps)}</small>
                    </div>
                    <div class="th-stat">
                      <I.Layers />
                      <b>{d().totals!.sessions}</b>
                      <small>Oturum</small>
                    </div>
                    <div class="th-stat">
                      <I.Map />
                      <b>{Math.round(d().totals!.distance_km).toLocaleString(localeTag())}</b>
                      <small>km</small>
                    </div>
                    <div class="th-stat">
                      <I.Timer />
                      <StatValue text={fmtHours(d().totals!.drive_time)} />
                      <small>Sürüş süresi</small>
                    </div>
                    <div class="th-stat">
                      <I.Globe />
                      <b>{d().totals!.tracks}</b>
                      <small>Pist</small>
                    </div>
                    <div class="th-stat">
                      <I.Car />
                      <b>{d().totals!.cars}</b>
                      <small>Araç</small>
                    </div>
                    <div class="th-stat warn">
                      <I.TriangleAlert />
                      <b>{d().totals!.incidents}x</b>
                      <small>Olay</small>
                    </div>
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
                <th>Pist / araç</th>
                <th>Oturum</th>
                <th class="num">Tur</th>
                <th class="num">En iyi</th>
                <th class="num">Olay</th>
              </tr>
            </thead>
            <tbody>
              <For each={shown()}>
                {(s) => (
                  <tr class="click" onClick={() => push({ kind: "session", id: s.id })}>
                    <td class="nowrap tt-date">
                      {fmtDate(s.started_at)}
                      <small>{SIM_LABEL[s.sim] ?? s.sim}</small>
                    </td>
                    <td class="tt-track">
                      <b>{trackLabel(s)}</b>
                      <small>
                        {s.car_name}
                        <Show when={classLabel(s.car_class, s.car_name)}> · {classLabel(s.car_class, s.car_name)}</Show>
                      </small>
                    </td>
                    <td>
                      <span class={`sess-pill t-${typeOf(s)}`}>{t(SESSION_LABEL[s.session_type] ?? "Oturum")}</span>
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
                    <td class="num mono tt-best">{lapTime(s.best_lap)}</td>
                    <td class="num">{s.incidents ? `${s.incidents}x` : "—"}</td>
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
  // Görünüm: liste (varsayılan, çok pistte az yer kaplar) ya da kartlar; ayarlarda saklanır
  const [bestViewRaw, setBestView] = uiPref<"list" | "cards">("teleBestView", "list");
  const bestView = () => (bestViewRaw() === "cards" ? "cards" : "list");
  return (
    <Show when={p.bests.length}>
      <section class="panel">
        <div class="tele-head">
          <h3>Kişisel en iyiler</h3>
          <div class="tele-tools">
            <span class="muted small">{t("{0} pist / araç", p.bests.length)}</span>
            <div class="seg small">
              <button classList={{ on: bestView() === "list" }} onClick={() => setBestView("list")} title={t("Liste")}>
                Liste
              </button>
              <button classList={{ on: bestView() === "cards" }} onClick={() => setBestView("cards")} title={t("Kartlar")}>
                Kartlar
              </button>
            </div>
          </div>
        </div>
        <Show when={bestView() === "list"}>
          <div class="tele-scroll">
            <table class="tele-table best-list">
              <thead>
                <tr>
                  <th>Pist / araç</th>
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
                      <td class="tt-track">
                        <b>{trackLabel(b)}</b>
                        <small>
                          {SIM_LABEL[b.sim] ?? b.sim} · {b.car_name}
                          <Show when={classLabel(b.car_class, b.car_name)}> · {classLabel(b.car_class, b.car_name)}</Show>
                        </small>
                        <Show when={b.setup_name}>
                          <small class="tt-setup" title={t("Setup")}>
                            <I.Wrench /> <span data-no-i18n>{b.setup_name}</span>
                          </small>
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
                            push({ kind: "board", sim: b.sim, track_id: b.track_id, track_config: b.track_config, car_id: b.car_id, title: `${trackLabel(b)} · ${b.car_name}` })
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
        </Show>
        <div class="best-grid" hidden={bestView() !== "cards"}>
          <For each={p.bests}>
            {(b) => (
              <div class="best-card">
                <div class="bc-top">
                  <span class="bc-sim">{SIM_LABEL[b.sim] ?? b.sim}</span>
                  <span class="muted small">{fmtDate(b.driven_at, false)}</span>
                </div>
                <b class="bc-track">{trackLabel(b)}</b>
                <small class="bc-car">
                  {b.car_name}
                  <Show when={classLabel(b.car_class, b.car_name)}> · {classLabel(b.car_class, b.car_name)}</Show>
                </small>
                <Show when={b.setup_name}>
                  <small class="tt-setup bc-setup" title={t("Setup")}>
                    <I.Wrench /> <span data-no-i18n>{b.setup_name}</span>
                  </small>
                </Show>
                <div class="bc-time mono">{lapTime(b.lap_time)}</div>
                <small class="muted">{t("{0} tur", b.laps)}</small>
                <div class="bc-act">
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
                </div>
              </div>
            )}
          </For>
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
  createEffect(() => {
    const d = data();
    if (!d) return;
    const x = d.session;
    setSessionShare({
      id: p.id,
      owner: d.owner?.id ?? "",
      title: `${trackLabel(x)} · ${x.car_name}`,
      shapeOf: { sim: x.sim, track_id: x.track_id, track_name: x.track_name, track_config: x.track_config },
    });
  });
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
                      {classLabel(s().car_class, s().car_name) ? ` (${classLabel(s().car_class, s().car_name)})` : ""} · {t(SESSION_LABEL[s().session_type] ?? "Oturum")} · {fmtDate(s().started_at)}
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
                        <Show when={d().laps.some((l) => l.setup_name)}>
                          <th>Setup</th>
                        </Show>
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
                            <Show when={d().laps.some((x) => x.setup_name)}>
                              <td class="tt-setup-cell" title={l.setup_name ?? ""} data-no-i18n>
                                {l.setup_name || "—"}
                              </td>
                            </Show>
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
  const [cleanOnly, setCleanOnly] = createSignal(false);
  const [rows] = createResource(
    () => ({ ...p.v, all: allCars(), clean: cleanOnly() }),
    (x) => leaderboard(x, x.all ? null : x.car_id, 100, x.clean),
  );
  // Başka araçlarla tur atan yarışçılar (araç süzgeci açıkken bilgi satırı için)
  const [allRows] = createResource(
    () => (allCars() ? null : { ...p.v, clean: cleanOnly() }),
    (x) => leaderboard(x, null, 100, x.clean),
  );
  const otherCars = () => {
    const here = new Set((rows() ?? []).map((r) => r.user_id));
    return (allRows() ?? []).filter((r) => !here.has(r.user_id)).length;
  };
  const dirtyText = (r: BoardRow) =>
    [t("Temiz olmayan tur"), r.off_track ? t("pist dışı") : "", r.incidents ? `${r.incidents}x` : ""].filter(Boolean).join(" · ");
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
          <label class="chk" title="Kaza veya pist dışı olan turlar sayılmaz">
            <input type="checkbox" checked={cleanOnly()} onChange={(e) => setCleanOnly(e.currentTarget.checked)} /> Yalnızca temiz turlar
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
                    <Show when={r.clean === false}>
                      <span class="lap-dirty" title={dirtyText(r)}>
                        ⚠
                      </span>
                    </Show>
                  </td>
                  <For each={[0, 1, 2]}>{(i) => <td class="num mono">{r.sectors?.[i] > 0 ? r.sectors[i].toFixed(3) : "—"}</td>}</For>
                  <td class="nowrap">{fmtDate(r.driven_at, false)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={!allCars() && otherCars() > 0}>
        <p class="muted small">
          {t("Bu pistte başka araçlarla tur atan {0} yarışçı daha var.", otherCars())}{" "}
          <button class="link" onClick={() => setAllCars(true)}>
            Tüm araçları göster
          </button>
        </p>
      </Show>
      <p class="muted small">⚠ Kaza ya da pist dışı olan tur. Pistin tamamı ölçülemeyen turlar (sıfırlama, çekici) sıralamaya girmez.</p>
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
      setAnalysisSession(ordered[0]?.session_id);
      setAnalysisLaps(ordered);
      return Promise.all(ordered.map(async (info) => ({ info, trace: await loadTrace(info.trace_path) }) as Loaded));
    },
  );
  const [picker, setPicker] = createSignal(false);
  // İzler ile pist haritasının ortak imleci (tur oranı 0..1)
  const [cursorK, setCursorK] = createSignal<number | null>(null);
  const setLaps = (laps: string[]) => replaceTop({ kind: "analysis", laps });
  const first = () => data()?.[0]?.info;
  // Toplulukla kıyasla (PRO): bu pist ve araçta başkasına ait en hızlı izli tur B olarak eklenir
  const [community, setCommunity] = createSignal<"" | "loading" | "nodata">("");
  const addCommunity = async () => {
    const f = first();
    if (!f) return;
    setCommunity("loading");
    try {
      const r = await loadRef("best", { sim: f.sim, track_id: f.track_id, track_config: f.track_config, car_id: f.car_id }, { skipMe: true });
      if (r?.lapId && r.lapId !== f.id && !p.laps.includes(r.lapId)) {
        setCommunity("");
        setLaps([...p.laps, r.lapId].slice(0, MAX_COMPARE));
      } else setCommunity("nodata");
    } catch {
      setCommunity("nodata");
    }
  };
  return (
    <>
      <Show when={community() === "nodata"}>
        <p class="muted">Yeterli veri yok: bu pist ve araç için toplulukta izi paylaşılmış başka bir tur bulunamadı.</p>
      </Show>
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
                <div class="tele-tools">
                  <Show when={inTauri && list().some((x) => x.trace)}>
                    <button class="btn ghost small" title={t("Turların tüm kanallarını CSV dosyası olarak kaydet")} onClick={() => exportCsv(list())}>
                      <I.Download /> CSV
                    </button>
                  </Show>
                <Show when={list().length < MAX_COMPARE && first()}>
                    <button
                      class="btn small"
                      disabled={proLocked(F.teleCommunity) || community() === "loading"}
                      title={proLocked(F.teleCommunity) ? t("Toplulukla kıyaslama PRO üyelere özel") : t("Bu pist ve araçta topluluğun en hızlı (izi paylaşılmış) turunu B olarak ekler")}
                      onClick={addCommunity}
                    >
                      <I.Users /> Toplulukla kıyasla <span class="pro-badge small">PRO</span>
                    </button>
                    <button class="btn primary small" onClick={() => setPicker(!picker())}>
                      <I.Plus /> Karşılaştırılacak tur ekle
                    </button>
                </Show>
                </div>
              </div>
              <div class="lap-cards">
                <For each={list()}>
                  {(x, i) => (
                    <div class="lap-card" style={{ "--c": COLORS[i()] }}>
                      <i class="sw" />
                      <div>
                        <b>
                          {LETTERS[i()]} · {x.info.driver_name || x.info.display_name}
                        </b>
                        <small>
                          {x.info.car_name} · {t("Tur {0}", x.info.lap)} · {fmtDate(x.info.driven_at, false)}
                        </small>
                        <Show when={x.info.setup_name}>
                          <small class="tt-setup">
                            <I.Wrench /> <span data-no-i18n>{x.info.setup_name}</span>
                          </small>
                        </Show>
                      </div>
                      <span class="mono lap-time">
                        {lapTime(x.info.lap_time)}
                        <Show when={i() > 0}>
                          <small class="lap-diff" classList={{ bad: x.info.lap_time > list()[0].info.lap_time, good: x.info.lap_time < list()[0].info.lap_time }}>
                            {x.info.lap_time >= list()[0].info.lap_time ? "+" : "−"}
                            {Math.abs(x.info.lap_time - list()[0].info.lap_time).toFixed(3)}
                          </small>
                        </Show>
                      </span>
                      <Show when={list().length > 1}>
                        <button class="icon-btn small" title="Çıkar" onClick={() => setLaps(p.laps.filter((id) => id !== x.info.id))}>
                          <I.X />
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
              <Show when={list().length >= 2}>
                <SectorCompare laps={list().map((x) => x.info)} />
              </Show>
              <Show when={picker() && first()}>
                <LapPicker
                  base={first()!}
                  exclude={p.laps}
                  onPick={(id) => {
                    setPicker(false);
                    setLaps([...p.laps, id].slice(0, MAX_COMPARE));
                  }}
                />
              </Show>
            </section>
            <Show
              when={list().every((x) => x.trace)}
              fallback={<p class="muted">Bu turların izi bulunamadı (sadece oturumların en iyi turlarının izi saklanır).</p>}
            >
              <TeleMap base={list()[0] as { info: LapInfo; trace: Trace }} others={list().slice(1) as { info: LapInfo; trace: Trace }[]} cursor={cursorK()} />
              <CornerAnalysis laps={list()} setCursorK={setCursorK} />
              <RacingLine laps={list()} cursorK={cursorK()} setCursorK={setCursorK} />
              <TraceCharts laps={list()} cursorK={cursorK()} setCursorK={setCursorK} />
            </Show>
          </>
        )}
      </Show>
    </>
  );
}

function SectorCompare(p: { laps: LapInfo[] }) {
  const cell = (x?: number, y?: number) => {
    if (!(x! > 0) || !(y! > 0)) return "—";
    const d = y! - x!;
    return `${d >= 0 ? "+" : ""}${d.toFixed(3)}`;
  };
  const tone = (x?: number, y?: number) => (!(x! > 0) || !(y! > 0) ? "" : y! - x! > 0.0005 ? "bad" : y! - x! < -0.0005 ? "good" : "");
  const a = () => p.laps[0];
  const setups = () => p.laps.some((l) => l.setup_name);
  // Sektörlerin en hızlısı (mor): kıyaslanan turlar arasında
  const best = (i: number) => Math.min(...p.laps.map((l) => (l.sectors?.[i]! > 0 ? l.sectors![i] : Infinity)));
  return (
    <table class="tele-table compact sector-cmp">
      <thead>
        <tr>
          <th />
          <th class="num">S1</th>
          <th class="num">S2</th>
          <th class="num">S3</th>
          <th class="num">Tur</th>
          <Show when={setups()}>
            <th>Setup</th>
          </Show>
        </tr>
      </thead>
      <tbody>
        <For each={p.laps}>
          {(l, k) => (
            <>
              <tr>
                <td>
                  <i class="sc-dot" style={{ background: COLORS[k()] }} /> {LETTERS[k()]}
                </td>
                <For each={[0, 1, 2]}>
                  {(i) => (
                    <td class="num mono" classList={{ purple: p.laps.length > 1 && l.sectors?.[i]! > 0 && Math.abs(l.sectors![i] - best(i)) < 1e-4 }}>
                      {l.sectors?.[i]?.toFixed(3) ?? "—"}
                    </td>
                  )}
                </For>
                <td class="num mono">{lapTime(l.lap_time)}</td>
                <Show when={setups()}>
                  <td class="tt-setup-cell" title={l.setup_name ?? ""} data-no-i18n>
                    {l.setup_name || "—"}
                  </td>
                </Show>
              </tr>
              <Show when={k() > 0}>
                <tr class="diff">
                  <td data-no-i18n>{`${LETTERS[k()]} − A`}</td>
                  <For each={[0, 1, 2]}>{(i) => <td class={`num mono ${tone(a().sectors?.[i], l.sectors?.[i])}`}>{cell(a().sectors?.[i], l.sectors?.[i])}</td>}</For>
                  <td class={`num mono ${tone(a().lap_time, l.lap_time)}`}>{cell(a().lap_time, l.lap_time)}</td>
                  <Show when={setups()}>
                    <td class="muted small">{!l.setup_name || !a().setup_name ? "" : l.setup_name === a().setup_name ? t("Aynı setup") : t("Farklı setup")}</td>
                  </Show>
                </tr>
              </Show>
            </>
          )}
        </For>
      </tbody>
    </table>
  );
}

/** Koçluk notunun sebebini cümleye çevirir */
function reasonText(r: CoachReason): string {
  switch (r.kind) {
    case "brakeEarly":
      return t("Referanstan {0} m önce frene basıyorsun", Math.round(r.m));
    case "brakeLate":
      return t("{0} m geç frenleyip viraja fazla hızlı giriyorsun; viraj içinde {1} km/h yavaş kalıyorsun", Math.round(r.m), r.slower.toFixed(0));
    case "minSpeed":
      return t("Viraj içinde (en düşük hız) {0} km/h yavaşsın", r.kmh.toFixed(0));
    case "throttleLate":
      return t("Tam gaza {0} m geç geçiyorsun", Math.round(r.m));
    case "exitSpeed":
      return t("Çıkışta {0} km/h yavaşsın", r.kmh.toFixed(0));
    case "gear":
      return t("Virajda {0}. viteste kalıyorsun, referans {1}. viteste", r.mine, r.ref);
  }
}

/**
 * Viraj analizi (Garage61 / Track Titan tarzı): teorik en iyi tur (kıyaslanan turların en hızlı mikro sektörleri),
 * A'nın seçilen referansa göre en çok süre kaybettiği virajlar ve nedenleri, viraj viraj tablo (fren noktası, giriş /
 * en düşük / çıkış hızı, tam gaz noktası, süre farkı). Satıra tıklayınca grafiklerde ve haritada o viraja gidilir.
 */
function CornerAnalysis(p: { laps: Loaded[]; setCursorK: (k: number | null) => void }) {
  const [refI, setRefI] = createSignal(1);
  const ready = () => p.laps.filter((x) => x.trace);
  const len = () => p.laps[0]?.info.track_length_km ?? 0;
  const stats = createMemo(() => (ready().length === p.laps.length ? analyzeCorners(p.laps.map((x) => x.trace!), len()) : []));
  const ref = () => (p.laps.length > 1 ? Math.min(Math.max(1, refI()), p.laps.length - 1) : -1);
  const notes = createMemo(() => (ref() > 0 && stats().length ? coachNotes(stats(), 0, ref()) : null));
  const theo = createMemo(() => (p.laps.length > 1 && ready().length === p.laps.length ? theoreticalBest(p.laps.map((x) => x.trace!), p.laps.map((x) => x.info.lap_time)) : null));
  const m = (v: number | null) => (v == null ? "—" : `${Math.round(v)}`);
  const v0 = (v: number) => v.toFixed(0);
  const sgn = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
  return (
    <Show when={stats().length}>
      <section class="panel ca">
        <div class="tele-head">
          <div>
            <h3>Viraj analizi</h3>
            <p class="muted small">
              {p.laps.length > 1 ? t("A turu, seçilen referansa göre. Satıra tıklayınca grafiklerde ve haritada o viraja gidilir.") : t("Kıyaslamak için tur ekle: fren noktaları, viraj hızları ve koçluk notları referansa göre çıkar.")}
            </p>
          </div>
          <Show when={p.laps.length > 2}>
            <label class="tmap-f">
              <span>Referans</span>
              <select value={String(ref())} onChange={(e) => setRefI(Number(e.currentTarget.value))}>
                <For each={p.laps.slice(1)}>
                  {(x, i) => (
                    <option value={String(i() + 1)}>
                      {LETTERS[i() + 1]} · {x.info.driver_name || x.info.display_name} · {lapTime(x.info.lap_time)}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
        </div>

        <Show when={theo()}>
          {(th) => (
            <div class="ca-theo">
              <div>
                <small>Teorik en iyi tur</small>
                <b class="mono">{lapTime(th().time)}</b>
                <small class="muted">{t("{0} mikro sektörün en hızlıları", th().parts)}</small>
              </div>
              <For each={p.laps}>
                {(_x, i) => (
                  <div>
                    <small>
                      <i class="sc-dot" style={{ background: COLORS[i()] }} /> {t("{0} potansiyeli", LETTERS[i()])}
                    </small>
                    <b class="mono" classList={{ good: th().gap[i()] < 0.01 }}>
                      {th().gap[i()] < 0.01 ? "—" : `−${th().gap[i()].toFixed(3)}`}
                    </b>
                    <small class="muted">{t("{0} mikro sektör en hızlı", th().owner.filter((o) => o === i()).length)}</small>
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>

        <Show when={notes()}>
          {(nt) => (
            <div class="ca-notes">
              <Show when={nt().losses.length} fallback={<p class="muted small">{t("A bu referansa göre hiçbir virajda belirgin süre kaybetmiyor.")}</p>}>
                <For each={nt().losses}>
                  {(n, i) => (
                    <button class="ca-note" onClick={() => p.setCursorK(n.apexPct)}>
                      <span class="ca-rank">{i() + 1}</span>
                      <div>
                        <b>
                          {t("Viraj {0}", n.corner)} · <span class="bad">{t("{0} sn kayıp", n.delta.toFixed(2))}</span>
                        </b>
                        <Show when={n.reasons.length} fallback={<small class="muted">{t("Belirgin tek bir neden yok: virajın tamamında biraz yavaşsın.")}</small>}>
                          <ul>
                            <For each={n.reasons}>{(r) => <li>{reasonText(r)}</li>}</For>
                          </ul>
                        </Show>
                      </div>
                    </button>
                  )}
                </For>
              </Show>
              <Show when={nt().best}>
                {(b) => (
                  <p class="ca-best">
                    <I.Check /> {t("En güçlü virajın: Viraj {0} ({1} sn kazanç)", b().corner, Math.abs(b().delta).toFixed(2))}
                  </p>
                )}
              </Show>
            </div>
          )}
        </Show>

        <div class="tele-scroll">
          <table class="tele-table compact ca-table">
            <thead>
              <tr>
                <th>Viraj</th>
                <th class="num">Konum</th>
                <th class="num">Fren (m)</th>
                <th class="num">Giriş</th>
                <th class="num">En düşük</th>
                <th class="num">Çıkış</th>
                <th class="num">Tam gaz (m)</th>
                <th class="num">Vites</th>
                <Show when={ref() > 0}>
                  <th class="num">Fark</th>
                </Show>
              </tr>
            </thead>
            <tbody>
              <For each={stats()}>
                {(c) => {
                  const a = () => c.laps[0];
                  const r = () => (ref() > 0 ? c.laps[ref()] : null);
                  const two = (x: string, y: string | null) => (y == null ? x : `${x} / ${y}`);
                  const d = () => (r() ? a().time - r()!.time : 0);
                  return (
                    <tr class="click" onClick={() => p.setCursorK(c.apexPct)}>
                      <td>
                        <b>V{c.n}</b>
                      </td>
                      <td class="num mono">{Math.round(c.apexM)} m</td>
                      <td class="num mono">{two(m(a().brakeAt), r() ? m(r()!.brakeAt) : null)}</td>
                      <td class="num mono">{two(v0(a().entrySpeed), r() ? v0(r()!.entrySpeed) : null)}</td>
                      <td class="num mono" classList={{ bad: !!r() && a().minSpeed < r()!.minSpeed - 2, good: !!r() && a().minSpeed > r()!.minSpeed + 2 }}>
                        {two(v0(a().minSpeed), r() ? v0(r()!.minSpeed) : null)}
                      </td>
                      <td class="num mono" classList={{ bad: !!r() && a().exitSpeed < r()!.exitSpeed - 3, good: !!r() && a().exitSpeed > r()!.exitSpeed + 3 }}>
                        {two(v0(a().exitSpeed), r() ? v0(r()!.exitSpeed) : null)}
                      </td>
                      <td class="num mono">{two(m(a().throttleAt), r() ? m(r()!.throttleAt) : null)}</td>
                      <td class="num mono">{two(a().minGear == null ? "—" : String(a().minGear), r() ? (r()!.minGear == null ? "—" : String(r()!.minGear)) : null)}</td>
                      <Show when={r()}>
                        <td class={`num mono ${d() > 0.02 ? "bad" : d() < -0.02 ? "good" : ""}`}>{sgn(d())}</td>
                      </Show>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={ref() > 0}>
          <p class="muted small">{t("Değerler: A / referans. Hızlar km/h; fren ve tam gaz noktaları tur başından metre. Fark: A'nın o virajdaki süresi eksi referansınki (+ yavaş).")}</p>
        </Show>
      </section>
    </Show>
  );
}

/** Telemetri: iRacing telemetri dosyalarını (.ibt) içe aktar (Rust: ibt.rs). Turlar canlı turlar gibi yüklenir. */
function IbtImport() {
  const [busy, setBusy] = createSignal(false);
  const [res, setRes] = createSignal<{ file: string; track: string; car: string; laps: number; withLine: number; error?: string | null }[] | null>(null);
  const run = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await invoke<string>("ibt_default_dir").catch(() => "");
      const sel = await open({ multiple: true, directory: false, defaultPath: dir || undefined, filters: [{ name: "iRacing telemetry (.ibt)", extensions: ["ibt"] }] });
      const paths = (Array.isArray(sel) ? sel : sel ? [sel] : []).map(String);
      if (!paths.length) return;
      setBusy(true);
      setRes(await invoke("ibt_import", { paths }));
    } catch (e) {
      setRes([{ file: "", track: "", car: "", laps: 0, withLine: 0, error: errText(e) }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button class="btn ghost small" disabled={busy()} onClick={run} title={t("iRacing'in kaydettiği telemetri dosyalarını (.ibt) içe aktar: turlar, izler ve sürüş çizgisi telemetrine eklenir")}>
        <I.Upload /> {busy() ? t("İçe aktarılıyor…") : t(".ibt içe aktar")}
      </button>
      <Show when={res()}>
        <div class="modal-back" onClick={(e) => e.target === e.currentTarget && setRes(null)}>
          <div class="modal tele-shares">
            <header>
              <h3>iRacing telemetri dosyaları</h3>
              <button class="btn ghost small" onClick={() => setRes(null)} title="Kapat">
                <I.X />
              </button>
            </header>
            <table class="tele-table compact">
              <tbody>
                <For each={res()!}>
                  {(r) => (
                    <tr>
                      <td>
                        <b data-no-i18n>{r.file || "—"}</b>
                        <br />
                        <small class="muted" data-no-i18n>
                          {[r.track, r.car].filter(Boolean).join(" · ")}
                        </small>
                      </td>
                      <td class="nowrap">
                        <Show when={!r.error} fallback={<span class="error">{r.error}</span>}>
                          {t("{0} tur", r.laps)}
                          <Show when={r.withLine > 0}>
                            <small class="muted"> · {t("sürüş çizgili")}</small>
                          </Show>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <p class="muted small">
              {t("Turlar yükleme kuyruğuna eklendi; birkaç saniye içinde telemetrinde görünür. Her oturumun en iyi turunun izi saklanır. Aynı dosyayı yeniden içe aktarmak kopya oluşturmaz.")}
            </p>
            <p class="muted small">{t("iRacing'de telemetri kaydını açmak için: Seçenekler › Telemetri kaydı (ya da sürerken Alt+L). Dosyalar Belgeler › iRacing › telemetry klasörüne yazılır.")}</p>
          </div>
        </div>
      </Show>
    </>
  );
}

/** Turları CSV olarak dışa aktar: mesafe sırasıyla her turun bütün kanalları */
async function exportCsv(laps: Loaded[]) {
  const withTrace = laps.filter((x) => x.trace);
  if (!withTrace.length) return;
  const n = withTrace[0].trace!.t.length;
  const lenM = (laps[0].info.track_length_km || 0) * 1000;
  const cols: { key: string; pick: (t: Trace) => number[] | undefined; k?: number }[] = [
    { key: "time_s", pick: (t) => t.t, k: 0.001 },
    { key: "speed_kmh", pick: (t) => t.speed, k: 0.1 },
    { key: "throttle_pct", pick: (t) => t.throttle },
    { key: "brake_pct", pick: (t) => t.brake },
    { key: "gear", pick: (t) => t.gear },
    { key: "steer_deg", pick: (t) => t.steer },
    { key: "rpm", pick: (t) => t.rpm },
    { key: "lat_g", pick: (t) => t.lat_g, k: 0.01 },
    { key: "long_g", pick: (t) => t.long_g, k: 0.01 },
    { key: "abs", pick: (t) => t.abs },
    { key: "lat", pick: (t) => t.lat, k: 1e-6 },
    { key: "lon", pick: (t) => t.lon, k: 1e-6 },
  ];
  const used = cols.filter((c) => withTrace.some((x) => (c.pick(x.trace!)?.length ?? 0) > 1));
  const head = ["distance_m", "lap_pct", ...withTrace.flatMap((_x, i) => used.map((c) => `${LETTERS[i]}_${c.key}`))];
  const series = withTrace.map((x) => used.map((c) => resampleTo(c.pick(x.trace!) ?? [], n).map((v) => v * (c.k ?? 1))));
  const lines = [head.join(",")];
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const row = [lenM > 0 ? (k * lenM).toFixed(1) : "", k.toFixed(4)];
    series.forEach((s) => s.forEach((col) => row.push(col.length ? String(Math.round(col[i] * 1e6) / 1e6) : "")));
    lines.push(row.join(","));
  }
  // Başlıkta turların kimliği
  const meta = withTrace.map((x, i) => `# ${LETTERS[i]}: ${x.info.driver_name || x.info.display_name} · ${trackLabel(x.info)} · ${x.info.car_name} · ${t("Tur {0}", x.info.lap)} · ${lapTime(x.info.lap_time)}`);
  const text = [...meta, ...lines].join("\n");
  const { save } = await import("@tauri-apps/plugin-dialog");
  const name = `${trackLabel(laps[0].info)}-${laps[0].info.car_name}`.replace(/[^\w\-]+/g, "_").slice(0, 80) + ".csv";
  const path = await save({ defaultPath: name, filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (path) await invoke("events_export", { path, text });
}

/**
 * Sürüş çizgisi: .ibt'den içe aktarılan turlarda konum (Lat / Lon) vardır; turların çizgileri üst üste çizilir.
 * Tekerlek: yakınlaş, sürükle: kaydır, çift tık: sıfırla. Ortak imleç her turun o mesafedeki yerini gösterir; A ile
 * diğer turların çizgisi arasındaki uzaklık (m) okunur.
 */
function RacingLine(p: { laps: Loaded[]; cursorK: number | null; setCursorK: (k: number | null) => void }) {
  const LW = 900;
  const LH = 560;
  const lines = createMemo(() => {
    const list = p.laps.map((x, i) => ({ i, lat: x.trace?.lat, lon: x.trace?.lon })).filter((x) => (x.lat?.length ?? 0) > 10 && x.lat!.length === x.lon!.length);
    if (!list.length) return null;
    // Yerel düzlem (metre): ilk turun ortası merkez
    const f = list[0];
    const lat0 = f.lat!.reduce((a, b) => a + b, 0) / f.lat!.length / 1e6;
    const lon0 = f.lon!.reduce((a, b) => a + b, 0) / f.lon!.length / 1e6;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
    const ky = 110540;
    const pts = list.map((x) => ({ i: x.i, xy: x.lat!.map((la, j) => [(x.lon![j] / 1e6 - lon0) * kx, -(la / 1e6 - lat0) * ky] as [number, number]) }));
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const q of pts)
      for (const [x, y] of q.xy) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    return { pts, box: { x: minX - 30, y: minY - 30, w: maxX - minX + 60, h: maxY - minY + 60 } };
  });
  const [vb, setVb] = createSignal<{ x: number; y: number; w: number; h: number } | null>(null);
  createEffect(() => {
    const l = lines();
    if (!l) return;
    // Pistin oranına göre görünüm
    const b = l.box;
    const r = LW / LH;
    const w = Math.max(b.w, b.h * r);
    const h = w / r;
    setVb({ x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h });
  });
  let svg!: SVGSVGElement;
  const toSvg = (e: PointerEvent | WheelEvent) => {
    const ctm = svg.getScreenCTM();
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const v = vb();
    const pt = toSvg(e);
    if (!v || !pt) return;
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    const w = Math.min(lines()!.box.w * 3, Math.max(20, v.w * f));
    const h = (w * v.h) / v.w;
    setVb({ x: pt.x - ((pt.x - v.x) * w) / v.w, y: pt.y - ((pt.y - v.y) * h) / v.h, w, h });
  };
  let pan: { x: number; y: number; v: { x: number; y: number; w: number; h: number } } | null = null;
  const down = (e: PointerEvent) => {
    const v = vb();
    if (!v || e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    pan = { x: e.clientX, y: e.clientY, v };
  };
  const move = (e: PointerEvent) => {
    const l = lines();
    if (!l) return;
    if (pan) {
      const r = svg.getBoundingClientRect();
      const s = pan.v.w / r.width;
      setVb({ ...pan.v, x: pan.v.x - (e.clientX - pan.x) * s, y: pan.v.y - (e.clientY - pan.y) * s });
      return;
    }
    // İmleç: A'nın çizgisinde en yakın nokta
    const pt = toSvg(e);
    const a = l.pts[0];
    if (!pt) return;
    let best = 0;
    let bd = Infinity;
    a.xy.forEach(([x, y], j) => {
      const d = (x - pt.x) ** 2 + (y - pt.y) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    const tol = (vb()?.w ?? 100) / 25;
    p.setCursorK(bd > tol * tol ? null : best / Math.max(1, a.xy.length - 1));
  };
  const at = (xy: [number, number][], k: number) => xy[Math.min(xy.length - 1, Math.max(0, Math.round(k * (xy.length - 1))))];
  /** İmleçte A ile diğer turların çizgileri arası uzaklık (m) */
  const gaps = () => {
    const l = lines();
    const k = p.cursorK;
    if (!l || k == null || l.pts.length < 2) return [];
    const a = at(l.pts[0].xy, k);
    return l.pts.slice(1).map((q) => {
      const b = at(q.xy, k);
      return { i: q.i, m: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    });
  };
  const path = (xy: [number, number][]) => "M" + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
  const sw = () => (vb()?.w ?? 1000) / 450;
  return (
    <Show when={lines()}>
      <section class="panel rline">
        <div class="tele-head">
          <div>
            <h3>Sürüş çizgisi</h3>
            <p class="muted small">{t("Tekerlek: yakınlaş · Sürükle: kaydır · Çift tık: sıfırla. Çizgilerin üzerinde gezinince grafiklerdeki imleç de oraya gider.")}</p>
          </div>
          <Show when={gaps().length}>
            <div class="rline-gaps">
              <For each={gaps()}>
                {(g) => (
                  <span>
                    <i class="sc-dot" style={{ background: COLORS[g.i] }} /> {t("{0} çizgisi A'dan {1} m", LETTERS[g.i], g.m.toFixed(1))}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
        <Show when={p.laps.some((x) => !(x.trace?.lat?.length))}>
          <p class="muted small">{t("Sürüş çizgisi yalnızca .ibt dosyasından içe aktarılan turlarda var (canlı veride konum yok).")}</p>
        </Show>
        <svg
          ref={svg}
          class="rline-svg"
          viewBox={vb() ? `${vb()!.x} ${vb()!.y} ${vb()!.w} ${vb()!.h}` : "0 0 1 1"}
          onWheel={wheel}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (pan = null)}
          onPointerLeave={() => {
            pan = null;
            p.setCursorK(null);
          }}
          onDblClick={() => createEffectReset()}
        >
          <For each={[...lines()!.pts].reverse()}>{(q) => <path d={path(q.xy)} fill="none" stroke={COLORS[q.i]} stroke-width={sw() * (q.i === 0 ? 1.6 : 1.2)} stroke-linejoin="round" opacity={q.i === 0 ? 1 : 0.85} />}</For>
          <Show when={p.cursorK != null}>
            <For each={lines()!.pts}>
              {(q) => {
                const c = () => at(q.xy, p.cursorK!);
                return <circle cx={c()[0]} cy={c()[1]} r={sw() * 3.2} fill={COLORS[q.i]} stroke="#0b0d12" stroke-width={sw()} />;
              }}
            </For>
          </Show>
        </svg>
      </section>
    </Show>
  );
  function createEffectReset() {
    const l = lines();
    if (!l) return;
    const b = l.box;
    const r = LW / LH;
    const w = Math.max(b.w, b.h * r);
    const h = w / r;
    setVb({ x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h });
  }
}

function LapPicker(p: { base: LapInfo; exclude: string[]; onPick: (id: string) => void }) {
  const [tab, setTab] = createSignal<"mine" | "others">("mine");
  const combo = () => ({ sim: p.base.sim, track_id: p.base.track_id, track_config: p.base.track_config, car_id: p.base.car_id });
  const [mine] = createResource(() => (tab() === "mine" ? combo() : null), (c) => comboLaps(c));
  const [others] = createResource(() => (tab() === "others" ? combo() : null), (c) => leaderboard(c, c.car_id, 50, true));
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
                    <td class="tt-setup-cell" title={l.setup_name ?? ""} data-no-i18n>
                      {l.setup_name || ""}
                    </td>
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

/** Görünür aralık (tur oranı 0..1) */
type Zoom = { a: number; b: number };

function ChartPanel(p: {
  title: string;
  series: SeriesDef[];
  height: number;
  min?: number;
  max?: number;
  step?: boolean;
  zero?: boolean;
  fmt: (v: number) => string;
  /** Ortak imleç (tur oranı) */
  cursorK: number | null;
  setCursorK: (k: number | null) => void;
  zoom: Zoom;
  setZoom: (z: Zoom) => void;
}) {
  // Görünür aralıktaki değerler (her seri kendi uzunluğuna göre kesilir)
  const view = createMemo(() =>
    p.series.map((s) => {
      const n = s.values.length;
      const i0 = Math.max(0, Math.floor(p.zoom.a * (n - 1)));
      const i1 = Math.min(n - 1, Math.ceil(p.zoom.b * (n - 1)));
      return { ...s, values: s.values.slice(i0, i1 + 1) };
    }),
  );
  const range = createMemo(() => {
    const all = view().flatMap((s) => s.values);
    let lo = p.min ?? Math.min(...all);
    let hi = p.max ?? Math.max(...all);
    if (p.zero) {
      const m = Math.max(Math.abs(lo), Math.abs(hi), 0.05);
      lo = -m;
      hi = m;
    }
    return { lo, hi: hi === lo ? lo + 1 : hi };
  });
  const span = () => Math.max(1e-6, p.zoom.b - p.zoom.a);
  /** Ekran x oranı (0..1) ↔ tur oranı */
  const toK = (x: number) => p.zoom.a + x * span();
  const toX = (k: number) => (k - p.zoom.a) / span();
  let box!: HTMLDivElement;
  const xOf = (e: PointerEvent | WheelEvent) => {
    const r = box.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
  };
  // Sürükleyerek bölge seç (yakınlaştır)
  const [drag, setDrag] = createSignal<{ x0: number; x1: number } | null>(null);
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    box.setPointerCapture(e.pointerId);
    const x = xOf(e);
    setDrag({ x0: x, x1: x });
  };
  const move = (e: PointerEvent) => {
    const x = xOf(e);
    p.setCursorK(toK(x));
    const d = drag();
    if (d) setDrag({ ...d, x1: x });
  };
  const up = () => {
    const d = drag();
    setDrag(null);
    if (!d || Math.abs(d.x1 - d.x0) < 0.02) return;
    const a = toK(Math.min(d.x0, d.x1));
    const b = toK(Math.max(d.x0, d.x1));
    if (b - a > 0.004) p.setZoom({ a, b });
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = toK(xOf(e));
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    const w = Math.min(1, Math.max(0.01, span() * f));
    let a = k - (k - p.zoom.a) * (w / span());
    a = Math.min(Math.max(0, a), 1 - w);
    p.setZoom({ a, b: a + w });
  };
  const zeroY = () => {
    const { lo, hi } = range();
    return p.height - 4 - ((0 - lo) / (hi - lo)) * (p.height - 8);
  };
  const valAt = (s: SeriesDef) => {
    const k = p.cursorK;
    if (k == null) return "—";
    const n = s.values.length;
    return p.fmt(s.values[Math.min(n - 1, Math.max(0, Math.round(k * (n - 1))))] ?? 0);
  };
  const cursorX = () => (p.cursorK == null ? null : toX(p.cursorK));
  /** İmleçteki değerler çizginin üstünde: her serinin noktası ve değeri (etiketler üst üste binmesin diye aralanır) */
  const marks = createMemo(() => {
    const k = p.cursorK;
    const x = cursorX();
    if (k == null || x == null || x < 0 || x > 1) return [];
    const { lo, hi } = range();
    const h = p.height;
    const many = p.series.length > 1;
    // Birim başlıktan: "Gaz (%)" -> "%", "Hız (km/h)" -> " km/h" (uzun açıklamalı başlıklarda birim yazılmaz)
    const u = /\(([^(),;]{1,5})\)\s*$/.exec(p.title)?.[1] ?? "";
    const unit = u === "%" ? "%" : u ? ` ${u}` : "";
    const out = p.series.map((s, i) => {
      const n = s.values.length;
      const v = s.values[Math.min(n - 1, Math.max(0, Math.round(k * (n - 1))))] ?? 0;
      const y = Math.min(h - 4, Math.max(4, h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8)));
      return { i, y, ly: y, color: s.color, text: (many ? `${s.label} ` : "") + p.fmt(v) + unit };
    });
    // Etiket yerleşimi: yukarıdan aşağı sıralı, en az 15 px aralık, grafiğin içinde
    const GAP = 15;
    const sorted = [...out].sort((a, b) => a.y - b.y);
    for (let j = 0; j < sorted.length; j++) {
      sorted[j].ly = Math.max(sorted[j].y, j > 0 ? sorted[j - 1].ly + GAP : 8);
    }
    const over = sorted.length ? sorted[sorted.length - 1].ly - (h - 8) : 0;
    if (over > 0) for (const m of sorted) m.ly = Math.max(8, m.ly - over);
    return out;
  });
  return (
    <div class="tchart">
      <div class="tchart-head">
        <b>{p.title}</b>
        <span class="tchart-read">
          <For each={p.series}>
            {(s) => (
              <span>
                <i style={{ background: s.color }} />
                {s.label} <b class="mono">{valAt(s)}</b>
              </span>
            )}
          </For>
        </span>
      </div>
      <div
        class="tchart-plot"
        ref={box}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => !drag() && p.setCursorK(null)}
        onWheel={wheel}
        onDblClick={() => p.setZoom({ a: 0, b: 1 })}
        style={{ height: `${p.height}px` }}
        title={t("Sürükle: yakınlaştır · Tekerlek: yakınlaş / uzaklaş · Çift tık: sıfırla")}
      >
        <svg viewBox={`0 0 ${W} ${p.height}`} preserveAspectRatio="none" width="100%" height={p.height}>
          <line x1="0" x2={W} y1={p.height / 2} y2={p.height / 2} class="grid" vector-effect="non-scaling-stroke" />
          <Show when={p.zero}>
            <line x1="0" x2={W} y1={zeroY()} y2={zeroY()} class="zero" vector-effect="non-scaling-stroke" />
          </Show>
          <For each={view()}>
            {(s) => <path d={linePath(s.values, range().lo, range().hi, p.height, p.step)} stroke={s.color} class="ln" vector-effect="non-scaling-stroke" />}
          </For>
        </svg>
        <span class="tchart-axis top">{p.fmt(range().hi)}</span>
        <span class="tchart-axis bottom">{p.fmt(range().lo)}</span>
        <Show when={drag() && Math.abs(drag()!.x1 - drag()!.x0) > 0.005}>
          <i class="tchart-sel" style={{ left: `${Math.min(drag()!.x0, drag()!.x1) * 100}%`, width: `${Math.abs(drag()!.x1 - drag()!.x0) * 100}%` }} />
        </Show>
        <Show when={cursorX() != null && cursorX()! >= 0 && cursorX()! <= 1}>
          <i class="tchart-cursor" style={{ left: `${cursorX()! * 100}%` }} />
          <For each={marks()}>
            {(m) => (
              <>
                <i class="tchart-dot" style={{ left: `${cursorX()! * 100}%`, top: `${m.y}px`, background: m.color }} />
                <span
                  class="tchart-tip mono"
                  classList={{ flip: cursorX()! > 0.78 }}
                  style={{ left: `${cursorX()! * 100}%`, top: `${m.ly}px`, "border-color": m.color, color: m.color }}
                >
                  {m.text}
                </span>
              </>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

/** Grafik kanalları: kimlik, başlık, varsayılan açık mı */
const CHANNELS: { id: string; label: string; on: boolean }[] = [
  { id: "delta", label: "Fark", on: true },
  { id: "speed", label: "Hız", on: true },
  { id: "throttle", label: "Gaz", on: true },
  { id: "brake", label: "Fren", on: true },
  { id: "gear", label: "Vites", on: true },
  { id: "steer", label: "Direksiyon", on: true },
  { id: "rpm", label: "Devir", on: false },
  { id: "latg", label: "Yanal G", on: false },
  { id: "longg", label: "Boyuna G", on: false },
  { id: "abs", label: "ABS", on: false },
];

function TraceCharts(p: { laps: Loaded[]; cursorK: number | null; setCursorK: (k: number | null) => void }) {
  const [zoom, setZoom] = createSignal<Zoom>({ a: 0, b: 1 });
  const [chans, setChans] = uiPref<string[]>("tele.channels", CHANNELS.filter((c) => c.on).map((c) => c.id));
  const on = (id: string) => chans().includes(id);
  const toggle = (id: string) => setChans(on(id) ? chans().filter((x) => x !== id) : [...chans(), id]);
  const len = () => p.laps[0]?.info.track_length_km ?? 0;
  const n = () => p.laps[0]?.trace?.t.length ?? 0;
  /** Kanal verisi olan turlar (ek kanallar eski kayıtlarda yok) */
  const mk = (pick: (t: Trace) => number[] | undefined, scale = 1): SeriesDef[] =>
    p.laps
      .map((x, i) => ({ x, i, v: pick(x.trace!) }))
      .filter((o) => o.v && o.v.length > 1)
      .map((o) => ({ label: LETTERS[o.i], color: COLORS[o.i], values: o.v!.map((v) => v * scale) }));
  const has = (pick: (t: Trace) => number[] | undefined) => p.laps.some((x) => (pick(x.trace!)?.length ?? 0) > 1);
  const pos = () => {
    const c = p.cursorK;
    if (c == null || !n()) return "";
    return len() > 0 ? `${Math.round(c * len() * 1000)} m` : `%${Math.round(c * 100)}`;
  };
  const delta = createMemo(() =>
    p.laps.length >= 2 ? p.laps.slice(1).map((x, i) => ({ label: `${LETTERS[i + 1]}−A`, color: COLORS[i + 1], values: deltaSeries(p.laps[0].trace!, x.trace!) })) : null,
  );
  // Klavye: imleci oklarla gezdir
  const key = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const step = 1 / Math.max(1, n() - 1);
    const c = p.cursorK ?? zoom().a;
    p.setCursorK(Math.min(Math.max(c + (e.key === "ArrowLeft" ? -step : step), 0), 1));
  };
  onMount(() => window.addEventListener("keydown", key));
  onCleanup(() => window.removeEventListener("keydown", key));
  const common = () => ({ cursorK: p.cursorK, setCursorK: p.setCursorK, zoom: zoom(), setZoom });
  const zoomed = () => zoom().a > 0.0005 || zoom().b < 0.9995;
  return (
    <section class="panel tcharts">
      <div class="tele-head">
        <h3>İzler</h3>
        <span class="muted small">{pos() ? t("Konum: {0}", pos()) : t("Değerleri görmek için grafiğin üzerine gel; sürükleyerek yakınlaştır")}</span>
      </div>
      <div class="tchart-tools">
        <For each={CHANNELS}>
          {(c) => (
            <Show when={c.id !== "delta" || p.laps.length >= 2}>
              <button class="chip-btn" classList={{ on: on(c.id), dim: !["delta", "speed", "throttle", "brake", "gear", "steer"].includes(c.id) && !has(chanPick(c.id)) }} onClick={() => toggle(c.id)}>
                {t(c.label)}
              </button>
            </Show>
          )}
        </For>
        <Show when={zoomed()}>
          <button class="btn ghost small" onClick={() => setZoom({ a: 0, b: 1 })}>
            <I.ZoomOut /> {t("Tüm tur")}
          </button>
        </Show>
      </div>
      <div class="tcharts-body">
      <div class="tcharts-list">
      <Show when={on("delta") && delta()}>
        <ChartPanel
          title={p.laps.length > 2 ? "Fark (A'ya göre, sn; + daha yavaş)" : "Fark (B − A, sn; + B daha yavaş)"}
          series={delta()!}
          height={90}
          zero
          fmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
          {...common()}
        />
      </Show>
      <Show when={on("speed")}>
        <ChartPanel title="Hız (km/h)" series={mk((t) => t.speed, 0.1)} height={150} fmt={(v) => v.toFixed(0)} {...common()} />
      </Show>
      <Show when={on("throttle")}>
        <ChartPanel title="Gaz (%)" series={mk((t) => t.throttle)} height={70} min={0} max={100} fmt={(v) => v.toFixed(0)} {...common()} />
      </Show>
      <Show when={on("brake")}>
        <ChartPanel title="Fren (%)" series={mk((t) => t.brake)} height={70} min={0} max={100} fmt={(v) => v.toFixed(0)} {...common()} />
      </Show>
      <Show when={on("gear")}>
        <ChartPanel title="Vites" series={mk((t) => t.gear)} height={70} step fmt={(v) => (v < 0 ? "R" : v === 0 ? "N" : v.toFixed(0))} {...common()} />
      </Show>
      <Show when={on("steer")}>
        <ChartPanel title="Direksiyon (°)" series={mk((t) => t.steer)} height={80} zero fmt={(v) => v.toFixed(0)} {...common()} />
      </Show>
      <Show when={on("rpm") && has(chanPick("rpm"))}>
        <ChartPanel title="Devir (rpm)" series={mk(chanPick("rpm"))} height={90} fmt={(v) => v.toFixed(0)} {...common()} />
      </Show>
      <Show when={on("latg") && has(chanPick("latg"))}>
        <ChartPanel title="Yanal G (+ sağa)" series={mk(chanPick("latg"), 0.01)} height={80} zero fmt={(v) => v.toFixed(2)} {...common()} />
      </Show>
      <Show when={on("longg") && has(chanPick("longg"))}>
        <ChartPanel title="Boyuna G (+ hızlanma, − fren)" series={mk(chanPick("longg"), 0.01)} height={80} zero fmt={(v) => v.toFixed(2)} {...common()} />
      </Show>
      <Show when={on("abs") && has(chanPick("abs"))}>
        <ChartPanel title="ABS devrede" series={mk(chanPick("abs"))} height={50} min={0} max={100} step fmt={(v) => (v > 50 ? t("Açık") : "—")} {...common()} />
      </Show>
      <Show when={["rpm", "latg", "longg", "abs"].some((c) => on(c) && !has(chanPick(c)))}>
        <p class="muted small">{t("Devir, G kuvvetleri ve ABS bu sürümden sonra kaydedilen turlarda var; eski turlarda görünmez.")}</p>
      </Show>
      </div>
      <Show when={p.laps[0]}>
        <MiniMap info={p.laps[0].info} cursor={p.cursorK} setCursor={p.setCursorK} label={pos()} />
      </Show>
      </div>
    </section>
  );
}

/** Ek kanalın dizisi */
function chanPick(id: string): (t: Trace) => number[] | undefined {
  switch (id) {
    case "rpm":
      return (t) => t.rpm;
    case "latg":
      return (t) => t.lat_g;
    case "longg":
      return (t) => t.long_g;
    case "abs":
      return (t) => t.abs;
    default:
      return () => undefined;
  }
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

