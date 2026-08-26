-- Set app settings for pg_net to call Edge Functions
-- Run this in Supabase SQL Editor before scheduling pg_cron that calls Edge Functions
-- Replace with your actual project URL and service_role key

-- Option 1: Set via ALTER DATABASE (persists)
-- ALTER DATABASE postgres SET app.supabase_url = 'https://rzflrmgiuamljkxupbvr.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

-- Option 2: Set via config (session)
-- SELECT set_config('app.supabase_url', 'https://rzflrmgiuamljkxupbvr.supabase.co', false);
-- SELECT set_config('app.supabase_service_role_key', 'eyJ...', false);

-- Verify:
-- SHOW app.supabase_url;
-- SHOW app.supabase_service_role_key;

-- For local testing, you can also set via Edge Function env (SUPABASE_URL etc. are auto-injected)

select 'Set app.supabase_url and app.supabase_service_role_key via ALTER DATABASE if you want pg_net to call Edge Functions. Otherwise, cron will use local SQL fallback (no HTTP needed).' as instructions;
