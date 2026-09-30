import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings } from "@/sdk/settings";
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, fromEvent, prettyKey, shortcut, type ShortcutAction } from "@/sdk/shortcuts";

const ACTIONS: ShortcutAction[] = ["edit", "hide", "panel", "shot"];

export function ShortcutsPanel() {
  const [recording, setRecording] = createSignal<ShortcutAction | null>(null);
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const refresh = async () => {
    try {
      const list = await invoke<{ action: string; error: string }[]>("shortcuts_status");
      setErrors(Object.fromEntries(list.map((x) => [x.action, x.error])));
    } catch {
      /* tarayıcı */
    }
  };
  const set = (a: ShortcutAction, v: string) => {
    updateSettings((d) => (d.general.shortcuts[a] = v));
    // Rust tarafı kaydettikten sonra hataları oku
    setTimeout(refresh, 700);
  };

  const onKey = (e: KeyboardEvent) => {
    const a = recording();
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      setRecording(null);
      return;
    }
    const k = fromEvent(e);
    if (!k) return; // değiştirici bekleniyor
    setRecording(null);
    set(a, k);
  };

  // Windows, PrintScreen için sadece "keyup" gönderir
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "PrintScreen") onKey(e);
  };

  onMount(() => {
    refresh();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    });
  });

  return (
    <section class="panel">
      <h3>Kısayollar</h3>
      <p class="muted small">
        Değiştirmek için kısayola tıkla ve yeni tuş birleşimine bas (Ctrl, Alt veya Shift ile; F tuşları ve Print Screen
        tek başına olabilir). Esc vazgeçer. Kısayollar oyun açıkken de çalışır.
      </p>
      <For each={ACTIONS}>
        {(a) => (
          <div class="row">
            <div>
              <span>{SHORTCUT_LABELS[a]}</span>
              <Show when={a === "shot"}>
                <small>
                  {settings().general.screenshots.onlyInGame ? "Sadece oyundayken çalışır; oyun kapalıyken tuş Windows'a kalır." : "Her zaman çalışır."}
                </small>
              </Show>
              <Show when={errors()[a]}>
                <small class="sc-err">{errors()[a]}</small>
              </Show>
            </div>
            <div class="sc-keys">
              <button class="sc-key" classList={{ rec: recording() === a }} onClick={() => setRecording(recording() === a ? null : a)}>
                {recording() === a ? "Tuşlara bas…" : prettyKey(shortcut(a))}
              </button>
              <button class="btn ghost small" title="Varsayılan" disabled={shortcut(a) === DEFAULT_SHORTCUTS[a]} onClick={() => set(a, DEFAULT_SHORTCUTS[a])}>
                Varsayılan
              </button>
              <button class="btn ghost small" title="Kısayolu kaldır" disabled={!shortcut(a)} onClick={() => set(a, "")}>
                Kaldır
              </button>
            </div>
          </div>
        )}
      </For>
      <div class="row">
        <span>Düzenleme ekranında konum menüsü</span>
        <span class="muted">Overlay'e sağ tık</span>
      </div>
    </section>
  );
}
