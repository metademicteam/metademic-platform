# DEPLOYMENT

## Targets

- **Next.js** → Vercel (`vercel --prod` or GitHub integration)
- **DB/Auth** → Supabase (project `rzflrmgiuamljkxupbvr.supabase.co`; URL/keys in `.env.local`)
- **Assets** → Cloudinary (`dudwzh2xy`)
- **Payments** → Stripe (test/live keys + webhook)
- **DOI** → Crossref (deposit URL + credentials)

## Env

Set in Vercel → Settings → Environment Variables (and locally in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  # publishable
SUPABASE_SERVICE_ROLE_KEY      # server-only, never expose
NEXT_PUBLIC_APP_URL            # https://your-vercel.app
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
EMAIL_PROVIDER_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CROSSREF_USERNAME
CROSSREF_PASSWORD
CROSSREF_DEPOSIT_URL
```

See `ENVIRONMENT.md` and `.env.example`.

## Steps

1. Supabase: project created, `schema.sql` executed, then `supabase/migrations/20260825_fix_rls.sql` in SQL Editor.
2. Vercel: import GitHub repo, set env, `npm run build` (Next 15.4.5), deploy. `next.config.ts` has `images.remotePatterns` for Cloudinary/Supabase.
3. Cloudinary: no extra setup; signed uploads via `POST /api/upload/signature`.
4. Stripe: `stripe listen --forward-to localhost:3000/api/payments/webhook` for dev; set webhook URL in Stripe dashboard for prod.
5. Crossref: set deposit URL; `POST /api/doi/register` enqueues job.

## Future Worker

`system_jobs` is worker-ready; for heavy `document_processing` (PDF/JATS generation), introduce a NestJS/worker service that polls `system_jobs` (`pending → processing → completed/failed`) and writes to Cloudinary, then updates `article_metadata`.

## Checks

- `npm run build` passes (currently 39s, SWC warning is benign).
- `npx tsc --noEmit` passes.
- `npx vitest run` 39 tests pass.
- RLS: verify anon can only see `published` articles; author cannot see others' drafts (test via `test-platform.js`).
