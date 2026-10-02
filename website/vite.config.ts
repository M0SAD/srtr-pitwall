import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

// Tauri geliştirme sunucusu sabit portta çalışır.
const host = process.env.TAURI_DEV_HOST;

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
      },
    },
  },
});
