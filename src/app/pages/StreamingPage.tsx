// Yayın: OBS için ayrı düzenler (varsayılan 1920×1080 tuval). Düzenler sayfasıyla aynı mantık: solda yayın
// düzenleri ve overlay listesi, ortada tuval, sağda seçili overlay'in ayarları.

import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { useCols } from "../colResize";
import { t } from "@/sdk/i18n";
import { RESOLUTIONS, linkSource, liveProfile, setStreamCanvas, setStreamFocus, streamFocus, unlinkStream } from "@/sdk/streamLink";
import { ShareDialog, isSceneOnly } from "./CommunityPage";
import { go, overlayFocus, setOverlayFocus } from "../ui";
import { invoke } from "@tauri-apps/api/core";
import { manifestById } from "@/sdk/registry";
import { addToLayout, instanceName, instancesOf, newProfile, removeInstance, settings, updateSettings, type Profile } from "@/sdk/settings";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { appState } from "../App";
import { isHiddenOverlay, isLocked } from "@/cloud/account";
import { LayoutCanvas, sayBadgeArea, sayLayoutLocked, sayOverlayLocked, type CanvasBadge } from "../components/LayoutCanvas";
import { StreamBadgeMark, badgePosWanted, badgeRect, badgeWanted, pushOutOfBadge } from "@/sdk/streamBadge";
import { FIXED_STREAM, LayoutList, sortProfiles, toggleProfileLock } from "../components/LayoutList";
import { OverlayPalette } from "../components/OverlayPalette";
import { OverlaySettings } from "../components/OverlaySettings";
import { CanvasOptions, CanvasTools, GhostPanel, newLayout, useCanvasZoom, useCopyPaste, useDeleteKey, useEscClose } from "./LayoutsPage";
import * as I from "../icons";
import { F, proLocked, streamBadgeLocked } from "@/sdk/proFeatures";
import { ProLockBox, ProLockNote } from "../components/ProLock";
import { currentSim, overlaySupportsSim } from "@/overlays/simSupport";

interface ServerInfo {
  running: boolean;
  port: number;
  url: string | null;
  lanUrl: string | null;
  error: string | null;
}

/** Boş bir yayın düzeni (1920×1080, overlay'siz) oluşturur */
function newStream(name: string, id?: string): string {
  if (id) {
    updateSettings((d) => {
      const p = newProfile(id, name);
      p.rules.mode = "stream";
      p.canvas = { w: 1920, h: 1080 };
      p.order = -1;
      p.isDefault = true;
      for (const o of Object.values(p.overlays)) o.enabled = false;
      d.profiles[id] = p;
    });
    return id;
  }
  const nid = newLayout("stream", name);
  updateSettings((d) => (d.profiles[nid].canvas = { w: 1920, h: 1080 }));
  return nid;
}

export function StreamingPage() {
  const streams = () => sortProfiles(Object.values(settings().profiles).filter((p) => p.rules.mode === "stream"));
  const [selId, setSelIdRaw] = createSignal<string>(streams()[0]?.id ?? "");
  const setSelId = (id: string) => {
    setSelIdRaw(id);
    setSel(null);
    setGhost(null);
  };
  // SRTR Pitwall logosu (sağ üst): gizleyebilmek PRO özelliği; kilitliyken ayar yok sayılır
  const badgeLocked = () => streamBadgeLocked();
  const badgeShown = () => badgeLocked() || badgeWanted();
  const [badgeSel, setBadgeSel] = createSignal(false);
  const setBadge = (on: boolean) => !badgeLocked() && updateSettings((d) => (d.general.streamBadge = on));
  const badge = (): CanvasBadge => ({ forced: badgeLocked(), shown: badgeShown(), selected: badgeSel() && !sel() && !ghost(), onPick: () => (setSel(null), setGhost(null), setBadgeSel(true)), pos: badgeLocked() ? undefined : badgePosWanted(), onMove: (pos) => !badgeLocked() && updateSettings((d) => (d.general.streamBadgePos = pos)) });
  const badgeOpen = () => badgeSel() && !sel() && !ghost();
  // Bir overlay seçilince logo paneli kapanır (overlay paneli kapatılınca geri açılmasın)
  createEffect(() => (sel() || ghost()) && setBadgeSel(false));
  const p = (): Profile | undefined => {
    const x = settings().profiles[selId()];
    return x && x.rules.mode === "stream" ? x : streams()[0];
  };
  // Sabit "Varsayılan" yayın düzeni: hiç yayın düzeni yoksa (ve özellik açıksa) kendiliğinden oluşur
  createEffect(() => {
    if (streams().length === 0 && !proLocked(F.streaming)) setSelIdRaw(newStream(t("Varsayılan"), FIXED_STREAM));
  });
  createEffect(() => {
    const f = streamFocus();
    if (!f) return;
    setSelId(f);
    setStreamFocus(null);
  });
  // Sağ tık > "Ayarlarını aç" ile gelindiyse o yayın düzeni ve kopya açılır
  createEffect(() => {
    const f = overlayFocus();
    if (!f) return;
    const prof = settings().profiles[f.profile];
    if (!prof || prof.rules.mode !== "stream") return;
    setOverlayFocus(null);
    setSelId(f.profile);
    if (!prof.link && prof.overlays[f.key]?.enabled) setSel(f.key);
  });
  /** Soldaki listede tıklanan, düzene henüz eklenmemiş overlay türü */
  const [ghost, setGhost] = createSignal<string | null>(null);
  const [zoom, setZoom] = useCanvasZoom(() => p()?.id);
  const [scaleSizes, setScaleSizes] = createSignal(true);
  const [custom, setCustom] = createSignal(false);
  const [sel, setSel] = createSignal<string | null>(null);
  const [info, { refetch }] = createResource(() => invoke<ServerInfo>("server_status").catch(() => null));
  const [copied, setCopied] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);
  const canvas = () => p()?.canvas ?? { w: 1920, h: 1080 };

  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  // Bağlı yayın düzeni: izlenen düzen ve onun yayın çözünürlüğüne oranlanmış (salt okunur) görünümü
  const linked = () => !!p()?.link;
  /** Kilitli yayın düzeni: yerleşim, overlay listesi, çözünürlük ve ayarlar değiştirilemez */
  const locked = () => !!p()?.locked;
  const source = createMemo(() => linkSource(p(), status()));
  const view = createMemo(() => liveProfile(p(), status()));
  /** Kaynak düzendeki açık kopyalar (gizle anahtarları için) */
  const sourceKeys = createMemo(() => {
    const src = source();
    return src ? instancesOf(src).filter(([, i]) => i.enabled && !isLocked(i.type) && !isHiddenOverlay(i.type)) : [];
  });
  const isPreset = () => RESOLUTIONS.some((r) => r.w === canvas().w && r.h === canvas().h) || (canvas().w === 1080 && canvas().h === 1920);
  const setRes = (w: number, h: number) => {
    const prof = p();
    w = Math.round(w);
    h = Math.round(h);
    if (!prof || prof.locked || !(w >= 320 && h >= 180 && w <= 7680 && h <= 4320) || (w === canvas().w && h === canvas().h)) return;
    const has = !prof.link && Object.values(prof.overlays).some((o) => o.enabled);
    const rescale = has && confirm(t("Overlay konumları yeni çözünürlüğe ({0}×{1}) göre orantılı olarak taşınsın mı? Tamam: yerleşim oranı korunur. İptal: konumlar olduğu gibi kalır.", w, h));
    setStreamCanvas(prof.id, { w, h }, rescale, scaleSizes());
  };
  const toggleHidden = (key: string) =>
    p()?.locked ? void sayLayoutLocked() : updateSettings((d) => {
      const l = d.profiles[p()!.id].link;
      if (!l || d.profiles[p()!.id].locked) return;
      l.hidden = l.hidden.includes(key) ? l.hidden.filter((x) => x !== key) : [...l.hidden, key];
    });
  const keys = createMemo(() =>
    view()
      ? instancesOf(view()!)
          .filter(([, i]) => i.enabled && !isLocked(i.type) && !isHiddenOverlay(i.type) && overlaySupportsSim(i.type, sim()))
          .map(([k]) => k)
      : [],
  );
  // Tuvaldeki overlay'ler sabit görüntü (Demo açıksa canlı)
  useSnapshot(
    () => {
      const prof = view();
      return prof ? keys().flatMap((k) => manifestById(prof.overlays[k]?.type ?? "")?.topics ?? []) : [];
    },
    () => [p()?.id, keys().join(",")],
    () => appState().demo,
  );

  const urlOf = (id: string) => {
    const base = info()?.lanUrl ?? info()?.url ?? `http://127.0.0.1:${settings().general.server.port}`;
    return `${base}/overlay.html?layout=${encodeURIComponent(id)}`;
  };
  const url = () => urlOf(p()?.id ?? "");

  const enableServer = async () => {
    const s = settings().general.server;
    updateSettings((d) => (d.general.server.enabled = true));
    await invoke("server_apply", { enabled: true, port: s.port, lan: s.lan });
    refetch();
  };

  /** Overlay'i yayın düzenine ekler; "Overlaylarım"daki varsayılan ayarlarla gelir */
  const add = (type: string) => {
    const prof = p();
    if (prof?.locked) return void sayLayoutLocked();
    if (!prof || prof.link) return;
    const key = addToLayout(prof.id, type);
    if (!key) return;
    // PRO değilken: yeni overlay SRTR Pitwall logosuna ayrılmış alana düşmesin (yaklaşık boyut: manifest)
    if (badgeLocked()) {
      const o = settings().profiles[prof.id]?.overlays[key];
      const man = manifestById(type);
      if (o && man) {
        const r = { x: o.x, y: o.y, w: man.size.w * o.scale, h: man.size.h * o.scale };
        const q = pushOutOfBadge(r, badgeRect(canvas()), canvas());
        if (q && q !== r)
          updateSettings((d) => {
            const t = d.profiles[prof.id]?.overlays[key];
            if (t) (t.x = Math.round(q.x)), (t.y = Math.round(q.y));
          });
      }
    }
    setGhost(null);
    setSel(key);
  };
  const remove = (key: string) => {
    const prof = p();
    if (prof?.locked) return void sayLayoutLocked();
    if (!prof || prof.link) return;
    if (prof.overlays[key]?.locked) return void sayOverlayLocked(true);
    const type = prof.overlays[key]?.type ?? null;
    removeInstance(key, prof.id);
    if (sel() === key) {
      setSel(null);
      setGhost(type);
    }
  };
  const pick = (key: string | null, type: string) => {
    if (key) {
      setGhost(null);
      setSel(key);
    } else {
      setSel(null);
      setGhost(type);
    }
  };
  const closeSet = () => (setSel(null), setGhost(null), setBadgeSel(false));
  useEscClose(() => badgeOpen() || (!linked() && !!(sel() || ghost())), closeSet);
  const cols = useCols();
  const withSet = () => badgeOpen() || (!linked() && !!(sel() || ghost()));
  useDeleteKey(sel, remove);
  useCopyPaste(p, sel, (k) => (setSel(k), setGhost(null)), () => locked() || linked(), () => ({ w: canvas().w, h: canvas().h, global: 1 }));
  // Seçili kopya düzenden çıktıysa seçim bırakılır
  createEffect(() => {
    const k = sel();
    if (k && !linked() && !p()?.overlays[k]?.enabled) setSel(null);
  });

  return (
    <ProLockBox feature={F.streaming} text="Yayın düzenleri (OBS) PRO üyelere özel.">
      <div class="lpage" classList={{ "with-set": withSet(), "keep-set": cols.keep(), resizing: cols.resizing() }} style={{ "grid-template-columns": cols.columns(withSet()) }}>
        <cols.Grips withSet={withSet()} />
        <aside class="llist">
          <div class="llist-items">
            <LayoutList
              kind="stream"
              title="Yayın düzenleri"
              list={streams()}
              selId={p()?.id}
              onSelect={setSelId}
              onAdd={() => setSelId(newStream(t("Yayın {0}", streams().length + 1)))}
              onShare={() => setSharing(true)}
              canShare={(x) => !isSceneOnly(liveProfile(x, status()))}
              onCopyUrl={(id) => void navigator.clipboard.writeText(urlOf(id)).catch(() => {})}
              onUnlink={(id) => {
                if (settings().profiles[id]?.locked) return void (p()?.id === id && sayLayoutLocked());
                unlinkStream(id, status());
                if (p()?.id === id) setSel(null);
              }}
              icon={() => <I.Radio />}
              empty={<div class="ovlist-empty">Henüz yayın düzeni yok. Yukarıdaki + ile ekle.</div>}
            />
          </div>
          <Show when={p()}>
            <div class="llist-head">
              <span>Overlay'ler</span>
              <small class="muted">{keys().length} ekli</small>
            </div>
            <div class="llist-pal">
              <Show when={linked()}>
                <div class="locked-note ovlist-linked">Bu yayın düzeni başka bir düzene bağlı: overlay'leri o düzenden canlı gelir, buradan eklenip çıkarılmaz.</div>
              </Show>
              <OverlayPalette profile={view() ?? p()!} selected={sel() ?? ghost()} onSelect={pick} onAdd={add} onRemove={remove} disabled={linked() || locked()} />
            </div>
          </Show>
        </aside>

        <Show
          when={p()}
          fallback={
            <section class="lmain empty-state">
              <I.Radio />
              <h2>OBS için yayın düzenleri</h2>
              <p class="muted">
                Oyunda gördüğünden farklı bir yerleşimi yayında göstermek için buradan bir yayın düzeni oluştur. Her düzenin
                kendi OBS adresi olur. Soldaki + ile başlayabilirsin.
              </p>
            </section>
          }
        >
          <section class="lmain">
            <header class="lhead">
              <div>
                <h2 class="lname">{p()!.name}</h2>
                <small class="muted">
                  {canvas().w}×{canvas().h} · {keys().length} overlay
                </small>
              </div>
              <div class="lhead-btns">
                <Show when={view() && !isSceneOnly(view()!)}>
                  <button class="btn primary" title="Bu yayın düzenini tüm ayarları ve renkleriyle toplulukta paylaş" onClick={() => setSharing(true)}>
                    <I.Share2 /> Paylaş
                  </button>
                </Show>
              </div>
            </header>

            <div class="obs-url">
              <div class="f2-cap">OBS tarayıcı kaynağı adresi</div>
              <Show
                when={info()?.running}
                fallback={
                  <div class="obs-off">
                    <span>Web sunucusu kapalı.</span>
                    <button class="btn primary small" onClick={enableServer}>
                      Aç
                    </button>
                  </div>
                }
              >
                <div class="obs-row">
                  <code>{url()}</code>
                  <button
                    class="btn ghost small"
                    onClick={async () => {
                      await navigator.clipboard.writeText(url()).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <I.Copy /> {copied() ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
                <small class="muted">
                  OBS: Kaynak ekle → Tarayıcı → adresi yapıştır, genişlik {canvas().w}, yükseklik {canvas().h}. Arka plan şeffaftır.
                </small>
              </Show>
            </div>

            <Show when={locked()}>
              <div class="locked-note lock-note">
                <I.Lock /> Bu yayın düzeni kilitli: overlay'ler taşınamaz, eklenip çıkarılamaz, ayarları değiştirilemez.
                <button class="link" onClick={() => toggleProfileLock(p()!.id)}>
                  Kilidi aç
                </button>
              </div>
            </Show>
            <div class="sres">
              <div class="sres-row">
                <span class="f2-cap">Yayın çözünürlüğü</span>
                <select
                  class="f2-select small"
                  disabled={locked()}
                  value={custom() || !isPreset() ? "custom" : `${canvas().w}x${canvas().h}`}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    if (v === "custom") return void setCustom(true);
                    setCustom(false);
                    const [w, h] = v.split("x").map(Number);
                    setRes(w, h);
                    e.currentTarget.value = `${canvas().w}x${canvas().h}`;
                  }}
                >
                  <For each={RESOLUTIONS}>{(r) => <option value={`${r.w}x${r.h}`}>{`${r.w}×${r.h}`}</option>}</For>
                  <option value="1080x1920">{t("1080×1920 (dikey)")}</option>
                  <option value="custom">Özel</option>
                </select>
                <Show when={custom() || !isPreset()}>
                  <input class="input sres-num" type="number" min="320" max="7680" disabled={locked()} title="Genişlik" value={canvas().w} onChange={(e) => (setRes(Number(e.currentTarget.value), canvas().h), (e.currentTarget.value = String(canvas().w)))} />
                  <span class="muted">×</span>
                  <input class="input sres-num" type="number" min="180" max="4320" disabled={locked()} title="Yükseklik" value={canvas().h} onChange={(e) => (setRes(canvas().w, Number(e.currentTarget.value)), (e.currentTarget.value = String(canvas().h)))} />
                </Show>
                <Show when={!linked()}>
                  <label class="check" title="Çözünürlük değişince konumlar orantılı taşınırken overlay'lerin boyutu da aynı oranda büyür ya da küçülür">
                    <input type="checkbox" checked={scaleSizes()} onChange={(e) => setScaleSizes(e.currentTarget.checked)} />
                    <span>Overlay boyutlarını da ölçekle</span>
                  </label>
                </Show>
              </div>
              <Show when={linked()}>
                <div class="sres-row">
                  <span class="chip2 alt">
                    <I.Link2 /> Bağlı düzen{source() ? `: ${source()!.name}` : ""}
                  </span>
                  <button
                    class="btn ghost small"
                    disabled={locked()}
                    title="Şu anki görünümü bu yayın düzenine kopyalar; artık düzendeki değişiklikleri izlemez ve burada serbestçe düzenlenebilir"
                    onClick={() => {
                      unlinkStream(p()!.id, status());
                      setSel(null);
                    }}
                  >
                    <I.Unlink /> Bağlantıyı kopar
                  </button>
                </div>
              </Show>
              <Show when={linked() && !source()}>
                <small class="muted">Bağlı düzen bulunamadı (silinmiş olabilir). Bağlantıyı koparıp overlay'leri buradan ekleyebilirsin.</small>
              </Show>
            </div>

            <div class="lmon-tools">
              <CanvasOptions backdrop="stream" />
              <label class="check ctools-logo" classList={{ off: badgeLocked() }} title={badgeLocked() ? t("SRTR Pitwall logosu yayında her zaman görünür · PRO ile gizlenebilir") : t("Yayında sağ üstte SRTR Pitwall logosunu göster")} onClick={() => badgeLocked() && (sayBadgeArea(), setBadgeSel(true), setSel(null), setGhost(null))}>
                <input type="checkbox" checked={badgeShown()} disabled={badgeLocked()} onChange={(e) => setBadge(e.currentTarget.checked)} />
                <span>Logo</span>
              </label>
              <CanvasTools zoom={zoom()} setZoom={setZoom} />
            </div>
            <Show
              when={linked()}
              fallback={<LayoutCanvas profileId={p()!.id} width={canvas().w} height={canvas().h} keys={keys()} selected={sel()} onSelect={(k) => (setSel(k), setGhost(null))} globalScale={false} zoom={zoom()} onZoom={setZoom} backdrop="stream" readOnly={locked()} badge={badge()} />}
            >
              <LayoutCanvas profileId={p()!.id} source={view()} readOnly backdrop="stream" width={canvas().w} height={canvas().h} keys={keys()} selected={sel()} onSelect={setSel} globalScale={false} zoom={zoom()} onZoom={setZoom} badge={badge()} />
              <div class="slink">
                <div class="f2-cap">Yayında gizle</div>
                <div class="slink-list">
                  <For each={sourceKeys()}>
                    {([k, i]) => (
                      <button
                        class="btn ghost small"
                        classList={{ off: p()!.link!.hidden.includes(k), on: sel() === k }}
                        title={p()!.link!.hidden.includes(k) ? "Yayında gizli · göstermek için tıkla" : "Yayında görünüyor · gizlemek için tıkla"}
                        onClick={() => toggleHidden(k)}
                      >
                        <Show when={p()!.link!.hidden.includes(k)} fallback={<I.Eye />}>
                          <I.EyeOff />
                        </Show>
                        {instanceName(k, i)}
                      </button>
                    )}
                  </For>
                </div>
                <small class="muted lhint">
                  Önizleme salt okunurdur: yerleşimi ve overlay ayarlarını Düzenler sayfasında bağlı düzende değiştir, yayına kendiliğinden yansır.
                </small>
              </div>
            </Show>

            <Show when={!linked()}>
              <small class="muted lhint">Soldaki listede çift tık: overlay'i yayın düzenine ekle / çıkar · Sürükle: taşı · seçiliyken köşeler: boyutlandır, kenarlar: genişlik / yükseklik · OBS'teki görüntü sürüklerken anında güncellenir</small>
              <small class="muted lhint lkeys">
                Fare tekeri: yakınlaştır / uzaklaştır · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>Z</kbd>: geri al · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>Y</kbd>: yinele · <kbd data-no-i18n>Delete</kbd>: sil · sağ tık: kilitle · <kbd data-no-i18n>Alt</kbd>: yapıştırmadan taşı · Ok tuşları: 1 px taşı (Shift: 10 px)
            <span class="chint-more">
              <kbd data-no-i18n>Space</kbd> + sürükle: gezin · boş yerden sürükle: birden çok overlay seç (birlikte taşı / sil) · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>C</kbd> / <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>V</kbd>: kopyala / yapıştır · <kbd data-no-i18n>+</kbd> <kbd data-no-i18n>−</kbd> <kbd data-no-i18n>0</kbd>: yakınlaştır / uzaklaştır / sığdır
            </span>
              </small>
            </Show>
            <Show when={sharing()}>
              <ShareDialog kind="stream" profileId={p()!.id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "stream"))} />
            </Show>
          </section>
          <Show when={!linked() && sel()} keyed>
            {(k) => <OverlaySettings key={k} profileId={p()!.id} mode="layout" stream onRemove={() => remove(k)} readOnly={locked()} onClose={closeSet} />}
          </Show>
          <Show when={badgeOpen()}>
            <aside class="ovset">
              <header class="ovset-head">
                <span class="ovset-ic">
                  <I.Radio />
                </span>
                <div>
                  <b data-no-i18n>SRTR Pitwall</b>
                  <small>Yayın düzenlerindeki logo</small>
                </div>
                <button class="ovset-close" title="Kapat (Esc)" onClick={closeSet}>
                  <I.X />
                </button>
              </header>
              <div class="ovset-scroll">
                <div class="cbadge-prev">
                  <StreamBadgeMark />
                </div>
                <Show when={badgeLocked()}>
                  <ProLockNote text="Logoyu gizlemek ve taşımak ücretli PRO üyelere özeldir." class="cbadge-lock" />
                </Show>
                <div class="row cbadge-row">
                  <b>SRTR Pitwall logosunu göster</b>
                  <label class="switch">
                    <input type="checkbox" checked={badgeShown()} disabled={badgeLocked()} onChange={(e) => setBadge(e.currentTarget.checked)} />
                    <i />
                  </label>
                </div>
                <Show when={!badgeLocked()}>
                  <button class="btn ghost wide" style={{ "margin-top": "12px" }} disabled={!badgePosWanted()} onClick={() => updateSettings((d) => void delete d.general.streamBadgePos)}>
                    <I.RotateCcw /> Varsayılan konuma döndür
                  </button>
                </Show>
                <p class="ovset-note">
                  <Show when={badgeLocked()} fallback="Logo tüm yayın düzenlerinde overlay'lerin üstünde çizilir; tuvalde sürükleyerek ya da ok tuşlarıyla taşıyabilirsin, boyutu değiştirilemez. Bu ayarlar bütün yayın düzenleri için geçerlidir.">
                    Logo tüm yayın düzenlerinde sağ üst köşede, overlay'lerin üstünde çizilir; taşınamaz ve boyutlandırılamaz. Bu ayar bütün yayın düzenleri için geçerlidir.
                  </Show>
                </p>
              </div>
            </aside>
          </Show>
          <Show when={!linked() && !sel() && ghost()} keyed>
            {(g) => <GhostPanel type={g} onAdd={() => add(g)} disabled={locked()} onClose={closeSet} />}
          </Show>
        </Show>
      </div>
    </ProLockBox>
  );
}
