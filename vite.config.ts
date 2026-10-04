import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

// Tauri geliştirme sunucusu sabit portta çalışır.
const host = process.env.TAURI_DEV_HOST;

/** Yalnızca kontrol paneline ait stil dosyaları (sıra: src/app/pageStyles.ts) */
const PANEL_STYLES = [
  "/src/app/components/trialWelcome.css",
  "/src/app/community.css",
  "/src/app/ads.css",
  "/src/app/telemetry.css",
  "/src/app/components/proPromo.css",
  "/src/app/components/langpicker.css",
  "/src/app/voice.css",
  "/src/app/livechat.css",
  "/src/app/support.css",
  "/src/app/admin.css",
  "/src/app/components/adminPro.css",
  "/src/app/components/topLinks.css",
  "/src/app/components/adminTop.css",
];

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // WebView2 (Chromium) hedefi: modern JS, polyfill yok, küçük paket.
    target: "chrome120",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: {
      // İki ayrı sayfa: kontrol paneli ve şeffaf overlay penceresi.
      // Overlay penceresi kontrol panelinin kodunu hiç yüklemez.
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
        window: resolve(__dirname, "window.html"),
        // Uzak gösterge (telefon / tablet): yerel sunucu /dash adresinde sunar
        dash: resolve(__dirname, "dash.html"),
      },
      output: {
        // Panel sayfaları ilk açılışta yüklenir (src/app/App.tsx: lazy) ama panel stilleri baştan ve ESKİ SIRASIYLA
        // yüklenmeli (bkz. src/app/pageStyles.ts). Yalnızca panele ait stiller ayrı bir stil parçasında toplanır ki
        // pencerelerle ortak stillerden (window.css, crew.css, dash.css) sonra, app.css / shell.css'ten önce gelsinler.
        manualChunks(id) {
          const f = id.split("?")[0].replace(/\\/g, "/");
          if (PANEL_STYLES.some((n) => f.endsWith(n))) return "panel-styles";
          // Araç pencereleri: window.css artık panelle ortak bir stil parçası; window-root.css eskisi gibi ondan SONRA gelsin
          if (f.endsWith("/src/window/window-root.css")) return "window-root";
        },
      },
    },
  },
});
