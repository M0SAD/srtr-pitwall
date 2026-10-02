// Uygulama içinde mi (Tauri) yoksa tarayıcıda mı (OBS tarayıcı kaynağı / ağdaki başka cihaz) çalışıyoruz?
// Tarayıcıda Tauri komutları yoktur; veri yerel web sunucusundan SSE ile gelir.

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const query = new URLSearchParams(typeof location !== "undefined" ? location.search : "");

/** Tarayıcı modunda API adresi (aynı sunucu) */
export const apiBase = "";
