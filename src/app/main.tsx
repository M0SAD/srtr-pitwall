import { render } from "solid-js/web";
import { App } from "./App";
import { initSettings } from "@/sdk/settings";
import { lang, rustStrings, startDomTranslation } from "@/sdk/i18n";
import { createEffect, createRoot } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { startAutoSync } from "@/cloud/supabase";
import { startEntitlement } from "@/cloud/account";
import "@/sdk/fonts";
import "@/overlays/base.css";
import "./app.css";
import "./shell.css";

const root = document.getElementById("root")!;

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) açılmasın; yazı kutularında kalsın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

initSettings("main").then(() => {
  startDomTranslation();
  // Tepsi menüsü, pencere başlıkları ve özetler için çeviriler Rust'a
  createRoot(() =>
    createEffect(() => {
      lang();
      invoke("i18n_set", { strings: rustStrings() }).catch(() => {});
    }),
  );
  root.textContent = "";
  const dispose = render(() => <App />, root);
  import.meta.hot?.dispose(dispose);
  startAutoSync();
  startEntitlement();
});
