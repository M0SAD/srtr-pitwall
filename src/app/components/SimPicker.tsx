// Üst çubuktaki simülasyon seçici: Otomatik + desteklenen simler.
// Seçim `general.sim` ayarına yazılır (Rust tarafı saniyede bir okur); bağlı olan sim
// `status.sim` ile yumuşak vurgulanır.

import { For, Show } from "solid-js";
import { settings, updateSettings, type SimChoice } from "@/sdk/settings";
import { useTopic } from "@/sdk/telemetry";
import { simIconsOn } from "@/cloud/account";

type Opt = { id: SimChoice; label: string; title: string; /** Bu düğmeyi vurgulayan status.sim değerleri */ match: string[] };

const OPTS: Opt[] = [
  { id: "auto", label: "Otomatik", title: "Çalışan simi kendiliğinden bul (önce iRacing)", match: [] },
  { id: "iracing", label: "iRacing", title: "Sadece iRacing", match: ["iracing"] },
  { id: "acc", label: "ACC", title: "Assetto Corsa Competizione", match: ["acc"] },
  { id: "ac", label: "AC", title: "Assetto Corsa", match: ["ac"] },
  {
    id: "lmu",
    label: "LMU",
    title: "Le Mans Ultimate / rFactor 2 (rF2 Shared Memory Map Plugin gerekir)",
    match: ["lmu", "rf2"],
  },
  { id: "ams2", label: "AMS2", title: "Automobilista 2 / Project CARS 2 (paylaşımlı bellek: Project CARS 2)", match: ["ams2"] },
];

// Oyun ikonları: src/assets/simlogos/<id>.png / .svg (bkz. o klasördeki README.md). Dosya yoksa kısa ad yazılır.
// Yönetici Yönetim › Görünürlük'ten ikonları kapatabilir (app_config.sim_icons, c51): o zaman herkes yazılı görünümü görür.
export const ICONS: Record<string, string> = (() => {
  const mods = import.meta.glob(["../../assets/simlogos/*.png", "../../assets/simlogos/*.svg"], { eager: true, query: "?url", import: "default" }) as Record<string, string>;
  const out: Record<string, string> = {};
  // png önce, svg sonra: svg aynı adın üzerine yazar
  for (const [path, url] of Object.entries(mods).sort(([x], [y]) => Number(/\.svg$/i.test(x)) - Number(/\.svg$/i.test(y)))) {
    out[path.split("/").pop()!.replace(/\.(png|svg)$/i, "").toLowerCase()] = url;
  }
  return out;
})();

export function SimPicker() {
  const status = useTopic("status");
  const chosen = () => {
    const s = settings().general.sim ?? "auto";
    // rF2 seçimi LMU düğmesinde gösterilir
    return s === "rf2" ? "lmu" : s;
  };
  const live = () => {
    const st = status();
    return st?.connected && !st.demo && !st.preview ? st.sim ?? "" : "";
  };
  const title = (o: Opt) => {
    const on = o.match.includes(live());
    return on && st() ? `${o.title} · Bağlı${st()}` : o.title;
  };
  const st = () => {
    const s = status();
    if (!s?.track) return "";
    return s.carName ? ` · ${s.track} · ${s.carName}` : ` · ${s.track}`;
  };

  return (
    <div class="seg" title="Simülasyon">
      <For each={OPTS}>
        {(o) => (
          <button
            classList={{ on: chosen() === o.id, "on-soft": chosen() !== o.id && o.match.includes(live()), "sim-active": o.match.includes(live()) }}
            title={title(o)}
            onClick={() => updateSettings((d) => (d.general.sim = o.id))}
          >
            <Show when={simIconsOn() && ICONS[o.id]} fallback={o.label}>
              <img class="sim-ico" src={ICONS[o.id]} alt={o.label} draggable={false} />
            </Show>
            <Show when={o.match.includes(live())}>
              <i class="sim-live" />
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
