import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { onScreen } from "@/sdk/overlay";
import { lapTime } from "@/sdk/format";
import { TvLogo, isTr, upper, useTvStandings, useTvVisible, withDefaults } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV En Hızlı Tur: yeni en hızlı tur atılınca mor bant (birkaç saniye).

interface Shot {
  r: Row;
  time: number;
  gain: number;
}

export default function TvFastest(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, info, sample, session } = useTvStandings(() => !!props.editing);
  const [shot, setShot] = createSignal<Shot | null>(null);
  let hideT = 0;
  onCleanup(() => clearTimeout(hideT));

  // Kapsam anahtarı → o kapsamın en iyi turu
  const bests = new Map<string, number>();
  let primed = false;
  // Her oturum (antrenman, sıralama, yarış) ayrı: oturum değişince ve yarışta yeşil bayrakta en iyiler sıfırlanır
  let sesKey = "";
  createEffect(() => {
    const st = session()?.state ?? 0;
    const key = `${info().session}|${st >= 4 ? "go" : "pre"}`;
    if (key !== sesKey) {
      sesKey = key;
      bests.clear();
      primed = false;
    }
  });
  createEffect(() => {
    const l = rows();
    if (sample() || !l.length) return;
    const me = l.find((r) => r.isMe);
    const scope = String(o().scope || "overall");
    const keyOf = (r: Row) => (scope === "overall" ? "all" : `c${r.classId}`);
    const cand = new Map<string, Row>();
    for (const r of l) {
      if (!(r.best > 0)) continue;
      if (scope === "myclass" && me && r.classId !== me.classId) continue;
      const k = keyOf(r);
      const c = cand.get(k);
      if (!c || r.best < c.best) cand.set(k, r);
    }
    for (const k of [...bests.keys()]) if (!cand.has(k)) bests.delete(k);
    for (const [k, r] of cand) {
      const prev = bests.get(k);
      if (prev === undefined || r.best < prev - 0.0005) {
        bests.set(k, r.best);
        // Overlay açıldığında zaten atılmış turlar duyurulmaz; sonra gelen ilk tur (oturumun ilk en hızlısı) ve
        // her iyileşme duyurulur
        if (primed) show({ r, time: r.best, gain: prev !== undefined ? prev - r.best : 0 });
      } else if (r.best > prev + 0.0005) {
        // Tekrarda geri sarıldı: en iyi tur izlenen ana göre yavaşladı, duyurmadan güncelle
        bests.set(k, r.best);
      }
    }
    primed = true;
  });

  function show(s: Shot) {
    setShot(s);
    clearTimeout(hideT);
    hideT = window.setTimeout(() => setShot(null), Math.max(3, Number(o().secs) || 7) * 1000);
  }

  // "Her zaman" / aralıklı: o anki en hızlı tur sahibi (kapsamdaki en iyi tur)
  const holder = (): Shot | null => {
    const l = rows();
    const me = l.find((r) => r.isMe);
    const scope = String(o().scope || "overall");
    let b: Row | undefined;
    for (const r of l) {
      if (!(r.best > 0)) continue;
      if (scope !== "overall" && me && r.classId !== me.classId) continue;
      if (!b || r.best < b.best) b = r;
    }
    return b ? { r: b, time: b.best, gain: 0 } : null;
  };
  const mode = () => String(o().show || "auto");
  const visible = useTvVisible({ o, event: () => (mode() === "auto" ? !!shot() : !!holder()), editing: () => !!props.editing, sample });

  const current = (): Shot | null => {
    const s = shot();
    if (!visible()) return null;
    if (s) return s;
    if (mode() !== "auto" && holder()) return holder();
    if (sample() || props.editing || !onScreen()) {
      const r = rows()[4];
      return r ? { r, time: 117.412, gain: 0.231 } : null;
    }
    return null;
  };
  const scale = () => Math.max(0.5, Math.min(2, (Number(o().scale) || 100) / 100));

  return (
    <Show when={current()}>
      {(s) => (
        <div class="tv tvf" style={{ "--tvf": String(o().color || "#8e2bff"), zoom: String(scale()) }} data-no-i18n>
          <div class="tvf-tag">
            <svg viewBox="0 0 24 24" class="tvf-ic">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l3 2M9 2h6" />
            </svg>
            <b>{upper(String(o().title || "").trim() || "FASTEST LAP")}</b>
          </div>
          <span class="tv-pos tvf-pos">{s().r.pos}</span>
          <TvLogo carName={s().r.carName} class="tvf-logo" />
          <span class="tvf-name">
            <b>{upper(s().r.name, isTr(s().r.name, s().r.flair))}</b>
            <small>{upper(s().r.team || s().r.carName)}</small>
          </span>
          <span class="tv-num tvf-num">{s().r.number}</span>
          <span class="tvf-time">
            <b>{lapTime(s().time)}</b>
            <Show when={s().gain > 0}>
              <small>-{s().gain.toFixed(3)}</small>
            </Show>
          </span>
        </div>
      )}
    </Show>
  );
}
