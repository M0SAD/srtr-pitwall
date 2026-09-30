# PRO üyelik (Patreon / Ko-fi)

PRO üyelik aylık ya da yıllık abonelikle çalışır. Ödemeyi Patreon ya da Ko-fi alır; her ödemede bir bildirim
(webhook) Supabase'deki `pro-webhook` fonksiyonuna gelir ve ödeyen e-postanın SRTR Pitwall hesabına PRO süresi
eklenir. Hesap e-postası farklıysa kullanıcı **Hesap → PRO üyelik → Ödeme e-postası** alanına Patreon/Ko-fi
e-postasını yazar. Henüz hesabı olmayan biri öderse kayıt olduğunda PRO kendiliğinden açılır.

Önce [SUPABASE.md](SUPABASE.md) adımlarını bitir.

## 1. Fonksiyonu yükle (tarayıcıdan, komut satırı gerekmez)

1. Supabase panelinde **Edge Functions → Deploy a new function → Via Editor**.
2. Ad: `pro-webhook`.
3. Editördeki örnek kodu sil, `supabase/functions/pro-webhook/index.ts` dosyasının içeriğini yapıştır →
   **Deploy function**.
4. Fonksiyonun **Details** (ayarlar) sayfasında **Enforce JWT Verification / Verify JWT** seçeneğini **kapat**.
   Patreon ve Ko-fi Supabase anahtarı göndermez; güvenliği fonksiyonun kendisi imza/token ile sağlar.
5. Fonksiyon adresi: `https://<proje>.supabase.co/functions/v1/pro-webhook`

(Supabase CLI kullanıyorsan: `supabase functions deploy pro-webhook --no-verify-jwt`)

## 2a. Patreon

1. Patreon'da yaratıcı sayfanda üyelik kademesi oluştur (ör. **SRTR Pitwall PRO**). Yıllık ödeme için Patreon'un
   *annual billing* seçeneğini aç; ikisi de aynı kademede olabilir.
2. https://www.patreon.com/portal/registration/register-webhooks adresinde (Patreon → Creator settings →
   Developers → Webhooks) yeni webhook ekle:
   - URL: `https://<proje>.supabase.co/functions/v1/pro-webhook?source=patreon`
   - Olaylar (triggers): `members:pledge:create`, `members:pledge:update`, `members:update`, `members:create`
3. Webhook'un **secret** değerini kopyala. Supabase → **Edge Functions → Secrets** (ya da Project Settings →
   Edge Functions) bölümüne `PATREON_WEBHOOK_SECRET` adıyla ekle.
4. PRO süresi, Patreon'un bildirdiği bir sonraki ödeme tarihine (+3 gün) kadar verilir; her ödemede uzar.
   İptal eden kişinin PRO'su ödediği dönemin sonuna kadar sürer.

## 2b. Ko-fi

1. Ko-fi'de **Memberships** bölümünde üyelik kademeleri oluştur. Yıllık kademenin adında **"Yıllık"**
   (ya da "Yearly/Annual") geçsin, ör. *PRO Aylık* ve *PRO Yıllık*. Fonksiyon kademe adından süreyi anlar
   (aylık: 31 gün, yıllık: 365 gün, +3 gün ek süre).
2. Ko-fi → **Settings → API** (More → API): Webhook URL'e
   `https://<proje>.supabase.co/functions/v1/pro-webhook?source=kofi` yaz → Update.
3. Aynı sayfadaki **Verification Token**'ı kopyala, Supabase Secrets'a `KOFI_VERIFICATION_TOKEN` adıyla ekle.
4. Ko-fi'deki **Send Test** ile deneyebilirsin (test bildirimi üyelik olmadığı için sadece "ignored" döner).

## 3. Uygulamada göster

Uygulamada yönetici hesabınla **Hesap → Yönetici → Abonelik sayfası** bölümüne Patreon/Ko-fi bağlantılarını ve
fiyat metinlerini (ör. "3 € / ay", "30 € / yıl") yaz. PRO olmayan kullanıcılar Hesap sayfasında bu bilgileri ve
abone ol düğmelerini görür.

## Elle PRO verme

**Hesap → Yönetici → Kullanıcılar**: ad, e-posta ya da iRacing adıyla ara; 1 ay, 1 yıl ya da süresiz PRO ver,
gerekirse kaldır. (Hediye, çekiliş, destekçi vb. için.)

## Hangi overlay'ler PRO?

**Hesap → Yönetici → PRO overlay'ler** listesinden işaretle. Değişiklik kullanıcılara en geç 6 saat içinde
(ya da uygulamayı yeniden açtıklarında) yansır. PRO olmayan kullanıcıda bu overlay'ler panelde **PRO**
rozetiyle kilitli görünür ve ekranda gösterilmez. Topluluktan indirilen düzenlerde de kilitli kalır.

## Güvenlik notu

Kilit uygulamanın içindedir; bu yüzden kaynak kodu gizli (private) GitHub deposunda tut. `service_role`
anahtarı sadece Supabase'in kendi fonksiyon ortamında kullanılır, uygulamaya konmaz.

## Sorun giderme

- **Ödeme yaptım ama PRO gelmedi:** Supabase → Edge Functions → pro-webhook → **Logs**. "pending" dönmüşse o
  e-postayla hesap yok: kullanıcı ya o e-postayla kayıt olmalı ya da Hesap sayfasında "Ödeme e-postası"na
  yazmalı, sonra **Üyeliği yeniden denetle**. (Sonraki ödemede otomatik eşleşir; hemen istiyorsa yönetici elle
  verebilir.)
- **401 imza hatalı / token hatalı:** Secrets'taki değer Patreon/Ko-fi'dekiyle aynı değil.
