-- ============================================================
-- Harden Row Level Security
-- ============================================================
-- The original setup enabled RLS but then granted everyone
-- full write access to events and event-images ("UI handles admin
-- auth, not Supabase auth"). That only works while the frontend
-- bundles a privileged key — which it no longer does, so the
-- database itself becomes the enforcement point:
--
--   * events            — readable by everyone, writable only by admins
--   * event-images      — publicly readable, writable only by admins
--   * newsletter_subscribers — anyone can subscribe, only admins can read
--   * user_roles        — users can read their own role; writes are manual
--                         (SQL editor / service role) only
--
-- Admins are authenticated users whose user_id appears in
-- public.user_roles with role = 'admin'. Grant with:
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<user-uuid>', 'admin');
-- ============================================================

-- Make sure the has_role helper exists even on databases that
-- were not bootstrapped from supabase.sql.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ------------------------------------------------------------
-- events — replace open write policies with admin-only ones
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can create events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;

DROP POLICY IF EXISTS "Admins can create events" ON public.events;
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

CREATE POLICY "Admins can create events"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update events"
ON public.events FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete events"
ON public.events FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Public read stays as-is ("Anyone can view events").

-- ------------------------------------------------------------
-- storage.objects (event-images bucket) — admin-only writes
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update event images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete event images" ON storage.objects;

DROP POLICY IF EXISTS "Admins can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete event images" ON storage.objects;

CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update event images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'event-images'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete event images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Public read of event images stays as-is.

-- ------------------------------------------------------------
-- user_roles — no self-service writes, ever.
-- (No INSERT/UPDATE/DELETE policies are created, so writes are
-- denied by default for anon/authenticated roles; only the
-- service role / SQL editor can grant or revoke roles.)
-- ------------------------------------------------------------
