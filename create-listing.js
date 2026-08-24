import { supabase } from './_lib/supabase.js';
import { fetchTelegramChat } from './_lib/telegram.js';
import { moderateListing } from './_lib/moderation.js';

// POST /api/create-listing
// Body: { username: "@durov" yoki "t.me/durov", amount: 500000, category: "umumiy" }
//
// Qadamlar:
//  1) Telegramdan haqiqiyligini tekshiradi (getChat)
//  2) Taqiqlangan so'z / scam-fake filtridan o'tkazadi
//  3) "pending" holatda listing + bid yozuvini bazaga qo'shadi
//  4) Checkout.uz'da to'lov buyurtmasi ochib, foydalanuvchini shu sahifaga yo'naltiradi
//
// MUHIM: 4-qadam (Checkout.uz qismi) hozircha TODO — Checkout.uz'ning aniq
// JSON-API hujjatini (kassa yaratgach ular beradigan) ko'rib, shu joyni
// birga to'ldiramiz. Hozircha bu funksiya to'lovsiz sinov uchun ishlaydi.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  const { username, amount, category, telegram_user_id } = req.body || {};
  // telegram_user_id — faqat foydalanuvchi Telegram Mini App orqali kirgan bo'lsa
  // keladi (Telegram.WebApp.initDataUnsafe.user.id). Saytdan oddiy kirilsa bo'sh
  // qoladi — bu holatda Revenge xabarnomasi shu loyiha uchun yuborilmaydi, xolos.

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: "Username kiritilmagan" });
  }
  const bidAmount = parseInt(amount, 10);
  if (!bidAmount || bidAmount < 5000) {
    return res.status(400).json({ error: "Minimal bid 5,000 so'm" });
  }

  // 1) Telegramdan tekshirish
  const chat = await fetchTelegramChat(username);
  if (!chat.found) {
    return res.status(400).json({
      error: 'Bu Telegram havolasi topilmadi. @username yoki t.me/username formatida, ochiq (public) bo\'lishi kere.',
    });
  }

  // 2) Moderatsiya
  const mod = await moderateListing(chat);
  if (mod.blocked) {
    return res.status(403).json({ error: `Rad etildi: ${mod.reason}` });
  }

  // 3) Bazaga "pending" holatda yozish (agar shu username avval bo'lsa, ustiga qo'shamiz)
  let { data: listing } = await supabase
    .from('listings')
    .select('id, status')
    .eq('username', chat.username)
    .maybeSingle();

  if (!listing) {
    const { data: newListing, error: insertErr } = await supabase
      .from('listings')
      .insert({
        username: chat.username,
        type: chat.type,
        name: chat.name,
        bio: chat.bio,
        category: category || 'umumiy',
        status: 'pending',
        total_bid: 0,
        owner_telegram_user_id: telegram_user_id || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }
    listing = newListing;
  }

  const { data: bid, error: bidErr } = await supabase
    .from('bids')
    .insert({
      listing_id: listing.id,
      amount: bidAmount,
      status: 'pending',
    })
    .select('id')
    .single();

  if (bidErr) {
    return res.status(500).json({ error: bidErr.message });
  }

  // 4) TODO — Checkout.uz to'lov buyurtmasini shu yerda ochamiz va
  //    foydalanuvchini ularning to'lov sahifasiga yo'naltiramiz.
  //    Hozircha o'rniga bid_id'ni qaytaramiz (test rejimi).
  res.status(200).json({
    ok: true,
    bid_id: bid.id,
    listing_id: listing.id,
    message: "Bid qabul qilindi (test rejimi — Checkout.uz hali ulanmagan)",
  });
}
