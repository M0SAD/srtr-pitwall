// Overlaylarım: genel sekme. Solda bütün overlay'ler, ortada seçilen overlay'in VARSAYILAN ayarları,
// sağda canlı önizleme. Buradaki ayarlar düzenlerden bağımsızdır: bir overlay bir düzene eklendiğinde bu ayarlarla
// gelir. Hangi overlay'in hangi düzende olduğu ve yerleşim Düzenler / Yayın sayfalarında yönetilir.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUpToLine from "lucide-solid/icons/arrow-up-to-line";
import type { OverlayManifest } from "@/sdk/overlay";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { hasOverlayOrder, moveOverlay, orderedOverlays, overlaySort, resetOverlayOrder, setCustomOverlayOrder, setOverlaySort } from "../components/OverlayPalette";
import { manifestById, manifests } from "@/sdk/registry";
import { DEFAULTS_ID, addToLayout, defaultProfileId, settings, uiPref, type OverlaySort } from "@/sdk/settings";
import { isAdmin, isHiddenOverlay, isLocked, isProOverlay, markedHiddenOverlay } from "@/cloud/account";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { SIM_FAMILIES, SIM_NAMES, SIM_SHORT, currentSim, overlaySupportsSim, supportedSims } from "@/overlays/simSupport";
import { OverlayView } from "../components/OverlayView";
import { OverlaySettings, previewVals } from "../components/OverlaySettings";
import { BACKDROPS, Backdrop, ScreenshotPicker, backdrop, pickCustomImage, setBackdrop } from "../components/Backdrop";
import { CATEGORY_NAMES, CategoryFilter, catFilter, catMatch, overlayIcon } from "../overlayIcons";
import { focusOverlay, openCard, setOpenCard } from "../ui";
import { sortProfiles } from "../components/LayoutList";
import * as I from "../icons";
import { appState } from "../App";
import { UndoRedo } from "@/sdk/UndoRedo";
import { t } from "@/sdk/i18n";

// Kapatılan (daraltılan) kategoriler, favoriler ve "Sadece favorilerim": hesapla birlikte buluta gider (uiPref)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const [collapsedRaw, setCollapsed] = uiPref<string[]>("ovCatCollapsed", [], "pw.ovcatCollapsed");
const collapsed = () => strList(collapsedRaw());
function toggleCategory(cat: string) {
  setCollapsed(collapsed().includes(cat) ? collapsed().filter((c) => c !== cat) : [...collapsed(), cat]);
}
// Favori overlay'ler (sağ tık > Favorilere ekle): listenin en üstünde "Favorilerim" altında durur
const FAV_CAT = "__fav";
// Sütun genişlikleri (overlay listesi, ayarlar): kenardan sürüklenir, sınırlıdır, hesapla birlikte hatırlanır
const COL = { list: [250, 420], set: [290, 520] } as const;
const [colListRaw, setColList] = uiPref<number>("ovColList", COL.list[0]);
const [colSetRaw, setColSet] = uiPref<number>("ovColSet", COL.set[0]);
const clampCol = (v: unknown, k: keyof typeof COL) => Math.min(COL[k][1], Math.max(COL[k][0], Math.round(Number(v) || COL[k][0])));
// En son overlay eklenen düzen: sayfa açılınca hedef düzen olarak seçili gelir
const [lastTarget, setLastTarget] = uiPref<string>("ovTarget", "");
const [favsRaw, setFavs] = uiPref<string[]>("ovFavs", [], "pw.ovFavs");
const favs = () => strList(favsRaw());
// Sırala > "Sadece favorilerim": liste yalnızca favorileri gösterir (seçili sıralama korunur)
const [favOnlyRaw, setFavOnly] = uiPref<boolean | string>("ovFavOnly", false, "pw.ovFavOnly");
const favOnly = () => favOnlyRaw() === true || favOnlyRaw() === "1";
function toggleFav(id: string) {
  setFavs(favs().includes(id) ? favs().filter((x) => x !== id) : [...favs(), id]);
}

export function OverlaysPage() {
  // Bağlı (ya da seçili) simde çalışmayan overlay'ler listeden gizlenir; ayarları korunur
  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  const supported = (type: string) => overlaySupportsSim(type, sim());
  // Seçili sıralamayla (en çok kullanılan / kategori / harf / kullanıcının kendi sırası)
  const shown = createMemo(() => orderedOverlays(manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && supported(m.id))));
  const shownIds = () => shown().map((m) => m.id);
  const move = (id: string, where: "up" | "down" | "top") => moveOverlay(id, where, shownIds());
  // Sağ tık menüsü: sırayı değiştir
  const [menu, setMenu] = createSignal<{ x: number; y: number; id: string } | null>(null);
  onMount(() => {
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    });
  });
  // --- Fareyle sürükleyerek sıralama (işaretçi olaylarıyla; webview'da HTML5 sürükle-bırak güvenilir değil) ---
  let scrollEl: HTMLDivElement | undefined;
  /** Sürüklenen overlay, işaretçinin konumu, bırakılacağı sıra (görünen listede) ve gösterge çizgisinin yeri */
  const [drag, setDrag] = createSignal<{ id: string; x: number; y: number; to: number; line: { top: number; left: number; width: number } } | null>(null);
  /** Sürükleme bittikten hemen sonra gelen tıklama seçimi değiştirmesin */
  let justDragged = false;
  /** Sürükleme sırasında liste kategorisiz düz sıraya geçer (kendi sırası olmayanlarda da); sıra bırakınca kaydedilir */
  const [flat, setFlat] = createSignal(false);
  let stopDrag: (() => void) | undefined;
  onCleanup(() => stopDrag?.());
  const startDrag = (id: string, e: PointerEvent) => {
    if (e.button !== 0) return;
    stopDrag?.();
    const sx = e.clientX;
    const sy = e.clientY;
    let px = sx;
    let py = sy;
    let active = false;
    let raf = 0;
    const src = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    const rows = () => [...(scrollEl?.querySelectorAll<HTMLElement>("[data-ovid]") ?? [])];
    const update = () => {
      const rs = rows().map((el) => el.getBoundingClientRect());
      if (!rs.length || !scrollEl) return;
      let to = 0;
      for (const r of rs) if (py > r.top + r.height / 2) to++;
      const box = scrollEl.getBoundingClientRect();
      const y = to < rs.length ? rs[to].top - 1 : rs[rs.length - 1].bottom + 1;
      setDrag({
        id,
        x: px,
        y: py,
        to,
        line: { top: Math.max(box.top, Math.min(box.bottom - 2, y)), left: rs[0].left, width: rs[0].width },
      });
    };
    /** Listenin üst / alt kenarına yaklaşınca kendiliğinden kayar */
    const tick = () => {
      raf = 0;
      if (!active || !scrollEl) return;
      const box = scrollEl.getBoundingClientRect();
      const edge = 36;
      let d = 0;
      if (py < box.top + edge) d = -Math.ceil(((box.top + edge - py) / edge) * 12);
      else if (py > box.bottom - edge) d = Math.ceil(((py - (box.bottom - edge)) / edge) * 12);
      if (d) {
        const before = scrollEl.scrollTop;
        scrollEl.scrollTop = before + Math.max(-24, Math.min(24, d));
        if (scrollEl.scrollTop !== before) update();
      }
      raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      px = ev.clientX;
      py = ev.clientY;
      if (!active) {
        if (Math.hypot(px - sx, py - sy) < 5) return;
        active = true;
        setMenu(null);
        setFlat(true);
        // İşaretçi pencere dışına çıksa da olaylar gelmeye devam etsin
        try {
          src.setPointerCapture(pid);
        } catch {}
        document.body.classList.add("ov-dragging");
        raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      update();
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      if (raf) cancelAnimationFrame(raf);
      document.body.classList.remove("ov-dragging");
      try {
        if (src.hasPointerCapture(pid)) src.releasePointerCapture(pid);
      } catch {}
      setFlat(false);
      stopDrag = undefined;
      const d = drag();
      setDrag(null);
      if (!active) return;
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      if (!commit || !d) return;
      const vis = shownIds();
      const from = vis.indexOf(id);
      if (from < 0 || d.to === from || d.to === from + 1) return;
      // Görünen sıradaki hedef komşunun önüne (sona bırakıldıysa son görünenin arkasına) yerleşir;
      // listede görünmeyen (gizli / bu simde çalışmayan) türler sıradaki yerlerini korur
      const rest = orderedOverlays().map((m) => m.id).filter((x) => x !== id);
      const visRest = vis.filter((x) => x !== id);
      const target = vis[d.to];
      if (target) rest.splice(rest.indexOf(target), 0, id);
      else rest.splice(rest.indexOf(visRest[visRest.length - 1]) + 1, 0, id);
      setCustomOverlayOrder(rest);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && active) {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    stopDrag = () => finish(false);
  };

  /** Listelenen overlay türü sayısı: gizlenenler ve seçili / bağlı simde çalışmayanlar hariç (Otomatik'te hepsi) */
  const totalTypes = () => shown().length;
  const hiddenBySim = () => manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && !supported(m.id)).length;
  const [shotsOpen, setShotsOpen] = createSignal(false);

  /** Seçili overlay türü (eski kayıtlardan "tür#2" gibi kopya anahtarı gelirse türüne indirgenir) */
  const selected = createMemo(() => {
    const k = (openCard() ?? "").split("#")[0];
    if (k && shown().some((m) => m.id === k)) return k;
    return shown()[0]?.id ?? null;
  });
  createEffect(() => {
    if (selected() && openCard() !== selected()) setOpenCard(selected());
  });
  const inst = () => (selected() ? settings().defaults[selected()!] : undefined);
  // Yukarı / aşağı ok: listede önceki / sonraki overlay (yazı alanı, seçim kutusu ya da kaydırıcıdayken dokunmaz)
  onMount(() => {
    const nav = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || menu() || drag()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Kapalı kategorilerdeki overlay'ler atlanır
      const ids = groups().flatMap(([cat, ms]) => (cat !== null && isCollapsed(cat) ? [] : ms.map((m) => m.id)));
      const i = ids.indexOf(selected() ?? "");
      const next = ids[Math.min(ids.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (!next) return;
      e.preventDefault();
      if (next === selected()) return;
      setOpenCard(next);
      requestAnimationFrame(() => document.querySelector(`[data-ovid="${next}"]`)?.scrollIntoView({ block: "nearest" }));
    };
    window.addEventListener("keydown", nav);
    onCleanup(() => window.removeEventListener("keydown", nav));
  });

  // --- "+ Overlay Ekle": seçili overlay'i Düzenler sayfasında seçili (etkin) düzene ekler ---
  /** Alttaki listeden seçilen hedef düzen (seçilmediyse Düzenler sayfasındaki etkin düzen) */
  const [pick, setPick] = createSignal<string | null>(null);
  const target = () => {
    const s = settings();
    const chosen = s.profiles[pick() ?? lastTarget() ?? ""];
    if (chosen) return chosen;
    const a = s.profiles[s.activeProfile];
    return a && a.rules.mode !== "stream" ? a : s.profiles[defaultProfileId(false, s) ?? ""];
  };
  /** Tek kopyalı overlay düzende zaten açık mı */
  const inLayout = (k: string | null = selected()) => {
    return !!k && !manifestById(k)?.multiInstance && !!target()?.overlays[k]?.enabled;
  };
  const [added, setAdded] = createSignal<string | null>(null);
  let addedTimer: number | undefined;
  onCleanup(() => clearTimeout(addedTimer));
  const say = (text: string) => {
    setAdded(text);
    clearTimeout(addedTimer);
    addedTimer = window.setTimeout(() => setAdded(null), 3500);
  };
  /** Düğme ve listede çift tık aynı işi yapar (düzende kapalı duran overlay yeniden açılır) */
  const addSelected = (k: string | null = selected()) => {
    const p = target();
    if (!k || !p) return;
    if (isLocked(k)) return say(t("Bu overlay PRO üyelere özel"));
    if (p.locked) return say(t('"{0}" düzeni kilitli: overlay eklenemez. Düzenler sayfasından kilidi aç.', p.name));
    if (inLayout(k)) return say(t('Bu overlay "{0}" düzeninde zaten var', p.name));
    const key = addToLayout(p.id, k);
    if (key) {
      say(t('{0}, "{1}" düzenine eklendi', manifestById(k)?.name ?? k, p.name));
      // Görüntü o düzenin ekranına geçer (yayın düzeniyse Yayın sayfası) ve eklenen overlay seçilir
      setLastTarget(p.id);
      focusOverlay(key, p.id);
    }
  };
  const addTitle = () => {
    const k = selected();
    const p = target();
    if (!k || !p) return "";
    if (isLocked(k)) return t("Bu overlay PRO üyelere özel");
    if (p.locked) return t('"{0}" düzeni kilitli: overlay eklenemez. Düzenler sayfasından kilidi aç.', p.name);
    if (inLayout()) return t('Bu overlay "{0}" düzeninde zaten var', p.name);
    return t('Seçili overlay\'i "{0}" düzenine ekler (Düzenler sayfasında seçili düzen)', p.name);
  };

  // Önizlenen overlay sabit görüntü: seçilince bir anlık örnek veri, sonra akış durur (Demo açıksa canlı)
  const snap = useSnapshot(
    () => manifestById(selected() ?? "")?.topics ?? [],
    // Seçim ya da önizlenen overlay'in ayarı değişince bir tur daha oynar
    () => [selected(), JSON.stringify(inst()?.options ?? null)],
    () => appState().demo,
  );

  const isCollapsed = (cat: string) => collapsed().includes(cat);
  /** Arama kutusu (overlay adı) */
  const [q, setQ] = createSignal("");
  const fold = (v: string) => v.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  /** Kategori başlıklı gruplar yalnızca "Kategoriye göre" sıralamada; diğerlerinde (ve sürüklerken) tek düz liste */
  const groupsAll = createMemo((): [string | null, OverlayManifest[]][] => {
    // Arama: ada (çevirisi ve Türkçesi) göre süzülmüş tek düz liste
    const needle = fold(q().trim());
    if (needle) return [[null, shown().filter((m) => fold(t(m.name)).includes(needle) || fold(m.name).includes(needle))]];
    if (flat()) return [[null, shown()]];
    const fv = shown().filter((m) => favs().includes(m.id));
    if (favOnly()) return [[null, fv]];
    const rest = fv.length ? shown().filter((m) => !favs().includes(m.id)) : shown();
    const head: [string | null, OverlayManifest[]][] = fv.length ? [[FAV_CAT, fv]] : [];
    if (overlaySort() !== "category") return [...head, [null, rest]];
    const g = new Map<string, OverlayManifest[]>(head as [string, OverlayManifest[]][]);
    for (const m of rest) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...g.entries()];
  });
  const groups = createMemo((): [string | null, OverlayManifest[]][] => {
    // Kategori süzgeci (arama kutusunun altındaki menü): boş kalan gruplar çizilmez
    const c = catFilter();
    if (!c) return groupsAll();
    return groupsAll().map(([k, ms]): [string | null, OverlayManifest[]] => [k, ms.filter((m) => catMatch(m))]).filter(([k, ms]) => ms.length > 0 || k === null);
  });

  // Liste, grup dizisinin kendisiyle değil grup ANAHTARIYLA (kategori adı; başlıksız grup "") çizilir. groups() her yeniden
  // hesaplandığında (ayar / yönetici yapılandırması / sim değişimi) yeni [kategori, liste] çiftleri üretir; For bunları yeni öğe
  // sayıp bütün listeyi baştan kuruyor, kaydırma çubuğu da en üste dönüyordu. Anahtarlar aynı kaldıkça DOM ve kaydırma korunur.
  const groupKeys = createMemo(() => groups().map(([c]) => c ?? ""), undefined, { equals: (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]) });
  const groupItems = (key: string) => groups().find(([c]) => (c ?? "") === key)?.[1] ?? [];

  // Sütun genişletme: sürüklerken yerel değer, bırakınca kaydedilir (çift tık: varsayılana döner)
  const [dragCol, setDragCol] = createSignal<{ k: keyof typeof COL; v: number } | null>(null);
  const colW = (k: keyof typeof COL) => (dragCol()?.k === k ? dragCol()!.v : clampCol(k === "list" ? colListRaw() : colSetRaw(), k));
  const saveCol = (k: keyof typeof COL, v: number) => (k === "list" ? setColList(v) : setColSet(v));
  const startCol = (k: keyof typeof COL, e: PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = colW(k);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDragCol({ k, v: w0 });
    const move = (ev: PointerEvent) => setDragCol({ k, v: clampCol(w0 + ev.clientX - x0, k) });
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const v = dragCol()?.v ?? w0;
      setDragCol(null);
      if (v !== w0) saveCol(k, v);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div class="ovpage" classList={{ resizing: !!dragCol() }} style={{ "grid-template-columns": `${colW("list")}px ${colW("set")}px minmax(0, 1fr)` }}>
      <div class="ovcol-grip" classList={{ on: dragCol()?.k === "list" }} style={{ left: `${colW("list") - 4}px` }} title="Genişletmek için sürükle (çift tık: varsayılan)" onPointerDown={(e) => startCol("list", e)} onDblClick={() => saveCol("list", COL.list[0])} />
      <div class="ovcol-grip" classList={{ on: dragCol()?.k === "set" }} style={{ left: `${colW("list") + colW("set") - 4}px` }} title="Genişletmek için sürükle (çift tık: varsayılan)" onPointerDown={(e) => startCol("set", e)} onDblClick={() => saveCol("set", COL.set[0])} />
      <Show when={menu()}>
        {(() => {
          const m = menu()!;
          const idx = () => shownIds().indexOf(m.id);
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            setMenu(null);
            fn();
          };
          return (
            <div
              class="ovmenu"
              style={{ left: `${Math.max(4, Math.min(m.x, window.innerWidth - 240))}px`, top: `${Math.max(4, Math.min(m.y, window.innerHeight - 240))}px` }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button onPointerUp={run(() => toggleFav(m.id))}>
                <I.Star /> {favs().includes(m.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
              </button>
              <button disabled={idx() <= 0} onPointerUp={run(() => move(m.id, "up"))}>
                <ArrowUp /> Yukarı taşı
              </button>
              <button disabled={idx() < 0 || idx() >= shownIds().length - 1} onPointerUp={run(() => move(m.id, "down"))}>
                <ArrowDown /> Aşağı taşı
              </button>
              <button disabled={idx() <= 0} onPointerUp={run(() => move(m.id, "top"))}>
                <ArrowUpToLine /> En üste taşı
              </button>
              <button disabled={!hasOverlayOrder()} onPointerUp={run(() => resetOverlayOrder())}>
                <I.RotateCcw /> Sıralamayı sıfırla
              </button>
            </div>
          );
        })()}
      </Show>
      <Show when={drag()}>
        {(d) => (
          <>
            <div class="ovdrop-line" style={{ top: `${d().line.top}px`, left: `${d().line.left}px`, width: `${d().line.width}px` }} />
            <div class="ovdrag-ghost" style={{ left: `${d().x + 12}px`, top: `${d().y - 16}px` }}>
              <span class="ovitem-ic">{overlayIcon(d().id)}</span>
              <span class="ovitem-name">{manifestById(d().id)?.name}</span>
            </div>
          </>
        )}
      </Show>
      <aside class="ovlist">
        <div class="ovlist-profile">
          <span class="ovlist-total" title={sim() ? t("{0} için kullanılabilir overlay türü sayısı", SIM_NAMES[sim()!]) : t("Kullanılabilir overlay türü sayısı")}>
            {t("{0} overlay", totalTypes())}
          </span>
          <span class="lt-sp" />
          <UndoRedo keys class="ur-panel" />
        </div>
        <label class="ovlist-search">
          <I.Search />
          <input type="search" value={q()} placeholder={t("Overlay ara")} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Escape" && (setQ(""), e.stopPropagation())} />
        </label>
        <CategoryFilter />
        <div class="ovlist-scroll" ref={scrollEl}>
          <Show when={q().trim() && !groups()[0]?.[1].length}>
            <div class="ovlist-simnote">Bu adla bir overlay yok.</div>
          </Show>
          <div class="ovlist-hint">Çift tık: düzene ekle</div>
          <label
            class="ovlist-sort"
            title={t("Bu sıra Düzenler ve Yayın sayfalarındaki overlay listesinde de kullanılır. Bir overlay'i sürüklersen \"Kendi sıram\" seçilir. \"En çok kullanılanlar\" için yalnızca düzenlerinde hangi overlay türlerinin açık olduğu (tür ve sayı) anonim istatistik olarak gönderilir.")}
          >
            <span>Sırala</span>
            <select
              value={favOnly() ? "favs" : overlaySort()}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setFavOnly(v === "favs");
                if (v !== "favs") setOverlaySort(v as OverlaySort);
              }}
            >
              <option value="popular">En çok kullanılanlara göre</option>
              <option value="category">Kategoriye göre</option>
              <option value="alpha">Harf sırasına göre</option>
              <option value="custom">Kendi sıram</option>
              <option value="favs">{t("Sadece favorilerim ({0})", favs().length)}</option>
            </select>
          </label>
          <Show when={favOnly() && !shown().some((m) => favs().includes(m.id))}>
            <div class="ovlist-simnote">Henüz favorin yok. Bir overlay'e sağ tıklayıp "Favorilere ekle"yi seç; başka bir sıralamaya geçince tüm overlay'ler yeniden görünür.</div>
          </Show>
          <For each={groupKeys()}>
            {(gk) => {
              const cat = gk === "" ? null : gk;
              const ms = () => groupItems(gk);
              return (
              <>
                <Show when={cat !== null}>
                  <button
                    class="ovlist-cap ovlist-captog"
                    classList={{ closed: isCollapsed(cat!) }}
                    aria-expanded={!isCollapsed(cat!)}
                    title={isCollapsed(cat!) ? t("Kategoriyi aç") : t("Kategoriyi kapat")}
                    onClick={() => toggleCategory(cat!)}
                  >
                    <ChevronDown />
                    <span>{cat === FAV_CAT ? t("Favorilerim") : CATEGORY_NAMES[cat!] ?? cat}</span>
                    <small>{ms().length}</small>
                  </button>
                </Show>
                <For each={cat !== null && isCollapsed(cat) ? [] : ms()}>
                  {(m) => {
                    return (
                      <button
                        class="ovitem"
                        classList={{ sel: selected() === m.id, locked: isLocked(m.id), dragging: drag()?.id === m.id }}
                        data-ovid={m.id}
                        title="Çift tık: düzene ekle · Sürükle ya da sağ tık: sırayı değiştir (bu sıra Düzenler ve Yayın sayfalarındaki overlay listesinde de kullanılır)"
                        onPointerDown={(e) => startDrag(m.id, e)}
                        onClick={() => !justDragged && setOpenCard(m.id)}
                        onDblClick={() => {
                          if (justDragged || drag()) return;
                          setOpenCard(m.id);
                          addSelected(m.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          setOpenCard(m.id);
                          setMenu({ x: e.clientX || r.left + 24, y: e.clientY || r.bottom, id: m.id });
                        }}
                      >
                        <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                        <span class="ovitem-name">{m.name}</span>
                        <Show when={isAdmin() && markedHiddenOverlay(m.id)}>
                          <span class="hidden-badge" title="Yönetici olmayanlar bu overlay'i görmez">gizli</span>
                        </Show>
                        <Show when={isProOverlay(m.id)}>
                          <span class="pro-badge small" title={isLocked(m.id) ? "PRO üyelere özel" : "PRO overlay"}>PRO</span>
                        </Show>
                        <Show when={favs().includes(m.id)}>
                          <span class="ovitem-fav" title={t("Favorilerim")}>
                            <I.Star />
                          </span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </>
              );
            }}
          </For>
          <Show when={sim() && hiddenBySim() > 0}>
            <div class="ovlist-simnote">
              {hiddenBySim()} overlay bu simde çalışmadığı için gizlendi ({SIM_NAMES[sim()!]})
            </div>
          </Show>
        </div>
        <div class="ovlist-foot">
<button class="btn primary wide" disabled={!selected() || !target() || inLayout() || isLocked(selected() ?? "") || !!target()?.locked} title={addTitle()} onClick={() => addSelected()}>
            <Show when={inLayout()} fallback={<><I.Plus /> Overlay Ekle</>}>
              <I.Check /> Düzende var
            </Show>
          </button>
          <small class="muted ovlist-addnote" classList={{ ok: !!added() }}>
            <Show
              when={added()}
              fallback={
                <label class="ovlist-pick">
                  <span>Düzen:</span>
                  <select class="input" value={target()?.id ?? ""} onChange={(e) => setPick(e.currentTarget.value || null)}>
                    <optgroup label={t("Düzenler")}>
                      <For each={sortProfiles(Object.values(settings().profiles).filter((x) => x.rules.mode !== "stream"))}>{(x) => <option value={x.id} data-no-i18n>{x.name}</option>}</For>
                    </optgroup>
                    <Show when={Object.values(settings().profiles).some((x) => x.rules.mode === "stream")}>
                      <optgroup label={t("Yayın düzenleri")}>
                        <For each={sortProfiles(Object.values(settings().profiles).filter((x) => x.rules.mode === "stream"))}>{(x) => <option value={x.id} data-no-i18n>{x.name}</option>}</For>
                      </optgroup>
                    </Show>
                  </select>
                </label>
              }
            >
              {added()}
            </Show>
          </small>
        </div>
      </aside>

      <Show when={selected()} keyed fallback={<div class="ovset" />}>
        {(k) => <OverlaySettings key={k} profileId={DEFAULTS_ID} mode="defaults" />}
      </Show>

      <section class="ovpreview">
        <Backdrop />
        <Show when={selected()} keyed>
          {(k) => {
            const sims = supportedSims(k);
            return (
              <div class="ovpreview-sims" title={t("Bu overlay'in çalıştığı oyunlar")}>
                <Show
                  when={sims.length < SIM_FAMILIES.length}
                  fallback={<span class="ovpreview-sim all" title={SIM_FAMILIES.map((f) => SIM_NAMES[f]).join(" · ")}>{t("Tüm oyunlar")}</span>}
                >
                  <For each={sims}>
                    {(f) => (
                      <span class="ovpreview-sim" title={SIM_NAMES[f]} data-no-i18n>
                        {SIM_SHORT[f]}
                      </span>
                    )}
                  </For>
                </Show>
              </div>
            );
          }}
        </Show>
        <Show when={selected()} keyed>
          {(k) => (
            <Show when={inst()}>
              <div class="ovpreview-stage" style={{ opacity: Math.min(inst()!.opacity, settings().theme.opacity / 100) }}>
                <div style={{ transform: `scale(${Math.min(1.4, inst()!.scale * (settings().theme.scale / 100))})` }} class="ovpreview-item">
                  <OverlayView type={k} options={{ ...inst()!.options, ...previewVals(k) }} look={inst()!.look} bgOpacity={inst()!.bgOpacity} />
                </div>
                <Show when={isLocked(k) || Object.keys(previewVals(k)).length > 0}>
                  <div class="ovpreview-pro">
                    <span class="pro-badge small">PRO</span>{" "}
                    {isLocked(k) ? "Önizleme — bu overlay PRO üyelere özel" : "Önizleme — seçtiğin tasarım PRO üyelere özel, kaydedilmedi"}
                  </div>
                </Show>
              </div>
            </Show>
          )}
        </Show>
        <Show when={!snap() && !appState().demo && selected()}>
          <button
            class="btn ghost"
            style={{ position: "absolute", top: "12px", right: "12px", "z-index": 3 }}
            title="Örnek veri birkaç saniye oynar, sonra görüntü sabit kalır"
            onClick={() => snap.replay()}
          >
            ▶ Önizlemeyi oynat
          </button>
        </Show>
        <div class="ovpreview-bar">
          <For each={BACKDROPS.filter((b) => b.id !== "custom")}>
            {(b) => (
              <button classList={{ on: backdrop() === b.id }} onClick={() => setBackdrop(b.id)}>
                {b.name}
              </button>
            )}
          </For>
          <button classList={{ on: shotsOpen() }} onClick={() => setShotsOpen(!shotsOpen())} title="SRTR Pitwall ve iRacing ekran görüntülerinden seç">
            <I.Car /> Ekran görüntüsü
          </button>
          <Show when={shotsOpen()}>
            <ScreenshotPicker onClose={() => setShotsOpen(false)} />
          </Show>
          <label class="ovpreview-upload" classList={{ on: backdrop() === "custom" }}>
            <I.ImagePlus /> Kendi görselin
            <input type="file" accept="image/*" onChange={(e) => e.currentTarget.files?.[0] && pickCustomImage(e.currentTarget.files[0])} />
          </label>
          <span class="ovpreview-note">
            {appState().connected ? "Canlı veri" : appState().demo ? "Demo verisi" : "Önizleme verisi"}
          </span>
        </div>
      </section>
    </div>
  );
}
