// Ayarlar › Sohbet: sohbet mesajlarının yazı boyutu (arkadaş, takım ve grup sohbetleri). Hesapla birlikte taşınır.
import { For, Show } from "solid-js";
import { linkPreviewOn, setLinkPreviewOn } from "../components/LinkPreview";
import { Switch } from "../components/SettingsForm";
import { friendsDock, setFriendsDock } from "../components/FriendsDock";
import { inTauri } from "@/sdk/platform";
import { invoke } from "@tauri-apps/api/core";
import { CHAT_FAMILIES, CHAT_FONT_MAX, CHAT_FONT_MIN, chatFamily, chatFont, chatFontVars, setChatFamily, setChatFont } from "../chatLook";

const SAMPLE: [string, string, string][] = [
  ["Ayşe", "20:14", "Bu akşam Spa'da yarış var, geliyor musun?"],
  ["Sen", "20:15", "Geliyorum, 10 dakikaya pistteyim 🏁"],
];

export function ChatLookPage() {
  return (
    <div class="page narrow">
      <section class="panel">
        <h3>Sohbet</h3>
        <p class="muted small">Sohbet mesajlarının yazı boyutu ve yazı tipi. Arkadaş, takım ve grup sohbetlerinde geçerlidir; arkadaş listesi de aynı oranda büyür.</p>
        <label class="field">
          <span>
            Mesaj yazı boyutu: <b data-no-i18n>{chatFont()} px</b>
          </span>
          <input type="range" min={CHAT_FONT_MIN} max={CHAT_FONT_MAX} step={1} value={chatFont()} onInput={(e) => setChatFont(Number(e.currentTarget.value))} />
        </label>
        <label class="field">
          <span>Yazı tipi</span>
          <select class="input" value={chatFamily()} onChange={(e) => setChatFamily(e.currentTarget.value)}>
            <For each={CHAT_FAMILIES}>{(f) => (f.id ? <option value={f.id} data-no-i18n>{f.label}</option> : <option value="">Varsayılan</option>)}</For>
          </select>
        </label>
        <div class="row">
          <div>
            <span>Bağlantı önizlemesi</span>
            <small>
              Mesajdaki bağlantının başlığı, açıklaması ve görseli mesajın altında gösterilir (YouTube, haberler, resimler…). Sayfa bilgisi
              uygulama tarafından indirilir; yerel ağ adresleri önizlenmez. Bağlantılar her zaman tıklanabilir.
            </small>
          </div>
          <Switch checked={linkPreviewOn()} onChange={setLinkPreviewOn} />
        </div>
        <Show when={inTauri}>
          <div class="row">
            <div>
              <span>Arkadaşlar penceresi ana pencerenin sağına yapışsın</span>
              <small>
                Üst çubuktaki Arkadaşlar düğmesine basınca sohbet penceresi uygulamanın sağ kenarında, onunla aynı boyda açılır ve uygulamayı taşıyınca
                peşinden gelir. Pencereyi tutup başka yere taşırsan o seferlik ayrılır.
              </small>
            </div>
            <Switch
              checked={friendsDock()}
              onChange={(v) => {
                setFriendsDock(v);
                void invoke("friends_dock_set", { on: v, fill: true }).catch(() => {});
              }}
            />
          </div>
        </Show>
        <div class="fx">
          <div class="fchat stm clp-sample" style={chatFontVars()}>
            <For each={SAMPLE}>
              {([who, time, body], i) => (
                <div class="fmsg first" classList={{ mine: i() === 1 }} style={{ "padding-left": "14px" }}>
                  <div class="fmsg-head">
                    <b>{who}</b>
                    <small data-no-i18n>{time}</small>
                  </div>
                  <p>{body}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </section>
    </div>
  );
}
