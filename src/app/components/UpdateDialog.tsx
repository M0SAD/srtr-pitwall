// Güncelleme penceresi: sürüm notları, "İndir ve kur" ve ilerleme çubuğu.
// Kurulum sessizdir (ileri/ileri yok): indirme bitince program kapanır, güncelleme kurulur ve yeni sürüm açılır.

import { Show } from "solid-js";
import { t } from "@/sdk/i18n";
import { installBytes, installError, installPct, installPhase, installUpdate, setUpdateDialog, update, updateDialog, version } from "../ui";
import { appState } from "../App";
import { Notes } from "./Notes";
import * as I from "../icons";

const mb = (n: number) => (n / 1048576).toFixed(1);

export function UpdateDialog() {
  const busy = () => installPhase() === "download" || installPhase() === "installing";
  return (
    <Show when={updateDialog() && update()?.available}>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && !busy() && setUpdateDialog(false)}>
        <div class="modal upd">
          <header>
            <h3>
              <I.Download /> {t("Yeni sürüm: {0}", update()!.version ?? "")}
            </h3>
            <Show when={!busy()}>
              <button class="btn ghost small" onClick={() => setUpdateDialog(false)}>
                Kapat
              </button>
            </Show>
          </header>
          <p class="muted small" data-no-i18n>
            {version()?.display} → {update()!.version}
          </p>

          <Show when={update()!.notes && installPhase() === "idle"}>
            <div class="notes upd-notes">
              <b>Yeni sürümdeki değişiklikler</b>
              <Notes text={update()!.notes!} />
            </div>
          </Show>

          <Show when={installPhase() !== "idle"}>
            <div class="upd-progress" classList={{ done: installPhase() === "installing", err: installPhase() === "error" }}>
              <div class="upd-bar">
                <i style={{ width: `${installPct()}%` }} classList={{ indeterminate: installPhase() === "installing" }} />
              </div>
              <div class="upd-status">
                <Show when={installPhase() === "download"}>
                  <span>{t("İndiriliyor… %{0}", installPct())}</span>
                  <small data-no-i18n>
                    {mb(installBytes().done)}
                    {installBytes().total ? ` / ${mb(installBytes().total!)}` : ""} MB
                  </small>
                </Show>
                <Show when={installPhase() === "installing"}>
                  <span>Kuruluyor… Program kapanacak ve yeni sürümle kendiliğinden açılacak.</span>
                </Show>
                <Show when={installPhase() === "error"}>
                  <span class="error">{installError()}</span>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={appState().connected && installPhase() === "idle"}>
            <p class="muted small">iRacing bağlıyken güncellersen overlay'ler kurulum boyunca kapanır.</p>
          </Show>

          <div class="btns">
            <button class="btn primary" disabled={busy()} onClick={installUpdate}>
              <I.Download /> {installPhase() === "error" ? "Tekrar dene" : busy() ? "Güncelleniyor…" : "İndir ve kur"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
