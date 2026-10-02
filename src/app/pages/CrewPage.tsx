// Sürücüler › Ekip (c53): ekibinde olduğum sürücüler ve uzaktan pit paneli.
// Solda sürücü listesi, sağda seçilen sürücünün canlı yarış verisi ve (yetki verildiyse) pit kontrolleri.
// Aynı panelin telefon sürümü web sitesindedir (website/crew.html).

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { lapTime } from "@/sdk/format";
import { session } from "@/cloud/supabase";
import { PIT, crewCommandText, crewDriver, crewDrivers, crewSend, crewSimOk, crewStatusText, type CrewCommand, type CrewDriver, type CrewKind } from "@/cloud/crew";
import "../crew.css";

const SIM_NAMES: Record<string, string> = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "AMS2" };
const CORNERS = [
  { k: "lf", bit: PIT.lf, label: "Sol ön" },
  { k: "rf", bit: PIT.rf, label: "Sağ ön" },
  { k: "lr", bit: PIT.lr, label: "Sol arka" },
  { k: "rr", bit: PIT.rr, label: "Sağ arka" },
] as const;

function remain(sec: number | undefined, laps: number | undefined): string {
  if (laps != null && laps >= 0 && laps < 32000) return t("{0} tur", String(laps));
  if (sec == null || sec < 0 || sec > 600_000) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function flagText(f: number | undefined): string {
  if (!f) return "";
  if (f & 0x1) return t("Damalı bayrak");
  if (f & 0x10) return t("Kırmızı bayrak");
  if (f & (0x4000 | 0x8000)) return t("Güvenlik aracı");
  if (f & (0x8 | 0x100)) return t("Sarı bayrak");
  if (f & 0x2) return t("Son tur");
  return "";
}

export function CrewPage() {
  const uid = () => session()?.user.id;
  const [list, { refetch }] = createResource(uid, () => crewDrivers().catch(() => null as CrewDriver[] | null));
  const [sel, setSel] = createSignal("");
  const [drv, setDrv] = createSignal<CrewDriver | null>(null);
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal<CrewCommand[]>([]);
  const [liters, setLiters] = createSignal(40);
  const [msg, setMsg] = createSignal("");

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
      void load();
    }),
  );
  // Tek sürücü varsa kendiliğinden aç
  createEffect(() => {
    const l = list();
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

  const send = async (kind: CrewKind, args: Record<string, unknown> = {}) => {
    const id = sel();
    if (!id) return;
    setErr("");
    try {
      await crewSend(id, kind, args, (c) => setSent((l) => [c, ...l.filter((x) => x.id !== c.id)].slice(0, 8)));
      void load();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  };
  const corner = (bit: number) => pitFlags() >= 0 && (pitFlags() & bit) !== 0;
  const toggleCorner = (k: string) => {
    const cur: Record<string, boolean> = {};
    for (const c of CORNERS) cur[c.k] = corner(c.bit);
    cur[k] = !cur[k];
    void send("tyres", cur);
  };
  const toFinish = () => Math.max(0, cw()?.toFinish ?? data()?.refuel ?? 0);
  const fuelToEnd = () => (toFinish() > 0 ? send("fuel_set", { liters: Math.ceil(toFinish()) }) : send("fuel_clear"));
  const sendMsg = () => {
    const text = msg().trim();
    if (!text) return;
    setMsg("");
    void send("message", { text });
  };

  const sub = (d: CrewDriver) => {
    if (d.live) return t("Canlı") + (d.track ? ` · ${d.track}` : "");
    if (d.racing) return t("Yarışta") + (d.track ? ` · ${d.track}` : "");
    return d.online ? t("Çevrimiçi") : t("Çevrimdışı");
  };

  return (
    <div class="page crewp">
      <Show when={session()} fallback={<p class="muted">Bu özellik için hesabına giriş yapmalısın.</p>}>
        <Show when={list() === null}>
          <p class="muted">Ekip listesi okunamadı. Daha sonra tekrar dene.</p>
        </Show>
        <Show when={!list.loading && list() && list()!.length === 0}>
          <section class="panel">
            <h3>Ekip</h3>
            <p class="muted">
              Henüz kimsenin ekibinde değilsin. Bir arkadaşın Ayarlar › Paylaşım › Ekip bölümünden seni ekibine eklediğinde burada görünür; yarışırken
              yakıtını, turlarını ve pit servisini izleyebilir, izin verdiyse pit ayarlarını uzaktan değiştirebilirsin. Aynı panel telefonda web
              sitesinin Ekip sayfasında da açılır.
            </p>
          </section>
        </Show>
        <Show when={(list() ?? []).length > 0}>
          <div class="crew-wrap">
            <div class="crew-list">
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
            <div class="crew-main">
              <Show when={drv()} fallback={<p class="muted">{err() ? t(err()) : t("Yükleniyor…")}</p>}>
                {(d) => (
                  <>
                    <section class="panel">
                      <h3 data-no-i18n>
                        {d().display_name || "?"}
                        <span class="crew-live" classList={{ on: d().live }}>
                          {d().live ? t("Canlı") : d().racing ? t("Yarışta") : d().online ? t("Çevrimiçi") : t("Çevrimdışı")}
                        </span>
                      </h3>
                      <p class="muted small" data-no-i18n>
                        {[SIM_NAMES[cw()?.sim || d().sim] ?? "", data()?.track || d().track, data()?.car || d().car, data()?.session || d().session].filter(Boolean).join(" · ") || "—"}
                        <Show when={flagText(cw()?.flags)}>
                          {" · "}
                          <b class="warn">{flagText(cw()?.flags)}</b>
                        </Show>
                      </p>
                      <Show when={data()} fallback={<p class="muted">Sürücü şu an veri göndermiyor. Yarışa girdiğinde burası kendiliğinden dolar.</p>}>
                        <Show when={!d().live}>
                          <p class="muted small">Aşağıdaki veri son alınan veridir (sürücü şu an göndermiyor).</p>
                        </Show>
                        <div class="crew-grid">
                          <div class="crew-stat">
                            <small>Sıra</small>
                            <b data-no-i18n>
                              {data()!.position ? `P${data()!.position}` : "—"}
                              <Show when={cw()?.classPos}>
                                <i> / {t("sınıf")} P{cw()!.classPos}</i>
                              </Show>
                            </b>
                          </div>
                          <div class="crew-stat">
                            <small>Tur</small>
                            <b data-no-i18n>{data()!.lap ?? "—"}</b>
                          </div>
                          <div class="crew-stat">
                            <small>Kalan</small>
                            <b data-no-i18n>{remain(cw()?.timeRemain, cw()?.lapsRemain)}</b>
                          </div>
                          <div class="crew-stat">
                            <small>Son tur</small>
                            <b data-no-i18n>{lapTime(data()!.last)}</b>
                          </div>
                          <div class="crew-stat">
                            <small>En iyi tur</small>
                            <b data-no-i18n>{lapTime(data()!.best)}</b>
                          </div>
                          <div class="crew-stat">
                            <small>Olay puanı</small>
                            <b data-no-i18n>{cw() ? `${cw()!.inc}x` : "—"}</b>
                          </div>
                          <div class="crew-stat" classList={{ warn: !!data()!.onPit }}>
                            <small>Konum</small>
                            <b>{cw()?.stall ? t("Pit kutusunda") : data()!.onPit ? t("Pit yolunda") : t("Pistte")}</b>
                          </div>
                        </div>
                      </Show>
                    </section>
                    <Show when={data()}>
                      <section class="panel">
                        <h3>Yakıt</h3>
                        <div class="crew-grid">
                          <div class="crew-stat">
                            <small>Depo</small>
                            <b data-no-i18n>{(data()!.level ?? 0).toFixed(1)} L</b>
                          </div>
                          <div class="crew-stat">
                            <small>Tur başı</small>
                            <b data-no-i18n>{data()!.usage > 0 ? `${data()!.usage.toFixed(2)} L` : "—"}</b>
                          </div>
                          <div class="crew-stat">
                            <small>Depoyla gidilecek tur</small>
                            <b data-no-i18n>{data()!.lapsLeft > 0 ? data()!.lapsLeft.toFixed(1) : "—"}</b>
                          </div>
                          <div class="crew-stat">
                            <small>Yarışın bitmesine</small>
                            <b data-no-i18n>{cw()?.raceLaps ? t("{0} tur", cw()!.raceLaps.toFixed(1)) : "—"}</b>
                          </div>
                          <div class="crew-stat" classList={{ warn: toFinish() > 0 }}>
                            <small>Bitiş için eklenecek</small>
                            <b data-no-i18n>{toFinish() > 0 ? `${toFinish().toFixed(1)} L` : t("Yeterli")}</b>
                          </div>
                        </div>
                      </section>
                      <section class="panel">
                        <h3>Pit servisi (şu an ayarlı)</h3>
                        <Show when={pitFlags() >= 0} fallback={<p class="muted small">Bu oyun pit servisi ayarlarını bildirmiyor.</p>}>
                          <div class="crew-grid">
                            <div class="crew-stat" classList={{ onb: (pitFlags() & PIT.fuel) !== 0 }}>
                              <small>Yakıt</small>
                              <b data-no-i18n>{pitFlags() & PIT.fuel ? `+${(cw()!.pit.fuel ?? 0).toFixed(0)} L` : t("Eklenmeyecek")}</b>
                            </div>
                            <div class="crew-stat" classList={{ onb: (pitFlags() & PIT.tyres) !== 0 }}>
                              <small>Lastik</small>
                              <b>
                                {(pitFlags() & PIT.tyres) === PIT.tyres
                                  ? t("4 lastik")
                                  : (pitFlags() & PIT.tyres) === 0
                                    ? t("Değişmeyecek")
                                    : CORNERS.filter((c) => corner(c.bit))
                                        .map((c) => t(c.label))
                                        .join(", ")}
                              </b>
                            </div>
                            <div class="crew-stat" classList={{ onb: (pitFlags() & PIT.fastRepair) !== 0 }}>
                              <small>Hızlı tamir</small>
                              <b>
                                {pitFlags() & PIT.fastRepair ? t("Açık") : t("Kapalı")}
                                <Show when={(cw()?.pit.fr ?? -1) >= 0}>
                                  <i data-no-i18n> ({t("{0} hak", String(cw()!.pit.fr))})</i>
                                </Show>
                              </b>
                            </div>
                            <div class="crew-stat" classList={{ onb: (pitFlags() & PIT.tearoff) !== 0 }}>
                              <small>Vizör filmi</small>
                              <b>{pitFlags() & PIT.tearoff ? t("Açık") : t("Kapalı")}</b>
                            </div>
                          </div>
                        </Show>
                        <Show when={(cw()?.wear ?? []).some((x) => x >= 0)}>
                          <p class="muted small" style={{ "margin-top": "10px" }}>
                            Lastikler (kalan diş · sıcaklık; iRacing bunları sadece pitte günceller)
                          </p>
                          <div class="crew-tyres" data-no-i18n>
                            <For each={CORNERS}>
                              {(c, i) => (
                                <div>
                                  <small>{t(c.label)}</small>
                                  <b>
                                    {cw()!.wear[i()] >= 0 ? `${cw()!.wear[i()]}%` : "—"} · {cw()!.temp[i()] > 0 ? `${cw()!.temp[i()]}°C` : "—"}
                                  </b>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </section>
                    </Show>
                    <section class="panel">
                      <h3>Pit kontrolü</h3>
                      <Show when={blocked()}>
                        <p class="muted small">{blocked()}</p>
                      </Show>
                      <fieldset class="crew-ctl" disabled={!!blocked()}>
                        <div class="crew-line">
                          <span>Yakıt</span>
                          <button class="btn ghost small" onClick={() => setLiters(Math.max(1, liters() - 5))}>
                            −5
                          </button>
                          <button class="btn ghost small" onClick={() => setLiters(Math.max(1, liters() - 1))}>
                            −1
                          </button>
                          <input class="input crew-num" type="number" min="1" max="1000" value={liters()} onInput={(e) => setLiters(Math.min(1000, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))} />
                          <button class="btn ghost small" onClick={() => setLiters(Math.min(1000, liters() + 1))}>
                            +1
                          </button>
                          <button class="btn ghost small" onClick={() => setLiters(Math.min(1000, liters() + 5))}>
                            +5
                          </button>
                          <button class="btn primary small" onClick={() => send("fuel_set", { liters: liters() })}>
                            {t("{0} L ayarla", String(liters()))}
                          </button>
                        </div>
                        <div class="crew-line">
                          <span />
                          <button class="btn ghost small" onClick={fuelToEnd}>
                            {toFinish() > 0 ? t("Yarış sonuna kadar yakıt ({0} L)", String(Math.ceil(toFinish()))) : t("Yarış sonuna kadar yakıt")}
                          </button>
                          <button class="btn ghost small" onClick={() => send("fuel_clear")}>
                            Yakıt ekleme
                          </button>
                        </div>
                        <div class="crew-line">
                          <span>Lastik</span>
                          <For each={CORNERS}>
                            {(c) => (
                              <button class="btn small" classList={{ ghost: !corner(c.bit), primary: corner(c.bit) }} onClick={() => toggleCorner(c.k)}>
                                {t(c.label)}
                              </button>
                            )}
                          </For>
                          <button class="btn ghost small" onClick={() => send("tyres_all")}>
                            4 lastik
                          </button>
                          <button class="btn ghost small" onClick={() => send("tyres_clear")}>
                            Hiçbiri
                          </button>
                        </div>
                        <div class="crew-line">
                          <span>Diğer</span>
                          <button class="btn small" classList={{ ghost: !corner(PIT.fastRepair), primary: corner(PIT.fastRepair) }} onClick={() => send("fast_repair", { on: !corner(PIT.fastRepair) })}>
                            Hızlı tamir
                          </button>
                          <button class="btn small" classList={{ ghost: !corner(PIT.tearoff), primary: corner(PIT.tearoff) }} onClick={() => send("tearoff", { on: !corner(PIT.tearoff) })}>
                            Vizör filmi
                          </button>
                          <button class="btn danger small" onClick={() => send("clear_all")}>
                            Tümünü temizle
                          </button>
                        </div>
                      </fieldset>
                      <fieldset class="crew-ctl" disabled={!d().live}>
                        <div class="crew-line">
                          <span>Mesaj</span>
                          <input
                            class="input crew-msg"
                            maxLength={120}
                            placeholder={t("Sürücüye kısa mesaj (ekranında görünür)")}
                            value={msg()}
                            onInput={(e) => setMsg(e.currentTarget.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                          />
                          <button class="btn ghost small" onClick={sendMsg}>
                            Gönder
                          </button>
                        </div>
                      </fieldset>
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
                  </>
                )}
              </Show>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
