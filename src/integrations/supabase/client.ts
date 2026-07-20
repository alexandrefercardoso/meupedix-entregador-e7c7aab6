import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tmheapviezuqezfpqctp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtaGVhcHZpZXp1cWV6ZnBxY3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjEzMTgsImV4cCI6MjA5NTI5NzMxOH0.5LmqrAbe8Jna8RbCiNqsFjJqpOVBXCzP0WxnQNsTHkc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});