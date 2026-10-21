// "Reklam ver" tanıtım kartı (PRO sayfası, Hesap): reklam satışı açıkken belirgin bir kutu; en düşük başlangıç
// fiyatını gösterir, tıklayınca uygulama içindeki Reklam ver sayfası açılır.

import { Show, createMemo } from "solid-js";
import { t } from "@/sdk/i18n";
import { config, fmtPrice, inTurkey } from "@/cloud/account";
import { APP_PLACEMENTS, adOnSale, adPricing } from "@/cloud/ads";
import * as I from "../icons";
import { go } from "../ui";

export function AdvertiseCard() {
  const places = createMemo(() => APP_PLACEMENTS.filter((p) => adOnSale(p)));
  /** En düşük fiyat: günlük ya da 1.000 gösterim (bölgeye göre TL ya da genel para birimi) */
  const from = createMemo(() => {
    const pr = adPricing();
    const tr = inTurkey();
    let best: { v: number; cur: string; unit: string } | null = null;
    for (const p of places()) {
      const x = pr.placements[p] ?? {};
      const useTr = tr && ((x.cpm_tr ?? 0) > 0 || (x.day_tr ?? 0) > 0);
      const cur = useTr ? pr.currency_tr || "TRY" : pr.currency || "USD";
      const day = useTr ? x.day_tr : x.day;
      const cpm = useTr ? x.cpm_tr : x.cpm;
      for (const [v, unit] of [
        [day, t("günlük")],
        [cpm, t("1.000 gösterim")],
      ] as const) {
        if ((v ?? 0) > 0 && (!best || (v as number) < best.v)) best = { v: v as number, cur, unit };
      }
    }
    return best;
  });
  return (
    <Show when={config()?.ads_enabled && places().length}>
      <section class="panel adv-card">
        <div class="adv-card-ico">
          <I.Megaphone />
        </div>
        <div class="adv-card-body">
          <h3>{t("Reklamını SRTR Pitwall'da yayınla")}</h3>
          <p>
            {t(
              "Sim yarışçılarına ulaş: reklamın uygulamanın ana sayfasında, haberlerin arasında ve diğer sayfalarda görünsün. Gösterim ve tıklamaları kendi panelinden takip et.",
            )}
          </p>
          <Show when={from()}>
            {(f) => (
              <small class="muted">
                {t("{0} başlayan fiyatlarla ({1})", fmtPrice(f().v, f().cur), f().unit)}
              </small>
            )}
          </Show>
        </div>
        <button class="btn primary adv-card-btn" onClick={() => go("advertise")}>
          <I.Megaphone /> {t("Reklam ver")}
        </button>
      </section>
    </Show>
  );
}
