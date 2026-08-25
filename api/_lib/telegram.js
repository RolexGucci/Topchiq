// Telegram Bot API orqali kiritilgan @username haqiqatan mavjudligini,
// turi (kanal/guruh/bot/odam) va nomi/bio'sini tekshiradi.
//
// TELEGRAM_BOT_TOKEN — Vercel environment variable sifatida qo'shiladi.
// Botni @BotFather orqali yaratganingizda bergan tokenni shu yerga qo'yasiz.

export async function fetchTelegramChat(username) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const clean = username.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  const url = `https://api.telegram.org/bot${token}/getChat?chat_id=@${clean}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) {
    // Bot topa olmadi -> username mavjud emas, yopiq, yoki noto'g'ri
    return { found: false };
  }

  const chat = data.result;
  let type = 'user';
  if (chat.type === 'channel') type = 'kanal';
  else if (chat.type === 'group' || chat.type === 'supergroup') type = 'guruh';
  else if (chat.is_bot) type = 'bot';

  const avatar_file_id = chat.photo ? chat.photo.big_file_id : null;

  return {
    found: true,
    username: clean,
    type,
    name: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.trim(),
    bio: chat.description || chat.bio || '',
    avatar_file_id,
    is_scam: !!chat.is_scam,
    is_fake: !!chat.is_fake,
  };
}

// Telegram rasmni to'g'ridan-to'g'ri havola qilib bermaydi — avval file_id'ni
// getFile orqali yo'lga (file_path) aylantirish, keyin to'liq URL yig'ish kere.
// Eslatma: bu URL ichida bot token bo'ladi, shuning uchun uni tashqariga
// bermaymiz — rasmni /api/avatar orqali uzatamiz.
export async function resolveFileUrl(fileId) {
  if (!fileId) return null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  } catch {
    return null;
  }
}
