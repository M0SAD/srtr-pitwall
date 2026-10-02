// Yayın: OBS için ayrı düzenler (1920×1080 tuval) ve hazır sahneler.

import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { LINK_ACTIVE, RESOLUTIONS, copyLayoutToStream, linkSource, liveProfile, setStreamCanvas, setStreamFocus, streamFocus, unlinkStream } from "@/sdk/streamLink";
import { ShareDialog, isSceneOnly } from "./CommunityPage";
import { go } from "../ui";
import { invoke } from "@tauri-apps/api/core";
import { canDuplicate, manifestById, manifests } from "@/sdk/registry";
import { instanceName, instancesOf, settings, updateSettings, type Profile } from "@/sdk/settings";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { appState } from "../App";
import { isHiddenOverlay, isLocked } from "@/cloud/account";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { UndoRedo } from "@/sdk/UndoRedo";
import { Switch } from "../components/SettingsForm";
import { newLayout } from "./LayoutsPage";
import * as I from "../icons";
import { F } from "@/sdk/proFeatures";
import { ProLockBox } from "../components/ProLock";
import { overlayIcon } from "../overlayIcons";
import { currentSim, overlaySupportsSim } from "@/overlays/simSupport";

interface ServerInfo {
  running: boolean;
  port: number;
  url: string | null;
  lanUrl: string | null;
  error: string | null;
}

type Place = { type: string; x: number; y: number; scale?: number; options?: Record<string, unknown> };

const PRESETS: { id: string; name: string; desc: string; items: Place[] }[] = [
  {
    id: "telemetry",
    name: "Yayın telemetrisi",
    desc: "Sıralama, relative, pedallar, telemetri, pist haritası",
    items: [
      { type: "standings", x: 20, y: 20, scale: 0.9 },
      { type: "trackmap", x: 1500, y: 20, scale: 0.8 },
      { type: "relative", x: 20, y: 760, scale: 0.9 },
      { type: "inputs", x: 760, y: 950 },
      { type: "telemetry", x: 1340, y: 960 },
      { type: "delta", x: 760, y: 20 },
    ],
  },
  { id: "starting", name: "Yayın başlıyor", desc: "Geri sayımlı açılış", items: [{ type: "scene", x: 0, y: 0, options: { style: "starting" } }] },
  { id: "brb", name: "Hemen dönerim", desc: "Ara ekranı", items: [{ type: "scene", x: 0, y: 0, options: { style: "brb", countdown: 3 } }] },
  { id: "ending", name: "Yayın sonu", desc: "Kapanış ekranı", items: [{ type: "scene", x: 0, y: 0, options: { style: "ending" } }] },
  {
    id: "cyber",
    name: "Kokpit HUD",
    desc: "Ortada vites/delta, yanlarda spotter ve bayraklar",
    items: [
      { type: "telemetry", x: 690, y: 900 },
      { type: "delta", x: 760, y: 820 },
      { type: "radar", x: 850, y: 380, scale: 0.9 },
      { type: "digiflags", x: 40, y: 40, scale: 0.8 },
      { type: "relative", x: 1340, y: 800, scale: 0.85 },
    ],
  },
  {
    id: "garage",
    name: "Garaj örtüsü",
    desc: "Garajdayken ayar ekranını kapatır",
    items: [{ type: "scene", x: 0, y: 0, options: { style: "garage" } }],
  },
];

function createFromPreset(preset: (typeof PRESETS)[number]): string {
  const id = newLayout("stream", preset.name);
  updateSettings((d) => {
    const p = d.profiles[id];
    p.canvas = { w: 1920, h: 1080 };
    for (const o of Object.values(p.overlays)) o.enabled = false;
    const used = new Map<string, number>();
    for (const it of preset.items) {
      const n = (used.get(it.type) ?? 0) + 1;
      used.set(it.type, n);
      const key = n === 1 ? it.type : `${it.type}#${n}`;
      const base = p.overlays[it.type];
      if (!base) continue;
      p.overlays[key] = {
        ...structuredClone(base),
        enabled: true,
        x: it.x,
        y: it.y,
        scale: it.scale ?? 1,
        options: { ...base.options, ...(it.options ?? {}) },
      };
    }
  });
  return id;
}

export function StreamingPage() {
  const streams = () => Object.values(settings().profiles).filter((p) => p.rules.mode === "stream");
  const [selId, setSelId] = createSignal<string>(streams()[0]?.id ?? "");
  const p = (): Profile | undefined => settings().profiles[selId()] ?? streams()[0];
  // Düzenler sayfasından "Yayın düzenine kopyala" ile gelindiyse o yayın düzeni açılır
  createEffect(() => {
    const f = streamFocus();
    if (!f) return;
    setSelId(f);
    setStreamFocus(null);
  });
  const layouts = () => Object.values(settings().profiles).filter((x) => x.rules.mode !== "stream");
  const [scaleSizes, setScaleSizes] = createSignal(true);
  const [custom, setCustom] = createSignal(false);
  const [sel, setSel] = createSignal<string | null>(null);
  const [info, { refetch }] = createResource(() => invoke<ServerInfo>("server_status").catch(() => null));
  const [copied, setCopied] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);
  const canvas = () => p()?.canvas ?? { w: 1920, h: 1080 };

  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  // Bağlı yayın düzeni: izlenen düzen ve onun yayın çözünürlüğüne oranlanmış (salt okunur) görünümü
  const linked = () => !!p()?.link;
  const source = createMemo(() => linkSource(p(), status()));
  const view = createMemo(() => liveProfile(p(), status()));
  /** Kaynak düzendeki açık kopyalar (gizle anahtarları için) */
  const sourceKeys = createMemo(() => {
    const src = source();
    return src ? instancesOf(src).filter(([, i]) => i.enabled && !isLocked(i.type) && !isHiddenOverlay(i.type)) : [];
  });
  const isPreset = () => RESOLUTIONS.some((r) => r.w === canvas().w && r.h === canvas().h) || (canvas().w === 1080 && canvas().h === 1920);
  const setRes = (w: number, h: number) => {
    const prof = p();
    w = Math.round(w);
    h = Math.round(h);
    if (!prof || !(w >= 320 && h >= 180 && w <= 7680 && h <= 4320) || (w === canvas().w && h === canvas().h)) return;
    const has = !prof.link && Object.values(prof.overlays).some((o) => o.enabled);
    const rescale = has && confirm(t("Overlay konumları yeni çözünürlüğe ({0}×{1}) göre orantılı olarak taşınsın mı? Tamam: yerleşim oranı korunur. İptal: konumlar olduğu gibi kalır.", w, h));
    setStreamCanvas(prof.id, { w, h }, rescale, scaleSizes());
  };
  const toggleHidden = (key: string) =>
    updateSettings((d) => {
      const l = d.profiles[p()!.id].link;
      if (!l) return;
      l.hidden = l.hidden.includes(key) ? l.hidden.filter((x) => x !== key) : [...l.hidden, key];
    });
  const keys = createMemo(() =>
    view()
      ? instancesOf(view()!)
          .filter(([, i]) => i.enabled && !isLocked(i.type) && !isHiddenOverlay(i.type) && overlaySupportsSim(i.type, sim()))
          .map(([k]) => k)
      : [],
  );
  // Tuvaldeki overlay'ler sabit görüntü (Demo açıksa canlı)
  useSnapshot(
    () => {
      const prof = view();
      return prof ? keys().flatMap((k) => manifestById(prof.overlays[k]?.type ?? "")?.topics ?? []) : [];
    },
    () => [p()?.id, keys().join(",")],
    () => appState().demo,
  );

  const url = () => {
    const base = info()?.lanUrl ?? info()?.url ?? `http://127.0.0.1:${settings().general.server.port}`;
    return `${base}/overlay.html?layout=${encodeURIComponent(p()?.id ?? "")}`;
  };

  const enableServer = async () => {
    const s = settings().general.server;
    updateSettings((d) => (d.general.server.enabled = true));
    await invoke("server_apply", { enabled: true, port: s.port, lan: s.lan });
    refetch();
  };

  const add = (type: string) => {
    const prof = p();
    if (!prof) return;
    updateSettings((d) => {
      const pp = d.profiles[prof.id];
      const base = pp.overlays[type];
      const ex = Object.entries(pp.overlays).find(([, o]) => o.type === type && o.enabled)?.[0];
      if (!base.enabled) {
        base.enabled = true;
        setSel(type);
      } else if (ex && !canDuplicate(type, d.general.allowDuplicates)) {
        // Birden fazla eklemeye izin yok: var olanı seç
        setSel(ex);
      } else {
        let n = 2;
        while (pp.overlays[`${type}#${n}`]) n++;
        pp.overlays[`${type}#${n}`] = { ...structuredClone(base), name: "", x: 60, y: 60 };
        setSel(`${type}#${n}`);
      }
    });
  };

  return (
    <ProLockBox feature={F.streaming} text="Yayın düzenleri (OBS) PRO üyelere özel.">
      <div class="lpage">
        <aside class="llist">
          <div class="ovlist-cap">Yayın düzenleri</div>
          <div class="llist-items">
            <Show when={streams().length > 0} fallback={<div class="ovlist-empty">Henüz yok. Aşağıdan hazır bir sahneyle başla.</div>}>
              <For each={streams()}>
                {(x) => (
                  <button class="ovitem" classList={{ sel: p()?.id === x.id }} onClick={() => (setSelId(x.id), setSel(null))}>
                    <span class="ovitem-ic">
                      <I.Radio />
                    </span>
                    <span class="ovitem-name">{x.name}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
          <div class="ovlist-cap">Hazır sahneler</div>
          <div class="presets2">
            <For each={PRESETS}>
              {(pr) => (
                <button class="preset2" onClick={() => setSelId(createFromPreset(pr))} title={pr.desc}>
                  <b>{pr.name}</b>
                  <small>{pr.desc}</small>
                </button>
              )}
            </For>
          </div>
          <button class="btn primary wide" onClick={() => setSelId(createFromPreset({ id: "empty", name: `Yayın ${streams().length + 1}`, desc: "", items: [] }))}>
            <I.Plus /> Boş yayın düzeni
          </button>
          <select
            class="f2-select"
            title="Düzenlerinden birinin açık tüm overlay'lerini aynı ayarlarla yeni bir yayın düzenine kopyalar; konumlar yayın çözünürlüğüne oranlanır"
            value=""
            onChange={(e) => {
              const src = settings().profiles[e.currentTarget.value];
              e.currentTarget.value = "";
              if (src) setSelId(copyLayoutToStream(src.id, { name: t("{0} (yayın)", src.name) }));
            }}
          >
            <option value="">Düzenden kopyala…</option>
            <For each={layouts()}>{(x) => <option value={x.id}>{x.name}</option>}</For>
          </select>
        </aside>

        <Show
          when={p()}
          fallback={
            <section class="lmain empty-state">
              <I.Radio />
              <h2>OBS için yayın düzenleri</h2>
              <p class="muted">
                Oyunda gördüğünden farklı bir yerleşimi yayında göstermek için buradan bir yayın düzeni oluştur. Her düzenin
                kendi OBS adresi olur. Soldan hazır bir sahne seçerek başlayabilirsin.
              </p>
            </section>
          }
        >
          <section class="lmain">
            <header class="lhead">
              <div>
                <input class="input lname-input flat" value={p()!.name} onChange={(e) => updateSettings((d) => (d.profiles[p()!.id].name = e.currentTarget.value || "Yayın"))} />
                <small class="muted">
                  {canvas().w}×{canvas().h} · {keys().length} overlay
                </small>
              </div>
              <div class="lhead-btns">
                <UndoRedo keys class="ur-panel" />
                <Show when={!linked()}>
                  <select
                    class="f2-select small"
                    value=""
                    onChange={(e) => {
                      if (e.currentTarget.value) add(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">+ Overlay ekle…</option>
                    <For each={manifests.filter((m) => !isLocked(m.id) && !isHiddenOverlay(m.id) && overlaySupportsSim(m.id, sim()))}>{(m) => <option value={m.id}>{m.name}</option>}</For>
                  </select>
                  <select
                    class="f2-select small"
                    title="Bu yayın düzeninin overlay'lerini seçtiğin düzenin overlay'leriyle değiştirir"
                    value=""
                    onChange={(e) => {
                      const src = settings().profiles[e.currentTarget.value];
                      e.currentTarget.value = "";
                      if (!src) return;
                      const has = Object.values(p()!.overlays).some((o) => o.enabled);
                      if (has && !confirm(t('"{0}" yayın düzeninin overlay listesi "{1}" düzenindekiyle değiştirilsin mi?', p()!.name, src.name))) return;
                      copyLayoutToStream(src.id, { replaceId: p()!.id });
                      setSel(null);
                    }}
                  >
                    <option value="">Düzenden kopyala…</option>
                    <For each={layouts()}>{(x) => <option value={x.id}>{x.name}</option>}</For>
                  </select>
                </Show>
                <Show when={view() && !isSceneOnly(view()!)}>
                  <button class="btn ghost" title="Bu yayın düzenini tüm ayarları ve renkleriyle toplulukta paylaş" onClick={() => setSharing(true)}>
                    <I.Share2 /> Toplulukta paylaş
                  </button>
                </Show>
                <button class="btn ghost" title="Bu yayın düzeninin bir kopyasını oluştur" onClick={() => setSelId(newLayout("stream", `${p()!.name} (kopya)`, p()!))}>
                  <I.Copy /> Kopyala
                </button>
                <button
                  class="btn ghost danger"
                  onClick={() => {
                    if (!confirm(`"${p()!.name}" silinsin mi?`)) return;
                    const id = p()!.id;
                    updateSettings((d) => delete d.profiles[id]);
                    setSelId(streams()[0]?.id ?? "");
                  }}
                >
                  <I.Trash /> Sil
                </button>
              </div>
            </header>

            <div class="obs-url">
              <div class="f2-cap">OBS tarayıcı kaynağı adresi</div>
              <Show
                when={info()?.running}
                fallback={
                  <div class="obs-off">
                    <span>Web sunucusu kapalı.</span>
                    <button class="btn primary small" onClick={enableServer}>
                      Aç
                    </button>
                  </div>
                }
              >
                <div class="obs-row">
                  <code>{url()}</code>
                  <button
                    class="btn ghost small"
                    onClick={async () => {
                      await navigator.clipboard.writeText(url()).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <I.Copy /> {copied() ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
                <small class="muted">
                  OBS: Kaynak ekle → Tarayıcı → adresi yapıştır, genişlik {canvas().w}, yükseklik {canvas().h}. Arka plan şeffaftır.
                </small>
              </Show>
            </div>

            <div class="sres">
              <div class="sres-row">
                <span class="f2-cap">Yayın çözünürlüğü</span>
                <select
                  class="f2-select small"
                  value={custom() || !isPreset() ? "custom" : `${canvas().w}x${canvas().h}`}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    if (v === "custom") return void setCustom(true);
                    setCustom(false);
                    const [w, h] = v.split("x").map(Number);
                    setRes(w, h);
                    e.currentTarget.value = `${canvas().w}x${canvas().h}`;
                  }}
                >
                  <For each={RESOLUTIONS}>{(r) => <option value={`${r.w}x${r.h}`}>{`${r.w}×${r.h}`}</option>}</For>
                  <option value="1080x1920">{t("1080×1920 (dikey)")}</option>
                  <option value="custom">Özel</option>
                </select>
                <Show when={custom() || !isPreset()}>
                  <input class="input sres-num" type="number" min="320" max="7680" title="Genişlik" value={canvas().w} onChange={(e) => (setRes(Number(e.currentTarget.value), canvas().h), (e.currentTarget.value = String(canvas().w)))} />
                  <span class="muted">×</span>
                  <input class="input sres-num" type="number" min="180" max="4320" title="Yükseklik" value={canvas().h} onChange={(e) => (setRes(canvas().w, Number(e.currentTarget.value)), (e.currentTarget.value = String(canvas().h)))} />
                </Show>
                <Show when={!linked()}>
                  <label class="check" title="Çözünürlük değişince konumlar orantılı taşınırken overlay'lerin boyutu da aynı oranda büyür ya da küçülür">
                    <input type="checkbox" checked={scaleSizes()} onChange={(e) => setScaleSizes(e.currentTarget.checked)} />
                    <span>Overlay boyutlarını da ölçekle</span>
                  </label>
                </Show>
              </div>
              <div class="sres-row">
                <span class="f2-cap">Overlay kaynağı</span>
                <select
                  class="f2-select small"
                  title="Bağlı yayın düzeni kendi overlay listesini kullanmaz: seçtiğin düzenin açık overlay'lerini yayın çözünürlüğüne oranlayarak canlı gösterir. Düzende yaptığın her değişiklik OBS'e kendiliğinden yansır."
                  value={p()!.link?.source ?? ""}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    updateSettings((d) => {
                      const pp = d.profiles[p()!.id];
                      if (!v) delete pp.link;
                      else pp.link = { source: v, hidden: pp.link?.hidden ?? [] };
                    });
                    setSel(null);
                  }}
                >
                  <option value="">Kendi overlay'leri (bağlı değil)</option>
                  <option value={LINK_ACTIVE}>Etkin düzeni izle</option>
                  <For each={layouts()}>{(x) => <option value={x.id}>{t("Düzenimi kullan: {0}", x.name)}</option>}</For>
                </select>
                <Show when={linked()}>
                  <span class="chip2 alt">
                    <I.Link2 /> Bağlı düzen{source() ? `: ${source()!.name}` : ""}
                  </span>
                  <button
                    class="btn ghost small"
                    title="Şu anki görünümü bu yayın düzenine kopyalar; artık düzendeki değişiklikleri izlemez ve burada serbestçe düzenlenebilir"
                    onClick={() => {
                      unlinkStream(p()!.id, status());
                      setSel(null);
                    }}
                  >
                    <I.Unlink /> Bağlantıyı kopar
                  </button>
                </Show>
              </div>
              <Show when={linked() && !source()}>
                <small class="muted">Bağlı düzen bulunamadı (silinmiş olabilir). Başka bir düzen seç.</small>
              </Show>
            </div>

            <Show
              when={linked()}
              fallback={<LayoutCanvas profileId={p()!.id} width={canvas().w} height={canvas().h} keys={keys()} selected={sel()} onSelect={setSel} globalScale={false} />}
            >
              <LayoutCanvas profileId={p()!.id} source={view()} readOnly width={canvas().w} height={canvas().h} keys={keys()} selected={sel()} onSelect={setSel} globalScale={false} />
              <div class="slink">
                <div class="f2-cap">Yayında gizle</div>
                <div class="slink-list">
                  <For each={sourceKeys()}>
                    {([k, i]) => (
                      <button
                        class="btn ghost small"
                        classList={{ off: p()!.link!.hidden.includes(k), on: sel() === k }}
                        title={p()!.link!.hidden.includes(k) ? "Yayında gizli · göstermek için tıkla" : "Yayında görünüyor · gizlemek için tıkla"}
                        onClick={() => toggleHidden(k)}
                      >
                        <Show when={p()!.link!.hidden.includes(k)} fallback={<I.Eye />}>
                          <I.EyeOff />
                        </Show>
                        {instanceName(k, i)}
                      </button>
                    )}
                  </For>
                </div>
                <small class="muted lhint">
                  Önizleme salt okunurdur: yerleşimi ve overlay ayarlarını Düzenler / Overlay'ler sayfasında bağlı düzende değiştir, yayına kendiliğinden yansır.
                </small>
              </div>
            </Show>

            <Show when={!linked() && sel() && p()!.overlays[sel()!]}>
              <div class="lsel">
                <span class="ovitem-ic">{overlayIcon(p()!.overlays[sel()!].type)}</span>
                <b>{instanceName(sel()!, p()!.overlays[sel()!])}</b>
                <span class="lt-sp" />
                <span class="muted small">iRacing kapalıyken de göster</span>
                <Switch
                  checked={p()!.overlays[sel()!].alwaysShow}
                  onChange={(v) => updateSettings((d) => (d.profiles[p()!.id].overlays[sel()!].alwaysShow = v))}
                />
                <button
                  class="btn ghost small danger"
                  onClick={() => {
                    const k = sel()!;
                    updateSettings((d) => {
                      const o = d.profiles[p()!.id].overlays[k];
                      if (k === o.type) o.enabled = false;
                      else delete d.profiles[p()!.id].overlays[k];
                    });
                    setSel(null);
                  }}
                >
                  <I.X /> Kaldır
                </button>
              </div>
            </Show>
            <Show when={!linked()}>
              <small class="muted lhint">Overlay ayarlarını (renk, sütunlar vb.) Overlay'ler sayfasında bu düzeni seçerek değiştirebilirsin.</small>
            </Show>
            <Show when={sharing()}>
              <ShareDialog kind="stream" profileId={p()!.id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "stream"))} />
            </Show>
          </section>
        </Show>
      </div>
    </ProLockBox>
  );
}
