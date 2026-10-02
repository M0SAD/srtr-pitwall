// Mesaj menüsü (1:1, grup ve takım sohbetinde aynı): mesaja tıklayınca / sağ tıklayınca / dokunmatikte basılı tutunca açılır.
// Kopyala · Benden sil · Herkesten sil (kurallar izin veriyorsa) · Raporla (başkasının mesajı).
// Verilmeyen işlem menüde görünmez. Dışına tıklayınca kapatma, sohbetin kendi "mousedown" dinleyicisindedir (.fmsg-menu).
import { Show } from "solid-js";
import * as I from "../icons";

export interface MsgMenuPos {
  x: number;
  y: number;
}

/** Menünün pencere içinde kalacağı konum */
export const msgMenuPos = (e: MouseEvent): MsgMenuPos => ({
  x: Math.max(4, Math.min(e.clientX, window.innerWidth - 210)),
  y: Math.max(4, Math.min(e.clientY, window.innerHeight - 170)),
});

/**
 * Sol tıkla menü açılsın mı: bağlantıya / düğmeye tıklanmadıysa ve metin seçilmiyorsa.
 * (Sağ tık ve basılı tutma her zaman açar.)
 */
export function msgClickOpens(e: MouseEvent): boolean {
  if (e.button !== 0 || e.defaultPrevented) return false;
  if ((e.target as HTMLElement).closest("a, button, input, textarea, .fmsg-menu")) return false;
  const sel = window.getSelection?.();
  return !sel || sel.isCollapsed;
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
}) {
  return (
    <div class="frow-menu fmsg-menu" style={{ left: `${props.pos.x}px`, top: `${props.pos.y}px` }} onContextMenu={(e) => e.preventDefault()}>
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
