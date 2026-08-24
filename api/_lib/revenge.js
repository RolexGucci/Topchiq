import { supabase } from './supabase.js';
import { sendTelegramMessage } from './telegram-notify.js';

// Bir loyihaning bidi oshgach chaqiriladi. Avvalgi va yangi total_bid orasida
// turgan (ya'ni endi shu loyihadan "bosib o'tilgan") boshqa loyihalarni topib,
// agar ularning egasi botga /start bosgan bo'lsa — ogohlantirish yuboradi.
export async function notifyOvertakenListings({ listingId, listingName, listingUsername, oldTotal, newTotal }) {
  if (newTotal <= oldTotal) return;

  const { data: overtaken, error } = await supabase
    .from('listings')
    .select('id, username, total_bid, owner_telegram_user_id')
    .eq('status', 'active')
    .neq('id', listingId)
    .gt('total_bid', oldTotal)
    .lte('total_bid', newTotal);

  if (error || !overtaken || overtaken.length === 0) return;

  for (const victim of overtaken) {
    if (!victim.owner_telegram_user_id) continue; // botga /start bosmagan — o'tkazib yuboramiz

    const needed = newTotal - victim.total_bid + 1;

    await sendTelegramMessage(
      victim.owner_telegram_user_id,
      `⚠️ <b>@${victim.username}</b> reytingdagi o'rningizni <b>@${listingUsername}</b> egalladi.\n\n` +
        `Qaytarib olish uchun kamida <b>${needed.toLocaleString('uz-UZ')} so'm</b> bid kere.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔥 Qaytarib olish', callback_data: `revenge:${victim.id}` }]],
        },
      }
    );
  }
}
