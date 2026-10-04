import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { inTauri } from "@/sdk/platform";
import { t } from "@/sdk/i18n";
import "./style.css";

// Start Işıkları: yarış öncesi aşama (formasyon / grid), sırayla yanan ışıklar ve sim yarışı başlattığı an yeşil.
//
// Veri ("session" konusu):
//   state        iRacing SessionState ölçeği: 1 araca bin, 2 grid, 3 formasyon, 4 yarış
//   startLights  -1 sim vermiyor · 1 hazır (kırmızılar yanıyor) · 2 set · 3 yeşil  (iRacing SessionFlags start bitleri,
//                LMU / rF2 geri sayım aşaması)
//   startLit / startTotal  yanan ışık sayısı (yalnızca LMU / rF2)
// iRacing ışıkları tek tek vermez: "hazır" süresince ışıklar burada sırayla yakılır (animasyon), "set"te hepsi yanar.
// AMS2 / ACC ışık vermez: aşama yazısı görünür, yeşil yarış durumu "yarış"a geçtiği an gelir.

type Stage = "idle" | "formation" | "grid" | "ready" | "set" | "go";
interface View {
  stage: Stage;
  lit: number;
  total: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const IDLE: View = { stage: "idle", lit: 0, total: 0 };

/** Örnek start dizisinin toplam süresi (sn) ve bölümleri */
const LOOP = { formation: 3, grid: 5.5, step: 0.8, set: 1.2, gap: 4 };

function beep(volume: number) {
  if (inTauri) {
    invoke("overlay_beep", { freq: 880, ms: 450, volume }).catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = volume * 0.4;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => void ctx.close();
  } catch {
    /* ses yok */
  }
}

export default function StartLights(props: OverlayProps) {
  const session = useTopic("session");
  const status = useTopic("status");
  const o = () => props.options;

  const hold = () => clamp(num(o().hold, 4), 1, 20);
  const count = () => clamp(Math.round(num(o().lights, 5)), 3, 7);

  // Saat: animasyonlu aşamalar (sırayla yanan ışıklar, start sonrası süre, örnek döngü) için 10 Hz
  const [now, setNow] = createSignal(performance.now());
  const timer = window.setInterval(() => {
    if (!previewFrozen()) setNow(performance.now());
  }, 100);
  onCleanup(() => clearInterval(timer));

  // --- canlı veri ---
  const [goAt, setGoAt] = createSignal(0);
  const [readyAt, setReadyAt] = createSignal(0);
  let armed = false;
  let prevSt: number | undefined;
  let prevSl: number | undefined;

  const isRace = () => {
    const st = session()?.sessionType;
    return st == null || st === "" || /race|yarış/i.test(st);
  };
  const sample = () => !!status()?.demo || !!status()?.preview;
  // Örnek dizi gösterilsin mi: ekrandaki gerçek overlay'de yalnızca gerçek Demo (panel önizleme verisi akarken değil);
  // panelin kendi önizlemesinde eskisi gibi
  const showSample = () => (onScreen() ? !!status()?.demo && !status()?.preview : sample());

  createEffect(() => {
    const s = session();
    if (!s || sample()) {
      prevSt = prevSl = undefined;
      armed = false;
      return;
    }
    const st = s.state ?? 0;
    const sl = s.startLights ?? -1;
    const ok = !o().raceOnly || isRace();
    const pre = (st >= 1 && st <= 3) || sl === 1 || sl === 2;
    if (pre) armed = true;
    if (sl === 1 && prevSl !== 1) setReadyAt(performance.now());
    const go = (sl === 3 && prevSl !== undefined && prevSl !== 3) || (st === 4 && prevSt !== undefined && prevSt >= 1 && prevSt <= 3);
    if (go && armed && ok) {
      armed = false;
      setGoAt(performance.now());
      if (o().beep === true && onScreen()) beep(clamp(num(o().beepVolume, 60), 10, 100) / 100);
    }
    // Yeni start öncesi (yeniden start, yeni oturum): eski "GO" hemen kalksın
    if (pre && sl !== 3 && goAt() && performance.now() - goAt() > 1500) setGoAt(0);
    prevSt = st;
    prevSl = sl;
  });

  const live = createMemo<View>(() => {
    const s = session();
    if (!s || sample()) return IDLE;
    if (goAt() && now() - goAt() < hold() * 1000) return { stage: "go", lit: 0, total: 0 };
    if (o().raceOnly && !isRace()) return IDLE;
    const st = s.state ?? 0;
    const sl = s.startLights ?? -1;
    const total = clamp(Math.round(s.startTotal ?? 0), 0, 8);
    if (sl === 2) return { stage: "set", lit: total || count(), total };
    if (sl === 1) {
      // Sim ışıkları tek tek veriyorsa onunki; vermiyorsa sırayla yakılır (son ışık "set"te yanar)
      const lit = total > 0 ? clamp(Math.round(s.startLit ?? 0), 0, total) : clamp(1 + Math.floor((now() - readyAt()) / 700), 1, count() - 1);
      return { stage: "ready", lit, total };
    }
    if (sl === 3) return IDLE; // yeşil biti hâlâ duruyor ama süre doldu
    if (st === 3) return o().showFormation === false ? IDLE : { stage: "formation", lit: 0, total };
    if (st === 1 || st === 2) return o().showFormation === false ? IDLE : { stage: "grid", lit: 0, total };
    return IDLE;
  });

  // --- örnek dizi (Demo modu, panel önizlemesi, düzenleme) ---
  const loopView = createMemo<View>(() => {
    const n = count();
    if (previewFrozen()) return { stage: "set", lit: n, total: 0 };
    const goLen = Math.min(hold(), 4);
    const tReady = LOOP.grid + n * LOOP.step;
    const tGo = tReady + LOOP.set;
    const total = tGo + goLen + LOOP.gap;
    const x = (now() / 1000) % total;
    if (x < LOOP.formation) return { stage: "formation", lit: 0, total: 0 };
    if (x < LOOP.grid) return { stage: "grid", lit: 0, total: 0 };
    if (x < tReady) return { stage: "ready", lit: clamp(1 + Math.floor((x - LOOP.grid) / LOOP.step), 1, n - 1), total: 0 };
    if (x < tGo) return { stage: "set", lit: n, total: 0 };
    if (x < tGo + goLen) return { stage: "go", lit: 0, total: 0 };
    // Düzenlemede boşlukta da çerçeve görünsün
    return props.editing ? { stage: "grid", lit: 0, total: 0 } : IDLE;
  });

  const view = createMemo<View>(() => {
    const l = live();
    if (l.stage !== "idle") return l;
    if (showSample() || props.editing || (!onScreen() && !session())) return loopView();
    return IDLE;
  });
  // Kaybolurken son görüntü kalsın (çıkış animasyonu boş kutuyla oynamasın)
  let last: View = { stage: "grid", lit: 0, total: 0 };
  const shown = createMemo<View>(() => {
    const v = view();
    if (v.stage !== "idle") last = v;
    return v.stage === "idle" ? last : v;
  });
  const on = () => view().stage !== "idle";
  const stage = () => shown().stage;
  const total = () => (shown().total > 0 ? shown().total : count());
  const lit = () => (stage() === "set" ? total() : Math.min(shown().lit, total()));

  const phaseText = () => {
    switch (stage()) {
      case "formation":
        return t("FORMASYON TURU");
      case "grid":
        return t("GRID");
      case "ready":
        return t("HAZIR");
      case "set":
        return t("DİKKAT");
      default:
        return "";
    }
  };
  const goText = () => String(o().goText ?? "GO!").trim();
  const design = () => (["gantry", "traffic", "minimal"].includes(o().design) ? (o().design as string) : "gantry");
  const lampClass = (i: number) => {
    if (stage() === "go") return o().goStyle === "out" ? "" : "green";
    return i < lit() ? "red" : "";
  };

  return (
    <div
      class={`ov-theme stl stl-d-${design()} stl-s-${stage()}`}
      classList={{ "stl-off": !on() }}
      style={{
        "--stl-size": `${clamp(num(o().size, 46), 24, 110)}px`,
        "--stl-red": (o().redColor as string) || "#ff2b2b",
        "--stl-green": (o().greenColor as string) || "#2fe36e",
        "font-size": `${clamp(num(o().fontSize, 18), 11, 40)}px`,
      }}
    >
      <Show when={design() === "gantry"}>
        <div class="stl-beam">
          <i class="stl-leg" />
          <For each={Array.from({ length: total() }, (_, i) => i)}>
            {(i) => (
              <span class="stl-pod">
                <b class={`stl-lamp ${lampClass(i)}`} />
                <b class={`stl-lamp ${lampClass(i)}`} />
              </span>
            )}
          </For>
          <i class="stl-leg" />
        </div>
      </Show>
      <Show when={design() === "traffic"}>
        <div class="stl-box">
          <b class="stl-lamp" classList={{ red: stage() !== "go" && stage() !== "idle" }} />
          <b class="stl-lamp" classList={{ amber: stage() === "set" || (stage() === "ready" && lit() >= total() - 1) }} />
          <b class="stl-lamp" classList={{ green: stage() === "go" }} />
        </div>
      </Show>
      <Show when={design() === "minimal" && stage() !== "go"}>
        <div class="stl-dots">
          <For each={Array.from({ length: total() }, (_, i) => i)}>{(i) => <i classList={{ on: i < lit() }} />}</For>
        </div>
      </Show>
      <div class="stl-text">
        <Show
          when={stage() === "go"}
          fallback={
            <Show when={o().showPhase !== false && phaseText()}>
              <span class="stl-phase">{phaseText()}</span>
            </Show>
          }
        >
          <Show when={goText()}>
            <span class="stl-go" data-no-i18n>
              {goText()}
            </span>
          </Show>
        </Show>
      </div>
    </div>
  );
}
