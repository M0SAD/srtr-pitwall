// Hesap → PRO üyelik: "Demo modunda adım görünebilsin" (profiles.demo_showcase; SQL c33)
import { Show, createSignal, onMount } from "solid-js";
import { demoShowcase, loadDemoShowcase, setDemoShowcase } from "@/cloud/demoShowcase";

export function DemoShowcaseToggle() {
  const [err, setErr] = createSignal("");
  onMount(() => void loadDemoShowcase());
  return (
    <Show when={demoShowcase() !== null}>
      <div class="row">
        <div>
          <b>Demo modunda adım görünebilsin</b>
          <small>Demo yarışındaki sahte sürücülerin arasında PRO üyelerin görünen adları da rastgele yer alır.</small>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={!!demoShowcase()}
            onChange={(e) => {
              setErr("");
              setDemoShowcase(e.currentTarget.checked).catch((x) => setErr(String(x?.message ?? x)));
            }}
          />
          <i />
        </label>
      </div>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
    </Show>
  );
}
