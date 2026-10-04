// Sohbet penceresinde "okundu" sayma kuralı: mesaj yalnızca pencere öndeyken (odaktayken) okunmuş sayılır.
// Pencere başka pencerelerin arkasındaysa ya da simge durumundaysa okunmamış kalır; pencereye geçilince okunur.
// Uygulama içindeki panelde ve Arkadaşlar penceresinde eskisi gibi: sohbet açıksa okunmuş sayılır.
import { onCleanup } from "solid-js";

const inChatWindow = /[?&]view=chat\b/.test(location.search);

/**
 * `read` şimdi çalışır (pencere öndeyse) ya da pencere öne gelince bir kez çalışır.
 * Dönen işlev her yeni mesajda çağrılır.
 */
export function useSeen(read: () => void): () => void {
  if (!inChatWindow) return read;
  let pending = false;
  const front = () => document.hasFocus() && !document.hidden;
  const flush = () => {
    if (pending && front()) {
      pending = false;
      read();
    }
  };
  window.addEventListener("focus", flush);
  document.addEventListener("visibilitychange", flush);
  onCleanup(() => {
    window.removeEventListener("focus", flush);
    document.removeEventListener("visibilitychange", flush);
  });
  return () => {
    if (front()) read();
    else pending = true;
  };
}
