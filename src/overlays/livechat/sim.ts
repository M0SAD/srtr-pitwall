// Canlı sohbet benzetimi: sohbet çalışmıyorken demo modunda ya da önizleme / düzenleme / sabitleme sırasında
// overlay'in boş kalmaması için akan sahte bir sohbet üretir.
//
// Tamamen bu bileşenin içinde yaşar: Rust'a hiçbir şey gönderilmez; kayda yazılmaz, sesli okunmaz, moderasyona girmez.
// Mesajlar listeye EKLENİR (nesneler kimliğini korur); liste baştan kurulmaz, bu yüzden satırlar yanıp sönmez.

import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { lang, t } from "@/sdk/i18n";
import type { ChatMsg, MsgKind, Platform, Viewers, AlertInfo } from "@/sdk/livechat";

type SimPlatform = "youtube" | "twitch" | "kick";

/** Mesaj havuzu: çağrıldığı anda arayüz diline çevrilir (modül yüklenirken değil) */
function lines(): string[] {
  return [
    t("Güzel start! 🏁"),
    t("İlk virajda dikkatli ol"),
    t("Bu tur çok temizdi"),
    t("Lastikler ne durumda?"),
    t("Yakıt yetecek mi?"),
    t("Arkadaki çok yaklaştı"),
    t("Harika geçiş! 🔥"),
    t("Pit stratejisi ne?"),
    t("Yağmur gelir mi sence?"),
    t("En hızlı tur geliyor"),
    t("Sektör 2 mor! 💜"),
    t("Fren noktasını kaçırdın 😅"),
    t("Bu pist çok zor"),
    t("Hangi direksiyonu kullanıyorsun?"),
    t("Setup paylaşır mısın?"),
    t("Selamlar herkese 👋"),
    t("İyi yayınlar!"),
    t("Kolay gelsin"),
    t("Podyum gelir bu yarış 🏆"),
    t("Öndekinin lastikleri bitmiş"),
    t("Sabırlı ol, acele etme"),
    t("Mavi bayrak var"),
    t("Güvenlik aracı çıkar mı?"),
    t("Bu overlay çok iyi görünüyor"),
    t("Kaç tur kaldı?"),
    t("Aradaki fark kapanıyor"),
    t("Temiz yarış, helal olsun 👏"),
    t("Pit çıkışında trafik var"),
    t("Slipstream'i iyi kullan"),
    t("Bu tempoyla yakalarsın"),
    t("Kerbi fazla aldın"),
    t("Ceza gelmez umarım 🙏"),
    t("Sıralama turu çok iyiydi"),
    t("Hava sıcaklığı lastiği zorluyor"),
    t("Yumuşak lastik mi taktın?"),
    t("Son tur, hadi! 🚀"),
    t("Bu araç virajlarda çok dengeli"),
    t("Fren dengesini biraz öne al"),
    t("İyi savunma!"),
    t("Yarış mühendisi ne diyor?"),
    t("Bugün form çok iyi"),
    t("Trafikte zaman kaybettin"),
  ];
}

/** PRO üye adı yokken (çevrimdışı) kullanılan takma adlar */
const NICKS = [
  "SRTRFan", "gt3sever", "ApexAvcisi", "PitKaptani", "TurRekoru", "SlipStream34", "KerbKing", "YagmurUstasi", "SimRacerTR", "FrenNoktasi",
  "polepozisyon", "DRS_Acik", "lastikci06", "MonzaRuhu", "NordschleifeFan", "eaurouge", "hizlitur", "ParcFerme", "boxboxbox", "undercut35",
  "TrailBraker", "sektor_mor", "GridWalker", "SonTurcu",
];

const COLORS = ["#ff8a2a", "#4fc3f7", "#b28cff", "#53fc18", "#ff6b6b", "#ffd54f", "#f48fb1", "#80cbc4"];
const PLATFORMS: SimPlatform[] = ["youtube", "twitch", "twitch", "kick", "youtube"];
const AMOUNTS = ["₺50,00", "₺100,00", "€5,00", "$10.00", "₺250,00"];

// ---------------------------------------------------------------------------
// Demo vitrini adları (demo_pro_names): pencereler arası paylaşılan kısa ömürlü önbellek
// ---------------------------------------------------------------------------

const NAMES_KEY = "pitwall.simChatNames";
const NAMES_TTL = 30 * 60_000;
const [proNames, setProNames] = createSignal<string[]>([]);
let namesAsked = false;

function loadNames() {
  if (namesAsked) return;
  namesAsked = true;
  let fresh = false;
  try {
    const c = JSON.parse(localStorage.getItem(NAMES_KEY) ?? "null") as { ts: number; names: string[] } | null;
    if (c && Array.isArray(c.names)) {
      setProNames(c.names.filter((x) => typeof x === "string" && x));
      fresh = Date.now() - c.ts < NAMES_TTL;
    }
  } catch {
    /* önbellek yok */
  }
  if (fresh) return;
  void (async () => {
    try {
      const { api, cloudEnabled } = await import("@/cloud/supabase");
      if (!cloudEnabled) return;
      const rows = await api<unknown[]>("POST", "rpc/demo_pro_names", { body: { p_limit: 40 }, auth: "optional" });
      const names = (rows ?? [])
        .map((r) => (typeof r === "string" ? r : r && typeof r === "object" ? String(Object.values(r)[0] ?? "") : ""))
        .map((s) => s.trim())
        .filter(Boolean);
      if (!names.length) return;
      setProNames(names);
      try {
        localStorage.setItem(NAMES_KEY, JSON.stringify({ ts: Date.now(), names }));
      } catch {
        /* depolama kapalı */
      }
    } catch {
      /* çevrimdışı ya da RPC yok: takma adlar yeterli */
    }
  })();
}

// ---------------------------------------------------------------------------

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)];
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

let seq = 0;

function makeMsg(ts: number, lastLine: { i: number }): ChatMsg {
  const pro = proNames();
  const name = pro.length && Math.random() < 0.65 ? pick(pro) : pick(NICKS);
  const h = hash(name);
  // Aynı ad hep aynı platform, renk ve rozetle görünür
  const platform: SimPlatform = PLATFORMS[h % PLATFORMS.length];
  const roll = Math.random();
  let kind: MsgKind = "chat";
  let alert: AlertInfo | undefined;
  let amount: string | undefined;
  let text = "";
  if (roll < 0.035) {
    kind = "sub";
    alert = platform === "youtube" ? { type: "member", gifted: false } : { type: "resub", gifted: false, months: 2 + rnd(22) };
  } else if (roll < 0.06) {
    kind = "superchat";
    alert = { type: "superchat", gifted: false };
    amount = pick(AMOUNTS);
  } else if (roll < 0.075) {
    kind = "raid";
    alert = { type: "raid", gifted: false, count: 12 + rnd(140) };
  } else if (roll < 0.09) {
    kind = "sub";
    alert = { type: "submysterygift", gifted: true, count: pick([1, 5, 5, 10]) };
  }
  if (kind === "chat" || kind === "superchat") {
    const pool = lines();
    let i = rnd(pool.length);
    if (i === lastLine.i) i = (i + 1) % pool.length;
    lastLine.i = i;
    text = pool[i];
  }
  const id = `sim:${++seq}`;
  return {
    id,
    nativeId: id,
    platform: platform as Platform,
    channel: platform,
    channelName: "",
    showTag: false,
    kind,
    author: {
      name,
      login: name.toLowerCase(),
      color: platform === "youtube" ? undefined : COLORS[h % COLORS.length],
      mod: h % 11 === 0,
      sub: h % 4 === 0,
      owner: false,
      member: platform === "youtube" && h % 5 === 0,
      vip: h % 13 === 0,
    },
    parts: text ? [{ t: "text", v: text }] : [],
    text,
    ts,
    amount,
    alert,
    deleted: false,
  };
}

function makeViewers(): Record<SimPlatform, number> {
  return { youtube: 180 + rnd(240), twitch: 90 + rnd(170), kick: 20 + rnd(70) };
}

/**
 * Benzetilmiş sohbet. `active` doğruyken 1,5–4 sn'de bir mesaj ekler; yanlış olunca durur ve listeyi boşaltır.
 * Pencere görünmüyorken (document.hidden) mesaj üretmez.
 */
export function createChatSim(active: Accessor<boolean>, cap = 40): { msgs: Accessor<ChatMsg[]>; viewers: Accessor<Viewers> } {
  const [msgs, setMsgs] = createSignal<ChatMsg[]>([]);
  const [counts, setCounts] = createSignal(makeViewers());
  const lastLine = { i: -1 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drift: ReturnType<typeof setInterval> | undefined;

  const seed = () => {
    const now = Date.now();
    setMsgs([4, 3, 2, 1, 0].map((k) => makeMsg(now - k * 2200, lastLine)));
  };
  const next = () => {
    timer = setTimeout(
      () => {
        if (typeof document === "undefined" || !document.hidden) setMsgs((l) => [...l, makeMsg(Date.now(), lastLine)].slice(-cap));
        next();
      },
      1500 + rnd(2500),
    );
  };
  const stop = () => {
    clearTimeout(timer);
    clearInterval(drift);
    timer = drift = undefined;
  };

  createEffect(
    on(active, (on_) => {
      stop();
      if (!on_) {
        setMsgs([]);
        return;
      }
      loadNames();
      seed();
      next();
      // İzleyici sayıları yavaşça oynar
      drift = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        setCounts((c) => {
          const step = (v: number, min: number) => Math.max(min, Math.round(v + (Math.random() - 0.48) * Math.max(2, v * 0.03)));
          return { youtube: step(c.youtube, 40), twitch: step(c.twitch, 20), kick: step(c.kick, 5) };
        });
      }, 5000);
    }),
  );
  // Dil değişince eski dildeki satırlar kalmasın
  createEffect(
    on(
      lang,
      () => {
        if (active()) seed();
      },
      { defer: true },
    ),
  );
  onCleanup(stop);

  const viewers = (): Viewers => {
    const c = counts();
    return { ...c, total: c.youtube + c.twitch + c.kick };
  };
  return { msgs, viewers };
}
