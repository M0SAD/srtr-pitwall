// Uzak gösterge sayfası (PRO: dashboard.remote): yerel web sunucusu /dash ve /dash/<kimlik> adreslerinde sunar.
// Telefon / tablette tam ekran direksiyon ekranı: özel tasarım (Dashboard Tasarımcısı), hazır görünüm ya da araca göre
// kendiliğinden seçilen araç tarzı ekran. Veri SSE ile gelir (sdk/telemetry); ayar değişiklikleri de aynı akıştan.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { initSettings, settings } from "@/sdk/settings";
import { startDomTranslation } from "@/sdk/i18n";
import { startEntitlement } from "@/cloud/account";
import { sanitizeOverlayOptions, startProFeatures } from "@/sdk/proFeatures";
import { defaultOptions } from "@/sdk/overlay";
import { query } from "@/sdk/platform";
import { setSubscriptions, streamOpen, useTopic, type Sub } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import "@/sdk/fonts";
import "@/overlays/base.css";
import Dashboard from "@/overlays/dashboard/Overlay";
import manifest from "@/overlays/dashboard/manifest";
import { DashCanvas, FitBox } from "./Render";
import { DASH_TOPICS, useDemoDash, useLiveDash } from "./data";
import "./remote.css";

const STORE = "pitwall.dash";
const demoMode = query.get("demo") === "1";

/** /dash/<kimlik> ya da ?d=<kimlik> */
function idFromUrl(): string {
  const m = /^\/dash\/([^/]+)\/?$/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]) : (query.get("d") ?? "");
}

// --- Ekranı uyanık tut -------------------------------------------------------------
// Wake Lock API yalnızca güvenli bağlamda (https / localhost) var; yerel ağ adresi http olduğu için çoğu cihazda yok.
// O zaman ilk dokunuşta görünmez, sessiz bir video oynatılır (tarayıcılar video oynarken ekranı kapatmaz).
let wakeOn = false;
function keepAwake() {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } };
  if (nav.wakeLock) {
    const req = () => nav.wakeLock!.request("screen").then(() => (wakeOn = true)).catch(() => {});
    void req();
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void req());
    return;
  }
  const start = () => {
    if (wakeOn) return;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const ctx = c.getContext("2d")!;
      const stream = (c as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(1);
      if (!stream) return;
      let n = 0;
      window.setInterval(() => {
        ctx.fillStyle = n++ % 2 ? "#000" : "#010101";
        ctx.fillRect(0, 0, 2, 2);
      }, 1000);
      const v = document.createElement("video");
      v.muted = true;
      v.setAttribute("playsinline", "");
      v.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
      v.srcObject = stream;
      document.body.appendChild(v);
      void v.play().then(() => (wakeOn = true)).catch(() => v.remove());
    } catch {
      /* desteklenmiyor */
    }
  };
  document.addEventListener("pointerdown", start);
}

/** Doğal boyutu içerikten gelen öğeyi (hazır görünümler) ekrana sığdırır */
function FitContent(p: { children: any }) {
  let host!: HTMLDivElement;
  let inner!: HTMLDivElement;
  const [k, setK] = createSignal(1);
  onMount(() => {
    const fit = () => {
      const w = inner.offsetWidth;
      const h = inner.offsetHeight;
      if (w && h) setK(Math.min(host.clientWidth / w, host.clientHeight / h));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    ro.observe(inner);
    onCleanup(() => ro.disconnect());
  });
  return (
    <div ref={host} class="rd-fit">
      <div ref={inner} class="rd-fit-in" style={{ transform: `translate(-50%, -50%) scale(${k()})` }}>
        {p.children}
      </div>
    </div>
  );
}

function Remote() {
  const [id, setId] = createSignal(idFromUrl() || localStorage.getItem(STORE) || "");
  const [page, setPage] = createSignal(0);
  const [menu, setMenu] = createSignal(false);
  const [full, setFull] = createSignal(!!document.fullscreenElement);

  const dashes = () => settings().dashes;
  const views = createMemo(() => {
    const f = manifest.settings.find((x) => x.key === "view");
    return f?.type === "select" ? f.options.filter((o) => o.value !== "custom") : [];
  });
  const custom = createMemo(() => dashes().find((d) => d.id === id()));
  /** Hazır görünüm kimliği; seçim yoksa / geçersizse: ilk tasarım, o da yoksa "auto" */
  const view = createMemo(() => {
    if (custom()) return undefined;
    if (views().some((v) => v.value === id())) return id();
    return dashes().length && !id() ? undefined : "auto";
  });
  const dash = createMemo(() => custom() ?? (view() ? undefined : dashes()[0]));

  const choose = (v: string) => {
    setId(v);
    setPage(0);
    setMenu(false);
    try {
      localStorage.setItem(STORE, v);
      history.replaceState(null, "", `${v ? `/dash/${encodeURIComponent(v)}` : "/dash"}${location.search}`);
    } catch {
      /* gizli sekme */
    }
  };

  // Abonelik: özel tasarımın alanları + hazır görünümlerin konuları + araç bilgisi (otomatik araç tarzı)
  createEffect(() => {
    const subs: Sub[] = [...DASH_TOPICS, ...manifest.topics, { name: "status", hz: 1 }];
    void setSubscriptions(subs);
  });
  const live = useLiveDash();
  const demo = useDemoDash(() => demoMode);
  const tel = useTopic("telemetry");
  const data = () => (demoMode ? demo() : live());

  // Hazır görünümün ayarları: kullanıcının etkin düzendeki Direksiyon Ekranı ayarları (renkler, birimler…) + seçilen görünüm
  const options = createMemo(() => {
    const s = settings();
    const profiles = [s.profiles[s.activeProfile], ...Object.values(s.profiles)].filter(Boolean);
    let saved: Record<string, unknown> | undefined;
    for (const p of profiles) {
      const inst = Object.values(p.overlays).find((i) => i.type === "dashboard");
      if (inst) {
        saved = inst.options;
        break;
      }
    }
    return sanitizeOverlayOptions("dashboard", { ...defaultOptions(manifest), ...(saved ?? {}), view: view() ?? "classic" });
  });

  // Bağlantı koptuysa (bilgisayar uyudu, uygulama kapandı) sunucu geri gelince sayfayı tazele
  const [down, setDown] = createSignal(false);
  onMount(() => {
    let lost = 0;
    const iv = window.setInterval(async () => {
      if (streamOpen()) {
        lost = 0;
        setDown(false);
        return;
      }
      lost++;
      if (lost >= 2) setDown(true);
      if (lost >= 3) {
        const ok = await fetch("/api/dash", { cache: "no-store" }).then((r) => r.ok || r.status === 403).catch(() => false);
        if (ok) location.reload();
      }
    }, 2500);
    const fs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    onCleanup(() => {
      clearInterval(iv);
      document.removeEventListener("fullscreenchange", fs);
    });
  });

  const toggleFull = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else el.webkitRequestFullscreen?.();
    setMenu(false);
  };
  const canFull = () => !!(document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);

  const tap = () => {
    if (menu()) return setMenu(false);
    const d = dash();
    if (d && d.pages.length > 1) setPage((p) => (p + 1) % d.pages.length);
    else setMenu(true);
  };

  return (
    <div class="rd ov-theme" style={themeVars(settings().theme)} onClick={tap}>
      <Show
        when={dash()}
        fallback={
          <FitContent>
            <Dashboard options={options()} units={settings().general.units} editing={demoMode} />
          </FitContent>
        }
      >
        {(d) => (
          <FitBox w={d().width} h={d().height}>
            <DashCanvas dash={d()} page={page()} data={data} units={settings().general.units} />
          </FitBox>
        )}
      </Show>

      <Show when={down()}>
        <div class="rd-banner">Bağlantı kesildi, yeniden bağlanılıyor…</div>
      </Show>
      <Show when={!down() && !demoMode && !tel() && !menu()}>
        <div class="rd-banner dim">Simülasyon bekleniyor</div>
      </Show>
      <Show when={(dash()?.pages.length ?? 0) > 1}>
        <div class="rd-dots">
          <For each={dash()!.pages}>{(_, i) => <i classList={{ on: i() === page() % dash()!.pages.length }} />}</For>
        </div>
      </Show>

      <button
        class="rd-btn"
        aria-label="Menü"
        onClick={(e) => {
          e.stopPropagation();
          setMenu(!menu());
        }}
      >
        ⋮
      </button>
      <Show when={menu()}>
        <div class="rd-menu" onClick={(e) => e.stopPropagation()}>
          <b>SRTR Pitwall</b>
          <label>
            <span>Ekran</span>
            <select value={dash()?.id ?? view() ?? ""} onChange={(e) => choose(e.currentTarget.value)}>
              <Show when={dashes().length}>
                <optgroup label="Tasarımların">
                  <For each={dashes()}>
                    {(d) => (
                      <option value={d.id} selected={dash()?.id === d.id}>
                        {d.name}
                      </option>
                    )}
                  </For>
                </optgroup>
              </Show>
              <optgroup label="Hazır görünümler">
                <For each={views()}>
                  {(o) => (
                    <option value={o.value} selected={view() === o.value}>
                      {o.label}
                    </option>
                  )}
                </For>
              </optgroup>
            </select>
          </label>
          <Show when={canFull()}>
            <button onClick={toggleFull}>{full() ? "Tam ekrandan çık" : "Tam ekran"}</button>
          </Show>
          <button onClick={() => setMenu(false)}>Kapat</button>
          <small>
            <i classList={{ ok: streamOpen() }} /> {streamOpen() ? "Bağlı" : "Bağlantı yok"}
            <Show when={(dash()?.pages.length ?? 0) > 1}> · Ekrana dokun: sonraki sayfa</Show>
          </small>
        </div>
      </Show>
    </div>
  );
}

const root = document.getElementById("root")!;
initSettings("overlay").then(() => {
  startDomTranslation();
  root.textContent = "";
  render(() => <Remote />, root);
  startEntitlement();
  startProFeatures(false);
  keepAwake();
});
