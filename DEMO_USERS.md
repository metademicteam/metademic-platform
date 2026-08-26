# Metademic — Demo Users

All accounts are created by running `supabase/demo-accounts.sql` in the Supabase SQL Editor (idempotent — safe to re-run). Emails are pre-confirmed, so you can sign in immediately at `/auth/login`.

**Password for ALL accounts: `Demo1234!`**

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Author** | `demo.author@metademic.test` | `Demo1234!` | `/author/dashboard`, `/author/submissions` — has 2 seeded manuscripts + can start a new submission wizard |
| **Reviewer** | `demo.reviewer@metademic.test` | `Demo1234!` | `/reviewer/dashboard`, `/reviewer/invitations`, `/reviewer/reviews` — assigned to submitted manuscripts |
| **Admin** | `demo.admin@metademic.test` | `Demo1234!` | `/admin/dashboard` + Editor, Production, Finance sections (super_admin + journal_admin on both journals) |

## Before logging in — required SQL

Run in Supabase → SQL Editor, in order:

1. `supabase/rls-all-tables.sql` — RLS policies for every role/table (idempotent, includes the anon "accepted manuscripts publicly visible" policy).
2. `supabase/demo-accounts.sql` — creates the 3 users, journals, memberships, seeded manuscripts, and assigns submitted manuscripts to the reviewer.

## Start the dev server

```powershell
$env:NODE_ENV=''   # required — a lingering NODE_ENV=production breaks npm
npm run dev
```

Then open http://localhost:3000/auth/login

## What each role can explore

- **Author**: submit a new manuscript through the 12-step wizard (upload a PDF — Cloudinary now signs correctly), track status on the dashboard.
- **Reviewer**: see pending invitations/active reviews; open a review, fill the 1–5 scores and recommendation, submit.
- **Admin**: journal management, users, audit log, system jobs; plus editor workflows (technical check → assign editor → screening → assign reviewers → decision) and finance/production dashboards.

## Notes / gotchas

- Middleware always redirects to `/author/dashboard` after login regardless of role — use the sidebar or navigate to the role's URL manually for reviewer/admin.
- If a seeded manuscript doesn't show for the reviewer, re-run `rls-all-tables.sql` (the reviewer-access policies live there).
- Accepted papers appear on the journal public page under the **Accepted** tab (e.g. `/journals/jms`), not in `/articles` — `/articles` only lists fully published articles.
