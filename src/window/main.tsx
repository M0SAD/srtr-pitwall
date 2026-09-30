import { render } from "solid-js/web";
import { initSettings } from "@/sdk/settings";
import { startDomTranslation } from "@/sdk/i18n";
import { query } from "@/sdk/platform";
import { startEntitlement } from "@/cloud/account";
import { Pitwall } from "./Pitwall";
import { Timing } from "./Timing";
import { Engineer } from "./Engineer";
import "@/sdk/fonts";
import "@/overlays/base.css";
import "./window.css";

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) hiçbir yerde açılmasın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

const root = document.getElementById("root")!;
const view = query.get("view") ?? "pitwall";
document.title = view === "timing" ? "SRTR Pitwall – Live Timing" : view === "engineer" ? "SRTR Pitwall – Mühendis" : "SRTR Pitwall – Pitwall Paneli";

initSettings(`window-${view}`).then(() => {
  startDomTranslation();
  root.textContent = "";
  const dispose = render(() => (view === "timing" ? <Timing /> : view === "engineer" ? <Engineer /> : <Pitwall />), root);
  import.meta.hot?.dispose(dispose);
  startEntitlement();
});
