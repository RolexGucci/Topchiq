import { createClient } from '@supabase/supabase-js';

// Bu ikkala qiymat ham Vercel loyihasining "Settings -> Environment Variables"
// bo'limida qo'shiladi (kod ichiga yozilmaydi, xavfsizlik uchun):
//   SUPABASE_URL          -> Supabase loyihangizning "Project URL"
//   SUPABASE_SERVICE_KEY   -> Supabase "service_role" kaliti (SIRLI, hech kimga bermang)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
