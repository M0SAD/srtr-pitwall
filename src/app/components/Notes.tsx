import { For } from "solid-js";

/** Basit Markdown gösterimi: başlıklar, madde işaretleri, **kalın**. */
export function Notes(props: { text: string }) {
  const lines = () => props.text.split("\n");
  const bold = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part) => (part.startsWith("**") ? <b>{part.slice(2, -2)}</b> : part));
  return (
    <div class="notes-body">
      <For each={lines()}>
        {(l) =>
          l.startsWith("## ") ? (
            <h4>{l.slice(3)}</h4>
          ) : l.startsWith("- ") ? (
            <div class="li">{bold(l.slice(2))}</div>
          ) : l.trim() ? (
            <p>{bold(l)}</p>
          ) : null
        }
      </For>
    </div>
  );
}
