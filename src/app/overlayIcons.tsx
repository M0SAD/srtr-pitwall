// Overlay türlerine göre liste ikonları
import type { JSX } from "solid-js";
import * as I from "./icons";

const MAP: Record<string, () => JSX.Element> = {
  relative: () => <I.Layers />,
  standings: () => <I.Flag />,
  fuel: () => <I.Fuel />,
  telemetry: () => <I.CircleGauge />,
  dashboard: () => <I.Gauge />,
  inputs: () => <I.Activity />,
  ers: () => <I.BatteryCharging />,
  gforce: () => <I.CircleGauge />,
  delta: () => <I.Timer />,
  radar: () => <I.Siren />,
  spotterbar: () => <I.Pause />,
  trackmap: () => <I.Map />,
  minimap: () => <I.Map />,
  weather: () => <I.Eye />,
  session: () => <I.Flag />,
  incidents: () => <I.TriangleAlert />,
  digiflags: () => <I.Flag />,
  battlebox: () => <I.Users />,
  duel: () => <I.Layers />,
  dataframe: () => <I.Box />,
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
  messages: () => <I.MessageSquare />,
  livechat: () => <I.MessagesSquare />,
  livepoll: () => <I.ChartBarBig />,
  captions: () => <I.Captions />,
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
