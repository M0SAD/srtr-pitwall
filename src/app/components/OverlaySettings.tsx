// Bir overlay'in ayar paneli. İki yerde kullanılır:
//  - "Overlaylarım" (mode="defaults"): overlay türünün varsayılan ayarları (düzene eklenince bu ayarlarla gelir).
//  - Düzenler / Yayın (mode="layout"): seçili düzendeki kopyanın kendi ayarları.

import { For, Show, createMemo, createSignal } from "solid-js";
import { manifestById } from "@/sdk/registry";
import { DEFAULTS_ID, defaultInstance, instanceName, profileById, resetToDefaults, updateOverlay } from "@/sdk/settings";
import type { SettingField } from "@/sdk/overlay";
import { isLocked } from "@/cloud/account";
import { monitorLabel, monitors } from "@/sdk/monitors";
import { SettingsForm, Slider, Switch } from "./SettingsForm";
import { overlayIcon } from "../overlayIcons";
import { go } from "../ui";
import * as I from "../icons";
import { GlucoseLoginPanel } from "./GlucoseLogin";

// PRO olmayan üyenin seçtiği kilitli (PRO) seçenekler: kaydedilmez, sadece önizlemede gösterilir
const [pv, setPv] = createSignal<{ key: string; vals: Record<string, unknown> }>({ key: "", vals: {} });
export const previewVals = (k: string) => (pv().key === k ? pv().vals : {});
function setPreviewVal(k: string, key: string, value: unknown) {
  const cur = pv().key === k ? { ...pv().vals } : {};
  if (value === undefined) delete cur[key];
  else cur[key] = value;
  setPv({ key: k, vals: cur });
}

export function Section(props: { title: string; open?: boolean; children: any }) {
  const [open, setOpen] = createSignal(props.open ?? true);
  return (
    <section class="osec" classList={{ closed: !open() }}>
      <button class="osec-head" onClick={() => setOpen(!open())}>
        <span>{props.title}</span>
        <I.ChevronDown />
      </button>
      <Show when={open()}>
        <div class="osec-body">{props.children}</div>
      </Show>
    </section>
  );
}

export function OverlaySettings(props: {
  key: string;
  /** Düzen kimliği; "Overlaylarım" için DEFAULTS_ID */
  profileId: string;
  mode: "defaults" | "layout";
  /** Yayın düzeni: monitör seçimi yok */
  stream?: boolean;
  /** Düzenden kaldır (mode="layout") */
  onRemove?: () => void;
  /** Kilitli düzen: ayarlar görünür ama değiştirilemez */
  readOnly?: boolean;
  /** Düzenler / Yayın: panel tuvalin üstünde yüzer; × ile kapanır */
  onClose?: () => void;
}) {
  const k = props.key;
  const defaults = () => props.mode === "defaults";
  const inst = () => profileById(props.profileId)?.overlays[k];
  // Tür değişmedikçe aynı kalsın: ayar değişince form yeniden kurulmasın (kaydırıcı sürüklemesi
  // kopmasın, sütun sıralarken sayfa başa kaymasın)
  const type = createMemo(() => inst()?.type ?? "");
  const m = createMemo(() => manifestById(type()));
  const isCopy = () => inst() && k !== inst()!.type;
  const upd = (fn: Parameters<typeof updateOverlay>[1]) => {
    if (!props.readOnly) updateOverlay(k, fn, props.profileId);
  };
  /** Önizleme değerleri "Overlaylarım"da tür, düzende düzen+kopya başına tutulur */
  const pvKey = () => (defaults() ? k : `${props.profileId}/${k}`);

  // Alanları gruplara ayır (grup verilmemişse overlay adı)
  const groups = createMemo(() => {
    const man = m();
    if (!man) return [] as [string, SettingField[]][];
    const g = new Map<string, SettingField[]>();
    for (const f of man.settings) {
      const name = f.group ?? man.name;
      if (!g.has(name)) g.set(name, []);
      g.get(name)!.push(f);
    }
    return [...g.entries()];
  });

  const reset = () => {
    if (props.readOnly) return;
    if (!defaults()) return resetToDefaults(props.profileId, k);
    // "Overlaylarım": fabrika ayarlarına dön
    upd((o) => {
      const d = defaultInstance(o.type);
      o.options = d.options;
      delete o.look;
      o.scale = 1;
      o.opacity = 1;
      if (typeof d.bgOpacity === "number") o.bgOpacity = d.bgOpacity;
      else delete o.bgOpacity;
      o.hideInGarage = d.hideInGarage;
      o.hideOnTrack = d.hideOnTrack;
      o.alwaysShow = d.alwaysShow;
    });
  };

  return (
    <Show when={inst() && m()}>
      <aside class="ovset" classList={{ ro: !!props.readOnly }}>
        <header class="ovset-head">
          <span class="ovset-ic">{overlayIcon(inst()!.type)}</span>
          <div>
            <b>{defaults() ? m()!.name : instanceName(k, inst()!)}</b>
            <small>{m()!.description}</small>
          </div>
          <Show when={props.onClose}>
            <button class="ovset-close" title="Kapat (Esc)" onClick={() => props.onClose!()}>
              <I.X />
            </button>
          </Show>
        </header>
        <div class="ovset-scroll">
          <Show when={isLocked(inst()!.type)}>
            <div class="locked-note">
              Bu overlay PRO üyelere özel.{" "}
              <button class="link" onClick={() => go("pro")}>
                PRO'ya bak
              </button>
            </div>
          </Show>
          <Show when={props.readOnly}>
            <div class="locked-note lock-note">
              <I.Lock /> Bu düzen kilitli: ayarlar değiştirilemez. Değiştirmek için soldaki listede düzenin kilidini aç.
            </div>
          </Show>
          <Show when={defaults()}>
            <p class="ovset-note">Buradaki ayarlar bu overlay'in varsayılanıdır: bir düzene eklediğinde bu ayarlarla gelir. Düzendeki kopyanın ayarları Düzenler sayfasından ayrıca değiştirilebilir.</p>
          </Show>
          <Show when={inst()!.type === "glucose"}>
            <GlucoseLoginPanel />
          </Show>
          <Section title="Genel">
            <Show when={!defaults() && isCopy()}>
              <div class="f2">
                <div class="f2-cap">Kopya adı</div>
                <input class="input f2-text" value={inst()!.name} placeholder={instanceName(k, { ...inst()!, name: "" })} onChange={(e) => upd((o) => (o.name = e.currentTarget.value.trim()))} />
              </div>
            </Show>
            <div class="f2">
              <div class="f2-cap">Opaklık</div>
              <Slider value={Math.round(inst()!.opacity * 100)} min={20} max={100} step={5} unit="%" onInput={(v) => upd((o) => (o.opacity = v / 100))} />
            </div>
            <div class="f2">
              <div class="f2-cap">Boyut</div>
              <Slider value={Math.round(inst()!.scale * 100)} min={40} max={300} step={5} unit="%" onInput={(v) => upd((o) => (o.scale = v / 100))} />
              <Show when={!defaults()}>
                <small class="f2-hint">Tuvalde ya da ekranda köşelerden sürükleyerek de boyutlandırabilirsin.</small>
              </Show>
            </div>
            {/* Kendi "Arka plan opaklığı" seçeneği olan overlay'lerde (mesajlar, sohbet, yakın takip…) genel kaydırıcı gösterilmez */}
            <Show when={!m()!.settings.some((f) => f.key === "bgOpacity")}>
              <div class="f2">
                <div class="f2-cap">Arka plan opaklığı</div>
                <Slider value={Math.round((inst()!.bgOpacity ?? 1) * 100)} min={0} max={100} step={5} unit="%" onInput={(v) => upd((o) => (o.bgOpacity = v / 100))} />
                <small class="f2-hint">Panelin arka planını saydamlaştırır; yazılar opak kalır. %100: temadaki gibi.</small>
              </div>
            </Show>
            <Show when={!defaults() && !props.stream && monitors().length > 1}>
              <div class="f2">
                <div class="f2-cap">Monitör</div>
                <select class="f2-select" value={inst()!.monitor} onChange={(e) => upd((o) => ((o.monitor = e.currentTarget.value), (o.x = 40), (o.y = 40)))}>
                  <option value="">Ana overlay monitörü</option>
                  <For each={monitors()}>{(mo) => <option value={mo.name}>{monitorLabel(mo)}</option>}</For>
                </select>
              </div>
            </Show>
          </Section>

          <For each={groups()}>
            {([title, fields]) => (
              <Section title={title}>
                <SettingsForm
                  fields={fields}
                  values={inst()!.options}
                  overlayId={inst()!.type}
                  onChange={(key, value) => upd((o) => (o.options[key] = value))}
                  onPreview={(key, value) => !props.readOnly && setPreviewVal(pvKey(), key, value)}
                  previewValues={previewVals(pvKey())}
                />
              </Section>
            )}
          </For>

          <Section title="Ne zaman gizlensin" open={false}>
            <p class="muted small">Pitteyken: garajda, pit yolunda ya da pit kutusunda. Pistte sürerken: araçtasın ve pitte değilsin. Demo modunda ve düzenlerken bu iki seçenek uygulanmaz; overlay her zaman görünür.</p>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">Pitteyken gizle</span>
                <Switch checked={inst()!.hideInGarage} onChange={(v) => upd((o) => (o.hideInGarage = v))} />
              </div>
            </div>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">Pistte sürerken gizle</span>
                <Switch checked={inst()!.hideOnTrack} onChange={(v) => upd((o) => (o.hideOnTrack = v))} />
              </div>
            </div>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">iRacing kapalıyken de göster</span>
                <Switch checked={inst()!.alwaysShow} onChange={(v) => upd((o) => (o.alwaysShow = v))} />
              </div>
            </div>
          </Section>
        </div>
        <footer class="ovset-foot">
          <button class="btn ghost" disabled={props.readOnly} title={defaults() ? "Bu overlay'in ayarlarını ilk hâline (fabrika ayarlarına) döndür" : "Bu kopyanın ayarlarını Overlaylarım'daki varsayılanlarına döndür (konumu korunur)"} onClick={reset}>
            <I.RotateCcw /> Sıfırla
          </button>
          <Show when={!defaults() && props.onRemove}>
            <button class="btn ghost danger" disabled={props.readOnly} title="Bu overlay'i düzenden kaldır" onClick={() => props.onRemove!()}>
              <I.Trash /> Kaldır
            </button>
          </Show>
        </footer>
      </aside>
    </Show>
  );
}

export { DEFAULTS_ID };
