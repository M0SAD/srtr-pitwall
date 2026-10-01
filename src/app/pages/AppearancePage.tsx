import { createMemo, createSignal, For, lazy, onMount, Show, Suspense, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { activeProfile, settings, updateTheme, updateSettings } from "@/sdk/settings";
import { matchesPreset, PRESETS, presetTheme, THEME_GROUPS, themeVars, DEFAULT_THEME, FONTS, NUM_FONTS, fontStack, type Density } from "@/sdk/theme";
import { loadComponent, manifestById } from "@/sdk/registry";
import { defaultOptions } from "@/sdk/overlay";
import { injectSamples } from "@/sdk/samples";
import { SettingsForm, Switch } from "../components/SettingsForm";
import { LogosPanel } from "../components/LogosPanel";
import { AppBgPanel } from "../components/AppBgPanel";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockBox, ProLockNote } from "../components/ProLock";
import { applySharedTheme, ShareThemeDialog, ThemeSwatch } from "./CommunityThemes";
import { ProGate } from "./CommunityPage";
import { go } from "../ui";
import { t as t2 } from "@/sdk/i18n";
import * as I from "../icons";
import type { Theme } from "@/sdk/theme";
import { UndoRedo } from "@/sdk/UndoRedo";

/** Boyut, opaklık ve rozet ayarı dışında iki tema aynı mı */
function sameTheme(a: Theme, b: Theme) {
  const skip = new Set(["scale", "opacity", "combineLicense", "preset"]);
  return Object.keys(b).every((k) => skip.has(k) || (a as any)[k] === (b as any)[k]);
}

// Önizlemede gösterilecek gerçek overlay bileşenleri
const PREVIEW = ["relative", "delta", "fuel"];

const comps = new Map<string, Component<any>>();
function comp(id: string) {
  if (!comps.has(id)) {
    const l = loadComponent(id);
    if (l) comps.set(id, lazy(l));
  }
  return comps.get(id);
}

export function AppearancePage() {
  onMount(injectSamples);
  const t = () => settings().theme;
  const vars = createMemo(() => themeVars(t()));
  const custom = () => !matchesPreset(t()) && !settings().savedThemes.some((x) => sameTheme(t(), x.theme));
  const [sharing, setSharing] = createSignal(false);

  return (
    <div class="page appearance">
      <section class="panel">
        <h3 class="ur-head">
          Hazır temalar <UndoRedo keys class="ur-panel" />
        </h3>
        <p class="muted">Bir tema seç, sonra aşağıdan istediğin kadar değiştir. Değişiklikler tüm overlay'lere anında uygulanır.</p>
        <div class="presets">
          <For each={PRESETS}>
            {(p) => {
              const pt = presetTheme(p.id);
              return (
                <button
                  class="preset"
                  classList={{ active: t().preset === p.id && !custom() }}
                  onClick={() =>
                    updateSettings((d) => (d.theme = { ...presetTheme(p.id), scale: d.theme.scale, opacity: d.theme.opacity, combineLicense: d.theme.combineLicense }))
                  }
                >
                  <div class="preset-swatch" style={{ background: pt.bg, color: pt.text, "border-radius": `${Math.min(pt.radius, 10)}px` }}>
                    <span style={{ background: pt.accent }} />
                    <span style={{ background: pt.positive }} />
                    <span style={{ background: pt.negative }} />
                    <b>Aa</b>
                  </div>
                  <small>{p.name}</small>
                </button>
              );
            }}
          </For>
          <For each={settings().savedThemes}>
            {(st) => (
              <div class="preset-wrap">
                <button
                  class="preset saved"
                  classList={{ active: sameTheme(t(), st.theme) }}
                  title={t2("Topluluktan: {0}", st.author || "?")}
                  onClick={() => applySharedTheme(st, false)}
                >
                  <ThemeSwatch theme={st.theme} />
                  <small data-no-i18n>{st.name}</small>
                </button>
                <button
                  class="preset-del"
                  title="Bu temayı listeden kaldır"
                  onClick={() => updateSettings((d) => (d.savedThemes = d.savedThemes.filter((x) => x.id !== st.id)))}
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="btns">
          <button class="btn ghost small" onClick={() => go("community", "themes")}>
            <I.Palette /> Topluluk temaları
          </button>
          <ProGate label="Temanı paylaşmak için PRO" feature="community.share.themes">
            <button class="btn ghost small" onClick={() => setSharing(true)}>
              <I.Share2 /> Temamı toplulukta paylaş
            </button>
          </ProGate>
        </div>
        <Show when={sharing()}>
          <ShareThemeDialog onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "themes"))} />
        </Show>
        <Show when={custom()}>
          <p class="muted">
            Şu an <b>özel</b> bir tema kullanıyorsun ({PRESETS.find((p) => p.id === t().preset)?.name ?? "Varsayılan"} temelli).
          </p>
        </Show>
      </section>

      <ProLockNote feature={F.themes} text="Temayı düzenlemek (yazı tipi, renkler, kenarlık…) PRO üyelere özel. Hazır temaları seçebilirsin." />
      <section class="panel" classList={{ "prolock-dim": proLocked(F.themes) }} inert={proLocked(F.themes)}>
        <h3>Yazı tipi</h3>
        <div class="font-cards">
          <For each={FONTS}>
            {(f) => (
              <button class="font-card" classList={{ active: t().font === f.value }} onClick={() => updateTheme((th) => (th.font = f.value))}>
                <b style={{ "font-family": fontStack(f.value), "font-weight": t().weight || (t().bold ? 600 : 400) }}>Aa 1:47.382</b>
                <small>{f.label}</small>
              </button>
            )}
          </For>
        </div>
        <div class="ap-rows">
          <div class="ap-row">
            <span>Kalınlık</span>
            <div class="seg">
              <For each={[{ v: 0, l: "Otomatik" }, { v: 300, l: "İnce" }, { v: 400, l: "Normal" }, { v: 500, l: "Orta" }, { v: 600, l: "Kalın" }]}>
                {(w) => (
                  <button classList={{ on: t().weight === w.v }} onClick={() => updateTheme((th) => (th.weight = w.v))}>
                    {w.l}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="ap-row">
            <span>Rakam fontu</span>
            <div class="seg">
              <For each={NUM_FONTS}>
                {(f) => (
                  <button classList={{ on: t().numFont === f.value }} onClick={() => updateTheme((th) => (th.numFont = f.value))}>
                    {f.label.replace(" (Windows)", "")}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="ap-row">
            <span>Satır yoğunluğu</span>
            <div class="seg">
              <For each={[{ v: "compact", l: "Sıkışık" }, { v: "normal", l: "Normal" }, { v: "comfortable", l: "Rahat" }] as { v: Density; l: string }[]}>
                {(d) => (
                  <button classList={{ on: t().density === d.v }} onClick={() => updateTheme((th) => (th.density = d.v))}>
                    {d.l}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="ap-row">
            <span>
              Lisans ve iRating tek rozette
              <small class="muted"> · Relative'de yer kazandırır</small>
            </span>
            <Switch checked={t().combineLicense} onChange={(v) => updateTheme((th) => (th.combineLicense = v))} />
          </div>
        </div>
      </section>

      <div class="appearance-grid">
        <div>
          <For each={THEME_GROUPS}>
            {(grp) => (
              <section class="panel" classList={{ "prolock-dim": proLocked(F.themes) }} inert={proLocked(F.themes)}>
                <h3>{grp.title}</h3>
                <SettingsForm
                  fields={grp.fields}
                  values={t() as unknown as Record<string, unknown>}
                  onChange={(k, v) => updateTheme((th) => ((th as unknown as Record<string, unknown>)[k] = v))}
                />
              </section>
            )}
          </For>
          <div class="btns">
            <button
              class="btn ghost"
              onClick={() => updateSettings((d) => (d.theme = { ...presetTheme(d.theme.preset), scale: d.theme.scale, opacity: d.theme.opacity }))}
            >
              Seçili temaya geri dön
            </button>
            <button class="btn ghost danger" onClick={() => updateSettings((d) => (d.theme = { ...DEFAULT_THEME }))}>
              Varsayılana sıfırla
            </button>
          </div>
          <LogosPanel />
          <ProLockBox feature={F.appBg} text="Uygulama arka planı PRO üyelere özel.">
            <AppBgPanel />
          </ProLockBox>
        </div>

        <aside class="preview-wrap">
          <div class="preview-title">Canlı önizleme</div>
          <div class="preview ov-theme" style={vars()}>
            <For each={PREVIEW}>
              {(id) => {
                const m = manifestById(id);
                const C = comp(id);
                return (
                  <Show when={m && C}>
                    <Suspense>
                      <Dynamic component={C} options={activeProfile().overlays[id]?.options ?? defaultOptions(m!)} units={settings().general.units} editing={false} />
                    </Suspense>
                  </Show>
                );
              }}
            </For>
          </div>
          <small class="hint">Önizleme örnek veriyle gösterilir.</small>
        </aside>
      </div>
    </div>
  );
}
