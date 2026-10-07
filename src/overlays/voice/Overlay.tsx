// Sesli Mühendis overlay'i: motor konuşmaya başlayınca (Rust: voicesub.rs → "voice" konusu) hoparlör simgesi,
// konuşan (Mühendis / Spotter) ve söylenen cümle görünür; konuşma bitince `hold` saniye sonra solarak kaybolur.

import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { demoShow, useTopic } from "@/sdk/telemetry";
import type { VoiceLine } from "@/sdk/types";
import "./style.css";

const SAMPLE: VoiceLine = { id: 0, role: "engineer", text: "Öndekiyle ara 1,3 saniye. Bu tur pite gir.", durationMs: 3000, speaking: true };

export default function Voice(props: OverlayProps) {
  const o = () => props.options;
  const line = useTopic("voice");
  const [shown, setShown] = createSignal<VoiceLine | null>(null);
  const [speaking, setSpeaking] = createSignal(false);
  const [leaving, setLeaving] = createSignal(false);
  let hideTimer: number | undefined;
  let failTimer: number | undefined;
  let outTimer: number | undefined;
  const clear = () => {
    clearTimeout(hideTimer);
    clearTimeout(failTimer);
    clearTimeout(outTimer);
  };
  onCleanup(clear);

  const wanted = (l: VoiceLine) =>
    l.role === "spotter" ? o().showSpotter !== false : l.role === "driver" ? o().showDriver !== false : o().showEngineer !== false;

  /** Konuşma bitti: `hold` saniye bekle, sonra solarak kaldır */
  const finish = () => {
    setSpeaking(false);
    clearTimeout(failTimer);
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      setLeaving(true);
      outTimer = window.setTimeout(() => {
        setShown(null);
        setLeaving(false);
      }, 320);
    }, Math.max(0, Number(o().hold ?? 2)) * 1000);
  };

  // İlk değer atlanır: pencere açıldığında eski (çoktan bitmiş) mesaj gösterilmesin
  createEffect(
    on(
      line,
      (l) => {
        if (!l || !l.text) return;
        const cur = shown();
        if (l.speaking) {
          if (!wanted(l)) {
            // Gösterilmeyen rol araya girdiyse (ör. spotter mühendisi kesti) ekrandaki mesaj bitmiş sayılır
            if (cur && speaking()) finish();
            return;
          }
          clear();
          setLeaving(false);
          setShown(l);
          setSpeaking(true);
          // "Bitti" paketi gelmezse (ses aygıtı yok vb.) süre dolunca kendimiz bitiririz
          failTimer = window.setTimeout(finish, (l.durationMs || 3000) + 1500);
        } else if (cur && cur.id === l.id && speaking()) {
          finish();
        }
      },
      { defer: true },
    ),
  );

  // Düzenlemede, panel önizlemesinde ve Demo modunda (kimse konuşmuyorken) örnek cümle görünür: overlay'in yeri ve
  // görünümü ayarlanabilsin. Demo çoğunlukla sessiz olduğu için eskiden Demo'da hiç görünmüyordu.
  const view = () => shown() ?? (props.editing || !onScreen() || demoShow() ? SAMPLE : null);
  const active = () => (shown() ? speaking() : true);
  const color = () =>
    view()?.role === "spotter"
      ? String(o().spotterColor || "#2ec4b6")
      : view()?.role === "driver"
        ? String(o().driverColor || "#8ab4f8")
        : String(o().engineerColor || "#ff8a2a");
  const align = () => (o().align === "left" ? "flex-start" : o().align === "right" ? "flex-end" : "center");

  return (
    <div class="vo-wrap" style={{ width: `${Number(o().maxWidth) || 640}px`, "justify-content": align() }}>
      <Show when={view()}>
        {(v) => (
          <div
            class="vo-box"
            classList={{ speaking: active(), leaving: leaving(), spotter: v().role === "spotter" }}
            style={{
              "--vo-color": color(),
              "--vo-bg": `${Math.min(100, Math.max(0, Number(o().bgOpacity ?? 85)))}%`,
              "font-size": `${Number(o().fontSize) || 22}px`,
            }}
          >
            <Show when={o().showIcon !== false}>
              <svg class="vo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
                <path class="vo-wave w1" d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path class="vo-wave w2" d="M18.6 5.4a9.5 9.5 0 0 1 0 13.2" />
              </svg>
            </Show>
            <div class="vo-body">
              <Show when={o().showRole !== false}>
                <div class="vo-role">{v().role === "spotter" ? "Spotter" : v().role === "driver" ? "Sen" : "Mühendis"}</div>
              </Show>
              {/* Cümle ses paketinin dilindedir; arayüz çevirisi dokunmasın */}
              <div class="vo-text" data-no-i18n>
                {v().text}
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
