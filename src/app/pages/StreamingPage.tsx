// Yayın: OBS için ayrı düzenler (1920×1080 tuval) ve hazır sahneler.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ShareDialog, isSceneOnly } from "./CommunityPage";
import { go } from "../ui";
import { invoke } from "@tauri-apps/api/core";
import { manifestById, manifests } from "@/sdk/registry";
import { instanceName, instancesOf, settings, updateSettings, type Profile } from "@/sdk/settings";
import { useSnapshot } from "@/sdk/telemetry";
import { appState } from "../App";
import { isHiddenOverlay, isLocked } from "@/cloud/account";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { Switch } from "../components/SettingsForm";
import { newLayout } from "./LayoutsPage";
import * as I from "../icons";
import { overlayIcon } from "../overlayIcons";

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
  const [sel, setSel] = createSignal<string | null>(null);
  const [info, { refetch }] = createResource(() => invoke<ServerInfo>("server_status").catch(() => null));
  const [copied, setCopied] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);
  const canvas = () => p()?.canvas ?? { w: 1920, h: 1080 };

  const keys = createMemo(() => (p() ? instancesOf(p()!).filter(([, i]) => i.enabled && !isLocked(i.type) && !isHiddenOverlay(i.type)).map(([k]) => k) : []));
  // Tuvaldeki overlay'ler sabit görüntü (Demo açıksa canlı)
  useSnapshot(
    () => {
      const prof = p();
      return prof ? keys().flatMap((k) => manifestById(prof.overlays[k].type)?.topics ?? []) : [];
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
      } else if (ex && !d.general.allowDuplicates) {
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
              <select class="f2-select small" value={`${canvas().w}x${canvas().h}`} onChange={(e) => {
                const [w, h] = e.currentTarget.value.split("x").map(Number);
                updateSettings((d) => (d.profiles[p()!.id].canvas = { w, h }));
              }}>
                <For each={["1920x1080", "2560x1440", "1280x720", "3840x2160", "1080x1920"]}>{(r) => <option value={r}>{r.replace("x", "×")}</option>}</For>
              </select>
              <select
                class="f2-select small"
                value=""
                onChange={(e) => {
                  if (e.currentTarget.value) add(e.currentTarget.value);
                  e.currentTarget.value = "";
                }}
              >
                <option value="">+ Overlay ekle…</option>
                <For each={manifests.filter((m) => !isLocked(m.id) && !isHiddenOverlay(m.id))}>{(m) => <option value={m.id}>{m.name}</option>}</For>
              </select>
              <Show when={!isSceneOnly(p()!)}>
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

          <LayoutCanvas profileId={p()!.id} width={canvas().w} height={canvas().h} keys={keys()} selected={sel()} onSelect={setSel} globalScale={false} />

          <Show when={sel() && p()!.overlays[sel()!]}>
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
          <small class="muted lhint">Overlay ayarlarını (renk, sütunlar vb.) Overlay'ler sayfasında bu düzeni seçerek değiştirebilirsin.</small>
          <Show when={sharing()}>
            <ShareDialog kind="stream" profileId={p()!.id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "stream"))} />
          </Show>
        </section>
      </Show>
    </div>
  );
}
