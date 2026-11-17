import { createClient } from "@supabase/supabase-js";
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the anon key is public by design; Row Level Security protects the data).
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || "http://missing", import.meta.env.VITE_SUPABASE_ANON_KEY || "missing");
