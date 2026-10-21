// Reklam ver (uygulama içinden): yer, fiyat modeli (gösterim paketi / gün) ve paket seçilir; başlık, kısa metin,
// bağlantı ve görsel girilir; canlı önizleme ve sunucunun hesapladığı fiyat görünür. "Öde" reklamı kaydeder
// (ad_save) ve ödeme sayfasını uygulamanın ödeme penceresinde açar (ads-checkout). Ödeme gelince reklam yayına girer
// (otomatik onay kapalıysa yönetici onayından sonra). Altta "Reklamlarım": durum, gösterim / tıklama, öde / sil /
// durdur / sürdür.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { localeTag, t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { cloudEnabled, session } from "@/cloud/supabase";
import { config, fmtPrice, inTurkey } from "@/cloud/account";
import {
  AD_PAID_PREFIX,
  AD_PLACEMENTS,
  AD_STATUS,
  adCheckoutUrl,
  adDelete,
  adImageUrl,
  adOnSale,
  adOwnerPause,
  adPrice,
  adPricing,
  adSave,
  myAds,
  uploadAdImage,
  type AdCampaign,
  type AdPlacement,
  type AdStatus,
} from "@/cloud/ads";
import * as I from "../icons";
import { go, sub } from "../ui";
import { AdStatsPanel } from "../components/AdStats";
import "../ads.css";

type Model = "impressions" | "days";
const nf = (n: number) => Number(n || 0).toLocaleString(localeTag());
const fmtTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "—");

export function AdvertisePage() {
  const region = (): "tr" | "intl" => (inTurkey() ? "tr" : "intl");
  const places = createMemo(() => (Object.keys(AD_PLACEMENTS) as AdPlacement[]).filter((p) => adOnSale(p)));
  const pr = () => adPricing();
  /** Bu yer / bölge için hangi modellerin fiyatı var */
  const models = (pl: AdPlacement): Model[] => {
    const x = pr().placements[pl] ?? {};
    const tr = region() === "tr" && ((x.cpm_tr ?? 0) > 0 || (x.day_tr ?? 0) > 0);
    const cpm = tr ? x.cpm_tr : x.cpm;
    const day = tr ? x.day_tr : x.day;
    return [...((cpm ?? 0) > 0 ? (["impressions"] as Model[]) : []), ...((day ?? 0) > 0 ? (["days"] as Model[]) : [])];
  };

  const [editId, setEditId] = createSignal<string | null>(null);
  const [placement, setPlacement] = createSignal<AdPlacement>("home_top");
  const [model, setModel] = createSignal<Model>("days");
  const [qty, setQty] = createSignal(7);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [url, setUrl] = createSignal("https://");
  const [langs, setLangs] = createSignal<string[]>([]);
  const [image, setImage] = createSignal(""); // kovadaki yol (kayıtlı reklam)
  const [file, setFile] = createSignal<File | null>(null);
  const [preview, setPreview] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [msg, setMsg] = createSignal("");
  let fileEl: HTMLInputElement | undefined;

  // Açılışta: bağlantıyla gelinen yer (reklam etiketinden), yoksa satıştaki ilk yer
  createEffect(
    on(places, (ps) => {
      const want = sub() as AdPlacement;
      if (ps.includes(want)) setPlacement(want);
      else if (!ps.includes(placement()) && ps.length) setPlacement(ps[0]);
    }),
  );
  // Yer değişince geçerli model / paket
  createEffect(
    on(placement, (pl) => {
      const ms = models(pl);
      if (ms.length && !ms.includes(model())) setModel(ms[0]);
    }),
  );
  const qtys = () => (model() === "impressions" ? pr().impressions : pr().days);
  createEffect(
    on(model, () => {
      if (!qtys().includes(qty())) setQty(qtys()[Math.min(1, qtys().length - 1)] ?? qtys()[0] ?? 1);
    }),
  );

  // Fiyat: sunucu hesaplar (istemci fiyatına güvenilmez)
  const [price] = createResource(
    () => (places().includes(placement()) ? ([placement(), model(), qty(), region()] as const) : null),
    ([pl, m, q, rg]) => adPrice(pl, m, q, rg).catch(() => null),
  );

  // Görsel önizlemesi
  createEffect(() => {
    const f = file();
    if (!f) return setPreview(image() ? adImageUrl(image()) : "");
    const u = URL.createObjectURL(f);
    setPreview(u);
    onCleanup(() => URL.revokeObjectURL(u));
  });
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setErr(t("Sadece PNG, JPEG, WebP ya da GIF yüklenebilir"));
    if (f.size > 2 * 1024 * 1024) return setErr(t("Görsel en fazla 2 MB olabilir"));
    setErr("");
    setFile(f);
  };

  const [statsOpen, setStatsOpen] = createSignal<string | null>(null);
  const [mine, { refetch }] = createResource(
    () => (cloudEnabled && session() ? 1 : null),
    () => myAds().catch(() => [] as AdCampaign[]),
  );

  // Ödeme penceresi kapanınca / ödeme bitince listeyi yenile (webhook gecikmesi için birkaç kez)
  if (inTauri) {
    let un: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("checkout-done", (e) => {
        if (!String(e.payload).startsWith(AD_PAID_PREFIX)) return;
        setMsg(t("Ödeme alındı. Reklamın birkaç saniye içinde yayına girer (onay gerekiyorsa yönetici onayından sonra)."));
        for (const ms of [1500, 4000, 8000, 15000]) setTimeout(() => refetch(), ms);
      }).then((f) => (un = f)),
    );
    onCleanup(() => un?.());
  }

  const openCheckout = async (id: string) => {
    const u = await adCheckoutUrl(id);
    if (!inTauri) {
      window.open(u, "_blank");
      return;
    }
    try {
      await invoke("checkout_open", { url: u, donePrefix: AD_PAID_PREFIX });
    } catch {
      await invoke("open_url", { url: u }).catch(() => window.open(u, "_blank"));
    }
  };

  const validate = () => {
    if (!places().includes(placement())) return t("Bu reklam yeri şu an satışta değil.");
    if (!title().trim() || title().trim().length > 60) return t("Başlık 1-60 karakter olmalı.");
    if (body().trim().length > 120) return t("Kısa metin en fazla 120 karakter olabilir.");
    if (!/^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/\S*)?$/.test(url().trim())) return t("Bağlantı https:// ile başlayan geçerli bir adres olmalı.");
    if (!file() && !image()) return t("Reklam görselini seç.");
    if (!price()) return t("Bu seçenek için fiyat belirlenmemiş.");
    return "";
  };

  const pay = async () => {
    const e = validate();
    if (e) return setErr(e);
    setErr("");
    setMsg("");
    setBusy(true);
    let uploaded = "";
    try {
      let path = image();
      if (file()) {
        path = await uploadAdImage(file()!);
        uploaded = path;
      }
      const id = await adSave({
        id: editId(),
        placement: placement(),
        model: model(),
        quantity: qty(),
        title: title(),
        body: body(),
        url: url(),
        image: path,
        langs: langs(),
        region: region(),
      });
      setEditId(id);
      setImage(path);
      setFile(null);
      uploaded = "";
      refetch();
      await openCheckout(id);
      setMsg(t("Ödeme sayfası açıldı. Ödemeyi tamamlayınca reklamın yayına girer."));
    } catch (x) {
      setErr(String((x as Error)?.message ?? x));
      if (uploaded) void import("@/cloud/supabase").then((m) => m.storageRemove("ads", [uploaded]).catch(() => {}));
    } finally {
      setBusy(false);
    }
  };

  const edit = (a: AdCampaign) => {
    setEditId(a.id);
    setPlacement(a.placement);
    setModel(a.model);
    setQty(a.quantity);
    setTitle(a.title);
    setBody(a.body);
    setUrl(a.url);
    setLangs(a.langs ?? []);
    setImage(a.image);
    setFile(null);
    setErr("");
    setMsg("");
    document.querySelector(".adv-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reset = () => {
    setEditId(null);
    setTitle("");
    setBody("");
    setUrl("https://");
    setImage("");
    setFile(null);
    setLangs([]);
  };
  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refetch();
    } catch (x) {
      setErr(String((x as Error)?.message ?? x));
    }
  };
  const toggleLang = (l: string, on: boolean) => setLangs((x) => (on ? [...new Set([...x, l])] : x.filter((y) => y !== l)));
  const size = () => AD_PLACEMENTS[placement()];

  return (
    <div class="page narrow adv">
      <Show when={cloudEnabled} fallback={<p class="muted">{t("Reklam vermek için bulut bağlantısı gerekli.")}</p>}>
        <Show
          when={session()}
          fallback={
            <section class="panel empty-state">
              <I.Megaphone />
              <h3>{t("Reklam vermek için giriş yap")}</h3>
              <p>{t("Reklamını uygulamanın ana sayfasında ve diğer sayfalarında yayınla. Yer ve paket seç, görselini yükle, öde; reklamın hemen yayına girer.")}</p>
              <button class="btn primary" onClick={() => go("account")}>
                {t("Giriş yap")}
              </button>
            </section>
          }
        >
          <Show
            when={config()?.ads_enabled && places().length}
            fallback={<section class="panel"><p class="muted">{t("Reklam alımı şu an kapalı.")}</p></section>}
          >
            <section class="panel adv-form">
              <h3>
                <I.Megaphone /> {editId() ? t("Reklamı düzenle ve öde") : t("Yeni reklam")}
              </h3>

              <div class="f2">
                <div class="f2-cap">{t("Reklam yeri")}</div>
                <div class="adv-places">
                  <For each={places()}>
                    {(pl) => (
                      <button class="adv-place" classList={{ on: placement() === pl }} onClick={() => setPlacement(pl)}>
                        <b>{t(AD_PLACEMENTS[pl].label)}</b>
                        <small>{AD_PLACEMENTS[pl].where ? t(AD_PLACEMENTS[pl].where!) : t("Web sitesi")}</small>
                        <small class="muted">
                          {AD_PLACEMENTS[pl].w} × {AD_PLACEMENTS[pl].h} px
                        </small>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="adv-row">
                <div class="f2">
                  <div class="f2-cap">{t("Fiyatlandırma")}</div>
                  <div class="cm-tabs">
                    <For each={models(placement())}>
                      {(m) => (
                        <button classList={{ on: model() === m }} onClick={() => setModel(m)}>
                          {m === "days" ? t("Gün sayısı") : t("Gösterim paketi")}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <div class="f2">
                  <div class="f2-cap">{model() === "days" ? t("Süre") : t("Gösterim")}</div>
                  <select class="f2-select" value={qty()} onChange={(e) => setQty(Number(e.currentTarget.value))}>
                    <For each={qtys()}>{(q) => <option value={q}>{model() === "days" ? t("{0} gün", q) : t("{0} gösterim", nf(q))}</option>}</For>
                  </select>
                </div>
                <div class="adv-price">
                  <small class="muted">{t("Tutar")}</small>
                  <b>{price.loading ? "…" : price() ? fmtPrice(price()!.price, price()!.currency) : "—"}</b>
                </div>
              </div>

              <div class="adv-grid">
                <div class="adv-fields">
                  <div class="f2">
                    <div class="f2-cap">{t("Başlık")} <small class="muted">{title().length}/60</small></div>
                    <input class="input" maxLength={60} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={t("ör. Yeni direksiyon setimiz çıktı")} />
                  </div>
                  <div class="f2">
                    <div class="f2-cap">{t("Kısa metin (isteğe bağlı)")} <small class="muted">{body().length}/120</small></div>
                    <input class="input" maxLength={120} value={body()} onInput={(e) => setBody(e.currentTarget.value)} />
                  </div>
                  <div class="f2">
                    <div class="f2-cap">{t("Tıklanınca açılacak adres")}</div>
                    <input class="input" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://" />
                  </div>
                  <div class="f2">
                    <div class="f2-cap">{t("Kimlere gösterilsin")}</div>
                    <div class="adv-langs">
                      <label>
                        <input type="checkbox" checked={!langs().length || langs().includes("tr")} onChange={(e) => toggleLang("tr", e.currentTarget.checked)} /> {t("Türkçe kullananlar")}
                      </label>
                      <label>
                        <input type="checkbox" checked={!langs().length || langs().includes("other")} onChange={(e) => toggleLang("other", e.currentTarget.checked)} /> {t("Diğer diller")}
                      </label>
                    </div>
                  </div>
                  <div class="f2">
                    <div class="f2-cap">{t("Görsel")}</div>
                    <input ref={fileEl} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickFile(e.currentTarget.files?.[0])} />
                    <button class="btn small" onClick={() => fileEl?.click()}>
                      <I.Upload /> {preview() ? t("Görseli değiştir") : t("Görsel seç")}
                    </button>
                    <small class="muted">{t("Önerilen boyut {0} × {1} px; PNG, JPEG, WebP ya da GIF, en çok 2 MB.", size().w, size().h)}</small>
                  </div>
                </div>
                <div class="adv-preview">
                  <div class="f2-cap">{t("Önizleme")}</div>
                  <div class={`ad-slot ad-${placement()}`}>
                    <div class="ad-body">
                      <Show when={preview()} fallback={<div class="ad-img adv-noimg" style={{ "aspect-ratio": `${size().w} / ${size().h}` }}>{t("Görsel")}</div>}>
                        <img class="ad-img" src={preview()} alt="" style={{ "aspect-ratio": `${size().w} / ${size().h}` }} />
                      </Show>
                      <span class="ad-text">
                        <b data-no-i18n>{title() || t("Başlık")}</b>
                        <Show when={body()}>
                          <small data-no-i18n>{body()}</small>
                        </Show>
                      </span>
                    </div>
                    <span class="ad-tag">{t("Reklam")}</span>
                  </div>
                </div>
              </div>

              <Show when={err()}>
                <p class="error">{err()}</p>
              </Show>
              <Show when={msg()}>
                <p class="success">{msg()}</p>
              </Show>
              <div class="adv-actions">
                <button class="btn primary" disabled={busy() || !price()} onClick={pay}>
                  {busy() ? t("Ödeme sayfası açılıyor…") : price() ? t("Öde · {0}", fmtPrice(price()!.price, price()!.currency)) : t("Öde")}
                </button>
                <Show when={editId()}>
                  <button class="btn ghost" onClick={reset}>
                    {t("Yeni reklam")}
                  </button>
                </Show>
                <small class="muted">{t("Ödeme güvenli ödeme sayfasında yapılır. Reklamlar kurallara aykırıysa yayından kaldırılabilir.")}</small>
              </div>
            </section>
          </Show>

          <section class="panel">
            <h3>{t("Reklamlarım")}</h3>
            <div class="adv-list">
              <For each={mine() ?? []} fallback={<p class="muted small">{mine.loading ? t("Yükleniyor…") : t("Henüz reklamın yok.")}</p>}>
                {(a) => (
                  <div class="adv-wrap" classList={{ open: statsOpen() === a.id }}>
                  <div class="adv-item">
                    <img src={adImageUrl(a.image)} alt="" loading="lazy" />
                    <div class="adv-info">
                      <div>
                        <span class={`ads-chip ${AD_STATUS[a.status as AdStatus]?.tone ?? ""}`}>{t(AD_STATUS[a.status as AdStatus]?.label ?? a.status)}</span>{" "}
                        <b data-no-i18n>{a.title}</b>
                      </div>
                      <small class="muted">
                        {t(AD_PLACEMENTS[a.placement]?.label ?? a.placement)} ·{" "}
                        {a.model === "days" ? t("{0} gün", a.quantity) : t("{0} gösterim", nf(a.quantity))} · {fmtPrice(Number(a.price), a.currency)}
                      </small>
                      <small class="muted">
                        {t("{0} gösterim · {1} tıklama", nf(a.impressions), nf(a.clicks))}
                        <Show when={a.impressions > 0}> · {t("oran {0}", `%${((a.clicks / a.impressions) * 100).toLocaleString(localeTag(), { maximumFractionDigits: 2 })}`)}</Show>
                        <Show when={a.model === "impressions" && a.status !== "unpaid"}> · {t("{0} gösterim kaldı", nf(Math.max(0, a.quantity - a.impressions)))}</Show>
                        <Show when={a.ends_at}> · {t("bitiş: {0}", fmtTime(a.ends_at))}</Show>
                      </small>
                      <Show when={a.review_note && (a.status === "rejected" || a.status === "paused")}>
                        <small class="error">{a.review_note}</small>
                      </Show>
                    </div>
                    <div class="adv-acts">
                      <Show when={a.status !== "unpaid" && a.status !== "rejected"}>
                        <button class="btn small" classList={{ primary: statsOpen() === a.id }} onClick={() => setStatsOpen(statsOpen() === a.id ? null : a.id)}>
                          <I.Activity /> {t("İstatistik")}
                        </button>
                      </Show>
                      <Show when={a.status === "unpaid"}>
                        <button class="btn primary small" onClick={() => act(() => openCheckout(a.id))}>
                          {t("Öde")}
                        </button>
                        <button class="btn ghost small" onClick={() => edit(a)}>
                          <I.Pencil /> {t("Düzenle")}
                        </button>
                        <button class="btn ghost small danger" onClick={() => confirm(t("Bu reklam silinsin mi?")) && act(() => adDelete(a.id))}>
                          {t("Sil")}
                        </button>
                      </Show>
                      <Show when={a.status === "active" && a.model === "impressions"}>
                        <button class="btn ghost small" onClick={() => act(() => adOwnerPause(a.id, true))}>
                          {t("Durdur")}
                        </button>
                      </Show>
                      <Show when={a.status === "paused_owner"}>
                        <button class="btn ghost small" onClick={() => act(() => adOwnerPause(a.id, false))}>
                          {t("Sürdür")}
                        </button>
                      </Show>
                    </div>
                  </div>
                  <Show when={statsOpen() === a.id}>
                    <AdStatsPanel ad={a} />
                  </Show>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>
      </Show>
    </div>
  );
}
