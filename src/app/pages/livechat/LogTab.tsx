// Canlı Sohbet › Sohbet kaydı: günlük kayıt dosyalarını gösterir (PRO: livechat.log; Rust: livechat/chatlog.rs).
// Solda günler, sağda seçilen günün satırları; metin araması (bu gün ya da tüm günler), platform / kanal /
// kullanıcı süzgeci, kullanıcıya tıklayınca tüm mesajları, satırda kopyala / kullanıcıyı ara / engelle,
// txt / csv dışa aktarma. Kayıt tutmak, saklama süresi ve silmek herkese açık.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { PlatformIcon } from "@/overlays/livechat/parts";
import { ProLockBox } from "../../components/ProLock";
import { Switch } from "../../components/SettingsForm";
import * as I from "../../icons";
import { errText, lc, setLc, toast } from "./common";

const KEEP_DAYS = [7, 30, 90, 365, 0];
const PLATFORMS = ["youtube", "twitch", "kick", "streamlabs"] as const;
const PAGE = 500;

const isPlatform = (p: string): p is LC.Platform => p in LC.PLATFORM_NAMES;
const low = (s: string) => s.toLocaleLowerCase();
const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Aranan metni satırda vurgular */
function Marked(p: { text: string; q: string }) {
  const parts = createMemo(() => {
    const q = low(p.q.trim());
    if (!q) return [{ v: p.text, hit: false }];
    const out: { v: string; hit: boolean }[] = [];
    const hay = low(p.text);
    // Küçük harfe çevirince uzunluk değişirse (ör. "İ") vurgulama yapılmaz
    if (hay.length !== p.text.length) return [{ v: p.text, hit: false }];
    let i = 0;
    while (i < p.text.length) {
      const j = hay.indexOf(q, i);
      if (j < 0) break;
      if (j > i) out.push({ v: p.text.slice(i, j), hit: false });
      out.push({ v: p.text.slice(j, j + q.length), hit: true });
      i = j + q.length;
    }
    if (i < p.text.length) out.push({ v: p.text.slice(i), hit: false });
    return out;
  });
  return <For each={parts()}>{(x) => (x.hit ? <mark>{x.v}</mark> : <>{x.v}</>)}</For>;
}

export function LogTab() {
  const locked = () => proLocked(F.liveLog);
  const [dir, setDir] = createSignal("");
  const [days, setDays] = createSignal<LC.LogDay[]>([]);
  const [date, setDate] = createSignal("");
  const [lines, setLines] = createSignal<LC.LogLine[]>([]);
  const [hits, setHits] = createSignal<LC.LogHit[]>([]);
  const [q, setQ] = createSignal("");
  const [allDays, setAllDays] = createSignal(false);
  const [platform, setPlatform] = createSignal("");
  const [channel, setChannel] = createSignal("");
  const [user, setUser] = createSignal("");
  const [limit, setLimit] = createSignal(PAGE);
  const [busy, setBusy] = createSignal(false);
  const [confirmDel, setConfirmDel] = createSignal<"" | "day" | "all">("");

  const loadDays = async () => {
    try {
      const d = await LC.logDays();
      setDays(d);
      if (!d.some((x) => x.date === date())) setDate(d[0]?.date ?? "");
    } catch (e) {
      toast(errText(e), true);
    }
  };
  onMount(loadDays);

  // Seçilen günün satırları
  let readSeq = 0;
  const loadDay = async () => {
    const d = date();
    const seq = ++readSeq;
    if (!d || locked()) return setLines([]);
    setBusy(true);
    try {
      const l = await LC.logRead(d);
      if (seq === readSeq) setLines(l);
    } catch (e) {
      if (seq === readSeq) setLines([]);
      toast(errText(e), true);
    } finally {
      if (seq === readSeq) setBusy(false);
    }
  };
  createEffect(on([date, locked], () => void loadDay()));
  createEffect(on([date, q, platform, channel, user, allDays], () => setLimit(PAGE)));

  // Tüm günlerde arama (yazarken kısa gecikmeyle)
  let timer: number | undefined;
  let searchSeq = 0;
  createEffect(
    on([allDays, q, platform, user, locked], () => {
      clearTimeout(timer);
      const seq = ++searchSeq;
      if (!allDays() || locked()) return;
      if (!q().trim() && !user()) return setHits([]);
      timer = window.setTimeout(async () => {
        setBusy(true);
        try {
          const r = await LC.logSearch(q(), platform(), user());
          if (seq === searchSeq) setHits(r);
        } catch (e) {
          toast(errText(e), true);
        } finally {
          if (seq === searchSeq) setBusy(false);
        }
      }, 250);
    }),
  );
  onCleanup(() => clearTimeout(timer));

  /** Seçili gündeki kanallar / etiketler (süzgeç listesi) */
  const channels = createMemo(() => [...new Set(lines().map((l) => l.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")));

  const rows = createMemo<LC.LogHit[]>(() => {
    const ch = channel();
    if (allDays()) return ch ? hits().filter((l) => l.channel === ch) : hits();
    const ql = low(q().trim());
    const p = platform();
    const u = low(user());
    const d = date();
    const out: LC.LogHit[] = [];
    for (const l of lines()) {
      if (p && l.platform !== p) continue;
      if (ch && l.channel !== ch) continue;
      if (u && low(l.user) !== u) continue;
      if (ql && !low(l.text).includes(ql) && !low(l.user).includes(ql)) continue;
      out.push({ ...l, date: d });
    }
    return out;
  });
  const filtered = () => !!(q().trim() || platform() || channel() || user());
  const clearFilters = () => {
    setQ("");
    setPlatform("");
    setChannel("");
    setUser("");
    setAllDays(false);
  };

  /** Kullanıcının tüm günlerdeki mesajları */
  const showUser = (name: string) => {
    setQ("");
    setChannel("");
    setUser(name);
    setAllDays(true);
  };
  const copy = async (l: LC.LogHit) => {
    await navigator.clipboard.writeText(`[${l.date} ${l.time}] ${l.user ? `${l.user}: ` : ""}${l.text}`).catch(() => {});
    toast(t("Kopyalandı"));
  };
  const ban = async (l: LC.LogHit) => {
    if (!confirm(t("{0} engellensin mi? Mesajları gizlenir ve bundan sonra gösterilmez (Moderasyon'dan kaldırılabilir).", l.user))) return;
    try {
      await LC.banUser(l.user, isPlatform(l.platform) ? l.platform : undefined);
      toast(t("{0} engellendi", l.user));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const openDir = async () => {
    try {
      setDir(await LC.openLogDir());
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const exportDay = async (format: "txt" | "csv") => {
    if (!date()) return;
    try {
      toast(t("Dışa aktarıldı: {0}", await LC.logExport(date(), format)));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const del = async () => {
    const what = confirmDel();
    setConfirmDel("");
    if (!what) return;
    try {
      const n = await LC.logDelete(what === "day" ? date() : undefined);
      toast(t("{0} kayıt dosyası silindi", n));
      setHits([]);
      setLines([]);
      await loadDays();
      void loadDay();
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const openDay = (d: string) => {
    setAllDays(false);
    setUser("");
    setDate(d);
  };

  return (
    <>
      <section class="panel">
        <h3>Sohbet kaydı</h3>
        <p class="muted small">
          Açıkken gelen tüm mesajlar (filtrelenmeden önceki halleriyle), anket başlangıç / sonuçları, moderasyon işlemleri, gönderdiğin mesajlar ve
          altyazılar bu bilgisayarda günlük metin dosyalarına yazılır: <code>YYYY-MM-DD.txt</code>, satır başına <code>[SS:DD:ss] metin</code>.
        </p>
        <div class="row">
          <div>
            <b>Sohbeti kaydet</b>
          </div>
          <Switch checked={lc().log} onChange={(v) => setLc((x) => (x.log = v))} />
        </div>
        <div class="row">
          <div>
            <b>Kayıtları sakla</b>
            <small>Bu süreden eski kayıt dosyaları kendiliğinden silinir.</small>
          </div>
          <select class="f2-select" value={String(lc().logDays ?? 30)} onChange={(e) => setLc((x) => (x.logDays = Number(e.currentTarget.value)))}>
            <For each={KEEP_DAYS}>{(d) => <option value={String(d)}>{d ? t("{0} gün", d) : t("Süresiz")}</option>}</For>
          </select>
        </div>
        <div class="row">
          <div>
            <b>Kayıt klasörü</b>
            <Show when={dir()}>
              <small data-no-i18n>{dir()}</small>
            </Show>
          </div>
          <div class="lcl-btns">
            <button class="btn ghost small" onClick={openDir}>
              <I.FolderOpen /> Klasörü aç
            </button>
            <Show
              when={confirmDel() === "all"}
              fallback={
                <button class="btn ghost small danger" disabled={!days().length} onClick={() => setConfirmDel("all")}>
                  <I.Trash /> Kayıtları sil
                </button>
              }
            >
              <span class="lcl-confirm">
                Tüm kayıtlar silinsin mi?
                <button class="btn small danger" onClick={del}>
                  Evet, sil
                </button>
                <button class="btn ghost small" onClick={() => setConfirmDel("")}>
                  Vazgeç
                </button>
              </span>
            </Show>
          </div>
        </div>
      </section>

      <ProLockBox feature={F.liveLog} text="Sohbet kaydını görüntülemek, aramak ve dışa aktarmak PRO üyelere özel. Kayıt tutmak ve silmek herkese açık.">
        <div class="lcl">
          <aside class="lcl-days">
            <div class="lcl-cap">
              <span>Günler</span>
              <button class="icon-btn" title={t("Yenile")} onClick={() => void loadDays().then(loadDay)}>
                <I.RotateCcw />
              </button>
            </div>
            <Show when={days().length} fallback={<div class="lcl-none">Henüz kayıt yok. Kayıt açıkken gelen mesajlar burada gün gün listelenir.</div>}>
              <For each={days()}>
                {(d) => (
                  <button class="lcl-day" classList={{ sel: !allDays() && date() === d.date }} onClick={() => openDay(d.date)} data-no-i18n>
                    <b>{dayLabel(d.date)}</b>
                    <small>
                      {t("{0} satır", LC.fmtCount(d.lines))} · {fmtBytes(d.bytes)}
                    </small>
                  </button>
                )}
              </For>
            </Show>
          </aside>
          <div class="lcl-main">
            <div class="lcp-tools">
              <input class="input" type="search" placeholder={t("Kayıtta ara (mesaj ya da kullanıcı)…")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
              <button class="btn ghost small" classList={{ on: allDays() }} title={t("Seçili gün yerine tüm günlerde ara")} onClick={() => setAllDays(!allDays())}>
                <I.Search /> Tüm günler
              </button>
              <select class="f2-select small" value={platform()} onChange={(e) => setPlatform(e.currentTarget.value)} title={t("Platform")}>
                <option value="">{t("Tüm platformlar")}</option>
                <For each={PLATFORMS}>{(p) => <option value={p}>{LC.PLATFORM_NAMES[p]}</option>}</For>
              </select>
              <Show when={channels().length > 0}>
                <select class="f2-select small" value={channel()} onChange={(e) => setChannel(e.currentTarget.value)} title={t("Kanal / tür")} data-no-i18n>
                  <option value="">{t("Tüm kanallar")}</option>
                  <For each={channels()}>{(c) => <option value={c}>{c}</option>}</For>
                </select>
              </Show>
              <Show when={!allDays() && date()}>
                <button class="btn ghost small" title={t("Bu günü İndirilenler klasörüne metin dosyası olarak kaydet")} onClick={() => exportDay("txt")}>
                  <I.Download /> TXT
                </button>
                <button class="btn ghost small" title={t("Bu günü İndirilenler klasörüne tablo (CSV) olarak kaydet")} onClick={() => exportDay("csv")}>
                  <I.Download /> CSV
                </button>
                <Show
                  when={confirmDel() === "day"}
                  fallback={
                    <button class="btn ghost small danger" title={t("Bu günün kaydını sil")} onClick={() => setConfirmDel("day")}>
                      <I.Trash />
                    </button>
                  }
                >
                  <span class="lcl-confirm">
                    Bu gün silinsin mi?
                    <button class="btn small danger" onClick={del}>
                      Evet, sil
                    </button>
                    <button class="btn ghost small" onClick={() => setConfirmDel("")}>
                      Vazgeç
                    </button>
                  </span>
                </Show>
              </Show>
            </div>
            <div class="lcl-info">
              <Show when={user()}>
                <span class="lcl-chip" data-no-i18n>
                  <I.User /> {user()}
                  <button title={t("Kullanıcı süzgecini kaldır")} onClick={() => setUser("")}>
                    <I.X />
                  </button>
                </span>
              </Show>
              <span class="muted small">
                <Show when={allDays()} fallback={<span data-no-i18n>{date() ? dayLabel(date()) : ""}</span>}>
                  Tüm günler
                </Show>
                {" · "}
                {busy() ? t("Yükleniyor…") : t("{0} satır", LC.fmtCount(rows().length))}
                <Show when={allDays() && hits().length >= 1000}> {t("(ilk 1000 sonuç)")}</Show>
              </span>
              <Show when={filtered() || allDays()}>
                <button class="link" onClick={clearFilters}>
                  Süzgeçleri temizle
                </button>
              </Show>
            </div>
            <div class="lcp-list lcl-list">
              <Show
                when={rows().length}
                fallback={
                  <div class="lcp-empty">
                    {allDays() && !q().trim() && !user()
                      ? t("Tüm günlerde aramak için bir şey yaz ya da bir kullanıcıya tıkla.")
                      : filtered()
                        ? t("Bu süzgece uyan satır yok.")
                        : t("Bu günde kayıt yok.")}
                  </div>
                }
              >
                <For each={rows().slice(0, limit())}>
                  {(l) => (
                    <div class="lcp-msg lcl-row" classList={{ system: !l.user }}>
                      <span class="lcp-time lcl-time" data-no-i18n>
                        <Show when={allDays()}>
                          <button class="link" title={t("Bu günü aç")} onClick={() => openDay(l.date)}>
                            {l.date.slice(5)}
                          </button>{" "}
                        </Show>
                        {l.time}
                      </span>
                      <span class="lcp-ic" title={(isPlatform(l.platform) ? LC.PLATFORM_NAMES[l.platform] : "") + (l.channel ? ` · ${l.channel}` : "")}>
                        <Show when={isPlatform(l.platform) && l.platform !== "system"} fallback={<i class="lcl-tag">{l.channel || "•"}</i>}>
                          <PlatformIcon platform={l.platform as LC.Platform} size={16} />
                        </Show>
                      </span>
                      <div class="lcp-body" data-no-i18n>
                        <Show when={isPlatform(l.platform) && l.channel}>
                          <span class="lcp-tag" style={{ color: LC.PLATFORM_COLORS[l.platform as LC.Platform] }}>
                            [{l.channel}]{" "}
                          </span>
                        </Show>
                        <Show when={l.user}>
                          <button class="lcl-user" title={t("Bu kullanıcının tüm mesajları")} onClick={() => showUser(l.user)}>
                            <Marked text={l.user} q={q()} />
                          </button>
                          <span>: </span>
                        </Show>
                        <span class="lcp-text">
                          <Marked text={l.text} q={q()} />
                        </span>
                      </div>
                      <div class="lcp-acts">
                        <button title={t("Kopyala")} onClick={() => copy(l)}>
                          <I.Copy />
                        </button>
                        <Show when={l.user}>
                          <button title={t("Bu kullanıcının tüm mesajları")} onClick={() => showUser(l.user)}>
                            <I.Search />
                          </button>
                          <Show when={isPlatform(l.platform) && l.platform !== "streamlabs" && l.platform !== "system"}>
                            <button class="danger" title={t("Kullanıcıyı engelle")} onClick={() => ban(l)}>
                              <I.Ban />
                            </button>
                          </Show>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
                <Show when={rows().length > limit()}>
                  <div class="lcl-more">
                    <button class="btn ghost small" onClick={() => setLimit(limit() + PAGE * 4)}>
                      {t("Daha fazla göster ({0} satır daha)", LC.fmtCount(rows().length - limit()))}
                    </button>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </ProLockBox>
    </>
  );
}
