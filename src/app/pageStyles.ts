// Panel sayfaları ilk açılışta yüklenir (App.tsx: lazy) ama stilleri burada, eski sırasıyla ve baştan yüklenir:
// stil dosyalarının birbirine göre sırası (hangi kural hangisini ezer) sayfa bölünmesinden etkilenmesin.
// SIRAYI DEĞİŞTİRME. Yeni bir sayfa stili eklenirse sona eklenir.
import "./chatlook.css";
import "@/host/context-menu.css";
import "./components/backdrop-picker.css";
import "./appbg.css";
import "./components/proLock.css";
import "@/window/events.css";
import "@/sdk/LicenseBadge.css";
import "./profile.css";
import "./components/convbg.css";
import "./teams.css";
import "./friends.css";
import "@/window/window.css";
import "./crew.css";
import "@/dash/dash.css";
import "./components/trialWelcome.css";
import "./community.css";
import "./ads.css";
import "./telemetry.css";
import "./components/proPromo.css";
import "./components/langpicker.css";
import "./voice.css";
import "./livechat.css";
import "./support.css";
import "./admin.css";
import "./components/adminPro.css";
import "./components/topLinks.css";
import "./components/adminTop.css";
