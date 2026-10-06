// Sürücüler › Ekip (c53): ekibinde olduğum sürücüler ve uzaktan pit paneli.
// Solda sürücü listesi, sağda seçilen sürücünün canlı yarış verisi ve (yetki verildiyse) pit kontrolleri.
// En üstte Ekip Pitwall'ı (c58, components/CrewWall.tsx): çevredeki araçlar, spotter durumu, hazır mesajlar.
// Aynı panelin telefon sürümü web sitesindedir (website/crew.html).

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { pingLink, type PingLink } from "@/cloud/social";
import { PIT, crewCommandText, crewDriver, crewDrivers, crewFocus, setCrewFocus, crewSend, crewSimOk, crewSpotRelease, crewStatusText, type CrewCommand, type CrewDriver, type CrewKind } from "@/cloud/crew";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "../components/ProLock";
import { CrewWall } from "../components/CrewWall";
import { CrewRoom } from "../components/CrewRoom";
import { CrewRemote, type CrewViewKind } from "../components/CrewViews";
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
  /** Güvenilir arkadaşlardan çıkarıldım: beni çıkaran sürücünün adı (bilgi kutusu kapatılana kadar) */
  const [kicked, setKicked] = createSignal("");
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
  /** Sekme: pit duvarı (kontroller) ya da sürücünün gözünden salt okunur görünümler (c79) */
  const [tab, setTab] = createSignal<"wall" | CrewViewKind>("wall");
  const TABS: { id: "wall" | CrewViewKind; label: string }[] = [
    { id: "wall", label: "Pitwall" },
    { id: "timing", label: "Live Timing" },
    { id: "engineer", label: "Mühendis" },
    { id: "events", label: "Olaylar" },
  ];
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
    tab();
    fitCtl?.update();
  });

  const ivList = window.setInterval(() => !document.hidden && void refetch(), 30_000);
  onCleanup(() => clearInterval(ivList));

  // Seçili sürücü: 15 sn'de bir (sunucu "bağlı" göstergesini de bununla günceller)
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
      if (!alive || sel() !== id) return;
      const msg = String((e as Error)?.message ?? e);
      // Sürücü beni güvenilir arkadaşlarından (= ekibinden) çıkardı: bağlantı hemen kesilir ve nedeni söylenir
      if (/ekibinde değilsin/i.test(msg)) {
        setKicked((list() ?? []).find((d) => d.owner_id === id)?.display_name || drv()?.display_name || "?");
        if (full()) toggleFull();
        setSel("");
        void refetch();
        return;
      }
      setErr(msg);
    }
  };
  // Pencere görünmüyorken (simge durumunda / tepside) yoklanmaz: izlemiyorum demektir, yerim de kendiliğinden boşalır
  // 15 sn (eskiden 6 sn): canlı veri pit duvarı yayınıyla gelir; bu yoklama pit ayarlarını, "bağlı" göstergesini
  // (sunucu 45 sn tanır) ve yetkiyi tazeler. Yetkim kalkarsa sürücü "co:<ben>" haberi yollar, hemen yeniden sorulur.
  const ivDrv = window.setInterval(() => !document.hidden && void load(), 15_000);
  let outLink: PingLink | null = null;
  createEffect(() => {
    const me = uid();
    outLink?.close();
    outLink = me ? pingLink(`co:${me}`, () => void load()) : null;
  });
  onCleanup(() => outLink?.close());
  onCleanup(() => clearInterval(ivDrv));
  // c75: sürücü başına tek spotter — panelden çıkarken / başka sürücüye geçerken spotter yeri hemen bırakılır
  // (bırakılmazsa sunucu 45 sn sonra kendiliğinden boşaltır)
  let held = "";
  onCleanup(() => held && void crewSpotRelease(held).catch(() => {}));
  createEffect(
    on(sel, (id) => {
      if (held && held !== id) void crewSpotRelease(held).catch(() => {});
      held = id;
      setDrv(null);
      setSent([]);
      setErr("");
      setFx({});
      litersTouched = false;
      void load();
    }),
  );
  // ---- 10 dakikalık oturum sınırı ----
  // Ekip paneli sürekli izleme için değil, kısa müdahale içindir (sunucuya en çok yük bindiren ekran): bir sürücünün
  // paneline girilince 10 dk geri sayım başlar; süre dolunca panel kapanır ve spotter yeri bırakılır. Acil durumda
  // "Tekrar bağlan" ile yeniden girilir (sayaç baştan başlar).
  const CREW_LIMIT_MS = 10 * 60_000;
  const [until, setUntil] = createSignal(0);
  const [timedOut, setTimedOut] = createSignal(false);
  const [clock, setClock] = createSignal(Date.now());
  let lastSel = props.owner ?? "";
  createEffect(
    on(sel, (id) => {
      if (!id) return;
      lastSel = id;
      setUntil(Date.now() + CREW_LIMIT_MS);
      setClock(Date.now());
    }),
  );
  const leftSec = () => Math.max(0, Math.ceil((until() - clock()) / 1000));
  const leftText = () => `${Math.floor(leftSec() / 60)}:${String(leftSec() % 60).padStart(2, "0")}`;
  const ivLimit = window.setInterval(() => {
    setClock(Date.now());
    if (!sel() || timedOut() || Date.now() < until()) return;
    setTimedOut(true);
    if (full()) toggleFull();
    setSel("");
  }, 1000);
  onCleanup(() => clearInterval(ivLimit));
  const reconnect = () => {
    setTimedOut(false);
    const l = list() ?? [];
    const id = props.owner || (l.some((d) => d.owner_id === lastSel) ? lastSel : (l[0]?.owner_id ?? ""));
    if (id) setSel(id);
    void refetch();
  };

  // Tek sürücü varsa kendiliğinden aç
  createEffect(() => {
    const l = list();
    // Süre doldu: kullanıcı "Tekrar bağlan" diyene kadar kendiliğinden açılmaz
    if (timedOut()) return;
    // Arkadaşlar listesindeki "Ekip" düğmesinden gelindiyse o sürücü açılır
    const want = crewFocus();
    if (props.owner) return;
    if (l && want) {
      setCrewFocus(null);
      if (l.some((d) => d.owner_id === want)) return void setSel(want);
    }
    // c75: listede yalnızca yarıştaki sürücüler var; seçili sürücü yarıştan çıktıysa panel kapanır
    if (l && !l.some((d) => d.owner_id === sel())) setSel(l.length ? l[0].owner_id : "");
  });

  const data = () => drv()?.data ?? null;
  const cw = () => data()?.crew ?? null;
  const pitFlags = () => cw()?.pit?.flags ?? -1;
  const simOk = () => crewSimOk(cw()?.sim ?? drv()?.sim);
  /** c88: pit duvarını sürücü başına tek kişi izler; yer başkasındaysa hiçbir şey gösterilmez */
  const taken = () => !!drv()?.spotter_id && !drv()?.spotter_me;
  /** Komut gönderilemiyorsa sebebi (boş: gönderilebilir) */
  const blocked = createMemo(() => {
    const d = drv();
    if (!d) return t("Yükleniyor…");
    if (d.spotter_id && !d.spotter_me) return t("{0} şu an bu sürücünün spotter'ı. Pit duvarını aynı anda tek kişi izleyebilir; yer boşalınca sana geçer.", d.spotter_name || "?");
    if (!d.can_control) return t("Bu sürücü sana sadece izleme yetkisi verdi.");
    if (d.spotter_me === false) return t("Sürücü şu an yarışta değil ya da veri göndermiyor.");
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
            <Show when={proLocked(F.crewWatch)}>
              <ProLockNote text="Arkadaşının yarışını canlı izlemek ve spotter olmak PRO üyelere özel." />
            </Show>
            <p class="muted">
              Şu an yarışta olan ve seni ekibine eklemiş bir arkadaşın yok. Burada yalnızca o an yarışta olan arkadaşların listelenir; yarıştan
              çıkan sürücü listeden düşer ve ekip odasının sohbeti silinir. Pit ayarlarını değiştirme izni verdiyse girip yakıt ve lastik ayarlarını
              yönetebilirsin (sürücü başına tek spotter: yer doluysa sadece izlersin). Arkadaşın seni Ayarlar › Paylaşım › Ekip bölümünden ekibine
              ekler. Aynı panel telefonda web sitesinin Ekip sayfasında da açılır.
            </p>
          </section>
        </Show>
        <Show when={kicked()}>
          <section class="panel crew-timeout">
            <h3>Bağlantın kesildi</h3>
            <p>{t("{0} seni güvenilir arkadaşlarından çıkardı. Ekip paneline erişimin kaldırıldı ve bağlantın kesildi.", kicked())}</p>
            <button class="btn" onClick={() => setKicked("")}>
              Tamam
            </button>
          </section>
        </Show>
        <Show when={timedOut()}>
          <section class="panel crew-timeout">
            <h3>Ekip paneli kapandı</h3>
            <p>
              10 dakikalık süre doldu ve bağlantın kesildi. Spotter takibine oyunun içinden devam et. Acil durumlarda buraya tekrar bağlanıp
              işlem yapabilirsin; ancak yarışı uzun süre buradan takip etmemeyi tercih et.
            </p>
            <button class="btn primary" onClick={reconnect}>
              Tekrar bağlan
            </button>
          </section>
        </Show>
        <Show when={!timedOut() && ((list() ?? []).length > 0 || !!props.owner)}>
          <div class="crew-wrap">
            <div class="crew-list" classList={{ hide: !!props.owner || (list() ?? []).length < 2 }}>
              <For each={list() ?? []}>
                {(d) => (
                  <button class="crew-drv" classList={{ on: sel() === d.owner_id, live: d.live, viewonly: !d.can_control }} onClick={() => (setTimedOut(false), setSel(d.owner_id))}>
                    <b data-no-i18n>{d.display_name || "?"}</b>
                    <small data-no-i18n>{sub(d)}</small>
                    <small classList={{ "spot-me": !!d.spotter_me, "spot-other": !!d.spotter_id && !d.spotter_me }} data-no-i18n>
                      {d.spotter_me
                        ? t("Spotter: sen")
                        : d.spotter_id
                          ? t("Spotter: {0}", d.spotter_name || "?")
                          : !d.can_control
                            ? t("Sadece izleme")
                            : t("Pit kontrolü")}
                    </small>
                  </button>
                )}
              </For>
            </div>
            <div class="crew-fitbox" ref={fitOuter}>
              <div class="crew-view">
                <span class="seg crew-tabs">
                  <For each={TABS}>
                    {(x) => (
                      <button classList={{ on: tab() === x.id }} onClick={() => setTab(x.id)} data-no-i18n={x.id === "wall" || x.id === "timing" ? "" : undefined}>
                        {x.id === "wall" || x.id === "timing" ? x.label : t(x.label)}
                      </button>
                    )}
                  </For>
                </span>
                <button class="btn ghost small" classList={{ on: fit() }} onClick={toggleFit} title="Kaydırmaya gerek kalmadan tüm panel ekrana sığacak şekilde ölçeklenir">
                  Ekrana sığdır
                </button>
                <button class="btn ghost small" classList={{ on: full() }} onClick={toggleFull} title="Menüler gizlenir, ekip paneli tüm ekranı kaplar (çıkmak için Esc)">
                  {full() ? t("Tam ekrandan çık") : t("Tam ekran")}
                </button>
                <Show when={sel()}>
                  <span
                    class="crew-left"
                    classList={{ soon: leftSec() <= 60 }}
                    title={t("Ekip paneli 10 dakika sonra kendiliğinden kapanır. Spotter takibine oyunun içinden devam et; acil durumda tekrar bağlanabilirsin.")}
                  >
                    {t("Kalan süre")} <b data-no-i18n>{leftText()}</b>
                  </span>
                </Show>
              </div>
            <Show when={taken()}>
              <section class="panel">
                <h3 data-no-i18n>{drv()?.display_name || "?"}</h3>
                <p class="pg-lock">
                  <Ic n="lock" />
                  <span>{blocked()}</span>
                </p>
              </section>
            </Show>
            <Show when={tab() !== "wall" && drv() && !taken()}>
              <CrewRemote
                owner={sel()}
                name={drv()?.display_name || "?"}
                view={tab() as CrewViewKind}
                track={data()?.track || drv()?.track}
                sim={cw()?.sim || drv()?.sim}
                car={data()?.car || drv()?.car}
              />
            </Show>
            <div class="crew-main c3" ref={mountFit} style={{ display: (tab() === "wall" || !drv()) && !taken() ? undefined : "none" }}>
              <Show when={(tab() === "wall" || !drv()) && !taken() ? drv() : null} fallback={<p class="muted">{err() ? t(err()) : t("Yükleniyor…")}</p>}>
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
                      <Show when={d().can_control && d().spotter_me}>
                        <p class="crm-spot me">
                          <Ic n="wrench" />
                          <span>{t("Spotter: sen")}</span>
                        </p>
                      </Show>
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
