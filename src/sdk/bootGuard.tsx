import { ErrorBoundary, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

/**
 * Açılış emniyeti (arayüz): yakalanmamış hatalar günlüğe (boot.log / crash.log) yazılır, çizimde hata olursa
 * pencere boş kalmak yerine sebep gösterilir, ayarlar hiç gelmezse arayüz varsayılanlarla yine açılır.
 */
let sent = 0;
export function reportError(src: string, e: unknown) {
  console.error(src, e);
  if (!inTauri || sent >= 10) return;
  sent++;
  const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  invoke("frontend_error", { src, msg: msg.slice(0, 1500) }).catch(() => {});
}

/** Pencerenin yakalanmamış hatalarını günlüğe yaz */
export function installErrorLog(src: string) {
  window.addEventListener("error", (e) => reportError(src, e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError(src, e.reason));
}

/** `p` en çok `ms` bekletir; süre dolarsa (ya da hata verirse) devam edilir */
export function atMost(p: Promise<unknown>, ms: number, src: string): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      reportError(src, new Error(`${ms} ms içinde tamamlanmadı, devam ediliyor`));
      resolve();
    }, ms);
    p.then(
      () => (clearTimeout(t), resolve()),
      (e) => (clearTimeout(t), reportError(src, e), resolve()),
    );
  });
}

/** Çizimde hata: panelde sebep ve "Yeniden yükle" düğmesi; overlay penceresinde (şeffaf) hiçbir şey gösterilmez */
export function SafeRender(props: { src: string; visible: boolean; children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(err, reset) => {
        reportError(props.src, err);
        if (!props.visible) return null;
        return (
          <div data-no-i18n style={{ padding: "32px", font: "14px system-ui, sans-serif", color: "#e8e8e8", background: "#15171c", height: "100vh", "box-sizing": "border-box" }}>
            <h2 style={{ margin: "0 0 12px" }}>SRTR Pitwall</h2>
            <p>Panel açılırken bir hata oluştu. / The panel hit an error while opening.</p>
            <pre style={{ "white-space": "pre-wrap", opacity: 0.75, "font-size": "12px", "max-height": "40vh", overflow: "auto" }}>{String((err as Error)?.stack ?? err)}</pre>
            <button style={{ padding: "8px 16px", "margin-right": "8px" }} onClick={() => location.reload()}>
              Yeniden yükle / Reload
            </button>
            <button style={{ padding: "8px 16px" }} onClick={reset}>
              Tekrar dene / Retry
            </button>
          </div>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
