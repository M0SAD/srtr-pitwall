import { render } from "solid-js/web";
import { Host } from "./Host";
import { initSettings } from "@/sdk/settings";
import { startDomTranslation } from "@/sdk/i18n";
import { startEntitlement } from "@/cloud/account";
import "@/sdk/fonts";
import "@/overlays/base.css";
import "./host.css";

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) hiçbir yerde açılmasın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

const root = document.getElementById("root")!;

initSettings("overlay").then(() => {
  startDomTranslation();
  // Geliştirme modunda dosya kaydedilince eski kopya kaldırılır (çift çizim olmasın).
  root.textContent = "";
  const dispose = render(() => <Host />, root);
  import.meta.hot?.dispose(dispose);
  startEntitlement();
});
