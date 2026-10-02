// Pitwall paneli: yarış mühendisi için tek ekran. Ayrı pencerede ya da (web sunucusu açıkken)
// ağdaki başka bir bilgisayar/tabletin tarayıcısında açılır.

import { Show, createMemo, onMount } from "solid-js";
import { setSubscriptions, useTopic } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { settings } from "@/sdk/settings";
import { OverlayCard } from "./Card";

export function Pitwall() {
  const status = useTopic("status");
  onMount(() =>
    setSubscriptions([
      { name: "standings", hz: 2 },
      { name: "map", hz: 5 },
      { name: "inputs", hz: 30 },
      { name: "fuel", hz: 1 },
      { name: "delta", hz: 5 },
      { name: "weather", hz: 1 },
      { name: "session", hz: 2 },
      { name: "telemetry", hz: 10 },
      { name: "tires", hz: 1 },
      { name: "team", hz: 1 },
    ]),
  );
  const vars = createMemo(() => themeVars(settings().theme));

  return (
    <div class="pw ov-theme" style={vars()}>
      <div class="pw-top">
        <b data-no-i18n>SRTR Pitwall</b>
        <span class="pw-status" classList={{ on: status()?.connected }}>
          <i />
          {status()?.connected ? (status()?.demo ? "Demo" : status()?.track || "Bağlı") : "iRacing bekleniyor"}
        </span>
        <Show when={status()?.sessionType}>
          <span class="pw-dim">{status()!.sessionType}</span>
        </Show>
        <Show when={status()?.carName}>
          <span class="pw-dim">{status()!.carName}</span>
        </Show>
      </div>
      <div class="pw-grid">
        <OverlayCard
          id="standings"
          title="Sınıf sıralaması"
          class="pw-lb"
          options={{ maxRows: 40, showHeader: true, showLast: true, showChange: true }}
        />
        <OverlayCard id="trackmap" title="Pist haritası" class="pw-map" options={{ width: 560, height: 400, carSize: 10 }} />
        <OverlayCard id="weather" title="Hava" class="pw-wx" options={{ showCompass: true }} />
        <OverlayCard id="inputs" title="Girdiler" class="pw-in" options={{ seconds: 8 }} />
        <OverlayCard id="fuel" title="Yakıt" class="pw-fuel" />
        <OverlayCard id="delta" title="Tur süreleri" class="pw-lap" />
        <OverlayCard id="telemetry" title="Araç" class="pw-veh" options={{ showElectronics: true, showFuel: false }} />
        <OverlayCard id="battlebox" title="Mücadele" class="pw-bat" />
        <OverlayCard id="session" title="Oturum" class="pw-ses" />
        <OverlayCard id="tires" title="Lastikler" class="pw-tyr" />
      </div>
    </div>
  );
}
