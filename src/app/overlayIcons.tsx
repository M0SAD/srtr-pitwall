// Overlay türlerine göre liste ikonları
import { For, createSignal, type JSX } from "solid-js";
import * as I from "./icons";
import { isProOverlay } from "@/cloud/account";

const MAP: Record<string, () => JSX.Element> = {
  relative: () => <I.Layers />,
  standings: () => <I.Flag />,
  fuel: () => <I.Fuel />,
  telemetry: () => <I.CircleGauge />,
  dashboard: () => <I.Gauge />,
  inputs: () => <I.Activity />,
  pedals: () => <I.ChartBarBig />,
  ers: () => <I.BatteryCharging />,
  gforce: () => <I.CircleGauge />,
  delta: () => <I.Timer />,
  radar: () => <I.Siren />,
  spotterbar: () => <I.Pause />,
  blindspot: () => <I.EyeOff />,
  trackmap: () => <I.Map />,
  minimap: () => <I.Map />,
  weather: () => <I.Eye />,
  session: () => <I.Flag />,
  incidents: () => <I.TriangleAlert />,
  digiflags: () => <I.Flag />,
  battlebox: () => <I.Users />,
  duel: () => <I.Layers />,
  pitwindow: () => <I.Fuel />,
  stint: () => <I.Timer />,
  driverswap: () => <I.RefreshCw />,
  crewcall: () => <I.Megaphone />,
  dataframe: () => <I.Box />,
  glucose: () => <I.Droplet />,
  heartrate: () => <I.HeartPulse />,
  webview: () => <I.ExternalLink />,
  tires: () => <I.Car />,
  scene: () => <I.Clapperboard />,
  laptimes: () => <I.Timer />,
  incidentlog: () => <I.TriangleAlert />,
  flatmap: () => <I.Map />,
  pitspeed: () => <I.Gauge />,
  rejoin: () => <I.TriangleAlert />,
  overtake: () => <I.Siren />,
  corners: () => <I.Map />,
  brakepoint: () => <I.ArrowDownToLine />,
  tracklimits: () => <I.Ban />,
  damage: () => <I.Car />,
  windcompass: () => <I.Globe />,
  sectors: () => <I.Timer />,
  setupcmp: () => <I.Wrench />,
  gapchart: () => <I.Activity />,
  target: () => <I.User />,
  messages: () => <I.MessageSquare />,
  livechat: () => <I.MessagesSquare />,
  livepoll: () => <I.ChartBarBig />,
  captions: () => <I.Captions />,
  startlights: () => <I.Siren />,
  drivercard: () => <I.User />,
  results: () => <I.Trophy />,
  h2h: () => <I.Users />,
  goalbar: () => <I.ChartBarBig />,
  socials: () => <I.Share2 />,
  setupcover: () => <I.EyeOff />,
  clock: () => <I.AlarmClock />,
  gear: () => <I.Hash />,
  speedo: () => <I.CircleGauge />,
  voice: () => <I.Volume2 />,
};

export function overlayIcon(type: string): JSX.Element {
  return (MAP[type] ?? (() => <I.Box />))();
}

export const CATEGORY_NAMES: Record<string, string> = {
  race: "Yarış",
  driving: "Sürüş",
  info: "Bilgi",
  stream: "Yayın",
};

// Overlay listelerindeki kategori süzgeci (Overlaylarım, Düzenler ve Yayın sayfalarında ortak; "" = tümü).
// Kalıcı değildir: program yeniden açıldığında "Tümü" ile başlar (unutulan süzgeç overlay'leri saklamasın).
const [catFilter, setCatFilter] = createSignal("");
export { catFilter, setCatFilter };
/** Overlay seçili süzgece uyuyor mu: kategori, "__pro" (yalnızca PRO) ya da "__free" (PRO olmayanlar) */
export const catMatch = (m: { id: string; category: string } | undefined): boolean => {
  const c = catFilter();
  if (!c) return true;
  if (!m) return false;
  if (c === "__pro") return isProOverlay(m.id);
  if (c === "__free") return !isProOverlay(m.id);
  return m.category === c;
};

/** Arama kutusunun altındaki "Kategori" açılır menüsü */
export function CategoryFilter() {
  return (
    <label class="ovlist-sort ovlist-catsel">
      <span>Kategori</span>
      <select value={catFilter()} onChange={(e) => setCatFilter(e.currentTarget.value)}>
        <option value="">Tümü</option>
        <For each={Object.entries(CATEGORY_NAMES)}>{([id, name]) => <option value={id}>{name}</option>}</For>
        <option value="__pro">PRO olanlar</option>
        <option value="__free">PRO olmayanlar</option>
      </select>
    </label>
  );
}
