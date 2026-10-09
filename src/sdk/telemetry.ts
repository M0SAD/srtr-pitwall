// Canlı veri akışı.
// Uygulamada: Rust tarafına bir Tauri kanalı açılır.
// Tarayıcıda (OBS/ağ): yerel web sunucusundan Server-Sent Events ile gelir.
// Her konu için ayrı bir sinyal tutulur; bir overlay sadece kendi konusunun sinyalini okur.

import { createComputed, createContext, createMemo, createSignal, useContext, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { setPreviewFrozen } from "./overlay";
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

/**
 * Dış veri kaynağı (c79, Ekip Pitwall'ı "sürücünün gözünden" görünümleri): bu sağlayıcının altındaki bileşenler
 * `useTopic` ile yerel sim akışı yerine verilen kaynağı okur (ör. arkadaşın uygulamasının gönderdiği anlık görüntü).
 * Kaynağın vermediği konular `undefined` döner; yerel veriyle karışmaz.
 */
export interface TopicSource {
  topic<K extends TopicName>(name: K): Accessor<TopicMap[K] | undefined>;
}
const TopicSourceCtx = createContext<TopicSource>();
export const TopicSourceProvider = TopicSourceCtx.Provider;
/** Bileşen dış kaynaktan mı besleniyor (öyleyse yerel abonelik açılmaz, sim komutu gönderilmez) */
export const useTopicSource = () => useContext(TopicSourceCtx);

/** Bir overlay içinden veri okumak için: `const rel = useTopic("relative")` */
export function useTopic<K extends TopicName>(name: K): Accessor<TopicMap[K] | undefined> {
  const ext = useContext(TopicSourceCtx);
  if (ext) return ext.topic(name);
  return slot(name)[0];
}

/**
 * Satır listesi için sabit kimlik: her veri paketinde satır nesneleri yeniden oluşur; doğrudan <For>'a verilirse
 * her pakette tüm satırların DOM'u (logo ve bayrak <img>'leri dahil) silinip yeniden kurulur ve titrer.
 * Burada satırlar `key` alanına (araç idx) göre bir store'da birleştirilir: aynı araç aynı nesne olarak kalır,
 * sadece değişen alanlar güncellenir, sıra değişince DOM düğümü taşınır.
 */
export function useRows<T extends object>(src: Accessor<T[] | undefined>, key = "idx"): Accessor<T[]> {
  const [st, set] = createStore<{ rows: T[] }>({ rows: [] });
  createComputed(() => {
    const list = (src() ?? []) as T[];
    // Anahtar benzersiz değilse (ör. örnek veride hepsi idx 0) konuma göre birleştir
    const uniq = new Set(list.map((r) => (r as Record<string, unknown>)[key])).size === list.length;
    set("rows", reconcile(list, uniq ? { key } : { key: null, merge: true }));
  });
  return () => st.rows;
}

const settingsListeners = new Set<(v: unknown) => void>();
/** Tarayıcı modunda ayar değişikliklerini dinle */
export function onRemoteSettings(fn: (v: unknown) => void) {
  settingsListeners.add(fn);
}

// Pist şekli sadece sürüm değişince gelir; sonradan açılan overlay'ler de görsün diye saklanır
let lastShape: { version: number; shape: [number, number][] } | null = null;

const dragListeners = new Set<(v: unknown) => void>();
/** Tarayıcı modunda (OBS sayfası) canlı taşıma konumlarını dinle (bkz. sdk/livedrag.ts) */
export function onRemoteDrag(fn: (v: unknown) => void) {
  dragListeners.add(fn);
}

function handle(p: Packet) {
  if (p.t === "settings") {
    settingsListeners.forEach((fn) => fn(p.d));
    return;
  }
  if (p.t === "drag") {
    dragListeners.forEach((fn) => fn(p.d));
    return;
  }
  if (p.t === "map") {
    if (p.d.shape) lastShape = { version: p.d.version, shape: p.d.shape };
    else if (lastShape && lastShape.version === p.d.version && p.d.hasShape) p.d.shape = lastShape.shape;
  }
  (slot(p.t as TopicName)[1] as (v: unknown) => void)(p.d);
}

export type Sub = { name: TopicName; hz: number };

/** Tarayıcı modunda (SSE) sunucuya bağlı mıyız; uygulama içinde hep doğru */
export const [streamOpen, setStreamOpen] = createSignal(true);

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

/**
 * Tarayıcı (OBS) sayfasında veri akışının bağlanacağı adres. Tarayıcılar aynı adrese en fazla 6 bağlantı açar ve OBS'teki
 * bütün tarayıcı kaynakları bu sınırı paylaşır; her kaynağın akışı sürekli açık kaldığından birkaç kaynak eklenince sınır
 * dolar ve sonraki kaynağın dosyaları / durum güncellemeleri gelmez. Sunucu akış için ek portlar açar (/api/ports); her
 * sayfa bunlardan rastgele birini kullanır, ana port dosyalar için boş kalır. Ek port yoksa (eski sürüm) ana port kullanılır.
 */
let streamBaseCache: Promise<string> | null = null;
function streamBase(): Promise<string> {
  streamBaseCache ??= (async () => {
    try {
      const ports = (await fetch(`${apiBase}/api/ports`).then((r) => r.json())) as unknown;
      const list = Array.isArray(ports) ? ports.filter((x): x is number => typeof x === "number" && x > 0 && x < 65536) : [];
      if (!list.length) return apiBase;
      return `${location.protocol}//${location.hostname}:${list[Math.floor(Math.random() * list.length)]}`;
    } catch {
      return apiBase;
    }
  })();
  return streamBaseCache;
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
    const base = remoteBase ?? (await streamBase());
    // Beklerken daha yeni bir abonelik geldiyse bu eskidi
    if (key !== lastKey) return;
    es?.close();
    es = new EventSource(`${base}/api/stream?topics=${key}`);
    const cur = es;
    let opened = false;
    // Bağlantı durumu (uzak gösterge sayfası gösterir); EventSource koparsa kendiliğinden yeniden bağlanır
    cur.onopen = () => {
      opened = true;
      if (es === cur) setStreamOpen(true);
    };
    cur.onerror = () => {
      if (es !== cur) return;
      setStreamOpen(false);
      // Ek akış portuna hiç bağlanılamadıysa (güvenlik yazılımı / port kapalı) ana porta dönülür
      if (!opened && !remoteBase && streamBaseCache) {
        streamBaseCache = Promise.resolve(apiBase);
        lastKey = "";
        void setSubscriptions(lastList);
      }
    };
    es.onmessage = (e) => {
      try {
        if (es === cur) setStreamOpen(true);
        handle(JSON.parse(e.data));
      } catch {
        /* bozuk paket */
      }
    };
    return;
  }

  if (starting) await starting.catch(() => {});
  if (subId === null) {
    starting = (async () => {
      const channel = new Channel<Packet>();
      channel.onmessage = handle;
      subId = await invoke<number>("stream_start", { channel, topics: list });
    })();
    try {
      await starting;
    } finally {
      // stream_start hata verse de sonraki abonelik denemeleri kilitli kalmasın
      starting = null;
    }
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
 * sonra akış ve demo saati durur (Rust: preview_freeze); overlay son hâliyle ekranda kalır.
 * Dondurma yalnızca önizleme verisine uygulanır: Demo modu ve canlı sim verisi motor tarafında hiç donmaz.
 * `keepLive` true iken (ör. kullanıcı Demo'yu açtıysa) akış sürer.
 */
export function useSnapshot(topics: () => Sub[], trigger: () => unknown, keepLive: () => boolean = () => false, ms = 8000) {
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
  /** Önizlemeyi `ms` kadar yeniden oynat, sonra dondur */
  const replay = () => {
    setLive(true);
    clearTimeout(timer);
    timer = window.setTimeout(() => setLive(false), ms);
  };
  // Tetikleyici değerce karşılaştırılır: sadece seçim gerçekten değişince yeniden oynar. (Eskiden her ayar
  // değişikliği yeni bir dizi üretip önizlemeyi baştan başlatıyordu; her seferinde yeni bir demo yarışı kuruluyordu.)
  const trig = createMemo(() => {
    const v = trigger();
    return Array.isArray(v) ? v.map((x) => String(x)).join("\u0001") : v;
  });
  _createEffect(_on(trig, replay));
  // Demo yarışı sayfa açıkken yaşar (hold); dondurma sadece demo saatini durdurur. Böylece yeniden oynatınca
  // yarış baştan kurulmaz, kaldığı yerden sürer; ekranda tutulan (pin) overlay de aynı anda donar.
  const freeze = (on: boolean) => {
    setPreviewFrozen(on);
    if (inTauri) invoke("preview_freeze", { on }).catch(() => {});
  };
  hold(true);
  _createEffect(() => {
    const on = live() || keepLive();
    if (on) freeze(false);
    setSubs(on ? topics() : []);
    // Önce abonelik kalksın (son kare ekranda kalır), sonra demo saati dursun
    if (!on) window.setTimeout(() => !(live() || keepLive()) && freeze(true), 100);
  });
  _onCleanup(() => {
    clearTimeout(timer);
    freeze(false);
    hold(false);
  });
  return Object.assign(live, { replay });
}

/**
 * Kullanıcının açtığı Demo modu (panel önizleme verisi değil). Demoda her overlay görünür olmalı:
 * "pitte gizle", "yalnızca yarışta", "belirli aralıklarla" gibi gizleme koşulları bu doğruyken uygulanmaz.
 */
export function demoShow(): boolean {
  const s = useTopic("status")();
  return !!s?.demo && !s?.preview;
}
