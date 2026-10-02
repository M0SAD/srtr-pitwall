// Araçlar: ayrı pencerelerde açılan ekranlar.

import { Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";
import * as I from "../icons";
import { go } from "../ui";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "../components/ProLock";

export function ToolsPage() {
  const Tool = (p: { icon: any; title: string; text: string; view: string; badge?: string; feature: string }) => (
    <button
      class="tool2"
      classList={{ "prolock-off": proLocked(p.feature) }}
      disabled={proLocked(p.feature)}
      title={proLocked(p.feature) ? "PRO üyelere özel" : undefined}
      onClick={() => invoke("window_open", { view: p.view })}
    >
      <span class="tool2-ic">{p.icon}</span>
      <b>
        {p.title}
        <Show when={p.badge}>
          <span class="chip2 small">{p.badge}</span>
        </Show>
        <ProLockTag feature={p.feature} />
      </b>
      <small>{p.text}</small>
      <span class="tool2-open">
        Aç <I.ExternalLink />
      </span>
    </button>
  );
  return (
    <div class="page">
      <Show when={[F.pitwall, F.timing, F.engineer, F.events].some((k) => proLocked(k))}>
        <ProLockNote text="PRO rozetli araçlar PRO üyelere özel." />
      </Show>
      <div class="tool2-grid">
        <Tool
          icon={<I.LayoutDashboard />}
          title="Pitwall Paneli"
          view="pitwall"
          feature={F.pitwall}
          text="Yarış mühendisi ekranı: sıralama, pist haritası, yakıt stratejisi, lastikler, hava, girdiler, tur süreleri."
        />
        <Tool
          icon={<I.Timer />}
          title="Live Timing"
          view="timing"
          feature={F.timing}
          text="Sınıf sıralaması ve yarış kontrol akışı. Tek tıkla tekrar ve kamera."
        />
        <Tool
          icon={<I.Gauge />}
          title="Mühendis Ekranı"
          view="engineer"
          feature={F.engineer}
          text="Büyük yazılı, ekranlar arasında kendiliğinden geçen mühendis/ikinci monitör görünümü."
        />
        <Tool
          icon={<I.Clapperboard />}
          title="Olaylar"
          view="events"
          feature={F.events}
          text="Oturumun kazaları, geçişleri, pitleri ve bayrakları. Olaya tıkla, iRacing tekrarı o ana gitsin. Yarış bitince kendiliğinden açılır."
        />
      </div>
      <section class="panel">
        <h3>Başka cihazdan</h3>
        <p class="muted">
          Bu ekranları tablet ya da ikinci bilgisayarda açmak için Ayarlar → Entegrasyonlar'dan HTTP sunucusunu ve uzaktan
          erişimi aç.{" "}
          <Show when={!settings().general.server.enabled}>
            <button class="link" onClick={() => go("settings", "integrations")}>
              Entegrasyonlara git
            </button>
          </Show>
        </p>
      </section>
    </div>
  );
}
