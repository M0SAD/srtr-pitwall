// Manifestteki ayar şemasından otomatik form üretir (anahtar, kaydırıcı, seçim, çoklu seçim,
// sıralanabilir liste, renk, metin).

import { For, Show, createSignal } from "solid-js";
import { fieldVisible, orderValue, type SettingField } from "@/sdk/overlay";

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

export function SettingsForm(props: {
  fields: SettingField[];
  values: Record<string, any>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div class="form2">
      <For each={props.fields}>
        {(f) => (
          <Show when={fieldVisible(f, props.values)}>
            <div class={`f2 f2-${f.type}`}>
              <Show when={f.type === "boolean"}>
                <div class="f2-row">
                  <span class="f2-label">{f.label}</span>
                  <Switch checked={!!props.values[f.key]} onChange={(v) => props.onChange(f.key, v)} />
                </div>
              </Show>
              <Show when={f.type === "number" && (f as Of<"number">)}>
                {(nf) => (
                  <Show
                    when={nf().ui === "stepper"}
                    fallback={
                      <>
                        <div class="f2-cap">{nf().label}</div>
                        <Slider
                          value={props.values[f.key]}
                          min={nf().min}
                          max={nf().max}
                          step={nf().step}
                          unit={nf().unit}
                          onInput={(v) => props.onChange(f.key, v)}
                        />
                      </>
                    }
                  >
                    <div class="f2-row">
                      <span class="f2-label">{nf().label}</span>
                      <Stepper value={props.values[f.key]} min={nf().min} max={nf().max} step={nf().step} onChange={(v) => props.onChange(f.key, v)} />
                    </div>
                  </Show>
                )}
              </Show>
              <Show when={f.type === "select" && (f as Of<"select">)}>
                {(sf) => (
                  <>
                    <div class="f2-cap">{sf().label}</div>
                    <select class="f2-select" value={props.values[f.key]} onChange={(e) => props.onChange(f.key, e.currentTarget.value)}>
                      <For each={sf().options}>
                        {(o) => (
                          <option value={o.value} selected={props.values[f.key] === o.value}>
                            {o.label}
                          </option>
                        )}
                      </For>
                    </select>
                  </>
                )}
              </Show>
              <Show when={f.type === "text"}>
                <div class="f2-cap">{f.label}</div>
                <input
                  class="input f2-text"
                  type="text"
                  value={props.values[f.key] ?? ""}
                  placeholder={(f as Of<"text">).placeholder ?? ""}
                  onChange={(e) => props.onChange(f.key, e.currentTarget.value.trim())}
                />
              </Show>
              <Show when={f.type === "color"}>
                <label class="f2-row f2-colorrow">
                  <span class="f2-label">{f.label}</span>
                  <span class="f2-colorpick">
                    <input type="color" value={props.values[f.key]} onInput={(e) => props.onChange(f.key, e.currentTarget.value)} />
                    <code data-no-i18n>{String(props.values[f.key] ?? "").toUpperCase()}</code>
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
                        ({(Array.isArray(props.values[f.key]) ? props.values[f.key] : mf().default).length}/{mf().max})
                      </Show>
                    </div>
                    <MultiList f={mf()} value={props.values[f.key]} onChange={(v) => props.onChange(f.key, v)} />
                  </>
                )}
              </Show>
              <Show when={f.type === "order" && (f as Of<"order">)}>
                {(of) => (
                  <>
                    <div class="f2-cap">{of().label}</div>
                    <OrderList f={of()} value={props.values[f.key]} onChange={(v) => props.onChange(f.key, v)} />
                  </>
                )}
              </Show>
              <Show when={f.hint}>
                <small class="f2-hint">{f.hint}</small>
              </Show>
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
