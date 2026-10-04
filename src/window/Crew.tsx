// Ayrı pencere: bir sürücünün Ekip Pitwall'ı (window.html?view=crew&owner=<id>). Arkadaşlar listesindeki
// "Ekip" düğmesi Rust'taki crew_window_open komutuyla açar; içerik paneldeki Ekip sayfasıyla aynıdır.
// Stil sırası (hangi kural hangisini ezer) panel sayfaları bölündükten sonra da eskisiyle aynı kalsın diye açıkça yazılır
import "@/app/components/proLock.css";
import "./window.css";
import "./events.css";
import "@/app/crew.css";
import { Show } from "solid-js";
import { session } from "@/cloud/supabase";
import { CrewPage } from "@/app/pages/CrewPage";

export function CrewWindow(props: { owner: string }) {
  return (
    <Show when={session()} fallback={<p class="muted small fdock-empty">Ekip Pitwall'ı için programda Hesap sayfasından giriş yap.</p>}>
      <Show when={props.owner} fallback={<p class="muted small fdock-empty">Sürücü seçilmedi.</p>}>
        <CrewPage owner={props.owner} />
      </Show>
    </Show>
  );
}
