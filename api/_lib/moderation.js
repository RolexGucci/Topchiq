import { supabase } from './supabase.js';

// Oddiy "aylanib o'tish" hiylalarini ham ushlaydigan normalizatsiya:
// harflarni kichik qiladi, ko'p ishlatiladigan raqam<->harf almashtirishlarni
// asl harfga qaytaradi, va harflar orasidagi belgilarni ("p.o.r.n", "p_o_r_n")
// olib tashlaydi.
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/[^a-zа-я0-9]/gi, '');
}

export async function moderateListing({ username, name, bio, is_scam, is_fake }) {
  if (is_scam || is_fake) {
    return { blocked: true, reason: 'Telegram tomonidan scam/fake deb belgilangan' };
  }

  const { data: banned } = await supabase.from('banned_words').select('word');
  const words = (banned || []).map((w) => w.word.toLowerCase());

  const haystack = normalize(`${username} ${name} ${bio}`);

  for (const w of words) {
    if (haystack.includes(normalize(w))) {
      return { blocked: true, reason: `Taqiqlangan so'z topildi: "${w}"` };
    }
  }

  return { blocked: false };
}
