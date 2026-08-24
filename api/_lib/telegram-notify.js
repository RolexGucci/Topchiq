// Telegramda foydalanuvchiga xabar yuborish (faqat u botga /start bosgan bo'lsa ishlaydi).
export async function sendTelegramMessage(chatId, text, extra = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...extra,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    // Odatda sabab: bu odam botga hali /start bosmagan.
    // Xatoni yuqoriga otmaymiz — bitta xabar yetib bormasa ham,
    // butun to'lov jarayoni to'xtab qolmasligi kere.
    console.error('Telegram sendMessage xatosi:', data.description);
  }
  return data;
}
