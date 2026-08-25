import { supabase } from './_lib/supabase.js';

const SITE_URL = process.env.SITE_URL || 'https://topchiq.vercel.app';

// Admin buyruqlari faqat shu Telegram ID'lar uchun ishlaydi.
// Vercel -> Environment Variables -> ADMIN_TELEGRAM_ID
// Bir nechta admin bo'lsa vergul bilan ajrating: "12345,67890"
//
// O'z ID'ingizni bilish uchun: botga /myid yozing.
function isAdmin(userId) {
  const raw = process.env.ADMIN_TELEGRAM_ID || '';
  if (!raw.trim()) return false;
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(String(userId));
}

// "@Kanal", "t.me/Kanal", "Kanal" -> "Kanal"
function cleanUsername(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?\s]/)[0];
}

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

  // /myid — o'z Telegram ID'ini bilish. Hamma uchun ochiq,
  // chunki bu maxfiy ma'lumot emas va admin sozlashda kerak bo'ladi.
  if (text === '/myid') {
    await send(chatId, { text: `Sizning Telegram ID: <code>${from.id}</code>` });
    return;
  }

  // ---------- ADMIN BUYRUQLARI ----------
  // Admin bo'lmagan odam bu buyruqlarni yozsa, oddiy "tushunmadim"
  // javobini oladi — admin buyruqlari borligini ham bilmaydi.
  if (isAdmin(from.id)) {
    if (text === '/admin') {
      await sendAdminHelp(chatId);
      return;
    }
    if (text.startsWith('/hide ')) {
      await adminSetStatus(chatId, text.slice(6), 'rejected');
      return;
    }
    if (text.startsWith('/show ')) {
      await adminSetStatus(chatId, text.slice(6), 'active');
      return;
    }
    if (text.startsWith('/info ')) {
      await adminInfo(chatId, text.slice(6));
      return;
    }
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

// ============================================================
// ADMIN BUYRUQLARI
// ============================================================

async function sendAdminHelp(chatId) {
  const { count: activeCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const { count: hiddenCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'rejected');

  await send(chatId, {
    text:
      `<b>⚙️ Admin panel</b>\n\n` +
      `Reytingda: <b>${activeCount || 0}</b> ta\n` +
      `Yashirilgan: <b>${hiddenCount || 0}</b> ta\n\n` +
      `<b>Buyruqlar</b>\n` +
      `<code>/hide @nom sabab</code> — reytingdan yashirish\n` +
      `<code>/show @nom</code> — qaytarish\n` +
      `<code>/info @nom</code> — ma'lumot ko'rish\n\n` +
      `Sabab yozish ixtiyoriy, lekin keyin nima uchun yashirganingizni ` +
      `eslash uchun foydali.`,
  });
}

// /hide va /show ikkalasi uchun umumiy mantiq
async function adminSetStatus(chatId, rest, newStatus) {
  const parts = String(rest).trim().split(/\s+/);
  const username = cleanUsername(parts[0]);
  const reason = parts.slice(1).join(' ').trim() || null;

  if (!username) {
    await send(chatId, { text: "Username ko'rsatilmagan. Masalan: <code>/hide @kanal spam</code>" });
    return;
  }

  // ilike — katta-kichik harf farqlanmaydi.
  // Foydalanuvchi "@madesybot" yozsa ham "Madesybot" topiladi.
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, username, name, status, total_bid')
    .ilike('username', username)
    .maybeSingle();

  if (error) {
    await send(chatId, { text: `Baza xatosi: ${escapeHtml(error.message)}` });
    return;
  }

  if (!listing) {
    await send(chatId, { text: `❌ <b>@${escapeHtml(username)}</b> topilmadi.` });
    return;
  }

  if (listing.status === newStatus) {
    const holat = newStatus === 'active' ? 'reytingda' : 'yashirilgan';
    await send(chatId, {
      text: `ℹ️ <b>@${escapeHtml(listing.username)}</b> allaqachon ${holat}.`,
    });
    return;
  }

  const patch = { status: newStatus };
  // Yashirganda sababni yozamiz, qaytarganda tozalaymiz
  patch.reject_reason = newStatus === 'rejected' ? reason : null;

  const { error: upErr } = await supabase
    .from('listings')
    .update(patch)
    .eq('id', listing.id);

  if (upErr) {
    await send(chatId, { text: `Saqlab bo'lmadi: ${escapeHtml(upErr.message)}` });
    return;
  }

  const bid = Number(listing.total_bid).toLocaleString('uz-UZ');

  if (newStatus === 'rejected') {
    await send(chatId, {
      text:
        `🚫 <b>@${escapeHtml(listing.username)}</b> reytingdan yashirildi.\n\n` +
        `Bid saqlanib qoldi: ${bid} so'm\n` +
        (reason ? `Sabab: ${escapeHtml(reason)}\n` : '') +
        `\nQaytarish: <code>/show @${escapeHtml(listing.username)}</code>`,
    });
  } else {
    await send(chatId, {
      text:
        `✅ <b>@${escapeHtml(listing.username)}</b> reytingga qaytarildi.\n\n` +
        `Bid: ${bid} so'm`,
    });
  }
}

async function adminInfo(chatId, rest) {
  const username = cleanUsername(rest);

  if (!username) {
    await send(chatId, { text: "Masalan: <code>/info @kanal</code>" });
    return;
  }

  const { data: l } = await supabase
    .from('listings')
    .select('id, username, name, status, total_bid, clicks, category, created_at, reject_reason')
    .ilike('username', username)
    .maybeSingle();

  if (!l) {
    await send(chatId, { text: `❌ <b>@${escapeHtml(username)}</b> topilmadi.` });
    return;
  }

  // Nechta to'lov bo'lgan
  const { count: paidCount } = await supabase
    .from('bids')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', l.id)
    .eq('status', 'paid');

  // Hozirgi o'rni
  let rank = '—';
  if (l.status === 'active') {
    const { count: above } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('total_bid', l.total_bid);
    rank = `#${(above || 0) + 1}`;
  }

  const holat =
    l.status === 'active' ? '✅ reytingda'
    : l.status === 'rejected' ? '🚫 yashirilgan'
    : '⏳ to\'lov kutilmoqda';

  await send(chatId, {
    text:
      `<b>${escapeHtml(l.name || l.username)}</b>\n` +
      `@${escapeHtml(l.username)}\n\n` +
      `Holat: ${holat}\n` +
      `O'rin: ${rank}\n` +
      `Jami bid: ${Number(l.total_bid).toLocaleString('uz-UZ')} so'm\n` +
      `To'lovlar: ${paidCount || 0} ta\n` +
      `Kliklar: ${l.clicks || 0}\n` +
      `Kategoriya: ${escapeHtml(l.category || 'umumiy')}\n` +
      (l.reject_reason ? `Sabab: ${escapeHtml(l.reject_reason)}\n` : '') +
      `Qo'shilgan: ${new Date(l.created_at).toLocaleDateString('uz-UZ')}`,
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
