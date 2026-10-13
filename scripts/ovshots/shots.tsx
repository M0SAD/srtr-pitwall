// Web sitesi overlay görselleri (geliştirme aracı; uygulamaya girmez). Vite geliştirme sunucusunda
// /scripts/ovshots/shots.html?id=<overlay>&o=<JSON seçenekler> açılır: overlay demo verisiyle (Rust: engine.rs
// dump_demo_topics → demo_topics.json) ve varsayılan ayarlarla çizilir; scripts/ovshots/run.cjs ekran görüntüsünü alır.
import { render } from "solid-js/web";
import { Show, createSignal, type Accessor } from "solid-js";
import { initSettings } from "@/sdk/settings";
import { TopicSourceProvider, type TopicSource } from "@/sdk/telemetry";
import { manifestById } from "@/sdk/registry";
import { unlockPreviews } from "@/sdk/proFeatures";
import { OverlayView } from "@/app/components/OverlayView";
import "@/sdk/fonts";
import "@/overlays/base.css";

const q = new URLSearchParams(location.search);
const id = q.get("id") ?? "standings";
const extra = (() => {
  try {
    return JSON.parse(q.get("o") ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
})();
const editing = q.get("edit") === "1";
/** Konu verisine yama (ör. DigiFlags için bayrak): ?patch={"session":{"flags":["blue"]}} */
const patch = (() => {
  try {
    return JSON.parse(q.get("patch") ?? "{}") as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
})();

async function main() {
  // Görseller PRO tasarımları da göstersin
  unlockPreviews();
  // Ayarlar: varsayılanlar (tarayıcıda ayar sunucusu yok; en çok 1,5 sn beklenir)
  await Promise.race([initSettings("overlay").catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  const data = (await fetch("/scripts/ovshots/demo_topics.json").then((r) => r.json())) as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(patch)) data[k] = { ...(data[k] ?? {}), ...v };
  const sigs = new Map<string, Accessor<unknown>>();
  const src: TopicSource = {
    topic(name) {
      let s = sigs.get(name);
      if (!s) {
        const [get] = createSignal<unknown>(data[name]);
        s = get;
        sigs.set(name, s);
      }
      return s as never;
    },
  };
  const m = manifestById(id);
  const w = Number(q.get("w")) || m?.size.w || 400;
  const h = Number(q.get("h")) || m?.size.h || 200;
  render(
    () => (
      <TopicSourceProvider value={src}>
        <div id="stage" style={{ width: `${w}px`, height: `${h}px` }}>
          <Show when={m} fallback={<p style={{ color: "#fff" }}>yok: {id}</p>}>
            <OverlayView type={id} options={extra} editing={editing} />
          </Show>
        </div>
      </TopicSourceProvider>
    ),
    document.getElementById("root")!,
  );
  // Çekim aracı hazır olunca alır
  setTimeout(() => document.body.setAttribute("data-ready", "1"), 1500);
}
main();
