// Üst çubuktaki dil seçici: seçili dilin bayrağı; tıklayınca bayrak ızgarası açılır.
// Bayraklar flag-icons SVG'leri (Windows bayrak emojisi çizmez). Seçim anında uygulanır
// (Genel → Dil ile aynı: general.language + hesap dili).

import { For, Show, createSignal, onCleanup } from "solid-js";
import { LANGS, lang } from "@/sdk/i18n";
import { flagUrl } from "@/sdk/Flag";
import { updateSettings } from "@/sdk/settings";
import { setUserLang } from "@/cloud/supabase";
import "./langpicker.css";

/** Dil kodu → ülke kodu (flag-icons) */
const FLAG_OF: Record<string, string> = {
  tr: "tr",
  en: "gb",
  de: "de",
  es: "es",
  fr: "fr",
  it: "it",
  "pt-BR": "br",
  "pt-PT": "pt",
  nl: "nl",
  pl: "pl",
  sv: "se",
  fi: "fi",
  ru: "ru",
  "zh-CN": "cn",
  ja: "jp",
};

function LangFlag(props: { code: string }) {
  return (
    <Show when={flagUrl(FLAG_OF[props.code])} fallback={<span class="lp-flag lp-flag-txt">{props.code.slice(0, 2).toUpperCase()}</span>}>
      {(u) => <img class="lp-flag" src={u()} alt="" draggable={false} />}
    </Show>
  );
}

export function LangPicker() {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  let grid: HTMLDivElement | undefined;
  const cur = () => LANGS.find((l) => l.code === lang()) ?? LANGS[0];

  const close = (focusBtn = false) => {
    setOpen(false);
    if (focusBtn) root.querySelector<HTMLButtonElement>(".lp-btn")?.focus();
  };
  const choose = (code: string) => {
    close(true);
    if (code === lang()) return;
    updateSettings((d) => (d.general.language = code));
    void setUserLang(code);
  };

  const onDocDown = (e: PointerEvent) => {
    if (open() && !root.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (open() && e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  };
  document.addEventListener("pointerdown", onDocDown, true);
  document.addEventListener("keydown", onKey);
  onCleanup(() => {
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey);
  });

  const toggle = () => {
    const v = !open();
    setOpen(v);
    if (v) queueMicrotask(() => grid?.querySelector<HTMLButtonElement>(".lp-item.on")?.focus());
  };

  // Ok tuşlarıyla ızgarada gezinme (3 sütun)
  const onGridKey = (e: KeyboardEvent) => {
    const items = Array.from(grid?.querySelectorAll<HTMLButtonElement>(".lp-item") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (!step) return;
    e.preventDefault();
    const n = Math.min(items.length - 1, Math.max(0, i + step));
    items[n]?.focus();
  };

  return (
    <div class="lang-picker" ref={root}>
      <button
        class="icon-btn lp-btn"
        classList={{ open: open() }}
        title="Arayüz dili"
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={toggle}
      >
        <LangFlag code={cur().code} />
      </button>
      <Show when={open()}>
        <div class="lp-pop" role="listbox" aria-label="Arayüz dili" ref={grid} onKeyDown={onGridKey}>
          <div class="lp-head">Arayüz dili</div>
          <div class="lp-grid" data-no-i18n>
            <For each={LANGS}>
              {(l) => (
                <button
                  class="lp-item"
                  classList={{ on: l.code === lang() }}
                  role="option"
                  aria-selected={l.code === lang()}
                  title={l.name}
                  onClick={() => choose(l.code)}
                >
                  <LangFlag code={l.code} />
                  <span>{l.name}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
