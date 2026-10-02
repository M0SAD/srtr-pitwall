// İlk giriş: yeni hesaba deneme PRO verildiyse kutlama penceresi (PRO ile gelenler ve bitiş tarihi).
// Talep bir kez yapılır (hesap + bilgisayar başına); reddedilirse hiçbir şey gösterilmez. Sunucu: c41 trial_claim.

import { Show, createEffect, on } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { refreshEntitlement } from "@/cloud/account";
import { maybeClaimTrial, setTrialWelcome, trialWelcome } from "@/cloud/trial";
import { go } from "../ui";
import * as I from "../icons";
import "./trialWelcome.css";

export function TrialWelcome() {
  // Oturum açılınca (ya da program oturumla başlayınca) bir kez sor; kabul edilirse PRO hemen açılsın
  createEffect(
    on(
      () => session()?.user.id,
      (id) => {
        if (id) setTimeout(() => maybeClaimTrial(() => refreshEntitlement()), 1500);
      },
    ),
  );
  const until = () => {
    const u = trialWelcome()?.until;
    return u ? new Date(u).toLocaleString(localeTag(), { dateStyle: "long", timeStyle: "short" }) : "";
  };
  const close = () => setTrialWelcome(null);
  return (
    <Show when={trialWelcome()}>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && close()}>
        <div class="modal trial-welcome">
          <div class="tw-hero">
            <span class="tw-star">
              <I.Star />
            </span>
            <h2>{t("Hoş geldin! {0} günlük PRO denemen başladı", trialWelcome()!.days ?? 3)}</h2>
            <p class="muted">{t("Deneme süresince tüm PRO özellikleri açık. Bitiş: {0}", until())}</p>
          </div>
          <ul class="tw-list">
            <li>
              <I.Mic />
              <span>
                <b>Sesli spotter ve mühendis</b> — yandaki araçlar, bayraklar, yakıt, pozisyon ve kalan tur bilgisi.
              </span>
            </li>
            <li>
              <I.Layers />
              <span>
                <b>PRO overlay'ler ve ayarlar</b> — PRO'ya ayrılmış tüm overlay'ler ve gelişmiş seçenekler.
              </span>
            </li>
            <li>
              <I.Activity />
              <span>
                <b>Telemetri ve araçlar</b> — tur karşılaştırma, ekran görüntüleri, yayın ve lig araçları.
              </span>
            </li>
            <li>
              <I.Heart />
              <span>
                <b>Geliştirmeye destek</b> — beğenirsen PRO'ya geçerek yeni özelliklerin gelmesine katkı sağlarsın.
              </span>
            </li>
          </ul>
          <p class="muted small">Deneme bitince hesabın kendiliğinden ücretsiz sürüme döner; ödeme bilgisi istenmez.</p>
          <div class="btns">
            <button
              class="btn ghost"
              onClick={() => {
                close();
                go("pro");
              }}
            >
              PRO hakkında
            </button>
            <button class="btn primary" onClick={close}>
              <I.Check /> Başlayalım
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
