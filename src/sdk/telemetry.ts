// Canlı veri akışı.
// Uygulamada: Rust tarafına bir Tauri kanalı açılır.
// Tarayıcıda (OBS/ağ): yerel web sunucusundan Server-Sent Events ile gelir.
// Her konu için ayrı bir sinyal tutulur; bir overlay sadece kendi konusunun sinyalini okur.

import { createSignal, type Accessor } from "solid-js";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { Packet, TopicMap, TopicName } from "./types";
import { apiBase, inTauri } from "./platform";

type Store = { [K in TopicName]: [Accessor<TopicMap[K] | undefined>, (v: TopicMap[K] | undefined) => void] };

const store = {} as Store;
function slot<K extends TopicName>(name: K) {
  if (!store[name]) {
    // equals:false -> her paket bir güncelleme; nesne karşılaştırması maliyeti yok
    const [get, set] = createSignal<TopicMap[K] | undefined>(undefined, { equals: false });
    (store as any)[name] = [get, set];
  }
  return store[name];
}

/** Bir overlay içinden veri okumak için: `const rel = useTopic("relative")` */
export function useTopic<K extends TopicName>(name: K): Accessor<TopicMap[K] | undefined> {
  return slot(name)[0];
}

const settingsListeners = new Set<(v: unknown) => void>();
/** Tarayıcı modunda ayar değişikliklerini dinle */
export function onRemoteSettings(fn: (v: unknown) => void) {
  settingsListeners.add(fn);
}

// Pist şekli sadece sürüm değişince gelir; sonradan açılan overlay'ler de görsün diye saklanır
let lastShape: { version: number; shape: [number, number][] } | null = null;

function handle(p: Packet) {
  if (p.t === "settings") {
    settingsListeners.forEach((fn) => fn(p.d));
    return;
  }
  if (p.t === "map") {
    if (p.d.shape) lastShape = { version: p.d.version, shape: p.d.shape };
    else if (lastShape && lastShape.version === p.d.version && p.d.hasShape) p.d.shape = lastShape.shape;
  }
  (slot(p.t as TopicName)[1] as (v: unknown) => void)(p.d);
}

export type Sub = { name: TopicName; hz: number };

let subId: number | null = null;
let starting: Promise<void> | null = null;
let es: EventSource | null = null;
let lastKey = "";
let lastList: Sub[] = [];
/** Uzak telemetri: başka bilgisayardaki SRTR Pitwall'un web sunucusu (ör. http://192.168.1.20:8910) */
let remoteBase: string | null = null;

/** Ayarlar → Entegrasyonlar → Uzak telemetri. null: yerel iRacing verisi. */
export function setRemoteSource(url: string | null) {
  const next = url ? url.replace(/\/+$/, "") : null;
  if (next === remoteBase) return;
  remoteBase = next;
  // Bağlantıyı yeni kaynağa göre yeniden kur
  es?.close();
  es = null;
  if (subId !== null && inTauri) {
    invoke("stream_stop", { id: subId }).catch(() => {});
    subId = null;
  }
  lastKey = "";
  clearData();
  if (lastList.length) setSubscriptions(lastList);
}

function normalize(topics: Sub[]): Sub[] {
  const m = new Map<TopicName, number>();
  for (const t of topics) m.set(t.name, Math.max(m.get(t.name) ?? 0, t.hz));
  return [...m.entries()].map(([name, hz]) => ({ name, hz }));
}

export async function setSubscriptions(topics: Sub[]) {
  const list = normalize(topics);
  const key = list
    .map((t) => `${t.name}:${t.hz}`)
    .sort()
    .join(",");
  if (key === lastKey && (subId !== null || es)) return;
  lastKey = key;
  lastList = list;

  if (!inTauri || remoteBase) {
    // Tarayıcı ya da uzak kaynak: abonelik değişince bağlantı yeniden kurulur
    es?.close();
    es = new EventSource(`${remoteBase ?? apiBase}/api/stream?topics=${key}`);
    es.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data));
      } catch {
        /* bozuk paket */
      }
    };
    return;
  }

  if (starting) await starting;
  if (subId === null) {
    starting = (async () => {
      const channel = new Channel<Packet>();
      channel.onmessage = handle;
      subId = await invoke<number>("stream_start", { channel, topics: list });
    })();
    await starting;
    starting = null;
  } else {
    await invoke("stream_topics", { id: subId, topics: list });
  }
}

const LIVE_TOPICS: TopicName[] = ["livechat", "livepoll", "captions", "voice"];

/** Bağlantı koptuğunda eski verinin ekranda kalmaması için. */
export function clearData() {
  for (const k of Object.keys(store) as TopicName[]) {
    // Canlı sohbet konuları iRacing'den bağımsız (bağlantı kopunca silinmez)
    if (k !== "status" && !LIVE_TOPICS.includes(k)) (store[k][1] as (v: unknown) => void)(undefined);
  }
}

/** Önizleme için örnek veri koy (kontrol panelindeki tema önizlemesi kullanır). */
export function injectTopic<K extends TopicName>(name: K, data: TopicMap[K]) {
  (slot(name)[1] as (v: unknown) => void)(data);
}

// ---------------------------------------------------------------------------
// Panel: birden fazla bileşen aynı anda veri isteyebilir; istekler birleştirilir.
// ---------------------------------------------------------------------------

import { onCleanup as _onCleanup, createEffect as _createEffect, on as _on } from "solid-js";

const componentSubs = new Map<symbol, Sub[]>();

function flushComponentSubs() {
  setSubscriptions([...componentSubs.values()].flat());
}

/** Bileşen açıkken bu konulara abone ol (bileşen kapanınca bırakılır). */
export function useSubscriptions(list: Sub[] | (() => Sub[])) {
  const key = Symbol();
  componentSubs.set(key, typeof list === "function" ? list() : list);
  queueMicrotask(flushComponentSubs);
  _onCleanup(() => {
    componentSubs.delete(key);
    queueMicrotask(flushComponentSubs);
  });
  return (next: Sub[]) => {
    componentSubs.set(key, next);
    flushComponentSubs();
  };
}

let previewRefs = 0;
/** Bileşen açıkken iRacing yoksa önizleme için demo verisi üretilsin (overlay'ler gizli kalır). */
export function usePreview() {
  if (!inTauri) return;
  if (previewRefs++ === 0) invoke("preview_set", { on: true }).catch(() => {});
  _onCleanup(() => {
    if (--previewRefs === 0) invoke("preview_set", { on: false }).catch(() => {});
  });
}

/**
 * Panel önizlemeleri için sabit görüntü: seçim/ayar değişince kısa bir süre örnek (ya da canlı) veri alınır,
 * sonra akış ve demo üretimi durur; overlay son hâliyle ekranda kalır (işlemci ve bellek harcamaz).
 * `keepLive` true iken (ör. kullanıcı Demo'yu açtıysa) akış sürer.
 */
export function useSnapshot(topics: () => Sub[], trigger: () => unknown, keepLive: () => boolean = () => false, ms = 5000) {
  const setSubs = useSubscriptions([]);
  let holding = false;
  const hold = (on: boolean) => {
    if (!inTauri || on === holding) return;
    holding = on;
    if (on) {
      if (previewRefs++ === 0) invoke("preview_set", { on: true }).catch(() => {});
    } else if (--previewRefs === 0) invoke("preview_set", { on: false }).catch(() => {});
  };
  const [live, setLive] = createSignal(true);
  let timer: number | undefined;
  _createEffect(
    _on(trigger, () => {
      setLive(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setLive(false), ms);
    }),
  );
  _createEffect(() => {
    const on = live() || keepLive();
    setSubs(on ? topics() : []);
    // Önce abonelik kalksın, sonra demo üretimi dursun (son kare ekranda kalır)
    if (on) hold(true);
    else window.setTimeout(() => !(live() || keepLive()) && hold(false), 100);
  });
  _onCleanup(() => {
    clearTimeout(timer);
    hold(false);
  });
  return live;
}
