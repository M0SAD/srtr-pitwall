// Sohbete özel arka plan: her sohbete kendi arka planını seç (hazır renk, degrade ya da kendi görselin).
// 1:1 sohbet: sende hemen uygulanır (kişiye özel); paneli kapatınca sohbete "arka planını değiştirdi" mesajı düşer,
//   arkadaşın o mesaja tıklayıp aynı arka planı kendi tarafında kullanabilir (c45). Eski "öner / kabul et" akışından (c37)
//   kalan kabul edilmiş ortak arka planlar çalışmaya devam eder.
// Grup ve takım sohbeti: arka planı sadece grup sahibi / takım sahibi değiştirir ve odadaki herkese uygulanır.
// Öncelik (1:1): bu sohbete seçtiğin arka plan > kabul edilmiş ortak arka plan > genel sohbet görünümü (Ayarlar → Sohbet).

import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import { settings, updateSettings, type ChatLook, type ConvBg } from "@/sdk/settings";
import { bgFileUrl, clearBgFile, convSlot, readBgBlob, saveBgFile, shrinkToJpeg } from "@/sdk/bgfile";
import { session } from "@/cloud/supabase";
import {
  announceChatBg,
  clearRoomBg,
  clearSharedChatBg,
  getChatBg,
  getRoomBg,
  respondChatBg,
  setRoomBg,
  sharedImageBlob,
  sharedImageUrl,
  type BgChoice,
  type RoomBg,
  type RoomScope,
  type SharedChatBg,
} from "@/cloud/chatBg";
import type { Friend, Message, MsgMeta } from "@/cloud/social";
import { GRADIENTS, SOLID_PRESETS, gradientCss, look as globalLook } from "../chatLook";
import * as I from "../icons";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "./ProLock";
import "./convbg.css";

export interface ConvBgState {
  /** Bu sohbette kullanılacak görünüm */
  look: () => ChatLook;
  /** Görsel arka planın adresi (sohbete özel değilse undefined: genel görsel kullanılır) */
  img: () => string | null | undefined;
  shared: () => SharedChatBg | null;
  local: () => ConvBg | undefined;
  localImg: () => string | null | undefined;
  sharedImg: () => string | null;
  refresh: () => Promise<void>;
}

/** Bir sohbetin arka plan durumu: yerel seçim + sunucudaki ortak arka plan (açıkken 30 sn'de bir yenilenir) */
export function useConvBg(friendId: () => string): ConvBgState {
  const local = () => settings().general.convBg?.[friendId()];
  const [localImg, setLocalImg] = createSignal<string | null | undefined>(undefined);
  createEffect(
    on(
      () => [friendId(), local()?.kind === "image" ? local()!.rev : -1] as const,
      async ([id, rev]) => {
        if (rev < 0) return setLocalImg(undefined);
        setLocalImg(undefined);
        const u = await bgFileUrl(convSlot(id), rev);
        if (id === friendId() && local()?.rev === rev) setLocalImg(u);
      },
    ),
  );

  const [shared, setShared] = createSignal<SharedChatBg | null>(null);
  const refresh = async () => {
    if (!session()) return;
    try {
      setShared(await getChatBg(friendId()));
    } catch {
      /* sunucu c37 değilse ya da çevrimdışı: ortak arka plan yok */
    }
  };
  onMount(() => {
    void refresh();
    const iv = setInterval(refresh, 30_000);
    onCleanup(() => clearInterval(iv));
  });

  const [sharedImg, setSharedImg] = createSignal<string | null>(null);
  createEffect(
    on(
      () => shared()?.image_path ?? null,
      async (p) => {
        setSharedImg(null);
        if (!p) return;
        const u = await sharedImageUrl(p);
        if (shared()?.image_path === p) setSharedImg(u);
      },
    ),
  );

  /** Uygulanacak kaynak: yerel (görseli bu bilgisayarda yoksa atlanır) ya da kabul edilmiş ortak */
  const source = (): { kind: ConvBg["kind"]; value: string; img?: string | null } | null => {
    const l = local();
    if (l && !(l.kind === "image" && localImg() === null)) return { kind: l.kind, value: l.value, img: l.kind === "image" ? localImg() : undefined };
    const s = shared();
    if (s && s.status === "accepted") return { kind: s.kind, value: s.value, img: s.kind === "image" ? sharedImg() : undefined };
    return null;
  };

  return {
    look: () => {
      const base = globalLook();
      const s = source();
      if (!s) return base;
      return {
        ...base,
        bg: s.kind,
        bgColor: s.kind === "solid" ? s.value : base.bgColor,
        gradient: s.kind === "gradient" ? s.value : base.gradient,
      };
    },
    img: () => {
      const s = source();
      return s && s.kind === "image" ? s.img ?? null : undefined;
    },
    shared,
    local,
    localImg,
    sharedImg,
    refresh,
  };
}

function setLocal(id: string, v: ConvBg | undefined) {
  updateSettings((d) => {
    const m = { ...(d.general.convBg ?? {}) };
    if (v) m[id] = v;
    else delete m[id];
    d.general.convBg = m;
  });
}

/** Önizleme kutusu (renk, degrade ya da görsel) */
function Swatch(p: { kind: ConvBg["kind"]; value: string; img?: string | null }) {
  return (
    <span
      class="cbg-sw"
      style={
        p.kind === "image"
          ? { "background-image": p.img ? `url("${p.img}")` : undefined }
          : { background: p.kind === "solid" ? p.value : gradientCss(p.value) }
      }
    />
  );
}

/** Sohbetin üstünde açılan seçim paneli (başlıktaki "Sohbet arka planı" düğmesi) */
export function ConvBgPanel(props: {
  f: Friend;
  st: ConvBgState;
  onClose: () => void;
  /** Değişiklik sohbete mesaj olarak gönderildi */
  onAnnounced?: (m: Message) => void;
  onError?: (msg: string) => void;
}) {
  const id = () => props.f.friend_id;
  // Panel açıldığındaki seçim: kapanırken değiştiyse sohbete "arka planını değiştirdi" mesajı gönderilir
  // (her renk denemesinde değil, bir kez)
  const sig = (c: ConvBg | undefined) => (c ? `${c.kind}|${c.value}|${c.rev}` : "");
  const friendId = props.f.friend_id;
  const before = sig(settings().general.convBg?.[friendId]);
  onCleanup(() => {
    const cur = settings().general.convBg?.[friendId];
    if (!cur || sig(cur) === before || !session() || proLocked(F.chatBg) || !props.f.accept_messages) return;
    void (async () => {
      try {
        const choice: BgChoice =
          cur.kind === "image" ? { kind: "image", blob: await readBgBlob(convSlot(friendId)) } : { kind: cur.kind, value: cur.value };
        const r = await announceChatBg(friendId, choice);
        props.onAnnounced?.({
          id: r.id,
          sender: session()!.user.id,
          recipient: friendId,
          body: "🖼️ Sohbet arka planını değiştirdi",
          created_at: new Date().toISOString(),
          read_at: null,
          meta: r.meta,
        });
      } catch (e) {
        props.onError?.(String((e as Error)?.message ?? e));
      }
    })();
  });
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [note, setNote] = createSignal("");
  let file: HTMLInputElement | undefined;
  const l = () => props.st.local();

  const run = async (fn: () => Promise<unknown>, done = "") => {
    setErr("");
    setNote("");
    setBusy(true);
    try {
      await fn();
      if (done) setNote(done);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (kind: "solid" | "gradient", value: string) => {
    if (l()?.kind === "image") void clearBgFile(convSlot(id()));
    setLocal(id(), { kind, value, rev: Date.now() });
  };
  const pickImage = (f: File) =>
    run(async () => {
      const blob = await shrinkToJpeg(f);
      await saveBgFile(convSlot(id()), blob);
      setLocal(id(), { kind: "image", value: "", rev: Date.now() });
    });
  const reset = () => {
    if (l()?.kind === "image") void clearBgFile(convSlot(id()));
    setLocal(id(), undefined);
  };
  const removeShared = () =>
    run(async () => {
      await clearSharedChatBg(id());
      await props.st.refresh();
    });

  const s = () => props.st.shared();
  return (
    <div class="cbg-panel">
      <div class="cbg-head">
        <b>Sohbet arka planı</b>
        <button class="icon-btn" title="Kapat" onClick={props.onClose}>
          <I.X />
        </button>
      </div>
      <p class="muted small">
        Sadece bu sohbet için ve sadece sende değişir. Paneli kapattığında değişiklik sohbete mesaj olarak düşer; arkadaşın o mesaja tıklayıp
        aynı arka planı kullanabilir.
      </p>
      <div class="cbg-row">
        <button class="cbg-def" classList={{ on: !l() }} onClick={reset} title="Genel sohbet görünümünü kullan (Ayarlar → Sohbet)">
          Genel
        </button>
        <For each={SOLID_PRESETS}>
          {(c) => (
            <button
              class="cbg-opt"
              classList={{ on: l()?.kind === "solid" && l()!.value.toLowerCase() === c }}
              style={{ background: c }}
              title={c}
              onClick={() => choose("solid", c)}
            />
          )}
        </For>
        <input
          type="color"
          class="cbg-color"
          title="Özel renk"
          value={l()?.kind === "solid" ? l()!.value : SOLID_PRESETS[1]}
          onChange={(e) => choose("solid", e.currentTarget.value)}
        />
      </div>
      <div class="cbg-row">
        <For each={GRADIENTS}>
          {(g) => (
            <button
              class="cbg-opt grad"
              classList={{ on: l()?.kind === "gradient" && l()!.value === g.id }}
              style={{ background: g.css }}
              title={g.name}
              onClick={() => choose("gradient", g.id)}
            />
          )}
        </For>
        <button class="btn ghost small" classList={{ on: l()?.kind === "image" }} disabled={busy()} onClick={() => file?.click()}>
          <I.ImagePlus /> {l()?.kind === "image" ? "Görseli değiştir" : "Görsel seç"}
        </button>
      </div>
      <Show when={s()}>
        {(sh) => (
          <div class="cbg-status">
            <Swatch kind={sh().kind} value={sh().value} img={props.st.sharedImg()} />
            <span class="small">
              <Show when={sh().status === "accepted"}>Ortak arka plan kullanılıyor (ikiniz de görüyorsunuz).</Show>
              <Show when={sh().status === "pending" && sh().mine}>{t("Önerin {0} adlı arkadaşının yanıtını bekliyor.", props.f.display_name || "?")}</Show>
              <Show when={sh().status === "pending" && !sh().mine}>{t("{0} bir arka plan önerdi; sohbetin üstünden yanıtlayabilirsin.", props.f.display_name || "?")}</Show>
              <Show when={sh().status === "rejected" && sh().mine}>{t("{0} önerini reddetti.", props.f.display_name || "?")}</Show>
              <Show when={sh().status === "rejected" && !sh().mine}>Son öneriyi reddettin.</Show>
            </span>
            <Show when={sh().status === "accepted" || (sh().status === "pending" && sh().mine)}>
              <button class="btn ghost small danger" disabled={busy()} onClick={removeShared}>
                {sh().status === "accepted" ? "Ortak arka planı kaldır" : "Öneriyi geri çek"}
              </button>
            </Show>
          </div>
        )}
      </Show>
      <ProLockNote feature={F.chatBg} text="Arka plan değişikliğini sohbete mesaj olarak göndermek PRO üyelere özel; kendi görünümünde kullanabilirsin." />
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void pickImage(f);
          e.currentTarget.value = "";
        }}
      />
      <Show when={busy()}>
        <p class="muted small">İşleniyor…</p>
      </Show>
      <Show when={note()}>
        <p class="cbg-ok small">{note()}</p>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
    </div>
  );
}

/** Arkadaşın önerisi: sohbetin üstünde önizleme + Kabul et / Reddet */
export function ConvBgRequest(props: { f: Friend; st: ConvBgState }) {
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const pending = () => {
    const s = props.st.shared();
    return s && s.status === "pending" && !s.mine ? s : null;
  };
  const answer = async (accept: boolean) => {
    setErr("");
    setBusy(true);
    try {
      await respondChatBg(props.f.friend_id, accept);
      if (accept) {
        // Kabul edilen ortak arka plan görünsün: bu sohbete kendi seçtiğin arka plan kalkar
        const cur = settings().general.convBg?.[props.f.friend_id];
        if (cur?.kind === "image") void clearBgFile(convSlot(props.f.friend_id));
        if (cur) setLocal(props.f.friend_id, undefined);
      }
      await props.st.refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show when={pending()}>
      {(p) => (
        <div class="cbg-req">
          <Swatch kind={p().kind} value={p().value} img={props.st.sharedImg()} />
          <div class="cbg-req-txt">
            <p class="small">{t("{0} bu sohbet için bir arka plan önerdi", props.f.display_name || "?")}</p>
            <Show when={err()}>
              <p class="error small">{err()}</p>
            </Show>
          </div>
          <div class="cbg-req-btns">
            <button class="btn ghost small" disabled={busy()} onClick={() => answer(false)}>
              Reddet
            </button>
            <button class="btn primary small" disabled={busy()} onClick={() => answer(true)}>
              Kabul et
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}

// ---------------------------------------------------------------------------
// c45: sohbetteki "arka planını değiştirdi" mesajı, "Bu arka planı kullan" ve grup / takım odasının ortak arka planı
// ---------------------------------------------------------------------------

/** Mesajdaki arka planı bu sohbette kendi tarafımda kullan (1:1; görsel ayar klasörüne kopyalanır) */
export async function adoptBg(friendId: string, meta: MsgMeta) {
  if (meta.kind === "solid" || meta.kind === "gradient") {
    if (settings().general.convBg?.[friendId]?.kind === "image") void clearBgFile(convSlot(friendId));
    setLocal(friendId, { kind: meta.kind, value: meta.value ?? "", rev: Date.now() });
    return;
  }
  if (meta.kind !== "image" || !meta.image) throw new Error(t("Bu arka plan artık kullanılamıyor."));
  await saveBgFile(convSlot(friendId), await sharedImageBlob(meta.image));
  setLocal(friendId, { kind: "image", value: "", rev: Date.now() });
}

/** Sohbet akışındaki sistem satırı (ortada, balonsuz) */
export function SysNote(props: { text: string; time?: string }) {
  return (
    <div class="fsys" title={props.time}>
      <span data-no-i18n>{props.text}</span>
    </div>
  );
}

/**
 * "… sohbet arka planını değiştirdi" mesajı: küçük önizleme + (1:1'de karşı taraf için) "Bu arka planı kullan".
 * Grup / takımda arka plan herkese uygulandığı için düğme yoktur.
 */
export function BgNote(props: { meta: MsgMeta; who: string; mine: boolean; time?: string; onUse?: () => Promise<void> }) {
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [img, setImg] = createSignal<string | null>(null);
  createEffect(() => {
    const p = props.meta.kind === "image" ? props.meta.image : undefined;
    setImg(null);
    if (p) void sharedImageUrl(p).then((u) => props.meta.image === p && setImg(u));
  });
  const removed = () => props.meta.kind === "none";
  /** Eski görsel kovadan silindiyse (yerine yenisi geldi) artık kullanılamaz */
  const usable = () => !removed() && (props.meta.kind !== "image" || !!props.meta.image);
  const text = () =>
    removed()
      ? props.mine
        ? t("Sohbet arka planını kaldırdın")
        : t("{0} sohbet arka planını kaldırdı", props.who)
      : props.mine
        ? t("Sohbet arka planını değiştirdin")
        : t("{0} sohbet arka planını değiştirdi", props.who);
  const use = async () => {
    if (!props.onUse || busy()) return;
    setErr("");
    setBusy(true);
    try {
      await props.onUse();
      setDone(true);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const clickable = () => !!props.onUse && !props.mine && usable();
  return (
    <div class="fsys cbg-note" classList={{ click: clickable() }} title={clickable() ? t("Bu arka planı kullan") : props.time} onClick={() => clickable() && void use()}>
      <Show when={!removed() && (props.meta.kind !== "image" || img())}>
        <Swatch kind={props.meta.kind as ConvBg["kind"]} value={props.meta.value ?? ""} img={img()} />
      </Show>
      <div class="cbg-note-txt">
        <span data-no-i18n>🖼️ {text()}</span>
        <Show when={clickable()}>
          <button class="link" disabled={busy()}>
            {busy() ? "Uygulanıyor…" : done() ? "Bu sohbette kullanılıyor ✓" : "Bu arka planı kullan"}
          </button>
        </Show>
        <Show when={err()}>
          <small class="error">{err()}</small>
        </Show>
      </div>
    </div>
  );
}

export interface RoomBgState {
  look: () => ChatLook;
  img: () => string | null | undefined;
  bg: () => RoomBg | null;
  bgImg: () => string | null;
  refresh: () => Promise<void>;
}

/** Grup / takım odasının ortak arka planı (sahibin seçtiği; yoksa genel sohbet görünümü) */
export function useRoomBg(scope: RoomScope, room: () => string): RoomBgState {
  const [bg, setBg] = createSignal<RoomBg | null>(null);
  const refresh = async () => {
    if (!session()) return;
    try {
      setBg(await getRoomBg(scope, room()));
    } catch {
      /* sunucu c45 değilse ya da çevrimdışı: ortak arka plan yok */
    }
  };
  onMount(() => {
    void refresh();
    const iv = setInterval(refresh, 60_000);
    onCleanup(() => clearInterval(iv));
  });
  const [bgImg, setBgImg] = createSignal<string | null>(null);
  createEffect(
    on(
      () => bg()?.image_path ?? null,
      async (p) => {
        setBgImg(null);
        if (!p) return;
        const u = await sharedImageUrl(p);
        if (bg()?.image_path === p) setBgImg(u);
      },
    ),
  );
  return {
    look: () => {
      const base = globalLook();
      const b = bg();
      if (!b) return base;
      return { ...base, bg: b.kind, bgColor: b.kind === "solid" ? b.value : base.bgColor, gradient: b.kind === "gradient" ? b.value : base.gradient };
    },
    img: () => {
      const b = bg();
      return b ? (b.kind === "image" ? bgImg() : undefined) : undefined;
    },
    bg,
    bgImg,
    refresh,
  };
}

/** Odanın arka planını seçme paneli (sadece grup sahibi / takım sahibi açabilir; sunucu da denetler) */
export function RoomBgPanel(props: { scope: RoomScope; room: string; st: RoomBgState; onClose: () => void }) {
  const [pick, setPick] = createSignal<{ kind: "solid" | "gradient"; value: string } | { kind: "image"; blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  let file: HTMLInputElement | undefined;
  const dropUrl = () => {
    const p = pick();
    if (p?.kind === "image") URL.revokeObjectURL(p.url);
  };
  onCleanup(dropUrl);
  const cur = () => props.st.bg();
  const isOn = (kind: "solid" | "gradient", value: string) => {
    const p = pick();
    if (p) return p.kind === kind && p.value.toLowerCase() === value.toLowerCase();
    return cur()?.kind === kind && cur()!.value.toLowerCase() === value.toLowerCase();
  };
  const choose = (kind: "solid" | "gradient", value: string) => (dropUrl(), setPick({ kind, value }));
  const pickImage = async (f: File) => {
    setErr("");
    setBusy(true);
    try {
      const blob = await shrinkToJpeg(f);
      dropUrl();
      setPick({ kind: "image", blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    setBusy(true);
    try {
      await fn();
      await props.st.refresh();
      props.onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    const p = pick();
    if (!p) return;
    void run(() => setRoomBg(props.scope, props.room, p.kind === "image" ? { kind: "image", blob: p.blob } : { kind: p.kind, value: p.value }));
  };
  return (
    <div class="cbg-panel">
      <div class="cbg-head">
        <b>Sohbet arka planı</b>
        <button class="icon-btn" title="Kapat" onClick={props.onClose}>
          <I.X />
        </button>
      </div>
      <p class="muted small">
        {props.scope === "team"
          ? "Takım sohbetinin arka planını sadece takım sahibi değiştirebilir; takımdaki herkes aynı arka planı görür."
          : "Grup sohbetinin arka planını sadece grup sahibi değiştirebilir; gruptaki herkes aynı arka planı görür."}
      </p>
      <div class="cbg-row">
        <For each={SOLID_PRESETS}>
          {(c) => <button class="cbg-opt" classList={{ on: isOn("solid", c) }} style={{ background: c }} title={c} onClick={() => choose("solid", c)} />}
        </For>
        <input
          type="color"
          class="cbg-color"
          title="Özel renk"
          value={(() => {
            const p = pick();
            return p?.kind === "solid" ? p.value : cur()?.kind === "solid" ? cur()!.value : SOLID_PRESETS[1];
          })()}
          onChange={(e) => choose("solid", e.currentTarget.value)}
        />
      </div>
      <div class="cbg-row">
        <For each={GRADIENTS}>
          {(g) => (
            <button class="cbg-opt grad" classList={{ on: isOn("gradient", g.id) }} style={{ background: g.css }} title={g.name} onClick={() => choose("gradient", g.id)} />
          )}
        </For>
        <button class="btn ghost small" classList={{ on: pick()?.kind === "image" }} disabled={busy()} onClick={() => file?.click()}>
          <I.ImagePlus /> {pick()?.kind === "image" || (!pick() && cur()?.kind === "image") ? "Görseli değiştir" : "Görsel seç"}
        </button>
        <Show when={pick()?.kind === "image"}>
          <Swatch kind="image" value="" img={(pick() as { url: string }).url} />
        </Show>
      </div>
      <div class="cbg-actions">
        <Show when={cur()}>
          <button class="btn ghost small danger" disabled={busy()} onClick={() => run(() => clearRoomBg(props.scope, props.room))}>
            Arka planı kaldır
          </button>
        </Show>
        <button class="btn primary small" disabled={!pick() || busy() || proLocked(F.chatBg)} onClick={apply} title="Odadaki herkes bu arka planı görür">
          <I.Check /> Herkese uygula
          <ProLockTag feature={F.chatBg} />
        </button>
      </div>
      <ProLockNote feature={F.chatBg} text="Sohbet arka planını değiştirmek PRO üyelere özel." />
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void pickImage(f);
          e.currentTarget.value = "";
        }}
      />
      <Show when={busy()}>
        <p class="muted small">İşleniyor…</p>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
    </div>
  );
}
