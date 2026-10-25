// Sıralama Tablosu ayarlarının üstünde: bağlı olunan iRacing serisinin adı. iRacing yalnızca seri numarasını verir;
// ad Supabase'de tutulur (c137). Adı olmayan seriyi üye bir kez adlandırır (iRacing › seri bilgisindeki adı yazar),
// kayıtlı adı yönetici değiştirebilir.
import { Show, createEffect, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { useTopic } from "@/sdk/telemetry";
import { session } from "@/cloud/supabase";
import { isAdmin } from "@/cloud/account";
import { seriesName, setSeriesName } from "@/cloud/series";
import { Section } from "./OverlaySettings";

export function SeriesNamePanel() {
  const status = useTopic("status");
  const id = () => (status()?.connected && !status()?.demo ? (status()?.seriesId ?? 0) : 0);
  const name = () => seriesName(id());
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  createEffect(() => setDraft(name()));
  const canEdit = () => !!session() && (!name() || isAdmin());
  const save = async () => {
    if (busy() || draft().trim().length < 2) return;
    setBusy(true);
    setErr("");
    try {
      await setSeriesName(id(), draft());
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show when={id() > 0}>
      <Section title="Seri adı">
        <div class="f2">
          <div class="f2-cap">{t("Bağlı olduğun seri (iRacing seri no. {0})", id())}</div>
          <Show when={canEdit()} fallback={<b data-no-i18n>{name() || t("Henüz adlandırılmamış")}</b>}>
            <div class="hed-inline">
              <input
                class="input f2-text"
                maxLength={80}
                placeholder={t("ör. Formula Vee")}
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void save()}
                data-no-i18n
              />
              <button class="btn small primary" disabled={busy() || draft().trim().length < 2 || draft().trim() === name()} onClick={save}>
                {t("Kaydet")}
              </button>
            </div>
          </Show>
          <Show when={err()}>
            <small class="f2-hint f2-err">{err()}</small>
          </Show>
          <small class="f2-hint">
            {name()
              ? t("Sıralama tablosunun üstünde bu ad görünür.")
              : t("iRacing seri adını vermiyor; bu serinin adını bir kez yazman yeterli (iRacing'de seri bilgisindeki ad). Herkes için kaydedilir.")}
          </small>
        </div>
      </Section>
    </Show>
  );
}
