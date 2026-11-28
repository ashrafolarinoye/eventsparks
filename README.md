# EventSparks

Africa's blockchain & tech events hub — a React + Vite + shadcn/ui frontend backed by Supabase (Postgres, Auth, Storage, Edge Functions).

## Getting started

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Database setup: run `supabase/supabase.sql` in the Supabase SQL editor (fresh project), or apply `supabase/migrations/` (existing project).

## Security model

- **The frontend only ever holds the public anon key** (`VITE_SUPABASE_ANON_KEY`). It is safe to ship to browsers because all data access is governed by Postgres Row Level Security.
- **There is no admin password in env vars and no privileged API key in the browser.** Admin access means a Supabase Auth session whose user has a row in `public.user_roles` with `role = 'admin'`.
- **RLS is the enforcement point.** Everyone can read `events` and subscribe to the newsletter; only admins (via the `has_role(auth.uid(), 'admin')` check) can create/update/delete events, write to the `event-images` storage bucket, or read the subscriber list.
- **There is no privileged admin-events edge function.** The old function (unauthenticated, service-role CRUD) has been retired — admins write directly through PostgREST and RLS authorizes the request.

### Making someone an admin

1. Create the user in Supabase Auth (Dashboard → Authentication → Users → Add user, or let them sign in once via the app).
2. Promote them in the SQL editor:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<user-uuid>', 'admin');
   ```

3. They sign in at `/admin` with their Supabase credentials. Non-admin accounts are rejected at login.

### Required after applying the security fixes to an existing project

1. Apply `supabase/migrations/20261128000000_harden_rls_admin_only_writes.sql`.
2. Delete the retired edge function from the deployed project:
   `supabase functions delete admin-events`
3. **Rotate the service-role key** (Dashboard → Settings → API → Reset) — it was previously bundled into the frontend, so it must be considered compromised.
4. Remove `VITE_SUPABASE_SERVICE_ROLE_KEY` and `VITE_ADMIN_*` from any hosting provider's env settings (Vercel etc.).

## Environment variables

See `.env.example`. Public (`VITE_`) vars ship to the browser and must never be privileged. Server-only vars (`LOVABLE_API_KEY`, `SITE_URL`) are for edge functions / Vercel functions.

## Chatbot

`src/components/AiChat.tsx` talks to the `chat` Supabase edge function, which streams answers from an OpenAI-compatible gateway (Lovable AI by default — set `LOVABLE_API_KEY` in the edge-function secrets). To answer questions about *real* events, the function fetches upcoming listings from the `events` table (public read via the anon key, cached for 2 minutes) and injects them into the system prompt. Swap providers by setting `AI_GATEWAY_URL` / `AI_CHAT_MODEL` instead of editing code. Client-supplied `system` messages are dropped, history is capped, and `verify_jwt = true` in `config.toml` still requires a valid anon key.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run test` — run vitest
- `npm run lint` — run eslint
