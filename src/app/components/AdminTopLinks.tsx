// Yönetim › Üst çubuk bağlantıları (c61): üst çubuğun en solunda gösterilen bağlantı düğmeleri.
// Ekle / düzenle / sil / sırala, hazır simge ya da kendi simgen (.png / .ico), kimin göreceği, açık / kapalı.
// Kayıt: admin_set_top_links(jsonb). Kendi simgeler 'site' kovasına toplinks/<id>-<zaman>.<uzantı> adıyla yüklenir.

import { For, Show, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { api, publicUrl, storageUpload } from "@/cloud/supabase";
import { loadConfig } from "@/cloud/account";
import { TOP_ICONS, TOP_LINKS_MAX, defaultTopLinks, okLinkUrl, topLinks, type TopAudience, type TopIcon, type TopLink } from "@/cloud/topLinks";
import { TOP_ICON_META, TopLinkIcon, TopLinksBar } from "./TopLinks";
import * as I from "../icons";
import "./topLinks.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const BUCKET = "site";
const MAX_ICON = 512 * 1024;
const AUDS: [TopAudience, string][] = [
  ["guest", "Giriş yapmayan"],
  ["member", "Üye"],
  ["pro", "PRO"],
];

const clone = (l: TopLink[]): TopLink[] => JSON.parse(JSON.stringify(l));
const newId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isIco = (f: File) => /^image\/(x-icon|vnd\.microsoft\.icon)$/.test(f.type) || /\.ico$/i.test(f.name);

/** Simgeyi tarayıcı çözebiliyorsa en fazla 128 px'lik PNG'ye çevirir (.ico ve .svg dahil); çözemezse null */
async function toPng(f: File): Promise<Blob | null> {
  const src = URL.createObjectURL(f);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error("decode"));
      img.src = src;
    });
    const w = img.naturalWidth || 64;
    const h = img.naturalHeight || 64;
    const k = Math.min(1, 128 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function AdminTopLinks(props: { run: Run }) {
  const [list, setList] = createSignal<TopLink[]>(clone(topLinks()));
  const [dirty, setDirty] = createSignal(false);
  const [openId, setOpenId] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [as, setAs] = createSignal<TopAudience | "admin">("member");

  const change = (l: TopLink[]) => {
    setList(l);
    setDirty(true);
  };
  const patch = (id: string, p: Partial<TopLink>) => change(list().map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const l = [...list()];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    change(l);
  };
  const add = () => {
    const l: TopLink = { id: newId(), label: "", url: "https://", icon: "link", image: "", audiences: { guest: true, member: true, pro: true }, enabled: true };
    change([...list(), l]);
    setOpenId(l.id);
  };
  const remove = (id: string) => change(list().filter((x) => x.id !== id));

  const problem = (l: TopLink) => (!l.label.trim() ? t("Ad boş olamaz") : !okLinkUrl(l.url.trim()) ? t("Adres http:// ya da https:// ile başlamalı, boşluk ve tırnak içermemeli") : "");
  const invalid = () => list().some((l) => problem(l));

  const preview = () => list().filter((l) => l.enabled && !problem(l) && (as() === "admin" || l.audiences[as() as TopAudience]));

  const upload = (l: TopLink, f: File) =>
    props.run(async () => {
      if (!/^image\/(png|x-icon|vnd\.microsoft\.icon|webp|jpeg|gif|svg\+xml)$/.test(f.type) && !isIco(f)) throw new Error(t("Sadece PNG, ICO, WebP, JPEG, GIF ya da SVG yüklenebilir"));
      if (f.size > MAX_ICON) throw new Error(t("Simge en fazla 512 KB olabilir"));
      setBusy(l.id);
      try {
        const png = await toPng(f);
        let body: Blob = f;
        let type = f.type;
        let ext = "png";
        if (png) {
          body = png;
          type = "image/png";
        } else if (isIco(f)) {
          // Tarayıcı .ico'yu çözemedi: olduğu gibi yüklenir
          type = "image/x-icon";
          ext = "ico";
        } else {
          throw new Error(t("Simge okunamadı; PNG ya da ICO dene"));
        }
        const path = `toplinks/${l.id}-${Date.now()}.${ext}`;
        await storageUpload(BUCKET, path, body, type, true);
        patch(l.id, { icon: "custom", image: publicUrl(BUCKET, path) });
      } finally {
        setBusy("");
      }
    }, "Simge yüklendi (kaydetmeyi unutma)");

  const save = () =>
    props.run(async () => {
      const bad = list().find((l) => problem(l));
      if (bad) {
        setOpenId(bad.id);
        throw new Error(problem(bad));
      }
      const body = list().map((l) => ({
        id: l.id,
        label: l.label.trim().slice(0, 40),
        url: l.url.trim(),
        icon: l.icon === "custom" && !l.image ? "link" : l.icon,
        image: l.icon === "custom" ? (l.image ?? "") : "",
        audiences: { guest: !!l.audiences.guest, member: !!l.audiences.member, pro: !!l.audiences.pro },
        enabled: !!l.enabled,
      }));
      await api("POST", "rpc/admin_set_top_links", { body: { p_links: body } });
      await loadConfig();
      setList(clone(topLinks()));
      setDirty(false);
    }, "Üst çubuk bağlantıları kaydedildi");

  const reset = () => {
    change(defaultTopLinks());
    setOpenId("");
  };

  return (
    <section class="panel admin-panel">
      <h3>Üst çubuk bağlantıları</h3>
      <small class="muted">
        Programın üst çubuğunun en solunda (ve web sitesinin alt bilgisinde) gösterilen bağlantı düğmeleri: web sitesi, Discord, WhatsApp… Her bağlantıyı kimin
        göreceğini seçebilirsin. Hazır simgeler genel çizimlerdir; dilersen kendi simgeni (.png / .ico) yükle. Değişiklik programlara birkaç dakika içinde (en geç
        açılışta) ulaşır.
      </small>

      <div class="atl-preview">
        <small class="muted">Önizleme</small>
        <TopLinksBar links={preview()} max={8} preview />
        <Show when={!preview().length}>
          <small class="muted">Bu görünümde gösterilecek bağlantı yok.</small>
        </Show>
        <div class="atl-preview-tabs seg">
          <For each={[...AUDS, ["admin", "Yönetici"] as [TopAudience | "admin", string]]}>
            {([id, label]) => (
              <button classList={{ on: as() === id }} onClick={() => setAs(id)}>
                {id === "pro" ? <span data-no-i18n>PRO</span> : label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="atl-list">
        <For each={list().map((x) => x.id)}>
          {(lid, i) => {
            // Satır kimliğe göre sabit kalır (yazarken satır yeniden oluşup yazı kutusu odağı kaybetmesin);
            // `l` her okunuşta listedeki güncel bağlantıyı verir
            const snap = list().find((x) => x.id === lid)!;
            const l = new Proxy({} as TopLink, { get: (_, k) => (list().find((x) => x.id === lid) ?? snap)[k as keyof TopLink] });
            let file: HTMLInputElement | undefined;
            return (
              <div class="atl-item" classList={{ off: !l.enabled }}>
                <div class="atl-head">
                  <TopLinkIcon link={l} />
                  <div class="atl-title" onClick={() => setOpenId(openId() === l.id ? "" : l.id)}>
                    <b data-no-i18n>{l.label || "—"}</b>
                    <small data-no-i18n>{l.url}</small>
                  </div>
                  <div class="atl-auds">
                    <For each={AUDS.filter(([a]) => l.audiences[a])}>{([a, label]) => (a === "pro" ? <i data-no-i18n>PRO</i> : <i>{label}</i>)}</For>
                  </div>
                  <div class="atl-acts">
                    <label class="switch" title="Açık / kapalı">
                      <input type="checkbox" checked={l.enabled} onChange={(e) => patch(l.id, { enabled: e.currentTarget.checked })} />
                      <i />
                    </label>
                    <button class="btn ghost small" title="Yukarı taşı" disabled={i() === 0} onClick={() => move(i(), -1)}>
                      <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                        <I.ChevronDown />
                      </span>
                    </button>
                    <button class="btn ghost small" title="Aşağı taşı" disabled={i() === list().length - 1} onClick={() => move(i(), 1)}>
                      <I.ChevronDown />
                    </button>
                    <button class="btn ghost small" title="Düzenle" onClick={() => setOpenId(openId() === l.id ? "" : l.id)}>
                      <I.Pencil />
                    </button>
                    <button class="btn ghost small danger" title="Sil" onClick={() => remove(l.id)}>
                      <I.Trash />
                    </button>
                  </div>
                </div>
                <Show when={openId() === l.id}>
                  <div class="atl-body">
                    <label class="atl-f">
                      <small>Ad (düğmenin üzerine gelince görünür)</small>
                      <input class="input" maxLength={40} value={l.label} placeholder="ör. Discord" onInput={(e) => patch(l.id, { label: e.currentTarget.value })} />
                    </label>
                    <label class="atl-f">
                      <small>Adres</small>
                      <input class="input" maxLength={500} value={l.url} placeholder="https://…" spellcheck={false} onInput={(e) => patch(l.id, { url: e.currentTarget.value })} />
                    </label>
                    <Show when={problem(l)}>
                      <span class="atl-err wide">{problem(l)}</span>
                    </Show>
                    <div class="atl-f wide">
                      <small>Simge</small>
                      <div class="atl-icons">
                        <For each={TOP_ICONS.filter((k) => k !== "custom")}>
                          {(k) => (
                            <button classList={{ on: l.icon === k }} title={TOP_ICON_META[k as Exclude<TopIcon, "custom">].name} onClick={() => patch(l.id, { icon: k })}>
                              <TopLinkIcon link={{ icon: k }} />
                            </button>
                          )}
                        </For>
                        <Show when={l.image}>
                          <button classList={{ on: l.icon === "custom" }} title="Kendi simgen" onClick={() => patch(l.id, { icon: "custom" })}>
                            <TopLinkIcon link={{ icon: "custom", image: l.image }} />
                          </button>
                        </Show>
                      </div>
                      <div class="btns">
                        <button class="btn ghost small" disabled={busy() === l.id} onClick={() => file?.click()}>
                          {busy() === l.id ? "Yükleniyor…" : l.image ? "Simgeyi değiştir" : "Kendi simgeni yükle"}
                        </button>
                        <Show when={l.image}>
                          <button class="btn ghost small danger" onClick={() => patch(l.id, { image: "", icon: l.icon === "custom" ? "link" : l.icon })}>
                            Simgeyi kaldır
                          </button>
                        </Show>
                        <small class="muted">PNG ya da ICO, en fazla 512 KB; kare ve saydam zeminli olması önerilir.</small>
                        <input
                          ref={file}
                          type="file"
                          accept=".png,.ico,.webp,.jpg,.jpeg,.gif,.svg,image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg,image/gif,image/svg+xml"
                          hidden
                          onChange={(e) => {
                            const f = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (f) void upload(l, f);
                          }}
                        />
                      </div>
                    </div>
                    <div class="atl-f wide">
                      <small>Kimler görsün</small>
                      <div class="atl-checks">
                        <For each={AUDS}>
                          {([a, label]) => (
                            <label>
                              <input type="checkbox" checked={l.audiences[a]} onChange={(e) => patch(l.id, { audiences: { ...l.audiences, [a]: e.currentTarget.checked } })} />
                              {a === "pro" ? <span data-no-i18n>PRO</span> : <span>{label}</span>}
                            </label>
                          )}
                        </For>
                      </div>
                      <small class="muted">Yöneticiler açık olan bütün bağlantıları görür.</small>
                    </div>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
        <Show when={!list().length}>
          <p class="muted">Henüz bağlantı yok. Üst çubukta bağlantı düğmesi gösterilmez.</p>
        </Show>
      </div>

      <div class="atl-foot">
        <button class="btn ghost" disabled={list().length >= TOP_LINKS_MAX} onClick={add}>
          <I.Plus /> Bağlantı ekle
        </button>
        <small class="muted">{t("{0} / {1} bağlantı", list().length, TOP_LINKS_MAX)}</small>
        <span class="sp" />
        <button class="btn ghost" onClick={reset}>
          Varsayılanlara dön
        </button>
        <button class="btn primary" disabled={!dirty() || invalid()} onClick={save}>
          Kaydet
        </button>
      </div>
    </section>
  );
}
