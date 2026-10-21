// Yönetim › Reklamlar › Ana sayfa reklamları: uygulama ana sayfasının en üstündeki reklamlar. Yönetici görseli yükler,
// bağlantıyı yazar; ücretli reklam sisteminden ayrıdır (ödeme / onay yok). Birden çok etkin reklam sırayla döner.
// Hiç etkin reklam yoksa ana sayfanın üstünde ücretli reklam alanı (geniş banner) görünür.

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { homeBannerAdd, homeBannerDelete, homeBannerSave, homeBanners, liveBanners, okUrl, uploadHomeImage, type HomeBanner, type HomeBannerInput } from "@/cloud/home";
import * as I from "../icons";
import { go } from "../ui";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

/** datetime-local değeri ↔ ISO */
const toLocal = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const nf = (n: number) => Number(n || 0).toLocaleString(localeTag());

const EMPTY: HomeBannerInput = { image: "", url: "", title: "", active: true, show_pro: false, starts_at: null, ends_at: null, sort: 0 };

export function AdminHomeAds(p: { run: Run }) {
  const [list, { refetch }] = createResource(() => homeBanners().catch(() => [] as HomeBanner[]));
  const [editing, setEditing] = createSignal<string | "new" | null>(null);
  const live = () => new Set(liveBanners(list() ?? [], false).map((b) => b.id));
  const status = (b: HomeBanner) => {
    if (!b.active) return { label: t("Kapalı"), cls: "" };
    if (b.starts_at && new Date(b.starts_at).getTime() > Date.now()) return { label: t("Başlamadı"), cls: "warn" };
    if (b.ends_at && new Date(b.ends_at).getTime() <= Date.now()) return { label: t("Süresi bitti"), cls: "" };
    return { label: t("Yayında"), cls: "ok" };
  };
  const save = (id: string | null, v: HomeBannerInput) =>
    p.run(async () => {
      if (id) await homeBannerSave(id, v);
      else await homeBannerAdd(v);
      setEditing(null);
      await refetch();
    }, t("Reklam kaydedildi"));

  return (
    <section class="panel admin-panel">
      <h3>{t("Ana sayfa reklamları")}</h3>
      <p class="muted small">
        {t(
          "Uygulama ana sayfasının en üstünde görünür. Görseli yükle, tıklanınca açılacak adresi yaz. Birden çok reklam yayındaysa 8 saniyede bir sırayla döner. Hiç yayında reklam yoksa oraya ücretli reklam alanı gelir. PRO üyeler yalnızca \"PRO üyelere de göster\" işaretli reklamları görür. Önerilen boyut 1200 × 240 px.",
        )}
      </p>
      <div class="hads-bar">
        <button class="btn primary small" onClick={() => setEditing("new")}>
          <I.Plus /> {t("Reklam ekle")}
        </button>
        <button class="btn ghost small" onClick={() => go("home")}>
          <I.Newspaper /> {t("Ana sayfayı aç")}
        </button>
      </div>
      <Show when={editing() === "new"}>
        <BannerEditor run={p.run} value={EMPTY} onSave={(v) => save(null, v)} onCancel={() => setEditing(null)} />
      </Show>
      <div class="hads-list">
        <For each={list() ?? []} fallback={<p class="muted small">{list.loading ? t("Yükleniyor…") : t("Henüz ana sayfa reklamı yok.")}</p>}>
          {(b) => (
            <Show
              when={editing() !== b.id}
              fallback={<BannerEditor run={p.run} value={b} onSave={(v) => save(b.id, v)} onCancel={() => setEditing(null)} />}
            >
              <div class="hads-row" classList={{ off: !live().has(b.id) }}>
                <img src={b.image} alt="" />
                <div class="hads-info">
                  <div>
                    <span class={`ads-chip ${status(b).cls}`}>{status(b).label}</span>
                    <Show when={b.show_pro}>
                      <span class="hads-pro">{t("PRO'ya da")}</span>
                    </Show>
                    <b data-no-i18n> {b.title || "—"}</b>
                  </div>
                  <small class="muted" data-no-i18n>
                    {b.url || t("bağlantı yok")}
                  </small>
                  <small class="muted">
                    {t("{0} gösterim · {1} tıklama", nf(b.views), nf(b.clicks))}
                    <Show when={b.views > 0}> · %{((b.clicks / b.views) * 100).toFixed(1)}</Show>
                    <Show when={b.starts_at || b.ends_at}>
                      {" · "}
                      {b.starts_at ? new Date(b.starts_at).toLocaleDateString(localeTag()) : "…"} – {b.ends_at ? new Date(b.ends_at).toLocaleDateString(localeTag()) : "…"}
                    </Show>
                  </small>
                </div>
                <div class="hads-acts">
                  <button class="btn ghost small" onClick={() => p.run(async () => (await homeBannerSave(b.id, { active: !b.active }), await refetch()), b.active ? t("Reklam kapatıldı") : t("Reklam açıldı"))}>
                    {b.active ? t("Kapat") : t("Aç")}
                  </button>
                  <button class="btn ghost small" onClick={() => setEditing(b.id)}>
                    <I.Pencil /> {t("Düzenle")}
                  </button>
                  <button
                    class="btn ghost small danger"
                    onClick={() => confirm(t("Bu reklam silinsin mi?")) && p.run(async () => (await homeBannerDelete(b.id), await refetch()), t("Reklam silindi"))}
                  >
                    {t("Sil")}
                  </button>
                </div>
              </div>
            </Show>
          )}
        </For>
      </div>
    </section>
  );
}

function BannerEditor(p: { run: Run; value: HomeBannerInput; onSave: (v: HomeBannerInput) => void; onCancel: () => void }) {
  const [image, setImage] = createSignal(p.value.image);
  const [url, setUrl] = createSignal(p.value.url);
  const [title, setTitle] = createSignal(p.value.title);
  const [active, setActive] = createSignal(p.value.active);
  const [showPro, setShowPro] = createSignal(p.value.show_pro);
  const [from, setFrom] = createSignal(toLocal(p.value.starts_at));
  const [to, setTo] = createSignal(toLocal(p.value.ends_at));
  const [sort, setSort] = createSignal(String(p.value.sort ?? 0));
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  let file: HTMLInputElement | undefined;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    setBusy(true);
    try {
      setImage(await uploadHomeImage(f, "banners"));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
      if (file) file.value = "";
    }
  };
  const save = () => {
    if (!image()) return setErr(t("Önce görseli yükle."));
    if (url().trim() && !okUrl(url())) return setErr(t("Bağlantı https:// ile başlamalı."));
    if (from() && to() && new Date(to()) <= new Date(from())) return setErr(t("Bitiş, başlangıçtan sonra olmalı."));
    setErr("");
    p.onSave({
      image: image(),
      url: url().trim(),
      title: title().trim().slice(0, 120),
      active: active(),
      show_pro: showPro(),
      starts_at: fromLocal(from()),
      ends_at: fromLocal(to()),
      sort: parseInt(sort(), 10) || 0,
    });
  };
  return (
    <div class="hads-editor">
      <div class="hads-preview" onClick={() => file?.click()} title={t("Görsel seç")}>
        <Show when={image()} fallback={<span>{busy() ? t("Yükleniyor…") : t("Görsel yüklemek için tıkla (önerilen 1200 × 240 px)")}</span>}>
          <img src={image()} alt="" />
        </Show>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
      </div>
      <div class="hads-fields">
        <input class="input" placeholder={t("Tıklanınca açılacak adres (https://…, isteğe bağlı)")} value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
        <input class="input" placeholder={t("Ad / açıklama (fareyle üzerine gelince görünür)")} maxLength={120} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        <div class="hads-dates">
          <label>
            {t("Başlangıç")}
            <input class="input" type="datetime-local" value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
          </label>
          <label>
            {t("Bitiş")}
            <input class="input" type="datetime-local" value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
          </label>
          <label>
            {t("Sıra")}
            <input class="input hads-sort" type="number" value={sort()} onInput={(e) => setSort(e.currentTarget.value)} />
          </label>
        </div>
        <div class="hads-checks">
          <label>
            <input type="checkbox" checked={active()} onChange={(e) => setActive(e.currentTarget.checked)} /> {t("Yayında")}
          </label>
          <label>
            <input type="checkbox" checked={showPro()} onChange={(e) => setShowPro(e.currentTarget.checked)} /> {t("PRO üyelere de göster")}
          </label>
        </div>
        <Show when={err()}>
          <p class="error">{err()}</p>
        </Show>
        <div class="hads-bar">
          <button class="btn primary small" disabled={busy()} onClick={save}>
            {t("Kaydet")}
          </button>
          <button class="btn small" onClick={p.onCancel}>
            {t("Vazgeç")}
          </button>
          <small class="muted">{t("Boş tarih: hemen başlar / süresiz.")}</small>
        </div>
      </div>
    </div>
  );
}
