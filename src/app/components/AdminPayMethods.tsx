// Yönetim › Planlar: ödeme yöntemleri. Hazır yöntemleri (otomatik planlar, Patreon) gizleme ve kendi ödeme
// bağlantılarını (ör. ByNoGame ilanı) başlık + açıklamayla ekleme. app_config.pay_methods (c94) içinde saklanır;
// uygulamadaki Hesap sayfası ve web sitesi (ana sayfa fiyatlar, hesap sayfası) aynı kaydı okur.
import { For, Index, Show, createResource, createSignal } from "solid-js";
import { adminPayClaimDone, adminPayClaims, adminChangePro, config, payMethods, saveConfig, payImgOk, type PayCat, type PayClaim, type PayLink, type PayMethods, type PayPatreon } from "@/cloud/account";
import { localeTag } from "@/sdk/i18n";
import { t } from "@/sdk/i18n";
import * as I from "../icons";

export function AdminPayMethods() {
  const [draft, setDraft] = createSignal<PayMethods | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
  const cur = (): PayMethods => draft() ?? payMethods(config());
  const patch = (p: Partial<PayMethods>) => (setDraft({ ...cur(), ...p }), setMsg(null));
  const links = () => cur().links ?? [];
  const setLink = (i: number, p: Partial<PayLink>) => patch({ links: links().map((l, n) => (n === i ? { ...l, ...p } : l)) });
  const pat = (): PayPatreon => cur().patreon ?? {};
  const setPat = (p: Partial<PayPatreon>) => patch({ patreon: { ...pat(), ...p } });
  /** Elle eklenmiş "Patreon" kategorisi (sabit kategoriye aktarılabilir) */
  const ownPatreon = () => cats().find((k) => k.title.trim().toLowerCase() === "patreon");
  /** Kendi Patreon kategorindeki logo, görseller, fiyat ve adresleri sabit Patreon'a taşır; kendi kategorin ve bağlantıları silinir */
  const importPatreon = () => {
    const k = ownPatreon();
    if (!k) return;
    const l = links().find((x) => x.cat === k.id);
    patch({
      hide_patreon: false,
      patreon: { img: k.img || pat().img, badges: k.badges?.length ? k.badges : pat().badges, price: l?.price ?? pat().price, url: l?.url ?? pat().url, price_intl: l?.price_intl ?? pat().price_intl, url_intl: l?.url_intl ?? pat().url_intl },
      cats: cats().filter((x) => x.id !== k.id),
      links: links().filter((x) => x.cat !== k.id),
    });
  };
  const cats = () => cur().cats ?? [];
  const badges = () => cur().badges ?? [];
  const setCat = (i: number, p: Partial<PayCat>) => patch({ cats: cats().map((k, n) => (n === i ? { ...k, ...p } : k)) });
  /** Bağlantıyı kendi kategorisi içinde bir yukarı / aşağı taşı */
  const move = (i: number, d: number) => {
    const l = [...links()];
    const same = l.map((x, n) => ((x.cat || "") === (l[i].cat || "") ? n : -1)).filter((n) => n >= 0);
    const j = same[same.indexOf(i) + d];
    if (j === undefined) return;
    [l[i], l[j]] = [l[j], l[i]];
    patch({ links: l });
  };
  const moveCat = (i: number, d: number) => {
    const k = [...cats()];
    const j = i + d;
    if (j < 0 || j >= k.length) return;
    [k[i], k[j]] = [k[j], k[i]];
    patch({ cats: k });
  };
  const addCat = () => patch({ cats: [...cats(), { id: Math.random().toString(36).slice(2, 10), title: "", note: "", img: "", on: true }] });
  /** Kategori silinince bağlantıları kategorisiz kalır (silinmez) */
  const delCat = (i: number) => {
    const id = cats()[i].id;
    patch({ cats: cats().filter((_, n) => n !== i), links: links().map((l) => (l.cat === id ? { ...l, cat: "" } : l)) });
  };
  const addLink = (cat: string) => patch({ links: [...links(), { title: "", price: "", url: "", price_intl: "", url_intl: "", note: "", on: true, cat }] });
  /** Bu kategorideki bağlantıların düz listedeki sıra numaraları */
  const idxOf = (cat: string) => links().map((l, n) => ((l.cat || "") === cat ? n : -1)).filter((n) => n >= 0);
  /** Seçilen resmi küçültüp (en çok 440×140) gömülü adrese çevirir; ayar kaydı şişmesin diye 60 KB üstü reddedilir */
  const pickImg = (done: (url: string) => void) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      const src = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const w0 = im.naturalWidth || 320;
        const h0 = im.naturalHeight || 96;
        const k = Math.min(1, 440 / w0, 140 / h0);
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(w0 * k));
        cv.height = Math.max(1, Math.round(h0 * k));
        cv.getContext("2d")!.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(src);
        let url = cv.toDataURL("image/webp", 0.9);
        if (!url.startsWith("data:image/webp")) url = cv.toDataURL("image/png");
        if (url.length > 80_000 || !payImgOk(url)) return void setMsg({ ok: false, text: t("Görsel çok büyük ya da okunamadı; daha küçük bir logo seç") });
        done(url);
      };
      im.onerror = () => (URL.revokeObjectURL(src), setMsg({ ok: false, text: t("Görsel çok büyük ya da okunamadı; daha küçük bir logo seç") }));
      im.src = src;
    };
    inp.click();
  };
  const save = async () => {
    const d = draft();
    if (!d) return;
    // Adres http(s) olmalı; başlığı ve adresi boş satırlar kaydedilmez
    const clean = (d.links ?? [])
      .map((l) => ({ ...l, title: l.title.trim(), price: (l.price ?? "").trim(), url: l.url.trim(), price_intl: (l.price_intl ?? "").trim(), url_intl: (l.url_intl ?? "").trim(), tr_only: false, note: l.note.trim() }))
      .filter((l) => l.title || l.url || l.url_intl);
    const okUrl = (u: string) => !u || /^https?:\/\/\S+$/i.test(u);
    const pt = d.patreon ?? {};
    if (![pt.url ?? "", pt.url_intl ?? ""].every((u) => okUrl(u.trim()))) return void setMsg({ ok: false, text: t('"{0}" için geçerli bir adres yaz (https:// ile başlamalı)', "Patreon") });
    const cleanCats = (d.cats ?? []).map((k) => ({ ...k, title: k.title.trim(), note: k.note.trim() }));
    const bad = clean.find((l) => !okUrl(l.url) || !okUrl(l.url_intl) || (!l.url && !l.url_intl));
    if (bad) return void setMsg({ ok: false, text: t('"{0}" için geçerli bir adres yaz (https:// ile başlamalı)', bad.title || "?") });
    setBusy(true);
    try {
      await saveConfig({ pay_methods: { ...d, links: clean, cats: cleanCats, patreon: { ...pt, price: (pt.price ?? "").trim(), url: (pt.url ?? "").trim(), price_intl: (pt.price_intl ?? "").trim(), url_intl: (pt.url_intl ?? "").trim() } } });
      setDraft(null);
      setMsg({ ok: true, text: t("Ödeme yöntemleri kaydedildi") });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  // "Ödedim" bildirimleri: üye kendi bağlantınla ödeyip kullanıcı adını / e-postasını gönderdi
  const [claims, { refetch: refetchClaims }] = createResource(() => adminPayClaims().catch(() => [] as PayClaim[]));
  const [claimBusy, setClaimBusy] = createSignal("");
  /** Bildirim başına "logo izni" kutusu (varsayılan işaretli: ödeme yapan üye yayın logosuna müdahale edebilir) */
  const [claimLogo, setClaimLogo] = createSignal<Record<string, boolean>>({});
  const proText = (c: PayClaim) => {
    const u = c.pro_until ? new Date(c.pro_until).getTime() : 0;
    return u > Date.now() ? t("PRO: {0} tarihine kadar", new Date(u).toLocaleDateString(localeTag())) : t("PRO değil");
  };
  /** Üyeye PRO süresi ekle (kalan sürenin üstüne) ve bildirimi tamamlandı işaretle */
  const grant = async (c: PayClaim, months: number) => {
    setClaimBusy(c.id);
    setMsg(null);
    try {
      const base = Math.max(Date.now(), c.pro_until ? new Date(c.pro_until).getTime() : 0);
      const until = new Date(base);
      until.setMonth(until.getMonth() + months);
      await adminChangePro(c.user_id, "set", { until, logo: claimLogo()[c.id] !== false, note: c.method });
      await adminPayClaimDone(c.id, true);
      setMsg({ ok: true, text: t("{0} için {1} aylık PRO tanımlandı", c.display_name, months) });
      await refetchClaims();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setClaimBusy("");
    }
  };
  const markDone = async (c: PayClaim, done: boolean) => {
    setClaimBusy(c.id);
    try {
      await adminPayClaimDone(c.id, done);
      await refetchClaims();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setClaimBusy("");
    }
  };
  const Hide = (p: { k: "hide_plans" | "hide_patreon" | "hide_coupon"; title: string; sub: string }) => (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <small>{p.sub}</small>
      </div>
      <label class="switch">
        <input type="checkbox" checked={!cur()[p.k]} onChange={(e) => patch({ [p.k]: !e.currentTarget.checked })} />
        <i />
      </label>
    </div>
  );
  const LinkEdit = (p: { n: number }) => {
    const l = () => links()[p.n] ?? ({ title: "", url: "", note: "" } as PayLink);
    const same = () => idxOf(l().cat || "");
    return (
      <div class="paylink-edit">
        <div class="paylink-edit-row">
          <input class="input" maxLength={60} placeholder="Başlık (boşsa süre yazılır)" value={l().title} onInput={(e) => setLink(p.n, { title: e.currentTarget.value })} />
          <select class="input paylink-months" title={t("Süre: 1 aydan uzunsa kartta aylık karşılığı yazılır")} onChange={(e) => setLink(p.n, { months: Number(e.currentTarget.value) })}>
            <For each={[0, 1, 3, 6, 12]}>
              {(m) => (
                <option value={m} selected={(l().months ?? 0) === m}>
                  {m ? t("{0} ay", m) : t("Süre yok")}
                </option>
              )}
            </For>
          </select>
          <select class="input paylink-months" onChange={(e) => setLink(p.n, { tag: e.currentTarget.value })}>
            <option value="" selected={!l().tag}>
              {t("Etiket yok")}
            </option>
            <option value="popular" selected={l().tag === "popular"}>
              {t("Popüler")}
            </option>
            <option value="best" selected={l().tag === "best"}>
              {t("En avantajlı")}
            </option>
          </select>
          <select class="input paylink-cat" onChange={(e) => setLink(p.n, { cat: e.currentTarget.value })}>
            <option value="" selected={!l().cat}>
              {t("Kategorisiz")}
            </option>
            <For each={cats()}>
              {(k) => (
                <option value={k.id} selected={l().cat === k.id} data-no-i18n>
                  {k.title || "?"}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="paylink-edit-row">
          <span class="paylink-reg">Türkiye</span>
          <input class="input paylink-price" maxLength={30} placeholder="Fiyat (ör. 150 TL)" title={t("Para birimini tutarın yanına yaz (₺, TL, $, €, USD…); aylık karşılık aynı simgeyle gösterilir")} value={l().price ?? ""} onInput={(e) => setLink(p.n, { price: e.currentTarget.value })} />
          <input class="input" maxLength={400} placeholder="https://…" data-no-i18n value={l().url} onInput={(e) => setLink(p.n, { url: e.currentTarget.value })} />
        </div>
        <div class="paylink-edit-row">
          <span class="paylink-reg">Yurt dışı</span>
          <input class="input paylink-price" maxLength={30} placeholder="Fiyat (ör. $5)" title={t("Para birimini tutarın yanına yaz (₺, TL, $, €, USD…); aylık karşılık aynı simgeyle gösterilir")} value={l().price_intl ?? ""} onInput={(e) => setLink(p.n, { price_intl: e.currentTarget.value })} />
          <input class="input" maxLength={400} placeholder="https://…" data-no-i18n value={l().url_intl ?? ""} onInput={(e) => setLink(p.n, { url_intl: e.currentTarget.value })} />
        </div>
        <small class="muted">Adresini boş bıraktığın bölgede bu bağlantı gösterilmez.</small>
        <textarea
          class="input"
          rows={2}
          maxLength={1000}
          placeholder="Bu bağlantının açıklaması (Öde penceresinde görünür): hangi ilan, ödeme sonrası ne yapılacak…"
          value={l().note}
          onInput={(e) => setLink(p.n, { note: e.currentTarget.value })}
        />
        <div class="paylink-edit-row">
          <label class="check">
            <input type="checkbox" checked={l().on !== false} onChange={(e) => setLink(p.n, { on: e.currentTarget.checked })} />
            <span>Göster</span>
          </label>
          <label class="check" title="Açıkken üye bu bağlantının penceresinde ödeme bilgilerini yazıp sana bildirim gönderebilir">
            <input type="checkbox" checked={!!l().claim} onChange={(e) => setLink(p.n, { claim: e.currentTarget.checked })} />
            <span>"Satın alım yaptım" bildirimi</span>
          </label>
          <span class="lt-sp" />
          <button class="btn ghost small" disabled={same()[0] === p.n} onClick={() => move(p.n, -1)} title="Yukarı taşı">
            ↑
          </button>
          <button class="btn ghost small" disabled={same()[same().length - 1] === p.n} onClick={() => move(p.n, 1)} title="Aşağı taşı">
            ↓
          </button>
          <button class="btn ghost small danger" onClick={() => patch({ links: links().filter((_, n) => n !== p.n) })}>
            Sil
          </button>
        </div>
      </div>
    );
  };
  return (
    <section class="panel admin-panel">
      <h3>Ödeme yöntemleri</h3>
      <p class="muted small">
        Hesap sayfasında ve web sitesinde hangi ödeme yöntemlerinin görüneceğini seç, kendi ödeme bağlantılarını ekle. Kendi bağlantınla (ör. ByNoGame) yapılan
        ödemede PRO kendiliğinden açılmaz: ödemeyi görünce üyeye PRO'yu Üyeler bölümünden elle tanımlarsın; açıklamaya üyenin ne yapması gerektiğini yaz.
      </p>
      <Hide k="hide_plans" title="Otomatik ödemeler (Paddle planları)" sub="1 / 3 / 6 / 12 aylık abonelik düğmeleri ve hediye PRO'nun mağaza düğmeleri. Mağaza hazır değilken kapat." />
      <Hide k="hide_patreon" title="Patreon" sub="Sabit Patreon kategorisi: başlık ve açıklama yerleşiktir, arayüzün ve sitenin diline göre kendiliğinden çevrilir" />
      <div class="paycat-edit" classList={{ off: !!cur().hide_patreon }}>
        <div class="paylink-edit-row">
          <button class="paycat-img" title={t("Logo seç")} onClick={() => pickImg((u) => setPat({ img: u }))}>
            <Show when={pat().img} fallback={<span>Logo</span>}>
              <img src={pat().img} alt="" />
            </Show>
          </button>
          <b data-no-i18n>Patreon</b>
          <Show when={pat().img}>
            <button class="btn ghost small" onClick={() => setPat({ img: "" })}>
              Logoyu kaldır
            </button>
          </Show>
          <span class="lt-sp" />
          <Show when={ownPatreon()}>
            <button class="btn small" onClick={importPatreon} title={t("Kendi eklediğin Patreon kategorisindeki logo, görseller, fiyat ve adresler buraya taşınır; kendi kategorin silinir. Kaydet'e basınca uygulanır.")}>
              Kendi Patreon kategorimden aktar
            </button>
          </Show>
        </div>
        <small class="muted">{t("Yalnızca aylık abonelik alınır. Patreon'da buradaki e-posta adresini kullandığında SRTR Pitwall PRO kendiliğinden açılır.")}</small>
        <div class="paybadge-edit">
          <small class="muted">Ödeme yöntemi görselleri (açıklamanın altında):</small>
          <For each={pat().badges ?? []}>
            {(b, bi) => (
              <span class="paybadge-item">
                <img src={b} alt="" />
                <button class="icon-btn" title={t("Kaldır")} onClick={() => setPat({ badges: (pat().badges ?? []).filter((_, n) => n !== bi()) })}>
                  <I.X />
                </button>
              </span>
            )}
          </For>
          <button class="btn ghost small" disabled={(pat().badges ?? []).length >= 10} onClick={() => pickImg((u) => setPat({ badges: [...(pat().badges ?? []), u] }))}>
            <I.Plus /> Görsel ekle
          </button>
        </div>
        <div class="paylink-edit-row">
          <span class="paylink-reg">Türkiye</span>
          <input class="input paylink-price" maxLength={30} placeholder="Fiyat (ör. $3)" title={t("Para birimini tutarın yanına yaz (₺, TL, $, €, USD…); aylık karşılık aynı simgeyle gösterilir")} value={pat().price ?? ""} onInput={(e) => setPat({ price: e.currentTarget.value })} />
          <input class="input" maxLength={400} placeholder="https://…" data-no-i18n value={pat().url ?? ""} onInput={(e) => setPat({ url: e.currentTarget.value })} />
        </div>
        <div class="paylink-edit-row">
          <span class="paylink-reg">Yurt dışı</span>
          <input class="input paylink-price" maxLength={30} placeholder="Fiyat (ör. $5)" title={t("Para birimini tutarın yanına yaz (₺, TL, $, €, USD…); aylık karşılık aynı simgeyle gösterilir")} value={pat().price_intl ?? ""} onInput={(e) => setPat({ price_intl: e.currentTarget.value })} />
          <input class="input" maxLength={400} placeholder="https://…" data-no-i18n value={pat().url_intl ?? ""} onInput={(e) => setPat({ url_intl: e.currentTarget.value })} />
        </div>
        <small class="muted">Adresini boş bıraktığın bölgede bu bağlantı gösterilmez.</small>
      </div>
      <Hide k="hide_coupon" title="İndirim kuponu kutusu" sub="Otomatik planların üstündeki kupon girme alanı" />
      <h4 class="paylink-h">Genel ödeme yöntemi görselleri</h4>
      <p class="muted small">Tüm ödeme bölümünün en altında yan yana gösterilir (ör. Visa, Mastercard, Troy logoları). Görseller kaydedilirken küçültülür.</p>
      <div class="paybadge-edit">
        <For each={badges()}>
          {(b, i) => (
            <span class="paybadge-item">
              <img src={b} alt="" />
              <button class="icon-btn" title={t("Kaldır")} onClick={() => patch({ badges: badges().filter((_, n) => n !== i()) })}>
                <I.X />
              </button>
            </span>
          )}
        </For>
        <button class="btn ghost small" disabled={badges().length >= 12} onClick={() => pickImg((u) => patch({ badges: [...badges(), u] }))}>
          <I.Plus /> Görsel ekle
        </button>
      </div>
      <h4 class="paylink-h">Kategoriler ve ödeme bağlantıların</h4>
      <p class="muted small">
        Her kategori (ör. ByNoGame) logosu, başlığı ve genel açıklamasıyla ayrı bir bölüm olarak görünür; içindeki bağlantılar plan kartı gibi (başlık, fiyat, "Öde")
        dizilir. Kategoriyi gizlersen programda ve sitede içindeki bağlantılarla birlikte kaybolur.
      </p>
      <Index each={cats()}>
        {(k, ci) => (
          <div class="paycat-edit" classList={{ off: k().on === false }}>
            <div class="paylink-edit-row">
              <button class="paycat-img" title={t("Logo seç")} onClick={() => pickImg((u) => setCat(ci, { img: u }))}>
                <Show when={k().img} fallback={<span>Logo</span>}>
                  <img src={k().img} alt="" />
                </Show>
              </button>
              <input class="input" maxLength={60} placeholder="Kategori başlığı (ör. ByNoGame)" value={k().title} onInput={(e) => setCat(ci, { title: e.currentTarget.value })} />
              <Show when={k().img}>
                <button class="btn ghost small" onClick={() => setCat(ci, { img: "" })}>
                  Logoyu kaldır
                </button>
              </Show>
            </div>
            <textarea
              class="input"
              rows={2}
              maxLength={1000}
              placeholder="Kategorinin genel açıklaması: nasıl ödenir, PRO ne zaman tanımlanır, yenileme / iade koşulları…"
              value={k().note}
              onInput={(e) => setCat(ci, { note: e.currentTarget.value })}
            />
            <div class="paybadge-edit">
              <small class="muted">Ödeme yöntemi görselleri (açıklamanın altında):</small>
              <For each={k().badges ?? []}>
                {(b, bi) => (
                  <span class="paybadge-item">
                    <img src={b} alt="" />
                    <button class="icon-btn" title={t("Kaldır")} onClick={() => setCat(ci, { badges: (k().badges ?? []).filter((_, n) => n !== bi()) })}>
                      <I.X />
                    </button>
                  </span>
                )}
              </For>
              <button class="btn ghost small" disabled={(k().badges ?? []).length >= 10} onClick={() => pickImg((u) => setCat(ci, { badges: [...(k().badges ?? []), u] }))}>
                <I.Plus /> Görsel ekle
              </button>
            </div>
            <div class="paylink-edit-row">
              <label class="check">
                <input type="checkbox" checked={k().on !== false} onChange={(e) => setCat(ci, { on: e.currentTarget.checked })} />
                <span>Kategoriyi göster</span>
              </label>
              <label class="check" title="Açıkken yalnızca Türkiye'den bağlananlar (saat dilimi Türkiye) görür">
                <input type="checkbox" checked={!!k().tr_only} onChange={(e) => setCat(ci, { tr_only: e.currentTarget.checked })} />
                <span>Yalnızca Türkiye</span>
              </label>
              <span class="lt-sp" />
              <button class="btn ghost small" disabled={ci === 0} onClick={() => moveCat(ci, -1)} title="Yukarı taşı">
                ↑
              </button>
              <button class="btn ghost small" disabled={ci === cats().length - 1} onClick={() => moveCat(ci, 1)} title="Aşağı taşı">
                ↓
              </button>
              <button class="btn ghost small danger" onClick={() => delCat(ci)} title="Kategori silinir; içindeki bağlantılar kategorisiz kalır">
                Kategoriyi sil
              </button>
            </div>
            <For each={idxOf(k().id)}>{(n) => <LinkEdit n={n} />}</For>
            <button class="btn ghost small" disabled={links().length >= 40} onClick={() => addLink(k().id)}>
              <I.Plus /> Bu kategoriye bağlantı ekle
            </button>
          </div>
        )}
      </Index>
      <Show when={idxOf("").length > 0}>
        <div class="paycat-edit">
          <b>Kategorisiz bağlantılar</b>
          <small class="muted">Başlıksız bir grup olarak en üstte görünür. Bir kategoriye taşımak için bağlantının kategori kutusunu kullan.</small>
          <For each={idxOf("")}>{(n) => <LinkEdit n={n} />}</For>
        </div>
      </Show>
      <div class="btns">
        <button class="btn ghost" disabled={cats().length >= 10} onClick={addCat}>
          <I.Plus /> Kategori ekle
        </button>
        <button class="btn ghost" disabled={links().length >= 40} onClick={() => addLink("")}>
          <I.Plus /> Kategorisiz bağlantı ekle
        </button>
        <button class="btn primary" disabled={!draft() || busy()} onClick={save}>
          {busy() ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
      <Show when={msg()}>
        <p class={msg()!.ok ? "ok" : "error"} style={msg()!.ok ? { color: "#3ddc84" } : undefined}>
          {msg()!.text}
        </p>
      </Show>
      <h4 class="paylink-h">
        Ödeme bildirimleri{" "}
        <button class="btn ghost small" onClick={() => void refetchClaims()}>
          Yenile
        </button>
      </h4>
      <p class="muted small">
        "Satın alım yaptım" bildirimini açtığın bağlantıyla ödeyen üye bilgilerini gönderince burada listelenir; sana bildirim ve e-posta gelir. Ödemeyi ödeme sayfanda kontrol et, sonra süreyi seçip
        PRO'yu tanımla (kalan sürenin üstüne eklenir).
      </p>
      <Show when={(claims() ?? []).length > 0} fallback={<p class="muted small">Henüz bildirim yok.</p>}>
        <For each={claims() ?? []}>
          {(c) => (
            <div class="payclaim" classList={{ done: c.done }}>
              <div class="payclaim-main">
                <b data-no-i18n>{c.display_name}</b> <small class="muted" data-no-i18n>{c.email}</small>
                <small class="muted">
                  {" · "}
                  {new Date(c.created_at).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" })} · <span data-no-i18n>{c.method}</span> · {proText(c)}
                </small>
                <p data-no-i18n>{c.contact}</p>
                <Show when={c.note}>
                  <p class="payclaim-note" data-no-i18n>
                    {c.note}
                  </p>
                </Show>
              </div>
              <div class="payclaim-acts">
<label class="check" title={t("İşaretliyken tanımlanan sürenin sonuna kadar yayın logosunu kaldırabilir / taşıyabilir")}>
                  <input type="checkbox" checked={claimLogo()[c.id] !== false} onChange={(e) => setClaimLogo({ ...claimLogo(), [c.id]: e.currentTarget.checked })} />
                  <span>Logo izni</span>
                </label>
                <For each={[1, 3, 6, 12]}>
                  {(m) => (
                    <button class="btn ghost small" disabled={claimBusy() === c.id} onClick={() => void grant(c, m)} title={t("{0} aylık PRO tanımla ve tamamlandı işaretle", m)}>
                      +{m} {t("ay")}
                    </button>
                  )}
                </For>
                <button class="btn ghost small" disabled={claimBusy() === c.id} onClick={() => void markDone(c, !c.done)}>
                  {c.done ? "Geri al" : "Tamamlandı"}
                </button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  );
}
