// Yönetim ek bölümleri: PRO süresi düzenleyici, Destek, Görünürlük, Ücretsiz PRO kampanyası, Gelir.

import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { localeTag, t } from "@/sdk/i18n";
import { api } from "@/cloud/supabase";
import {
  adminAddExpense,
  adminChangePro,
  adminDeleteExpense,
  adminExpenses,
  adminPayments,
  adminProMembers,
  adminRevenue,
  config,
  isAdmin,
  payMethods,
  markedHiddenOverlay,
  markedHiddenSection,
  saveConfig,
  type AdminPayment,
  type AdminUser,
  type Expense,
  type Money,
  type ProChangeMode,
  type ProMember,
} from "@/cloud/account";
import { loadNotices } from "@/cloud/moderation";
import { adminTickets, categoryLabel, SUPPORT_CATEGORIES, type AdminSupportTicket } from "@/cloud/support";
import { manifests } from "@/sdk/registry";
import { StatusChip, TicketThread, fmtWhen } from "./Support";
import { setSupportFocus, supportFocus } from "../ui";
import "../admin.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const fmtDate = (v: string | number | null | undefined) => (v ? new Date(v).toLocaleDateString(localeTag()) : "—");
const SRC: Record<string, string> = { lemon: "Lemon Squeezy", patreon: "Patreon", kofi: "Ko-fi", manual: "Elle ödeme", admin: "Yönetici" };

export function fmtMoney(m: Money | null | undefined) {
  const e = Object.entries(m ?? {}).filter(([, v]) => Number(v) !== 0);
  if (!e.length) return "0";
  return e
    .map(([c, v]) => {
      try {
        return new Intl.NumberFormat(localeTag(), { style: "currency", currency: c }).format(Number(v));
      } catch {
        return `${Number(v).toFixed(2)} ${c}`;
      }
    })
    .join(" + ");
}

// ---------------------------------------------------------------------------
// PRO süresi düzenleyici (Üyeler)
// ---------------------------------------------------------------------------
const NOTIFY_KEY = "pitwall.admin.proNotify";

interface ProLogRow {
  id: number;
  by_name: string | null;
  old_until: string | null;
  new_until: string | null;
  source: string;
  note: string;
  created_at: string;
}

export function ProEditor(p: { user: AdminUser; run: Run; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = createSignal("");
  const [date, setDate] = createSignal("");
  const [note, setNote] = createSignal("");
  /** "Yayın logosuna müdahale edebilsin": işaretliyse verilen sürenin sonuna kadar logoyu kaldırabilir / taşıyabilir */
  const [logo, setLogo] = createSignal(false);
  // Ödeme kaydı (isteğe bağlı): tutar girilirse süre verilirken Gelir'e yazılır
  const [amount, setAmount] = createSignal("");
  const [currency, setCurrency] = createSignal(localStorage.getItem("pitwall.admin.payCur") || "TRY");
  const [method, setMethod] = createSignal(localStorage.getItem("pitwall.admin.payMethod") || "");
  const [item, setItem] = createSignal("");
  const amt = () => Math.max(0, parseFloat(amount().replace(",", ".")) || 0);
  /** Seçilebilen yöntemler: kendi ödeme kategorilerin + yaygın olanlar (elle de yazılabilir) */
  const methodList = () => [...new Set([...(payMethods(config()).cats ?? []).map((c) => c.title.trim()).filter(Boolean), "ByNoGame", "Patreon", "Lemon Squeezy", "Havale / EFT", "Papara", "PayPal", "Nakit"])];
  // Kutunun ilk durumu üyenin şu anki iznidir (profili yalnızca yönetici okuyabilir)
  api<{ pro_paid_until: string | null }[]>("GET", `profiles?id=eq.${p.user.id}&select=pro_paid_until`)
    .then((r) => setLogo(!!r?.[0]?.pro_paid_until && new Date(r[0].pro_paid_until).getTime() > Date.now()))
    .catch(() => {});
  const [notify, setNotify] = createSignal(localStorage.getItem(NOTIFY_KEY) === "1");
  const [log, { refetch }] = createResource(() =>
    api<ProLogRow[]>("POST", "rpc/admin_pro_log", { body: { p_user: p.user.id } }).catch(() => [] as ProLogRow[]),
  );
  const [cur, setCur] = createSignal<string | null>(p.user.pro_until);
  const active = () => !!cur() && new Date(cur()!).getTime() > Date.now();
  const forever = () => active() && new Date(cur()!).getTime() - Date.now() > 3000 * 86400_000;
  const left = () => (active() ? Math.ceil((new Date(cur()!).getTime() - Date.now()) / 86400_000) : 0);
  createEffect(() => localStorage.setItem(NOTIFY_KEY, notify() ? "1" : "0"));
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
  window.addEventListener("keydown", onKey);
  onCleanup(() => window.removeEventListener("keydown", onKey));

  const apply = (mode: ProChangeMode, o: { days?: number; until?: Date } = {}, label = "", bought = "") =>
    p.run(async () => {
      const pay = mode !== "remove" && amt() > 0;
      const nu = await adminChangePro(p.user.id, mode, { ...o, note: note().trim(), notify: notify(), logo: logo(), ...(pay ? { amount: amt(), currency: currency(), method: method().trim(), item: item().trim() || bought } : {}) });
      if (pay) {
        localStorage.setItem("pitwall.admin.payCur", currency());
        localStorage.setItem("pitwall.admin.payMethod", method().trim());
        // Aynı ödeme ikinci bir süre eklemede yeniden yazılmasın
        setAmount("");
        setItem("");
      }
      setCur(nu ?? null);
      setNote("");
      setDays("");
      refetch();
      p.onDone();
    }, (label || (mode === "remove" ? t("PRO kaldırıldı") : t("PRO süresi güncellendi"))) + (notify() ? t(" · kullanıcıya bildirildi") : ""));

  /** Takvim ayı ekle: kalan sürenin (bitmişse bugünün) üstüne; ayın günü korunur (31 Oca + 1 ay = 28/29 Şub) */
  const addMonths = (m: number) => {
    const base = new Date(Math.max(Date.now(), active() ? new Date(cur()!).getTime() : 0));
    const day = base.getDate();
    const until = new Date(base);
    until.setDate(1);
    until.setMonth(until.getMonth() + m);
    until.setDate(Math.min(day, new Date(until.getFullYear(), until.getMonth() + 1, 0).getDate()));
    return apply("set", { until }, t("+{0} ay eklendi", m), t("{0} ay PRO", m));
  };
  const add = (d: number) => d && apply("add", { days: d }, d > 0 ? t("+{0} gün eklendi", d) : t("{0} gün düşüldü", Math.abs(d)), d > 0 ? t("{0} gün PRO", d) : "");

  return (
    <Portal>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
        <div class="modal pe-modal">
          <header>
            <div>
              <h3 data-no-i18n>{p.user.display_name || "(adsız)"}</h3>
              <small class="muted" data-no-i18n>
                {p.user.email}
              </small>
            </div>
            <button class="btn ghost small" onClick={p.onClose}>
              Kapat
            </button>
          </header>
          <div class="pe-now" classList={{ on: active() }}>
            <b>{forever() ? "∞" : active() ? left() : "—"}</b>
            <div>
              <span>{forever() ? "Süresiz PRO" : active() ? t("gün kaldı · bitiş {0}", fmtDate(cur())) : "PRO değil"}</span>
              <small class="muted">{p.user.pro_source ? t("Kaynak: {0}", SRC[p.user.pro_source] ?? p.user.pro_source) : ""}</small>
            </div>
          </div>

          <label class="check pe-notify">
            <input type="checkbox" checked={logo()} onChange={(e) => setLogo(e.currentTarget.checked)} />
            <span>
              <b>Yayın logosuna müdahale edebilsin</b>
              <small class="muted">
                İşaretliyken aşağıdan verdiğin sürenin sonuna kadar logoyu kaldırabilir / taşıyabilir ve Setup Örtüsü'nü özelleştirebilir. İşaretsizken bu haklar kapanır. Her
                süre eklediğinde kutunun o anki durumu uygulanır.
              </small>
            </span>
          </label>

          <label class="pe-label">Ödeme (isteğe bağlı)</label>
          <div class="pe-quick pe-pay">
            <input class="input pe-days" inputmode="decimal" placeholder="Tutar" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            <select class="f2-select small" value={currency()} onChange={(e) => setCurrency(e.currentTarget.value)}>
              <For each={["TRY", "USD", "EUR", "GBP"]}>{(c) => <option value={c}>{c}</option>}</For>
            </select>
            <input class="input" list="pe-methods" placeholder="Ödeme yöntemi" value={method()} onInput={(e) => setMethod(e.currentTarget.value)} />
            <datalist id="pe-methods">
              <For each={methodList()}>{(m) => <option value={m} />}</For>
            </datalist>
            <input class="input" list="pe-items" placeholder="Ne aldı (ör. 3 ay PRO)" value={item()} onInput={(e) => setItem(e.currentTarget.value)} />
            <datalist id="pe-items">
              <For each={[1, 3, 6, 12]}>{(m) => <option value={t("{0} ay PRO", m)} />}</For>
              <option value={t("Süresiz PRO")} />
            </datalist>
          </div>
          <small class="muted">
            Tutar yazarsan aşağıdan süre verdiğin anda bu ödeme Gelir sayfasına kaydedilir (yöntem ve alınan ürünle birlikte). Boş bırakırsan ödeme kaydı oluşmaz.
            "Ne aldı" boşsa verdiğin süre yazılır.
          </small>

          <label class="pe-label">Ay ekle</label>
          <div class="pe-quick">
            <For each={[1, 3, 6, 12]}>
              {(m) => (
                <button class="btn small" onClick={() => addMonths(m)}>
                  +{t("{0} ay", m)}
                </button>
              )}
            </For>
            <small class="muted pe-amt">Takvim ayı olarak kalan sürenin üstüne eklenir (süre bitmişse bugünden sayılır).</small>
          </div>

          <label class="pe-label">Gün ekle / çıkar</label>
          <div class="pe-quick">
            <For each={[7, 30, 90, 365]}>
              {(d) => (
                <button class="btn small" onClick={() => add(d)}>
                  +{d}
                </button>
              )}
            </For>
            <For each={[-7, -30]}>
              {(d) => (
                <button class="btn small danger" disabled={!active()} onClick={() => add(d)}>
                  −{Math.abs(d)}
                </button>
              )}
            </For>
            <input
              class="input pe-days"
              type="number"
              placeholder="± gün"
              value={days()}
              onInput={(e) => setDays(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && add(parseInt(days(), 10) || 0)}
            />
            <button class="btn small" disabled={!parseInt(days(), 10)} onClick={() => add(parseInt(days(), 10) || 0)}>
              Uygula
            </button>
          </div>
          <small class="muted">Süre bitmişse eklenen gün bugünden sayılır. Eksi değer süreyi kısaltır.</small>

          <label class="pe-label">Tarihe ayarla</label>
          <div class="pe-quick">
            <input class="input" type="date" value={date()} onInput={(e) => setDate(e.currentTarget.value)} />
            <button class="btn small" disabled={!date()} onClick={() => apply("set", { until: new Date(date() + "T23:59:00") }, t("Bitiş {0} olarak ayarlandı", fmtDate(date() + "T23:59:00")))}>
              Bu tarihe ayarla
            </button>
            <button class="btn small" onClick={() => apply("unlimited", {}, t("Süresiz PRO verildi"), t("Süresiz PRO"))}>
              Süresiz
            </button>
            <button
              class="btn small danger"
              disabled={!active()}
              onClick={() => confirm(t("{0} hesabının PRO üyeliği kaldırılsın mı?", p.user.display_name)) && apply("remove")}
            >
              PRO'yu kaldır
            </button>
          </div>

          <label class="pe-label">Not (geçmişe yazılır{notify() ? ", e-postada da görünür" : ""})</label>
          <input class="input" maxLength={200} placeholder="ör. yayın desteği, hata telafisi" value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
          <label class="check pe-notify">
            <input type="checkbox" checked={notify()} onChange={(e) => setNotify(e.currentTarget.checked)} />
            <span>
              <b>Kullanıcıya bildir (e-posta + bildirim)</b>
              <small class="muted">Değişiklik kullanıcıya uygulamada bildirim ve kendi dilinde e-posta olarak gider.</small>
            </span>
          </label>

          <details class="pe-log">
            <summary>{t("Süre geçmişi ({0})", (log() ?? []).length)}</summary>
            <For each={log() ?? []} fallback={<p class="muted small">Kayıt yok.</p>}>
              {(r) => (
                <div class="pe-log-row">
                  <small class="muted">{fmtWhen(r.created_at)}</small>
                  <span>
                    {fmtDate(r.old_until)} → {r.new_until ? fmtDate(r.new_until) : t("kaldırıldı")}
                  </span>
                  <small class="muted" data-no-i18n>
                    {SRC[r.source] ?? r.source} · {r.by_name ?? "sistem"}
                    {r.note ? ` · ${r.note}` : ""}
                  </small>
                </div>
              )}
            </For>
          </details>
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Destek (yönetici)
// ---------------------------------------------------------------------------
export function AdminSupport() {
  const [status, setStatus] = createSignal("");
  const [cat, setCat] = createSignal("");
  const [list, { refetch }] = createResource(
    () => [status(), cat()] as const,
    ([s, c]) => adminTickets(s, c).catch(() => [] as AdminSupportTicket[]),
  );
  const [open, setOpen] = createSignal("");
  // Seçili talep liste süzgecinde görünmese de açık kalsın
  const [picked, setPicked] = createSignal<AdminSupportTicket | null>(null);
  const timer = window.setInterval(() => !document.hidden && refetch(), 60_000);
  onCleanup(() => clearInterval(timer));
  createEffect(() => {
    const f = supportFocus();
    if (f) {
      setOpen(f);
      setSupportFocus(null);
      setStatus("");
    }
  });
  createEffect(() => {
    const l = list();
    const hit = l?.find((x) => x.id === open());
    if (hit) setPicked(hit);
  });
  const unread = () => (list() ?? []).filter((x) => x.unread).length;
  return (
    <div class="sp-layout">
      <aside class="sp-side panel admin-panel">
        <div class="cm-tabs sp-filters">
          <For
            each={
              [
                ["", "Hepsi"],
                ["unread", "Okunmamış"],
                ["open", "Açık"],
                ["answered", "Yanıtlandı"],
                ["closed", "Kapalı"],
              ] as const
            }
          >
            {([id, label]) => (
              <button classList={{ on: status() === id }} onClick={() => setStatus(id)}>
                {label}
              </button>
            )}
          </For>
        </div>
        <div class="sp-filters">
          <select value={cat()} onChange={(e) => setCat(e.currentTarget.value)}>
            <option value="">Tüm kategoriler</option>
            <For each={SUPPORT_CATEGORIES}>{(c) => <option value={c.id}>{c.label}</option>}</For>
          </select>
          <button class="btn ghost small" onClick={() => refetch()}>
            Yenile
          </button>
        </div>
        <Show when={unread() > 0}>
          <small class="muted">{t("{0} talepte okunmamış mesaj var", unread())}</small>
        </Show>
        <Show when={(list() ?? []).length > 0} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Talep yok."}</p>}>
          <div class="sp-list">
            <For each={list()}>
              {(tk) => (
                <button class="sp-item" classList={{ sel: open() === tk.id, unread: tk.unread }} onClick={() => (setOpen(tk.id), setPicked(tk))}>
                  <div class="sp-item-top">
                    <b data-no-i18n>{tk.subject}</b>
                    <Show when={tk.unread}>
                      <i class="sp-dot" title="Okunmamış" />
                    </Show>
                  </div>
                  <small class="muted">
                    <span data-no-i18n>{tk.display_name || tk.email || "?"}</span> · {categoryLabel(tk.category)} · {fmtWhen(tk.updated_at)}
                  </small>
                  <Show when={tk.last_body}>
                    <span class="sp-snippet" data-no-i18n>
                      {tk.last_body}
                    </span>
                  </Show>
                  <StatusChip status={tk.status} />
                </button>
              )}
            </For>
          </div>
        </Show>
      </aside>
      <section class="sp-main panel admin-panel">
        <Show when={picked() && picked()!.id === open()} fallback={<p class="muted">Soldan bir talep seç.</p>}>
          <TicketThread
            ticket={picked()!}
            staff
            owner={[picked()!.display_name ?? "?", picked()!.email].filter(Boolean).join(" · ")}
            onChanged={() => {
              refetch();
              loadNotices();
            }}
            canDelete={isAdmin()}
            onDeleted={() => {
              setOpen("");
              setPicked(null);
              refetch();
              loadNotices();
            }}
          />
        </Show>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Görünürlük: bölümleri ve overlay'leri gizle
// ---------------------------------------------------------------------------
/** Gizlenebilen sol menü bölümleri (Yönetim, Ayarlar ve Hesap gizlenemez) */
export const HIDEABLE_SECTIONS: { id: string; label: string }[] = [
  { id: "overlays", label: "Overlay'ler" },
  { id: "layouts", label: "Düzenler" },
  { id: "streaming", label: "Yayın" },
  { id: "drivers", label: "Sürücüler" },
  { id: "telemetry", label: "Telemetri" },
  { id: "community", label: "Topluluk" },
  { id: "shots", label: "Ekran Görüntüleri" },
  { id: "tools", label: "Araçlar" },
  { id: "voice", label: "Sesli Mühendis" },
  { id: "livechat", label: "Canlı Sohbet" },
  { id: "support", label: "Destek" },
  { id: "pro", label: "PRO" },
];

export function AdminVisibility(p: { run: Run }) {
  const toggle = (key: "hidden_sections" | "hidden_overlays", id: string, hide: boolean) => {
    const cur = new Set(config()?.[key] ?? []);
    hide ? cur.add(id) : cur.delete(id);
    p.run(() => saveConfig({ [key]: [...cur] }), hide ? t("Gizlendi") : t("Gösteriliyor"));
  };
  return (
    <section class="panel admin-panel">
      <h3>Görünürlük</h3>
      <p class="muted small">
        Gizlenen bölümler ve overlay'ler yönetici olmayan kullanıcılarda görünmez: sol menüden, overlay listesinden ve ekle menüsünden kalkar, açık olanlar
        ekrana çizilmez. Yöneticiler hepsini görmeye devam eder ("gizli" rozetiyle). Yönetim, Ayarlar ve Hesap gizlenemez.
      </p>
      <h4>Sol menü bölümleri</h4>
      <div class="vis-grid">
        <For each={HIDEABLE_SECTIONS}>
          {(s) => (
            <label class="vis-item" classList={{ off: markedHiddenSection(s.id) }}>
              <input type="checkbox" checked={!markedHiddenSection(s.id)} onChange={(e) => toggle("hidden_sections", s.id, !e.currentTarget.checked)} />
              <span>{s.label}</span>
              <Show when={markedHiddenSection(s.id)}>
                <i class="vis-badge">gizli</i>
              </Show>
            </label>
          )}
        </For>
      </div>
      <h4>Overlay'ler</h4>
      <div class="btns vis-bulk">
        <button class="btn ghost small" onClick={() => p.run(() => saveConfig({ hidden_overlays: [] }), t("Tüm overlay'ler gösteriliyor"))}>
          Hepsini göster
        </button>
      </div>
      <div class="vis-grid">
        <For each={manifests}>
          {(m) => (
            <label class="vis-item" classList={{ off: markedHiddenOverlay(m.id) }}>
              <input type="checkbox" checked={!markedHiddenOverlay(m.id)} onChange={(e) => toggle("hidden_overlays", m.id, !e.currentTarget.checked)} />
              <span>{m.name}</span>
              <Show when={markedHiddenOverlay(m.id)}>
                <i class="vis-badge">gizli</i>
              </Show>
            </label>
          )}
        </For>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ücretsiz PRO kampanyası
// ---------------------------------------------------------------------------
export function AdminPromo(p: { run: Run }) {
  const until = () => {
    const v = config()?.promo_pro_until;
    return v && new Date(v).getTime() > Date.now() ? new Date(v) : null;
  };
  const [date, setDate] = createSignal("");
  const [note, setNote] = createSignal(config()?.promo_note ?? "");
  const set = (d: Date | null, ok: string) => p.run(() => saveConfig({ promo_pro_until: d ? d.toISOString() : null, promo_note: note().trim() }), ok);
  const plus = (days: number) => {
    const base = until()?.getTime() ?? Date.now();
    set(new Date(base + days * 86400_000), t("Kampanya {0} güne ayarlandı", days));
  };
  return (
    <section class="panel admin-panel">
      <h3>Ücretsiz PRO kampanyası</h3>
      <p class="muted small">
        Kampanya süresince <b>giriş yapmış tüm üyeler</b> tüm PRO özelliklerini kullanır (PRO overlay'ler, sesli mühendis, mesajlaşma, paylaşım…). Giriş
        yapmayanlar yararlanamaz; böylece kampanya hesap açmaya da teşvik eder ve sunucu tarafındaki PRO denetimleri (hesaba bağlı) tutarlı kalır. Sitede
        ve programda kampanya bitişi gösterilir. Süre bitince her şey kendiliğinden eski haline döner.
      </p>
      <div class="promo-now" classList={{ on: !!until() }}>
        <b>{until() ? Math.ceil((until()!.getTime() - Date.now()) / 86400_000) : "—"}</b>
        <span>{until() ? t("gün kaldı · bitiş {0}", until()!.toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })) : "Kampanya kapalı"}</span>
      </div>
      <div class="row">
        <div>
          <b>Kampanya notu</b>
          <small>Sitedeki şeritte ve programda gösterilir (isteğe bağlı)</small>
        </div>
        <input class="input admin-wide" maxLength={160} placeholder="ör. Bayrama özel herkese PRO!" value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
      </div>
      <div class="pe-quick">
        <For each={[7, 14, 30]}>
          {(d) => (
            <button class="btn small" onClick={() => plus(d)}>
              {until() ? t("+{0} gün uzat", d) : t("{0} gün başlat", d)}
            </button>
          )}
        </For>
        <input class="input" type="date" value={date()} onInput={(e) => setDate(e.currentTarget.value)} />
        <button class="btn small" disabled={!date()} onClick={() => set(new Date(date() + "T23:59:00"), t("Kampanya bitişi ayarlandı"))}>
          Bu tarihe kadar
        </button>
        <Show when={until()}>
          <button class="btn small" onClick={() => set(until(), t("Not kaydedildi"))}>
            Notu kaydet
          </button>
          <button class="btn small danger" onClick={() => confirm(t("Kampanya şimdi bitirilsin mi?")) && set(null, t("Kampanya bitirildi"))}>
            Bitir
          </button>
        </Show>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gelir: kazanç, parayla PRO olanlar, ücretsiz PRO olanlar
// ---------------------------------------------------------------------------
export function AdminRevenue() {
  const [rev, { refetch }] = createResource(() => adminRevenue().catch(() => null));
  const [kind, setKind] = createSignal<"paid" | "free">("paid");
  const [rows] = createResource(kind, (k) => adminProMembers(k).catch(() => [] as ProMember[]));
  const [q, setQ] = createSignal("");
  // Ödemeler: yönteme göre döküm ve son ödemeler (elle girilenlerde yöntem yazılıdır; diğerlerinde ödeme kaynağı)
  const [pays, { refetch: refetchPays }] = createResource(() => adminPayments().catch(() => [] as AdminPayment[]));
  const [payAll, setPayAll] = createSignal(false);
  // Tarih aralığı (boş = tüm zamanlar): gelir, gider, yöntem dökümü ve listeler bu aralığa göre
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const presets = (): { label: string; from: string; to: string }[] => {
    const n = new Date();
    return [
      { label: "Tüm zamanlar", from: "", to: "" },
      { label: "Bu ay", from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: "" },
      { label: "Geçen ay", from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) },
      { label: "Son 30 gün", from: iso(new Date(n.getTime() - 30 * 86400_000)), to: "" },
      { label: "Bu yıl", from: iso(new Date(n.getFullYear(), 0, 1)), to: "" },
    ];
  };
  const inRange = (d: string) => {
    const day = d.length > 10 ? iso(new Date(d)) : d;
    return (!from() || day >= from()) && (!to() || day <= to());
  };
  const paysIn = () => (pays() ?? []).filter((x) => inRange(x.created_at));
  const [exps, { refetch: refetchExps }] = createResource(() => adminExpenses().catch(() => [] as Expense[]));
  const expsIn = () => (exps() ?? []).filter((x) => inRange(x.spent_at));
  const sumBy = <T,>(list: T[], cur: (x: T) => string, val: (x: T) => number): Money => {
    const m: Money = {};
    for (const x of list) m[cur(x)] = (m[cur(x)] ?? 0) + val(x);
    return m;
  };
  const income = () => sumBy(paysIn(), (x) => x.currency, (x) => (x.kind === "refund" ? -1 : 1) * Number(x.amount));
  const spent = () => sumBy(expsIn(), (x) => x.currency, (x) => Number(x.amount));
  const net = () => {
    const m: Money = { ...income() };
    for (const [c, v] of Object.entries(spent())) m[c] = (m[c] ?? 0) - v;
    return m;
  };
  const money = (m: Money) => (Object.keys(m).length ? fmtMoney(m) : "0");
  // Yeni gider formu
  const [eTitle, setETitle] = createSignal("");
  const [eCat, setECat] = createSignal("");
  const [eAmt, setEAmt] = createSignal("");
  const [eCur, setECur] = createSignal("TRY");
  const [eDate, setEDate] = createSignal(iso(new Date()));
  const [eNote, setENote] = createSignal("");
  const [eErr, setEErr] = createSignal("");
  const addExpense = async () => {
    const amount = parseFloat(eAmt().replace(",", ".")) || 0;
    if (!eTitle().trim() || amount <= 0) return setEErr(t("Ne için harcandığını ve tutarı yaz."));
    setEErr("");
    try {
      await adminAddExpense({ title: eTitle().trim().slice(0, 120), category: eCat().trim().slice(0, 60), amount, currency: eCur(), spent_at: eDate() || iso(new Date()), note: eNote().trim().slice(0, 300) });
      setETitle("");
      setEAmt("");
      setENote("");
      refetchExps();
    } catch (e) {
      setEErr(String((e as Error).message ?? e));
    }
  };
  const delExpense = async (x: Expense) => {
    if (!confirm(t('"{0}" gideri silinsin mi?', x.title))) return;
    await adminDeleteExpense(x.id).catch((e) => setEErr(String((e as Error).message ?? e)));
    refetchExps();
  };
  const methodName = (x: AdminPayment) => (x.method || "").trim() || SRC[x.source] || x.source || "—";
  const byMethod = () => {
    const m = new Map<string, { name: string; count: number; month: Money; all: Money }>();
    const m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    for (const x of paysIn()) {
      const name = methodName(x);
      const r = m.get(name) ?? { name, count: 0, month: {}, all: {} };
      const v = (x.kind === "refund" ? -1 : 1) * Number(x.amount);
      if (x.kind !== "refund") r.count++;
      r.all[x.currency] = (r.all[x.currency] ?? 0) + v;
      if (new Date(x.created_at).getTime() >= m0) r.month[x.currency] = (r.month[x.currency] ?? 0) + v;
      m.set(name, r);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  };
  const shown = () => {
    const s = q().trim().toLowerCase();
    return (rows() ?? []).filter((r) => !s || `${r.display_name} ${r.email}`.toLowerCase().includes(s));
  };
  return (
    <section class="panel admin-panel">
      <h3>Gelir</h3>
      <div class="cm-tabs rev-tabs rev-range">
        <For each={presets()}>
          {(pz) => (
            <button classList={{ on: from() === pz.from && to() === pz.to }} onClick={() => (setFrom(pz.from), setTo(pz.to))}>
              {t(pz.label)}
            </button>
          )}
        </For>
        <span class="lt-sp" />
        <input class="input" type="date" value={from()} title="Başlangıç" onInput={(e) => setFrom(e.currentTarget.value)} />
        <span>–</span>
        <input class="input" type="date" value={to()} title="Bitiş" onInput={(e) => setTo(e.currentTarget.value)} />
      </div>
      <Show when={rev()} fallback={<p class="muted small">{rev.loading ? "Yükleniyor…" : "Gelir bilgisi okunamadı."}</p>}>
        <div class="stat-grid">
          <div class="stat pro">
            <b>{money(income())}</b>
            <small>{t("Gelir ({0} ödeme)", paysIn().filter((x) => x.kind !== "refund").length)}</small>
          </div>
          <div class="stat">
            <b>{money(spent())}</b>
            <small>{t("Gider ({0} kayıt)", expsIn().length)}</small>
          </div>
          <div class="stat on">
            <b>{money(net())}</b>
            <small>Net (gelir − gider)</small>
          </div>
          <div class="stat">
            <b>{rev()!.paying_users}</b>
            <small>Ödeme yapan üye</small>
          </div>
          <div class="stat on">
            <b>{rev()!.paid_pro}</b>
            <small>Parayla PRO (aktif)</small>
          </div>
          <div class="stat">
            <b>{rev()!.free_pro}</b>
            <small>Ücretsiz PRO (aktif)</small>
          </div>
        </div>
        <small class="muted">
          İadeler düşülmüştür; farklı para birimleri ayrı toplanır.
          <Show when={rev()!.promo_until && new Date(rev()!.promo_until!).getTime() > Date.now()}>
            {" "}
            {t("Ücretsiz PRO kampanyası {0} tarihine kadar sürüyor (herkes PRO; bu listelere girmez).", fmtDate(rev()!.promo_until))}
          </Show>
        </small>
      </Show>
      <Show when={(pays() ?? []).length}>
        <h4 class="rev-h">Ödeme yöntemine göre</h4>
        <div class="rev-table">
          <div class="rev-row head">
            <span>Yöntem</span>
            <span>Ödeme sayısı</span>
            <span>Toplam</span>
          </div>
          <For each={byMethod()}>
            {(m) => (
              <div class="rev-row">
                <span>
                  <b data-no-i18n>{m.name}</b>
                </span>
                <span>{m.count}</span>
                <span>{fmtMoney(m.all)}</span>
              </div>
            )}
          </For>
        </div>
        <h4 class="rev-h">Son ödemeler</h4>
        <div class="rev-table">
          <div class="rev-row head">
            <span>Üye</span>
            <span>Tarih</span>
            <span>Yöntem · ne aldı</span>
            <span>Tutar</span>
          </div>
          <For each={paysIn().slice(0, payAll() ? 1000 : 15)} fallback={<p class="muted small">Bu aralıkta ödeme yok.</p>}>
            {(x) => (
              <div class="rev-row">
                <span>
                  <b data-no-i18n>{x.display_name || "(adsız)"}</b>
                  <small class="muted" data-no-i18n>
                    {x.email}
                  </small>
                </span>
                <span>{fmtDate(x.created_at)}</span>
                <span data-no-i18n>
                  {methodName(x)}
                  <Show when={x.plan}>
                    <small class="muted">{x.plan}</small>
                  </Show>
                </span>
                <span>
                  {x.kind === "refund" ? "−" : ""}
                  {fmtMoney({ [x.currency]: Number(x.amount) })}
                  <Show when={x.kind === "refund"}>
                    <small class="muted">iade</small>
                  </Show>
                </span>
              </div>
            )}
          </For>
        </div>
        <Show when={paysIn().length > 15 && !payAll()}>
          <button class="btn ghost small" onClick={() => setPayAll(true)}>
            {t("Tümünü göster ({0})", paysIn().length)}
          </button>
        </Show>
      </Show>
      <h4 class="rev-h">Giderler</h4>
      <div class="pe-quick pe-pay">
        <input class="input" placeholder="Ne için (ör. sunucu, alan adı)" value={eTitle()} onInput={(e) => setETitle(e.currentTarget.value)} />
        <input class="input" list="exp-cats" placeholder="Kategori" value={eCat()} onInput={(e) => setECat(e.currentTarget.value)} />
        <datalist id="exp-cats">
          <For each={[...new Set(["Sunucu", "Alan adı", "Yazılım", "Reklam", "Komisyon", "Vergi", ...(exps() ?? []).map((x) => x.category).filter(Boolean)])]}>{(c) => <option value={c} />}</For>
        </datalist>
        <input class="input pe-days" inputmode="decimal" placeholder="Tutar" value={eAmt()} onInput={(e) => setEAmt(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && addExpense()} />
        <select class="f2-select small" value={eCur()} onChange={(e) => setECur(e.currentTarget.value)}>
          <For each={["TRY", "USD", "EUR", "GBP"]}>{(c) => <option value={c}>{c}</option>}</For>
        </select>
        <input class="input" type="date" value={eDate()} onInput={(e) => setEDate(e.currentTarget.value)} />
        <input class="input" placeholder="Not (isteğe bağlı)" value={eNote()} onInput={(e) => setENote(e.currentTarget.value)} />
        <button class="btn small primary" onClick={addExpense}>
          Gider ekle
        </button>
      </div>
      <Show when={eErr()}>
        <p class="error">{eErr()}</p>
      </Show>
      <div class="rev-table">
        <div class="rev-row head">
          <span>Gider</span>
          <span>Tarih</span>
          <span>Kategori</span>
          <span>Tutar</span>
        </div>
        <For each={expsIn()} fallback={<p class="muted small">{exps.loading ? "Yükleniyor…" : "Bu aralıkta gider yok."}</p>}>
          {(x) => (
            <div class="rev-row">
              <span data-no-i18n>
                <b>{x.title}</b>
                <Show when={x.note}>
                  <small class="muted">{x.note}</small>
                </Show>
              </span>
              <span>{fmtDate(x.spent_at)}</span>
              <span data-no-i18n>{x.category || "—"}</span>
              <span>
                {fmtMoney({ [x.currency]: Number(x.amount) })}{" "}
                <button class="link" title="Sil" onClick={() => delExpense(x)}>
                  ✕
                </button>
              </span>
            </div>
          )}
        </For>
      </div>
      <h4 class="rev-h">PRO üyeler</h4>
      <div class="cm-tabs rev-tabs">
        <button classList={{ on: kind() === "paid" }} onClick={() => setKind("paid")}>
          {t("Parayla PRO ({0})", rev()?.paid_pro ?? "…")}
        </button>
        <button classList={{ on: kind() === "free" }} onClick={() => setKind("free")}>
          {t("Ücretsiz PRO ({0})", rev()?.free_pro ?? "…")}
        </button>
        <span class="lt-sp" />
        <input class="input" placeholder="Ara" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="btn ghost small" onClick={() => (refetch(), refetchPays(), refetchExps())}>
          Yenile
        </button>
      </div>
      <p class="muted small">
        {kind() === "paid"
          ? "Aktif PRO olup ödeme kaynağından (Lemon Squeezy, Patreon) gelen ya da ödeme kaydı olan üyeler."
          : "Aktif PRO olup hiç ödemesi olmayan üyeler (yönetici tarafından verilen süreler vb.)."}
      </p>
      <div class="rev-table">
        <div class="rev-row head">
          <span>Üye</span>
          <span>PRO bitişi</span>
          <span>Kaynak</span>
          <span>Ödediği</span>
        </div>
        <For each={shown()} fallback={<p class="muted small">{rows.loading ? "Yükleniyor…" : "Kimse yok."}</p>}>
          {(r) => (
            <div class="rev-row">
              <span>
                <b data-no-i18n>{r.display_name || "(adsız)"}</b>
                <small class="muted" data-no-i18n>
                  {r.email}
                </small>
              </span>
              <span>
                {new Date(r.pro_until ?? 0).getTime() - Date.now() > 3000 * 86400_000 ? "Süresiz" : fmtDate(r.pro_until)}
                <Show when={r.renewing}>
                  <small class="muted">yenileniyor</small>
                </Show>
              </span>
              <span>{SRC[r.pro_source ?? ""] ?? r.pro_source ?? "—"}</span>
              <span>
                {r.payments ? fmtMoney(r.paid) : "—"}
                <Show when={r.payments}>
                  <small class="muted">{t("{0} ödeme · son {1}", r.payments, fmtDate(r.last_payment))}</small>
                </Show>
              </span>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
