import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// The frontend must only ever use the public anon key. It is safe to ship to
// browsers because Row Level Security (see supabase.sql / supabase/migrations)
// restricts what it can read and write. NEVER put the service-role key in a
// VITE_ variable — it bypasses RLS entirely.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
