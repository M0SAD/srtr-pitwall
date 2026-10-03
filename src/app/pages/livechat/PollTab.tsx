// Canlı Sohbet › Anket: soru + 2–9 şık + süre ile anket aç, canlı sonuçlar, bitir / iptal, varsayılanlar ve kısayol.
// İzleyiciler sohbete sadece şık numarasını yazarak oy verir ("1", "#2", "3."); kişi başı ilk oy sayılır.

import { For, Index, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { fmtRemaining } from "@/overlays/livechat/parts";
import { ProLockBox } from "../../components/ProLock";
import { Slider, Switch } from "../../components/SettingsForm";
import { go } from "../../ui";
import * as I from "../../icons";
import { StatusPill, errText, lc, setLc, toast } from "./common";

const fmtDur = (s: number) => (s <= 0 ? t("süresiz") : s < 60 ? t("{0} sn", s) : s % 60 ? t("{0} dk {1} sn", Math.floor(s / 60), s % 60) : t("{0} dk", s / 60));

function Results(p: { poll: LC.PollView; now: number }) {
  const v = () => p.poll;
  const max = createMemo(() => Math.max(1, ...v().counts));
  const result = () => v().state === "result";
  const winLine = () => {
    if (!result()) return "";
    if (v().spinning) return t("Beraberlik — rastgele seçiliyor…");
    const n = v().picked ?? v().winners[0];
    if (!n) return t("Hiç oy gelmedi");
    const ans = v().answers[n - 1];
    const c = v().counts[n - 1] ?? 0;
    const pct = v().total ? Math.round((c * 100) / v().total) : 0;
    const label = ans ? `${n} — ${ans}` : String(n);
    if (v().tie.length > 1) return t("Beraberlik ({0}), rastgele seçilen: {1} ({2} oy)", v().tie.join(", "), label, c);
    return t("Kazanan: {0} ({1} oy, %{2})", label, c, pct);
  };
  const remaining = () => (v().endsAt ? Math.max(0, Math.round((v().endsAt! - p.now) / 1000)) : null);
  return (
    <>
      <div class="lcp-res-head">
        <h4 data-no-i18n>{v().question || t("Anket")}</h4>
        <span class="muted">
          {t("{0} oy", v().total)}
          <Show when={v().state === "active"}>
            {" · "}
            {remaining() != null ? t("{0} kaldı", fmtRemaining(remaining()!)) : t("süresiz, elle bitir")}
          </Show>
        </span>
      </div>
      <div class="lcp-res">
        <For each={v().counts}>
          {(c, i) => {
            const n = () => i() + 1;
            const pct = () => (v().total ? Math.round((c * 100) / v().total) : 0);
            return (
              <div class="lcp-res-row" classList={{ win: result() && v().winners.includes(n()) }}>
                <b>{n()}</b>
                <span class="lcp-res-a" data-no-i18n>
                  {v().answers[i()] || "—"}
                </span>
                <span class="lcp-res-bar">
                  <i style={{ width: `${(c / max()) * 100}%` }} />
                </span>
                <span>
                  {c} · %{pct()}
                </span>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={result()}>
        <div class="lcp-res-win" data-no-i18n>
          🏆 {winLine()}
        </div>
      </Show>
    </>
  );
}

export function PollTab() {
  const store = LC.useLiveChat(300);
  const poll = () => store.poll();
  const state = () => poll()?.state ?? "idle";
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 500);
  onCleanup(() => clearInterval(tick));

  const [question, setQuestion] = createSignal("");
  // Anket kısayolu basılı tutulup soru söylenirken metin buraya canlı yazılır
  const [dictating, setDictating] = createSignal(false);
  {
    let off: (() => void) | undefined;
    let dead = false;
    void Promise.resolve(
      LC.onPollDictation((d) => {
        setDictating(d.active);
        if (d.active || d.text) setQuestion(d.text);
      }),
    ).then((u) => {
      if (typeof u !== "function") return;
      if (dead) u();
      else off = u;
    });
    onCleanup(() => {
      dead = true;
      off?.();
    });
  }
  const [answers, setAnswers] = createSignal<string[]>(Array.from({ length: Math.max(2, lc().poll.options) }, () => ""));
  const [duration, setDuration] = createSignal(lc().poll.duration);
  const locked = () => proLocked(F.livePoll);
  const running = () => !!store.status()?.running;

  const start = async () => {
    try {
      await LC.pollStart({ options: answers().length, duration: duration(), question: question().trim(), answers: answers().map((a) => a.trim()) });
      toast(t("Anket başladı"));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const quick = async () => {
    try {
      await LC.pollStart({});
    } catch (e) {
      toast(errText(e), true);
    }
  };

  const pill = () =>
    state() === "active" ? { cls: "busy" as const, text: t("Sürüyor") } : state() === "result" ? { cls: "warn" as const, text: t("Sonuç gösteriliyor") } : { cls: "off" as const, text: t("Anket yok") };

  return (
    <ProLockBox feature={F.livePoll} text={t("Sohbet anketi PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Anket</h3>
          <StatusPill cls={pill().cls} text={pill().text} />
          <span class="lcp-sp" />
          <Show when={state() === "active"}>
            <button class="btn primary small" onClick={() => LC.pollStop().catch((e) => toast(errText(e), true))}>
              <I.Square /> Şimdi bitir
            </button>
            <button class="btn ghost small" onClick={() => LC.pollReset().catch((e) => toast(errText(e), true))}>
              İptal
            </button>
          </Show>
          <Show when={state() === "result"}>
            <button class="btn ghost small" onClick={() => LC.pollReset().catch((e) => toast(errText(e), true))}>
              <I.X /> Sonucu kapat
            </button>
          </Show>
        </div>
        <Show
          when={poll() && state() !== "idle"}
          fallback={
            <p class="muted small">
              İzleyiciler sohbete sadece şık numarasını yazarak oy verir (1, #2, 3.). Herkesin ilk oyu sayılır; gizlenen kanallardan ve
              engellenen kullanıcılardan oy sayılmaz. Anket overlay'de, sohbet overlay'inde ve OBS anket sayfasında görünür.
            </p>
          }
        >
          <Results poll={poll()!} now={now()} />
        </Show>
      </section>

      <Show when={state() !== "active"}>
        <section class="panel">
          <h3>Yeni anket</h3>
          <Show when={!running()}>
            <div class="lcp-note">Anket açmak için önce canlı sohbeti başlat (üstteki Başlat).</div>
          </Show>
          <div class="lcp-field">
            <label>
              Soru (isteğe bağlı; anket sürerken sohbetin ve OBS'nin üstünde görünür)
              <Show when={dictating()}>
                <span class="lcp-dict">
                  <I.Mic /> {t("Dinleniyor…")}
                </span>
              </Show>
            </label>
            <input class="input" style={{ width: "100%" }} maxLength={200} placeholder={dictating() ? t("Dinleniyor… soruyu söyle, tuşu bırakınca anket başlar") : t("Örn. Bu yarışı kim kazanır?")} value={question()} onInput={(e) => setQuestion(e.currentTarget.value)} />
          </div>
          <div class="lcp-field">
            <label>Şıklar (cevaplar isteğe bağlı; boş bırakılırsa sadece numara görünür)</label>
            <div class="lcp-poll-opts">
              <Index each={answers()}>
                {(a, i) => (
                  <div class="lcp-poll-opt">
                    <b>{i + 1}</b>
                    <input
                      class="input"
                      maxLength={60}
                      placeholder={t("Şık {0}", i + 1)}
                      value={a()}
                      onInput={(e) => {
                        const v = e.currentTarget.value;
                        setAnswers((l) => l.map((x, j) => (j === i ? v : x)));
                      }}
                    />
                    <button class="btn ghost small" title={t("Şıkkı kaldır")} disabled={answers().length <= 2} onClick={() => setAnswers((l) => l.filter((_, j) => j !== i))}>
                      <I.X />
                    </button>
                  </div>
                )}
              </Index>
            </div>
            <button class="btn ghost small" style={{ "margin-top": "8px" }} disabled={answers().length >= 9} onClick={() => setAnswers((l) => [...l, ""])}>
              <I.Plus /> Şık ekle
            </button>
          </div>
          <div class="row">
            <div>
              <b>Süre</b>
              <small>{fmtDur(duration())}</small>
            </div>
            <div style={{ width: "260px" }}>
              <Slider value={duration()} min={0} max={600} step={15} format={(n) => fmtDur(n)} onInput={setDuration} />
            </div>
          </div>
          <div class="lcp-inline" style={{ "justify-content": "flex-end", "margin-top": "10px" }}>
            <button class="btn ghost" disabled={locked() || !running()} onClick={quick} title={t("Ayarlardaki şık sayısı ve süreyle, sorusuz")}>
              Hızlı anket ({lc().poll.options} {t("şık")})
            </button>
            <button class="btn primary" disabled={locked() || !running()} onClick={start}>
              <I.Play /> Anketi başlat
            </button>
          </div>
        </section>
      </Show>

      <section class="panel">
        <h3>Varsayılanlar</h3>
        <div class="row">
          <div>
            <b>Hızlı anket şık sayısı</b>
            <small>Kısayol ve “Hızlı anket” bu sayıyla açar.</small>
          </div>
          <div style={{ width: "220px" }}>
            <Slider value={lc().poll.options} min={2} max={9} onInput={(n) => setLc((x) => (x.poll.options = n))} />
          </div>
        </div>
        <div class="row">
          <div>
            <b>Hızlı anket süresi</b>
          </div>
          <div style={{ width: "220px" }}>
            <Slider value={lc().poll.duration} min={0} max={600} step={15} format={(n) => fmtDur(n)} onInput={(n) => setLc((x) => (x.poll.duration = n))} />
          </div>
        </div>
        <div class="row">
          <div>
            <b>Sonucun ekranda kalma süresi</b>
          </div>
          <div style={{ width: "220px" }}>
            <Slider value={lc().poll.resultDuration} min={3} max={120} unit={t("sn")} onInput={(n) => setLc((x) => (x.poll.resultDuration = n))} />
          </div>
        </div>
        <div class="row">
          <div>
            <b>Oy mesajlarını sohbette gösterme</b>
            <small>Oylar yine sayılır.</small>
          </div>
          <Switch checked={lc().poll.hideVotes} onChange={(v) => setLc((x) => (x.poll.hideVotes = v))} />
        </div>
        <div class="row">
          <div>
            <b>Kısayol: anketi başlat / bitir</b>
            <small>Oyundayken de çalışır (Canlı Sohbet çalışırken).</small>
            <small>
              Tuşu basılı tutup soruyu söyle, bırakınca anket o soruyla başlar (mikrofon bu sırada kendiliğinden dinlenir; altyazının açık olması
              gerekmez). Soru anlaşılmazsa anket başlamaz. Anket sürerken tuşa basmak anketi bitirir.
            </small>
          </div>
          <div class="lcp-inline">
            <span class="lcp-kbd">{prettyKey(shortcut("poll"))}</span>
            <button class="btn ghost small" onClick={() => go("settings", "keybinds")}>
              Değiştir
            </button>
          </div>
        </div>
      </section>
    </ProLockBox>
  );
}
