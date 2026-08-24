-- TOPCHIQ.UZ — Supabase jadval sxemasi
-- Buni Supabase loyihangizda: "SQL Editor" -> "New query" ga joylashtirib "Run" bosing.

-- Har bir Telegram kanal/guruh/bot/profil yozuvi
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  username text not null,              -- @username (@ belgisisiz, kichik harf)
  type text not null default 'kanal',  -- 'kanal' | 'guruh' | 'bot' | 'user'
  name text,                           -- Telegramdan olingan ko'rinadigan nom
  bio text,                            -- Telegramdan olingan tavsif
  avatar_url text,                     -- Telegram profil rasmi (bo'lsa)
  category text not null default 'umumiy',  -- 'ai' | 'startup' | 'sayohat' | 'savdo' | 'umumiy' ...
  total_bid bigint not null default 0,      -- jami to'langan summa (so'm), reyting shu bo'yicha
  clicks bigint not null default 0,         -- "Tashrif buyurish" bosilgan soni
  status text not null default 'pending',   -- 'pending' (tekshiruvda) | 'active' (reytingda) | 'rejected' (rad etilgan)
  reject_reason text,                       -- rad etilgan bo'lsa sababi
  created_at timestamptz not null default now(),
  unique (username)
);

create index if not exists idx_listings_ranking
  on listings (total_bid desc)
  where status = 'active';

create index if not exists idx_listings_category
  on listings (category, total_bid desc)
  where status = 'active';

-- Har bir to'lov / bid urinishi (Checkout.uz bilan bog'liq)
create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  amount bigint not null,                    -- so'mda
  checkout_order_id text unique,             -- Checkout.uz tomonidan beriladigan buyurtma raqami
  status text not null default 'pending',    -- 'pending' | 'paid' | 'failed'
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_bids_listing on bids (listing_id);
create index if not exists idx_bids_checkout_order on bids (checkout_order_id);

-- Taqiqlangan so'zlar ro'yxati (nom/username/bio shu so'zlarni o'z ichiga olsa avtomatik rad etiladi)
create table if not exists banned_words (
  id serial primary key,
  word text not null unique
);

insert into banned_words (word) values
  ('porn'), ('porno'), ('p0rn'), ('pr0n'),
  ('sex'), ('s3x'), ('секс'), ('порно'),
  ('terror'), ('terrorist'), ('террор'), ('терорист'),
  ('extrem'), ('экстрем')
on conflict (word) do nothing;

-- Botga /start bosgan foydalanuvchilar (faqat shularga Telegramdan xabar yuborish mumkin)
create table if not exists bot_subscribers (
  telegram_user_id bigint primary key,
  username text,
  started_at timestamptz not null default now()
);

-- Har bir listing'ni kim qo'shgani (agar bot/mini-app orqali qo'shilgan bo'lsa,
-- va shu odam botga /start bosgan bo'lsa) — Revenge xabarnomasini shunga yuboramiz.
-- Sayt orqali anonim qo'shilsa, bu bo'sh qoladi va Revenge xabari yuborilmaydi.
alter table listings
  add column if not exists owner_telegram_user_id bigint references bot_subscribers(telegram_user_id);

-- Kategoriyalar ro'yxati (frontendda tab sifatida ko'rsatish uchun)
create table if not exists categories (
  slug text primary key,
  name_uz text not null,
  sort_order int not null default 0
);

insert into categories (slug, name_uz, sort_order) values
  ('umumiy',  'Umumiy',       0),
  ('ai',      'AI',           1),
  ('startup', 'Startup',      2),
  ('sayohat', 'Sayohat',      3),
  ('savdo',   'Savdo-sotiq',  4)
on conflict (slug) do nothing;

-- Nechta marta to'langan bid qilingani (interfeysdagi "N boost" raqami).
-- Har bir tasdiqlangan to'lovda checkout-webhook buni 1 taga oshiradi.
alter table listings
  add column if not exists boost_count int not null default 0;

-- Xavfsizlik: Row Level Security yoqiladi, hech qanday "policy" qo'shilmaydi.
-- Natija: tashqaridan (Supabase'ning ochiq/anon API'si orqali) hech kim to'g'ridan-to'g'ri
-- o'qiy/yoza olmaydi. Bizning Vercel backend'imiz esa "service_role" kaliti bilan
-- ishlagani uchun RLS'ga qaramay ishlayveradi (service_role RLS'ni chetlab o'tadi).
alter table listings enable row level security;
alter table bids enable row level security;
alter table banned_words enable row level security;
alter table categories enable row level security;
alter table bot_subscribers enable row level security;
