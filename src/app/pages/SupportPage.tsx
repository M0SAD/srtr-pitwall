// Destek: üyelerin talep açtığı, taleplerini ve yanıtları gördüğü bölüm.

import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { loadNotices } from "@/cloud/moderation";
import { categoryLabel, myTickets, type SupportTicket } from "@/cloud/support";
import { NewTicketForm, StatusChip, TicketThread, fmtWhen } from "../components/Support";
import { go, setSupportFocus, supportFocus } from "../ui";
import * as I from "../icons";

export function SupportPage() {
  return (
    <div class="page">
      <Show
        when={cloudEnabled && session()}
        fallback={
          <section class="panel">
            <h3>Destek</h3>
            <p class="muted">Destek talebi açmak için hesabına giriş yapmalısın.</p>
            <button class="btn primary" onClick={() => go("account")}>
              Giriş yap
            </button>
          </section>
        }
      >
        <SupportInner />
      </Show>
    </div>
  );
}

function SupportInner() {
  const [list, { refetch }] = createResource(() => myTickets().catch(() => [] as SupportTicket[]));
  // "new": yeni talep formu, id: açık talep
  const [open, setOpen] = createSignal<string>("");
  const timer = window.setInterval(() => refetch(), 60_000);
  onCleanup(() => clearInterval(timer));

  // Bildirimden gelindiyse o talebi aç
  createEffect(() => {
    const f = supportFocus();
    if (f) {
      setOpen(f);
      setSupportFocus(null);
      refetch();
    }
  });
  // İlk açılış: talep yoksa form, varsa ilk talep
  createEffect(() => {
    const l = list();
    if (l && !open()) setOpen(l.length ? l[0].id : "new");
  });
  const current = () => (list() ?? []).find((x) => x.id === open());
  const changed = () => {
    refetch();
    loadNotices();
  };

  return (
    <div class="sp-layout">
      <aside class="sp-side panel">
        <button class="btn primary sp-new" onClick={() => setOpen("new")}>
          <I.Plus /> Yeni talep
        </button>
        <Show when={(list() ?? []).length > 0} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Henüz talebin yok."}</p>}>
          <div class="sp-list">
            <For each={list()}>
              {(tk) => (
                <button class="sp-item" classList={{ sel: open() === tk.id, unread: tk.unread }} onClick={() => setOpen(tk.id)}>
                  <div class="sp-item-top">
                    <b data-no-i18n>{tk.subject}</b>
                    <Show when={tk.unread}>
                      <i class="sp-dot" title="Yeni yanıt" />
                    </Show>
                  </div>
                  <small class="muted">
                    {categoryLabel(tk.category)} · {fmtWhen(tk.updated_at)}
                  </small>
                  <StatusChip status={tk.status} />
                </button>
              )}
            </For>
          </div>
        </Show>
      </aside>
      <section class="sp-main panel">
        <Show
          when={open() !== "new" && current()}
          fallback={
            <NewTicketForm
              onCreated={async (id) => {
                await refetch();
                setOpen(id);
              }}
              onCancel={(list() ?? []).length ? () => setOpen(list()![0].id) : undefined}
            />
          }
        >
          {(tk) => <TicketThread ticket={tk()} staff={false} onChanged={changed} />}
        </Show>
      </section>
    </div>
  );
}
