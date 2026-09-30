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
const social = view === "friends" || view === "friend";
document.title =
  view === "timing"
    ? "SRTR Pitwall – Live Timing"
    : view === "engineer"
      ? "SRTR Pitwall – Mühendis"
      : view === "friends"
        ? "SRTR Pitwall – Arkadaşlar"
        : view === "friend"
          ? "SRTR Pitwall"
          : "SRTR Pitwall – Pitwall Paneli";

initSettings(`window-${view}`).then(async () => {
  startDomTranslation();
  // Arkadaş pencereleri panelin görünümünü kullanır
  if (social) {
    await import("@/app/app.css");
    await import("@/app/shell.css");
  }
  const { FriendsWindow, FriendWindow } = social ? await import("./Friends") : ({} as typeof import("./Friends"));
  root.textContent = "";
  const dispose = render(
    () =>
      view === "friends" ? (
        <FriendsWindow />
      ) : view === "friend" ? (
        <FriendWindow id={query.get("id") ?? ""} />
      ) : view === "timing" ? (
        <Timing />
      ) : view === "engineer" ? (
        <Engineer />
      ) : (
        <Pitwall />
      ),
    root,
  );
  import.meta.hot?.dispose(dispose);
  startEntitlement();
});
