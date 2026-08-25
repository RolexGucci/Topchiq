-- TOPCHIQ.UZ — 4-yangilanish: sayt statistikasi
-- Supabase -> SQL Editor -> New query ga joylashtirib "Run" bosing.
-- Xavfsiz: mavjud ma'lumotlarga tegmaydi.

-- ============================================================
-- 1) Tashriflar
-- ============================================================
-- Bir odam kuniga BIR MARTA sanaladi (primary key buni kafolatlaydi).
-- Shuning uchun sahifani 10 marta yangilasa ham raqam oshmaydi.
--
-- visitor_hash — bu shaxsni aniqlaydigan ma'lumot EMAS. U server
-- tomonida IP + brauzer + sana + maxfiy so'zdan hosil qilinadi va
-- har kuni butunlay o'zgaradi. Ya'ni kimligini bilib bo'lmaydi.

create table if not exists visits (
  visitor_hash text not null,
  day          date not null default current_date,
  created_at   timestamptz not null default now(),
  primary key (visitor_hash, day)
);

create index if not exists idx_visits_day on visits (day);

alter table visits enable row level security;

-- ============================================================
-- 2) Hozir onlayn
-- ============================================================
-- Brauzer har 30 soniyada "men shu yerdaman" deb signal yuboradi.
-- Oxirgi 75 soniyada signal bergan odamlar "onlayn" hisoblanadi.

create table if not exists presence (
  visitor_hash text primary key,
  last_seen    timestamptz not null default now()
);

create index if not exists idx_presence_last_seen on presence (last_seen);

alter table presence enable row level security;

-- ============================================================
-- 3) Tashrifni yozish
-- ============================================================

create or replace function record_visit(p_hash text)
returns void
language plpgsql
security definer
as $$
begin
  -- Bugun allaqachon kelgan bo'lsa — hech narsa qilmaydi
  insert into visits (visitor_hash, day)
  values (p_hash, current_date)
  on conflict (visitor_hash, day) do nothing;

  -- Onlayn belgisini yangilaymiz
  insert into presence (visitor_hash, last_seen)
  values (p_hash, now())
  on conflict (visitor_hash)
  do update set last_seen = now();
end;
$$;

-- ============================================================
-- 4) Footer uchun barcha raqamlar — bitta so'rovda
-- ============================================================
-- Diqqat: kliklar/loyihalar/bidlar butun bazadan hisoblanadi,
-- faqat ochilgan sahifadan emas.

create or replace function get_site_stats()
returns table (
  total_visits   bigint,
  daily_visits   bigint,
  online_now     bigint,
  total_clicks   bigint,
  total_projects bigint,
  total_bids     bigint
)
language sql
security definer
as $$
  select
    (select count(*) from visits),
    (select count(*) from visits where day = current_date),
    (select count(*) from presence where last_seen > now() - interval '2 minutes'),
    (select coalesce(sum(clicks), 0) from listings where status = 'active'),
    (select count(*) from listings where status = 'active'),
    (select coalesce(sum(total_bid), 0) from listings where status = 'active');
$$;

-- ============================================================
-- 5) Eski presence yozuvlarini tozalash
-- ============================================================
-- expire_stale_bids() funksiyasiga qo'shimcha: kunlik cron chaqiradi.

create or replace function cleanup_presence()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  with removed as (
    delete from presence
     where last_seen < now() - interval '1 hour'
    returning visitor_hash
  )
  select count(*) into v_count from removed;

  return v_count;
end;
$$;
