// Yönetim › PRO özellikleri: hangi özelliğin PRO'ya özel, hangisinin herkese açık olduğu.
// Katalog programdan gelir (src/sdk/proFeatures.ts: uygulama özellikleri + her overlay'in kendisi, her ayarı ve
// seçim alanlarının her seçeneği); açılınca sunucuya da yazılır, böylece web sitesindeki yönetim paneli de aynı
// listeyi gösterir. Kararlar pro_features tablosunda; overlay'in tamamı app_config.pro_overlays'te (Rust da okur).
// Diğer programlar 5 dakikada bir / pencere öne gelince günceller.

import { For, Index, Show, createComputed, createMemo, createResource, createSignal, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { takeAdminFocus } from "./adminFocus";
import { localeTag } from "@/sdk/i18n";
import { cloudEnabled } from "@/cloud/supabase";
import { config } from "@/cloud/account";
import {
  adminProFeatures,
  adminSetProFeature,
  adminSetProFeatures,
  adminSyncProCatalog,
  isOverlayKey,
  proFeatureCatalog,
  proOverrides,
  type AdminProFeatureRow,
  type ProKind,
} from "@/sdk/proFeatures";
import "./adminPro.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const GROUP_ORDER = ["Paylaşım", "Topluluk", "Sosyal", "Takımlar", "Telemetri", "Görünüm", "Ses", "Araçlar", "Canlı Sohbet", "Overlay'ler"];

interface Row {
  /** Listedeki benzersiz kimlik (aynı anahtar iki grupta görünebilir) */
  id: string;
  key: string;
  label: string;
  group: string;
  sub: string;
  sub2: string;
  kind: ProKind;
  hint: string;
  defaultPro: boolean;
  /** Yöneticinin kararı (null: varsayılan) */
  pro: boolean | null;
  server: boolean;
  updatedAt: string | null;
  updatedBy: string;
  /** Bu programın kataloğunda yok (eski/yeni sürümden gelen karar) */
  foreign: boolean;
}

const fmtTime = (v: string | null) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "");
const effective = (r: Row) => r.pro ?? r.defaultPro;
const changed = (r: Row) => r.pro !== null;

type Filter = "all" | "changed" | "pro" | "free";

const KIND_TAG: Record<ProKind, string> = { feature: "", overlay: "Overlay", setting: "Ayar", option: "Seçenek" };

export function AdminProFeatures(p: { run: Run }) {
  const [srv, { refetch }] = createResource(() => (cloudEnabled ? adminProFeatures().catch(() => [] as AdminProFeatureRow[]) : Promise.resolve([])));
  // Moderasyon kaydından gelindiyse arama kutusu dolu açılır
  const [q, setQ] = createSignal(takeAdminFocus("profeatures")?.q ?? "");
  const [filter, setFilter] = createSignal<Filter>("all");
  const [synced, setSynced] = createSignal<string>("");
  /** Elle açılan / kapanan alt başlıklar (grup|alt) */
  const [openSubs, setOpenSubs] = createSignal<Record<string, boolean>>({});

  onMount(() => {
    if (!cloudEnabled) return;
    adminSyncProCatalog()
      .then(() => setSynced("ok"))
      .catch((e) => setSynced(String((e as Error).message)));
  });

  const fresh = createMemo<Row[]>(() => {
    const byKey = new Map((srv() ?? []).map((r) => [r.key, r]));
    const ov = proOverrides();
    const proOverlays = new Set(config()?.pro_overlays ?? []);
    const out: Row[] = proFeatureCatalog().map((f) => {
      const s = byKey.get(f.key);
      const isOv = isOverlayKey(f.key);
      const pro = isOv ? (proOverlays.has(f.key.slice(8)) ? true : null) : s ? s.pro : typeof ov[f.key] === "boolean" ? ov[f.key] : null;
      return {
        id: `${f.group}|${f.key}`,
        key: f.key,
        label: f.label,
        group: f.group,
        sub: f.sub ?? "",
        sub2: f.sub2 ?? "",
        kind: f.kind ?? "feature",
        hint: f.hint ?? "",
        defaultPro: f.defaultPro,
        pro: pro ?? null,
        server: !!f.server,
        updatedAt: isOv ? null : (s?.updated_at ?? null),
        updatedBy: isOv ? "" : (s?.updated_by_name ?? ""),
        foreign: false,
      };
    });
    const known = new Set(out.map((r) => r.key));
    for (const s of srv() ?? []) {
      if (known.has(s.key) || isOverlayKey(s.key)) continue;
      out.push({
        id: `?|${s.key}`,
        key: s.key,
        label: s.label || s.key,
        group: s.grp || "Diğer",
        sub: "",
        sub2: "",
        kind: "feature",
        hint: "",
        defaultPro: s.default_pro,
        pro: s.pro,
        server: false,
        updatedAt: s.updated_at,
        updatedBy: s.updated_by_name,
        foreign: true,
      });
    }
    return out;
  });
  // Satırlar yerinde güncellenir (anahtara göre aynı nesne kalır): bir ayar değişince liste baştan çizilmez,
  // sayfa en üste atlamaz
  const [rowStore, setRowStore] = createStore<Row[]>([]);
  createComputed(() => setRowStore(reconcile(fresh(), { key: "id", merge: true })));
  const rows = () => rowStore;

  const narrowing = () => !!q().trim() || filter() !== "all";

  const visible = createMemo(() => {
    const words = q().toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
    const f = filter();
    return rows().filter((r) => {
      if (f === "changed" && !changed(r)) return false;
      if (f === "pro" && !effective(r)) return false;
      if (f === "free" && effective(r)) return false;
      const hay = `${r.label} ${r.sub} ${r.sub2} ${r.group} ${r.key} ${r.hint}`.toLocaleLowerCase("tr");
      return words.every((w) => hay.includes(w));
    });
  });

  /** grup → alt başlık → satırlar */
  const tree = createMemo(() => {
    const g = new Map<string, Map<string, Row[]>>();
    for (const r of visible()) {
      if (!g.has(r.group)) g.set(r.group, new Map());
      const subs = g.get(r.group)!;
      if (!subs.has(r.sub)) subs.set(r.sub, []);
      subs.get(r.sub)!.push(r);
    }
    return g;
  });
  // Liste anahtarları metin: For aynı grubu / alt başlığı yeniden oluşturmaz (yerinde güncellenir)
  const groupNames = createMemo(
    () => {
      const rank = (x: string) => (GROUP_ORDER.indexOf(x) < 0 ? 99 : GROUP_ORDER.indexOf(x));
      return [...tree().keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "tr"));
    },
    [],
    { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  const subNames = (grp: string) => [...(tree().get(grp)?.keys() ?? [])];
  const listOf = (grp: string, sub: string) => tree().get(grp)?.get(sub) ?? [];
  const sameRows = (a: Row[], b: Row[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  const countOf = (list: Row[]) => {
    const keys = new Map(list.map((r) => [r.key, r]));
    const all = [...keys.values()];
    return { total: all.length, pro: all.filter(effective).length, changed: all.filter(changed).length };
  };
  const counts = createMemo(() => countOf(rows()));

  // Yedek önlem: kaydırma konumunu yenilemeden sonra geri koy
  let sectionEl: HTMLElement | undefined;
  const keepScroll = async (fn: () => unknown) => {
    const boxes: [Element, number][] = [];
    for (let e: Element | null = sectionEl ?? null; e; e = e.parentElement) if (e.scrollTop > 0) boxes.push([e, e.scrollTop]);
    const se = document.scrollingElement;
    if (se && se.scrollTop > 0 && !boxes.some(([e]) => e === se)) boxes.push([se, se.scrollTop]);
    await fn();
    requestAnimationFrame(() => boxes.forEach(([e, top]) => Math.abs(e.scrollTop - top) > 2 && (e.scrollTop = top)));
  };

  const set = (r: Row, pro: boolean | null) => {
    p.run(async () => {
      await adminSetProFeature(r.key, pro);
      await keepScroll(refetch);
    }, pro === null ? "Varsayılana döndü" : pro ? "PRO yapıldı" : "Herkese açıldı");
  };

  const bulk = (list: Row[], pro: boolean | null, label = "") => {
    const items: Record<string, boolean | null> = {};
    for (const r of list) {
      // Overlay'in tamamında "herkese açık" = listeden çıkar (varsayılan zaten herkese açık)
      const want = isOverlayKey(r.key) && pro === false ? null : pro;
      if (want === null ? r.pro !== null : r.pro !== want) items[r.key] = want;
    }
    const n = Object.keys(items).length;
    if (!n) return;
    const what = pro === null ? "varsayılana döndürülsün" : pro ? "PRO yapılsın" : "herkese açılsın";
    if (!confirm(`${label ? label + ": " : ""}${n} özellik ${what} mı?`)) return;
    p.run(async () => {
      await adminSetProFeatures(items);
      await keepScroll(refetch);
    }, `${n} özellik güncellendi`);
  };

  const Counts = (c: { list: Row[] }) => {
    const n = createMemo(() => countOf(c.list));
    return (
      <span class="apf-counts">
        <span class="apf-cnt pro" title="PRO">
          {n().pro} PRO
        </span>
        <span class="apf-cnt" title="Herkese açık">
          {n().total - n().pro} açık
        </span>
        <Show when={n().changed}>
          <span class="apf-cnt chg" title="Varsayılandan farklı">
            {n().changed} değişti
          </span>
        </Show>
      </span>
    );
  };

  const BulkBtns = (b: { list: Row[]; label: string }) => (
    <span class="apf-bulk" onClick={(e) => e.stopPropagation()}>
      <button class="btn ghost small" onClick={(e) => (e.preventDefault(), bulk(b.list, true, b.label))} title="Listelenenlerin hepsi PRO'ya özel olsun">
        Hepsi PRO
      </button>
      <button class="btn ghost small" onClick={(e) => (e.preventDefault(), bulk(b.list, false, b.label))} title="Listelenenlerin hepsi herkese açık olsun">
        Hepsi açık
      </button>
      <Show when={b.list.some(changed)}>
        <button class="btn ghost small" onClick={(e) => (e.preventDefault(), bulk(b.list, null, b.label))} title="Listelenenlerdeki kararları kaldır">
          Varsayılana dön
        </button>
      </Show>
    </span>
  );

  const RowView = (x: { r: Row; nested?: boolean }) => {
    const r = x.r;
    return (
      <div class="apf-row" classList={{ changed: changed(r), nested: !!x.nested, ovrow: r.kind === "overlay" }}>
        <div class="apf-main">
          <div class="apf-label">
            {r.label}
            <Show when={KIND_TAG[r.kind]}>
              <span class="apf-tag">{KIND_TAG[r.kind]}</span>
            </Show>
            <Show when={r.server}>
              <span class="apf-tag" title="Sunucu da bu kurala göre izin verir / reddeder">
                Sunucu
              </span>
            </Show>
            <Show when={r.foreign}>
              <span class="apf-tag warn" title="Bu programın kataloğunda yok (başka bir sürümden)">
                Bilinmeyen
              </span>
            </Show>
          </div>
          <small class="muted">
            <Show when={r.hint}>{r.hint} · </Show>
            <code data-no-i18n>{r.key}</code> · Varsayılan: {r.defaultPro ? "PRO" : "Herkese açık"}
            <Show when={changed(r) && r.updatedAt}>
              {" "}
              · Değiştiren: {r.updatedBy || "—"}, {fmtTime(r.updatedAt)}
            </Show>
          </small>
        </div>
        <div class="apf-ctl">
          <div class="apf-seg" role="group">
            <button classList={{ on: effective(r), pro: true }} onClick={() => !effective(r) && set(r, true)}>
              PRO
            </button>
            <button classList={{ on: !effective(r) }} onClick={() => effective(r) && set(r, isOverlayKey(r.key) ? null : false)}>
              Herkese açık
            </button>
          </div>
          <button class="btn ghost small" disabled={!changed(r)} onClick={() => set(r, null)} title="Kararı kaldır, varsayılan geçerli olsun">
            Varsayılana dön
          </button>
        </div>
      </div>
    );
  };

  /** Alt başlığın satırları: seçim alanlarının seçenekleri kendi başlığı altında */
  const SubRows = (x: { list: Row[] }) => {
    const parts = createMemo(() => {
      const out: { head: string; rows: Row[] }[] = [];
      for (const r of x.list) {
        const last = out[out.length - 1];
        if (last && last.head === r.sub2) last.rows.push(r);
        else out.push({ head: r.sub2, rows: [r] });
      }
      return out;
    });
    // Index: parçalar sırasıyla yerinde güncellenir (satır nesneleri aynı kaldığı için DOM korunur)
    return (
      <Index each={parts()}>
        {(pt) => (
          <Show when={pt().head} fallback={<For each={pt().rows}>{(r) => <RowView r={r} />}</For>}>
            <div class="apf-sub2">
              <span>
                Seçim: <b>{pt().head}</b>
              </span>
              <Counts list={pt().rows} />
              <Show when={pt().rows.length > 1}>
                <BulkBtns list={pt().rows} label={pt().head} />
              </Show>
            </div>
            <For each={pt().rows}>{(r) => <RowView r={r} nested />}</For>
          </Show>
        )}
      </Index>
    );
  };

  const subOpen = (id: string) => narrowing() || !!openSubs()[id];

  return (
    <section class="panel admin-panel apf" ref={sectionEl}>
      <h3>PRO özellikleri</h3>
      <p class="muted small">
        Her özelliğin PRO üyelere mi özel, yoksa herkese mi açık olduğunu buradan seçersin: uygulama özellikleri, her overlay'in kendisi, her ayarı ve seçim
        alanlarının her seçeneği. Karar vermediğin özellikler varsayılan davranışta kalır. PRO olmayan kullanıcılar kilitli özellikleri görmeye devam eder ama
        kullanamaz ("PRO" rozeti, kısa açıklama ve "PRO'ya bak" bağlantısı). Kilitli bir overlay ayarı PRO olmayanlarda varsayılan değerinde kalır. Değişiklik
        açık programlara birkaç dakika içinde (ya da pencere öne geldiğinde) yansır. "Sunucu" işaretli özellikleri sunucu da denetler.
      </p>
      <p class="muted small">
        "Overlay'in kendisi" satırları Planlar ve fiyatlar › PRO overlay'ler listesiyle aynıdır (orada da değiştirilebilir). Yeni overlay, ayar ve seçenekler bu
        listeye kendiliğinden eklenir; manifestte <code data-no-i18n>pro: true</code> işaretli seçenekler varsayılan olarak PRO'dur.
      </p>
      <Show when={synced() && synced() !== "ok"}>
        <p class="error small">Katalog sunucuya yazılamadı (web sitesi paneli eski listeyi gösterebilir): {synced()}</p>
      </Show>

      <div class="apf-stats">
        <span>
          <b>{counts().total}</b> özellik
        </span>
        <span>
          <b>{counts().pro}</b> PRO
        </span>
        <span>
          <b>{counts().total - counts().pro}</b> herkese açık
        </span>
        <span>
          <b>{counts().changed}</b> değiştirilmiş
        </span>
      </div>

      <div class="apf-tools">
        <input class="input" type="search" placeholder="Ara (ad, overlay, ayar, anahtar)…" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <select class="input" value={filter()} onChange={(e) => setFilter(e.currentTarget.value as Filter)}>
          <option value="all">Tümü</option>
          <option value="changed">Değiştirilmiş</option>
          <option value="pro">PRO olanlar</option>
          <option value="free">Herkese açık olanlar</option>
        </select>
        <button
          class="btn ghost small"
          disabled={!counts().changed}
          onClick={() => bulk(rows(), null, "Tüm liste")}
          title="Bütün kararları kaldır: her özellik varsayılan davranışına döner"
        >
          Tümünü varsayılana döndür
        </button>
      </div>

      <Show when={!srv.loading || srv()} fallback={<p class="muted">Yükleniyor…</p>}>
        <Show when={groupNames().length} fallback={<p class="muted">Eşleşen özellik yok.</p>}>
          <For each={groupNames()}>
            {(grp) => {
              const all = createMemo(() => subNames(grp).flatMap((sn) => listOf(grp, sn)), [], { equals: sameRows });
              const subs = createMemo(() => subNames(grp), [], { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) });
              return (
                <div class="apf-group">
                  <div class="apf-ghead">
                    <h4>{grp}</h4>
                    <Counts list={all()} />
                    <BulkBtns list={all()} label={grp} />
                  </div>
                  <For each={subs()}>
                    {(subName) => {
                      const list = createMemo(() => listOf(grp, subName), [], { equals: sameRows });
                      return (
                      <Show when={subName} fallback={<SubRows list={list()} />}>
                        <details class="apf-subbox" open={subOpen(`${grp}|${subName}`)}>
                          <summary
                            class="apf-shead"
                            onClick={(e) => {
                              e.preventDefault();
                              const id = `${grp}|${subName}`;
                              setOpenSubs({ ...openSubs(), [id]: !subOpen(id) });
                            }}
                          >
                            <span class="apf-caret">{subOpen(`${grp}|${subName}`) ? "▾" : "▸"}</span>
                            <b>{subName}</b>
                            <Counts list={list()} />
                            <Show when={list().length > 1}>
                              <BulkBtns list={list()} label={subName} />
                            </Show>
                          </summary>
                          <Show when={subOpen(`${grp}|${subName}`)}>
                            <SubRows list={list()} />
                          </Show>
                        </details>
                      </Show>
                      );
                    }}
                  </For>
                </div>
              );
            }}
          </For>
        </Show>
      </Show>
    </section>
  );
}
