// Manifestteki ayar şemasından otomatik form üretir (anahtar, kaydırıcı, seçim, çoklu seçim,
// sıralanabilir liste, renk, metin, resim).

import { For, Show, createSignal } from "solid-js";
import { fieldVisible, orderValue, type SettingField } from "@/sdk/overlay";
import { isPro } from "@/cloud/account";
import { optionLocked, optionRequiresPro, settingLocked, settingRequiresPro } from "@/sdk/proFeatures";
import { ProLockNote } from "./ProLock";
import { go } from "../ui";

type Of<T extends SettingField["type"]> = Extract<SettingField, { type: T }>;

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch" classList={{ disabled: props.disabled }}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <i />
    </label>
  );
}

/** Değeri kutunun içinde yazan, dolan kaydırıcı (Edge tarzı).
 * Fareyle sürükleme kendi işaretçi olaylarımızla yapılır (yerel kaydırıcı bazı durumlarda tutulamıyordu);
 * klavye (ok tuşları) için görünmez bir range kutusu durur. */
export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onInput: (v: number) => void;
}) {
  const pct = () => ((props.value - props.min) / Math.max(1e-9, props.max - props.min)) * 100;
  const [dragging, setDragging] = createSignal(false);
  let box: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const valueAt = (clientX: number) => {
    const r = box!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    const st = props.step ?? 1;
    const v = props.min + Math.round((k * (props.max - props.min)) / st) * st;
    // Ondalık adımlarda kayan nokta artıklarını temizle
    const dec = String(st).includes(".") ? String(st).split(".")[1].length : 0;
    return Math.min(props.max, Math.max(props.min, Number(v.toFixed(dec))));
  };
  let last = NaN;
  const apply = (clientX: number) => {
    const v = valueAt(clientX);
    if (v !== last) {
      last = v;
      if (v !== props.value) props.onInput(v);
    }
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    input?.focus();
    last = NaN;
    setDragging(true);
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(false);
    };
    // Pencere düzeyinde dinlenir: form yeniden çizilse ya da fare kutudan çıksa da sürükleme sürer
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return (
    <div class="fslider" classList={{ dragging: dragging() }} ref={box} style={{ "--p": `${Math.max(0, Math.min(100, pct()))}%` }} onPointerDown={down}>
      <span class="fslider-val">
        {props.format ? props.format(props.value) : props.value}
        {props.unit ? ` ${props.unit}` : ""}
      </span>
      <input
        ref={input}
        type="range"
        tabIndex={0}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
      />
    </div>
  );
}

export function Stepper(props: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const st = () => props.step ?? 1;
  const set = (v: number) => props.onChange(Math.min(props.max, Math.max(props.min, Math.round(v / st()) * st())));
  return (
    <div class="stepper">
      <button onClick={() => set(props.value - st())} disabled={props.value <= props.min}>
        −
      </button>
      <b>{props.value}</b>
      <button onClick={() => set(props.value + st())} disabled={props.value >= props.max}>
        +
      </button>
    </div>
  );
}

function OrderList(props: { f: Of<"order">; value: unknown; onChange: (v: unknown) => void }) {
  const list = () => orderValue(props.f, props.value);
  const label = (k: string) => props.f.options.find((o) => o.value === k)?.label ?? k;
  const [drag, setDrag] = createSignal<number | null>(null);
  const move = (from: number, to: number) => {
    const l = [...list()];
    const [x] = l.splice(from, 1);
    l.splice(to, 0, x);
    props.onChange(l);
  };
  return (
    <div class="olist">
      <For each={list()}>
        {(it, i) => (
          <div
            class="olist-row"
            classList={{ off: !it.on, dragging: drag() === i() }}
            draggable={true}
            onDragStart={(e) => {
              setDrag(i());
              e.dataTransfer?.setData("text/plain", String(i()));
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = drag();
              if (from !== null && from !== i()) move(from, i());
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
          >
            <span class="olist-grip">⠿</span>
            <span class="olist-name">{label(it.key)}</span>
            <button class="olist-arrow" disabled={i() === 0} onClick={() => move(i(), i() - 1)} title="Yukarı">
              ▲
            </button>
            <button class="olist-arrow" disabled={i() === list().length - 1} onClick={() => move(i(), i() + 1)} title="Aşağı">
              ▼
            </button>
            <Switch checked={it.on} onChange={(on) => props.onChange(list().map((x, j) => (j === i() ? { ...x, on } : x)))} />
          </div>
        )}
      </For>
    </div>
  );
}

function MultiList(props: { f: Of<"multi">; value: unknown; onChange: (v: unknown) => void }) {
  const sel = () => (Array.isArray(props.value) ? (props.value as string[]) : props.f.default);
  const full = () => props.f.max !== undefined && sel().length >= props.f.max;
  return (
    <div class="mlist">
      <For each={props.f.options}>
        {(o) => {
          const on = () => sel().includes(o.value);
          return (
            <label class="check" classList={{ disabled: !on() && full() }}>
              <input
                type="checkbox"
                checked={on()}
                disabled={!on() && full()}
                onChange={(e) => props.onChange(e.currentTarget.checked ? [...sel(), o.value] : sel().filter((x) => x !== o.value))}
              />
              <span>{o.label}</span>
            </label>
          );
        }}
      </For>
    </div>
  );
}

/** Seçilen resmi oranını koruyarak en fazla `max` piksele küçültür, PNG data URL döner (ICO/SVG dahil tarayıcının açabildiği her biçim). */
export function shrinkImage(file: File, max = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) return reject(new Error("too-big"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        // Boyutu olmayan SVG'ler 0 döner: kare kabul et
        let w = img.naturalWidth || max;
        let h = img.naturalHeight || max;
        const k = Math.min(1, max / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * k));
        const th = Math.max(1, Math.round(h * k));
        // Büyük resimleri adım adım yarıya indir (tek seferde küçültmek tırtıklı olur)
        let src: CanvasImageSource = img;
        while (w / 2 >= tw * 1.5 && h / 2 >= th * 1.5) {
          const c = document.createElement("canvas");
          c.width = Math.round(w / 2);
          c.height = Math.round(h / 2);
          const cx = c.getContext("2d")!;
          cx.imageSmoothingQuality = "high";
          cx.drawImage(src, 0, 0, c.width, c.height);
          src = c;
          w = c.width;
          h = c.height;
        }
        const c = document.createElement("canvas");
        c.width = tw;
        c.height = th;
        const cx = c.getContext("2d")!;
        cx.imageSmoothingQuality = "high";
        cx.drawImage(src, 0, 0, tw, th);
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function ImagePick(props: { f: Of<"image">; value: unknown; onChange: (v: unknown) => void }) {
  const [err, setErr] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let input: HTMLInputElement | undefined;
  const val = () => (typeof props.value === "string" ? props.value : "");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      props.onChange(await shrinkImage(file, props.f.maxSize ?? 128));
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "too-big"
          ? "Dosya çok büyük (en fazla 20 MB)."
          : "Bu dosya açılamadı. PNG, JPG, WEBP, ICO ya da SVG dene.",
      );
    } finally {
      setBusy(false);
      if (input) input.value = "";
    }
  };
  return (
    <div class="f2-image">
      <div class="f2-image-prev" classList={{ empty: !val() }}>
        <Show when={val()} fallback={<span>—</span>}>
          <img src={val()} alt="" />
        </Show>
      </div>
      <div class="f2-image-btns">
        <button class="btn small" disabled={busy()} onClick={() => input?.click()}>
          {busy() ? "Hazırlanıyor…" : val() ? "Değiştir" : "Resim seç"}
        </button>
        <Show when={val()}>
          <button class="btn ghost small" onClick={() => props.onChange("")}>
            Kaldır
          </button>
        </Show>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.ico"
        style={{ display: "none" }}
        onChange={(e) => pick(e.currentTarget.files?.[0])}
      />
      <Show when={err()}>
        <small class="f2-hint f2-err">{err()}</small>
      </Show>
    </div>
  );
}

export function SettingsForm(props: {
  fields: SettingField[];
  values: Record<string, any>;
  onChange: (key: string, value: unknown) => void;
  /** Overlay kimliği: PRO seçenekler yöneticinin PRO özellikleri kararına göre (overlay.<id>.<ayar>.<değer>) */
  overlayId?: string;
  /** Verilirse kilitli (PRO) seçenekler seçilebilir ama kaydedilmez: sadece önizlemede gösterilir */
  onPreview?: (key: string, value: unknown) => void;
  /** Önizlemede gösterilen (kaydedilmemiş) değerler */
  previewValues?: Record<string, unknown>;
}) {
  // PRO notu: seçim alanında en az bir seçenek hâlâ kilitliyse (yönetici hepsini açtıysa gösterme)
  // Ayarın tamamı PRO'ya ayrılmış ve kullanıcı PRO değil: varsayılan değerde kilitli gösterilir
  const locked = (f: SettingField) => settingLocked(props.overlayId, f);
  const val = (f: SettingField): any => (locked(f) ? f.default : props.values[f.key]);
  const change = (f: SettingField, v: unknown) => {
    if (!locked(f)) props.onChange(f.key, v);
  };
  const Tag = (t: { f: SettingField }) => (
    <Show when={settingRequiresPro(props.overlayId, t.f)}>
      {" "}
      <span class="pro-badge small" title="PRO üyelere özel">
        PRO
      </span>
    </Show>
  );
  const showProHint = (f: SettingField) =>
    !!f.proHint && !isPro() && (f.type !== "select" || f.options.some((o) => optionLocked(props.overlayId, f.key, o)));
  return (
    <div class="form2">
      <For each={props.fields}>
        {(f) => (
          <Show when={fieldVisible(f, props.values)}>
            <div class={`f2 f2-${f.type}`} classList={{ "f2-locked": locked(f) }}>
              <Show when={f.type === "boolean"}>
                <div class="f2-row">
                  <span class="f2-label">
                    {f.label}
                    <Tag f={f} />
                  </span>
                  <Switch checked={!!val(f)} disabled={locked(f)} onChange={(v) => change(f, v)} />
                </div>
                <Show when={f.resetKeys?.length && val(f)}>
                  <button
                    class="btn ghost small"
                    disabled={locked(f)}
                    onClick={() => props.fields.filter((g) => f.resetKeys!.includes(g.key)).forEach((g) => change(g, g.default))}
                  >
                    {f.resetLabel ?? "Varsayılana dön"}
                  </button>
                </Show>
              </Show>
              <Show when={f.type === "number" && (f as Of<"number">)}>
                {(nf) => (
                  <Show
                    when={nf().ui === "stepper"}
                    fallback={
                      <>
                        <div class="f2-cap">
                          {nf().label}
                          <Tag f={f} />
                        </div>
                        <Slider
                          value={val(f)}
                          min={nf().min}
                          max={nf().max}
                          step={nf().step}
                          unit={nf().unit}
                          onInput={(v) => change(f, v)}
                        />
                      </>
                    }
                  >
                    <div class="f2-row">
                      <span class="f2-label">
                        {nf().label}
                        <Tag f={f} />
                      </span>
                      <Stepper value={val(f)} min={nf().min} max={nf().max} step={nf().step} onChange={(v) => change(f, v)} />
                    </div>
                  </Show>
                )}
              </Show>
              <Show when={f.type === "select" && (f as Of<"select">)}>
                {(sf) => (
                  <>
                    <div class="f2-cap">{sf().label}</div>
                    <select
                      class="f2-select"
                      value={(props.previewValues?.[f.key] as string | undefined) ?? props.values[f.key]}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        const o = sf().options.find((x) => x.value === v);
                        if (o && optionLocked(props.overlayId, f.key, o) && props.onPreview) {
                          // PRO tasarım: görsün ama kaydedilmesin
                          props.onPreview(f.key, v);
                          return;
                        }
                        props.onPreview?.(f.key, undefined);
                        props.onChange(f.key, v);
                      }}
                    >
                      <For each={sf().options}>
                        {(o) => (
                          <option
                            value={o.value}
                            selected={((props.previewValues?.[f.key] as string | undefined) ?? props.values[f.key]) === o.value}
                            disabled={!props.onPreview && optionLocked(props.overlayId, f.key, o)}
                          >
                            {o.label}
                            {optionRequiresPro(props.overlayId, f.key, o) ? " · PRO" : ""}
                          </option>
                        )}
                      </For>
                    </select>
                    <Show when={props.previewValues?.[f.key] !== undefined}>
                      <div class="f2-preview-note">
                        <span class="pro-badge small">PRO</span> Önizleme: bu seçenek PRO üyelere özel, kaydedilmedi. Overlay'de kullanmak için PRO
                        gerekir.{" "}
                        <button class="link" onClick={() => props.onPreview?.(f.key, undefined)}>
                          Önizlemeyi kapat
                        </button>
                        {" · "}
                        <button class="link" onClick={() => go("pro")}>
                          PRO'ya bak
                        </button>
                      </div>
                    </Show>
                  </>
                )}
              </Show>
              <Show when={f.type === "text"}>
                <div class="f2-cap">
                  {f.label}
                  <Tag f={f} />
                </div>
                <input
                  class="input f2-text"
                  type="text"
                  value={val(f) ?? ""}
                  disabled={locked(f)}
                  placeholder={(f as Of<"text">).placeholder ?? ""}
                  onChange={(e) => change(f, e.currentTarget.value.trim())}
                />
              </Show>
              <Show when={f.type === "image" && (f as Of<"image">)}>
                {(imf) => (
                  <>
                    <div class="f2-cap">
                      {imf().label}
                      <Tag f={f} />
                    </div>
                    <ImagePick f={imf()} value={val(f)} onChange={(v) => change(f, v)} />
                  </>
                )}
              </Show>
              <Show when={f.type === "color"}>
                <label class="f2-row f2-colorrow">
                  <span class="f2-label">
                    {f.label}
                    <Tag f={f} />
                  </span>
                  <span class="f2-colorpick">
                    <input type="color" value={val(f)} disabled={locked(f)} onInput={(e) => change(f, e.currentTarget.value)} />
                    <code data-no-i18n>{String(val(f) ?? "").toUpperCase()}</code>
                  </span>
                </label>
              </Show>
              <Show when={f.type === "multi" && (f as Of<"multi">)}>
                {(mf) => (
                  <>
                    <div class="f2-cap">
                      {mf().label}
                      <Show when={mf().max}>
                        {" "}
                        ({(Array.isArray(val(f)) ? val(f) : mf().default).length}/{mf().max})
                      </Show>
                      <Tag f={f} />
                    </div>
                    <MultiList f={mf()} value={val(f)} onChange={(v) => change(f, v)} />
                  </>
                )}
              </Show>
              <Show when={f.type === "order" && (f as Of<"order">)}>
                {(of) => (
                  <>
                    <div class="f2-cap">
                      {of().label}
                      <Tag f={f} />
                    </div>
                    <OrderList f={of()} value={val(f)} onChange={(v) => change(f, v)} />
                  </>
                )}
              </Show>
              <Show when={f.hint}>
                <small class="f2-hint">{f.hint}</small>
              </Show>
              <Show when={locked(f)}>
                <ProLockNote text="Bu ayarı değiştirmek PRO üyelere özel; overlay varsayılan değeri kullanır." />
              </Show>
              <Show when={showProHint(f)}>
                <small class="f2-hint f2-prohint">
                  <span class="pro-badge small">PRO</span> {f.proHint}
                </small>
              </Show>
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
