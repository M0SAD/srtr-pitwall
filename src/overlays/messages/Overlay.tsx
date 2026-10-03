import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { inTauri } from "@/sdk/platform";
import { OVMSG_CLEAR_EVENT, OVMSG_EVENT, ovMsgAccepts, ovMsgSpeaks, registerOvMsgFilter, type OvMsg } from "@/sdk/ovmsg";
import "./style.css";

interface Item {
  m: OvMsg;
  at: number;
}

const SAMPLE: OvMsg[] = [
  { id: "s1", kind: "friend", from: "a", peer: "a", name: "Örnek Arkadaş", color: "#2ec4b6", body: "Pitte görüşürüz 👍", mine: false, ts: 0 },
  { id: "s2", kind: "team", from: "b", peer: "t", name: "Takım Arkadaşı", color: "#a970ff", team: "[SRTR]", body: "Yakıt 2 tur daha yetiyor", mine: false, ts: 0 },
  { id: "s4", kind: "crew", from: "c", peer: "me", name: "Pit Ekibi", color: "#ffb341", team: "Ekip", body: "Bu tur pit, yakıt ayarlandı", mine: false, ts: 0 },
  { id: "s3", kind: "friend", from: "me", peer: "a", name: "Sen", color: "#ff8a2a", body: "Tamam, bu tur giriyorum", mine: true, ts: 0 },
];

/**
 * Mesajı sesli oku: canlı sohbetin sesli okuma kuyruğu (PRO: social.messages_tts). Ekip odası mesajı ayrı seçilen
 * sesle (`crewVoice`; boş: canlı sohbetin sesi) okunur. Rust (livechat/tts.rs social_tts_speak) aynı mesaj kimliğini
 * ikinci kez sıraya almaz: birden fazla kopya / pencere aynı mesajı okumak istese de mesaj bir kez okunur.
 */
function speak(m: OvMsg, o: Record<string, any>) {
  invoke("social_tts_speak", {
    id: m.id,
    name: m.name,
    text: m.body,
    readName: o.ttsName !== false,
    maxChars: Number(o.ttsMax) || 200,
    voice: m.kind === "crew" ? String(o.crewVoice ?? "") || null : null,
  }).catch(() => {});
}

const initial = (s: string) => (Array.from(s.trim())[0] ?? "?").toLocaleUpperCase("tr");

export default function Messages(props: OverlayProps) {
  const o = () => props.options;
  const [items, setItems] = createSignal<Item[]>([]);
  const [now, setNow] = createSignal(Date.now());
  // Ekranda kalma süresi: elle yazılan sayı + birim (varsayılan 3 dakika); 3 sn – 60 dk
  const life = () => {
    const n = parseFloat(String(o().lifeValue ?? "3").replace(",", "."));
    const sec = (isFinite(n) && n > 0 ? n : 3) * (o().lifeUnit === "sec" ? 1 : 60);
    return Math.max(3, Math.min(3600, sec)) * 1000;
  };
  const maxN = () => Math.max(1, Math.min(10, Number(o().maxVisible) || 4));

  // Ayara uyan mesajlar burada gösterilir; oyun içi bildirim kutusu ayrıca çıkmaz
  onCleanup(registerOvMsgFilter((m) => ovMsgAccepts(o(), m)));

  onMount(() => {
    if (!inTauri) return;
    let un: (() => void) | undefined;
    let dead = false;
    void listen<OvMsg>(OVMSG_EVENT, (e) => {
      const m = e.payload;
      if (!m || !ovMsgAccepts(o(), m)) return;
      if (items().some((x) => x.m.id === m.id)) return;
      // Sesli okuma: arkadaş ve ekip mesajları ayrı ayrı seçilir (kopyaya özel)
      if (ovMsgSpeaks(o(), m)) speak(m, o());
      const t = Date.now();
      setNow(t);
      setItems([...items(), { m, at: t }].slice(-maxN()));
    }).then((f) => (dead ? f() : (un = f)));
    // Çıkış yapıldı / hesap değişti: önceki hesabın mesajları ekranda kalmasın
    let unClear: (() => void) | undefined;
    void listen(OVMSG_CLEAR_EVENT, () => setItems([])).then((f) => (dead ? f() : (unClear = f)));
    onCleanup(() => {
      dead = true;
      un?.();
      unClear?.();
    });
  });

  // Sadece ekranda mesaj varken yarım saniyede bir süreleri denetle (sürekli animasyon yok)
  const tick = setInterval(() => {
    if (!items().length) return;
    const t = Date.now();
    setNow(t);
    const keep = items().filter((x) => t - x.at < life());
    if (keep.length !== items().length) setItems(keep);
  }, 500);
  onCleanup(() => clearInterval(tick));

  // Örnek mesajlar: panel içi önizleme, sabitlenmiş önizleme, düzenleme modu ve Demo modu. Gerçek bir mesaj
  // geldiği anda örnekler kalkar (aşağıda: items doluysa yalnızca gerçek mesajlar) ve o mesajların ekranda kalma
  // süresi dolana dek geri gelmez; hepsi silinince, Demo hâlâ açıksa örnekler yeniden gösterilir.
  // Örnekler hiçbir zaman sesli okunmaz (speak yalnızca gerçek olay dinleyicisinden çağrılır).
  const status = useTopic("status");
  const sample = () => props.editing || !!status()?.demo;
  const shown = createMemo<Item[]>(() => {
    const list = items().length ? items().slice(-maxN()) : sample() ? SAMPLE.slice(-maxN()).map((m) => ({ m, at: now() })) : [];
    return o().newestTop ? [...list].reverse() : list;
  });
  const fading = (x: Item) => !props.editing && now() - x.at > life() - 900;
  const bgA = () => Math.max(0, Math.min(100, Number(o().bgOpacity ?? 80)));

  return (
    <div
      class="ovmsg"
      classList={{ top: !!o().newestTop }}
      style={{
        "font-size": `${Math.max(10, Math.min(24, Number(o().fontSize) || 13))}px`,
        "--ovmsg-w": `${Math.max(220, Math.min(900, Number(o().width) || 340))}px`,
        "--ovmsg-bg": `color-mix(in srgb, var(--ov-bg-solid) ${bgA()}%, transparent)`,
        "--ovmsg-lines": String(Math.max(1, Math.min(8, Number(o().lines) || 3))),
        "--ovmsg-max": String(maxN()),
      }}
      data-no-i18n
    >
      <For each={shown()}>
        {(x) => (
          <div class="ovmsg-row" classList={{ mine: x.m.mine, out: fading(x) }} style={{ "--ovmsg-c": x.m.color }}>
            <Show when={o().avatar !== false}>
              <span class="ovmsg-av" style={{ background: x.m.photo ? undefined : x.m.color }}>
                <Show when={x.m.photo} fallback={initial(x.m.name)}>
                  <img src={x.m.photo} alt="" draggable={false} />
                </Show>
              </span>
            </Show>
            <div class="ovmsg-bubble">
              <div class="ovmsg-name">
                <Show when={x.m.team}>
                  <i>{x.m.team}</i>
                </Show>
                <b>{x.m.name}</b>
              </div>
              <p>{x.m.body}</p>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
