// Uygulama içi onay penceresi (tarayıcının confirm() kutusu yerine): Promise döner, Esc / dışına tıklama = vazgeç.
import { t } from "@/sdk/i18n";

export function askConfirm(text: string, opts: { note?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back confirm-back";
    const box = document.createElement("div");
    box.className = "modal confirm-box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    const p = document.createElement("p");
    p.className = "confirm-text";
    p.textContent = text;
    box.append(p);
    if (opts.note) {
      const n = document.createElement("p");
      n.className = "confirm-note muted";
      n.textContent = opts.note;
      box.append(n);
    }
    const row = document.createElement("div");
    row.className = "confirm-row";
    const no = document.createElement("button");
    no.className = "btn";
    no.textContent = t("Vazgeç");
    const yes = document.createElement("button");
    yes.className = opts.danger ? "btn danger" : "btn primary";
    yes.textContent = opts.ok ?? t("Tamam");
    row.append(no, yes);
    box.append(row);
    back.append(box);
    const prev = document.activeElement as HTMLElement | null;
    const done = (v: boolean) => {
      window.removeEventListener("keydown", key, true);
      back.remove();
      prev?.focus?.();
      resolve(v);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === yes ? no : yes).focus();
      }
    };
    window.addEventListener("keydown", key, true);
    back.addEventListener("pointerdown", (e) => e.target === back && done(false));
    no.addEventListener("click", () => done(false));
    yes.addEventListener("click", () => done(true));
    document.body.append(back);
    no.focus();
  });
}
