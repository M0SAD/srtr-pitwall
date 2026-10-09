import { render } from "solid-js/web";
import { Host } from "./Host";
import { Single } from "./Single";
import { query } from "@/sdk/platform";
import { initSettings } from "@/sdk/settings";
import { startDomTranslation } from "@/sdk/i18n";
import { startEntitlement } from "@/cloud/account";
import { startProFeatures } from "@/sdk/proFeatures";
import "@/sdk/fonts";
import "@/overlays/base.css";
import "./host.css";
import { SafeRender, atMost, installErrorLog } from "@/sdk/bootGuard";

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) hiçbir yerde açılmasın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

const root = document.getElementById("root")!;

installErrorLog("overlay");
atMost(initSettings("overlay"), 5000, "overlay-settings").then(() => {
  startDomTranslation();
  // Geliştirme modunda dosya kaydedilince eski kopya kaldırılır (çift çizim olmasın).
  root.textContent = "";
  // ?only=<overlay>: tek overlay (OBS kısa adresleri /livechat, /livepoll, /captions)
  const only = query.get("only");
  const dispose = render(() => <SafeRender src="overlay" visible={false}>{only ? <Single type={only} /> : <Host />}</SafeRender>, root);
  import.meta.hot?.dispose(dispose);
  startEntitlement();
  startProFeatures(false);
});
