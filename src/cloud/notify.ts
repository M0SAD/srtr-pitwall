// Windows bildirim merkezi (yedek). Arkadaş mesajları ve istekleri artık kendi açılır penceremizle
// (src-tauri/src/toast.rs + src/window/Toast.tsx) gösterilir; bu sadece o pencere açılamazsa kullanılır.
// Windows bildirimleri; Odak yardımı/Rahatsız etmeyin, kapalı uygulama bildirimi izni ya da kurulu
// olmayan (geliştirme) sürümde kayıtlı uygulama kimliği olmaması yüzünden hiç görünmeyebilir.
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

let allowed: boolean | null = null;

export async function osNotify(title: string, body: string) {
  try {
    if (allowed === null) {
      allowed = await isPermissionGranted();
      if (!allowed) allowed = (await requestPermission()) === "granted";
    }
    if (allowed) sendNotification({ title, body });
  } catch {
    /* bildirim desteklenmiyorsa sessizce geç */
  }
}
