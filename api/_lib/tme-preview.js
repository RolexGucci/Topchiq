// Telegramning ochiq "t.me/username" sahifasidan ma'lumot oladi.
//
// NEGA BU KERAK:
// Bot API (getChat) shaxsiy profillarni bermaydi — faqat kanal/guruh/bot.
// Lekin har bir t.me sahifasi ochiq veb-sahifa bo'lib, uning ichida nom,
// bio va profil rasmi "og:" meta teglarida turadi (aynan shuning uchun
// Telegram havolasini biror joyga tashlaganda chiroyli preview chiqadi).
// Shu yo'l bilan SHAXSIY PROFILLAR ham topiladi.
//
// Rasm havolasi Telegramning ochiq CDN'idan keladi — bot token kere emas,
// brauzer uni to'g'ridan-to'g'ri ko'rsataveradi.

function pickMeta(html, prop) {
  // <meta property="og:title" content="..."> — tartib teskari ham bo'lishi mumkin
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return '';
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function cleanUsername(input) {
  return String(input || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^telegram\.me\//i, '')
    .split('/')[0]
    .split('?')[0]
    .trim();
}

export async function fetchTmePreview(input) {
  const username = cleanUsername(input);
  if (!username || !/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    return { found: false };
  }

  let html;
  try {
    const res = await fetch(`https://t.me/${username}`, {
      headers: {
        // Oddiy brauzer sifatida so'raymiz, aks holda soddalashtirilgan
        // sahifa qaytishi mumkin
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) return { found: false };
    html = await res.text();
  } catch {
    return { found: false };
  }

  const title = pickMeta(html, 'og:title');
  const description = pickMeta(html, 'og:description');
  const image = pickMeta(html, 'og:image');

  // "Bo'sh" sahifani aniqlash: mavjud bo'lmagan username uchun Telegram
  // baribir sahifa qaytaradi, lekin unda rasm bo'lmaydi va sarlavha
  // shunchaki username'ning o'zi bo'ladi.
  const titleIsJustUsername =
    !title ||
    title.toLowerCase() === username.toLowerCase() ||
    title.toLowerCase() === `@${username}`.toLowerCase();

  if (!image && titleIsJustUsername) {
    return { found: false };
  }

  // Turini aniqlash: kanalda "subscribers", guruhda "members" yoziladi
  let type = 'user';
  const extra = (html.match(/tgme_page_extra["'][^>]*>([^<]*)</i) || [])[1] || '';
  const lower = extra.toLowerCase();
  if (/subscriber/.test(lower)) type = 'kanal';
  else if (/member/.test(lower)) type = 'guruh';
  else if (/^bot$|bot$/i.test(username) && /bot/i.test(html)) type = 'bot';

  // Obunachilar sonini ham olamiz (bo'lsa)
  const subs = extra.trim() || null;

  return {
    found: true,
    username,
    type,
    name: title || username,
    bio: description || '',
    avatar_url: image || null,
    subs,
  };
}
