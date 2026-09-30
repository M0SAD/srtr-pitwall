// Windows bildirim merkezi / sağ alt köşe bildirimi (Steam mesajları gibi). Yarışta değilken ya da
// oyun tam ekran değilken görünür; rahatsız etme açıkken gönderilmez.
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
