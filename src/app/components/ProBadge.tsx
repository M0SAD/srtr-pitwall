// Üst çubukta, soldaki bağlantıların hemen yanında "PRO" rozeti (yalnızca PRO üyelere). Tıklayınca kalan süre
// (gün / saat, bitiş tarihi, kendini yenileyen abonelik) açılır; "PRO süresini uzat" satın alma sayfasına götürür.

import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { entitlement, isAdmin, isPro, loadProInfo, profile, promoUntil, proInfo } from "@/cloud/account";
import { t } from "@/sdk/i18n";
import "./proBadge.css";

/** Süresiz sayılan üst sınır (proDaysLeft ile aynı) */
const FOREVER_MS = 3000 * 86400_000;

export function ProBadge(props: { onExtend: () => void }) {
  const [open, setOpen] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  let root: HTMLDivElement | undefined;
  onMount(() => {
    const away = (e: MouseEvent) => open() && root && !root.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    // Açıkken kalan süre dakikada bir güncellenir
    const tm = window.setInterval(() => open() && setNow(Date.now()), 60_000);
    onCleanup(() => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
      clearInterval(tm);
    });
  });

  // Kendi PRO'su ve kampanya PRO'sundan hangisi daha geç bitiyorsa o
  const own = () => {
    const e = entitlement().proUntil || 0;
    const p = profile()?.pro_until ? new Date(profile()!.pro_until!).getTime() : 0;
    return Math.max(e, p);
  };
  const until = createMemo(() => Math.max(own(), promoUntil()));
  const promo = () => promoUntil() > own();
  const forever = () => isAdmin() || !until() || until() - now() > FOREVER_MS;
  const left = createMemo(() => Math.max(0, until() - now()));
  const days = () => Math.floor(left() / 86400_000);
  const hours = () => Math.floor((left() % 86400_000) / 3600_000);
  const soon = () => !forever() && days() < 10 && !proInfo()?.renewing;
  const leftText = () => {
    if (days() >= 1) return t("{0} gün {1} saat", days(), hours());
    const m = Math.max(1, Math.floor((left() % 3600_000) / 60_000));
    return hours() >= 1 ? t("{0} saat {1} dakika", hours(), m) : t("{0} dakika", m);
  };
  const endText = () =>
    new Date(until()).toLocaleString([], { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const toggle = () => {
    const v = !open();
    setOpen(v);
    if (v) {
      setNow(Date.now());
      void loadProInfo();
    }
  };

  return (
    <Show when={isPro()}>
      <div class="pb" ref={root}>
        <button class="pb-btn" classList={{ on: open(), soon: soon() }} title={t("PRO üyelik: kalan süre")} aria-expanded={open()} onClick={toggle} data-no-i18n>
          PRO
        </button>
        <Show when={open()}>
          <div class="pb-pop" role="dialog">
            <div class="pb-head">
              <b>{t("PRO üyelik")}</b>
              <Show when={promo()}>
                <span class="pb-tag">{t("Kampanya")}</span>
              </Show>
            </div>
            <Show
              when={!forever()}
              fallback={<div class="pb-left">{isAdmin() ? t("Yönetici: süresiz") : t("Süresiz")}</div>}
            >
              <div class="pb-left" classList={{ soon: soon() }}>
                {t("{0} kaldı", leftText())}
              </div>
              <div class="pb-end">{t("Bitiş: {0}", endText())}</div>
              <Show when={proInfo()?.renewing}>
                <div class="pb-note">{t("Abonelik bitişte kendiliğinden yenilenir")}</div>
              </Show>
            </Show>
            <button
              class="btn primary small pb-extend"
              onClick={() => {
                setOpen(false);
                props.onExtend();
              }}
            >
              {t("PRO süresini uzat")}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
