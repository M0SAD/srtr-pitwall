-- ---------------------------------------------------------------------------
-- c51: Üst çubuktaki sim seçici: oyun ikonları / yazılı görünüm anahtarı.
--      app_config.sim_icons (boolean, varsayılan true): açıkken programın üst çubuğundaki sim seçicide oyunların
--      ikonları görünür; kapalıyken herkes eski yazılı görünümü (iRacing, ACC, AC, LMU, AMS2) görür.
--      Herkes okur (app_config zaten herkese açık); yönetici Yönetim › Görünürlük'ten
--      admin_set_sim_icons(boolean) ile değiştirir (moderasyon kaydına 'sim_icons_set' olarak düşer).
-- Sıra: herhangi bir zamanda (log_mod, is_admin hazır olmalı). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists sim_icons boolean not null default true;

create or replace function public.admin_set_sim_icons(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  before boolean;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_on is null then
    raise exception 'Geçersiz veri';
  end if;
  select sim_icons into before from public.app_config where id = 1;
  update public.app_config set sim_icons = p_on, updated_at = now() where id = 1;
  if before is distinct from p_on then
    perform public.log_mod('sim_icons_set', 'config', 'sim_icons', null,
      jsonb_build_object('on', p_on, 'old', coalesce(before, true)));
  end if;
end $$;
revoke all on function public.admin_set_sim_icons(boolean) from public, anon;
grant execute on function public.admin_set_sim_icons(boolean) to authenticated;
