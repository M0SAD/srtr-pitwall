import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock, wallClock, temp } from "@/sdk/format";
import type { FlagName } from "@/sdk/types";
import { WxLabel } from "@/sdk/WxIcon";
import "./style.css";

// Önem sırasına göre: listede ilk bulunan gösterilir
const FLAG_INFO: [FlagName, string, string][] = [
  ["black", "SİYAH BAYRAK", "black"],
  ["disqualify", "DİSKALİFİYE", "black"],
  ["red", "KIRMIZI BAYRAK", "red"],
  ["repair", "HASAR – PİTE GİR", "meatball"],
  ["checkered", "DAMALI BAYRAK", "checkered"],
  ["caution", "SARI – GÜVENLİK ARACI", "yellow"],
  ["cautionWaving", "SARI – GÜVENLİK ARACI", "yellow"],
  ["yellow", "SARI BAYRAK", "yellow"],
  ["debris", "PİSTTE ENKAZ", "yellow"],
  ["blue", "MAVİ – YOL VER", "blue"],
  ["white", "SON TUR", "white"],
  ["oneLapToGreen", "BİR TUR SONRA YEŞİL", "green"],
  ["greenHeld", "YEŞİL BEKLENİYOR", "green"],
];

const WETNESS = ["", "Kuru", "Çoğunlukla kuru", "Çok hafif ıslak", "Hafif ıslak", "Orta ıslak", "Çok ıslak", "Aşırı ıslak"];

export default function Session(props: OverlayProps) {
  const data = useTopic("session");
  const [now, setNow] = createSignal(new Date());
  let timer: number | undefined;
  onMount(() => (timer = window.setInterval(() => props.options.showClock && setNow(new Date()), 1000)));
  onCleanup(() => clearInterval(timer));

  const flag = createMemo(() => {
    const f = data()?.flags ?? [];
    return FLAG_INFO.find(([n]) => f.includes(n));
  });

  const remain = () => {
    const d = data();
    if (!d) return "—";
    if (d.lapsRemain > 0 && d.lapsRemain < 32767) return `${d.lapsRemain} tur`;
    if (d.timeRemain >= 0 && d.timeRemain < 604800) return clock(d.timeRemain);
    return "—";
  };

  const fmt = (v: number, digits = 0) => (v >= 0 ? v.toFixed(digits) : "—");

  return (
    <div class="ov-panel ses">
      <Show when={props.options.showFlags && flag()}>
        <div class={`ses-flag flag-${flag()![2]}`}>{flag()![1]}</div>
      </Show>
      <Show when={data()} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        {(d) => (
          <>
            <div class="ov-header">
              <span>{d().sessionType || "Oturum"}</span>
              <span>
                {d().track}
                <Show when={props.options.showClock}>
                  {" · "}
                  {wallClock(now().getTime())}
                </Show>
              </span>
            </div>
            <div class="ses-main">
              <div>
                <label>Pozisyon</label>
                <b>
                  {d().position > 0 ? d().position : "—"}
                  <small>/{d().carCount}</small>
                </b>
              </div>
              <div>
                <label>Tur</label>
                <b>
                  {d().lap}
                  <Show when={d().totalLaps > 0}>
                    <small>/{d().totalLaps}</small>
                  </Show>
                </b>
              </div>
              <div>
                <label>Kalan</label>
                <b>{remain()}</b>
              </div>
            </div>
            <div class="ses-sub">
              <Show when={props.options.showWeather}>
                <span>
                  <WxLabel kind="air" text="Hava" mode={props.options.labelStyle} /> {temp(d().airTemp, props.units)}
                </span>
                <span>
                  <WxLabel kind="track" text="Pist" mode={props.options.labelStyle} /> {temp(d().trackTemp, props.units)}
                </span>
                <Show when={d().wetness > 1}>
                  <span class="ses-wet">
                    <Show when={props.options.labelStyle !== "text"}>
                      <WxLabel kind="wetness" text="" class="ses-wet-ic" />{" "}
                    </Show>
                    {WETNESS[d().wetness] ?? "Islak"}
                  </span>
                </Show>
              </Show>
              <Show when={props.options.showIncidents}>
                <span>
                  Olay <b>{d().incidents}x</b>
                </span>
              </Show>
            </div>
            <Show when={props.options.showCar && (d().brakeBias >= 0 || d().tc >= 0 || d().abs >= 0)}>
              <div class="ses-sub">
                <Show when={d().brakeBias >= 0}>
                  <span>
                    BB <b>{fmt(d().brakeBias, 1)}</b>
                  </span>
                </Show>
                <Show when={d().tc >= 0}>
                  <span>
                    TC <b>{fmt(d().tc)}</b>
                  </span>
                </Show>
                <Show when={d().abs >= 0}>
                  <span>
                    ABS <b>{fmt(d().abs)}</b>
                  </span>
                </Show>
                <Show when={d().onPitRoad}>
                  <span class="ov-tag ses-pit">PIT YOLU</span>
                </Show>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
