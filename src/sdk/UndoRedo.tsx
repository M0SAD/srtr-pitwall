// Geri al / yinele düğmeleri (◀ ▶). `keys` verilirse bileşen açıkken Ctrl+Z / Ctrl+Y de çalışır.

import { onCleanup, onMount } from "solid-js";
import { bindUndoKeys, canRedoSettings, canUndoSettings, redoSettings, startSettingsHistory, undoSettings } from "./history";

export function UndoRedo(props: { keys?: boolean; class?: string; enabled?: () => boolean }) {
  onMount(() => {
    startSettingsHistory();
    if (props.keys) onCleanup(bindUndoKeys(props.enabled));
  });
  return (
    <span class={`undo-redo ${props.class ?? ""}`}>
      <button type="button" class="ur-btn" title="Geri al (Ctrl+Z)" disabled={!canUndoSettings()} onClick={() => undoSettings()}>
        ◀
      </button>
      <button type="button" class="ur-btn" title="Yinele (Ctrl+Y)" disabled={!canRedoSettings()} onClick={() => redoSettings()}>
        ▶
      </button>
    </span>
  );
}
