// Olaylar ekranı: oturumun kazaları, geçişleri, pitleri, en hızlı turları, bayrakları ve cezaları.
// Yarış bitince (damalı bayrak) kendiliğinden açılır; bir olaya tıklayınca iRacing tekrarı
// olayın ~5 sn öncesine sarılır, kamera o araca döner ve 1x oynatılır.
//
// Veri akışı: pencere açılınca listenin TAMAMINI `events_get` ile çeker (olaylar Rust'ta birikir,
// pencere sonradan açılsa da hiçbiri kaçmaz), sonra `events-changed` olayını dinler ve ayrıca
// 2 sn'de bir yeniden çeker (bağlantı durumu ve özet için). Güncel oturum boşsa Rust bir önceki
// oturumu verir (`previous`); "Bu oturum / Önceki oturum" düğmesiyle elle de seçilebilir.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { inTauri } from "@/sdk/platform";
import { settings, updateSettings } from "@/sdk/settings";
import { clock, lapTime } from "@/sdk/format";
import { localeTag, t, translateText } from "@/sdk/i18n";
import Ban from "lucide-solid/icons/ban";
import Gavel from "lucide-solid/icons/gavel";
import Wrench from "lucide-solid/icons/wrench";
import SettingsIcon from "lucide-solid/icons/settings";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import CircleAlert from "lucide-solid/icons/circle-alert";
import TrendingUp from "lucide-solid/icons/trending-up";
import TrendingDown from "lucide-solid/icons/trending-down";
import Crown from "lucide-solid/icons/crown";
import LogIn from "lucide-solid/icons/log-in";
import LogOut from "lucide-solid/icons/log-out";
import Timer from "lucide-solid/icons/timer";
import Star from "lucide-solid/icons/star";
import Flag from "lucide-solid/icons/flag";
import Play from "lucide-solid/icons/play";
import ChevronsUp from "lucide-solid/icons/chevrons-up";
import ChevronsDown from "lucide-solid/icons/chevrons-down";
import RadioTower from "lucide-solid/icons/radio-tower";
import "./events.css";

type Kind =
  | "incident"
  | "offTrack"
  | "invalid"
  | "pass"
  | "passed"
  | "lead"
  | "gained"
  | "lost"
  | "pitIn"
  | "pitOut"
  | "repair"
  | "fastest"
  | "best"
  | "flag"
  | "penalty"
  | "start"
  | "finish";

export interface RaceEvent {
  id: number;
  sessionNum: number;
  time: number;
  lap: number;
  kind: Kind;
  sub: string;
  idx: number;
  number: string;
  name: string;
  classColor: string;
  text: string;
  isMe: boolean;
  focus: string;
}

export interface EventsInfo {
  sim: string;
  demo: boolean;
  connected: boolean;
  track: string;
  sessionKind: string;
  sessionNum: number;
  replayOk: boolean;
  previous?: boolean;
  hasPrevious?: boolean;
  hasCurrent?: boolean;
  rev?: number;
  summary?: Summary;
  events: RaceEvent[];
}

/** Oturum özeti (Rust events.rs Summary) */
interface Summary {
  car: string;
  startedAt: number;
  duration: number;
  laps: number;
  bestLap: number;
  position: number;
  startPosition: number;
  incidents: number;
  incidentLimit: number;
  hasIncidents: boolean;
}

type View = "auto" | "current" | "previous";

type Cat = "crash" | "pass" | "pit" | "fast" | "flag";
type RecKey = Cat | "others";

/** Süzgeç grubu; start/bitiş hiçbir gruba girmez (her zaman görünür). Rust `events::category` ile aynı. */
const CAT: Record<Kind, Cat | null> = {
  incident: "crash",
  offTrack: "crash",
  invalid: "crash",
  pass: "pass",
  passed: "pass",
  lead: "pass",
  gained: "pass",
  lost: "pass",
  pitIn: "pit",
  pitOut: "pit",
  repair: "pit",
  fastest: "fast",
  best: "fast",
  flag: "flag",
  penalty: "flag",
  start: null,
  finish: null,
};

const CATS: { id: Cat; label: string }[] = [
  { id: "crash", label: "Olaylar/Kazalar" },
  { id: "pass", label: "Geçişler" },
  { id: "pit", label: "Pit" },
  { id: "fast", label: "En hızlı tur" },
  { id: "flag", label: "Bayraklar/Cezalar" },
];

const REC: { id: RecKey; label: string }[] = [
  { id: "crash", label: "Olay puanı, pist dışı, geçersiz tur" },
  { id: "pass", label: "Geçişler ve sıra değişimleri" },
  { id: "pit", label: "Pit giriş/çıkış, tamir" },
  { id: "fast", label: "En hızlı ve kişisel en iyi turlar" },
  { id: "flag", label: "Bayraklar ve cezalar" },
  { id: "others", label: "Diğer sürücülerin olayları" },
];

const ICON: Record<Kind, () => JSX.Element> = {
  incident: () => <TriangleAlert />,
  offTrack: () => <CircleAlert />,
  invalid: () => <Ban />,
  pass: () => <TrendingUp />,
  passed: () => <TrendingDown />,
  lead: () => <Crown />,
  gained: () => <ChevronsUp />,
  lost: () => <ChevronsDown />,
  pitIn: () => <LogIn />,
  pitOut: () => <LogOut />,
  repair: () => <Wrench />,
  fastest: () => <Timer />,
  best: () => <Star />,
  flag: () => <Flag />,
  penalty: () => <Gavel />,
  start: () => <Play />,
  finish: () => <Flag />,
};

/** Tür adı (dışa aktarma ve ipucu) */
const KIND_LABEL: Record<Kind, string> = {
  incident: "Olay puanı",
  offTrack: "Pist dışı",
  invalid: "Geçersiz tur",
  pass: "Geçiş",
  passed: "Geçildin",
  lead: "Liderlik",
  gained: "Sıra kazandı",
  lost: "Sıra kaybetti",
  pitIn: "Pit girişi",
  pitOut: "Pit çıkışı",
  repair: "Tamir",
  fastest: "En hızlı tur",
  best: "Kişisel en iyi",
  flag: "Bayrak",
  penalty: "Ceza",
  start: "Start",
  finish: "Bitiş",
};

/** Olay rengi (sınıf adı): kaza kırmızı, geçiş yeşil/turuncu, bayrak türüne göre */
function tone(e: RaceEvent): string {
  switch (e.kind) {
    case "incident":
      return e.sub === "1x" ? "warn" : "bad";
    case "penalty":
      return "bad";
    case "offTrack":
    case "invalid":
    case "passed":
    case "lost":
      return "warn";
    case "pass":
    case "gained":
    case "start":
      return "good";
    case "lead":
    case "fastest":
      return "purple";
    case "best":
      return "good";
    case "pitIn":
    case "pitOut":
    case "repair":
      return "info";
    case "finish":
      return "mono";
    case "flag":
      return (
        { yellow: "yellow", blue: "blue", black: "bad", dq: "bad", red: "bad", repair: "warn", green: "good", white: "mono" } as Record<
          string,
          string
        >
      )[e.sub] ?? "info";
    default:
      return "info";
  }
}

/** Tarayıcıda (Tauri dışında) önizleme için örnek olaylar */
function sampleEvents(): EventsInfo {
  const ev: RaceEvent[] = [];
  let id = 1;
  const add = (time: number, lap: number, kind: Kind, number: string, name: string, text: string, isMe = false, sub = "") =>
    ev.push({ id: id++, sessionNum: 2, time, lap, kind, sub, idx: 0, number, name, classColor: "#ffda59", text, isMe, focus: number });
  add(0.5, 1, "start", "7", "Erkin Azcan", "yarış başladı · P6", true);
  add(8.2, 1, "pass", "7", "Erkin Azcan", "#44 Lukas Brenner geçildi · P5", true, "P5");
  add(21.9, 1, "incident", "7", "Erkin Azcan", "Pist dışı", true, "1x");
  add(33.4, 1, "offTrack", "12", "Marco Rossi", "pist dışına çıktı");
  add(47.0, 1, "flag", "7", "Erkin Azcan", "sarı bayrak", true, "yellow");
  add(96.3, 2, "lead", "3", "Tom Keller", "liderliği aldı");
  add(101.8, 2, "fastest", "3", "Tom Keller", "en hızlı tur 1:32.418");
  add(104.1, 2, "best", "7", "Erkin Azcan", "kişisel en iyi tur 1:33.052", true);
  add(131.5, 2, "passed", "7", "Erkin Azcan", "#21 Jonas Weber seni geçti · P6", true, "P6");
  add(150.2, 2, "incident", "7", "Erkin Azcan", "Temas", true, "4x");
  add(163.9, 2, "lost", "18", "Pierre Lacroix", "3 sıra kaybetti");
  add(188.0, 3, "pitIn", "7", "Erkin Azcan", "pite girdi", true);
  add(201.3, 3, "repair", "7", "Erkin Azcan", "hızlı tamir kullanıldı", true);
  add(214.6, 3, "pitOut", "7", "Erkin Azcan", "pitten çıktı", true);
  add(230.1, 3, "flag", "7", "Erkin Azcan", "mavi bayrak", true, "blue");
  add(262.7, 3, "pass", "7", "Erkin Azcan", "#12 Marco Rossi geçildi · P5", true, "P5");
  add(290.4, 4, "flag", "12", "Marco Rossi", "hasar bayrağı aldı", false, "repair");
  add(305.2, 4, "gained", "44", "Lukas Brenner", "3 sıra kazandı");
  add(372.9, 4, "flag", "7", "Erkin Azcan", "son tur (beyaz bayrak)", true, "white");
  add(468.3, 5, "finish", "7", "Erkin Azcan", "damalı bayrak · P5", true, "checkered");
  return {
    sim: "",
    demo: true,
    connected: false,
    track: "Circuit de Spa-Francorchamps – Grand Prix Pits",
    sessionKind: "Race",
    sessionNum: 2,
    replayOk: false,
    hasCurrent: true,
    rev: 1,
    summary: {
      car: "BMW M4 GT3",
      startedAt: Date.now() - 480_000,
      duration: 470,
      laps: 5,
      bestLap: 93.052,
      position: 5,
      startPosition: 6,
      incidents: 5,
      incidentLimit: 17,
      hasIncidents: true,
    },
    events: ev,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * `source`: dış veri kaynağı (Ekip Pitwall'ı: sürücünün uygulamasının gönderdiği olay listesi). Verilirse `events_get`
 * çağrılmaz. `readOnly`: tekrara atlama / canlıya dönme yoktur (satırlar tıklanamaz), kayıt ayarları ve oturum seçimi
 * gizlenir; süzgeçler, kopyalama ve CSV çalışır. `note`: listenin üstünde gösterilecek açıklama.
 */
export function Events(props: { source?: Accessor<EventsInfo | null>; readOnly?: boolean; note?: string } = {}) {
  const ro = () => !!props.readOnly || !!props.source;
  // Başlık/özet her yenilemede güncellenir; olay listesi yalnızca gerçekten değişince (satırlar baştan çizilmesin)
  const [info, setInfo] = createSignal<EventsInfo | null>(null);
  const [events, setEvents] = createSignal<RaceEvent[]>([]);
  const [failed, setFailed] = createSignal("");
  const [view, setView] = createSignal<View>("auto");
  const [cats, setCats] = createSignal<Set<Cat>>(new Set(CATS.map((c) => c.id)));
  const [onlyMe, setOnlyMe] = createSignal(false);
  /** Sürücü süzgeci: araç idx'i; null = tüm sürücüler (varsayılan) */
  const [driver, setDriver] = createSignal<number | null>(null);
  const [sel, setSel] = createSignal<number | null>(null);
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
  const [showCfg, setShowCfg] = createSignal(false);
  let listEl: HTMLDivElement | undefined;
  let listKey = "";
  let msgTimer: number | undefined;

  const say = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    clearTimeout(msgTimer);
    msgTimer = window.setTimeout(() => setMsg(null), 6000);
  };

  const apply = (i: EventsInfo) => {
    setInfo(i);
    setFailed("");
    const key = `${i.rev ?? ""}|${i.demo}|${!!i.previous}|${i.sessionNum}|${i.events.length}|${i.events[i.events.length - 1]?.id ?? 0}`;
    if (key !== listKey) {
      listKey = key;
      setEvents(i.events);
    }
  };

  let seq = 0;
  const load = async () => {
    if (props.source) return;
    if (!inTauri) {
      apply(sampleEvents());
      return;
    }
    const n = ++seq;
    try {
      const i = await invoke<EventsInfo>("events_get", { view: view() });
      if (n === seq) apply(i);
    } catch (err) {
      // İlk yükleme başarısızsa boş sayfa yerine nedeni göster
      if (!info()) setFailed(String(err));
    }
  };
  createEffect(() => {
    const i = props.source?.();
    if (i) apply(i);
  });
  onMount(() => {
    if (props.source) return;
    load();
    const h = setInterval(load, 2000);
    onCleanup(() => clearInterval(h));
    if (inTauri) {
      let un: (() => void) | undefined;
      let gone = false;
      listen("events-changed", () => load())
        .then((u) => (gone ? u() : (un = u)))
        .catch(() => {});
      onCleanup(() => {
        gone = true;
        un?.();
      });
    }
  });

  const pick = (v: View) => {
    setView(v);
    setSel(null);
    load();
  };

  const toggleCat = (c: Cat) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const allOn = () => cats().size === CATS.length;

  /** Olayı olan sürücüler (ada göre sıralı, olay sayısıyla): sürücü süzgecinin seçenekleri */
  const drivers = createMemo(() => {
    const m = new Map<number, { idx: number; number: string; name: string; n: number; me: boolean }>();
    for (const e of events()) {
      if (e.idx < 0 || !e.name) continue;
      const d = m.get(e.idx);
      if (d) d.n++;
      else m.set(e.idx, { idx: e.idx, number: e.number, name: e.name, n: 1, me: e.isMe });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  // Seçili sürücü listede kalmadıysa (başka oturuma geçildi) süzgeç "tümü"ne döner
  createEffect(() => {
    const d = driver();
    if (d != null && !drivers().some((x) => x.idx === d)) setDriver(null);
  });

  const filtered = createMemo(() => {
    const cs = cats();
    return events().filter((e) => {
      const c = CAT[e.kind];
      return (c == null || cs.has(c)) && (!onlyMe() || e.isMe) && (driver() == null || e.idx === driver());
    });
  });

  const groups = createMemo(() => {
    const out: { lap: number; items: RaceEvent[] }[] = [];
    for (const e of filtered()) {
      const g = out[out.length - 1];
      if (g && g.lap === e.lap) g.items.push(e);
      else out.push({ lap: e.lap, items: [e] });
    }
    return out;
  });

  const counts = createMemo(() => {
    const m: Record<Cat, number> = { crash: 0, pass: 0, pit: 0, fast: 0, flag: 0 };
    for (const e of events()) {
      const c = CAT[e.kind];
      if (c) m[c]++;
    }
    return m;
  });

  const summary = createMemo(() => {
    const mine = events().filter((e) => e.isMe);
    const inc = mine.filter((e) => e.kind === "incident");
    const pts = inc.reduce((a, e) => a + (parseInt(e.sub) || 0), 0);
    return {
      inc: inc.length,
      pts,
      invalid: mine.filter((e) => e.kind === "invalid").length,
      penalties: mine.filter((e) => e.kind === "penalty").length,
      gained: mine.filter((e) => e.kind === "pass").length,
      lost: mine.filter((e) => e.kind === "passed").length,
      pits: mine.filter((e) => e.kind === "pitIn").length,
    };
  });

  const sum = () => info()?.summary;
  const isRace = () => (info()?.sessionKind ?? "").includes("Race");
  /** Sim olay puanı veriyor mu (iRacing/demo); vermiyorsa puan yerine geçersiz tur ve ceza sayılır */
  const hasInc = () => sum()?.hasIncidents ?? true;
  /** Toplam olay puanı: simin bildirdiği toplam (kayıt başlamadan önce alınanlar dahil) */
  const totalPts = () => Math.max(sum()?.incidents ?? 0, summary().pts);
  const untracked = () => (hasInc() ? Math.max(0, (sum()?.incidents ?? 0) - summary().pts) : 0);
  const gainedPos = () => {
    const s = sum();
    return s && isRace() && s.startPosition > 0 && s.position > 0 ? s.startPosition - s.position : null;
  };
  const dateText = () => {
    const ms = sum()?.startedAt ?? 0;
    return ms > 0 ? new Date(ms).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "";
  };
  const hasSession = () => !!info() && (info()!.sessionNum >= 0 || !!info()!.track);

  const note = createMemo(() => {
    const i = info();
    if (ro()) return props.note ?? "";
    if (!inTauri) return t("Tarayıcı önizlemesi: örnek olaylar gösteriliyor.");
    if (!i) return "";
    if (i.demo) return t("Demo verisi: tekrara atlama yalnızca iRacing'de çalışır.");
    if (i.sim && i.sim !== "iracing")
      return t("Bu oyun olay puanı ve tekrar komutu vermiyor: geçersiz turlar, cezalar, bayraklar, pit ve sıra değişimleri kaydedilir.");
    if (!i.connected) return t("iRacing bağlı değil: tekrara atlamak için oturumda (yarış sonrası dahil) iRacing açık olmalı.");
    return "";
  });

  const seek = async (e: RaceEvent) => {
    if (ro()) return;
    setSel(e.id);
    if (!inTauri) {
      say(true, t("Tekrar {0} anına sarılıyor", clock(Math.max(0, e.time - 5))));
      return;
    }
    // Tekrar yalnızca iRacing bağlıyken var; değilse satır sadece seçilir
    if (!info()?.replayOk) return;
    try {
      const num = e.focus || e.number;
      const at = clock(Math.max(0, e.time - 5));
      say(true, t("Tekrar {0} anına sarılıyor", at));
      // Kamera doğrulaması için araç sırası: odak başka bir araçsa (ör. geçilen araç) sıra bilinmez
      const r = await invoke<{ verified: boolean; camera: boolean }>("replay_seek", {
        sessionNum: e.sessionNum,
        sessionTime: e.time,
        carNumber: num,
        carIdx: num === e.number && e.idx >= 0 ? e.idx : null,
      });
      if (!r.verified) say(true, t("Tekrar komutu gönderildi ({0}); iRacing tekrar konumunu bildirmediği için doğrulanamadı", at));
      else if (!r.camera) say(false, t("Tekrar {0} anına sarıldı ama kamera #{1} aracına geçmedi", at, num));
      else say(true, t("Tekrar {0} anına sarıldı", at));
    } catch (err) {
      say(false, t(String(err)));
    }
  };

  const live = async () => {
    setSel(null);
    if (!inTauri || ro()) return;
    try {
      await invoke("replay_live");
      say(true, t("Canlı yayına dönüldü"));
    } catch (err) {
      say(false, t(String(err)));
    }
  };

  // Klavye: ↑/↓ ile olaylar arasında gez, Enter ile tekrara git
  const onKey = (ev: KeyboardEvent) => {
    if (ro() || (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Enter")) return;
    if ((ev.target as HTMLElement | null)?.closest("input, button.evw-tool, .evw-cfg")) return;
    const l = filtered();
    if (!l.length) return;
    ev.preventDefault();
    let i = l.findIndex((x) => x.id === sel());
    if (ev.key === "Enter") {
      if (i >= 0) seek(l[i]);
      return;
    }
    i = ev.key === "ArrowDown" ? Math.min(l.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    setSel(l[i].id);
    listEl?.querySelector(`[data-ev="${l[i].id}"]`)?.scrollIntoView({ block: "nearest" });
  };
  onMount(() => {
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const kindLabel = (k: string) =>
    ({
      Race: t("Yarış"),
      Practice: t("Antrenman"),
      "Open Qualify": t("Sıralama"),
      "Lone Qualify": t("Sıralama"),
      Qualify: t("Sıralama"),
      Warmup: t("Isınma"),
    })[k] ?? k;

  // ---- Dışa aktarma (süzgeçten geçen olaylar) ----
  const headerLines = () => {
    const i = info();
    const s = sum();
    const out: string[] = [`SRTR Pitwall – ${t("Olaylar")}`];
    if (!i) return out;
    const line1 = [i.track, s?.car, kindLabel(i.sessionKind), dateText()].filter(Boolean).join(" · ");
    if (line1) out.push(line1);
    const parts: string[] = [];
    if (s) {
      parts.push(`${t("Tur")}: ${s.laps}`);
      if (s.bestLap > 0) parts.push(`${t("En iyi tur")}: ${lapTime(s.bestLap)}`);
      if (s.position > 0) parts.push(`${t("Sıra")}: P${s.position}${gainedPos() != null && gainedPos() !== 0 ? ` (${gainedPos()! > 0 ? "+" : ""}${gainedPos()})` : ""}`);
      if (hasInc()) parts.push(`${t("Olay puanı")}: ${totalPts()}x${s.incidentLimit > 0 ? ` / ${s.incidentLimit}x` : ""}`);
    }
    if (parts.length) out.push(parts.join(" · "));
    return out;
  };
  const asText = () => {
    const rows = filtered().map((e) => {
      const who = [e.number ? `#${e.number}` : "", e.name].filter(Boolean).join(" ");
      const badge = e.kind === "incident" ? `[${e.sub}] ` : "";
      return `${e.lap > 0 ? t("Tur {0}", e.lap) : t("Start öncesi")}\t${clock(e.time)}\t${who}\t${badge}${translateText(e.text)}`;
    });
    return [...headerLines(), "", ...(rows.length ? rows : [t("Bu oturumda olay kaydedilmedi")])].join("\n");
  };
  const asCsv = () => {
    const head = [t("Tur"), t("Oturum zamanı"), t("Saniye"), t("Tür"), t("Puan"), t("No"), t("Sürücü"), t("Açıklama"), t("Ben")];
    const rows = filtered().map((e) =>
      [e.lap, clock(e.time), e.time.toFixed(1), t(KIND_LABEL[e.kind] ?? e.kind), e.kind === "incident" ? e.sub : "", e.number, e.name, translateText(e.text), e.isMe ? "1" : ""]
        .map(csvCell)
        .join(";"),
    );
    // BOM: Excel Türkçe karakterleri doğru açsın
    return "﻿" + [...headerLines().map((l) => csvCell(l)), "", head.map(csvCell).join(";"), ...rows].join("\r\n");
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      say(true, t("Kopyalandı"));
    } catch (err) {
      say(false, String(err));
    }
  };
  const saveCsv = async () => {
    const d = new Date(sum()?.startedAt || Date.now());
    const pad = (n: number) => String(n).padStart(2, "0");
    const fname = `pitwall-olaylar-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
    const text = asCsv();
    try {
      if (!inTauri) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
        a.download = fname;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      const path = await saveDialog({ defaultPath: fname, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (!path) return;
      await invoke("events_export", { path, text });
      say(true, t("Kaydedildi"));
    } catch (err) {
      say(false, t(String(err)));
    }
  };

  const g = () => settings().general;
  const rec = (k: RecKey) => g().eventsRecord?.[k] ?? true;

  return (
    <div class="evw" classList={{ ro: ro() }}>
      <header class="evw-top">
        <div class="evw-title">
          <b>Olaylar</b>
          <small class="muted">
            <Show when={info()?.track} fallback={failed() ? t("Olaylar okunamadı") : t("Oturum bekleniyor")}>
              <span data-no-i18n>{info()!.track}</span>
            </Show>
            <Show when={info()?.sessionKind}>
              {" · "}
              {kindLabel(info()!.sessionKind)}
            </Show>
            <Show when={info()?.previous}>
              {" · "}
              {t("Önceki oturum")}
            </Show>
          </small>
        </div>
        <button class="btn small evw-tool" onClick={copyText} title={t("Listeyi metin olarak panoya kopyala")}>
          <Copy /> Kopyala
        </button>
        <button class="btn small evw-tool" onClick={saveCsv} title={t("Listeyi CSV dosyası olarak kaydet")}>
          <Download /> CSV
        </button>
        <Show when={!ro()}>
          <button class="btn small evw-tool evw-live" onClick={live} disabled={!!info() && !info()!.replayOk && inTauri} title={t("iRacing tekrarını canlı ana getir")}>
          <RadioTower /> Canlıya dön
          </button>
          <button class="btn small evw-tool evw-gear" classList={{ on: showCfg() }} onClick={() => setShowCfg(!showCfg())} title={t("Olaylar ekranı ayarları")}>
          <SettingsIcon />
          </button>
        </Show>
      </header>

      <Show when={showCfg() && !ro()}>
        <section class="evw-cfg">
          <label class="evw-cfg-row">
            <span>
              <b>Yarış sonunda aç</b>
              <small class="muted">Yarış bitince ve tekrar (replay) başlayınca bu pencere kendiliğinden açılır</small>
            </span>
            <span class="switch">
              <input
                type="checkbox"
                checked={g().eventsAutoOpen}
                onChange={(e) => {
                  const v = e.currentTarget.checked;
                  updateSettings((s) => (s.general.eventsAutoOpen = v));
                }}
              />
              <i />
            </span>
          </label>
          <label class="evw-cfg-row">
            <span>
              <b>En az olay sayısı</b>
              <small class="muted">Oturumda bundan az olay varsa pencere kendiliğinden açılmaz (0: her yarıştan sonra aç)</small>
            </span>
            <input
              type="number"
              class="evw-num-in"
              min="0"
              max="50"
              value={g().eventsMinCount ?? 0}
              disabled={!g().eventsAutoOpen}
              onChange={(e) => {
                const v = Math.max(0, Math.min(50, Math.round(Number(e.currentTarget.value) || 0)));
                e.currentTarget.value = String(v);
                updateSettings((s) => (s.general.eventsMinCount = v));
              }}
            />
          </label>
          <div class="evw-cfg-rec">
            <b>Kaydedilecek olaylar</b>
            <small class="muted">Kapatılan türler bundan sonra listeye yazılmaz; start ve bitiş her zaman yazılır</small>
            <div class="evw-cfg-grid">
              <For each={REC}>
                {(r) => (
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={rec(r.id)}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        updateSettings((s) => {
                          s.general.eventsRecord = { ...s.general.eventsRecord, [r.id]: v };
                        });
                      }}
                    />
                    <span>{t(r.label)}</span>
                  </label>
                )}
              </For>
            </div>
          </div>
        </section>
      </Show>

      <Show when={hasSession()}>
        <section class="evw-head">
          <div class="evw-cell wide">
            <small>Pist</small>
            <b data-no-i18n>{info()!.track || "–"}</b>
          </div>
          <div class="evw-cell wide">
            <small>Araç</small>
            <b data-no-i18n>{sum()?.car || "–"}</b>
          </div>
          <div class="evw-cell">
            <small>Oturum</small>
            <b>{info()!.sessionKind ? kindLabel(info()!.sessionKind) : "–"}</b>
          </div>
          <div class="evw-cell">
            <small>Tarih</small>
            <b data-no-i18n>{dateText() || "–"}</b>
          </div>
          <div class="evw-cell">
            <small>Tur</small>
            <b data-no-i18n>{sum()?.laps ?? 0}</b>
          </div>
          <div class="evw-cell">
            <small>En iyi tur</small>
            <b data-no-i18n>{(sum()?.bestLap ?? 0) > 0 ? lapTime(sum()!.bestLap) : "–"}</b>
          </div>
          <div class="evw-cell">
            <small>{isRace() ? t("Bitiş sırası") : t("Sıra")}</small>
            <b data-no-i18n>
              {(sum()?.position ?? 0) > 0 ? `P${sum()!.position}` : "–"}
              <Show when={gainedPos() != null && gainedPos() !== 0}>
                <em class={gainedPos()! > 0 ? "good" : "warn"}>
                  {gainedPos()! > 0 ? "+" : "−"}
                  {Math.abs(gainedPos()!)}
                </em>
              </Show>
            </b>
          </div>
          <div class="evw-cell">
            <small>Olay puanı</small>
            <b data-no-i18n classList={{ bad: hasInc() && totalPts() > 0 }}>
              {hasInc() ? `${totalPts()}x` : "–"}
              <Show when={hasInc() && (sum()?.incidentLimit ?? 0) > 0}>
                <em class="muted">/ {sum()!.incidentLimit}x</em>
              </Show>
            </b>
          </div>
        </section>
      </Show>

      <div class="evw-sum">
        <Show
          when={hasInc()}
          fallback={
            <span>
              <em class="warn">{summary().invalid}</em> geçersiz tur · <em class="bad">{summary().penalties}</em> ceza
            </span>
          }
        >
          <span>
            <em class="bad">{summary().inc}</em> kaza · <em class="bad">{summary().pts}x</em>
          </span>
        </Show>
        <span>
          <em class="good">+{summary().gained}</em> / <em class="warn">−{summary().lost}</em> geçiş
        </span>
        <span>
          <em>{summary().pits}</em> pit
        </span>
        <span class="evw-sp" />
        <Show when={info()?.hasPrevious && !ro()}>
          <span class="seg evw-seg">
            <button classList={{ on: !info()!.previous }} onClick={() => pick("current")}>
              Bu oturum
            </button>
            <button classList={{ on: !!info()!.previous }} onClick={() => pick("previous")}>
              Önceki oturum
            </button>
          </span>
        </Show>
        <span class="muted">{t("{0} olay", filtered().length)}</span>
      </div>

      <nav class="evw-chips">
        <button class="evw-chip" classList={{ on: allOn() }} onClick={() => setCats(allOn() ? new Set<Cat>() : new Set(CATS.map((c) => c.id)))}>
          Tümü
        </button>
        <For each={CATS}>
          {(c) => (
            <button class={`evw-chip c-${c.id}`} classList={{ on: cats().has(c.id), zero: counts()[c.id] === 0 }} onClick={() => toggleCat(c.id)}>
              {t(c.label)}
              <i data-no-i18n>{counts()[c.id]}</i>
            </button>
          )}
        </For>
        <button class="evw-chip me" classList={{ on: onlyMe() }} onClick={() => (setOnlyMe(!onlyMe()), setDriver(null))}>
          Sadece benim
        </button>
        <Show when={drivers().length > 1}>
          <select class="evw-driver" classList={{ on: driver() != null }} title={t("Yalnızca seçilen sürücünün olaylarını göster")} onChange={(e) => (setDriver(e.currentTarget.value === "" ? null : Number(e.currentTarget.value)), setOnlyMe(false))}>
            <option value="" selected={driver() == null}>
              {t("Tüm sürücüler")}
            </option>
            <For each={drivers()}>
              {(d) => (
                <option value={d.idx} selected={driver() === d.idx} data-no-i18n>
                  {`${d.number ? `#${d.number} ` : ""}${d.name} (${d.n})`}
                </option>
              )}
            </For>
          </select>
        </Show>
      </nav>

      <Show when={note()}>
        <div class="evw-note">{note()}</div>
      </Show>
      <Show when={untracked() > 0 && events().length > 0}>
        <div class="evw-note">{t("{0}x olay puanı listede yok: kayıt başlamadan önce alındı ya da o tür kayıt dışı bırakıldı.", untracked())}</div>
      </Show>
      <Show when={msg()}>
        <div class="evw-msg" classList={{ err: !msg()!.ok }}>
          {msg()!.text}
        </div>
      </Show>

      <div class="evw-list" ref={listEl}>
        <Show
          when={groups().length > 0}
          fallback={
            <div class="evw-empty">
              <Flag />
              <Show
                when={!failed()}
                fallback={
                  <>
                    <p>{t("Olaylar okunamadı")}</p>
                    <small data-no-i18n>{failed()}</small>
                    <button class="btn small" onClick={load}>
                      Yeniden dene
                    </button>
                  </>
                }
              >
                <Show
                  when={events().length === 0}
                  fallback={
                    <>
                      <p>{t("Bu filtreye uyan olay yok")}</p>
                      <button
                        class="btn small"
                        onClick={() => {
                          setCats(new Set(CATS.map((c) => c.id)));
                          setOnlyMe(false);
                          setDriver(null);
                        }}
                      >
                        Süzgeçleri temizle
                      </button>
                    </>
                  }
                >
                  <Show
                    when={hasSession()}
                    fallback={
                      <>
                        <p>{t("Oturum bekleniyor")}</p>
                        <small>{t("Bir oyuna bağlanınca oturumun olayları burada birikir. Görmek için Demo modunu da açabilirsin.")}</small>
                      </>
                    }
                  >
                    <p>{t("Bu oturumda olay kaydedilmedi")}</p>
                    <small>
                      {untracked() > 0
                        ? t("{0}x olay puanı kayıt başlamadan önce alındı (uygulama oturumun ortasında açıldı).", untracked())
                        : info()?.connected
                          ? t("Temiz sürüş. Oturum sürerken yeni olaylar burada birikir.")
                          : t("Bu oturumda kaydedilecek bir olay olmadı.")}
                    </small>
                    <Show when={info()?.hasPrevious && !info()?.previous && !ro()}>
                      <button class="btn small" onClick={() => pick("previous")}>
                        Önceki oturumu göster
                      </button>
                    </Show>
                  </Show>
                </Show>
              </Show>
            </div>
          }
        >
          <For each={groups()}>
            {(g) => (
              <section class="evw-lap">
                <h4>{g.lap > 0 ? t("Tur {0}", g.lap) : t("Start öncesi")}</h4>
                <For each={g.items}>
                  {(e) => (
                    <button
                      class={`evw-row t-${tone(e)}`}
                      classList={{ sel: sel() === e.id, me: e.isMe, nogo: ro() || (inTauri && !info()?.replayOk) }}
                      data-ev={e.id}
                      onClick={() => seek(e)}
                      tabIndex={ro() ? -1 : undefined}
                      aria-disabled={ro() ? "true" : undefined}
                      title={ro() ? t(KIND_LABEL[e.kind] ?? "") : !inTauri || info()?.replayOk ? t("Tekrarda bu ana git") : t(KIND_LABEL[e.kind] ?? "")}
                    >
                      <span class="evw-ic">{(ICON[e.kind] ?? ICON.flag)()}</span>
                      <span class="evw-time" data-no-i18n>
                        {clock(e.time)}
                      </span>
                      <span class="evw-who">
                        <Show when={e.number}>
                          <span class="evw-num" style={{ "border-color": e.classColor || "var(--line)" }} data-no-i18n>
                            #{e.number}
                          </span>
                        </Show>
                        <span class="evw-name" data-no-i18n>
                          {e.name}
                        </span>
                      </span>
                      <span class="evw-txt">
                        <Show when={e.kind === "incident"}>
                          <span class="evw-badge" data-no-i18n>
                            {e.sub}
                          </span>
                        </Show>
                        {e.text}
                      </span>
                      <Show when={!ro()}>
                        <span class="evw-go">
                          <Play />
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </section>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
