// Aracın lastik hamuru için küçük yuvarlak rozet (Relative / Sıralama "Lastik" sütunu).
// Yağmur mavi damla, ara yeşil I, yumuşak kırmızı S, orta sarı M, sert beyaz H, türü
// bilinmeyen kuru gri D. Veri yoksa boş kalır.

import { Show } from "solid-js";
import { t } from "./i18n";

const TITLES: Record<string, string> = {
  W: "Yağmur lastiği",
  I: "Ara lastik (intermediate)",
  S: "Yumuşak lastik",
  M: "Orta lastik",
  H: "Sert lastik",
  D: "Kuru lastik",
};

export function TireBadge(props: { kind?: string }) {
  const k = () => (props.kind && TITLES[props.kind] ? props.kind : "");
  return (
    <Show when={k()}>
      <span class={`tyb tyb-${k().toLowerCase()}`} title={TITLES[k()]} data-tip={t(TITLES[k()])}>
        <Show when={k() === "W"} fallback={<b>{k()}</b>}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4.5c3 3.8 4.8 6.4 4.8 8.9a4.8 4.8 0 0 1-9.6 0c0-2.5 1.8-5.1 4.8-8.9Z" />
          </svg>
        </Show>
      </span>
    </Show>
  );
}
