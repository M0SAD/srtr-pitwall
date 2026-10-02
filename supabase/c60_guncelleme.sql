-- ---------------------------------------------------------------------------
-- c60: "Overlay'e özel görünüm" PRO özelliği kataloğu (Yönetim › PRO özellikleri).
--      Her overlay kopyasının ayarlarının sonunda "Görünüm (bu overlay)" bölümü var: o kopya için genel temanın
--      üstüne renk, biçim, yazı ve yoğunluk (programda src/sdk/look.ts, instance.look).
--      Her zaman açık (ücretsiz) seçenekler: arka plan rengi + opaklığı, yazı rengi, vurgu rengi, köşe yuvarlaklığı,
--      yazı boyutu. Kalan seçenekler (ikincil yazı / olumlu / olumsuz / kenarlık / satır zemini renkleri, kenarlık
--      kalınlığı, iç boşluk, gölge, cam bulanıklığı, başlık çubuğu, yazı fontu, kalınlık, harf aralığı, büyük harf,
--      sabit genişlikli rakamlar, satır yoğunluğu, hazır görünümler) tek anahtara bağlı:
--        appearance.overlay_look   — varsayılan: PRO
--      Sunucuda tablo / RPC denetimi yok: görünüm ayarı kullanıcının kendi ayar dosyasında durur; karar pro_features
--      tablosunda tutulur, program pro_features_map() ile okur (c38/c40/c57 ile aynı düzen). Bu dosya yalnızca kataloğu
--      (ad, grup, varsayılan) önceden yazar. Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
-- Sıra: c38'den sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('appearance.overlay_look', 'Overlay''e özel görünüm: gelişmiş seçenekler (yazı tipi, kenarlık, gölge, yoğunluk, hazır görünümler)', 'Görünüm', false, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();


-- ---------------------------------------------------------------------------
-- c60 (ek): Ekip Pitwall'ı — sürücünün konuşma altyazısı (PRO).
--      Sürücünün uygulaması, Konuşma → yazı (livechat.stt, PRO) açıkken tanınan son cümleleri pitwall verisine
--      `speech: [{t, text, final}]` olarak ekler (src/host/crew.ts; son 60 sn, en çok 6 satır / 400 karakter;
--      sürücü Ayarlar › Paylaşım › Ekip'teki "Konuşmalarımı (altyazı) ekibimle paylaş" anahtarıyla kapatabilir).
--      Ekip üyesi bunu mesaj yazdığı yerde altyazı olarak görür (uygulama: CrewWall.tsx, site: crewpanel.js).
--      PRO denetimi SUNUCUDA: crew_wall(p_owner), social.crew özelliği PRO'ya özelken (varsayılan) izleyen PRO
--      değilse `speech` alanını veriden çıkarır ve yanıta speech_locked:true ekler (istemci PRO notu gösterir).
--      Yönetici social.crew'u herkese açarsa altyazı da herkese açılır. Gerisi c58'deki tanımın aynısıdır.
--      crew_wall_push() değişmedi (içeriğe bakmaz; 24 KB sınırı aynı).
-- Sıra: c58 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------
create or replace function public.crew_wall(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.crew_members%rowtype;
  w public.crew_wall%rowtype;
  v_locked boolean;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  select * into c from public.crew_members where owner = p_owner and member = auth.uid();
  if not found or not public.crew_role(p_owner, auth.uid(), false) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  if c.seen_at is null or c.seen_at < now() - interval '10 seconds' then
    update public.crew_members set seen_at = now() where owner = p_owner and member = auth.uid();
  end if;
  if not coalesce((select wall_on from public.crew_prefs where user_id = p_owner), true) then
    return jsonb_build_object('on', false, 'age_ms', null, 'data', null);
  end if;
  -- Konuşma altyazısı: özellik PRO'ya özelken yalnızca PRO izleyiciye
  v_locked := public.feature_requires_pro('social.crew', true) and not coalesce(public.user_is_pro(auth.uid()), false);
  select * into w from public.crew_wall where owner = p_owner;
  if not found or w.updated_at < now() - interval '15 seconds' then
    return jsonb_build_object('on', true, 'age_ms', null, 'data', null, 'speech_locked', v_locked);
  end if;
  return jsonb_build_object('on', true,
    'age_ms', (extract(epoch from clock_timestamp() - w.updated_at) * 1000)::int,
    'data', case when v_locked then w.data - 'speech' else w.data end,
    'speech_locked', v_locked);
end $$;
revoke all on function public.crew_wall(uuid) from public, anon;
grant execute on function public.crew_wall(uuid) to authenticated;

notify pgrst, 'reload schema';
