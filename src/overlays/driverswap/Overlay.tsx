// Sürücü Değişimi: takım yarışında araçtaki sürücü, kesintisiz sürüş süresi ve sürücü başına toplamlar.
// Veri `strategy` konusundan gelir: motor, oyuncunun aracını o an kimin sürdüğünü oturum bilgisinden izler ve
// süreyi / turu o sürücüye yazar. Uygulama oturuma sonradan bağlandıysa öncesi bilinmez (alt notta belirtilir).

import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock } from "@/sdk/format";
import { formatName } from "@/sdk/HeaderStats";
import { t } from "@/sdk/i18n";
import type { StratDriver } from "@/sdk/types";
import { STRATEGY_SAMPLE } from "@/sdk/strategySample";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export default function DriverSwap(props: OverlayProps) {
  const live = useTopic("strategy");
  const o = () => props.options;
  const data = createMemo(() => live() ?? (props.editing ? STRATEGY_SAMPLE : undefined));
  const design = () => (o().design === "compact" ? "compact" : "list");
  const visible = () => {
    const d = data();
    if (!d) return false;
    if (props.editing) return true;
    return d.team || o().hideSolo === false;
  };
  const name = (n: string) => formatName(n, o().nameFormat) || "—";
  const minDrive = () => Math.max(0, num(o().minDrive, 0)) * 60;
  const maxStint = () => Math.max(0, num(o().maxStint, 0)) * 60;
  const total = createMemo(() => (data()?.drivers ?? []).reduce((a, d) => a + d.time, 0));
  const stintTime = () => {
    const s = data()?.stints;
    const c = s?.[s.length - 1];
    return c?.current ? c.time : -1;
  };

  /** Kesintisiz sürüş sınırı durumu */
  const limit = createMemo(() => {
    const d = data();
    const max = maxStint();
    if (!d || max <= 0) return null;
    const left = max - d.driveTime;
    const warn = clamp(num(o().warnBefore, 5), 1, 60) * 60;
    return { left, pct: clamp(d.driveTime / max, 0, 1), state: left < 0 ? "over" : left <= warn ? "warn" : "ok" };
  });

  const share = (d: StratDriver) => {
    const min = minDrive();
    if (min > 0) return clamp(d.time / min, 0, 1);
    return total() > 0 ? d.time / total() : 0;
  };
  const minState = (d: StratDriver) => {
    const min = minDrive();
    if (min <= 0) return null;
    const left = min - d.time;
    return left <= 0 ? { done: true, text: "" } : { done: false, text: `−${clock(left)}` };
  };

  const Current = () => (
    <div class="dsw-cur" classList={{ [`dsw-${limit()?.state ?? "ok"}`]: true }}>
      <div class="dsw-cur-row">
        <div class="dsw-cur-who">
          <span class="dsw-k">ARAÇTA</span>
          <b data-no-i18n>{name(data()!.driver)}</b>
        </div>
        <div class="dsw-cur-t">
          <span class="dsw-k">SÜRÜŞ SÜRESİ</span>
          <b data-no-i18n>{clock(data()!.driveTime)}</b>
        </div>
        <Show when={o().showStintTime !== false && stintTime() >= 0}>
          <div class="dsw-cur-t dsw-cur-s">
            <span class="dsw-k">STINT</span>
            <b data-no-i18n>{clock(stintTime())}</b>
          </div>
        </Show>
      </div>
      <Show when={limit()}>
        {(l) => (
          <div class="dsw-limit">
            <div class="dsw-bar">
              <i style={{ width: `${l().pct * 100}%` }} />
            </div>
            <span class="dsw-limit-t">
              <Show when={l().state === "over"} fallback={<span>Kalan</span>}>
                <span>SINIR AŞILDI</span>
              </Show>{" "}
              <b data-no-i18n>
                {l().left < 0 ? "+" : ""}
                {clock(Math.abs(l().left))}
              </b>
            </span>
          </div>
        )}
      </Show>
    </div>
  );

  return (
    <Show when={visible()}>
      <div class={`dsw dsw-d-${design()} ov-panel`} style={{ width: `${clamp(num(o().width, 320), 220, 700)}px` }}>
        <Show when={design() === "list"}>
          <div class="ov-header">
            <span>Sürücü Değişimi</span>
            <Show when={data()!.teamName}>
              <span class="dsw-team" data-no-i18n>
                {data()!.teamName}
              </span>
            </Show>
          </div>
        </Show>
        <Show when={data()!.driver} fallback={<div class="ov-empty">Sürücü bilgisi bekleniyor</div>}>
          <Current />
        </Show>
        <Show when={design() === "list" && data()!.drivers.length}>
          <div class="dsw-list">
            <For each={data()!.drivers}>
              {(d) => (
                <div class="dsw-row" classList={{ "dsw-on": d.current }}>
                  <i class="dsw-dot" />
                  <span class="dsw-name" data-no-i18n>
                    {name(d.name)}
                  </span>
                  <Show when={o().showStints}>
                    <span class="dsw-meta">
                      <b data-no-i18n>{d.stints}</b>
                      <span>×</span>
                    </span>
                  </Show>
                  <Show when={o().showLaps !== false}>
                    <span class="dsw-meta">
                      <b data-no-i18n>{d.laps}</b> <span>tur</span>
                    </span>
                  </Show>
                  <b class="dsw-time" data-no-i18n>
                    {clock(d.time)}
                  </b>
                  <Show when={minState(d)}>
                    {(m) => (
                      <span class="dsw-min" classList={{ "dsw-done": m().done }} title={t("En az sürüş süresi")} data-no-i18n>
                        {m().done ? "✓" : m().text}
                      </span>
                    )}
                  </Show>
                  <Show when={o().showShare !== false}>
                    <span class="dsw-share">
                      <i style={{ width: `${share(d) * 100}%` }} />
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={data()!.trackedFrom > 90}>
            <div class="dsw-note">{t("Takip {0} anında başladı: öncesi sayılmadı", clock(data()!.trackedFrom))}</div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
