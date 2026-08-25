import { supabase } from './_lib/supabase.js';
import { fetchProfile } from './_lib/profile.js';
import { moderateListing } from './_lib/moderation.js';
import { verifyTelegramInitData } from './_lib/verify-initdata.js';

// POST /api/create-listing
// Body: {
//   username: "@durov" | "t.me/durov"   (kanal/guruh/bot uchun)
//   amount: 500000,
//   category: "umumiy",
//   initData: "<Telegram Mini App initData>"   (ixtiyoriy)
// }
//
// Kanal, guruh, bot va shaxsiy profil — hammasi @username orqali ishlaydi.
// Ma'lumot Telegramning ochiq t.me sahifasidan olinadi.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  const { username, amount, category, initData } = req.body || {};

  const bidAmount = parseInt(amount, 10);
  if (!bidAmount || bidAmount < 5000) {
    return res.status(400).json({ error: "Minimal bid 5,000 so'm" });
  }

  // Mini App orqali kelgan bo'lsa, kimligini imzo bilan tekshiramiz.
  // Imzosiz kelgan telegram_user_id'ga ISHONMAYMIZ — aks holda har kim
  // o'zini boshqa odam deb ko'rsatib, uning nomidan profil qo'shardi.
  const tg = initData ? verifyTelegramInitData(initData) : { valid: false };
  const verifiedUserId = tg.valid ? tg.user.id : null;

  // Kanal, guruh, bot va shaxsiy profil — hammasi bir xil yo'l bilan
  // topiladi (t.me ochiq sahifasi orqali).
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username kiritilmagan' });
  }

  const found = await fetchProfile(username);
  if (!found.found) {
    return res.status(400).json({
      error: "Bu Telegram havolasi topilmadi. Havola ochiq (public) bo'lishi kerak.",
    });
  }

  const profile = { ...found, verified_via_miniapp: tg.valid };

  // Moderatsiya — ikkala oqim uchun ham
  const mod = await moderateListing(profile);
  if (mod.blocked) {
    return res.status(403).json({ error: `Rad etildi: ${mod.reason}` });
  }

  // Bazaga yozish (agar shu username avval bo'lsa, ustiga bid qo'shiladi)
  let { data: listing } = await supabase
    .from('listings')
    .select('id, status')
    .eq('username', profile.username)
    .maybeSingle();

  if (!listing) {
    const { data: newListing, error: insertErr } = await supabase
      .from('listings')
      .insert({
        username: profile.username,
        type: profile.type,
        name: profile.name,
        bio: profile.bio,
        avatar_url: profile.avatar_url || null,
        verified_via_miniapp: profile.verified_via_miniapp,
        category: category || 'umumiy',
        status: 'pending',
        total_bid: 0,
        owner_telegram_user_id: verifiedUserId,
      })
      .select('id')
      .single();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }
    listing = newListing;
  } else if (verifiedUserId) {
    // Egasi hali belgilanmagan bo'lsa va endi tasdiqlangan foydalanuvchi
    // bid qilyapti — Revenge xabarnomasi uchun bog'lab qo'yamiz
    await supabase
      .from('listings')
      .update({ owner_telegram_user_id: verifiedUserId })
      .eq('id', listing.id)
      .is('owner_telegram_user_id', null);
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

  // TODO — Checkout.uz to'lov buyurtmasi shu yerda ochiladi va foydalanuvchi
  // ularning to'lov sahifasiga yo'naltiriladi (API hujjati kelgach yoziladi).
  res.status(200).json({
    ok: true,
    bid_id: bid.id,
    listing_id: listing.id,
    username: profile.username,
    message: "Bid qabul qilindi (test rejimi — Checkout.uz hali ulanmagan)",
  });
}
