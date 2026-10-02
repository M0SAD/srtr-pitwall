// Tek overlay sayfası: overlay.html?only=<overlayId> (OBS tarayıcı kaynağı kısa adresleri /livechat, /livepoll,
// /captions buraya yönlenir). Overlay, düzen konumu ve iRacing bağlantısından bağımsız olarak sayfanın sol üst
// köşesinde çizilir. Ayarları: ?key=<kopya kimliği>&layout=<düzen> ya da etkin düzendeki ilk kopya (yoksa varsayılanlar).

import { Show, Suspense, createEffect, createMemo, lazy, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Dynamic } from "solid-js/web";
import { isLocked } from "@/cloud/account";
import { defaultOptions, setOnScreen } from "@/sdk/overlay";
import { sanitizeOverlayOptions } from "@/sdk/proFeatures";
import { loadComponent, manifestById } from "@/sdk/registry";
import { instanceName, settings } from "@/sdk/settings";
import { inTauri, query } from "@/sdk/platform";
import { t } from "@/sdk/i18n";
import { setSubscriptions } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { lookStyle } from "@/sdk/lookStyle";

export function Single(props: { type: string }) {
  const m = manifestById(props.type);
  const loader = loadComponent(props.type);
  const Comp = loader ? lazy(loader) : undefined;

  const instance = createMemo(() => {
    const s = settings();
    const key = query.get("key");
    const layout = query.get("layout");
    const profiles = layout && s.profiles[layout] ? [s.profiles[layout]] : [s.profiles[s.activeProfile], ...Object.values(s.profiles)].filter(Boolean);
    for (const p of profiles) {
      if (key && p.overlays[key]?.type === props.type) return p.overlays[key];
      const inst = Object.values(p.overlays).find((i) => i.type === props.type && i.enabled) ?? p.overlays[props.type];
      if (inst) return inst;
    }
    return undefined;
  });
  const options = createMemo(() => instance()?.options ?? (m ? defaultOptions(m) : {}));

  // Tek overlay sayfası da gerçek bir yüzeydir (OBS tarayıcı kaynağı / VR penceresi): overlay'ler panel önizlemesi
  // gibi davranmasın (ör. Canlı Sohbet kapı kararını uygular, örnek veriyi kendiliğinden göstermez)
  setOnScreen(true);
  createEffect(() => {
    if (m) void setSubscriptions(m.topics);
  });

  // Tema + bu kopyanın kendi görünümü (sdk/look.ts)
  const vars = createMemo(() => ({ ...themeVars(settings().theme), ...lookStyle(instance()?.look, settings().theme) }));

  // VR modu penceresi (?vr=1, Rust: vr.rs): içerik sol üstte; pencere içeriğe sığdırılır ve başlığı overlay'in
  // adı olur ("SRTR Pitwall - Relative"), böylece VR pencere yakalama araçlarında ayırt edilir.
  const vr = query.get("vr") === "1" && inTauri;
  const vrBg = /^[0-9a-f]{6}$/i.test(query.get("bg") ?? "") ? `#${query.get("bg")}` : "";
  let box: HTMLDivElement | undefined;
  const vrTitle = () => {
    const s = settings();
    const key = query.get("key") ?? props.type;
    const layout = query.get("layout");
    const inst = (layout && s.profiles[layout] ? s.profiles[layout] : s.profiles[s.activeProfile])?.overlays[key];
    return inst?.name ? inst.name : inst ? t(instanceName(key, inst)) : t(m?.name ?? props.type);
  };
  onMount(() => {
    if (!vr || !box) return;
    // Opak VR arka planı: pencere içerikten büyük kaldığı anlarda da aynı renk görünsün
    if (vrBg) document.documentElement.style.background = document.body.style.background = vrBg;
    let last = "";
    const fit = () => {
      const r = box!.getBoundingClientRect();
      // İçerik yokken (overlay gizli) pencere küçük bir yer tutucu boyutunda kalır
      const w = Math.ceil(Math.max(r.width, m ? Math.min(m.size.w, 240) : 120));
      const h = Math.ceil(Math.max(r.height, 48));
      const title = vrTitle();
      const sig = `${title}|${w}|${h}`;
      if (sig === last) return;
      last = sig;
      invoke("vr_fit", { title, w, h }).catch(() => {});
    };
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    createEffect(fit);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      ref={box}
      class="host ov-theme single"
      style={{
        ...vars(),
        padding: "8px",
        display: "flex",
        "flex-direction": "column",
        // Sohbet ve altyazı alta yaslı (OBS kaynağının alt kenarı), anket üstte
        "justify-content": vr || props.type === "livepoll" ? "flex-start" : "flex-end",
        "align-items": props.type === "captions" && !vr ? "center" : "flex-start",
        ...(vr ? { position: "absolute", inset: "auto", left: "0", top: "0", width: "max-content", height: "max-content", overflow: "visible" } : {}),
        ...(vrBg ? { background: vrBg } : {}),
      }}
    >
      <Show when={m && Comp} fallback={<div class="ov-panel ov-empty">Overlay bulunamadı</div>}>
        <Show when={!isLocked(props.type)} fallback={<div class="ov-panel ov-empty">Bu overlay PRO üyelere özel</div>}>
          <Suspense>
            <Dynamic component={Comp} options={sanitizeOverlayOptions(props.type, options())} units={settings().general.units} editing={false} />
          </Suspense>
        </Show>
      </Show>
    </div>
  );
}
