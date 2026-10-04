// Ekip Pitwall'ı (c58): ekibinde olduğum sürücünün uzaktan pit duvarı. Sürücünün uygulaması, ekipten biri bu
// paneli açıkken çevresindeki araçları, tur / delta / bayrak / hava bilgisini ve spotter durumunu saniyede bir
// sunucuya yazar (src/host/crew.ts); burada crew_wall() ile saniyede bir okunur. Aynı panelin web sürümü
// website/assets/crewpanel.js içindedir. Mesajlar ve hazır spotter mesajları Ekip odasındadır (CrewRoom.tsx, c64). Veri birkaç saniye gecikebilir: yan araç göstergesi bilgi amaçlıdır.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { lapTime } from "@/sdk/format";
import { crewWall, type CrewWall as CrewWall_, type CrewWallState, type WallRow } from "@/cloud/crew";
import { castLink, type CastLink } from "@/cloud/social";
import { crewKnock, knock, wallChannel } from "@/cloud/pings";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "./ProLock";
import { SpotterView } from "./CrewGfx";

const FLAGS: Record<string, { label: string; cls: string }> = {
  checkered: { label: "Damalı bayrak", cls: "chk" },
  white: { label: "Son tur", cls: "wht" },
  green: { label: "Yeşil bayrak", cls: "grn" },
  yellow: { label: "Sarı bayrak", cls: "yel" },
  red: { label: "Kırmızı bayrak", cls: "red" },
  blue: { label: "Mavi bayrak", cls: "blu" },
  debris: { label: "Pistte parça", cls: "yel" },
  greenHeld: { label: "Yeşil bayrak", cls: "grn" },
  oneLapToGreen: { label: "Yeşile bir tur", cls: "yel" },
  caution: { label: "Güvenlik aracı", cls: "yel" },
  cautionWaving: { label: "Güvenlik aracı", cls: "yel" },
  black: { label: "Siyah bayrak", cls: "blk" },
  disqualify: { label: "Diskalifiye", cls: "blk" },
  repair: { label: "Tamir bayrağı", cls: "blk" },
};
const WET = ["", "Kuru", "Çoğunlukla kuru", "Çok hafif ıslak", "Hafif ıslak", "Orta ıslak", "Çok ıslak", "Sırılsıklam"];

const color = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "transparent");
const gapText = (r: WallRow) => {
  if (r.me) return "";
  if (r.lr) return r.lr > 0 ? t("+{0} tur", String(r.lr)) : t("{0} tur", String(r.lr));
  if (r.g == null) return "—";
  return `${r.g > 0 ? "−" : "+"}${Math.abs(r.g).toFixed(1)}`;
};

export function CrewWall(props: { owner: string; live: boolean }) {
  const [st, setSt] = createSignal<CrewWallState | null>(null);
  const [failed, setFailed] = createSignal(false);
  // Fark eğilimi: araç başına son farklar (yaklaşıyor / uzaklaşıyor)
  const hist = new Map<number, { ts: number; g: number }[]>();
  const [trend, setTrend] = createSignal<Record<number, number>>({});
  let alive = true;
  let busy = false;
  let lastTs = 0;
  onCleanup(() => (alive = false));

  // props.owner üst bileşende her yoklamada yenilenen bir nesneden okunur; değer aynıysa tetiklenmesin diye memo
  const owner = createMemo(() => props.owner);
  const load = async () => {
    if (busy || document.hidden) return;
    busy = true;
    const id = owner();
    try {
      const r = await crewWall(id);
      if (!alive || id !== owner()) return;
      setFailed(false);
      setSt(r);
      join(id, r?.data?.ch);
      apply(r?.data);
    } catch {
      if (alive) setFailed(true); // eski sunucu (c58 yok) ya da ağ hatası
    } finally {
      busy = false;
    }
  };
  // Canlı yayın (Realtime): sürücü veriyi saniyede bir yayınlar; anahtar crew_wall yanıtıyla gelir. Yayın geldiği
  // sürece sunucu yoklanmaz; 5 sn yayın gelmezse (bağlantı yok / anahtar değişti) yoklamaya dönülür.
  let cast: CastLink | null = null;
  let castKey = "";
  let castAt = 0;
  const join = (id: string, ch?: string) => {
    const key = ch ? wallChannel(id, ch) : "";
    if (key === castKey) return;
    cast?.close();
    castKey = key;
    cast = key
      ? castLink(key, "wall", (p: CrewWall_) => {
          if (!alive || id !== owner() || !p || typeof p !== "object" || typeof p.ts !== "number") return;
          castAt = Date.now();
          const locked = !!st()?.speech_locked;
          const d = locked ? { ...p, speech: undefined } : p;
          setFailed(false);
          setSt({ on: true, age_ms: 0, data: d, speech_locked: locked });
          apply(d);
        })
      : null;
  };
  onCleanup(() => cast?.close());
  const apply = (d: CrewWall_ | null | undefined) => {
    {
      if (d && d.ts !== lastTs) {
        lastTs = d.ts;
        const tr: Record<number, number> = {};
        const seen = new Set<number>();
        for (const row of d.rows ?? []) {
          if (row.me || row.g == null || row.lr) continue;
          seen.add(row.i);
          const h = hist.get(row.i) ?? [];
          h.push({ ts: d.ts, g: Math.abs(row.g) });
          while (h.length > 6) h.shift();
          hist.set(row.i, h);
          const old = h[0];
          if (h.length >= 3 && d.ts - old.ts >= 2000) tr[row.i] = Math.abs(row.g) - old.g;
        }
        for (const k of [...hist.keys()]) if (!seen.has(k)) hist.delete(k);
        setTrend(tr);
      }
    }
  };
  let tickN = 0;
  const iv = window.setInterval(() => {
    if (document.hidden) return;
    tickN++;
    if (Date.now() - castAt < 5000) return;
    // Yayın yok: veri gelene kadar 4 sn'de bir, yedek kipte de 4 sn'de bir (sürücü veritabanına 5 sn'de bir yazar)
    if (tickN % 2 === 0) void load();
  }, 2000);
  onCleanup(() => clearInterval(iv));
  createEffect(
    on(
      owner,
      () => {
        hist.clear();
        lastTs = 0;
        castAt = 0;
        join(owner(), undefined);
        knock(crewKnock(owner()));
        setSt(null);
        setTrend({});
        void load();
      },
    ),
  );

  const d = () => st()?.data ?? null;
  const stale = () => (st()?.age_ms ?? 0) > 5000;
  const near = createMemo(() => (d()?.rows ?? []).filter((r) => !r.top).sort((a, b) => (b.g ?? 0) - (a.g ?? 0)));
  const top = createMemo(() => (d()?.rows ?? []).filter((r) => r.top).sort((a, b) => a.cp - b.cp));
  const sp = () => (stale() ? 0 : (d()?.sp ?? 0));
  const flags = () => (d()?.flags ?? []).map((f) => FLAGS[f]).filter(Boolean);
  const trendOf = (r: WallRow) => {
    const v = trend()[r.i];
    if (v == null || Math.abs(v) < 0.1) return 0;
    return v < 0 ? -1 : 1;
  };
  // Sürücünün konuşma altyazısı (c60). Sunucu PRO olmayan izleyiciye göndermez (speech_locked).
  const speechLocked = () => !!st()?.speech_locked || proLocked(F.crew);
  const speech = createMemo(() => (speechLocked() ? [] : (d()?.speech ?? []).filter((l) => l && typeof l.text === "string" && l.text)));
  const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  /** Eski satırlar solar (yaş sürücünün saatine göre: gönderim anı − söylendiği an) */
  const fade = (ms: number) => Math.max(0.4, 1 - Math.max(0, (d()?.ts ?? ms) - ms) / 75_000);

  const Row = (p: { r: WallRow }) => (
    <tr classList={{ me: !!p.r.me, pit: !!p.r.pit, top: !!p.r.top }} data-no-i18n>
      <td class="cwl-pos">
        <i style={{ background: color(p.r.c) }} />
        {p.r.cp > 0 ? p.r.cp : "—"}
      </td>
      <td class="cwl-num">#{p.r.n}</td>
      <td class="cwl-name">
        {p.r.nm || "?"}
        <Show when={p.r.pit}>
          <em>PIT</em>
        </Show>
      </td>
      <td class="cwl-gap">{gapText(p.r)}</td>
      <td class="cwl-tr" classList={{ closing: trendOf(p.r) < 0, opening: trendOf(p.r) > 0 }} title={trendOf(p.r) < 0 ? t("Fark kapanıyor") : trendOf(p.r) > 0 ? t("Fark açılıyor") : ""}>
        {trendOf(p.r) < 0 ? "▼" : trendOf(p.r) > 0 ? "▲" : ""}
      </td>
      <td class="cwl-lap">{lapTime(p.r.l)}</td>
      <td class="cwl-lap dim">{lapTime(p.r.b)}</td>
    </tr>
  );

  return (
    <section class="panel cwl">
      <h3>
        Ekip Pitwall'ı
        <Show when={d()}>
          <span class="crew-live" classList={{ on: !stale() }}>
            {stale() ? t("Veri gecikti") : t("Canlı")}
          </span>
        </Show>
      </h3>
      <Show when={!failed()} fallback={<p class="muted small">Ekip Pitwall'ı verisi okunamadı. Daha sonra tekrar dene.</p>}>
        <Show when={st()?.on !== false} fallback={<p class="muted small">Sürücü canlı pitwall paylaşımını kapattı. Aşağıdaki özet panel çalışmaya devam eder.</p>}>
          <Show
            when={d()}
            fallback={
              <p class="muted small">
                {props.live
                  ? t("Sürücünün uygulamasından pitwall verisi bekleniyor… (birkaç saniye sürebilir; sürücünün uygulaması güncel olmalı)")
                  : t("Sürücü pistteyken çevresindeki araçlar, farklar ve spotter durumu burada canlı görünür.")}
              </p>
            }
          >
            <Show when={flags().length > 0}>
              <div class="cwl-flags">
                <For each={flags()}>{(f) => <span class={`cwl-flag ${f.cls}`}>{t(f.label)}</span>}</For>
              </div>
            </Show>
            <div class="crew-grid cwl-top">
              <div class="crew-stat">
                <small>Sıra</small>
                <b data-no-i18n>
                  {d()!.me.pos > 0 ? `P${d()!.me.pos}` : "—"}
                  <Show when={d()!.me.cp > 0}>
                    <i>
                      {" "}
                      / {t("sınıf")} P{d()!.me.cp}
                    </i>
                  </Show>
                </b>
              </div>
              <div class="crew-stat">
                <small>Son tur</small>
                <b data-no-i18n>{lapTime(d()!.me.last)}</b>
              </div>
              <div class="crew-stat">
                <small>En iyi tur</small>
                <b data-no-i18n>{lapTime(d()!.me.best)}</b>
              </div>
              <div class="crew-stat" classList={{ good: (d()!.me.d ?? 0) < 0, warn: (d()!.me.d ?? 0) > 0 }}>
                <small>Delta (en iyi tura göre)</small>
                <b data-no-i18n>{d()!.me.d == null ? "—" : `${d()!.me.d! > 0 ? "+" : ""}${d()!.me.d!.toFixed(2)}`}</b>
              </div>
              <div class="crew-stat" classList={{ warn: d()!.pit.road }}>
                <small>Konum</small>
                <b>{d()!.pit.stall ? t("Pit kutusunda") : d()!.pit.road ? t("Pit yolunda") : t("Pistte")}</b>
              </div>
              <Show when={d()!.wx}>
                <div class="crew-stat">
                  <small>Hava / pist</small>
                  <b data-no-i18n>
                    {d()!.wx!.air.toFixed(0)}° / {d()!.wx!.track.toFixed(0)}°
                    <Show when={WET[d()!.wx!.wet]}>
                      <i> {t(WET[d()!.wx!.wet])}</i>
                    </Show>
                  </b>
                </div>
              </Show>
            </div>
            <SpotterView sp={sp()} ahead={d()!.ahead} behind={d()!.behind} />
            <div class="cwl-tablewrap">
              <table class="cwl-table">
                <thead>
                  <tr>
                    <th>Sınıf</th>
                    <th>No</th>
                    <th>Sürücü</th>
                    <th title="Sürücüye göre fark (sn): − önde, + arkada">Fark</th>
                    <th />
                    <th>Son tur</th>
                    <th>En iyi</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={top()}>{(r) => <Row r={r} />}</For>
                  <Show when={top().length > 0}>
                    <tr class="cwl-sep">
                      <td colSpan={7}>Pistte çevresindekiler</td>
                    </tr>
                  </Show>
                  <For each={near()}>{(r) => <Row r={r} />}</For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Show>
      <div class="cwl-speech">
        <small class="cwl-speech-h">Sürücü konuşuyor</small>
        <Show when={!speechLocked()} fallback={<ProLockNote text={t("Sürücünün konuşmasını altyazı olarak görmek PRO üyelere özel.")} />}>
          <Show when={speech().length > 0} fallback={<p class="cwl-speech-empty">Sürücünün konuşma altyazısı kapalı ya da henüz konuşmadı</p>}>
            <For each={speech()}>
              {(l, i) => (
                <p classList={{ now: i() === speech().length - 1, live: !l.final }} style={{ opacity: i() === speech().length - 1 ? 1 : fade(l.t) }} data-no-i18n>
                  <time>{clock(l.t)}</time>
                  <span>
                    {l.text}
                    {l.final ? "" : " …"}
                  </span>
                </p>
              )}
            </For>
          </Show>
        </Show>
      </div>
      <p class="muted small">Veri yaklaşık 1–2 saniye gecikmeyle gelir; yan araç göstergesi anlık spotter yerine geçmez. Sesli görüşme bu panelde yoktur.</p>
    </section>
  );
}
