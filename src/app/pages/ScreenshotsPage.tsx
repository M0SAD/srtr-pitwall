// Ekran görüntüleri: SRTR Pitwall ile çekilenler (overlay'lerle, filigranlı) ve iRacing'in
// kendi klasörü. Buradan toplulukta paylaşılır, düzenleme arka planı yapılır.

import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { settings, updateSettings } from "@/sdk/settings";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { cloudEnabled, session } from "@/cloud/supabase";
import { encodeForShare, shareShot, sharedLocalPaths, shotLimits } from "@/cloud/shots";
import { useScreenshotBytes } from "../components/Backdrop";
import {
  IracingShotHelp,
  ShotThumb,
  fmtSize,
  fmtWhen,
  listShots,
  setEditBackdropFromShot,
  useFullImage,
  type LocalShot,
  type ShotDirs,
} from "../components/Shots";
import { go } from "../ui";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "../components/ProLock";
import * as I from "../icons";

type Src = "pitwall" | "iracing";

export function ScreenshotsPage() {
  const [src, setSrc] = createSignal<Src>("pitwall");
  const [ver, setVer] = createSignal(0);
  const [list] = createResource(() => ({ s: src(), v: ver() }), (k) => listShots(k.s));
  const [dirs] = createResource(() => invoke<ShotDirs>("shots_dirs").catch(() => null));
  const [shared] = createResource(() => ({ v: ver(), u: session()?.user.id }), () => sharedLocalPaths());
  const [open, setOpen] = createSignal<number | null>(null);
  const [sharing, setSharing] = createSignal<LocalShot | null>(null);
  const [msg, setMsg] = createSignal<{ text: string; err?: boolean } | null>(null);

  let hide: number | undefined;
  const toast = (text: string, err = false) => {
    setMsg({ text, err });
    clearTimeout(hide);
    hide = window.setTimeout(() => setMsg(null), 3500);
  };

  onMount(async () => {
    const un1 = await listen<LocalShot>("screenshot-taken", () => {
      setVer(ver() + 1);
      toast("Ekran görüntüsü kaydedildi");
    });
    const un2 = await listen<string>("screenshot-error", (e) => toast(t("Ekran görüntüsü alınamadı: {0}", e.payload), true));
    onCleanup(() => {
      un1();
      un2();
    });
  });

  const shots = () => list() ?? [];
  const current = () => {
    const i = open();
    return i === null ? null : shots()[i] ?? null;
  };

  return (
    <div class="page">
      <section class="panel shots-head">
        <div class="shots-head-text">
          <h3>Ekran görüntüsü al</h3>
          <p class="muted small">
            Oyundayken <kbd>{prettyKey(shortcut("shot")) || "—"}</kbd> tuşuna bas: ekran overlay'lerle birlikte kaydedilir ve filigran
            eklenir.
          </p>
        </div>
        <div class="btns">
          <button
            class="btn primary"
            title="Panel gizlenir, ekran çekilir, panel geri gelir"
            disabled={proLocked(F.shots)}
            onClick={() => {
              toast("Ekran görüntüsü alınıyor…");
              invoke("shot_take");
            }}
          >
            Şimdi çek
            <ProLockTag feature={F.shots} />
          </button>
          <button class="btn ghost" onClick={() => go("settings", "keybinds")}>
            Kısayolu değiştir
          </button>
        </div>
        <ProLockNote feature={F.shots} text="Ekran görüntüsü almak PRO üyelere özel. Önceki görüntülerine bakabilirsin." />
      </section>

      <section class="panel cm-bar">
        <div class="cm-tabs">
          <button classList={{ on: src() === "pitwall" }} onClick={() => setSrc("pitwall")}>
            SRTR Pitwall
          </button>
          <button classList={{ on: src() === "iracing" }} onClick={() => setSrc("iracing")}>
            iRacing klasörü
          </button>
        </div>
        <small class="muted">{list.loading ? "Aranıyor…" : `${shots().length} görüntü`}</small>
        <span class="lt-sp" />
        <button class="btn ghost small" onClick={() => setVer(ver() + 1)}>
          Yenile
        </button>
        <button class="btn ghost small" onClick={() => invoke("shots_open_dir", { source: src() }).catch((e) => toast(String(e), true))}>
          Klasörü aç
        </button>
      </section>

      <Show when={msg()}>
        <div class="toast" classList={{ err: !!msg()!.err }} onClick={() => setMsg(null)}>
          {msg()!.text}
        </div>
      </Show>

      <Show when={src() === "iracing"}>
        <section class="panel">
          <IracingShotHelp />
          <Show when={dirs() && !dirs()!.iracingFound}>
            <p class="muted small warn">
              iRacing ekran görüntüsü klasörü bulunamadı<Show when={dirs()!.iracing}>: <span data-no-i18n>{dirs()!.iracing}</span></Show>
            </p>
          </Show>
        </section>
      </Show>

      <Show when={!list.loading && shots().length === 0}>
        <p class="muted cm-empty">
          {src() === "pitwall" ? "Henüz ekran görüntüsü yok. Oyundayken kısayola bas ya da \"Şimdi çek\" düğmesini kullan." : "Bu klasörde görüntü yok."}
        </p>
      </Show>

      <div class="shot-grid">
        <For each={shots()}>
          {(s, i) => (
            <button class="shot-card" onClick={() => setOpen(i())}>
              <ShotThumb shot={s} />
              <Show when={shared()?.has(s.path)}>
                <span class="shot-shared" title={t("Bu görüntüyü toplulukta paylaştın")}>
                  ✓ {t("Paylaşıldı")}
                </span>
              </Show>
              <span class="shot-cap">
                <b>{s.track || s.name}</b>
                <small>
                  {fmtWhen(s.modified)} · {fmtSize(s.size)}
                </small>
              </span>
            </button>
          )}
        </For>
      </div>

      <ShotSettings dirs={dirs() ?? null} />

      <Show when={current()}>
        <LocalShotViewer
          shot={current()!}
          index={open()!}
          count={shots().length}
          onNav={(d) => setOpen(Math.max(0, Math.min(shots().length - 1, open()! + d)))}
          onClose={() => setOpen(null)}
          onShare={() => setSharing(current())}
          onDeleted={() => {
            setOpen(null);
            setVer(ver() + 1);
          }}
          toast={toast}
        />
      </Show>
      <Show when={sharing()}>
        <ShareShotDialog
          shot={sharing()!}
          onClose={() => setSharing(null)}
          onShared={() => {
            setSharing(null);
            setOpen(null);
            setVer(ver() + 1);
            go("community", "shots");
          }}
        />
      </Show>
    </div>
  );
}

function LocalShotViewer(props: {
  shot: LocalShot;
  index: number;
  count: number;
  onNav: (d: number) => void;
  onClose: () => void;
  onShare: () => void;
  onDeleted: () => void;
  toast: (t: string, err?: boolean) => void;
}) {
  const url = useFullImage(() => props.shot.path);
  const s = () => props.shot;
  onMount(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") props.onNav(-1);
      else if (e.key === "ArrowRight") props.onNav(1);
      else if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", k);
    onCleanup(() => window.removeEventListener("keydown", k));
  });
  const err = (e: unknown) => props.toast(String((e as Error)?.message ?? e), true);

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal shot-viewer">
        <header>
          <div>
            <h3>{s().track || s().name}</h3>
            <small class="muted">
              {fmtWhen(s().modified)} · {fmtSize(s().size)}
              {s().car ? ` · ${s().car}` : ""}
            </small>
          </div>
          <div class="btns">
            <button class="btn ghost small" disabled={props.index <= 0} onClick={() => props.onNav(-1)}>
              ‹
            </button>
            <small class="muted">
              {props.index + 1} / {props.count}
            </small>
            <button class="btn ghost small" disabled={props.index >= props.count - 1} onClick={() => props.onNav(1)}>
              ›
            </button>
            <button class="btn ghost small" onClick={props.onClose}>
              Kapat
            </button>
          </div>
        </header>
        <div class="shot-big">
          <Show when={url()} fallback={<span class="muted">Yükleniyor…</span>}>
            <img src={url()!} alt="" />
          </Show>
        </div>
        <div class="btns">
          <Show when={cloudEnabled}>
            <Show
              when={!proLocked("community.share.shots")}
              fallback={
                <button class="btn primary" onClick={() => go("pro")} title="Toplulukta paylaşmak PRO özelliğidir">
                  <I.Lock /> PRO ile paylaş
                </button>
              }
            >
              <button class="btn primary" onClick={props.onShare}>
                Toplulukta paylaş
              </button>
            </Show>
          </Show>
          <button
            class="btn ghost"
            title="Düzenleme modunda overlay'lerin arkasında gösterilir"
            onClick={() =>
              setEditBackdropFromShot(s().path)
                .then(() => props.toast("Düzenleme arka planı olarak ayarlandı"))
                .catch(err)
            }
          >
            Düzenleme arka planı yap
          </button>
          <button
            class="btn ghost"
            title="Overlay'ler sayfasındaki önizlemenin arkasında gösterilir"
            onClick={async () => {
              try {
                const buf = await invoke<ArrayBuffer>("shot_read", { path: s().path });
                useScreenshotBytes(buf, /\.png$/i.test(s().name) ? "image/png" : "image/jpeg");
                props.toast("Önizleme arka planı olarak ayarlandı");
              } catch (e) {
                err(e);
              }
            }}
          >
            Önizleme arka planı yap
          </button>
          <span class="lt-sp" />
          <Show when={s().source === "pitwall"}>
            <button
              class="btn ghost danger"
              onClick={async () => {
                if (!confirm("Bu ekran görüntüsü silinsin mi?")) return;
                try {
                  await invoke("shot_delete", { path: s().path });
                  props.onDeleted();
                } catch (e) {
                  err(e);
                }
              }}
            >
              Sil
            </button>
          </Show>
        </div>
        <Show when={s().source === "iracing"}>
          <p class="muted small">iRacing görüntüsü: paylaşırken filigran eklenir.</p>
        </Show>
      </div>
    </div>
  );
}

function ShareShotDialog(props: { shot: LocalShot; onClose: () => void; onShared: () => void }) {
  const s = props.shot;
  const lim = shotLimits();
  const [title, setTitle] = createSignal(s.track || s.name.replace(/\.[a-z]+$/i, "").replace(/_/g, " "));
  const [desc, setDesc] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  // Yüklenecek hali (küçültülmüş, filigranlı) önizlenir
  const [preview] = createResource(async () => {
    const buf = await encodeForShare(s.path, 1280, 80);
    return URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
  });
  onCleanup(() => preview() && URL.revokeObjectURL(preview()!));

  const submit = async () => {
    setErr("");
    if (!title().trim()) return setErr("Bir başlık yaz.");
    setBusy(true);
    try {
      await shareShot({ path: s.path, title: title().trim(), description: desc().trim(), track: s.track, car: s.car });
      props.onShared();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail">
        <header>
          <h3>Toplulukta paylaş</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
        </header>
        <Show
          when={session()}
          fallback={
            <div>
              <p class="muted">Paylaşmak için giriş yapmalısın.</p>
              <button class="btn primary" onClick={() => go("account")}>
                Giriş yap
              </button>
            </div>
          }
        >
          <div class="shot-big small">
            <Show when={preview()} fallback={<span class="muted">{preview.error ? String(preview.error) : "Hazırlanıyor…"}</span>}>
              <img src={preview()!} alt="" />
            </Show>
          </div>
          <div class="row">
            <b>Başlık</b>
            <input class="input admin-wide" maxLength={80} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
          </div>
          <textarea
            class="input cm-textarea"
            rows={3}
            maxLength={1000}
            placeholder="Açıklama (seri, araç, an…)"
            value={desc()}
            onInput={(e) => setDesc(e.currentTarget.value)}
          />
          <p class="muted small">
            {t(
              "Görüntü en fazla {0} piksel genişliğe küçültülür ve filigran eklenir. Görünen adın görüntüyle birlikte görünür. Günde en fazla {1} görüntü paylaşabilirsin.",
              lim.maxWidth,
              lim.daily,
            )}
          </p>
          <Show when={!lim.enabled}>
            <p class="error small">Ekran görüntüsü paylaşımı şu an kapalı</p>
          </Show>
          <Show when={err()}>
            <p class="error">{err()}</p>
          </Show>
          <button class="btn primary" disabled={busy() || !lim.enabled} onClick={submit}>
            {busy() ? "Yükleniyor…" : "Paylaş"}
          </button>
        </Show>
      </div>
    </div>
  );
}

function ShotSettings(props: { dirs: ShotDirs | null }) {
  const sc = () => settings().general.screenshots;
  const set = <K extends keyof ReturnType<typeof sc>>(k: K, v: ReturnType<typeof sc>[K]) =>
    updateSettings((d) => {
      d.general.screenshots[k] = v;
    });
  return (
    <section class="panel">
      <h3>Ekran görüntüsü ayarları</h3>
      <div class="row">
        <div>
          <b>Overlay'ler görüntüde görünsün</b>
          <small>Kapalıysa çekim anında overlay'ler bir an gizlenir, sadece oyun kaydedilir.</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={sc().includeOverlays} onChange={(e) => set("includeOverlays", e.currentTarget.checked)} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Kısayol sadece oyundayken çalışsın</b>
          <small>Oyun kapalıyken kısayol tuşu (varsayılan F12) diğer uygulamalara kalır.</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={sc().onlyInGame} onChange={(e) => set("onlyInGame", e.currentTarget.checked)} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Dosya biçimi</b>
          <small>PNG kayıpsızdır ama dosyalar çok daha büyük olur.</small>
        </div>
        <select value={sc().format} onChange={(e) => set("format", e.currentTarget.value as "jpg" | "png")}>
          <option value="jpg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </div>
      <Show when={sc().format === "jpg"}>
        <div class="row">
          <div>
            <b>JPEG kalitesi</b>
          </div>
          <div class="range-row">
            <input type="range" min="60" max="100" step="1" value={sc().quality} onInput={(e) => set("quality", Number(e.currentTarget.value))} />
            <span>{sc().quality}</span>
          </div>
        </div>
      </Show>
      <div class="row">
        <div>
          <b>Kayıt klasörü</b>
          <small data-no-i18n>{props.dirs?.pitwall ?? ""}</small>
        </div>
        <button class="btn ghost small" onClick={() => invoke("shots_open_dir", { source: "pitwall" })}>
          Klasörü aç
        </button>
      </div>
      <p class="muted small">
        Filigranı yönetici belirler. Varsayılan kısayol F12'dir; Steam'in ekran görüntüsü tuşu da F12 ise ikisi birlikte çalışabilir.
        Kısayol çalışmazsa Ayarlar → Kısayollar'dan başka bir tuş seç. Print Screen seçersen Windows 11'deki "Ekran alıntısı aracını
        açmak için Print Screen tuşunu kullan" ayarını kapat.
      </p>
    </section>
  );
}
