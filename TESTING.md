# TESTING

## Unit

`npx vitest run --reporter=verbose` — 39 tests, 6 files:

- `workflow.test.ts` — `canTransition`, `validateTransition`, terminal `published`/`rejected` blocked
- `recommendation.test.ts` — mirrors `calculate_review_recommendation` SQL: 2 accepts → accept, 2 rejects → reject, etc.
- `apc.test.ts` — `calculateApc` with discounts/waiver/tax
- `doi.test.ts` — `validateDoiPrefix`, `buildCrossrefMetadata`
- `rbac.test.ts` — `hasJournalRole`, `isSuperAdmin`, cross-journal isolation
- `validation.test.ts` — Zod schemas

## Integration

`node --import tsx test-platform.js` (uses live Supabase):

- Journals seeded (2), manuscripts (23), anon sees only published, audit logs, jobs
- All demo logins (author/reviewer/eic/superadmin/finance/production) + wrong password rejected
- `GET /api/journals` 200 public, `GET /api/manuscripts` 401 unauth, `GET /api/upload/signature` 200 health (POST requires 401)
- Author RLS: author1 sees own draft, cannot see author2's draft; reviewer sees own assignments
- Public pages: `/`, `/journals`, `/articles`, `/search?q=seed`, `/journals/jms`, `/articles/seed-article-20`, `/sitemap.xml`, `/robots.txt` all 200
- Protected redirects: `/author`, `/editor`, `/reviewer`, `/finance`, `/admin`, `/production` → 307 to `/auth/login` when unauth (fixed `"/auth"` prefix bug)

`node --import tsx test-lifecycle.js` — full manuscript lifecycle:

```
draft (author) → submitted → technical_check → editor_assignment (eic) → editorial_screening → reviewer_invitation → under_review (2 reviewers) → reviews_complete (accept + minor) → SQL rec minor_revision → decision_pending → minor_revision → revision_submitted (v2) → accepted → APC → invoice → published article + DOI → anon can see, reviewer cannot see APC
```

Also checks Cloudinary `createSignedUploadParams` (secret not leaked) and search.

## E2E (Playwright, manual)

- Author: login → `/author/submissions/new` 12-step wizard (autosave) → submit → track
- Editor: `/editor/manuscripts/[id]` technical check → assign reviewers → monitor
- Reviewer: invitation → accept (COI confirms) → review form (7 scores + comments) → submit
- Editor: see recommendation → override with reason or confirm → decision → revision → accept
- Finance: APC → waiver → invoice → Stripe checkout → webhook → paid
- Production: copyediting → proof → publish → public article + DOI

## Security Tests

- Author cannot see other's draft (RLS)
- Reviewer cannot see APC (RLS)
- Double-blind: reviewer API hides `manuscript_authors` for `double_blind` journals
- `published → draft` blocked (`WorkflowError`)
