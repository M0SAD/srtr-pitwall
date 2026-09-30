// Yönetici: duyuru (bildirim) oluştur, gönderilenleri gör/sil; okunan bildirimlerin kaç saat kalacağını ayarla.

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { adminUsers, config, saveConfig, type AdminUser } from "@/cloud/account";
import { createAnnouncement, deleteAnnouncement, listAnnouncements, loadNotices, type Announcement } from "@/cloud/moderation";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const AUDIENCE: Record<Announcement["audience"], string> = { all: "Herkes", pro: "PRO üyeler", user: "Tek kullanıcı" };

export function AdminNotices(props: { run: Run }) {
  const [list, { refetch }] = createResource(() => listAnnouncements().catch(() => [] as Announcement[]));
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [audience, setAudience] = createSignal<Announcement["audience"]>("all");
  const [keep, setKeep] = createSignal("");
  const [days, setDays] = createSignal("");
  const [q, setQ] = createSignal("");
  const [found, setFound] = createSignal<AdminUser[]>([]);
  const [user, setUser] = createSignal<AdminUser | null>(null);
  const [defKeep, setDefKeep] = createSignal<string>("");

  const findUser = () =>
    props.run(async () => {
      setFound(((await adminUsers(q().trim(), "all", 0)) ?? []).slice(0, 8));
    }, "");

  const send = () =>
    props.run(async () => {
      if (!title().trim()) throw new Error("Başlık yaz");
      if (audience() === "user" && !user()) throw new Error("Kullanıcı seç");
      const d = Number(days());
      await createAnnouncement({
        title: title().trim().slice(0, 120),
        body: body().trim().slice(0, 2000),
        audience: audience(),
        user_id: audience() === "user" ? user()!.id : null,
        keep_hours: keep() ? Math.max(1, Math.round(Number(keep()))) : null,
        expires_at: d > 0 ? new Date(Date.now() + d * 86400_000).toISOString() : null,
      });
      setTitle("");
      setBody("");
      setUser(null);
      setFound([]);
      refetch();
      loadNotices();
    }, "Bildirim gönderildi");

  return (
    <>
      <h4>Bildirimler</h4>
      <p class="muted small">Oluşturduğun bildirim seçtiğin kişilerin zil simgesinde görünür. Okunmayan bildirim kalır; okunduktan sonra aşağıdaki süre kadar listede durur.</p>
      <div class="row">
        <div>
          <b>Okunduktan sonra kaç saat kalsın</b>
          <small>{t("Tüm bildirimler için varsayılan (şu an {0} saat)", config()?.notice_keep_hours ?? 24)}</small>
        </div>
        <div class="mqtt-host">
          <input
            class="input port"
            type="number"
            min="1"
            max="8760"
            placeholder={String(config()?.notice_keep_hours ?? 24)}
            value={defKeep()}
            onInput={(e) => setDefKeep(e.currentTarget.value)}
          />
          <button
            class="btn"
            disabled={!defKeep()}
            onClick={() =>
              props.run(async () => {
                await saveConfig({ notice_keep_hours: Math.max(1, Math.min(8760, Math.round(Number(defKeep()) || 24))) });
                setDefKeep("");
              }, "Bildirim süresi kaydedildi")
            }
          >
            Kaydet
          </button>
        </div>
      </div>

      <div class="an-form">
        <input class="input" maxLength={120} placeholder="Başlık" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        <textarea class="input cm-textarea" rows={3} maxLength={2000} placeholder="Mesaj (isteğe bağlı)" value={body()} onInput={(e) => setBody(e.currentTarget.value)} />
        <div class="an-opts">
          <label>
            <span>Kime</span>
            <select class="input" value={audience()} onChange={(e) => setAudience(e.currentTarget.value as Announcement["audience"])}>
              <option value="all">Herkes</option>
              <option value="pro">PRO üyeler</option>
              <option value="user">Tek kullanıcı</option>
            </select>
          </label>
          <label title="Boş bırakılırsa yukarıdaki varsayılan kullanılır">
            <span>Okunduktan sonra (saat)</span>
            <input class="input port" type="number" min="1" placeholder={String(config()?.notice_keep_hours ?? 24)} value={keep()} onInput={(e) => setKeep(e.currentTarget.value)} />
          </label>
          <label title="Boş: süresiz. Bu süre dolunca okunmamış olsa da kalkar.">
            <span>Yayında kalma (gün)</span>
            <input class="input port" type="number" min="0" placeholder="∞" value={days()} onInput={(e) => setDays(e.currentTarget.value)} />
          </label>
        </div>
        <Show when={audience() === "user"}>
          <div class="an-user">
            <Show
              when={user()}
              fallback={
                <div class="mqtt-host">
                  <input class="input" placeholder="Ad, e-posta ya da iRacing adı" value={q()} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && findUser()} />
                  <button class="btn" onClick={findUser}>
                    Ara
                  </button>
                </div>
              }
            >
              <span class="chip2" data-no-i18n>
                {user()!.display_name} · {user()!.email}
              </span>
              <button class="link" onClick={() => setUser(null)}>
                Değiştir
              </button>
            </Show>
            <Show when={!user() && found().length > 0}>
              <div class="an-found">
                <For each={found()}>
                  {(u) => (
                    <button class="btn ghost small" onClick={() => setUser(u)} data-no-i18n>
                      {u.display_name} · {u.email}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
        <div class="btns">
          <button class="btn primary" disabled={!title().trim()} onClick={send}>
            Bildirimi gönder
          </button>
        </div>
      </div>

      <Show when={(list() ?? []).length > 0}>
        <div class="an-list">
          <For each={list() ?? []}>
            {(a) => (
              <div class="an-item" classList={{ expired: !!a.expires_at && new Date(a.expires_at) < new Date() }}>
                <div>
                  <b data-no-i18n>{a.title}</b>
                  <Show when={a.body}>
                    <p class="small" data-no-i18n>
                      {a.body}
                    </p>
                  </Show>
                  <small class="muted">
                    {AUDIENCE[a.audience]} · {new Date(a.created_at).toLocaleString(localeTag())}
                    <Show when={a.keep_hours}> · {a.keep_hours} sa</Show>
                    <Show when={a.expires_at}> · ⌛ {new Date(a.expires_at!).toLocaleDateString(localeTag())}</Show>
                  </small>
                </div>
                <button
                  class="btn ghost small danger"
                  onClick={() =>
                    props.run(async () => {
                      await deleteAnnouncement(a.id);
                      refetch();
                      loadNotices();
                    }, "Bildirim silindi")
                  }
                >
                  Sil
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}
