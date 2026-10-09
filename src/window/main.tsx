import { render } from "solid-js/web";
import { initSettings } from "@/sdk/settings";
import { startDomTranslation } from "@/sdk/i18n";
import { query } from "@/sdk/platform";
import { startEntitlement } from "@/cloud/account";
import { F, proLocked, startProFeatures } from "@/sdk/proFeatures";
import { Show } from "solid-js";
import { Pitwall } from "./Pitwall";
import { Timing } from "./Timing";
import { Engineer } from "./Engineer";
import "@/sdk/fonts";
import "@/overlays/base.css";
// Sıra önemli: window.css önce, window-root.css sonra (derlenmiş stil sırası eskisiyle aynı kalsın)
import "./window.css";
import "./window-root.css";

// Tarayıcının kendi sağ tık menüsü (Farklı kaydet, Yazdır…) hiçbir yerde açılmasın
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

const root = document.getElementById("root")!;
const view = query.get("view") ?? "pitwall";
const social = view === "friends" || view === "friend" || view === "chat";
// Olaylar penceresi panelin görünümünü kullanır (app.css + shell.css)
const events = view === "events";
// Ekip Pitwall'ı penceresi (tek sürücü): paneldeki Ekip sayfasının aynısı
const crew = view === "crew";
// Mesaj açılır penceresi (sağ alt, saydam): kendi küçük görünümü, panel stilleri gerekmez
const toast = view === "toast";
// Kısayol bildirimi (üst orta, saydam, tıklama geçirir): bkz. src-tauri/src/osd.rs
const osd = view === "osd";
const traymenu = view === "traymenu";
if (toast || osd || traymenu) document.documentElement.classList.add("toast-root");
document.title =
  view === "timing"
    ? "SRTR Pitwall – Live Timing"
    : view === "engineer"
      ? "SRTR Pitwall – Mühendis"
      : view === "friends"
        ? "SRTR Pitwall – Arkadaşlar"
        : events
        ? "SRTR Pitwall – Olaylar"
        : crew
        ? "SRTR Pitwall – Ekip Pitwall'ı"
        : view === "friend" || view === "chat" || view === "toast" || osd || traymenu
          ? "SRTR Pitwall"
          : "SRTR Pitwall – Pitwall Paneli";

initSettings(`window-${view}`).catch((e) => console.error("Ayarlar yüklenemedi", e)).then(async () => {
  startDomTranslation();
  // Arkadaş pencereleri panelin görünümünü kullanır
  if (social || events || crew) {
    await import("@/app/app.css");
    await import("@/app/shell.css");
  }
  const { FriendsWindow, FriendWindow, ChatWindow } = social ? await import("./Friends") : ({} as typeof import("./Friends"));
  const { Toast } = toast ? await import("./Toast") : ({} as typeof import("./Toast"));
  const { TrayMenu } = traymenu ? await import("./TrayMenu") : ({} as typeof import("./TrayMenu"));
  const { Osd } = osd ? await import("./Osd") : ({} as typeof import("./Osd"));
  const { CrewWindow } = crew ? await import("./Crew") : ({} as typeof import("./Crew"));
  const { Events } = events ? await import("./Events") : ({} as typeof import("./Events"));
  root.textContent = "";
  // Araç pencereleri yöneticinin PRO özellikleri kararına bağlı (Araçlar: tools.pitwall / timing / engineer / events)
  const toolKey = ({ pitwall: F.pitwall, timing: F.timing, engineer: F.engineer, events: F.events } as Record<string, string>)[view];
  const Locked = () => (
    <div style={{ padding: "40px 24px", "text-align": "center", color: "#ddd", "font-family": "system-ui, sans-serif" }}>
      <p style={{ "font-size": "15px" }}>
        <b style={{ background: "linear-gradient(90deg, #ffb341, #ff6a3d)", color: "#111", padding: "1px 6px", "border-radius": "4px" }}>PRO</b> Bu pencere
        PRO üyelere özel.
      </p>
      <p style={{ opacity: 0.7, "font-size": "13px" }}>Kontrol panelindeki PRO sayfasından üyelik seçeneklerine bakabilirsin.</p>
    </div>
  );
  const dispose = render(
    () => (
      <Show when={!(toolKey && proLocked(toolKey))} fallback={<Locked />}>
        {toast ? (
          <Toast />
        ) : osd ? (
          <Osd />
        ) : traymenu ? (
          <TrayMenu />
        ) : view === "friends" ? (
          <FriendsWindow chat={query.get("chat") ?? ""} />
        ) : view === "chat" ? (
          <ChatWindow id={query.get("id") ?? ""} />
        ) : view === "friend" ? (
          <FriendWindow id={query.get("id") ?? ""} />
        ) : crew ? (
          <CrewWindow owner={query.get("owner") ?? ""} />
        ) : events ? (
          <Events />
        ) : view === "timing" ? (
          <Timing />
        ) : view === "engineer" ? (
          <Engineer />
        ) : (
          <Pitwall />
        )}
      </Show>
    ),
    root,
  );
  import.meta.hot?.dispose(dispose);
  if (!toast && !osd && !traymenu) startEntitlement();
  startProFeatures(false);
});
