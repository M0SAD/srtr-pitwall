// Üst çubuğun en solundaki bağlantı düğmeleri (app_config.top_links, c61): Web sitesi, Discord, WhatsApp…
// Yönetici Yönetim › Üst çubuk bağlantıları bölümünden ekler / sıralar / kimin göreceğini seçer.
// Hazır simgeler bilerek genel çizimlerdir (küre, konuşma balonu, oynat üçgeni…), marka logosu değildir;
// gerçek logoyu yönetici kendi simgesi olarak yükleyebilir.

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { isAdmin } from "@/cloud/account";
import { okImageUrl, okLinkUrl, visibleTopLinks, type TopIcon, type TopLink } from "@/cloud/topLinks";
import { openUrl } from "../ui";
import "./topLinks.css";

/** Hazır simgeler: [ad, zemin rengi, çizim rengi, 24×24 SVG içeriği (çizgi)] */
export const TOP_ICON_META: Record<Exclude<TopIcon, "custom">, { name: string; bg: string; fg: string; svg: string }> = {
  web: { name: "Web sitesi", bg: "#2f7dd1", fg: "#fff", svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>' },
  discord: { name: "Discord", bg: "#5865f2", fg: "#fff", svg: '<path d="M4 5h16v11H10l-4 3.5V16H4z"/><circle cx="9.5" cy="10.5" r="1" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1" fill="currentColor"/>' },
  whatsapp: { name: "WhatsApp", bg: "#25d366", fg: "#fff", svg: '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/>' },
  youtube: { name: "YouTube", bg: "#e62117", fg: "#fff", svg: '<path d="M9 6.5v11l9-5.5z" fill="currentColor"/>' },
  twitch: { name: "Twitch", bg: "#9146ff", fg: "#fff", svg: '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>' },
  kick: { name: "Kick", bg: "#53fc18", fg: "#0b0e14", svg: '<path d="M13 3 5 13.5h6L10 21l9-11h-6z" fill="currentColor" stroke-linejoin="round"/>' },
  instagram: { name: "Instagram", bg: "#d6297b", fg: "#fff", svg: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.2"/>' },
  x: { name: "X", bg: "#15181d", fg: "#fff", svg: '<path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h16M3.5 15h16"/>' },
  facebook: { name: "Facebook", bg: "#1877f2", fg: "#fff", svg: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8" r="2.3"/><path d="M16.5 13c2.2.1 3.6 1.5 4 4"/>' },
  telegram: { name: "Telegram", bg: "#2aabee", fg: "#fff", svg: '<path d="M20.5 4 3.5 11l6 2.2L11.5 19l3-4 4 3z"/><path d="m9.5 13.2 6-5"/>' },
  tiktok: { name: "TikTok", bg: "#15181d", fg: "#fff", svg: '<path d="M10 17V5l8-1.5V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/>' },
  github: { name: "GitHub", bg: "#24292f", fg: "#fff", svg: '<path d="m8 8-4.5 4L8 16M16 8l4.5 4-4.5 4M13.5 5.5l-3 13"/>' },
  mail: { name: "E-posta", bg: "#c0562b", fg: "#fff", svg: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6.5L20 7"/>' },
  link: { name: "Bağlantı", bg: "#4a5568", fg: "#fff", svg: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' },
};

/** Tek bağlantının simgesi (yuvarlak): kendi simgesi varsa o, yoksa hazır çizim */
export function TopLinkIcon(props: { link: Pick<TopLink, "icon" | "image"> }) {
  const [broken, setBroken] = createSignal("");
  const img = () => (props.link.icon === "custom" && okImageUrl(props.link.image) && broken() !== props.link.image ? props.link.image! : "");
  const meta = () => TOP_ICON_META[props.link.icon === "custom" ? "link" : props.link.icon] ?? TOP_ICON_META.link;
  return (
    <Show
      when={img()}
      fallback={
        <span class="tl-ico" style={{ background: meta().bg, color: meta().fg }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" innerHTML={meta().svg} />
        </span>
      }
    >
      <span class="tl-ico img">
        <img src={img()} alt="" draggable={false} onError={() => setBroken(img())} />
      </span>
    </Show>
  );
}

const open = (l: TopLink) => {
  if (okLinkUrl(l.url)) openUrl(l.url);
};

/** Pencere genişliğine göre çubukta kaç düğme görünür (kalanı "…" menüsüne iner) */
function roomFor(w: number, admin: boolean) {
  const x = admin ? w - 300 : w;
  return x >= 1500 ? 8 : x >= 1350 ? 6 : x >= 1200 ? 4 : x >= 1080 ? 3 : x >= 980 ? 2 : x >= 900 ? 1 : 0;
}

/** Çubuğun kendisi; önizleme için `links` verilebilir (o zaman tıklama bir şey açmaz) */
export function TopLinksBar(props: { links: TopLink[]; max: number; preview?: boolean }) {
  const [menu, setMenu] = createSignal(false);
  const shown = createMemo(() => (props.links.length > props.max ? props.links.slice(0, Math.max(0, props.max - 1)) : props.links));
  const rest = createMemo(() => props.links.slice(shown().length));
  let root: HTMLDivElement | undefined;
  onMount(() => {
    const away = (e: MouseEvent) => menu() && root && !root.contains(e.target as Node) && setMenu(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    onCleanup(() => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    });
  });
  const click = (l: TopLink) => {
    setMenu(false);
    if (!props.preview) open(l);
  };
  return (
    <Show when={props.links.length}>
      <div class="tl" ref={root}>
        <For each={shown()}>
          {(l) => (
            <button class="tl-btn" title={l.label} aria-label={l.label} data-no-i18n onClick={() => click(l)}>
              <TopLinkIcon link={l} />
            </button>
          )}
        </For>
        <Show when={rest().length}>
          <button class="tl-btn tl-more" classList={{ on: menu() }} title="Diğer bağlantılar" aria-label="Diğer bağlantılar" onClick={() => setMenu(!menu())}>
            <span class="tl-ico dots">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="6" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="18" cy="12" r="1.8" />
              </svg>
            </span>
          </button>
          <Show when={menu()}>
            <div class="tl-menu" role="menu">
              <For each={rest()}>
                {(l) => (
                  <button role="menuitem" title={l.url} onClick={() => click(l)}>
                    <TopLinkIcon link={l} />
                    <span data-no-i18n>{l.label}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

/** Üst çubuktaki canlı hali: bu kullanıcının görebildiği bağlantılar */
export function TopLinks() {
  const [w, setW] = createSignal(window.innerWidth);
  onMount(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    onCleanup(() => window.removeEventListener("resize", on));
  });
  return <TopLinksBar links={visibleTopLinks()} max={roomFor(w(), isAdmin())} />;
}
