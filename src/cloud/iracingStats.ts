// Üyenin KENDİ iRacing bilgileri (iRating, lisans + SR, ülke) → hesabı (SQL c56: profile_set_iracing).
// Kaynak iRacing oturum bilgisidir (Rust: player_iracing; sadece oyuncunun kendi aracı, başka sürücüler asla).
// iRacing API erişimi yoktur: değerler üye bu programla iRacing'e girdikçe güncellenir.
// Sınır: sadece değer değişince, değişmediyse hesap + iRacing üye no başına en çok bir kez; iki yazım arası en az 10 dk.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { api, cloudEnabled, session } from "./supabase";

interface PlayerIracing {
  custId: number;
  irating: number;
  license: string;
  licColor: string;
  country: string;
  category: string;
}

const MIN_GAP_MS = 10 * 60_000;
let sentKey = "";
let sentAt = 0;
let busy = false;
/** RPC yok (c56 uygulanmadı): bu çalıştırmada bir daha deneme */
let unsupported = false;

/** iRacing'e bağlıyken ara ara çağrılır (host/social.ts); gerekirse profili günceller */
export async function syncIracingStats() {
  if (busy || unsupported || !inTauri || !cloudEnabled) return;
  const uid = session()?.user.id;
  if (!uid) return;
  busy = true;
  try {
    const p = await invoke<PlayerIracing | null>("player_iracing");
    if (!p || !(p.irating > 0) || !p.license) return;
    const key = [uid, p.custId, p.irating, p.license, p.licColor, p.country, p.category].join("|");
    if (key === sentKey) return;
    // Değer değişti ama son yazım çok yeni: sonraki turda yeniden denenir
    if (sentAt && Date.now() - sentAt < MIN_GAP_MS && sentKey.startsWith(`${uid}|${p.custId}|`)) return;
    await api("POST", "rpc/profile_set_iracing", {
      body: {
        p_irating: p.irating,
        p_license: p.license,
        p_lic_color: p.licColor || null,
        p_country: p.country || null,
        p_cust_id: p.custId || null,
        p_category: p.category || null,
      },
    });
    sentKey = key;
    sentAt = Date.now();
  } catch (e) {
    // Eski sunucu (işlev yok) ya da eski program: sessizce bırak. Geçici hata: sonraki turda yeniden denenir.
    if (/profile_set_iracing|PGRST202|404|player_iracing/i.test(String((e as Error)?.message ?? e))) unsupported = true;
  } finally {
    busy = false;
  }
}
