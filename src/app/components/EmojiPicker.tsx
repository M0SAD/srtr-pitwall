// İfade seçici (destek yazışmaları): düğme + kategorili açılır kutu; seçilen ifade metin kutusunda imlecin yerine eklenir.

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import Smile from "lucide-solid/icons/face-slightly-smiling";

const CATS: { id: string; icon: string; label: string; list: string[] }[] = [
  {
    id: "face",
    icon: "😀",
    label: "Yüzler",
    list: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋",
      "😛", "😜", "🤪", "😎", "🤓", "🥳", "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😬", "😮", "😯",
      "😲", "😳", "🥺", "😢", "😭", "😤", "😠", "😡", "🤯", "😱", "😨", "😰", "😓", "🤗", "🤭", "🤫",
      "😴", "🤤", "😵", "🤐", "🥴", "🤢", "🤧", "😷", "🤒", "🤕", "😇", "🤠", "🙁", "☹️", "😕", "😟",
    ],
  },
  {
    id: "hand",
    icon: "👍",
    label: "Eller",
    list: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "👋",
      "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💪", "🫡", "🫶", "👀", "🧠",
    ],
  },
  {
    id: "heart",
    icon: "❤️",
    label: "Kalpler ve semboller",
    list: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "🔥", "✨", "⭐", "🌟", "⚡", "💥",
      "✅", "❌", "⚠️", "❓", "❗", "💡", "🔔", "📌", "📎", "🔒", "🔓", "⏱️", "⏳", "🆗", "🆕", "🆘",
    ],
  },
  {
    id: "race",
    icon: "🏁",
    label: "Yarış",
    list: [
      "🏁", "🏎️", "🚗", "🚙", "🏆", "🥇", "🥈", "🥉", "🎖️", "🚦", "🚥", "🛞", "⛽", "🔧", "🔩", "🛠️",
      "🧯", "🚩", "🟢", "🟡", "🔴", "⚫", "⚪", "🔵", "🌧️", "☀️", "🌙", "🎮", "🕹️", "🎧", "🖥️", "📈",
    ],
  },
  {
    id: "misc",
    icon: "🎉",
    label: "Diğer",
    list: [
      "🎉", "🎊", "🎁", "🎂", "☕", "🍕", "🍔", "🍺", "📷", "📸", "🎥", "📺", "💻", "⌨️", "🖱️", "📱",
      "💬", "📧", "📝", "📅", "💰", "💳", "🧾", "🐛", "🔍", "🔗", "📦", "🚀", "🙈", "🙉", "🙊", "🤖",
    ],
  },
];

/** Metin kutusunda imlecin yerine (seçili metnin yerine) ekler ve yeni değeri döner */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement, text: string): string {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.setSelectionRange(s + text.length, s + text.length);
  el.focus();
  return el.value;
}

/** Düğme + açılır ifade kutusu. target: eklenecek metin kutusu; onInsert: yeni değer (sinyali güncellemek için) */
export function EmojiPicker(p: { target: () => HTMLTextAreaElement | HTMLInputElement | undefined; onInsert: (value: string) => void; up?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [cat, setCat] = createSignal(CATS[0].id);
  let root: HTMLDivElement | undefined;
  const onDoc = (e: MouseEvent) => {
    if (open() && root && !root.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (open() && e.key === "Escape") setOpen(false);
  };
  onMount(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  });
  const pick = (emo: string) => {
    const el = p.target();
    if (el) p.onInsert(insertAtCursor(el, emo));
  };
  return (
    <div class="emo-wrap" ref={root}>
      <button type="button" class="btn ghost small emo-btn" classList={{ on: open() }} title="İfade ekle" onClick={() => setOpen(!open())}>
        <Smile />
      </button>
      <Show when={open()}>
        <div class="emo-pop" classList={{ up: p.up !== false }} role="dialog">
          <div class="emo-tabs">
            <For each={CATS}>
              {(c) => (
                <button type="button" classList={{ on: cat() === c.id }} title={c.label} onClick={() => setCat(c.id)}>
                  {c.icon}
                </button>
              )}
            </For>
          </div>
          <div class="emo-grid" data-no-i18n>
            <For each={CATS.find((c) => c.id === cat())?.list ?? []}>
              {(e) => (
                <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)}>
                  {e}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
