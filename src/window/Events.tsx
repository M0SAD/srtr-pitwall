// Olaylar ekranı: oturumun kazaları, geçişleri, pitleri, en hızlı turları ve bayrakları.
// Yarış bitince (damalı bayrak) kendiliğinden açılır; bir olaya tıklayınca iRacing tekrarı
// olayın ~5 sn öncesine sarılır, kamera o araca döner ve 1x oynatılır.

import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { settings, updateSettings } from "@/sdk/settings";
import { clock } from "@/sdk/format";
import { t } from "@/sdk/i18n";
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
  | "pass"
  | "passed"
  | "lead"
  | "gained"
  | "lost"
  | "pitIn"
  | "pitOut"
  | "fastest"
  | "best"
  | "flag"
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

interface EventsInfo {
  sim: string;
  demo: boolean;
  connected: boolean;
  track: string;
  sessionKind: string;
  sessionNum: number;
  replayOk: boolean;
  events: RaceEvent[];
}

type Cat = "crash" | "pass" | "pit" | "fast" | "flag";

const CAT: Record<Kind, Cat> = {
  incident: "crash",
  offTrack: "crash",
  pass: "pass",
  passed: "pass",
  lead: "pass",
  gained: "pass",
  lost: "pass",
  pitIn: "pit",
  pitOut: "pit",
  fastest: "fast",
  best: "fast",
  flag: "flag",
  start: "flag",
  finish: "flag",
};

const CATS: { id: Cat; label: string }[] = [
  { id: "crash", label: "Olaylar/Kazalar" },
  { id: "pass", label: "Geçişler" },
  { id: "pit", label: "Pit" },
  { id: "fast", label: "En hızlı tur" },
  { id: "flag", label: "Bayraklar" },
];

const ICON: Record<Kind, () => JSX.Element> = {
  incident: () => <TriangleAlert />,
  offTrack: () => <CircleAlert />,
  pass: () => <TrendingUp />,
  passed: () => <TrendingDown />,
  lead: () => <Crown />,
  gained: () => <ChevronsUp />,
  lost: () => <ChevronsDown />,
  pitIn: () => <LogIn />,
  pitOut: () => <LogOut />,
  fastest: () => <Timer />,
  best: () => <Star />,
  flag: () => <Flag />,
  start: () => <Play />,
  finish: () => <Flag />,
};

/** Olay rengi (sınıf adı): kaza kırmızı, geçiş yeşil/turuncu, bayrak türüne göre */
function tone(e: RaceEvent): string {
  switch (e.kind) {
    case "incident":
      return e.sub === "1x" ? "warn" : "bad";
    case "offTrack":
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
    events: ev,
  };
}

export function Events() {
  const [info, setInfo] = createSignal<EventsInfo | null>(null);
  const [cats, setCats] = createSignal<Set<Cat>>(new Set(CATS.map((c) => c.id)));
  const [onlyMe, setOnlyMe] = createSignal(false);
  const [sel, setSel] = createSignal<number | null>(null);
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
  let listEl: HTMLDivElement | undefined;

  const load = async () => {
    if (!inTauri) {
      setInfo(sampleEvents());
      return;
    }
    try {
      setInfo(await invoke<EventsInfo>("events_get"));
    } catch {
      /* pencere kapanırken */
    }
  };
  onMount(() => {
    load();
    const h = setInterval(load, 2000);
    onCleanup(() => clearInterval(h));
  });

  const toggleCat = (c: Cat) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const allOn = () => cats().size === CATS.length;

  const filtered = createMemo(() => {
    const list = info()?.events ?? [];
    const cs = cats();
    return list.filter((e) => cs.has(CAT[e.kind]) && (!onlyMe() || e.isMe));
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

  const summary = createMemo(() => {
    const l = info()?.events ?? [];
    const mine = l.filter((e) => e.isMe);
    const inc = mine.filter((e) => e.kind === "incident");
    const pts = inc.reduce((a, e) => a + (parseInt(e.sub) || 0), 0);
    return {
      inc: inc.length,
      pts,
      gained: mine.filter((e) => e.kind === "pass").length,
      lost: mine.filter((e) => e.kind === "passed").length,
      pits: mine.filter((e) => e.kind === "pitIn").length,
    };
  });

  const note = createMemo(() => {
    const i = info();
    if (!inTauri) return t("Tarayıcı önizlemesi: örnek olaylar gösteriliyor.");
    if (!i) return "";
    if (i.demo) return t("Demo verisi: tekrara atlama yalnızca iRacing'de çalışır.");
    if (i.sim && i.sim !== "iracing") return t("Replay bu oyunda desteklenmiyor");
    if (!i.connected) return t("iRacing bağlı değil: tekrara atlamak için oturumda (yarış sonrası dahil) iRacing açık olmalı.");
    return "";
  });

  const seek = async (e: RaceEvent) => {
    setSel(e.id);
    if (!inTauri) {
      setMsg({ ok: true, text: t("Tekrar {0} anına sarılıyor", clock(Math.max(0, e.time - 5))) });
      return;
    }
    try {
      await invoke("replay_seek", { sessionNum: e.sessionNum, sessionTime: e.time, carNumber: e.focus || e.number });
      setMsg({ ok: true, text: t("Tekrar {0} anına sarıldı", clock(Math.max(0, e.time - 5))) });
    } catch (err) {
      setMsg({ ok: false, text: t(String(err)) });
    }
  };

  const live = async () => {
    setSel(null);
    if (!inTauri) return;
    try {
      await invoke("replay_live");
      setMsg({ ok: true, text: t("Canlı yayına dönüldü") });
    } catch (err) {
      setMsg({ ok: false, text: t(String(err)) });
    }
  };

  // Klavye: ↑/↓ ile olaylar arasında gez, Enter ile tekrara git
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Enter") return;
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
    ({ Race: t("Yarış"), Practice: t("Antrenman"), "Open Qualify": t("Sıralama"), "Lone Qualify": t("Sıralama"), Qualify: t("Sıralama") })[k] ?? k;

  return (
    <div class="evw">
      <header class="evw-top">
        <div class="evw-title">
          <b>Olaylar</b>
          <small class="muted">
            <Show when={info()?.track} fallback={t("Oturum bekleniyor")}>
              <span data-no-i18n>{info()!.track}</span>
            </Show>
            <Show when={info()?.sessionKind}>
              {" · "}
              {kindLabel(info()!.sessionKind)}
            </Show>
          </small>
        </div>
        <label class="evw-auto" title={t("Yarış bitince bu pencere kendiliğinden açılır")}>
          <span>Yarış sonunda aç</span>
          <span class="switch">
            <input
              type="checkbox"
              checked={settings().general.eventsAutoOpen}
              onChange={(e) => {
                const v = e.currentTarget.checked;
                updateSettings((s) => (s.general.eventsAutoOpen = v));
              }}
            />
            <i />
          </span>
        </label>
        <button class="btn small evw-live" onClick={live} disabled={!!info() && !info()!.replayOk && inTauri}>
          <RadioTower /> Canlıya dön
        </button>
      </header>

      <div class="evw-sum">
        <span>
          <em class="bad">{summary().inc}</em> kaza · <em class="bad">{summary().pts}x</em>
        </span>
        <span>
          <em class="good">+{summary().gained}</em> / <em class="warn">−{summary().lost}</em> geçiş
        </span>
        <span>
          <em>{summary().pits}</em> pit
        </span>
        <span class="evw-sp" />
        <span class="muted">{t("{0} olay", filtered().length)}</span>
      </div>

      <nav class="evw-chips">
        <button class="evw-chip" classList={{ on: allOn() }} onClick={() => setCats(allOn() ? new Set<Cat>() : new Set(CATS.map((c) => c.id)))}>
          Tümü
        </button>
        <For each={CATS}>
          {(c) => (
            <button class={`evw-chip c-${c.id}`} classList={{ on: cats().has(c.id) }} onClick={() => toggleCat(c.id)}>
              {t(c.label)}
            </button>
          )}
        </For>
        <button class="evw-chip me" classList={{ on: onlyMe() }} onClick={() => setOnlyMe(!onlyMe())}>
          Sadece benim
        </button>
      </nav>

      <Show when={note()}>
        <div class="evw-note">{note()}</div>
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
              <p>{(info()?.events.length ?? 0) > 0 ? t("Bu filtreye uyan olay yok") : t("Henüz olay yok. Yarış sürerken olaylar burada birikir.")}</p>
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
                      classList={{ sel: sel() === e.id, me: e.isMe }}
                      data-ev={e.id}
                      onClick={() => seek(e)}
                      title={t("Tekrarda bu ana git")}
                    >
                      <span class="evw-ic">{ICON[e.kind]()}</span>
                      <span class="evw-time">{clock(e.time)}</span>
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
                          <span class="evw-badge">{e.sub}</span>
                        </Show>
                        {e.text}
                      </span>
                      <span class="evw-go">
                        <Play />
                      </span>
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
