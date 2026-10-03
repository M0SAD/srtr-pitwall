// Sürücüler › Ekip (c53): ekibinde olduğum sürücüler ve uzaktan pit paneli.
// Solda sürücü listesi, sağda seçilen sürücünün canlı yarış verisi ve (yetki verildiyse) pit kontrolleri.
// En üstte Ekip Pitwall'ı (c58, components/CrewWall.tsx): çevredeki araçlar, spotter durumu, hazır mesajlar.
// Aynı panelin telefon sürümü web sitesindedir (website/crew.html).

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { PIT, crewCommandText, crewDriver, crewDrivers, crewFocus, setCrewFocus, crewSend, crewSimOk, crewStatusText, type CrewCommand, type CrewDriver, type CrewKind } from "@/cloud/crew";
import { CrewWall } from "../components/CrewWall";
import { CrewRoom } from "../components/CrewRoom";
import { FuelCard, Ic, RaceHeader, ServiceStrip, TyreCard, fxKeys, type Fx } from "../components/CrewGfx";
import { crewFit } from "../crewFit";
import "../crew.css";

const SIM_NAMES: Record<string, string> = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "AMS2" };
/** `owner` verilirse (ayrı pencere: window.html?view=crew&owner=…) yalnızca o sürücünün pitwall'ı gösterilir */
export function CrewPage(props: { owner?: string } = {}) {
  const uid = () => session()?.user.id;
  // Liste elle yüklenir (createResource değil): her yenilemede Suspense tetiklenip sayfa baştan kurulmasın.
  // Satırlar kimliğe göre yerinde güncellenir (reconcile), böylece düğmeler de yeniden oluşturulmaz.
  const [listSt, setListSt] = createStore<{ v: CrewDriver[] | null | undefined }>({ v: undefined });
  const list = () => listSt.v;
  const refetch = async () => {
    const id = uid();
    if (!id) return void setListSt("v", undefined);
    const l = await crewDrivers().catch(() => null as CrewDriver[] | null);
    if (uid() !== id) return;
    // Geçici ağ hatasında eldeki liste korunur
    if (l === null && listSt.v) return;
    setListSt("v", reconcile(l, { key: "owner_id" }));
  };
  createEffect(on(uid, () => void refetch()));
  const [sel, setSel] = createSignal(props.owner ?? "");
  const [drv, setDrv] = createSignal<CrewDriver | null>(null);
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal<CrewCommand[]>([]);
  const [liters, setLiters] = createSignal(40);
  /** Komut geri bildirimi (lastik / depo / servis kutusu çizimlerinde): bekliyor → uygulandı / reddedildi */
  const [fx, setFx] = createSignal<Fx>({});
  /** Litre kutusuna dokunuldu mu (dokunulmadıysa ayarlı pit yakıtı ya da bitiş için gereken gösterilir) */
  let litersTouched = false;
  const pickLiters = (n: number) => {
    litersTouched = true;
    setLiters(n);
  };

  // Görünüm: tam ekran (uygulama çerçevesi gizlenir) ve ekrana sığdır (kaydırmadan tümü görünsün diye ölçeklenir)
  const lsGet = (k: string) => {
    try {
      return localStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  };
  const lsSet = (k: string, v: boolean) => {
    try {
      localStorage.setItem(k, v ? "1" : "0");
    } catch {}
  };
  const [fit, setFit] = createSignal(lsGet("crew.fit"));
  const [full, setFull] = createSignal(false);
  const toggleFit = () => {
    setFit(!fit());
    lsSet("crew.fit", fit());
  };
  const toggleFull = () => {
    const v = !full();
    setFull(v);
    try {
      if (v) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    } catch {}
  };
  const onFsKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && full() && !document.fullscreenElement) setFull(false);
  };
  // Esc ile gerçek tam ekrandan çıkılınca sayfa da normale döner
  let wasFs = false;
  const onFsChange = () => {
    if (wasFs && !document.fullscreenElement) setFull(false);
    wasFs = !!document.fullscreenElement;
  };
  document.addEventListener("keydown", onFsKey);
  document.addEventListener("fullscreenchange", onFsChange);
  onCleanup(() => {
    document.removeEventListener("keydown", onFsKey);
    document.removeEventListener("fullscreenchange", onFsChange);
    if (full() && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  });
  let fitCtl: ReturnType<typeof crewFit> | undefined;
  let fitOuter: HTMLDivElement | undefined;
  const mountFit = (inner: HTMLDivElement) => {
    queueMicrotask(() => {
      if (!fitOuter) return;
      fitCtl?.destroy();
      fitCtl = crewFit(fitOuter, inner, fit);
    });
  };
  onCleanup(() => fitCtl?.destroy());
  createEffect(() => {
    fit();
    full();
    fitCtl?.update();
  });

  const ivList = window.setInterval(() => void refetch(), 12_000);
  onCleanup(() => clearInterval(ivList));

  // Seçili sürücü: 3 sn'de bir (sunucu "bağlı" göstergesini de bununla günceller)
  let alive = true;
  onCleanup(() => (alive = false));
  const load = async () => {
    const id = sel();
    if (!id || !uid()) return;
    try {
      const d = await crewDriver(id);
      if (alive && sel() === id) {
        setDrv(d);
        setErr("");
      }
    } catch (e) {
      if (alive && sel() === id) setErr(String((e as Error)?.message ?? e));
    }
  };
  const ivDrv = window.setInterval(() => void load(), 3000);
  onCleanup(() => clearInterval(ivDrv));
  createEffect(
    on(sel, () => {
      setDrv(null);
      setSent([]);
      setErr("");
      setFx({});
      litersTouched = false;
      void load();
    }),
  );
  // Tek sürücü varsa kendiliğinden aç
  createEffect(() => {
    const l = list();
    // Arkadaşlar listesindeki "Ekip" düğmesinden gelindiyse o sürücü açılır
    const want = crewFocus();
    if (props.owner) return;
    if (l && want) {
      setCrewFocus(null);
      if (l.some((d) => d.owner_id === want)) return void setSel(want);
    }
    if (l && l.length && !l.some((d) => d.owner_id === sel())) setSel(l[0].owner_id);
  });

  const data = () => drv()?.data ?? null;
  const cw = () => data()?.crew ?? null;
  const pitFlags = () => cw()?.pit?.flags ?? -1;
  const simOk = () => crewSimOk(cw()?.sim ?? drv()?.sim);
  /** Komut gönderilemiyorsa sebebi (boş: gönderilebilir) */
  const blocked = createMemo(() => {
    const d = drv();
    if (!d) return t("Yükleniyor…");
    if (!d.can_control) return t("Bu sürücü sana sadece izleme yetkisi verdi.");
    if (!d.live) return t("Sürücü şu an yarışta değil ya da veri göndermiyor.");
    if (!simOk()) return t("Uzaktan pit komutları bu oyunda desteklenmiyor (sadece izleme).");
    if (!d.control_on || cw()?.ctl === false) return t("Sürücü ekip kontrolünü kapattı.");
    return "";
  });

  // İlk açılışta litre: şu an ayarlı pit yakıtı ya da bitiş için gereken (web paneliyle aynı)
  createEffect(() => {
    const c = cw();
    if (litersTouched || !c) return;
    const want = c.pit?.flags >= 0 && c.pit.flags & PIT.fuel && c.pit.fuel > 0 ? c.pit.fuel : (c.toFinish ?? 0);
    if (want > 0) setLiters(Math.min(1000, Math.ceil(want)));
  });

  const send = async (kind: CrewKind, args: Record<string, unknown> = {}) => {
    const id = sel();
    if (!id) return;
    setErr("");
    const keys = fxKeys(kind, args, pitFlags());
    const mark = (st: Fx[string]) => setFx((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, st])) }));
    mark("pend");
    try {
      const c = await crewSend(id, kind, args, (c) => setSent((l) => [c, ...l.filter((x) => x.id !== c.id)].slice(0, 8)));
      mark(c.status === "applied" ? "ok" : "bad");
      void load();
    } catch (e) {
      mark("bad");
      setErr(String((e as Error)?.message ?? e));
    }
    window.setTimeout(() => alive && setFx((f) => Object.fromEntries(Object.entries(f).filter(([k, v]) => !keys.includes(k) || v === "pend"))), 1600);
  };
  const sub = (d: CrewDriver) => {
    if (d.live) return t("Canlı") + (d.track ? ` · ${d.track}` : "");
    if (d.racing) return t("Yarışta") + (d.track ? ` · ${d.track}` : "");
    return d.online ? t("Çevrimiçi") : t("Çevrimdışı");
  };

  return (
    <div class="page crewp" classList={{ fit: fit(), full: full(), solo: !!props.owner }}>
      <Show when={session()} fallback={<p class="muted">Bu özellik için hesabına giriş yapmalısın.</p>}>
        <Show when={list() === null && !props.owner}>
          <p class="muted">Ekip listesi okunamadı. Daha sonra tekrar dene.</p>
        </Show>
        <Show when={list() && list()!.length === 0 && !props.owner}>
          <section class="panel">
            <h3>Ekip</h3>
            <p class="muted">
              Henüz kimsenin ekibinde değilsin. Bir arkadaşın Ayarlar › Paylaşım › Ekip bölümünden seni ekibine eklediğinde burada görünür; yarışırken
              yakıtını, turlarını ve pit servisini izleyebilir, izin verdiyse pit ayarlarını uzaktan değiştirebilirsin. Aynı panel telefonda web
              sitesinin Ekip sayfasında da açılır.
            </p>
          </section>
        </Show>
        <Show when={(list() ?? []).length > 0 || !!props.owner}>
          <div class="crew-wrap">
            <div class="crew-list" classList={{ hide: !!props.owner || (list() ?? []).length < 2 }}>
              <For each={list() ?? []}>
                {(d) => (
                  <button class="crew-drv" classList={{ on: sel() === d.owner_id, live: d.live }} onClick={() => setSel(d.owner_id)}>
                    <b data-no-i18n>{d.display_name || "?"}</b>
                    <small data-no-i18n>{sub(d)}</small>
                    <small>{d.can_control ? t("Pit kontrolü") : t("Sadece izleme")}</small>
                  </button>
                )}
              </For>
            </div>
            <div class="crew-fitbox" ref={fitOuter}>
              <div class="crew-view">
                <button class="btn ghost small" classList={{ on: fit() }} onClick={toggleFit} title="Kaydırmaya gerek kalmadan tüm panel ekrana sığacak şekilde ölçeklenir">
                  Ekrana sığdır
                </button>
                <button class="btn ghost small" classList={{ on: full() }} onClick={toggleFull} title="Menüler gizlenir, ekip paneli tüm ekranı kaplar (çıkmak için Esc)">
                  {full() ? t("Tam ekrandan çık") : t("Tam ekran")}
                </button>
              </div>
            <div class="crew-main c3" ref={mountFit}>
              <Show when={drv()} fallback={<p class="muted">{err() ? t(err()) : t("Yükleniyor…")}</p>}>
                {(d) => (
                  <>
                    <div class="crew-col crew-col-a">
                    <section class="panel">
                      <h3 data-no-i18n>
                        {d().display_name || "?"}
                        <span class="crew-live" classList={{ on: d().live }}>
                          {d().live ? t("Canlı") : d().racing ? t("Yarışta") : d().online ? t("Çevrimiçi") : t("Çevrimdışı")}
                        </span>
                      </h3>
                      <p class="muted small" data-no-i18n>
                        {[SIM_NAMES[cw()?.sim || d().sim] ?? "", data()?.track || d().track, data()?.car || d().car, data()?.session || d().session].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <Show when={data()} fallback={<p class="muted">Sürücü şu an veri göndermiyor. Yarışa girdiğinde burası kendiliğinden dolar.</p>}>
                        <div class="pg" classList={{ stale: !d().live }}>
                          <RaceHeader d={d()} />
                        </div>
                      </Show>
                    </section>
                    <CrewWall owner={d().owner_id} live={d().live} />
                    </div>
                    <div class="crew-col crew-col-b">
                    <section class="panel">
                      <h3>Pit kontrolü</h3>
                      <Show when={blocked()}>
                        <p class="pg-lock">
                          <Ic n="lock" />
                          <span>{blocked()}</span>
                        </p>
                      </Show>
                      <Show when={data() || !blocked()}>
                        <div class="pg" classList={{ stale: !d().live, ro: !d().can_control }}>
                          <div class="pg-duo">
                            <FuelCard d={d()} liters={liters()} setLiters={pickLiters} blocked={!!blocked()} fx={fx()} send={send} />
                            <TyreCard d={d()} blocked={!!blocked()} fx={fx()} send={send} />
                          </div>
                          <h4 class="pg-h pg-h2">Pit servisi (şu an ayarlı)</h4>
                          <Show when={pitFlags() < 0}>
                            <p class="muted small pg-na">Bu oyun pit servisi ayarlarını bildirmiyor.</p>
                          </Show>
                          <ServiceStrip d={d()} liters={liters()} blocked={!!blocked()} fx={fx()} send={send} />
                          <Show when={d().can_control}>
                            <fieldset class="pg-ctl" disabled={!!blocked()}>
                              <button type="button" class="pg-b dng" onClick={() => send("clear_all")}>
                                {t("Tümünü temizle")}
                              </button>
                            </fieldset>
                          </Show>
                        </div>
                      </Show>
                      <Show when={err()}>
                        <p class="error">{t(err())}</p>
                      </Show>
                      <For each={sent()}>
                        {(c) => (
                          <div class="crew-cmd" classList={{ [c.status ?? "pending"]: true }} data-no-i18n>
                            <span>{crewCommandText(c.kind, c.args)}</span>
                            <b>
                              {crewStatusText(c.status)}
                              {c.result ? ` · ${t(c.result)}` : ""}
                            </b>
                          </div>
                        )}
                      </For>
                    </section>
                    </div>
                    <div class="crew-col crew-col-c">
                      <CrewRoom owner={d().owner_id} quick legacySend={(text) => void send("message", { text })} />
                    </div>
                  </>
                )}
              </Show>
            </div>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
