// Hesap › Reklamlar: PRO üyeler için "Reklamları gizle" (c129) ve herkes için "Reklam ver" kısayolu.
// Gizleme yalnızca yöneticinin "PRO gizleyebilir" dediği yerlerde geçerlidir; diğer yerler listede ayrıca yazılır.

import { Show, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { config, isPro, loadProfile, profile } from "@/cloud/account";
import { APP_PLACEMENTS, AD_PLACEMENTS, setHideAds } from "@/cloud/ads";
import * as I from "../icons";
import { go } from "../ui";

export function AdPrefsPanel() {
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const hide = () => profile()?.hide_ads !== false;
  const hideable = () => APP_PLACEMENTS.filter((p) => config()?.ad_pricing?.placements?.[p]?.pro_hide !== false);
  const always = () => APP_PLACEMENTS.filter((p) => config()?.ad_pricing?.placements?.[p]?.pro_hide === false);
  const set = async (v: boolean) => {
    setBusy(true);
    setErr("");
    try {
      await setHideAds(v);
      await loadProfile();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show when={config()?.ads_enabled}>
      <section class="panel">
        <h3>{t("Reklamlar")}</h3>
        <Show when={isPro()}>
          <div class="row">
            <div>
              <b>{t("Reklamları gizle (PRO)")}</b>
              <small>
                {t("Açıkken şu yerlerde reklam görmezsin: {0}.", hideable().map((p) => t(AD_PLACEMENTS[p].where ?? AD_PLACEMENTS[p].label)).join(", ") || "—")}
              </small>
              <Show when={always().length}>
                <small class="muted">
                  {t("Bu yerlerdeki reklamlar herkese gösterilir: {0}.", always().map((p) => t(AD_PLACEMENTS[p].where ?? AD_PLACEMENTS[p].label)).join(", "))}
                </small>
              </Show>
            </div>
            <label class="switch">
              <input type="checkbox" checked={hide()} disabled={busy()} onChange={(e) => set(e.currentTarget.checked)} />
              <span />
            </label>
          </div>
          <Show when={err()}>
            <p class="error">{err()}</p>
          </Show>
        </Show>
        <div class="row">
          <div>
            <b>{t("Reklam ver")}</b>
            <small>{t("Ürününü ya da kanalını uygulamanın ana sayfasında ve diğer sayfalarında tanıt.")}</small>
          </div>
          <button class="btn ghost" onClick={() => go("advertise")}>
            <I.Megaphone /> {t("Reklam ver")}
          </button>
        </div>
      </section>
    </Show>
  );
}
