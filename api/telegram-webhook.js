import { supabase } from './_lib/supabase.js';

// POST /api/telegram-webhook
// Buni Telegramning o'ziga "bu yerga xabar yubor" deb bir marta ko'rsatib qo'yamiz
// (setWebhook orqali, quyida TAYYORLAGACH tushuntiraman).
//
// Hozircha faqat eng muhim narsani qiladi: kimdir botga /start bossa,
// uning Telegram ID'sini bazaga yozadi — shundan keyingina unga
// Revenge xabarnomasi yuborish mumkin bo'ladi.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const update = req.body || {};

  // /start bosilganda
  if (update.message && update.message.text === '/start') {
    const from = update.message.from;
    await supabase.from('bot_subscribers').upsert({
      telegram_user_id: from.id,
      username: from.username || null,
    });

    await sendReply(update.message.chat.id, "Xush kelibsiz! 🏆 Endi reytingdagi o'rningiz bosib o'tilsa, sizga shu yerda xabar beraman.");
  }

  // "Qaytarib olish" tugmasi bosilganda (Revenge xabaridagi tugma)
  if (update.callback_query && update.callback_query.data?.startsWith('revenge:')) {
    const listingId = update.callback_query.data.split(':')[1];
    // TODO: bu yerda foydalanuvchini to'g'ridan-to'g'ri o'sha loyihaga bid
    // qo'shish jarayoniga (Mini App ochish yoki bosqichma-bosqich savol) olib o'tamiz.
    await sendReply(
      update.callback_query.message.chat.id,
      `Qaytarib olish uchun saytga o'ting: https://topchiq.uz/loyiha/${listingId}`
    );
  }

  res.status(200).json({ ok: true });
}

async function sendReply(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
