// Dashboard Tasarımcısı (PRO: dashboard.designer): Direksiyon Ekranı için kendi tasarımını yap.
// Solda tasarımlar ve bileşen paleti, ortada tuval (sürükle / boyutlandır, ızgaraya yapışır), sağda seçili
// bileşenin özellikleri. Çizim src/dash/Render.tsx ile yapılır: overlay ve uzak sayfa da aynı bileşeni kullanır.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { settings, updateSettings } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import * as I from "@/app/icons";
import {
  CANVAS_PRESETS,
  FIELDS,
  MAX_DASHES,
  MAX_IMAGE,
  MAX_PAGES,
  MAX_WIDGETS,
  PALETTE,
  TEMPLATES,
  cloneDash,
  fieldOf,
  newDash,
  newId,
  newPage,
  newWidget,
  sanitizeDash,
  typeLabel,
  type ColorRule,
  type CustomDash,
  type DashWidget,
  type PaletteItem,
  type WidgetProps,
  type WidgetType,
} from "./model";
import { DashCanvas, pageOf } from "./Render";
import { DASH_TOPICS, useDemoDash, useLiveDash } from "./data";
import "./designer.css";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Hangi bileşen türünde hangi özellik grupları görünür */
const HAS: Record<string, WidgetType[]> = {
  field: ["value", "bar", "radial", "deltaBar"],
  label: ["value", "bar", "radial"],
  font: ["value", "gear", "radial", "tyres", "flag", "label"],
  color: ["value", "gear", "bar", "radial", "tyres", "label"],
  align: ["value", "gear", "label"],
  decimals: ["value", "radial", "tyres"],
  range: ["bar", "radial"],
  vertical: ["bar", "rpmBar", "rpmLeds"],
  rpm: ["rpmBar", "rpmLeds", "gear", "deltaBar"],
  rules: ["value", "bar", "radial"],
};
const has = (k: keyof typeof HAS, w: DashWidget) => HAS[k].includes(w.type);

const GROUPS = (list: { group: string }[]) => [...new Set(list.map((x) => x.group))];

/** Resmi küçültüp data URL yapar (en fazla `max` px; sınırı aşarsa JPEG'e düşer) */
async function readImage(file: File, max = 640): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("resim"));
      img.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL("image/png");
    if (out.length > MAX_IMAGE) out = c.toDataURL("image/jpeg", 0.8);
    return out.length <= MAX_IMAGE ? out : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DashDesigner() {
  const dashes = () => settings().dashes;
  const [curId, setCurId] = createSignal<string>(dashes()[0]?.id ?? "");
  // Üzerinde çalışılan kopya: sürüklerken her karede ayarların tamamı kopyalanmasın diye yerelde tutulur,
  // değişiklikler kısa bir gecikmeyle ayarlara yazılır.
  const [draft, setDraft] = createSignal<CustomDash | null>(null);
  const [page, setPage] = createSignal(0);
  const [sel, setSel] = createSignal<string[]>([]);
  const [grid, setGrid] = createSignal(10);
  const [live, setLive] = createSignal(false);
  const [msg, setMsg] = createSignal("");
  const [palGroup, setPalGroup] = createSignal(PALETTE[0].group);
  const [k, setK] = createSignal(1);
  let stage: HTMLDivElement | undefined;
  let fileIn!: HTMLInputElement;
  let imgIn!: HTMLInputElement;

  // --- Kayıt ------------------------------------------------------------------
  let saveTimer: number | undefined;
  let dirty = false;
  const flush = () => {
    clearTimeout(saveTimer);
    const d = draft();
    if (!dirty || !d) return;
    dirty = false;
    updateSettings((s) => {
      const i = s.dashes.findIndex((x) => x.id === d.id);
      if (i >= 0) s.dashes[i] = structuredClone(d);
    });
  };
  onCleanup(flush);

  // Seçili tasarım değişince (ya da dışarıdan silinince) kopyayı yenile
  createEffect(
    on(curId, (id) => {
      flush();
      const d = dashes().find((x) => x.id === id);
      setDraft(d ? structuredClone(d) : null);
      setPage(0);
      setSel([]);
      undo.length = 0;
      redo.length = 0;
    }),
  );
  createEffect(() => {
    if (!dashes().some((x) => x.id === curId())) setCurId(dashes()[0]?.id ?? "");
  });

  // --- Geri al ------------------------------------------------------------------
  const undo: string[] = [];
  const redo: string[] = [];
  const [histV, setHistV] = createSignal(0);
  const snapshot = () => {
    const d = draft();
    if (!d) return;
    undo.push(JSON.stringify(d));
    if (undo.length > 60) undo.shift();
    redo.length = 0;
    setHistV((v) => v + 1);
  };
  const stepHist = (from: string[], to: string[]) => {
    const d = draft();
    const prev = from.pop();
    if (!d || !prev) return;
    to.push(JSON.stringify(d));
    setDraft(JSON.parse(prev));
    setHistV((v) => v + 1);
    dirty = true;
    saveTimer = window.setTimeout(flush, 300);
  };

  /** Tasarımı değiştir. `snap`: geri alma noktası oluştur (sürüklemede sadece başta). */
  const mutate = (fn: (d: CustomDash) => void, snap = true) => {
    const d = draft();
    if (!d) return;
    if (snap) snapshot();
    const c = structuredClone(d);
    fn(c);
    setDraft(c);
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 300);
  };

  const curPage = () => {
    const d = draft();
    return d ? pageOf(d, page()) : undefined;
  };
  const pageIdx = (d: CustomDash) => ((page() % d.pages.length) + d.pages.length) % d.pages.length;
  const widgets = () => curPage()?.widgets ?? [];
  const selected = createMemo(() => widgets().filter((w) => sel().includes(w.id)));
  const one = () => (selected().length === 1 ? selected()[0] : undefined);
  /** Seçili bileşen(ler)i değiştir */
  const edit = (fn: (w: DashWidget) => void, snap = true) =>
    mutate((d) => {
      for (const w of d.pages[pageIdx(d)].widgets) if (sel().includes(w.id)) fn(w);
    }, snap);
  const setProp = <K extends keyof WidgetProps>(key: K, v: WidgetProps[K] | undefined, snap = true) =>
    edit((w) => {
      if (v === undefined || v === "") delete w.props[key];
      else w.props[key] = v;
    }, snap);

  // --- Tasarım listesi -------------------------------------------------------
  const flash = (s: string) => {
    setMsg(s);
    window.setTimeout(() => msg() === s && setMsg(""), 4000);
  };
  const addDash = (d: CustomDash) => {
    if (dashes().length >= MAX_DASHES) return flash(t("En fazla 20 tasarım saklanabilir"));
    flush();
    const names = new Set(dashes().map((x) => x.name));
    let name = d.name;
    for (let i = 2; names.has(name); i++) name = `${d.name} ${i}`;
    d.name = name;
    updateSettings((s) => void s.dashes.push(d));
    setCurId(d.id);
  };
  const removeDash = () => {
    const d = draft();
    if (!d || !window.confirm(t("Bu tasarım silinsin mi?"))) return;
    dirty = false;
    clearTimeout(saveTimer);
    updateSettings((s) => {
      s.dashes = s.dashes.filter((x) => x.id !== d.id);
    });
  };
  const exportDash = async () => {
    const d = draft();
    if (!d) return;
    const text = JSON.stringify(d, null, 2);
    const fname = `${d.name.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "dashboard"}.json`;
    try {
      if (inTauri) {
        const path = await saveDialog({ defaultPath: fname, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (!path) return;
        await invoke("dash_export", { path, text });
        flash(t("Dışa aktarıldı"));
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = fname;
        a.click();
      }
    } catch (e) {
      flash(String(e));
    }
  };
  const importDash = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const d = sanitizeDash(raw);
      if (!d) throw new Error("bad");
      addDash(cloneDash(d, d.name));
      flash(t("İçe aktarıldı"));
    } catch {
      flash(t("Dosya okunamadı: geçerli bir dashboard tasarımı değil"));
    }
  };

  // --- Bileşenler ---------------------------------------------------------------
  const snapV = (v: number) => (grid() > 1 ? Math.round(v / grid()) * grid() : Math.round(v));
  const addWidget = (it: PaletteItem) => {
    const d = draft();
    if (!d) return;
    if (widgets().length >= MAX_WIDGETS) return flash(t("Bir sayfada en fazla 80 bileşen olabilir"));
    const w = newWidget(it, snapV(Math.max(0, (d.width - it.w) / 2)), snapV(Math.max(0, (d.height - it.h) / 2)));
    mutate((c) => void c.pages[pageIdx(c)].widgets.push(w));
    setSel([w.id]);
  };
  const removeSel = () => {
    if (!sel().length) return;
    mutate((d) => {
      const p = d.pages[pageIdx(d)];
      p.widgets = p.widgets.filter((w) => !sel().includes(w.id));
    });
    setSel([]);
  };
  const duplicateSel = () => {
    const ids: string[] = [];
    mutate((d) => {
      const p = d.pages[pageIdx(d)];
      for (const w of p.widgets.filter((x) => sel().includes(x.id))) {
        if (p.widgets.length >= MAX_WIDGETS) break;
        const c = structuredClone(w);
        c.id = newId();
        c.x += 20;
        c.y += 20;
        ids.push(c.id);
        p.widgets.push(c);
      }
    });
    setSel(ids);
  };
  const reorder = (front: boolean) =>
    mutate((d) => {
      const p = d.pages[pageIdx(d)];
      const pick = p.widgets.filter((w) => sel().includes(w.id));
      const rest = p.widgets.filter((w) => !sel().includes(w.id));
      p.widgets = front ? [...rest, ...pick] : [...pick, ...rest];
    });
  const alignSel = (how: "l" | "c" | "r" | "t" | "m" | "b") =>
    mutate((d) => {
      const ws = d.pages[pageIdx(d)].widgets.filter((w) => sel().includes(w.id));
      // Tek bileşen tuvale, birden çok bileşen birbirine hizalanır
      const box = ws.length > 1 ? { x0: Math.min(...ws.map((w) => w.x)), y0: Math.min(...ws.map((w) => w.y)), x1: Math.max(...ws.map((w) => w.x + w.w)), y1: Math.max(...ws.map((w) => w.y + w.h)) } : { x0: 0, y0: 0, x1: d.width, y1: d.height };
      for (const w of ws) {
        if (how === "l") w.x = box.x0;
        if (how === "r") w.x = box.x1 - w.w;
        if (how === "c") w.x = Math.round((box.x0 + box.x1 - w.w) / 2);
        if (how === "t") w.y = box.y0;
        if (how === "b") w.y = box.y1 - w.h;
        if (how === "m") w.y = Math.round((box.y0 + box.y1 - w.h) / 2);
      }
    });

  // --- Tuval: seçme, taşıma, boyutlandırma ----------------------------------------
  let canvasEl: HTMLDivElement | undefined;
  const toDesign = (e: PointerEvent) => {
    const r = canvasEl!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k(), y: (e.clientY - r.top) / k() };
  };
  const hit = (x: number, y: number) => {
    const ws = widgets();
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    }
    return undefined;
  };
  const drag = (e: PointerEvent, handle?: Handle) => {
    if (e.button !== 0 || !draft()) return;
    e.preventDefault();
    e.stopPropagation();
    const p0 = toDesign(e);
    if (!handle) {
      const w = hit(p0.x, p0.y);
      if (!w) return setSel([]);
      if (e.shiftKey || e.ctrlKey) setSel(sel().includes(w.id) ? sel().filter((x) => x !== w.id) : [...sel(), w.id]);
      else if (!sel().includes(w.id)) setSel([w.id]);
    }
    const start = new Map(selected().map((w) => [w.id, { x: w.x, y: w.y, w: w.w, h: w.h }]));
    if (!start.size) return;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toDesign(ev);
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      const first = !moved;
      moved = true;
      mutate((d) => {
        for (const w of d.pages[pageIdx(d)].widgets) {
          const s = start.get(w.id);
          if (!s) continue;
          if (!handle) {
            w.x = snapV(s.x + dx);
            w.y = snapV(s.y + dy);
            continue;
          }
          let x0 = s.x;
          let y0 = s.y;
          let x1 = s.x + s.w;
          let y1 = s.y + s.h;
          if (handle.includes("w")) x0 = Math.min(snapV(s.x + dx), x1 - 4);
          if (handle.includes("e")) x1 = Math.max(snapV(s.x + s.w + dx), x0 + 4);
          if (handle.includes("n")) y0 = Math.min(snapV(s.y + dy), y1 - 2);
          if (handle.includes("s")) y1 = Math.max(snapV(s.y + s.h + dy), y0 + 2);
          w.x = x0;
          w.y = y0;
          w.w = x1 - x0;
          w.h = y1 - y0;
        }
      }, first);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
    if (!draft()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? stepHist(redo, undo) : stepHist(undo, redo);
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return stepHist(redo, undo);
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      return setSel(widgets().map((w) => w.id));
    }
    if (!sel().length) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return removeSel();
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      return duplicateSel();
    }
    if (e.key === "Escape") return setSel([]);
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (dx || dy) {
      e.preventDefault();
      edit((w) => {
        w.x += dx;
        w.y += dy;
      });
    }
  };
  onMount(() => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", fit);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fit);
      ro.disconnect();
    });
  });
  // Tuval alanı tasarım seçilince oluşur: gözlemci ref ile bağlanır
  const ro = new ResizeObserver(() => fit());
  const fit = () => {
    const d = draft();
    if (!d || !stage) return;
    const w = stage.clientWidth - 24;
    const h = Math.max(240, window.innerHeight - 300);
    setK(Math.max(0.1, Math.min(1.5, w / d.width, h / d.height)));
  };
  createEffect(() => {
    draft()?.width;
    draft()?.height;
    fit();
  });

  // --- Veri: örnek (hareketli) ya da canlı ---------------------------------------
  const setSubs = useSubscriptions([]);
  createEffect(() => setSubs(live() ? DASH_TOPICS : []));
  const liveData = useLiveDash();
  const demo = useDemoDash(() => !live());
  const tel = useTopic("telemetry");
  const data = () => (live() && tel() ? liveData() : demo());

  // --- Küçük form parçaları -------------------------------------------------------
  const Num = (p: { label: string; value: number | undefined; onInput: (v: number) => void; min?: number; max?: number; step?: number; ph?: string }) => (
    <label class="dd-f">
      <span>{p.label}</span>
      <input
        class="input"
        type="number"
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        placeholder={p.ph}
        value={p.value ?? ""}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (e.currentTarget.value !== "" && isFinite(v)) p.onInput(Math.max(p.min ?? -1e6, Math.min(p.max ?? 1e6, v)));
        }}
      />
    </label>
  );
  const Col = (p: { label: string; value: string | undefined; fallback: string; onInput: (v: string | undefined) => void; clear?: boolean }) => (
    <label class="dd-f dd-col">
      <span>{p.label}</span>
      <input type="color" value={p.value || p.fallback} onInput={(e) => p.onInput(e.currentTarget.value)} />
      <Show when={p.clear !== false && p.value}>
        <button class="link" title="Varsayılan renge dön" onClick={() => p.onInput(undefined)}>
          <I.X />
        </button>
      </Show>
    </label>
  );
  const Sel = (p: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) => (
    <label class="dd-f">
      <span>{p.label}</span>
      <select class="input" value={p.value} onChange={(e) => p.onChange(e.currentTarget.value)}>
        <For each={p.options}>
          {([v, l]) => (
            <option value={v} selected={v === p.value}>
              {l}
            </option>
          )}
        </For>
      </select>
    </label>
  );
  const Chk = (p: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <label class="dd-chk">
      <input type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.currentTarget.checked)} />
      <span>{p.label}</span>
    </label>
  );
  const FieldSel = (p: { label: string; value: string | undefined; onChange: (v: string) => void; numeric?: boolean; empty?: string }) => (
    <label class="dd-f">
      <span>{p.label}</span>
      <select class="input" value={p.value ?? ""} onChange={(e) => p.onChange(e.currentTarget.value)}>
        <Show when={p.empty}>
          <option value="">{p.empty}</option>
        </Show>
        <For each={GROUPS(FIELDS)}>
          {(g) => (
            <optgroup label={t(g)}>
              <For each={FIELDS.filter((f) => f.group === g && (!p.numeric || f.fmt !== "text"))}>
                {(f) => (
                  <option value={f.id} selected={f.id === p.value}>
                    {f.label}
                  </option>
                )}
              </For>
            </optgroup>
          )}
        </For>
      </select>
    </label>
  );

  const Rules = (p: { w: DashWidget }) => {
    const rules = () => p.w.props.rules ?? [];
    const setRules = (fn: (r: ColorRule[]) => ColorRule[]) => edit((w) => void (w.props.rules = fn(structuredClone(w.props.rules ?? []))));
    return (
      <div class="dd-rules">
        <div class="dd-sub">Koşullu renk</div>
        <FieldSel label="Baktığı alan" value={p.w.props.ruleField} onChange={(v) => setProp("ruleField", v)} numeric empty="Bileşenin kendi alanı" />
        <For each={rules()}>
          {(r, i) => (
            <div class="dd-rule">
              <select class="input" value={r.op} onChange={(e) => setRules((l) => ((l[i()].op = e.currentTarget.value as ColorRule["op"]), l))}>
                <option value="<">&lt;</option>
                <option value=">">&gt;</option>
                <option value="=">=</option>
              </select>
              <input class="input" type="number" step="any" value={r.v} onChange={(e) => setRules((l) => ((l[i()].v = Number(e.currentTarget.value) || 0), l))} />
              <input type="color" value={r.color} onChange={(e) => setRules((l) => ((l[i()].color = e.currentTarget.value), l))} />
              <label class="dd-chk" title="Kural geçerliyken yanıp söner">
                <input type="checkbox" checked={!!r.blink} onChange={(e) => setRules((l) => ((l[i()].blink = e.currentTarget.checked), l))} />
                <span>Yanıp sön</span>
              </label>
              <button class="btn ghost small" title="Kuralı sil" onClick={() => setRules((l) => l.filter((_, j) => j !== i()))}>
                <I.Trash />
              </button>
            </div>
          )}
        </For>
        <Show when={rules().length < 6}>
          <button class="btn ghost small" onClick={() => setRules((l) => [...l, { op: "<", v: 0, color: "#ff4a4a" }])}>
            <I.Plus /> Kural ekle
          </button>
        </Show>
        <small class="muted">Örnek: delta &lt; 0 yeşil, &gt; 0 kırmızı; yakıt &lt; 5 kırmızı ve yanıp söner. Son eşleşen kural geçerlidir.</small>
      </div>
    );
  };

  const Props = (p: { w: DashWidget }): JSX.Element => {
    const w = () => p.w;
    const pr = () => p.w.props;
    return (
      <>
        <div class="dd-sub">{typeLabel(w().type)}</div>
        <div class="dd-grid4">
          <Num label="X" value={w().x} onInput={(v) => edit((x) => void (x.x = Math.round(v)))} />
          <Num label="Y" value={w().y} onInput={(v) => edit((x) => void (x.y = Math.round(v)))} />
          <Num label="Genişlik" value={w().w} min={2} onInput={(v) => edit((x) => void (x.w = Math.round(v)))} />
          <Num label="Yükseklik" value={w().h} min={2} onInput={(v) => edit((x) => void (x.h = Math.round(v)))} />
        </div>
        <Show when={has("field", w())}>
          <FieldSel label="Veri alanı" value={pr().field} onChange={(v) => setProp("field", v)} numeric={w().type !== "value"} />
        </Show>
        <Show when={w().type === "label"}>
          <label class="dd-f">
            <span>Yazı</span>
            <input class="input" type="text" maxLength={200} value={pr().text ?? ""} onChange={(e) => setProp("text", e.currentTarget.value)} />
          </label>
        </Show>
        <Show when={has("label", w())}>
          <div class="dd-grid2">
            <label class="dd-f">
              <span>Etiket</span>
              <input class="input" type="text" maxLength={60} placeholder="Etiket yok" value={pr().label ?? ""} onChange={(e) => setProp("label", e.currentTarget.value)} />
            </label>
            <Show when={w().type === "value"}>
              <Sel
                label="Etiket yeri"
                value={pr().labelPos ?? "bottom"}
                options={[
                  ["bottom", t("Altta")],
                  ["top", t("Üstte")],
                  ["left", t("Solda")],
                ]}
                onChange={(v) => setProp("labelPos", v as WidgetProps["labelPos"])}
              />
            </Show>
            <Num label="Etiket boyutu" value={pr().labelSize ?? 14} min={6} max={120} onInput={(v) => setProp("labelSize", v)} />
            <Col label="Etiket rengi" value={pr().labelColor} fallback="#a3a3a3" onInput={(v) => setProp("labelColor", v, false)} />
          </div>
        </Show>
        <Show when={has("font", w())}>
          <div class="dd-grid2">
            <Num label="Yazı boyutu" value={pr().fontSize} ph="oto" min={6} max={600} onInput={(v) => setProp("fontSize", v)} />
            <Sel
              label="Yazı tipi"
              value={pr().font ?? ""}
              options={[
                ["", t("Tasarımın yazı tipi")],
                ["digital", t("Dijital")],
                ["mono", t("Eş aralıklı")],
                ["sans", t("Düz")],
              ]}
              onChange={(v) => setProp("font", v as WidgetProps["font"])}
            />
            <Sel
              label="Kalınlık"
              value={String(pr().weight ?? "")}
              options={[
                ["", t("Varsayılan")],
                ["400", t("Normal")],
                ["600", t("Yarı kalın")],
                ["700", t("Kalın")],
                ["800", t("Çok kalın")],
              ]}
              onChange={(v) => setProp("weight", v ? Number(v) : undefined)}
            />
            <Show when={has("align", w())}>
              <Sel
                label="Hizalama"
                value={pr().align ?? "center"}
                options={[
                  ["left", t("Sol")],
                  ["center", t("Orta")],
                  ["right", t("Sağ")],
                ]}
                onChange={(v) => setProp("align", v as WidgetProps["align"])}
              />
            </Show>
          </div>
        </Show>
        <Show when={has("decimals", w()) || w().type === "value"}>
          <div class="dd-grid2">
            <Show when={has("decimals", w())}>
              <Sel
                label="Ondalık"
                value={String(pr().decimals ?? -1)}
                options={[["-1", t("Alanın varsayılanı")], ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]]}
                onChange={(v) => setProp("decimals", Number(v) < 0 ? undefined : Number(v))}
              />
            </Show>
            <Show when={w().type === "value" && fieldOf(pr().field)?.unit}>
              <Chk label="Birimi göster" value={!!pr().showUnit} onChange={(v) => setProp("showUnit", v || undefined)} />
            </Show>
          </div>
        </Show>
        <Show when={w().type === "tyres"}>
          <Sel
            label="Gösterilen"
            value={pr().tyreMode ?? "temp"}
            options={[
              ["temp", t("Sıcaklık")],
              ["press", t("Basınç")],
              ["wear", t("Ömür")],
            ]}
            onChange={(v) => setProp("tyreMode", v as WidgetProps["tyreMode"])}
          />
        </Show>
        <Show when={has("range", w()) || w().type === "deltaBar"}>
          <div class="dd-grid2">
            <Show when={w().type !== "deltaBar"}>
              <Num label="En az" value={pr().min} ph="oto" step={0.1} onInput={(v) => setProp("min", v)} />
            </Show>
            <Num label={w().type === "deltaBar" ? "Aralık (± sn)" : "En çok"} value={pr().max} ph="oto" step={0.1} onInput={(v) => setProp("max", v)} />
          </div>
        </Show>
        <Show when={has("vertical", w())}>
          <Chk label="Dikey" value={!!pr().vertical} onChange={(v) => setProp("vertical", v || undefined)} />
        </Show>
        <Show when={w().type === "rpmLeds"}>
          <Num label="LED sayısı" value={pr().count ?? 12} min={3} max={30} onInput={(v) => setProp("count", Math.round(v))} />
        </Show>
        <Show when={w().type === "gear"}>
          <Chk label="Devire göre renk değiştir" value={!!pr().rpmColor} onChange={(v) => setProp("rpmColor", v || undefined)} />
        </Show>
        <Show when={w().type === "rpmBar" || w().type === "rpmLeds"}>
          <Chk label="Vites noktasında yanıp sön" value={!!pr().flash} onChange={(v) => setProp("flash", v || undefined)} />
        </Show>
        <Show when={w().type === "rpmBar"}>
          <div class="dd-grid2">
            <Num label="Orta bölge başlangıcı (%)" value={pr().z1 ?? 60} min={1} max={99} onInput={(v) => setProp("z1", v)} />
            <Num label="Yüksek bölge başlangıcı (%)" value={pr().z2 ?? 85} min={1} max={99} onInput={(v) => setProp("z2", v)} />
          </div>
        </Show>
        <div class="dd-sub">Renkler</div>
        <div class="dd-grid2">
          <Show when={has("color", w())}>
            <Col label={w().type === "bar" || w().type === "radial" ? "Dolgu rengi" : "Yazı rengi"} value={pr().color} fallback="#f4f4f4" onInput={(v) => setProp("color", v, false)} />
          </Show>
          <Show when={has("rpm", w()) && (w().type !== "gear" || pr().rpmColor)}>
            <Col label={w().type === "deltaBar" ? "Hızlı" : "Düşük devir"} value={pr().c1} fallback="#34e05c" onInput={(v) => setProp("c1", v, false)} />
            <Show when={w().type !== "deltaBar"}>
              <Col label="Orta devir" value={pr().c2} fallback="#ffd21f" onInput={(v) => setProp("c2", v, false)} />
            </Show>
            <Col label={w().type === "deltaBar" ? "Yavaş" : "Yüksek devir"} value={pr().c3} fallback="#e8101a" onInput={(v) => setProp("c3", v, false)} />
            <Show when={w().type !== "deltaBar"}>
              <Col label="Vites noktası" value={pr().c4} fallback="#2f8bff" onInput={(v) => setProp("c4", v, false)} />
            </Show>
          </Show>
          <Col label="Arka plan" value={pr().bg} fallback="#000000" onInput={(v) => edit((x) => { if (v) { x.props.bg = v; x.props.bgA ??= 100; } else { delete x.props.bg; delete x.props.bgA; } }, false)} />
          <Show when={pr().bg}>
            <Num label="Arka plan opaklığı (%)" value={pr().bgA ?? 100} min={0} max={100} step={5} onInput={(v) => setProp("bgA", v)} />
          </Show>
          <Col label="Kenarlık" value={pr().border} fallback="#e8101a" onInput={(v) => edit((x) => { if (v) { x.props.border = v; x.props.borderW ||= 2; } else { delete x.props.border; delete x.props.borderW; } }, false)} />
          <Show when={pr().border}>
            <Num label="Kenarlık kalınlığı" value={pr().borderW ?? 0} min={0} max={20} onInput={(v) => setProp("borderW", v)} />
          </Show>
          <Num label="Köşe yuvarlaklığı" value={pr().radius ?? 0} min={0} max={300} onInput={(v) => setProp("radius", v || undefined)} />
        </div>
        <Show when={w().type === "image"}>
          <div class="dd-row">
            <button class="btn small" onClick={() => imgIn.click()}>
              Resim seç
            </button>
            <Show when={pr().src}>
              <button class="btn ghost small" onClick={() => setProp("src", undefined)}>
                Kaldır
              </button>
            </Show>
            <Sel
              label=""
              value={pr().fit ?? "contain"}
              options={[
                ["contain", t("Sığdır")],
                ["cover", t("Doldur")],
              ]}
              onChange={(v) => setProp("fit", v as WidgetProps["fit"])}
            />
          </div>
        </Show>
        <Show when={has("rules", w())}>
          <Rules w={w()} />
        </Show>
      </>
    );
  };

  return (
    <div class="dd" data-histv={histV()}>
      <input ref={fileIn} type="file" accept=".json,application/json" hidden onChange={(e) => (void importDash(e.currentTarget.files?.[0]), (e.currentTarget.value = ""))} />
      <input
        ref={imgIn}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!f) return;
          const src = await readImage(f);
          if (src) setProp("src", src);
          else flash(t("Resim okunamadı ya da çok büyük"));
        }}
      />

      {/* ---------------- Üst şerit: tasarımlar ---------------- */}
      <div class="dd-bar">
        <select class="input dd-pick" value={curId()} onChange={(e) => setCurId(e.currentTarget.value)} disabled={!dashes().length}>
          <Show when={!dashes().length}>
            <option value="">Henüz tasarım yok</option>
          </Show>
          <For each={dashes()}>
            {(d) => (
              <option value={d.id} selected={d.id === curId()}>
                {d.name}
              </option>
            )}
          </For>
        </select>
        <select
          class="input dd-new"
          onChange={(e) => {
            const v = e.currentTarget.value;
            e.currentTarget.value = "";
            if (v === "blank") addDash(newDash(t("Tasarım")));
            else {
              const tpl = TEMPLATES.find((x) => x.id === v);
              if (tpl) addDash(tpl.make());
            }
          }}
        >
          <option value="">+ Yeni tasarım…</option>
          <option value="blank">Boş tasarım</option>
          <For each={TEMPLATES}>{(x) => <option value={x.id}>{`${t("Şablon")}: ${t(x.label)}`}</option>}</For>
        </select>
        <Show when={draft()}>
          <button class="btn ghost small" title="Kopyasını oluştur" onClick={() => (flush(), addDash(cloneDash(draft()!, `${draft()!.name} ${t("kopya")}`)))}>
            <I.Copy /> Çoğalt
          </button>
          <button class="btn ghost small" onClick={exportDash}>
            Dışa aktar
          </button>
        </Show>
        <button class="btn ghost small" onClick={() => fileIn.click()}>
          İçe aktar
        </button>
        <Show when={draft()}>
          <button class="btn ghost small danger" onClick={removeDash}>
            <I.Trash /> Sil
          </button>
        </Show>
        <span class="dd-msg">{msg()}</span>
      </div>

      <Show
        when={draft()}
        fallback={
          <section class="panel dd-empty">
            <h3>İlk tasarımını oluştur</h3>
            <p class="muted">
              Bir şablonla başla ya da boş tuvale bileşenleri kendin yerleştir. Tasarımını Overlay'ler › Direksiyon Ekranı › Görünüm › “Özel
              tasarım” ile ekrana, “Başka cihazda aç” ile telefon ya da tablete alırsın.
            </p>
            <div class="dd-tpls">
              <For each={TEMPLATES}>
                {(x) => (
                  <button class="btn" onClick={() => addDash(x.make())}>
                    {x.label}
                  </button>
                )}
              </For>
              <button class="btn ghost" onClick={() => addDash(newDash(t("Tasarım")))}>
                Boş tasarım
              </button>
            </div>
          </section>
        }
      >
        {(d) => (
          <div class="dd-body">
            {/* ---------------- Sol: tuval ayarları + palet ---------------- */}
            <aside class="dd-side">
              <div class="dd-sub">Tasarım</div>
              <label class="dd-f">
                <span>Ad</span>
                <input class="input" type="text" maxLength={60} value={d().name} onChange={(e) => mutate((c) => void (c.name = e.currentTarget.value.trim() || c.name))} />
              </label>
              <label class="dd-f">
                <span>Tuval boyutu</span>
                <select
                  class="input"
                  onChange={(e) => {
                    const p = CANVAS_PRESETS[Number(e.currentTarget.value)];
                    if (p) mutate((c) => ((c.width = p.w), (c.height = p.h)));
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">{`${d().width}×${d().height}`}</option>
                  <For each={CANVAS_PRESETS}>{(p, i) => <option value={i()}>{p.label}</option>}</For>
                </select>
              </label>
              <div class="dd-grid2">
                <Num label="Genişlik" value={d().width} min={100} max={4000} onInput={(v) => mutate((c) => void (c.width = Math.round(v)))} />
                <Num label="Yükseklik" value={d().height} min={60} max={4000} onInput={(v) => mutate((c) => void (c.height = Math.round(v)))} />
                <Col label="Arka plan" value={d().bg} fallback="#050506" clear={false} onInput={(v) => mutate((c) => void (c.bg = v ?? "#050506"), false)} />
                <Num label="Opaklık (%)" value={d().bgA} min={0} max={100} step={5} onInput={(v) => mutate((c) => void (c.bgA = v))} />
                <Sel
                  label="Yazı tipi"
                  value={d().font}
                  options={[
                    ["digital", t("Dijital")],
                    ["mono", t("Eş aralıklı")],
                    ["sans", t("Düz")],
                  ]}
                  onChange={(v) => mutate((c) => void (c.font = v as CustomDash["font"]))}
                />
                <Num label="Köşe yuvarlaklığı" value={d().radius} min={0} max={200} onInput={(v) => mutate((c) => void (c.radius = v))} />
              </div>

              <div class="dd-sub">Bileşen ekle</div>
              <div class="dd-tabs">
                <For each={GROUPS(PALETTE)}>
                  {(g) => (
                    <button classList={{ on: palGroup() === g }} onClick={() => setPalGroup(g)}>
                      {g}
                    </button>
                  )}
                </For>
              </div>
              <div class="dd-pal">
                <For each={PALETTE.filter((x) => x.group === palGroup())}>
                  {(it) => (
                    <button class="btn ghost small" onClick={() => addWidget(it)}>
                      <I.Plus /> {it.label}
                    </button>
                  )}
                </For>
              </div>
            </aside>

            {/* ---------------- Orta: tuval ---------------- */}
            <div class="dd-mid">
              <div class="dd-tools">
                <div class="dd-pages">
                  <For each={d().pages}>
                    {(p, i) => (
                      <button classList={{ on: pageIdx(d()) === i() }} onClick={() => (setPage(i()), setSel([]))} title="Sayfa">
                        {p.name}
                      </button>
                    )}
                  </For>
                  <Show when={d().pages.length < MAX_PAGES}>
                    <button
                      title="Sayfa ekle"
                      onClick={() => {
                        mutate((c) => void c.pages.push(newPage(String(c.pages.length + 1))));
                        setPage(d().pages.length);
                        setSel([]);
                      }}
                    >
                      <I.Plus />
                    </button>
                  </Show>
                </div>
                <button
                  class="btn ghost small"
                  title="Sayfayı yeniden adlandır"
                  onClick={() => {
                    const n = window.prompt(t("Sayfa adı"), curPage()?.name ?? "");
                    if (n?.trim()) mutate((c) => void (c.pages[pageIdx(c)].name = n.trim().slice(0, 30)));
                  }}
                >
                  <I.Pencil />
                </button>
                <button
                  class="btn ghost small"
                  title="Sayfayı çoğalt"
                  disabled={d().pages.length >= MAX_PAGES}
                  onClick={() => {
                    mutate((c) => {
                      const src = c.pages[pageIdx(c)];
                      c.pages.push(newPage(`${src.name} 2`, src.widgets.map((w) => ({ ...structuredClone(w), id: newId() }))));
                    });
                    setPage(d().pages.length);
                  }}
                >
                  <I.Copy />
                </button>
                <button
                  class="btn ghost small"
                  title="Sayfayı sil"
                  disabled={d().pages.length < 2}
                  onClick={() => {
                    if (!window.confirm(t("Bu sayfa silinsin mi?"))) return;
                    mutate((c) => void c.pages.splice(pageIdx(c), 1));
                    setPage(0);
                    setSel([]);
                  }}
                >
                  <I.Trash />
                </button>
                <span class="dd-gap" />
                <label class="dd-inline" title="Taşırken / boyutlandırırken ızgaraya yapış">
                  Izgara
                  <select class="input" value={grid()} onChange={(e) => setGrid(Number(e.currentTarget.value))}>
                    <option value="1">Kapalı</option>
                    <option value="5">5 px</option>
                    <option value="10">10 px</option>
                    <option value="20">20 px</option>
                  </select>
                </label>
                <label class="dd-chk" title="Açıkken simülasyondan gelen gerçek veri; kapalıyken hareketli örnek veri">
                  <input type="checkbox" checked={live()} onChange={(e) => setLive(e.currentTarget.checked)} />
                  <span>Canlı veri</span>
                </label>
                <button class="btn ghost small" disabled={(histV(), !undo.length)} onClick={() => stepHist(undo, redo)} title="Geri al (Ctrl+Z)">
                  ↶
                </button>
                <button class="btn ghost small" disabled={(histV(), !redo.length)} onClick={() => stepHist(redo, undo)} title="Yinele (Ctrl+Y)">
                  ↷
                </button>
              </div>
              <div class="dd-stage" ref={(el) => ((stage = el), ro.observe(el))}>
                <div class="dd-scale" style={{ width: `${d().width * k()}px`, height: `${d().height * k()}px` }}>
                  <div
                    class="dd-canvas"
                    ref={canvasEl}
                    style={{ transform: `scale(${k()})`, width: `${d().width}px`, height: `${d().height}px`, "--dd-grid": `${Math.max(grid(), 10)}px`, "--dd-k": String(1 / k()) }}
                    onPointerDown={(e) => drag(e)}
                  >
                    <DashCanvas dash={d()} page={page()} data={data} units={settings().general.units} design>
                      <div class="dd-gridlines" classList={{ off: grid() <= 1 }} />
                      <For each={selected()}>
                        {(w) => (
                          <div class="dd-selbox" style={{ left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` }}>
                            <Show when={selected().length === 1}>
                              <For each={HANDLES}>{(h) => <i class={`dd-h dd-h-${h}`} onPointerDown={(e) => drag(e, h)} />}</For>
                            </Show>
                          </div>
                        )}
                      </For>
                    </DashCanvas>
                  </div>
                </div>
              </div>
              <small class="muted dd-hint">
                Tıkla: seç · Shift+tıkla: çoklu seçim · sürükle: taşı · köşe / kenar tutamaçları: boyutlandır · ok tuşları: 1 px (Shift: 10 px) ·
                Delete: sil · Ctrl+D: çoğalt · Ctrl+Z: geri al.{" "}
                <Show when={d().pages.length > 1}>
                  Sayfalar arasında geçiş kısayolu: {shortcut("dashPage") ? prettyKey(shortcut("dashPage")) : t("atanmadı (Ayarlar › Kısayollar)")}.
                </Show>
              </small>
            </div>

            {/* ---------------- Sağ: özellikler ---------------- */}
            <aside class="dd-side dd-props">
              <Show
                when={selected().length}
                fallback={
                  <>
                    <div class="dd-sub">Bileşenler</div>
                    <Show when={widgets().length} fallback={<p class="muted">Bu sayfa boş. Soldaki paletten bileşen ekle.</p>}>
                      <div class="dd-layers">
                        <For each={[...widgets()].reverse()}>
                          {(w) => (
                            <button onClick={() => setSel([w.id])}>
                              <b>{typeLabel(w.type)}</b>
                              <span>{w.props.label || w.props.text || fieldOf(w.props.field)?.label || ""}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </>
                }
              >
                <div class="dd-row">
                  <button class="btn ghost small" onClick={duplicateSel} title="Çoğalt (Ctrl+D)">
                    <I.Copy />
                  </button>
                  <button class="btn ghost small" onClick={() => reorder(true)} title="En öne getir">
                    Öne
                  </button>
                  <button class="btn ghost small" onClick={() => reorder(false)} title="En arkaya gönder">
                    Arkaya
                  </button>
                  <button class="btn ghost small danger" onClick={removeSel} title="Sil (Delete)">
                    <I.Trash />
                  </button>
                </div>
                <div class="dd-row dd-align" title="Hizala (tek bileşen: tuvale; birden çok: birbirine)">
                  <button class="btn ghost small" onClick={() => alignSel("l")}>⇤</button>
                  <button class="btn ghost small" onClick={() => alignSel("c")}>↔</button>
                  <button class="btn ghost small" onClick={() => alignSel("r")}>⇥</button>
                  <button class="btn ghost small" onClick={() => alignSel("t")}>⤒</button>
                  <button class="btn ghost small" onClick={() => alignSel("m")}>↕</button>
                  <button class="btn ghost small" onClick={() => alignSel("b")}>⤓</button>
                </div>
                <Show when={one()} fallback={<p class="muted">{selected().length} bileşen seçili. Özellikleri düzenlemek için tek bileşen seç.</p>}>
                  {(w) => <Props w={w()} />}
                </Show>
              </Show>
            </aside>
          </div>
        )}
      </Show>
    </div>
  );
}
