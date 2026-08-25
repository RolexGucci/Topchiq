import { supabase } from './_lib/supabase.js';

const SITE_URL = process.env.SITE_URL || 'https://topchiq.vercel.app';

// POST /api/telegram-webhook
//
// Telegram botga kelgan hamma narsa shu yerga tushadi.
// Botni shu manzilga ulash uchun bir marta quyidagini brauzerda oching
// (TOKEN o'rniga o'z tokeningizni qo'ying):
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://topchiq.vercel.app/api/telegram-webhook
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const update = req.body || {};

  try {
    if (update.message?.text) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (e) {
    console.error('telegram-webhook xatosi:', e);
  }

  // Telegramga doim 200 qaytaramiz — aks holda u xabarni qayta-qayta yuboraveradi
  res.status(200).json({ ok: true });
}

async function handleMessage(message) {
  const text = message.text.trim();
  const from = message.from;
  const chatId = message.chat.id;

  if (text === '/start') {
    // Botga /start bosgan odamni yozib qo'yamiz — Revenge xabarnomasi
    // faqat shu ro'yxatdagilarga yuborilishi mumkin (Telegram cheklovi).
    await supabase.from('bot_subscribers').upsert({
      telegram_user_id: from.id,
      username: from.username || null,
      first_name: from.first_name || null,
    });

    await send(chatId, {
      text:
        `<b>Topchiq.uz</b> — Cho'qqiga chiq, ko'rin! 🏆\n\n` +
        `Telegram kanal, guruh, bot va profillar uchun pullik reyting.\n\n` +
        `Ko'proq bid — yuqoriroq o'rin — ko'proq ko'rinish.\n\n` +
        `Boshlash uchun pastdagi tugmani bosing 👇`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Topchiq.uz ochish', web_app: { url: SITE_URL } }],
          [{ text: '📊 Reytingni ko\'rish', callback_data: 'top' }],
        ],
      },
    });
    return;
  }

  if (text === '/top') {
    await sendTop(chatId);
    return;
  }

  if (text === '/help') {
    await send(chatId, {
      text:
        `<b>Buyruqlar</b>\n\n` +
        `/start — boshlash\n` +
        `/top — reyting ko'rish\n\n` +
        `Havola qo'shish va bid qilish uchun Mini App'ni oching.`,
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Topchiq.uz ochish', web_app: { url: SITE_URL } }]],
      },
    });
    return;
  }

  // Boshqa har qanday matn
  await send(chatId, {
    text: "Tushunmadim. Boshlash uchun Mini App'ni oching yoki /help yozing.",
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Topchiq.uz ochish', web_app: { url: SITE_URL } }]],
    },
  });
}

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;

  if (cb.data === 'top') {
    await sendTop(chatId);
  } else if (cb.data?.startsWith('revenge:')) {
    // Revenge xabaridagi "Qaytarib olish" tugmasi
    await send(chatId, {
      text: "O'rningizni qaytarib olish uchun Mini App'ni oching 👇",
      reply_markup: {
        inline_keyboard: [[{ text: '🔥 Qaytarib olish', web_app: { url: SITE_URL } }]],
      },
    });
  }

  // Tugma "yuklanmoqda" holatida qotib qolmasligi uchun
  await answerCallback(cb.id);
}

async function sendTop(chatId) {
  const { data: top } = await supabase
    .from('listings')
    .select('username, name, total_bid')
    .eq('status', 'active')
    .order('total_bid', { ascending: false })
    .limit(10);

  if (!top || top.length === 0) {
    await send(chatId, {
      text: "Reyting hozircha bo'sh. Birinchi bo'lib cho'qqini egallang! 🏆",
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Topchiq.uz ochish', web_app: { url: SITE_URL } }]],
      },
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((x, i) => {
    const rank = medals[i] || `${i + 1}.`;
    const bid = Number(x.total_bid).toLocaleString('uz-UZ');
    return `${rank} <b>${escapeHtml(x.name || x.username)}</b> — ${bid} so'm`;
  });

  await send(chatId, {
    text: `<b>🏆 TOP 10</b>\n\n${lines.join('\n')}`,
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 To\'liq reyting', web_app: { url: SITE_URL } }]],
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function send(chatId, { text, reply_markup }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup }),
  });
}

async function answerCallback(callbackQueryId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}
