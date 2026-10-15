// Direksiyon Ekranı › Lastik sıcaklığı göstergesi: her görünümün (Klasik, Yarış, araç tarzı ekranlar…) yanına ya da
// altına eklenebilen ayrı panel. Tasarımlar: Kutular, Araç (üstten görünüm), Çubuklar, İç / orta / dış, Halkalar.
// Renk, ayarlanan ideal sıcaklık aralığına göre: soğuk mavi, ideal yeşil, sıcak sarı / kırmızı.

import { For, Show } from "solid-js";
import type { Tires } from "@/sdk/types";

export type TyrePanelStyle = "grid" | "car" | "bars" | "imo" | "rings";
const NAMES = ["FL", "FR", "RL", "RR"];

/** Sıcaklığa göre renk (°C): lo..hi ideal aralık */
export function tpColor(c: number | undefined, lo: number, hi: number) {
  if (c == null || !isFinite(c) || c <= 0) return "#3a3f46";
  if (c < lo - 15) return "#2f7dff";
  if (c < lo) return "#20c4e0";
  if (c <= hi) return "#2bdc4f";
  if (c <= hi + 10) return "#ffd014";
  return "#ff2a1f";
}

const avg = (a: number[]) => {
  const v = a.filter((x) => x > 0);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined;
};

export function TyrePanel(p: {
  tires: Tires | undefined;
  style: TyrePanelStyle;
  /** °C → gösterilecek metin (birim ayarına göre) */
  tv: (c: number) => string;
  unit: string;
  press: boolean;
  lo: number;
  hi: number;
  /** yatay yerleşim (alt / üst) ya da dikey (sol / sağ) */
  vertical: boolean;
}) {
  const corners = () => (p.tires?.available && p.tires.corners.length >= 4 ? p.tires.corners.slice(0, 4) : null);
  const col = (c: number | undefined) => tpColor(c, p.lo, p.hi);
  const txt = (c: number | undefined) => (c == null ? "—" : p.tv(c));
  const psi = (kpa: number) => (kpa > 0 ? (kpa * 0.145038).toFixed(1) : "");
  // Sıcaklık → 0..1 (çubuk / halka doluluğu): 40 °C boş, 130 °C dolu
  const fill = (c: number | undefined) => (c == null ? 0 : Math.max(0, Math.min(1, (c - 40) / 90)));

  return (
    <div class={`tp tp-s-${p.style}`} classList={{ "tp-v": p.vertical }} data-no-i18n>
      <Show when={corners()} fallback={<span class="tp-none">TYRES —</span>}>
        {(cs) => (
          <>
            {/* Kutular: 2x2 renkli bloklar */}
            <Show when={p.style === "grid"}>
              <div class="tp-grid">
                <For each={cs()}>
                  {(c, i) => (
                    <div class="tp-cell" style={{ "--tc": col(avg(c.temp)) }}>
                      <span class="tp-n">{NAMES[i()]}</span>
                      <b>{txt(avg(c.temp))}</b>
                      <Show when={p.press && c.press > 0}>
                        <small>{psi(c.press)}</small>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Araç: üstten görünüm, tekerlekler renkli, değerler yanında */}
            <Show when={p.style === "car"}>
              <div class="tp-car">
                <For each={cs()}>
                  {(c, i) => (
                    <div class={`tp-cv tp-cv${i()}`}>
                      <b style={{ color: col(avg(c.temp)) }}>{txt(avg(c.temp))}</b>
                      <Show when={p.press && c.press > 0}>
                        <small>{psi(c.press)}</small>
                      </Show>
                    </div>
                  )}
                </For>
                <svg class="tp-body" viewBox="0 0 60 110" aria-hidden="true">
                  <path d="M18 6 Q30 0 42 6 L45 30 Q47 55 45 80 L44 100 Q30 108 16 100 L15 80 Q13 55 15 30 Z" />
                  <rect x="22" y="38" width="16" height="22" rx="4" class="tp-cock" />
                  <For each={cs()}>
                    {(c, i) => <rect x={i() % 2 ? 46 : 3} y={i() < 2 ? 14 : 72} width="11" height="22" rx="3" style={{ fill: col(avg(c.temp)) }} />}
                  </For>
                </svg>
              </div>
            </Show>

            {/* Çubuklar: her lastik için dikey termometre */}
            <Show when={p.style === "bars"}>
              <div class="tp-bars">
                <For each={cs()}>
                  {(c, i) => (
                    <div class="tp-bar">
                      <b style={{ color: col(avg(c.temp)) }}>{txt(avg(c.temp))}</b>
                      <div class="tp-tube">
                        <i style={{ height: `${fill(avg(c.temp)) * 100}%`, background: col(avg(c.temp)) }} />
                        <em style={{ bottom: `${fill(p.lo) * 100}%`, height: `${(fill(p.hi) - fill(p.lo)) * 100}%` }} />
                      </div>
                      <span class="tp-n">{NAMES[i()]}</span>
                      <Show when={p.press && c.press > 0}>
                        <small>{psi(c.press)}</small>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* İç / orta / dış: her lastikte üç şerit (yüzey sıcaklıkları) */}
            <Show when={p.style === "imo"}>
              <div class="tp-imo">
                <For each={cs()}>
                  {(c, i) => (
                    <div class="tp-imo-t">
                      <span class="tp-n">{NAMES[i()]}</span>
                      <div class="tp-strips">
                        <For each={c.temp}>
                          {(z) => (
                            <i style={{ background: col(z > 0 ? z : undefined) }}>
                              <small>{z > 0 ? p.tv(z) : "—"}</small>
                            </i>
                          )}
                        </For>
                      </div>
                      <Show when={p.press && c.press > 0}>
                        <small class="tp-p">{psi(c.press)} psi</small>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Halkalar: dairesel gösterge, ortada sıcaklık */}
            <Show when={p.style === "rings"}>
              <div class="tp-rings">
                <For each={cs()}>
                  {(c, i) => {
                    const a = () => avg(c.temp);
                    const R = 16;
                    const L = 2 * Math.PI * R * 0.75;
                    return (
                      <div class="tp-ring">
                        <svg viewBox="0 0 40 40">
                          <circle cx="20" cy="20" r={R} class="tp-ring-bg" stroke-dasharray={`${L} 999`} transform="rotate(135 20 20)" />
                          <circle
                            cx="20"
                            cy="20"
                            r={R}
                            class="tp-ring-fg"
                            style={{ stroke: col(a()) }}
                            stroke-dasharray={`${L * fill(a())} 999`}
                            transform="rotate(135 20 20)"
                          />
                        </svg>
                        <b>{txt(a())}</b>
                        <span class="tp-n">{NAMES[i()]}</span>
                        <Show when={p.press && c.press > 0}>
                          <small>{psi(c.press)}</small>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
      <span class="tp-unit">{p.unit}</span>
    </div>
  );
}
