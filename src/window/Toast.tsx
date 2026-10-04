// Steam benzeri mesaj açılır penceresi (sağ alt köşe, görev çubuğunun üstü). Kartlar Rust
// tarafındaki kuyruktan alınır (src-tauri/src/toast.rs); pencere kart sayısına göre boyutlanır ve
// kart kalmayınca gizlenir. Fare üstünde gezinirken süre durur (kart imlecin altında belirince değil); karta tıklayınca sohbet açılır.
import { For, Show, createSignal, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "@/sdk/platform";
import { localeTag } from "@/sdk/i18n";
import { emojiParts, initialOf, type ToastPayload } from "@/cloud/social";
import "./toast.css";

/** Kartın ekranda kalma süresi (ms) */
const LIFE = 6000;
/** En fazla aynı anda görünen kart */
const MAX = 3;
/** Kart yüksekliği + aradaki boşluk + pencere iç boşluğu (toast.css ile aynı) */
const CARD_H = 84;
const GAP = 2;
const PAD = 8;

/** Kart nesnesi sabit kalır (DOM yeniden oluşmasın, animasyon tekrar etmesin); değişenler sinyal */
interface Card {
  key: string;
  kind: ToastPayload["kind"];
  friendId: string;
  ids: Set<string>;
  data: Accessor<ToastPayload & { count: number }>;
  setData: Setter<ToastPayload & { count: number }>;
  left: Accessor<number>;
  setLeft: Setter<number>;
  out: Accessor<boolean>;
  setOut: Setter<boolean>;
}

const KIND_ICON: Record<ToastPayload["kind"], string> = { message: "💬", request: "➕", trusted: "🛡️", team: "👥", group: "👥" };

const KIND_LABEL: Record<ToastPayload["kind"], string> = {
  message: "Yeni mesaj",
  request: "Arkadaşlık isteği",
  trusted: "Seni güvenilir seçti",
  team: "Takım sohbeti",
  group: "Grup sohbeti",
};

function makeCard(p: ToastPayload): Card {
  const [data, setData] = createSignal({ ...p, count: 1 });
  const [left, setLeft] = createSignal(LIFE);
  const [out, setOut] = createSignal(false);
  return { key: p.id, kind: p.kind, friendId: p.friendId, ids: new Set([p.id]), data, setData, left, setLeft, out, setOut };
}

export function Toast() {
  const [cards, setCards] = createSignal<Card[]>([]);
  const [hover, setHover] = createSignal(false);
  let lastH = -1;

  const layout = () => {
    const n = cards().length;
    const h = n === 0 ? 0 : n * CARD_H + (n - 1) * GAP + PAD * 2;
    if (h === lastH) return;
    // Pencere küçülünce fare artık üstünde olmayabilir (mouseleave gelmeyebilir): süre yeniden işlesin
    if (h < lastH) setHover(false);
    lastH = h;
    if (inTauri) invoke("toast_layout", { height: h }).catch(() => {});
  };

  const add = (list: ToastPayload[]) => {
    if (!list?.length) return;
    let next = cards().slice();
    for (const p of list) {
      if (!p || !p.id || next.some((c) => c.ids.has(p.id))) continue;
      // Özel mesajlar Steam gibi alt alta ayrı kartlarda görünür (en fazla MAX kart; eskiler kalkar).
      // Aynı takım / grup odasından art arda gelenler tek kartta birleşir
      const same =
        p.kind === "team" || p.kind === "group" ? next.find((c) => c.kind === p.kind && c.friendId === p.friendId && !c.out()) : undefined;
      if (same) {
        same.ids.add(p.id);
        same.setData((d) => ({ ...p, count: d.count + 1 }));
        same.setLeft(LIFE);
      } else {
        next.push(makeCard(p));
      }
    }
    // Fazlası: en eskiler hemen kalkar
    const live = next.filter((c) => !c.out());
    if (live.length > MAX) {
      const drop = new Set(live.slice(0, live.length - MAX));
      next = next.filter((c) => !drop.has(c));
    }
    setCards(next);
    layout();
  };

  const dismiss = (c: Card) => {
    if (c.out()) return;
    c.setOut(true);
    setTimeout(() => {
      setCards(cards().filter((x) => x !== c));
      layout();
    }, 220);
  };

  const take = () => {
    if (inTauri) invoke<ToastPayload[]>("toast_take").then(add).catch(() => {});
  };

  onMount(() => {
    take();
    let un: (() => void) | undefined;
    if (inTauri) listen("toast-new", take).then((u) => (un = u));
    // Tarayıcıda deneme için: window.__toast({ ... })
    (window as unknown as { __toast: (p: ToastPayload | ToastPayload[]) => void }).__toast = (p) => add(Array.isArray(p) ? p : [p]);
    const STEP = 200;
    const iv = setInterval(() => {
      if (hover()) return;
      for (const c of cards()) {
        if (c.out()) continue;
        const left = c.left() - STEP;
        c.setLeft(left);
        if (left <= 0) dismiss(c);
      }
    }, STEP);
    onCleanup(() => {
      clearInterval(iv);
      un?.();
    });
  });

  const open = (c: Card) => {
    if (inTauri) invoke("toast_open_chat", { friend: c.kind === "request" ? null : c.friendId }).catch(() => {});
    dismiss(c);
  };

  const time = (ts: number) => new Date(ts).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });

  return (
    <div class="tst" onMouseMove={() => hover() || setHover(true)} onMouseLeave={() => setHover(false)}>
      <For each={cards()}>
        {(c) => (
          <div class={`tst-card k-${c.kind}`} classList={{ out: c.out() }} style={{ "--fc": c.data().color }} onClick={() => open(c)}>
            <div class="tst-av" style={{ background: c.data().photo ? undefined : c.data().color }}>
              <Show when={c.data().photo} fallback={<span data-no-i18n>{initialOf(c.data().name)}</span>}>
                <img src={c.data().photo} alt="" />
              </Show>
              <i class="tst-kind" title={KIND_LABEL[c.kind]}>
                {KIND_ICON[c.kind]}
              </i>
            </div>
            <div class="tst-main">
              <div class="tst-top">
                <b data-no-i18n>{c.data().name}</b>
                <Show when={c.data().count > 1}>
                  <em>×{c.data().count}</em>
                </Show>
                <span class="tst-sp" />
                <small>{time(c.data().ts)}</small>
                <button
                  class="tst-x"
                  title="Kapat"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(c);
                  }}
                >
                  ×
                </button>
              </div>
              <p data-no-i18n={c.kind === "message" || c.kind === "team" || c.kind === "group" ? true : undefined}>
                <For each={emojiParts(c.data().body)}>{(p) => (p.emo ? <span class="emo">{p.t}</span> : p.t)}</For>
              </p>
            </div>
            <div class="tst-bar" style={{ transform: `scaleX(${Math.max(0, c.left() / LIFE)})` }} />
          </div>
        )}
      </For>
    </div>
  );
}
