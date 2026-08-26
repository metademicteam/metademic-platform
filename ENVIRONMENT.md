# ENVIRONMENT

All vars at `.env.example` (placeholders). Real values at `.env.local` (gitignored, never commit).

| Var | Public? | Description |
|-----|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://rzflrmgiuamljkxupbvr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | publishable/anon key (JWT, `role: anon`) |
| `SUPABASE_SERVICE_ROLE_KEY` | no | service_role JWT — server-only (`src/lib/supabase/admin.ts`) |
| `NEXT_PUBLIC_APP_URL` | yes | `http://localhost:3000` (or Vercel URL) for metadata + email callbacks |
| `CLOUDINARY_CLOUD_NAME` | server | `dudwzh2xy` |
| `CLOUDINARY_API_KEY` | server | `153423643138648` |
| `CLOUDINARY_API_SECRET` | no | server-only, used in `src/lib/cloudinary.ts` to sign |
| `EMAIL_PROVIDER_API_KEY` | no | Resend/SendGrid etc |
| `STRIPE_SECRET_KEY` | no | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | no | `whsec_...` for `POST /api/payments/webhook` verification |
| `CROSSREF_USERNAME` | no | Crossref deposit |
| `CROSSREF_PASSWORD` | no | |
| `CROSSREF_DEPOSIT_URL` | no | |

- `NEXT_PUBLIC_` prefix exposes to browser; never put secrets there.
- `supabase/auth` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `createBrowserClient`/`createServerClient`; `service_role` only via `createAdminClient` on server.
- Cloudinary browser code only gets `cloudName/apiKey` + `signature/timestamp` from `POST /api/upload/signature`; secret never leaves server.
