// Reklam ver (uygulama içinden): yer, fiyat modeli (gösterim paketi / gün) ve paket seçilir; başlık, kısa metin,
// bağlantı ve görsel girilir; canlı önizleme ve sunucunun hesapladığı fiyat görünür. "Kaydet ve öde" reklamı kaydeder
// (ad_save) ve ödeme kutusunu açar: yöneticinin ödeme bağlantıları (ByNoGame, Patreon …) ve tutar. Reklam veren öder,
// kullanıcı adını / sipariş numarasını yazıp "Ödedim" der (ad_pay_claim); yönetici kontrol edip "Ödendi say" deyince
// reklam yayına girer. Altta "Reklamlarım": durum, istatistik, öde / düzenle / sil / durdur / sürdür.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { config, fmtPrice, inTurkey } from "@/cloud/account";
import {
  AD_PLACEMENTS,
  AD_STATUS,
  adPayClaim,
  adPayLinks,
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
import { go, openUrl, sub } from "../ui";
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

  // Ödeme kutusu açık reklam (kaydedince kendiliğinden açılır)
  const [payFor, setPayFor] = createSignal<string | null>(null);
  const openPay = (id: string) => {
    setPayFor(id);
    setTimeout(() => document.querySelector(`[data-ad="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
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
      await refetch();
      openPay(id);
      setMsg(t("Reklamın kaydedildi. Aşağıdaki ödeme kutusundan öde ve \"Ödedim\" de."));
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
                  {busy() ? t("Kaydediliyor…") : price() ? t("Kaydet ve öde · {0}", fmtPrice(price()!.price, price()!.currency)) : t("Kaydet ve öde")}
                </button>
                <Show when={editId()}>
                  <button class="btn ghost" onClick={reset}>
                    {t("Yeni reklam")}
                  </button>
                </Show>
                <small class="muted">{t("Ödeme kontrol edilince reklamın yayına girer. Reklamlar kurallara aykırıysa yayından kaldırılabilir.")}</small>
              </div>
            </section>
          </Show>

          <section class="panel">
            <h3>{t("Reklamlarım")}</h3>
            <div class="adv-list">
              <For each={mine() ?? []} fallback={<p class="muted small">{mine.loading ? t("Yükleniyor…") : t("Henüz reklamın yok.")}</p>}>
                {(a) => (
                  <div class="adv-wrap" data-ad={a.id} classList={{ open: statsOpen() === a.id || payFor() === a.id }}>
                  <div class="adv-item">
                    <img src={adImageUrl(a.image)} alt="" loading="lazy" />
                    <div class="adv-info">
                      <div>
                        <Show
                          when={a.status === "unpaid" && a.pay_claimed_at}
                          fallback={<span class={`ads-chip ${AD_STATUS[a.status as AdStatus]?.tone ?? ""}`}>{t(AD_STATUS[a.status as AdStatus]?.label ?? a.status)}</span>}
                        >
                          <span class="ads-chip warn">{t("Ödeme kontrol ediliyor")}</span>
                        </Show>{" "}
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
                        <button class="btn small" classList={{ primary: !a.pay_claimed_at }} onClick={() => setPayFor(payFor() === a.id ? null : a.id)}>
                          {a.pay_claimed_at ? t("Ödeme bilgisi") : t("Öde")}
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
                  <Show when={payFor() === a.id && a.status === "unpaid"}>
                    <PayBox ad={a} onDone={() => (refetch(), setMsg(t("Ödeme bildirimin alındı. Kontrol edilince reklamın yayına girer; sana bildirim gelir.")))} />
                  </Show>
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

/** Ödeme kutusu: tutar, yöneticinin ödeme bağlantıları ve "Ödedim" bildirimi */
function PayBox(p: { ad: AdCampaign; onDone: () => void }) {
  const links = () => adPayLinks();
  const [method, setMethod] = createSignal(p.ad.pay_method || links()[0]?.name || "");
  const [ref, setRef] = createSignal(p.ad.pay_ref ?? "");
  const [note, setNote] = createSignal(p.ad.pay_note ?? "");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const send = async () => {
    if (!method() || !ref().trim()) return setErr(t("Ödeme yöntemini seç ve kullanıcı adını / sipariş numarasını yaz."));
    setErr("");
    setBusy(true);
    try {
      await adPayClaim(p.ad.id, method(), ref().trim(), note().trim());
      p.onDone();
    } catch (x) {
      setErr(String((x as Error)?.message ?? x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="adpay">
      <div class="adpay-amount">
        <small class="muted">{t("Ödenecek tutar")}</small>
        <b>{fmtPrice(Number(p.ad.price), p.ad.currency)}</b>
        <small class="muted">
          {t(AD_PLACEMENTS[p.ad.placement]?.label ?? p.ad.placement)} · {p.ad.model === "days" ? t("{0} gün", p.ad.quantity) : t("{0} gösterim", nf(p.ad.quantity))}
        </small>
      </div>
      <Show when={links().length} fallback={<p class="muted">{t("Ödeme yöntemleri henüz tanımlanmadı. Lütfen daha sonra tekrar dene ya da destekten yaz.")}</p>}>
        <div class="adpay-steps">
          <b>{t("1. Bu yöntemlerden biriyle öde")}</b>
          <For each={links()}>
            {(l) => (
              <div class="adpay-opt" classList={{ on: method() === l.name }}>
                <label>
                  <input type="radio" name={`adpay-${p.ad.id}`} checked={method() === l.name} onChange={() => setMethod(l.name)} />
                  <b data-no-i18n>{l.name}</b>
                </label>
                <Show when={l.note}>
                  <small data-no-i18n>{l.note}</small>
                </Show>
                <button class="btn small" onClick={() => (setMethod(l.name), openUrl(l.url))}>
                  <I.ExternalLink /> {t("{0} ile öde", l.name)}
                </button>
              </div>
            )}
          </For>
          <b>{t("2. Ödeme yaptıktan sonra bildir")}</b>
          <input class="input" maxLength={120} placeholder={t("{0} kullanıcı adın ya da sipariş numarası", method() || "")} value={ref()} onInput={(e) => setRef(e.currentTarget.value)} />
          <input class="input" maxLength={500} placeholder={t("Not (isteğe bağlı)")} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
          <Show when={err()}>
            <p class="error">{err()}</p>
          </Show>
          <div class="adv-actions">
            <button class="btn primary" disabled={busy()} onClick={send}>
              {p.ad.pay_claimed_at ? t("Bildirimi güncelle") : t("Ödedim, bildir")}
            </button>
            <Show when={p.ad.pay_claimed_at}>
              <small class="muted">{t("Bildirildi: {0}. Kontrol edilince reklamın yayına girer.", fmtTime(p.ad.pay_claimed_at))}</small>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
