// Topluluk: paylaşılan overlay düzenleri. Ara, önizle, profil olarak indir, puan ver, yorum yaz.

import { localeTag, t } from "@/sdk/i18n";
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isLocked, isPro, profile } from "@/cloud/account";
import { manifestById } from "@/sdk/registry";
import { useSnapshot } from "@/sdk/telemetry";
import { SharedLayoutPreview, ThemeSwatches } from "../components/SharedLayoutPreview";
import { newLayout } from "./LayoutsPage";
import { can } from "@/cloud/moderation";
import { CommentList, ReportDialog } from "../components/Moderation";
import * as I from "../icons";
import {
  addComment,
  comments,
  deleteComment,
  deleteLayout,
  editComment,
  getLayoutData,
  layoutBoxes,
  markDownloaded,
  myLayouts,
  myRating,
  rate,
  searchLayouts,
  shareLayout,
  type LayoutBox,
  type LayoutSummary,
  type Sort,
} from "@/cloud/layouts";
import { activeProfile, settings, updateSettings, type Profile } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { go } from "../ui";

const RESOLUTIONS = ["1920x1080", "2560x1440", "3440x1440", "3840x2160", "2560x1080", "5120x1440", "5760x1080"];

interface MonitorInfo {
  index: number;
  width: number;
  height: number;
  scale: number;
  primary: boolean;
}

/** Ekranı ve üzerindeki overlay kutularını küçük bir şema olarak çizer */
export function LayoutPreview(props: { boxes: LayoutBox[] | null; w: number; h: number; scale?: number; labels?: boolean }) {
  const vw = () => props.w / (props.scale || 1);
  const vh = () => props.h / (props.scale || 1);
  return (
    <svg class="lp" viewBox={`0 0 ${vw()} ${vh()}`} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={vw()} height={vh()} class="lp-screen" />
      <line x1={vw() / 2} y1="0" x2={vw() / 2} y2={vh()} class="lp-center" />
      <line x1="0" y1={vh() / 2} x2={vw()} y2={vh() / 2} class="lp-center" />
      <For each={props.boxes ?? []}>
        {(b) => (
          <g>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" class="lp-box" classList={{ locked: isLocked(b.id) }} />
            <Show when={props.labels}>
              <text x={b.x + b.w / 2} y={b.y + b.h / 2} class="lp-label" style={{ "font-size": `${Math.max(16, Math.min(34, b.w / 9))}px` }}>
                {b.name}
              </text>
            </Show>
          </g>
        )}
      </For>
    </svg>
  );
}

export function Stars(props: { value: number; count?: number; onRate?: (n: number) => void; mine?: number; big?: boolean }) {
  const [hover, setHover] = createSignal(0);
  const shown = () => hover() || props.mine || Math.round(props.value);
  return (
    <span class="stars" classList={{ interactive: !!props.onRate, big: !!props.big }} onMouseLeave={() => setHover(0)}>
      <For each={[1, 2, 3, 4, 5]}>
        {(n) => (
          <span
            classList={{ on: n <= shown(), mine: !!props.mine && !hover() }}
            onMouseEnter={() => props.onRate && setHover(n)}
            onClick={() => props.onRate?.(n)}
          >
            ★
          </span>
        )}
      </For>
      <Show when={props.count !== undefined}>
        <small>
          {props.value ? props.value.toFixed(1) : "—"} ({props.count})
        </small>
      </Show>
    </span>
  );
}

export type LayoutKind = "layout" | "stream";

/** Giriş yapmayanlara: topluluk görünmez */
export function LoginWall(props: { what: string }) {
  return (
    <div class="page narrow">
      <section class="panel login-wall">
        <I.Lock />
        <h3>{props.what}</h3>
        <p class="muted">Topluluğu görmek için hesap oluştur ya da giriş yap. Hesap ücretsizdir.</p>
        <button class="btn primary" onClick={() => go("account")}>
          Hesap oluştur ya da giriş yap
        </button>
      </section>
    </div>
  );
}

/** PRO gerektiren işlem düğmesi: PRO değilse kilitli görünür ve PRO sayfasına götürür */
export function ProGate(props: { children: any; label?: string }) {
  return (
    <Show
      when={isPro()}
      fallback={
        <button class="btn ghost pro-lock" title="Bu özellik PRO üyelere açık" onClick={() => go("pro")}>
          <I.Lock /> {props.label ?? "PRO"}
        </button>
      }
    >
      {props.children}
    </Show>
  );
}

export function CommunityPage(props: { kind: LayoutKind }) {
  const [q, setQ] = createSignal("");
  const [sort, setSort] = createSignal<Sort>("new");
  const [res, setRes] = createSignal("");
  const [tab, setTab] = createSignal<"all" | "mine">("all");
  const [open, setOpen] = createSignal<LayoutSummary | null>(null);
  const [sharing, setSharing] = createSignal(false);
  const [version, setVersion] = createSignal(0);
  const [debounced, setDebounced] = createSignal("");
  let timer: number | undefined;
  createEffect(
    on(q, (v) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setDebounced(v), 300);
    }),
  );

  const [list] = createResource(
    () => (session() ? { q: debounced(), sort: sort(), res: res(), tab: tab(), v: version(), kind: props.kind } : null),
    async (k) => (k.tab === "mine" ? myLayouts(k.kind) : searchLayouts(k.q, k.sort, k.res, 0, k.kind)),
  );

  if (!cloudEnabled) {
    return (
      <div class="page narrow">
        <section class="panel">
          <h3>Topluluk kapalı</h3>
          <p class="muted">Düzen paylaşımı için bulut bağlantısı gerekir (bkz. Hesap sayfası).</p>
        </section>
      </div>
    );
  }

  return (
    <Show when={session()} fallback={<LoginWall what={props.kind === "stream" ? "Topluluk yayın düzenleri" : "Topluluk düzenleri"} />}>
      <div class="page">
        <section class="panel cm-bar">
          <div class="cm-tabs">
            <button classList={{ on: tab() === "all" }} onClick={() => setTab("all")}>
              {props.kind === "stream" ? "Tüm yayın düzenleri" : "Tüm düzenler"}
            </button>
            <button classList={{ on: tab() === "mine" }} onClick={() => setTab("mine")}>
              Paylaştıklarım
            </button>
          </div>
          <Show when={tab() === "all"}>
            <input class="input cm-search" placeholder="Düzen adı, kullanıcı ya da iRacing adı ara" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
            <select class="input" value={res()} onChange={(e) => setRes(e.currentTarget.value)}>
              <option value="">Tüm çözünürlükler</option>
              <For each={RESOLUTIONS}>{(r) => <option value={r}>{r.replace("x", "×")}</option>}</For>
            </select>
            <select class="input" value={sort()} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
              <option value="new">En yeni</option>
              <option value="top">En yüksek puan</option>
              <option value="downloads">En çok indirilen</option>
            </select>
          </Show>
          <span class="lt-sp" />
          <button class="btn primary" onClick={() => setSharing(true)}>
            {props.kind === "stream" ? "Yayın düzenimi paylaş" : "Düzenimi paylaş"}
          </button>
        </section>

        <Show when={list.error}>
          <p class="error">{String(list.error?.message ?? list.error)}</p>
        </Show>
        <Show when={!list.loading && (list() ?? []).length === 0 && !list.error}>
          <p class="muted cm-empty">{tab() === "mine" ? "Henüz düzen paylaşmadın." : "Sonuç yok."}</p>
        </Show>

        <div class="cm-grid">
          <For each={list() ?? []}>
            {(l) => (
              <button class="cm-card" onClick={() => setOpen(l)}>
                <LayoutPreview boxes={l.boxes} w={l.screen_w} h={l.screen_h} scale={l.ui_scale} labels />
                <div class="cm-card-body">
                  <b data-no-i18n>{l.title}</b>
                  <small data-no-i18n>
                    {l.author_name || "?"}
                    {l.author_iracing ? ` · ${l.author_iracing}` : ""}
                  </small>
                  <div class="cm-meta">
                    <span class="cm-res">
                      {l.screen_w}×{l.screen_h}
                    </span>
                    <span>{l.overlay_count} overlay</span>
                    <span>⭳ {l.downloads}</span>
                    <Stars value={Number(l.rating_avg)} count={l.rating_count} />
                  </div>
                </div>
              </button>
            )}
          </For>
        </div>

        <Show when={open()}>
          <LayoutDetail l={open()!} kind={props.kind} onClose={() => setOpen(null)} onChanged={() => setVersion(version() + 1)} />
        </Show>
        <Show when={sharing()}>
          <ShareDialog
            kind={props.kind}
            onClose={() => setSharing(false)}
            onShared={() => {
              setSharing(false);
              setTab("mine");
              setVersion(version() + 1);
            }}
          />
        </Show>
      </div>
    </Show>
  );
}

export function LayoutDetail(props: { l: LayoutSummary; kind: LayoutKind; onClose: () => void; onChanged: () => void }) {
  const l = () => props.l;
  const mine = () => session()?.user.id === l().user_id;
  const [data] = createResource(() => l().id, getLayoutData);
  const [stars, { refetch: refetchStars }] = createResource(() => l().id, (id) => myRating(id).catch(() => 0));
  const [cmts, { refetch }] = createResource(() => l().id, comments);
  const [text, setText] = createSignal("");
  const [msg, setMsg] = createSignal("");
  const [avg, setAvg] = createSignal({ v: Number(l().rating_avg), n: l().rating_count });
  const [reporting, setReporting] = createSignal(false);
  const [withTheme, setWithTheme] = createSignal(true);

  // Önizleme sabit görüntü: bir anlık örnek veri, sonra akış durur
  useSnapshot(
    () => {
      const d = data();
      if (!d) return [];
      const types = new Set(Object.values(d.profile.overlays ?? {}).filter((o) => o.enabled).map((o) => o.type));
      return [...types].flatMap((t) => manifestById(t)?.topics ?? []);
    },
    () => data(),
  );
  const overlays = createMemo(() =>
    Object.entries(data()?.profile.overlays ?? {})
      .filter(([, o]) => o.enabled)
      .map(([k, o]) => ({ k, name: o.name || manifestById(o.type)?.name || o.type, scale: o.scale, type: o.type })),
  );

  const doRate = async (n: number) => {
    if (mine()) return setMsg("Kendi düzenine puan veremezsin");
    try {
      const had = stars() ?? 0;
      await rate(l().id, n);
      const cnt = avg().n + (had ? 0 : 1);
      setAvg({ v: (avg().v * avg().n - had + n) / Math.max(1, cnt), n: cnt });
      refetchStars();
      props.onChanged();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const use = async () => {
    setMsg("");
    try {
      const d = data() ?? (await getLayoutData(l().id));
      const src: Profile = structuredClone(d.profile);
      const name = `${l().title} (${l().author_name || "paylaşım"})`;
      const mode = props.kind === "stream" ? "stream" : src.rules?.mode && src.rules.mode !== "stream" ? src.rules.mode : "driving";
      const id = newLayout(mode, name, src);
      if (props.kind === "stream") updateSettings((x) => (x.profiles[id].canvas = src.canvas ?? { w: l().screen_w, h: l().screen_h }));
      if (withTheme() && d.theme) updateSettings((x) => (x.theme = { ...d.theme!, scale: props.kind === "stream" ? x.theme.scale : d.theme!.scale, opacity: x.theme.opacity }));
      markDownloaded(l().id);
      setMsg(
        props.kind === "stream"
          ? `"${name}" yayın düzeni eklendi. Yayın sayfasından OBS adresini alabilirsin.`
          : `"${name}" düzeni eklendi ve seçildi. Overlay'ler sayfasından değiştirebilirsin.`,
      );
      props.onChanged();
    } catch (e) {
      setMsg("İndirilemedi: " + String((e as Error).message));
    }
  };

  const send = async () => {
    const b = text().trim();
    if (!b) return;
    try {
      await addComment(l().id, b);
      setText("");
      refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail wide">
        <header>
          <div>
            <h3 data-no-i18n>{l().title}</h3>
            <small class="muted">
              <span data-no-i18n>
                {l().author_name}
                {l().author_iracing ? ` · iRacing: ${l().author_iracing}` : ""}
              </span>{" "}
              · {new Date(l().created_at).toLocaleDateString(localeTag())}
            </small>
          </div>
          <button class="btn ghost small" onClick={props.onClose}>
            Kapat
          </button>
        </header>

        <Show when={data()} fallback={<LayoutPreview boxes={l().boxes} w={l().screen_w} h={l().screen_h} scale={l().ui_scale} labels />}>
          <SharedLayoutPreview profile={data()!.profile} theme={data()!.theme} w={l().screen_w / (l().ui_scale || 1)} h={l().screen_h / (l().ui_scale || 1)} stream={props.kind === "stream"} />
        </Show>

        <div class="cm-detail-meta">
          <span class="cm-res">
            {l().screen_w}×{l().screen_h}
          </span>
          <span>{l().overlay_count} overlay</span>
          <span>{t("⭳ {0} indirme", l().downloads)}</span>
          <Stars value={avg().v} count={avg().n} />
        </div>
        <Show when={l().description}>
          <p class="cm-desc" data-no-i18n>
            {l().description}
          </p>
        </Show>

        <div class="cm-settings">
          <div>
            <h4>Overlay'ler ve ayarları</h4>
            <div class="cm-ovs">
              <For each={overlays()}>
                {(o) => (
                  <span class="chip2" classList={{ alt: isLocked(o.type) }}>
                    {o.name} · %{Math.round((o.scale || 1) * 100)}
                  </span>
                )}
              </For>
            </div>
          </div>
          <Show when={data()?.theme}>
            <div>
              <h4>Renkler ve yazı tipi</h4>
              <ThemeSwatches theme={data()!.theme} />
            </div>
          </Show>
          <Show when={l().cars.length > 0}>
            <p class="muted small">
              Araçlar: <span data-no-i18n>{l().cars.join(", ")}</span>
            </p>
          </Show>
        </div>

        <div class="btns">
          <ProGate label="Kullanmak için PRO">
            <button class="btn primary" onClick={use}>
              <I.Download /> Kullan
            </button>
            <Show when={data()?.theme}>
              <label class="check">
                <input type="checkbox" checked={withTheme()} onChange={(e) => setWithTheme(e.currentTarget.checked)} />
                <span>Renklerini de uygula</span>
              </label>
            </Show>
          </ProGate>
          <span class="lt-sp" />
          <Show when={!mine()}>
            <ProGate label="Puan vermek için PRO">
              <span class="cm-rate">
                Puanın: <Stars value={0} mine={stars() ?? 0} onRate={doRate} big />
              </span>
            </ProGate>
          </Show>
          <Show when={session() && !mine()}>
            <button class="btn ghost" onClick={() => setReporting(true)}>
              <I.Flag /> Raporla
            </button>
          </Show>
          <Show when={mine() || can("layouts.delete")}>
            <button
              class="btn ghost danger"
              onClick={async () => {
                if (!confirm("Bu paylaşım silinsin mi?")) return;
                await deleteLayout(l().id).catch((e) => setMsg(String(e.message)));
                props.onChanged();
                props.onClose();
              }}
            >
              Sil
            </button>
          </Show>
        </div>
        <Show when={msg()}>
          <p class="success">{msg()}</p>
        </Show>
        <p class="muted small">Kilitli (PRO) overlay'ler soluk görünür; indirince PRO değilsen kapalı kalır.</p>

        <h4>Yorumlar ({cmts()?.length ?? 0})</h4>
        <CommentList
          items={cmts() ?? []}
          reportType="layout_comment"
          canEdit={(c) => session()?.user.id === c.user_id || can("comments.edit")}
          canDelete={(c) => session()?.user.id === c.user_id || mine() || can("comments.delete")}
          onEdit={async (c, b) => {
            await editComment(c.id, b);
            refetch();
          }}
          onDelete={async (c) => {
            await deleteComment(c.id);
            refetch();
          }}
          onError={setMsg}
        />
        <ProGate label="Yorum yazmak için PRO">
          <div class="fr-add">
            <input class="input" maxLength={1000} placeholder="Yorum yaz" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button class="btn" onClick={send}>
              Gönder
            </button>
          </div>
        </ProGate>
        <Show when={reporting()}>
          <ReportDialog type="layout" id={l().id} what={l().title} onClose={() => setReporting(false)} />
        </Show>
      </div>
    </div>
  );
}

/** Sadece hazır sahne (açılış, ara, kapanış, garaj örtüsü) içeren düzen: toplulukta paylaşılamaz */
export function isSceneOnly(p: Profile) {
  const on = Object.values(p.overlays ?? {}).filter((o) => o.enabled);
  return on.length > 0 && on.every((o) => o.type === "scene");
}

/** Düzeni toplulukta paylaş (Düzenler / Yayın sayfalarından ve topluluktan açılır) */
export function ShareDialog(props: { kind: LayoutKind; profileId?: string; onClose: () => void; onShared: () => void }) {
  const profiles = () => Object.values(settings().profiles).filter((p) => (props.kind === "stream" ? p.rules.mode === "stream" : p.rules.mode !== "stream"));
  const [pid, setPid] = createSignal(props.profileId ?? (props.kind === "stream" ? profiles()[0]?.id : activeProfile().id) ?? "");
  const prof = () => settings().profiles[pid()] ?? profiles()[0];
  const [title, setTitle] = createSignal(prof()?.name ?? "");
  const [desc, setDesc] = createSignal("");
  const [withTheme, setWithTheme] = createSignal(true);
  const [screen, setScreen] = createSignal({ w: 1920, h: 1080, scale: 1 });
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const boxes = () => (prof() ? layoutBoxes(prof()!) : []);

  onMount(async () => {
    if (props.kind === "stream") {
      const c = prof()?.canvas ?? { w: 1920, h: 1080 };
      setScreen({ w: c.w, h: c.h, scale: 1 });
      return;
    }
    if (!inTauri) return;
    try {
      const ms = await invoke<MonitorInfo[]>("monitors_list");
      const sel = settings().general.monitor;
      const m = ms.find((x) => x.index === sel) ?? ms.find((x) => x.primary) ?? ms[0];
      if (m) setScreen({ w: m.width, h: m.height, scale: m.scale });
    } catch {
      /* varsayılan kalsın */
    }
  });

  const submit = async () => {
    setErr("");
    if (!prof()) return setErr("Paylaşılacak düzen yok.");
    if (!title().trim()) return setErr("Bir ad yaz.");
    if (boxes().length === 0) return setErr("Bu düzende açık overlay yok.");
    if (isSceneOnly(prof()!)) return setErr("Hazır sahneler toplulukta paylaşılamaz.");
    setBusy(true);
    try {
      const p = prof()!;
      await shareLayout({
        title: title().trim().slice(0, 60),
        description: desc().trim().slice(0, 1000),
        screen_w: screen().w,
        screen_h: screen().h,
        cars: p.rules?.cars ?? [],
        kind: props.kind,
        data: {
          profile: p,
          theme: withTheme() ? settings().theme : undefined,
          boxes: boxes(),
          scale: screen().scale,
        },
      });
      props.onShared();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail">
        <header>
          <h3>{props.kind === "stream" ? "Yayın düzenini toplulukta paylaş" : "Düzeni toplulukta paylaş"}</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
        </header>
        <Show when={session()} fallback={<p class="muted">Paylaşmak için giriş yapmalısın.</p>}>
          <>
            <div class="row">
              <b>Düzen</b>
              <select class="input" value={pid()} onChange={(e) => (setPid(e.currentTarget.value), setTitle(prof()?.name ?? ""))}>
                <For each={profiles()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
              </select>
            </div>
            <div class="row">
              <b>Başlık</b>
              <input class="input admin-wide" maxLength={60} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
            </div>
            <textarea class="input cm-textarea" rows={3} maxLength={1000} placeholder="Açıklama (hangi seri/araç için, neye dikkat ettin…)" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />
            <div class="row">
              <div>
                <b>{props.kind === "stream" ? "Tuval" : "Ekran"}</b>
                <small>{props.kind === "stream" ? "Yayın düzeninin tuval boyutu" : "Overlay ekranının monitöründen alındı"}</small>
              </div>
              <div class="mqtt-host">
                <input class="input port" type="number" value={screen().w} onChange={(e) => setScreen({ ...screen(), w: Number(e.currentTarget.value) || 1920 })} />
                <span>×</span>
                <input class="input port" type="number" value={screen().h} onChange={(e) => setScreen({ ...screen(), h: Number(e.currentTarget.value) || 1080 })} />
              </div>
            </div>
            <label class="check">
              <input type="checkbox" checked={withTheme()} onChange={(e) => setWithTheme(e.currentTarget.checked)} />
              <span>Renklerimi ve yazı tipimi de ekle</span>
            </label>
            <LayoutPreview boxes={boxes()} w={screen().w} h={screen().h} scale={screen().scale} labels />
            <p class="muted small">
              {t("{0} açık overlay tüm ayarlarıyla paylaşılacak.", boxes().length)} Görünen adın{profile()?.iracing_name ? " ve iRacing adın" : ""} düzenle birlikte görünür.
            </p>
            <Show when={err()}>
              <p class="error">{err()}</p>
            </Show>
            <Show when={prof() && isSceneOnly(prof()!)}>
              <p class="error">Hazır sahneler toplulukta paylaşılamaz.</p>
            </Show>
            <button class="btn primary" disabled={busy() || (!!prof() && isSceneOnly(prof()!))} onClick={submit}>
              {busy() ? "Paylaşılıyor…" : "Paylaş"}
            </button>
          </>
        </Show>
      </div>
    </div>
  );
}
