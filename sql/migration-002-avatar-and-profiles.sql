-- TOPCHIQ.UZ — 2-yangilanish
-- Supabase -> SQL Editor -> New query ga joylashtirib "Run" bosing.
-- Xavfsiz: mavjud ma'lumotlarga tegmaydi, faqat yangi ustunlar qo'shadi.

-- 1) Obunachilar soni (t.me sahifasidan olinadi, masalan "12.4K subscribers")
alter table listings
  add column if not exists subs text;

-- 2) Shu yozuv Telegram Mini App orqali tasdiqlangan holda qo'shilganmi
alter table listings
  add column if not exists verified_via_miniapp boolean not null default false;

-- 3) Botga /start bosganlar haqida qo'shimcha ma'lumot
alter table bot_subscribers
  add column if not exists first_name text;

-- Eslatma: avatar_url ustuni asosiy schema.sql'da allaqachon bor.
-- Rasm Telegramning ochiq CDN havolasi sifatida saqlanadi — bot token
-- kere emas, brauzer uni to'g'ridan-to'g'ri ko'rsataveradi.
