// Ekip Pitwall'ı — "sürücünün gözünden" görünümler (c79): sürücünün kendi ekranında gördüğü Live Timing, Mühendis
// ekranı ve Olaylar listesi, ekip üyesine SALT OKUNUR gösterilir. Aynı pencere bileşenleri kullanılır
// (window/Timing.tsx, Engineer.tsx, Events.tsx); veri yerel sim akışı yerine sürücünün uygulamasının sunucuya yazdığı
// anlık görüntüden gelir (cloud/crew.ts crewExt, ~3 sn'de bir). Tekrar / kamera düğmeleri çizilmez, sime ya da
// sürücüye hiçbir komut gönderilmez. İzleyiciler (spotter olmayan ekip üyeleri) de görür.

import { Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { TopicSourceProvider, type TopicSource } from "@/sdk/telemetry";
import type { Status, TopicMap, TopicName } from "@/sdk/types";
import { crewExt, unpackRows, type CrewExtE } from "@/cloud/crew";
import { Timing } from "@/window/Timing";
import { Engineer } from "@/window/Engineer";
import { Events, type EventsInfo } from "@/window/Events";
import "@/window/window.css";

export type CrewViewKind = "timing" | "engineer" | "events";

/** Veri bu kadar saniyeden eskiyse "güncel değil" uyarısı gösterilir */
const STALE_SEC = 10;

export function CrewRemote(props: { owner: string; name: string; view: CrewViewKind; track?: string; sim?: string; car?: string }) {
  // Konu sinyalleri: pencere bileşenleri ve overlay'ler useTopic ile buradan okur (yerel akış yerine)
  const sigs = new Map<string, ReturnType<typeof createSignal<unknown>>>();
  const sig = (n: string) => {
    let s = sigs.get(n);
    if (!s) {
      s = createSignal<unknown>(undefined, { equals: false });
      sigs.set(n, s);
    }
    return s;
  };
  const source: TopicSource = { topic: (n) => sig(n)[0] as never };
  const put = <K extends TopicName>(n: K, v: TopicMap[K] | undefined) => sig(n)[1](() => v);

  const [events, setEvents] = createSignal<EventsInfo | null>(null);
  const [evMeta, setEvMeta] = createSignal<{ total: number; shown: number } | null>(null);
  /** Görünümün verisi var mı (null: henüz yanıt yok) */
  const [has, setHas] = createSignal<boolean | null>(null);
  /** Sunucudaki yaş (ms) ve alındığı an */
  const [got, setGot] = createSignal<{ age: number; at: number } | null>(null);
  /** Görünüm kapalı: sürücü yarışta değil / paylaşım kapalı / hata */
  const [off, setOff] = createSignal("");
  const [now, setNow] = createSignal(Date.now());
  let evRev: string | null = null;
  let alive = true;
  let busy = false;
  onCleanup(() => (alive = false));

  const owner = createMemo(() => props.owner);
  const view = createMemo(() => props.view);
  const clearTopics = () => {
    for (const s of sigs.values()) s[1](undefined);
  };

  const load = async () => {
    if (busy || document.hidden) return;
    busy = true;
    const id = owner();
    const v = view();
    try {
      const r = await crewExt(id, v === "timing" ? "t" : v === "engineer" ? "tg" : "e", v === "events" ? evRev : null);
      if (!alive || id !== owner() || v !== view()) return;
      if (!r || !r.on || !r.racing) {
        setOff(!r || r.on ? t("Sürücü şu an yarışta değil.") : t("Sürücü pitwall paylaşımını kapattı."));
        setHas(false);
        setGot(null);
        return;
      }
      setOff("");
      put("status", { connected: true, demo: false, preview: false, sim: props.sim ?? "", track: props.track ?? "", carName: props.car ?? "", sessionType: r.t?.ses?.sessionType ?? "" } as unknown as Status);
      if (v !== "events") {
        const tp = r.t ?? null;
        put("standings", tp?.st ? { ...tp.st, rows: unpackRows(tp.st.rows) } : undefined);
        put("raceControl", tp ? { events: tp.rc ?? [] } : undefined);
        put("session", tp?.ses ?? r.g?.topics?.session ?? undefined);
      }
      if (v === "timing") {
        setHas(!!r.t);
        setGot(r.t && r.t_age != null ? { age: r.t_age, at: Date.now() } : null);
      } else if (v === "engineer") {
        const g = r.g ?? null;
        put("relative", g?.rel ? { ...g.rel, rows: unpackRows(g.rel.rows) } : undefined);
        for (const k of ["fuel", "tires", "weather", "telemetry", "laps"] as const) put(k, g?.topics?.[k] as never);
        setHas(!!g || !!r.t);
        const age = g && r.g_age != null ? r.g_age : r.t && r.t_age != null ? r.t_age : null;
        setGot(age != null ? { age, at: Date.now() } : null);
      } else {
        if (r.e) {
          const e = r.e as CrewExtE;
          evRev = r.e_rev ?? null;
          setEvents({ ...(e.info as unknown as EventsInfo), replayOk: false, previous: false, hasPrevious: false });
          setEvMeta({ total: Number(e.total) || 0, shown: e.info.events?.length ?? 0 });
        } else if (!r.e_same) {
          evRev = null;
          setEvents(null);
          setEvMeta(null);
        }
        setHas(!!r.e || !!r.e_same);
        setGot((r.e || r.e_same) && r.e_age != null ? { age: r.e_age, at: Date.now() } : null);
      }
    } catch (e) {
      if (!alive || id !== owner() || v !== view()) return;
      const m = String((e as Error)?.message ?? e);
      // Sunucuda c79 yoksa (fonksiyon bulunamadı) anlaşılır bir açıklama
      setOff(/could not find|PGRST202|not exist|404/i.test(m) ? t("Bu görünüm sunucuda henüz etkin değil.") : t(m));
      setHas(false);
      setGot(null);
    } finally {
      busy = false;
    }
  };
  createEffect(
    on([owner, view], () => {
      evRev = null;
      setHas(null);
      setGot(null);
      setOff("");
      setEvents(null);
      setEvMeta(null);
      clearTopics();
      void load();
    }),
  );
  const iv = window.setInterval(() => void load(), 3000);
  const tick = window.setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => {
    clearInterval(iv);
    clearInterval(tick);
  });

  /** Verinin gecikmesi (sn): sunucudaki yaşı + alındığından beri geçen süre */
  const delay = () => {
    const g = got();
    return g ? Math.max(0, Math.round((g.age + (now() - g.at)) / 1000)) : null;
  };
  const stale = () => has() === true && (delay() == null || delay()! > STALE_SEC);
  const standings = () => sig("standings")[0]() as TopicMap["standings"] | undefined;
  const evNote = () => {
    const m = evMeta();
    return m && m.total > m.shown ? t("Sürücünün olay listesinin en yeni {0} olayı gösteriliyor (toplam {1}).", String(m.shown), String(m.total)) : "";
  };
  const waiting = () => (
    <div class="crv-empty">
      <Show when={has() === null} fallback={<p>{t("Sürücünün uygulamasından veri bekleniyor…")}</p>}>
        <p>{t("Yükleniyor…")}</p>
      </Show>
      <Show when={has() === false}>
        <small>{t("Birkaç saniye içinde gelmezse sürücünün uygulaması güncel olmayabilir ya da oyun bu veriyi vermiyor.")}</small>
      </Show>
    </div>
  );

  return (
    <section class="panel crv" classList={{ stale: stale() }}>
      <header class="crv-top">
        <b>
          {delay() != null
            ? t("Sürücünün gözünden · {0} · veri {1} sn gecikmeli", props.name || "?", String(delay()))
            : t("Sürücünün gözünden · {0}", props.name || "?")}
        </b>
        <Show when={stale()}>
          <span class="crv-stale">{t("Veri güncel değil")}</span>
        </Show>
        <span class="crv-ro" title={t("Tekrar ve kamera düğmeleri yalnızca sürücünün kendi ekranında çalışır.")}>
          {t("Salt okunur")}
        </span>
      </header>
      <div class="crv-body">
        <Show when={!off()} fallback={<div class="crv-empty"><p>{off()}</p></div>}>
          <TopicSourceProvider value={source}>
            <Switch>
              <Match when={view() === "timing"}>
                <Show when={has() && standings()} fallback={has() ? <div class="crv-empty"><p>{t("Bu oyun ya da oturum için sıralama verisi yok.")}</p></div> : waiting()}>
                  <Show when={(standings()?.rows.length ?? 0) > 0} fallback={<div class="crv-empty"><p>{t("Bu oyun ya da oturum için sıralama verisi yok.")}</p></div>}>
                    <Timing readOnly />
                  </Show>
                </Show>
              </Match>
              <Match when={view() === "engineer"}>
                <Show when={has()} fallback={waiting()}>
                  <Engineer readOnly waiting={t("Veri bekleniyor")} />
                </Show>
              </Match>
              <Match when={view() === "events"}>
                <Show when={has() && events()} fallback={waiting()}>
                  <Events source={events} readOnly note={evNote()} />
                </Show>
              </Match>
            </Switch>
          </TopicSourceProvider>
        </Show>
      </div>
    </section>
  );
}
