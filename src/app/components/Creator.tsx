// Hakkında: programı yapan ve sosyal medya bağlantıları.

import { For } from "solid-js";
import { siInstagram, siKick, siSteam, siTwitch, siYoutube } from "simple-icons";
import { openUrl } from "../ui";
import * as I from "../icons";
import appLogo from "@/assets/logo.png";

const LINKS = [
  { name: "YouTube", url: "https://www.youtube.com/@ErkinAzcan", icon: siYoutube, color: "#FF0000" },
  { name: "Kick", url: "https://kick.com/erkinazcan", icon: siKick, color: "#53FC19" },
  { name: "Twitch", url: "https://www.twitch.tv/erkinazcan", icon: siTwitch, color: "#9146FF" },
  { name: "Instagram", url: "https://www.instagram.com/erkinazcan", icon: siInstagram, color: "#FF0069" },
  { name: "Steam", url: "https://steamcommunity.com/id/erkinazcan/", icon: siSteam, color: "#c7d5e0" },
];

export function CreatorPanel() {
  return (
    <section class="panel creator">
      <div class="creator-head">
        <div class="creator-logo" style={{ "background-image": `url(${appLogo})` }} />
        <div>
          <h3>SRTR Pitwall</h3>
          <p class="muted">
            Programı yapan: <b data-no-i18n>Erkin Azcan</b>
          </p>
          <p class="muted small">
            iRacing için overlay, telemetri ve yayın aracı. Sim Race Türkiye topluluğu için geliştirildi; öneri ve hata bildirimlerini
            aşağıdaki kanallardan iletebilirsin.
          </p>
        </div>
      </div>
      <div class="creator-links">
        <For each={LINKS}>
          {(l) => (
            <button class="creator-link" style={{ "--brand": l.color }} title={l.url} onClick={() => openUrl(l.url)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={l.icon.path} />
              </svg>
              <span data-no-i18n>{l.name}</span>
            </button>
          )}
        </For>
        <button class="creator-link web" title="https://pitwall.simracetr.com/" onClick={() => openUrl("https://pitwall.simracetr.com/")}>
          <I.Globe />
          <span data-no-i18n>pitwall.simracetr.com</span>
        </button>
        <button class="creator-link web" title="https://www.simracetr.com/" onClick={() => openUrl("https://www.simracetr.com/")}>
          <I.Globe />
          <span data-no-i18n>simracetr.com</span>
        </button>
      </div>
    </section>
  );
}
