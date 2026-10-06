// Hesap › PRO: yöneticinin ödeme kategorileri. Her kategori logo + başlık + genel açıklama ve plan kartı görünümünde
// bağlantılar ("Öde"). Hediye bölümünde de aynı bileşen kullanılır (gift: alıcı). Altta ödeme yöntemi görselleri.
import { For, Show, createSignal } from "solid-js";
import { PLAN_LIST, payGroupsShown, payMethods, payPerMonth, type AppConfig, type PayCat, type PayLink } from "@/cloud/account";
import { t } from "@/sdk/i18n";
import { PayLinkDialog } from "./PayLinkDialog";

export function PayCats(p: { cfg: () => AppConfig | null | undefined; open: (url: string) => void; gift?: () => string; badges?: boolean }) {
  const [dlg, setDlg] = createSignal<{ link: PayLink; cat: PayCat | null } | null>(null);
  const groups = () => payGroupsShown(p.cfg());
  const badges = () => (p.badges === false ? [] : (payMethods(p.cfg()).badges ?? []));
  return (
    <Show when={groups().length > 0}>
      <div class="paycats">
        <For each={groups()}>
          {(g) => (
            <section class="paycat">
              <Show when={g.cat}>
                <header class="paycat-head">
                  <Show when={g.cat!.img}>
                    <img class="paycat-logo" src={g.cat!.img} alt="" draggable={false} />
                  </Show>
                  <div class="paycat-txt">
                    <b data-no-i18n>{g.cat!.title}</b>
                    <Show when={g.cat!.note}>
                      <p data-no-i18n>{g.cat!.note}</p>
                    </Show>
                    <Show when={(g.cat!.badges ?? []).length > 0}>
                      <div class="paybadges paycat-badges">
                        <For each={g.cat!.badges}>{(b) => <img src={b} alt="" draggable={false} />}</For>
                      </div>
                    </Show>
                  </div>
                </header>
              </Show>
              <div class="pro-plans paycat-cards">
                <For each={g.links}>
                  {(l) => (
                    <div class="pro-plan paycard" classList={{ best: l.tag === "best", popular: l.tag === "popular" }}>
                      <Show when={l.tag}>
                        <span class="paycard-tag">{l.tag === "best" ? "En avantajlı" : "Popüler"}</span>
                      </Show>
                      <Show when={l.title} fallback={<small>{PLAN_LIST.find((x) => x.id === `${l.months}m`)?.label ?? "—"}</small>}>
                        <small data-no-i18n>{l.title}</small>
                      </Show>
                      <b data-no-i18n>{l.price || "\u00a0"}</b>
                      <span class="paycard-per">{payPerMonth(l.price, l.months) ? t("ayda {0}", payPerMonth(l.price, l.months)) : "\u00a0"}</span>
                      <button class="btn primary small" onClick={() => setDlg({ link: l, cat: g.cat })}>
                        {p.gift ? "Hediye et" : "Öde"}
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
        <Show when={badges().length > 0}>
          <div class="paybadges">
            <For each={badges()}>{(b) => <img src={b} alt="" draggable={false} />}</For>
          </div>
        </Show>
      </div>
      <Show when={dlg()}>
        <PayLinkDialog link={dlg()!.link} cat={dlg()!.cat} gift={p.gift?.()} open={p.open} onClose={() => setDlg(null)} />
      </Show>
    </Show>
  );
}
