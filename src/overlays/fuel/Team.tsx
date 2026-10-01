// Takım yakıt paylaşımı (MQTT takım kodu ya da güvenilir arkadaşlar): takım arkadaşlarının araçlarındaki yakıt.
import { For, Show } from "solid-js";
import { useTopic } from "@/sdk/telemetry";
import { fuel } from "@/sdk/format";
import type { Units } from "@/sdk/overlay";

export function TeamFuel(props: { units: Units; hideMe?: boolean }) {
  const team = useTopic("team");
  const members = () => (team()?.members ?? []).filter((m) => !(props.hideMe && m.me));
  const age = (s: number) => (s < 5 ? "canlı" : s < 90 ? `${Math.round(s)} sn önce` : `${Math.round(s / 60)} dk önce`);

  return (
    <Show when={team()?.enabled}>
      <div class="fuel-team">
        <div class="fuel-team-head">
          {/* Takım kodu yoksa veri güvenilir arkadaşlardan geliyordur: boş "TAKIM · " yerine "ARKADAŞLAR" */}
          <Show when={team()!.team.trim()} fallback={<span>ARKADAŞLAR</span>}>
            <span>TAKIM · {team()!.team}</span>
            <span class="fuel-team-dot" classList={{ on: team()!.connected }} title={team()!.connected ? "MQTT bağlı" : "MQTT bağlı değil"} />
          </Show>
        </div>
        <Show when={members().length > 0} fallback={<div class="fuel-note ov-dim">Takımdan veri yok</div>}>
          <For each={members()}>
            {(m) => (
              <div class="fuel-team-row" classList={{ stale: m.age > 30 }}>
                <span class="fuel-team-name">
                  {m.number ? `#${m.number} ` : ""}
                  {m.sender}
                  {m.me ? " (sen)" : ""}
                </span>
                <span class="ov-mono">{fuel(m.level, props.units, 1)}</span>
                <span class="ov-mono ov-dim">{m.lapsLeft > 0 ? `${m.lapsLeft.toFixed(1)} tur` : "—"}</span>
                <span class="ov-dim fuel-team-age">{m.onPit ? "PİT" : age(m.age)}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
