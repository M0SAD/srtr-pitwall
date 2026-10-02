// "Görünüm (bu overlay)": bir kopyanın genel temadan ayrılan görünümü (renk, biçim, yazı, yoğunluk).
// Her overlay'in ayarlarının sonunda otomatik çıkar; değerler instance.look'ta durur (bkz. sdk/look.ts).
// Her satırda değer temadan geliyorsa "tema" yazar; değiştirilince yanında "temaya dön" (↺) düğmesi çıkar.

import { For, Show, createSignal, type JSX } from "solid-js";
import { activeProfile, settings, updateOverlay as updateOverlayIn, updateSettings } from "@/sdk/settings";
import { FONTS } from "@/sdk/theme";
import { LOOK_FREE, LOOK_PRESETS, lookHasValues, lookClipboard, setLookClipboard, type LookKey, type OverlayLook } from "@/sdk/look";
import { F, proLocked, requiresPro } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import { ProLockNote } from "./ProLock";
import { Slider, Switch } from "./SettingsForm";
import "./lookPanel.css";

export function LookPanel(props: { id: string; profileId?: string }) {
  /** Düzenlenen düzen (verilmezse etkin düzen) */
  const prof = () => (props.profileId && settings().profiles[props.profileId]) || activeProfile();
  const inst = () => prof().overlays[props.id];
  const updateOverlay = (id: string, fn: Parameters<typeof updateOverlayIn>[1]) => updateOverlayIn(id, fn, prof().id);
  const look = (): OverlayLook => inst()?.look ?? {};
  const th = () => settings().theme;
  const has = () => lookHasValues(look());
  /** "Özel görünüm kullan": kayıtlı görünüm var ve kapatılmamış */
  const enabled = () => !!inst()?.look && look().on !== false;
  const isFree = (k: LookKey) => LOOK_FREE.includes(k);
  const locked = (k: LookKey) => !isFree(k) && proLocked(F.overlayLook);
  const proLock = () => proLocked(F.overlayLook);

  const set = <K extends LookKey>(k: K, v: OverlayLook[K] | undefined) => {
    if (v !== undefined && locked(k)) return;
    updateOverlay(props.id, (o) => {
      const l: OverlayLook = { ...(o.look ?? {}) };
      if (v === undefined) delete l[k];
      else l[k] = v;
      l.on = true;
      o.look = l;
    });
  };
  const setOn = (v: boolean) => updateOverlay(props.id, (o) => void (o.look = { ...(o.look ?? {}), on: v }));
  const replace = (l: OverlayLook | undefined) =>
    updateOverlay(props.id, (o) => {
      if (l && Object.keys(l).length) o.look = { ...l, on: true };
      else delete o.look;
    });

  const [note, setNote] = createSignal("");
  let noteTimer: number | undefined;
  const flash = (s: string) => {
    setNote(s);
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => setNote(""), 2500);
  };
  const applyAll = () => {
    const l = inst()?.look;
    if (!confirm(t("Bu görünüm, bu düzendeki bütün overlay'lere uygulansın mı? Diğer overlay'lerin kendi özel görünümleri silinir."))) return;
    const pid = prof().id;
    updateSettings((d) => {
      for (const o of Object.values((d.profiles[pid] ?? d.profiles[d.activeProfile]).overlays)) {
        if (l && Object.keys(l).length) o.look = { ...l };
        else delete o.look;
      }
    });
    flash("Bu düzendeki tüm overlay'lere uygulandı");
  };

  const Tag = (p: { k: LookKey }) => (
    <Show when={!isFree(p.k) && requiresPro(F.overlayLook)}>
      {" "}
      <span class="pro-badge small" title="PRO üyelere özel">
        PRO
      </span>
    </Show>
  );
  /** Değer temadan mı geliyor: "tema" etiketi; değilse temaya döndüren düğme */
  const Inherit = (p: { k: LookKey }) => (
    <Show when={look()[p.k] !== undefined} fallback={<span class="look-theme">tema</span>}>
      <button class="look-reset" title="Temaya dön" onClick={() => set(p.k, undefined)}>
        ↺
      </button>
    </Show>
  );
  const Color = (p: { k: "bg" | "text" | "dim" | "accent" | "positive" | "negative" | "warning" | "info" | "best" | "highlight" | "border" | "row"; label: string; theme: string }) => (
    <div class="f2 f2-color" classList={{ "f2-locked": locked(p.k) }}>
      <div class="f2-row f2-colorrow">
        <span class="f2-label">
          {p.label}
          <Tag k={p.k} />
        </span>
        <Inherit k={p.k} />
        <span class="f2-colorpick">
          <input type="color" value={look()[p.k] ?? p.theme} disabled={locked(p.k)} onInput={(e) => set(p.k, e.currentTarget.value)} />
          <code data-no-i18n>{String(look()[p.k] ?? p.theme).toUpperCase()}</code>
        </span>
      </div>
    </div>
  );
  const Num = (p: {
    k: "bgOpacity" | "borderOpacity" | "rowOpacity" | "highlightOpacity" | "radius" | "borderWidth" | "pad" | "fontScale" | "spacing";
    label: string;
    theme: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    hint?: string;
  }) => (
    <div class="f2" classList={{ "f2-locked": locked(p.k) }}>
      <div class="f2-cap look-cap">
        <span>
          {p.label}
          <Tag k={p.k} />
        </span>
        <Inherit k={p.k} />
      </div>
      <div classList={{ "look-off": locked(p.k) }}>
        <Slider value={look()[p.k] ?? p.theme} min={p.min} max={p.max} step={p.step} unit={p.unit} onInput={(v) => set(p.k, v)} />
      </div>
      <Show when={p.hint}>
        <small class="f2-hint">{p.hint}</small>
      </Show>
    </div>
  );
  const Bool = (p: { k: "textShadow" | "classStripe" | "shadow" | "blur" | "header" | "upper" | "tabular"; label: string; theme: boolean; hint?: string }) => (
    <div class="f2" classList={{ "f2-locked": locked(p.k) }}>
      <div class="f2-row">
        <span class="f2-label">
          {p.label}
          <Tag k={p.k} />
        </span>
        <Inherit k={p.k} />
        <Switch checked={look()[p.k] ?? p.theme} disabled={locked(p.k)} onChange={(v) => set(p.k, v)} />
      </div>
      <Show when={p.hint}>
        <small class="f2-hint">{p.hint}</small>
      </Show>
    </div>
  );
  const Sel = (p: { k: "font" | "weight" | "density"; label: string; theme: string; options: { value: string; label: string }[] }) => (
    <div class="f2" classList={{ "f2-locked": locked(p.k) }}>
      <div class="f2-cap look-cap">
        <span>
          {p.label}
          <Tag k={p.k} />
        </span>
        <Inherit k={p.k} />
      </div>
      <select class="f2-select" disabled={locked(p.k)} value={look()[p.k] ?? p.theme} onChange={(e) => set(p.k, e.currentTarget.value as never)}>
        <For each={p.options}>
          {(o) => (
            <option value={o.value} selected={(look()[p.k] ?? p.theme) === o.value}>
              {o.label}
            </option>
          )}
        </For>
      </select>
    </div>
  );
  const Sub = (p: { children: JSX.Element }) => <div class="look-sub">{p.children}</div>;

  return (
    <div class="form2 look">
      <div class="f2">
        <div class="f2-row">
          <span class="f2-label">Özel görünüm kullan</span>
          <Switch checked={enabled()} onChange={setOn} />
        </div>
      </div>
      <small class="f2-hint">
        Buradaki seçenekler sadece bu overlay'i değiştirir ve genel temanın (Görünüm sayfası) üstüne yazılır. "tema" yazan satırlar temadaki değeri
        kullanır.
      </small>
      <Show when={enabled()}>
      <ProLockNote feature={F.overlayLook} text="Arka plan, yazı ve vurgu rengi, köşe ve yazı boyutu herkese açık; diğer seçenekler ve hazır görünümler PRO üyelere özel." />

      <div class="f2">
        <div class="f2-cap">
          Hazır görünümler
          <Show when={requiresPro(F.overlayLook)}>
            {" "}
            <span class="pro-badge small" title="PRO üyelere özel">
              PRO
            </span>
          </Show>
        </div>
        <div class="look-presets">
          <For each={LOOK_PRESETS}>
            {(p) => (
              <button class="btn small" disabled={proLock()} onClick={() => replace(p.look)}>
                {p.name}
              </button>
            )}
          </For>
        </div>
      </div>

      <Sub>Renkler</Sub>
      <Color k="bg" label="Arka plan" theme={th().bg} />
      <Num k="bgOpacity" label="Arka plan opaklığı" theme={th().bgOpacity} min={0} max={100} step={1} unit="%" />
      <Color k="text" label="Yazı" theme={th().text} />
      <Color k="accent" label="Vurgu" theme={th().accent} />
      <Color k="dim" label="İkincil yazı" theme={th().dim} />
      <Color k="positive" label="Olumlu (kazanç)" theme={th().positive} />
      <Color k="negative" label="Olumsuz (kayıp)" theme={th().negative} />
      <Color k="warning" label="Uyarı" theme={th().warning} />
      <Color k="info" label="Bilgi" theme={th().info} />
      <Color k="best" label="En iyi tur" theme={th().best} />
      <Color k="highlight" label="Senin satırın" theme={th().highlight} />
      <Num k="highlightOpacity" label="Senin satırın opaklığı" theme={th().highlightOpacity} min={0} max={100} step={1} unit="%" />
      <Color k="border" label="Kenarlık rengi" theme={th().borderColor} />
      <Num k="borderOpacity" label="Kenarlık opaklığı" theme={look().border ? 100 : th().border ? th().borderOpacity : 0} min={0} max={100} step={1} unit="%" />
      <Color k="row" label="Satır zemini" theme={look().text ?? th().text} />
      <Num k="rowOpacity" label="Satır zemini opaklığı" theme={look().row ? 12 : 4} min={0} max={40} step={1} unit="%" />

      <Sub>Biçim</Sub>
      <Num k="radius" label="Köşe yuvarlaklığı" theme={th().radius} min={0} max={24} step={1} unit="px" />
      <Num k="borderWidth" label="Kenarlık kalınlığı" theme={1} min={0} max={4} step={1} unit="px" />
      <Num k="pad" label="İç boşluk" theme={100} min={50} max={200} step={5} unit="%" />
      <Bool k="shadow" label="Panel gölgesi" theme={false} />
      <Bool
        k="blur"
        label="Arka plan bulanıklığı (cam)"
        theme={false}
        hint="Yalnızca overlay'in arkasındaki diğer overlay'leri ve OBS sayfasındaki içeriği bulanıklaştırır; oyun görüntüsünü bulanıklaştıramaz."
      />
      <Bool k="classStripe" label="Sınıf rengi şeridi" theme={true} hint="Sıralama, yakın çevre, düello ve mücadele kutusunda satır başındaki renkli şerit." />
      <Bool k="header" label="Başlık çubuğu" theme={true} hint="Standart başlığı olan overlay'lerde geçerlidir." />

      <Sub>Yazı</Sub>
      <Sel k="font" label="Yazı fontu" theme={th().font} options={FONTS} />
      <Num k="fontScale" label="Yazı boyutu" theme={100} min={70} max={160} step={5} unit="%" />
      <Sel
        k="weight"
        label="Yazı kalınlığı"
        theme={th().weight >= 600 || (th().weight === 0 && th().bold) ? "strong" : "normal"}
        options={[
          { value: "normal", label: "Normal" },
          { value: "strong", label: "Kalın" },
        ]}
      />
      <Num k="spacing" label="Harf aralığı" theme={0} min={-3} max={20} step={1} />
      <Bool k="textShadow" label="Yazı gölgesi (okunabilirlik)" theme={th().textShadow} />
      <Bool k="upper" label="Büyük harfli başlıklar" theme={true} />
      <Bool k="tabular" label="Sabit genişlikli rakamlar" theme={true} />

      <Sub>Yerleşim</Sub>
      <Sel
        k="density"
        label="Satır yoğunluğu"
        theme={th().density}
        options={[
          { value: "compact", label: "Sıkı" },
          { value: "normal", label: "Normal" },
          { value: "comfortable", label: "Geniş" },
        ]}
      />

      </Show>

      <div class="look-actions">
        <button class="btn ghost small" disabled={!inst()?.look} title="Bu overlay'in görünümünü sil; genel temaya döner" onClick={() => replace(undefined)}>
          Varsayılana dön
        </button>
        <button class="btn ghost small" disabled={!has()} onClick={() => (setLookClipboard({ ...look() }), flash("Görünüm kopyalandı"))}>
          Görünümü kopyala
        </button>
        <button class="btn ghost small" disabled={!lookClipboard()} onClick={() => replace(lookClipboard() ?? undefined)}>
          Görünümü yapıştır
        </button>
        <button class="btn ghost small" disabled={proLock()} title="Bu düzendeki bütün overlay'ler bu görünümü alır" onClick={applyAll}>
          Tüm overlay'lere uygula
        </button>
      </div>
      <Show when={note()}>
        <small class="f2-hint look-note">{note()}</small>
      </Show>
    </div>
  );
}
