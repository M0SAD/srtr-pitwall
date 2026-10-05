import { SimPicker } from "../components/SimPicker";
import { LANGS, t } from "@/sdk/i18n";
import { EditBackdropSettings } from "../components/Shots";
import { setUserLang } from "@/cloud/supabase";
import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import notesRaw from "../../../SURUM_NOTLARI.md?raw";
import { Notes } from "../components/Notes";
import { checkUpdate, checking, setUpdateDialog, update, updateError, version } from "../ui";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { settings, updateSettings } from "@/sdk/settings";
import { appState, setDemo } from "../App";
import { freeView, realAdmin, setFreeView } from "@/cloud/account";

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  primary: boolean;
}

export function GeneralPage() {
  const props = { get demo() { return appState().demo; }, setDemo };
  const [monitors, { refetch: refetchMonitors }] = createResource(() => invoke<MonitorInfo[]>("monitors_list"));
  // Monitör takılıp çıkarılınca liste kendiliğinden yenilenir
  const unMon = listen("monitors-changed", () => void refetchMonitors()).catch(() => undefined);
  onCleanup(() => void unMon.then((f) => f?.()));
  const g = () => settings().general;
  const [autostart, { mutate: setAutostart }] = createResource(() => invoke<boolean>("autostart_get"));
  const [autoErr, setAutoErr] = createSignal("");

  const toggleAutostart = async (on: boolean) => {
    setAutoErr("");
    try {
      setAutostart(await invoke<boolean>("autostart_set", { on }));
    } catch (e) {
      setAutoErr(String(e));
      setAutostart(!on);
    }
  };

  const setMonitor = (v: string) => {
    const index = v === "" ? null : Number(v);
    updateSettings((d) => (d.general.monitor = index));
    if (index != null) invoke("overlay_set_monitor", { index });
  };

  return (
    <div class="page narrow">
      <GeneralExtra />
      <Show when={realAdmin()}>
        <section class="panel">
          <h3>Yönetici: test görünümü</h3>
          <div class="row">
            <div>
              <b>PRO olmayan üye gibi gör</b>
              <small>
                Arayüz, overlay'ler ve kilitler PRO olmayan bir üyenin gördüğü gibi görünür (yönetim menüsü de gizlenir). Sadece
                bu bilgisayarda geçerlidir; üstteki şeritten tek tıkla kapatabilirsin.
              </small>
            </div>
            <label class="switch">
              <input type="checkbox" checked={freeView()} onChange={(e) => setFreeView(e.currentTarget.checked)} />
              <i />
            </label>
          </div>
        </section>
      </Show>
      <section class="panel">
        <h3>Başlangıç</h3>
        <div class="row">
          <div>
            <b>Windows ile başlat</b>
            <small>Bilgisayar açılınca SRTR Pitwall arka planda, sistem tepsisinde başlar; arayüz açılmaz.</small>
          </div>
          <label class="switch">
            <input type="checkbox" checked={!!autostart()} onChange={(e) => toggleAutostart(e.currentTarget.checked)} />
            <i />
          </label>
        </div>
        <Show when={autoErr()}>
          <p class="error">{autoErr()}</p>
        </Show>
      </section>

      <section class="panel">
        <h3>Görüntü</h3>
        <div class="row">
          <div>
            <b>Oyun</b>
            <small>Otomatik: açık olan oyun kendiliğinden algılanır. Yalnızca birden çok oyun aynı anda açıksa ya da yanlış oyun algılanıyorsa elle seç.</small>
          </div>
          <SimPicker />
        </div>
        <div class="row">
          <div>
            <b>Overlay monitörü</b>
            <small>Overlay'lerin çizileceği ekran. iRacing'in çalıştığı monitörü seç.</small>
          </div>
          <select value={g().monitor ?? ""} onChange={(e) => setMonitor(e.currentTarget.value)}>
            <option value="">Ana monitör</option>
            <For each={monitors() ?? []}>
              {(m) => (
                <option value={m.index} selected={g().monitor === m.index}>
                  {m.name} — {m.width}×{m.height}
                  {m.primary ? " (ana)" : ""}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="row">
          <div>
            <b>Birimler</b>
            <small>Hız, yakıt ve sıcaklık gösterimi.</small>
          </div>
          <select value={g().units} onChange={(e) => updateSettings((d) => (d.general.units = e.currentTarget.value as any))}>
            <option value="metric">Metrik (km/h, L, °C)</option>
            <option value="imperial">Imperial (mph, gal, °F)</option>
          </select>
        </div>
        <div class="row">
          <div>
            <b>Pistte değilken gizle</b>
            <small>Garajda, menüde veya tekrar izlerken overlay'leri gizler.</small>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={g().hideWhenOffTrack}
              onChange={(e) => updateSettings((d) => (d.general.hideWhenOffTrack = e.currentTarget.checked))}
            />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>Replay izlerken overlay'leri gizle</b>
            <small>Tekrar oynatılırken (iRacing, ACC, LMU/rF2, AMS2) overlay'ler kendiliğinden gizlenir, canlıya dönünce geri gelir.</small>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={g().hideInReplay !== false}
              onChange={(e) => updateSettings((d) => (d.general.hideInReplay = e.currentTarget.checked))}
            />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>Demo modu</b>
            <small>iRacing açık değilken overlay'leri sahte yarış verisiyle gösterir.</small>
          </div>
          <label class="switch">
            <input type="checkbox" checked={props.demo} onChange={(e) => props.setDemo(e.currentTarget.checked)} />
            <i />
          </label>
        </div>
      </section>

      <section class="panel">
        <h3>Düzenleme ekranı</h3>
        <div class="row">
          <div>
            <b>Izgaraya yapıştır</b>
            <small>Taşırken overlay'ler ızgara çizgilerine hizalanır.</small>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={g().snapToGrid}
              onChange={(e) => updateSettings((d) => (d.general.snapToGrid = e.currentTarget.checked))}
            />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>Izgara aralığı</b>
          </div>
          <select value={g().gridSize} onChange={(e) => updateSettings((d) => (d.general.gridSize = Number(e.currentTarget.value)))}>
            <For each={[5, 10, 20, 40]}>{(n) => <option value={n} selected={g().gridSize === n}>{n} px</option>}</For>
          </select>
        </div>
        <div class="row">
          <div>
            <b>Kenarlara yapıştır</b>
            <small>Ekranın ve diğer overlay'lerin kenar/orta çizgilerine hizalar, kılavuz çizgisi gösterir.</small>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={g().snapToEdges}
              onChange={(e) => updateSettings((d) => (d.general.snapToEdges = e.currentTarget.checked))}
            />
            <i />
          </label>
        </div>
        <EditBackdropSettings />
        <p class="muted">
          Taşırken <kbd>Alt</kbd> tuşunu basılı tutarsan yapıştırma geçici olarak kapanır. Overlay'ler ekran dışına
          taşınamaz.
        </p>
      </section>


      <section class="panel">
        <h3>Önemli</h3>
        <p class="muted">
          Overlay'lerin oyunun üstünde görünmesi için iRacing'i <b>Kenarlıksız pencere (Borderless / Windowed Fullscreen)</b>{" "}
          modunda çalıştır. Özel tam ekran modunda Windows başka pencerelerin üstte görünmesine izin vermez.
        </p>
        <Show when={g().monitor != null && monitors() && !monitors()!.some((m) => m.index === g().monitor)}>
          <p class="muted warn">Seçili monitör bulunamadı, ana monitör kullanılıyor.</p>
        </Show>
      </section>
    </div>
  );
}

export function About() {
  return (
    <section class="panel">
      <h3>Hakkında</h3>
      <div class="row">
        <div>
          <b class="nowrap">SRTR Pitwall {version()?.display}</b>
          <small>Paket sürümü {version()?.semver}</small>
        </div>
        <Show
          when={version()?.updateConfigured}
          fallback={<small class="muted">Bu derlemede otomatik güncelleme yapılandırılmamış (bkz. docs/GUNCELLEME.md)</small>}
        >
          <div class="btns">
            <Show
              when={update()?.available}
              fallback={
                <button class="btn ghost" disabled={checking()} onClick={() => checkUpdate(true)}>
                  {checking() ? "Denetleniyor…" : "Güncellemeleri denetle"}
                </button>
              }
            >
              <button class="btn primary" onClick={() => setUpdateDialog(true)}>
                {t("{0} sürümüne güncelle", update()!.version)}
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <Show when={update() && update()!.configured && !update()!.available && !checking()}>
        <p class="muted">En güncel sürümü kullanıyorsun.</p>
      </Show>
      <Show when={update()?.available && update()!.notes}>
        <div class="notes">
          <b>Yeni sürümdeki değişiklikler</b>
          <Notes text={update()!.notes!} />
        </div>
      </Show>
      <Show when={updateError()}>
        <p class="error">{updateError()}</p>
      </Show>
      <details class="notes">
        <summary>Sürüm notları</summary>
        <Notes text={notesRaw.replace(/^# .*\n/, "")} />
      </details>
    </section>
  );
}

export { Notes };

/** Edge'deki genel seçenekler: pencere davranışı, saat, birim ayrıntıları, arka plan */
function GeneralExtra() {
  const g = () => settings().general;
  const set = (fn: (d: ReturnType<typeof settings>["general"]) => void) => updateSettings((d) => fn(d.general));
  const Row = (p: { title: string; sub: string; on: boolean; onChange: (v: boolean) => void }) => (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <small>{p.sub}</small>
      </div>
      <label class="switch">
        <input type="checkbox" checked={p.on} onChange={(e) => p.onChange(e.currentTarget.checked)} />
        <i />
      </label>
    </div>
  );
  return (
    <>
    <section class="panel">
      <h3>Dil</h3>
      <div class="row">
        <div>
          <b>Arayüz dili</b>
          <small>E-postalar da bu dilde gönderilir.</small>
        </div>
        <select
          class="input lang-select"
          data-no-i18n
          value={g().language}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set((x) => (x.language = v));
            void setUserLang(v);
          }}
        >
          <For each={LANGS}>{(l) => <option value={l.code}>{l.name}</option>}</For>
        </select>
      </div>
    </section>
    <section class="panel">
      <h3>Pencere davranışı</h3>
      <Row
        title="Bağlanınca paneli küçült"
        sub="iRacing bağlandığında kontrol paneli tepsiye iner."
        on={g().minimizeOnConnect}
        onChange={(v) => set((x) => (x.minimizeOnConnect = v))}
      />
      <Row
        title="Yarış bitince Olaylar ekranını aç"
        sub="Yarış bitince ve tekrar (replay) başlayınca Olaylar penceresi açılır; bir olaya tıklayınca iRacing tekrarı o ana gider."
        on={g().eventsAutoOpen}
        onChange={(v) => set((x) => (x.eventsAutoOpen = v))}
      />
      <Row
        title="Oyuna odağı geri ver"
        sub="Düzenleme kilidini kapatınca iRacing penceresi yeniden öne alınır."
        on={g().returnFocus}
        onChange={(v) => set((x) => (x.returnFocus = v))}
      />
      <div class="row">
        <div>
          <b>Saat biçimi</b>
          <small>Gerçek saat gösterimleri</small>
        </div>
        <div class="seg">
          <button classList={{ on: g().timeFormat === "24" }} onClick={() => set((x) => (x.timeFormat = "24"))}>
            24 saat
          </button>
          <button classList={{ on: g().timeFormat === "12" }} onClick={() => set((x) => (x.timeFormat = "12"))}>
            12 saat
          </button>
        </div>
      </div>
      <Row title="Hız her zaman mph" sub="Diğer değerler metrik kalsa da hız mph gösterilir." on={g().speedMph} onChange={(v) => set((x) => (x.speedMph = v))} />
      <div class="row">
        <div>
          <b>Overlay arka planı</b>
          <small>Şeffaf ya da tamamen opak paneller</small>
        </div>
        <div class="seg">
          <button classList={{ on: !g().opaque }} onClick={() => set((x) => (x.opaque = false))}>
            Şeffaf
          </button>
          <button classList={{ on: g().opaque }} onClick={() => set((x) => (x.opaque = true))}>
            Opak
          </button>
        </div>
      </div>
    </section>
    </>
  );
}
