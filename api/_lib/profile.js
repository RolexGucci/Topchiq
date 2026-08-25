import { fetchTmePreview } from './tme-preview.js';
import { fetchTelegramChat } from './telegram.js';

// Telegram havolasi haqida to'liq ma'lumot yig'adi.
//
// IKKI MANBANI BIRLASHTIRADI:
//  1) t.me ochiq sahifasi — ASOSIY manba. Nom, bio, profil rasmi.
//     Shaxsiy profillar uchun ham ishlaydi.
//  2) Bot API (getChat) — QO'SHIMCHA. Faqat kanal/guruh/bot uchun ishlaydi,
//     lekin Telegramning "scam"/"fake" ogohlantirishini beradi — bu
//     moderatsiya uchun qimmatli.
export async function fetchProfile(input) {
  const preview = await fetchTmePreview(input);

  if (!preview.found) {
    return { found: false };
  }

  // Bot API'dan scam/fake belgisini olishga urinamiz. Ishlamasa (shaxsiy
  // profil bo'lsa yoki token yo'q bo'lsa) — muammo emas, davom etamiz.
  let flags = { is_scam: false, is_fake: false };
  let botType = null;
  try {
    const chat = await fetchTelegramChat(preview.username);
    if (chat.found) {
      flags = { is_scam: chat.is_scam, is_fake: chat.is_fake };
      botType = chat.type;
    }
  } catch {
    // e'tiborsiz qoldiramiz
  }

  return {
    found: true,
    username: preview.username,
    // Bot API turni aniqroq biladi (kanal/guruh/bot), shuning uchun
    // u bergan bo'lsa o'shanga ishonamiz
    type: botType || preview.type,
    name: preview.name,
    bio: preview.bio,
    avatar_url: preview.avatar_url,
    subs: preview.subs,
    is_scam: flags.is_scam,
    is_fake: flags.is_fake,
  };
}
