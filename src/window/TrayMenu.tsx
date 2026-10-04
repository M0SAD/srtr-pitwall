// Sistem tepsisi sağ tık menüsü (programın kendi çizdiği küçük pencere; src-tauri/src/lib.rs: tray_menu_*).
// Satırlar ve etiketleri (çeviri + kısayol yazısı) Rust tarafından gelir; pencere odak kaybedince gizlenir.
import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import Users from "lucide-solid/icons/users";
import ListOrdered from "lucide-solid/icons/list-ordered";
import Move from "lucide-solid/icons/move";
import EyeOff from "lucide-solid/icons/eye-off";
import Power from "lucide-solid/icons/power";
import "./toast.css";

const ICON: Record<string, () => JSX.Element> = {
  panel: () => <LayoutDashboard />,
  friends: () => <Users />,
  events: () => <ListOrdered />,
  edit: () => <Move />,
  hide: () => <EyeOff />,
  quit: () => <Power />,
};

export function TrayMenu() {
  const [items, setItems] = createSignal<[string, string][]>([]);
  const load = () => invoke<[string, string][]>("tray_menu_items").then(setItems).catch(() => {});
  onMount(() => {
    void load();
    let un: (() => void) | undefined;
    listen("traymenu-open", load).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const run = (id: string) => invoke("tray_menu_run", { id }).catch(() => {});
  /** Etiket "Ad\tKısayol" ya da "Ad (Kısayol)" olabilir: kısayol sağa yaslanır */
  const split = (text: string): [string, string] => {
    const tab = text.split("\t");
    if (tab.length > 1) return [tab[0], tab.slice(1).join(" ")];
    const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(text);
    return m ? [m[1], m[2]] : [text, ""];
  };
  return (
    <div class="trm" onContextMenu={(e) => e.preventDefault()}>
      <For each={items()}>
        {([id, text]) => (
          <>
            <Show when={id === "quit"}>
              <hr />
            </Show>
            <button class={`trm-item k-${id}`} onClick={() => run(id)}>
              <span class="trm-ic">{ICON[id]?.()}</span>
              <span class="trm-name" data-no-i18n>
                {split(text)[0]}
              </span>
              <Show when={split(text)[1]}>
                <kbd data-no-i18n>{split(text)[1]}</kbd>
              </Show>
            </button>
          </>
        )}
      </For>
    </div>
  );
}
