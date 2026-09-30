// Araçlar: ayrı pencerelerde açılan ekranlar.

import { Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";
import * as I from "../icons";
import { go } from "../ui";

export function ToolsPage() {
  const Tool = (p: { icon: any; title: string; text: string; view: string; badge?: string }) => (
    <button class="tool2" onClick={() => invoke("window_open", { view: p.view })}>
      <span class="tool2-ic">{p.icon}</span>
      <b>
        {p.title}
        <Show when={p.badge}>
          <span class="chip2 small">{p.badge}</span>
        </Show>
      </b>
      <small>{p.text}</small>
      <span class="tool2-open">
        Aç <I.ExternalLink />
      </span>
    </button>
  );
  return (
    <div class="page">
      <div class="tool2-grid">
        <Tool
          icon={<I.LayoutDashboard />}
          title="Pitwall Paneli"
          view="pitwall"
          text="Yarış mühendisi ekranı: sıralama, pist haritası, yakıt stratejisi, lastikler, hava, girdiler, tur süreleri."
        />
        <Tool
          icon={<I.Timer />}
          title="Live Timing"
          view="timing"
          text="Sınıf sıralaması ve yarış kontrol akışı. Tek tıkla tekrar ve kamera."
        />
        <Tool
          icon={<I.Gauge />}
          title="Mühendis Ekranı"
          view="engineer"
          text="Büyük yazılı, ekranlar arasında kendiliğinden geçen mühendis/ikinci monitör görünümü."
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
