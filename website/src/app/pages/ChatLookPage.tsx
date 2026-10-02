// Ayarlar → Sohbet: sohbet balonlarının ve arka planının görünümü (canlı önizlemeli).
// Sadece bu kullanıcı görür; herkes kullanabilir.

import { For, Show, createSignal, type JSX } from "solid-js";
import { DEFAULT_CHAT_LOOK, settings, updateSettings, type ChatLook } from "@/sdk/settings";
import { Slider } from "../components/SettingsForm";
import { BUBBLE_PRESETS, ChatStage, GRADIENTS, SOLID_PRESETS, chatBgUrl, chatLookClass, chatLookStyle, clearChatBg, importChatBg } from "../chatLook";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote } from "../components/ProLock";
import "../friends.css";

function Row(p: { title: string; sub?: string; children: JSX.Element }) {
  return (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <Show when={p.sub}>
          <small>{p.sub}</small>
        </Show>
      </div>
      {p.children}
    </div>
  );
}

function Seg<T extends string>(p: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      <For each={p.options}>
        {(o) => (
          <button classList={{ on: p.value === o.v }} onClick={() => p.onChange(o.v)}>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Hazır renkler + serbest renk seçici; `allowDefault` ile "Varsayılan" (boş) seçeneği */
function ColorPick(p: { value: string; presets: string[]; allowDefault?: boolean; onChange: (v: string) => void }) {
  return (
    <div class="clk-colors">
      <Show when={p.allowDefault}>
        <button class="clk-sw def" classList={{ on: !p.value }} onClick={() => p.onChange("")}>
          Varsayılan
        </button>
      </Show>
      <For each={p.presets}>
        {(c) => <button class="clk-sw" classList={{ on: p.value.toLowerCase() === c }} style={{ background: c }} title={c} onClick={() => p.onChange(c)} />}
      </For>
      <input type="color" title="Özel renk" value={p.value || p.presets[0]} onInput={(e) => p.onChange(e.currentTarget.value)} />
    </div>
  );
}

const SAMPLE: { mine: boolean; text: string; first?: boolean; tail?: boolean; time?: string }[] = [
  { mine: false, text: "Selam! Akşamki yarışa geliyor musun?", first: true },
  { mine: false, text: "Spa'da GT3, 45 dakika 🏁", tail: true, time: "20:41" },
  { mine: true, text: "Gelirim, kurulumu bitiriyorum", first: true },
  { mine: true, text: "Yakıt hesabını sen yapar mısın? 😄", tail: true, time: "20:42" },
  { mine: false, text: "Tamam, pitte görüşürüz 👍", first: true, tail: true, time: "20:43" },
];

export function ChatLookPage() {
  const l = () => settings().general.chatLook;
  const set = (fn: (x: ChatLook) => void) => updateSettings((d) => fn(d.general.chatLook));
  const [err, setErr] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let file: HTMLInputElement | undefined;

  const pickFile = async (f: File) => {
    setErr("");
    setBusy(true);
    try {
      await importChatBg(f);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="page clk">
      <div>
        <ProLockNote feature={F.chatLook} text="Sohbet görünümünü değiştirmek PRO üyelere özel." class="clk-prolock" />
        <div classList={{ "prolock-dim": proLocked(F.chatLook) }} inert={proLocked(F.chatLook)}>
        <section class="panel">
          <h3>Sohbet balonları</h3>
          <p class="muted small">Arkadaş ve takım sohbetlerinin görünümü. Bu ayarları sadece sen görürsün.</p>
          <Row title="Benim balonum" sub="Yazı rengi okunur kalacak şekilde otomatik seçilir.">
            <ColorPick value={l().mine} presets={BUBBLE_PRESETS} allowDefault onChange={(v) => set((x) => (x.mine = v))} />
          </Row>
          <Row title="Arkadaşımın balonu">
            <ColorPick value={l().friend} presets={BUBBLE_PRESETS} allowDefault onChange={(v) => set((x) => (x.friend = v))} />
          </Row>
          <Row title="Balon biçimi">
            <Seg
              value={l().shape}
              options={[
                { v: "rounded", label: "Yuvarlak" },
                { v: "square", label: "Köşeli" },
                { v: "pill", label: "Hap" },
              ]}
              onChange={(v) => set((x) => (x.shape = v))}
            />
          </Row>
          <Row title="Yazı boyutu">
            <Seg
              value={l().size}
              options={[
                { v: "s", label: "Küçük" },
                { v: "m", label: "Orta" },
                { v: "l", label: "Büyük" },
              ]}
              onChange={(v) => set((x) => (x.size = v))}
            />
          </Row>
          <Row title="Balon opaklığı" sub="Arka plan görseli seçtiysen biraz saydam balonlar güzel durur.">
            <Slider value={l().opacity} min={40} max={100} step={5} unit="%" onInput={(v) => set((x) => (x.opacity = v))} />
          </Row>
        </section>

        <section class="panel">
          <h3>Sohbet arka planı</h3>
          <Row title="Arka plan">
            <Seg
              value={l().bg}
              options={[
                { v: "none", label: "Yok" },
                { v: "solid", label: "Düz renk" },
                { v: "gradient", label: "Degrade" },
                { v: "image", label: "Görsel" },
              ]}
              onChange={(v) => {
                if (v === "image" && !l().hasImg) return file?.click();
                set((x) => (x.bg = v));
              }}
            />
          </Row>
          <Show when={l().bg === "solid"}>
            <Row title="Renk">
              <ColorPick value={l().bgColor} presets={SOLID_PRESETS} onChange={(v) => set((x) => (x.bgColor = v))} />
            </Row>
          </Show>
          <Show when={l().bg === "gradient"}>
            <div class="clk-grads">
              <For each={GRADIENTS}>
                {(g) => (
                  <button class="clk-grad" classList={{ on: l().gradient === g.id }} style={{ background: g.css }} onClick={() => set((x) => (x.gradient = g.id))}>
                    {g.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={l().bg === "image" || l().hasImg}>
            <Row title="Görsel" sub="PNG, JPEG ya da WebP. En fazla 1600 piksele küçültülüp sadece bu bilgisayarda saklanır.">
              <div class="clk-img">
                <Show when={l().hasImg && chatBgUrl()}>
                  <img src={chatBgUrl()!} alt="" draggable={false} />
                </Show>
                <button class="btn ghost small" disabled={busy()} onClick={() => file?.click()}>
                  {l().hasImg ? "Değiştir" : "Dosya seç"}
                </button>
                <Show when={l().hasImg}>
                  <button class="btn ghost small danger" disabled={busy()} onClick={() => void clearChatBg()}>
                    Kaldır
                  </button>
                </Show>
              </div>
            </Row>
          </Show>
          <Show when={l().bg === "image"}>
            <Row title="Bulanıklık">
              <Slider value={l().blur} min={0} max={20} step={1} onInput={(v) => set((x) => (x.blur = v))} />
            </Row>
          </Show>
          <Show when={l().bg !== "none"}>
            <Row title="Karartma" sub="Balonlar ve yazılar her arka planda okunur kalsın.">
              <Slider value={l().dim} min={0} max={80} step={5} unit="%" onInput={(v) => set((x) => (x.dim = v))} />
            </Row>
          </Show>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void pickFile(f);
              e.currentTarget.value = "";
            }}
          />
          <Show when={busy()}>
            <p class="muted small">Yükleniyor…</p>
          </Show>
          <Show when={err()}>
            <p class="error small">{err()}</p>
          </Show>
          <div class="row">
            <span />
            <button class="btn ghost small" onClick={() => updateSettings((d) => (d.general.chatLook = { ...DEFAULT_CHAT_LOOK, hasImg: d.general.chatLook.hasImg, imgRev: d.general.chatLook.imgRev }))}>
              Varsayılana dön
            </button>
          </div>
        </section>
        </div>
      </div>

      <div class="clk-preview">
        <section class="panel">
          <h3>Önizleme</h3>
          <div class="clk-frame fx">
            <div class="clk-head">
              <i />
              <b>Örnek Arkadaş</b>
            </div>
            <div class="fchat" classList={chatLookClass(l())} style={chatLookStyle(l())}>
              <ChatStage look={l()}>
                <div class="fchat-msgs">
                  <div class="fday">
                    <span>Bugün</span>
                  </div>
                  <For each={SAMPLE}>
                    {(m) => (
                      <div class="fmsg" classList={{ mine: m.mine, first: !!m.first, tail: !!m.tail }}>
                        <p>{m.text}</p>
                        <Show when={m.time}>
                          <small>{m.time}</small>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </ChatStage>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
