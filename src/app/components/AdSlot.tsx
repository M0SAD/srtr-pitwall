// Reklam alanı: yerleşim yeri için yayındaki bir reklamı gösterir. PRO üyelere ve reklamlar kapalıyken
// hiçbir şey çizmez. Ekranda en az 1 saniye yarısı göründüğünde gösterim sayılır; tıklayınca hedef adres
// tarayıcıda açılır. Sağ tık: raporla / reklam ver / reklamsız kullanım (PRO).

import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { config, isPro } from "@/cloud/account";
import { AD_REPORT_REASONS, AD_SITE, adClick, adImageUrl, adImpression, pickAd, reportAd, type Ad, type AdPlacement } from "@/cloud/ads";
import * as I from "../icons";
import { go, openUrl } from "../ui";
import "../ads.css";

export function AdSlot(p: { placement: Extract<AdPlacement, "panel_banner" | "panel_card">; class?: string }) {
  const enabled = () => cloudEnabled && !isPro() && !!config()?.ads_enabled;
  const [ad, setAd] = createSignal<Ad | null>(null);
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [reporting, setReporting] = createSignal<Ad | null>(null);
  const counted = new Set<string>();

  const load = (fresh = false) =>
    pickAd(p.placement, fresh)
      .then((a) => setAd(a && a.url.startsWith("https://") ? a : null))
      .catch(() => setAd(null));

  createEffect(
    on(enabled, (on) => {
      if (on) load();
      else setAd(null);
    }),
  );

  // Gösterim: yarısı en az 1 sn görünürse (reklam başına bu alanda bir kez; sunucu da 30 dk sınırlar)
  const observe = (node: HTMLElement) => {
    let timer: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5);
        clearTimeout(timer);
        if (!vis) return;
        timer = window.setTimeout(() => {
          const a = ad();
          if (!a || counted.has(a.id) || document.visibilityState !== "visible") return;
          counted.add(a.id);
          adImpression(a.id);
        }, 1000);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(node);
    onCleanup(() => {
      clearTimeout(timer);
      io.disconnect();
    });
  };

  const open = (a: Ad) => {
    openUrl(a.url);
    adClick(a.id);
  };

  const closeMenu = () => setMenu(null);
  createEffect(() => {
    if (!menu()) return;
    const h = () => closeMenu();
    const t0 = setTimeout(() => {
      window.addEventListener("pointerdown", h);
      window.addEventListener("blur", h);
      window.addEventListener("scroll", h, true);
    });
    onCleanup(() => {
      clearTimeout(t0);
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("blur", h);
      window.removeEventListener("scroll", h, true);
    });
  });

  return (
    <Show when={enabled() && ad()}>
      {(a) => (
        <div
          class={`ad-slot ad-${p.placement} ${p.class ?? ""}`}
          ref={observe}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 150) });
          }}
        >
          <button class="ad-body" title={a().url} onClick={() => open(a())}>
            <img class="ad-img" src={adImageUrl(a().image)} alt={a().title} loading="lazy" draggable={false} />
            <span class="ad-text">
              <b data-no-i18n>{a().title}</b>
              <Show when={a().body}>
                <small data-no-i18n>{a().body}</small>
              </Show>
            </span>
          </button>
          <span class="ad-tag" title="Sağ tık: raporla">
            Reklam
          </span>
          <Show when={menu()}>
            <Portal>
              <div class="ad-menu" style={{ left: `${menu()!.x}px`, top: `${menu()!.y}px` }} onPointerDown={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    closeMenu();
                    if (session()) setReporting(a());
                    else go("account");
                  }}
                >
                  <I.Flag /> {session() ? "Reklamı raporla" : "Raporlamak için giriş yap"}
                </button>
                <button onClick={() => (closeMenu(), openUrl(AD_SITE))}>
                  <I.Megaphone /> Reklam ver
                </button>
                <button onClick={() => (closeMenu(), go("pro"))}>
                  <I.Star /> Reklamsız kullan (PRO)
                </button>
              </div>
            </Portal>
          </Show>
          <Show when={reporting()}>
            <AdReportDialog
              ad={reporting()!}
              onClose={(done) => {
                setReporting(null);
                if (done) {
                  setAd(null);
                  load(true);
                }
              }}
            />
          </Show>
        </div>
      )}
    </Show>
  );
}

function AdReportDialog(p: { ad: Ad; onClose: (done: boolean) => void }) {
  const [reason, setReason] = createSignal("");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [err, setErr] = createSignal("");
  const submit = async () => {
    if (!reason()) return setErr(t("Bir sebep seç."));
    setBusy(true);
    setErr("");
    try {
      await reportAd(p.ad.id, reason(), note().trim());
      setDone(true);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Portal>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && p.onClose(done())}>
        <div class="modal report-modal">
          <header>
            <div>
              <h3>Reklamı raporla</h3>
              <small class="muted" data-no-i18n>
                {p.ad.title}
              </small>
            </div>
            <button class="btn ghost small" onClick={() => p.onClose(done())}>
              Kapat
            </button>
          </header>
          <Show
            when={!done()}
            fallback={
              <div class="report-done">
                <p class="success">Teşekkürler. Raporun yöneticilere iletildi; bu reklamı artık görmeyeceksin.</p>
                <button class="btn primary" onClick={() => p.onClose(true)}>
                  Tamam
                </button>
              </div>
            }
          >
            <p class="muted small">Bu reklamda sorun ne?</p>
            <div class="report-reasons">
              <For each={AD_REPORT_REASONS}>
                {(r) => (
                  <label class="check" classList={{ on: reason() === r.id }}>
                    <input type="radio" name="ad-report-reason" checked={reason() === r.id} onChange={() => setReason(r.id)} />
                    <span>{r.label}</span>
                  </label>
                )}
              </For>
            </div>
            <textarea
              class="input cm-textarea"
              rows={3}
              maxLength={500}
              placeholder="Açıklama (isteğe bağlı)"
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
            />
            <Show when={err()}>
              <p class="error small">{err()}</p>
            </Show>
            <button class="btn primary" disabled={busy() || !reason()} onClick={submit}>
              {busy() ? "Gönderiliyor…" : "Gönder"}
            </button>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
