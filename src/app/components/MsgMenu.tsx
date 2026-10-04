// Mesaj menüsü (1:1, grup ve takım sohbetinde aynı): mesaja tıklayınca / sağ tıklayınca / dokunmatikte basılı tutunca açılır.
// Kopyala · Benden sil · Herkesten sil (kurallar izin veriyorsa) · Raporla (başkasının mesajı).
// Verilmeyen işlem menüde görünmez. Dışına tıklayınca kapatma, sohbetin kendi "mousedown" dinleyicisindedir (.fmsg-menu).
import { For, Show } from "solid-js";
import { QUICK_REACTIONS, type Reaction } from "@/cloud/reactions";
import * as I from "../icons";

export interface MsgMenuPos {
  x: number;
  y: number;
}

/** Menünün pencere içinde kalacağı konum */
export const msgMenuPos = (e: MouseEvent): MsgMenuPos => ({
  x: Math.max(4, Math.min(e.clientX, window.innerWidth - 210)),
  y: Math.max(4, Math.min(e.clientY, window.innerHeight - 215)),
});

/**
 * Sol tıkla menü açılsın mı: artık açılmaz (sağ tık ve basılı tutma açar).
 */
export function msgClickOpens(_e: MouseEvent): boolean {
  // Sol tık mesaja bir şey yapmaz (metin seçilebilsin); menü yalnızca sağ tıkla açılır
  return false;
}

export function MsgMenu(props: {
  pos: MsgMenuPos;
  onCopy?: () => void;
  /** Sadece kendi görünümümden kaldır */
  onHide?: () => void;
  hideTitle?: string;
  /** Herkesten sil (kendi mesajım; sahip / yönetici her mesajı) */
  onDelete?: () => void;
  deleteTitle?: string;
  /** Yöneticilere raporla (başkasının mesajı) */
  onReport?: () => void;
  /** İfade bırak / kaldır */
  onReact?: (emoji: string) => void;
}) {
  return (
    <div class="frow-menu fmsg-menu" style={{ left: `${props.pos.x}px`, top: `${props.pos.y}px` }} onContextMenu={(e) => e.preventDefault()}>
      <Show when={props.onReact}>
        <div class="fmsg-react-pick">
          <For each={QUICK_REACTIONS}>{(e) => <button onClick={() => props.onReact?.(e)}>{e}</button>}</For>
        </div>
      </Show>
      <Show when={props.onCopy}>
        <button onClick={() => props.onCopy?.()}>
          <I.Copy /> Kopyala
        </button>
      </Show>
      <Show when={props.onHide}>
        <button onClick={() => props.onHide?.()} title={props.hideTitle}>
          <I.EyeOff /> Benden sil
        </button>
      </Show>
      <Show when={props.onDelete}>
        <button class="danger" onClick={() => props.onDelete?.()} title={props.deleteTitle}>
          <I.Trash /> Herkesten sil
        </button>
      </Show>
      <Show when={props.onReport}>
        <button class="danger" onClick={() => props.onReport?.()}>
          <I.Flag /> Raporla
        </button>
      </Show>
    </div>
  );
}

/** Mesajın altındaki ifade çipleri (tıkla: sen de ekle / kaldır) */
export function ReactionRow(props: { list: Reaction[]; onToggle: (emoji: string) => void }) {
  return (
    <Show when={props.list.length > 0}>
      <div class="fmsg-reacts" onClick={(e) => e.stopPropagation()}>
        <For each={props.list}>
          {(r) => (
            <button classList={{ mine: r.mine }} title={r.names.join(", ")} onClick={() => props.onToggle(r.emoji)} data-no-i18n>
              <span class="emo">{r.emoji}</span>
              <b>{r.n}</b>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
