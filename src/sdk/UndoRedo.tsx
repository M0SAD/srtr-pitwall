// Geri al / yinele düğmeleri (↶ ↷). `keys` verilirse bileşen açıkken Ctrl+Z / Ctrl+Y de çalışır.

import { onCleanup, onMount } from "solid-js";
import Undo2 from "lucide-solid/icons/undo-2";
import Redo2 from "lucide-solid/icons/redo-2";
import { bindUndoKeys, canRedoSettings, canUndoSettings, redoSettings, startSettingsHistory, undoSettings } from "./history";

export function UndoRedo(props: { keys?: boolean; class?: string; enabled?: () => boolean }) {
  onMount(() => {
    startSettingsHistory();
    if (props.keys) onCleanup(bindUndoKeys(props.enabled));
  });
  return (
    <span class={`undo-redo ${props.class ?? ""}`}>
      <button type="button" class="ur-btn" title="Geri al (Ctrl+Z)" disabled={!canUndoSettings()} onClick={() => undoSettings()}>
        <Undo2 />
      </button>
      <button type="button" class="ur-btn" title="Yinele (Ctrl+Y)" disabled={!canRedoSettings()} onClick={() => redoSettings()}>
        <Redo2 />
      </button>
    </span>
  );
}
