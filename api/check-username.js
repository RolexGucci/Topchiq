import { fetchTelegramChat } from './_lib/telegram.js';
import { moderateListing } from './_lib/moderation.js';
import { supabase } from './_lib/supabase.js';

// GET /api/check-username?username=durov
//
// Saytda havola yozilayotganda chaqiriladi va Telegramdan HAQIQIY nom,
// tur va tavsifni qaytaradi. Bu yerda hech narsa o'ylab topilmaydi:
// ma'lumot faqat Telegram Bot API'dan keladi, topilmasa "found: false".
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Faqat GET' });
  }

  const raw = (req.query.username || '').toString().trim();
  if (!raw) {
    return res.status(400).json({ error: 'Username kiritilmagan' });
  }

  const chat = await fetchTelegramChat(raw);
  if (!chat.found) {
    return res.status(404).json({
      found: false,
      error: "Bu Telegram havolasi topilmadi. Havola ochiq (public) bo'lishi kerak.",
    });
  }

  // Taqiqlangan so'z / scam-fake filtri — to'lovga o'tishdan oldin ogohlantiramiz
  const mod = await moderateListing(chat);
  if (mod.blocked) {
    return res.status(403).json({
      found: true,
      blocked: true,
      error: `Rad etildi: ${mod.reason}`,
    });
  }

  // Shu username allaqachon reytingda bo'lsa, hozirgi bidini ham qaytaramiz
  const { data: existing } = await supabase
    .from('listings')
    .select('total_bid, status')
    .eq('username', chat.username)
    .maybeSingle();

  res.status(200).json({
    found: true,
    username: chat.username,
    name: chat.name,
    type: chat.type,
    bio: chat.bio,
    in_rating: !!(existing && existing.status === 'active'),
    total_bid: existing && existing.status === 'active' ? existing.total_bid : 0,
  });
}
