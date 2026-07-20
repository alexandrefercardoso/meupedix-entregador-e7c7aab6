import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tmheapviezuqezfpqctp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-WdtX7wqu7Aqf4Zb5Y2hzA_tpXJ4Cxf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});