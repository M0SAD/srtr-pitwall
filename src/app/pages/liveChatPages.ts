// Canlı Sohbet alt sayfaları: kabuk (App.tsx) bunu kullanır; sayfanın kendisi ilk açılışta yüklenir.

import { F } from "@/sdk/proFeatures";
import { isHiddenLiveTab } from "@/cloud/account";

export const LIVECHAT_PAGES: { id: string; label: string; feature?: string }[] = [
  { id: "chat", label: "Sohbet" },
  { id: "channels", label: "Kanallar" },
  { id: "moderation", label: "Moderasyon" },
  { id: "poll", label: "Anket", feature: F.livePoll },
  { id: "tts", label: "Sesli okuma", feature: F.liveTts },
  { id: "stt", label: "Konuşma → yazı", feature: F.liveStt },
  { id: "send", label: "Sohbete yaz", feature: F.liveSend },
  { id: "alerts", label: "Bildirimler", feature: F.liveAlerts },
  { id: "log", label: "Sohbet kaydı", feature: F.liveLog },
  { id: "obs", label: "OBS", feature: F.liveObs },
];

/** Kullanıcıya görünen sekmeler (yöneticinin gizledikleri hariç; yönetici hepsini görür) */
export const liveChatPages = () => LIVECHAT_PAGES.filter((p) => !isHiddenLiveTab(p.id));
