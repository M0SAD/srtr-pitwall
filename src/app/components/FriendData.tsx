// Arkadaşın verileri: yakıt, tur süreleri ve pistteki konumu. Arkadaş çevrimdışı olsa bile
// sunucudaki son veri gösterilir (ne zaman alındığıyla birlikte). Hiç veri yoksa örnek gösterilebilir.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import { lapTime } from "@/sdk/format";
import { getLive, onLive, pingLink, type Friend, type LiveData } from "@/cloud/social";
import { liveWatch } from "@/cloud/pings";
import { pointAt, useTrack } from "@/sdk/trackshape";
import { cssVar, drawTrack, fitTransform } from "@/overlays/trackmap/draw";

const SAMPLE: LiveData = {
  sender: "Örnek",
  car: "Porsche 911 GT3 R",
  number: "77",
  level: 41.3,
  pct: 0.52,
  max: 80,
  usage: 2.84,
  lapsLeft: 14.5,
  refuel: 18.2,
  lap: 12,
  onPit: false,
  ts: Date.now(),
  track: "Circuit de Spa-Francorchamps",
  session: "Race",
  lapPct: 0.37,
  position: 4,
  best: 138.412,
  last: 139.027,
  laps: [
    { lap: 7, time: 140.88, valid: true, pit: false },
    { lap: 8, time: 139.61, valid: true, pit: false },
    { lap: 9, time: 138.412, valid: true, pit: false },
    { lap: 10, time: 152.3, valid: true, pit: true },
    { lap: 11, time: 139.44, valid: true, pit: false },
    { lap: 12, time: 139.027, valid: false, pit: false },
  ],
};

function MiniTrack(props: { pct: number; track: string }) {
  const { shape } = useTrack();
  let canvas: HTMLCanvasElement | undefined;
  const W = 300;
  const H = 190;
  createEffect(() => {
    const s = shape();
    const pct = props.pct;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const text = cssVar(canvas, "--text", "#e9ecf2");
    let pos: [number, number];
    if (s) {
      const xf = fitTransform(s, W, H, 16, 0, false);
      drawTrack(ctx, s, xf, { line: 5, fill: false, text, bg: "rgba(12,14,19,0.8)", outline: "#11131a" });
      pos = xf(pointAt(s, pct));
    } else {
      // Pist şekli yoksa tur yüzdesini halka üstünde göster (başlangıç/bitiş çizgisi üstte)
      const cx = W / 2;
      const cy = H / 2;
      const r = 66;
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#11131a";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = text;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 10);
      ctx.lineTo(cx, cy - r + 10);
      ctx.stroke();
      const a = -Math.PI / 2 + pct * Math.PI * 2;
      pos = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    ctx.fillStyle = "#ff8a2a";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  return <canvas class="flive-map" style={{ width: `${W}px`, height: `${H}px` }} ref={canvas} />;
}

export default function FriendData(props: { f: Friend }) {
  const [real, setReal] = createSignal<LiveData | null>(null);
  const [at, setAt] = createSignal(0);
  const [sample, setSample] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  // "Bakıyorum" haberi: arkadaş yalnızca bakan varken canlı veri gönderir
  const watch = pingLink(liveWatch(props.f.friend_id));
  watch.ping();
  const watchIv = setInterval(() => !document.hidden && watch.ping(), 20_000);
  onCleanup(() => (clearInterval(watchIv), watch.close()));
  onMount(async () => {
    const r = await getLive(props.f.friend_id).catch(() => null);
    if (r) {
      setReal(r.data);
      setAt(new Date(r.updated_at).getTime());
    }
    setLoaded(true);
    const stop = await onLive([props.f.friend_id], (_u, x) => {
      setReal(x);
      setAt(Date.now());
    });
    onCleanup(stop);
  });
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(iv));

  const d = createMemo(() => (sample() ? SAMPLE : real()));
  const age = createMemo(() => (sample() ? 0 : Math.max(0, Math.round((now() - at()) / 1000))));
  const ago = (s: number) => (s < 10 ? t("Canlı") : s < 90 ? t("{0} sn önce", s) : s < 5400 ? t("{0} dk önce", Math.round(s / 60)) : t("{0} sa önce", Math.round(s / 3600)));
  const f1 = (v: number | undefined, u = "") => (v === undefined || !isFinite(v) ? "—" : `${v.toFixed(1)}${u}`);
  const laps = createMemo(() => [...(d()?.laps ?? [])].reverse());
  const bestTime = createMemo(() => d()?.best || Math.min(...(d()?.laps ?? []).filter((l) => l.valid && l.time > 0).map((l) => l.time), Infinity));

  return (
    <div class="flive">
      <Show
        when={d()}
        fallback={
          <div class="fdock-empty">
            <p class="muted small">
              <Show when={loaded()} fallback={t("Yükleniyor…")}>
                {t("Bu arkadaştan henüz veri gelmedi. Arkadaşın seni güvenilir seçmiş ve en az bir kez pistte olmuş olmalı.")}
              </Show>
            </p>
            <button class="btn small" onClick={() => setSample(true)}>
              {t("Örnek veriyi göster")}
            </button>
          </div>
        }
      >
        <div class="flive-head" data-no-i18n>
          <b>
            #{d()!.number} {d()!.car}
          </b>
          <small>{[d()!.session, d()!.track].filter(Boolean).join(" · ")}</small>
        </div>
        <small class="muted">
          {sample() ? t("Örnek veri") : age() < 10 ? t("Canlı") : `${t("Çevrimdışı · son veri")}: ${ago(age())}`}
        </small>
        <div class="flive-grid">
          <div>
            <small>{t("Sıralama")}</small>
            <b>{d()!.position ? `P${d()!.position}` : "—"}</b>
          </div>
          <div>
            <small>{t("Tur")}</small>
            <b>{d()!.lap}</b>
          </div>
          <div>
            <small>{t("En iyi tur")}</small>
            <b>{isFinite(bestTime()) ? lapTime(bestTime()) : "—"}</b>
          </div>
          <div>
            <small>{t("Son tur")}</small>
            <b>{d()!.last ? lapTime(d()!.last) : "—"}</b>
          </div>
          <div>
            <small>{t("Yakıt")}</small>
            <b>{f1(d()!.level, " L")}</b>
            <i>{Math.round((d()!.pct || 0) * 100)}%</i>
          </div>
          <div>
            <small>{t("Kalan tur")}</small>
            <b>{f1(d()!.lapsLeft)}</b>
          </div>
          <div>
            <small>{t("Tur başı")}</small>
            <b>{f1(d()!.usage, " L")}</b>
          </div>
          <div>
            <small>{t("Bitiş için eklenecek")}</small>
            <b>{f1(d()!.refuel, " L")}</b>
          </div>
        </div>

        <div class="flive-sec">{t("Pistteki konumu")}</div>
        <MiniTrack pct={d()!.lapPct ?? 0} track={d()!.track ?? ""} />
        <small class="muted">
          {d()!.onPit ? t("Pitte") : `${t("Turun")} %${Math.round((d()!.lapPct ?? 0) * 100)}`}
        </small>

        <div class="flive-sec">{t("Tur süreleri")}</div>
        <Show when={laps().length} fallback={<small class="muted">{t("Tur kaydı yok")}</small>}>
          <div class="flive-laps">
            <For each={laps()}>
              {(l) => (
                <div classList={{ best: l.time === bestTime() && l.valid, bad: !l.valid }}>
                  <span>{l.lap}</span>
                  <b>{lapTime(l.time)}</b>
                  <i>{l.pit ? "PIT" : !l.valid ? t("Geçersiz") : l.time === bestTime() ? t("En iyi") : ""}</i>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
