import { render } from "solid-js/web";
import { App } from "./App";
import { initSettings } from "@/sdk/settings";
import { lang, rustStrings, startDomTranslation } from "@/sdk/i18n";
import { createEffect, createRoot } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { startAutoSync } from "@/cloud/supabase";
import { startEntitlement } from "@/cloud/account";
import { startProFeatures, unlockPreviews } from "@/sdk/proFeatures";
import { startDemoShowcase } from "@/cloud/demoShowcase";
import { SafeRender, atMost, installErrorLog } from "@/sdk/bootGuard";
import "@/sdk/fonts";
import "@/overlays/base.css";
import "./app.css";
import "./shell.css";

const root = document.getElementById("root")!;
installErrorLog("panel");

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) açılmasın; yazı kutularında kalsın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

// Ayarlar yüklenemese ya da hiç gelmese de panel açılsın (en çok 5 sn beklenir; ayar sinyali varsayılanlarla başlar)
atMost(initSettings("main"), 5000, "panel-settings").then(() => {
  startDomTranslation();
  // Tepsi menüsü, pencere başlıkları ve özetler için çeviriler Rust'a
  createRoot(() =>
    createEffect(() => {
      lang();
      invoke("i18n_set", { strings: rustStrings() }).catch(() => {});
    }),
  );
  root.textContent = "";
  const dispose = render(() => (
    <SafeRender src="panel" visible>
      <App />
    </SafeRender>
  ), root);
  import.meta.hot?.dispose(dispose);
  startAutoSync();
  startEntitlement();
  startProFeatures(true);
  unlockPreviews();
  startDemoShowcase();
});
