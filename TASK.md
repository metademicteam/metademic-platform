# Build a Production-Ready Scholarly Journal Publishing Platform

You are the lead full-stack architect and senior engineer responsible for building a complete production-ready **scholarly journal management, peer-review, editorial, APC, production, DOI, and publication platform**.

The platform should provide a workflow comparable in capability to professional scholarly publishing systems such as OJS, Editorial Manager, ScholarOne, and modern open-access journal platforms, while using a modern developer experience.

## 1. Mandatory Technology Stack

Use exactly this primary stack unless there is a strong technical reason not to.

### Frontend

* Next.js latest stable
* App Router
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod
* TanStack Query where appropriate
* Lucide icons

### Backend / Platform

* Supabase
* Supabase PostgreSQL
* Supabase Auth
* Supabase Realtime where useful
* Supabase Edge Functions where appropriate

### File / Media Storage

Use **Cloudinary** for uploaded files and media.

Cloudinary should handle:

* Manuscript files
* Supplementary files
* Figures
* Author avatars
* Journal logos
* Journal cover images
* Proof files
* Published PDF assets
* Other uploaded media

Do not store large binary files directly inside PostgreSQL.

PostgreSQL should store the metadata and Cloudinary identifiers/URLs.

### Validation

Use Zod for all important API/server input validation.

### Deployment

Design the application so that it can be deployed using:

* Vercel for Next.js
* Supabase for database/auth
* Cloudinary for assets

Keep the architecture compatible with a future separate NestJS/worker service, but do not unnecessarily introduce microservices during the initial implementation.

---

# 2. CRITICAL FIRST STEP — INSPECT THE EXISTING SUPABASE DATABASE

The Supabase PostgreSQL database already exists.

I have already executed the initial database schema.

**Do not recreate the database schema.**

Before writing application code:

1. Inspect the existing Supabase schema.
2. Inspect all existing tables.
3. Inspect columns and data types.
4. Inspect foreign keys.
5. Inspect indexes.
6. Inspect enums.
7. Inspect functions.
8. Inspect triggers.
9. Inspect RLS policies.
10. Identify anything missing or unsafe.
11. Generate a database map for yourself.
12. Adapt the application to the actual existing schema.

Do not blindly assume that the database exactly matches your expectations.

If a schema correction is genuinely required, create a new migration instead of deleting/recreating the existing database.

Never destroy existing data.

---

# 3. Core Product

Build a multi-journal scholarly publishing platform.

The system must support:

```text
Journal
    ↓
Submission
    ↓
Technical Check
    ↓
Editor Assignment
    ↓
Editorial Screening
    ↓
Reviewer Selection
    ↓
Reviewer Invitations
    ↓
Peer Review
    ↓
Review Recommendation
    ↓
Editorial Decision
    ↓
Revision
    ↓
Re-review
    ↓
Acceptance
    ↓
APC / Waiver
    ↓
Copyediting
    ↓
Typesetting
    ↓
Author Proof
    ↓
Production Approval
    ↓
DOI Registration
    ↓
Publication
    ↓
Public Article Page
```

Support multiple journals from one platform.

For example:

```text
/platform/journals/journal-a
/platform/journals/journal-b
/platform/journals/journal-c
```

The platform should be multi-tenant at the journal level.

---

# 4. User Roles

Implement role-based access control using the existing database structure.

Support at least:

* Author
* Reviewer
* Editor
* Section Editor
* Editor-in-Chief
* Managing Editor
* Copyeditor
* Production Editor
* Finance Admin
* Journal Manager
* Journal Admin
* Super Admin

A user may have multiple roles across different journals.

Example:

```text
User A
    Journal A → Author
    Journal B → Reviewer
    Journal C → Editor
```

Never implement a single global role field if the database already supports journal-level memberships.

---

# 5. Authentication

Use Supabase Auth.

Support:

* Email/password
* Email verification
* Password reset
* Session management
* Protected routes
* Role-aware routing
* Middleware
* OAuth-ready architecture
* Secure logout

Create a polished onboarding flow.

After registration, users should complete:

* Name
* Country
* ORCID
* Institution
* Department
* Research interests
* Academic information

Do not require information that is unnecessary.

---

# 6. Application Structure

Use a clean route architecture.

Recommended structure:

```text
app/
├── (public)/
│   ├── journals/
│   ├── articles/
│   ├── issues/
│   └── search/
│
├── auth/
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   └── reset-password/
│
├── author/
│   ├── dashboard/
│   ├── submissions/
│   ├── submissions/new/
│   └── submissions/[id]/
│
├── reviewer/
│   ├── dashboard/
│   ├── invitations/
│   ├── reviews/
│   └── reviews/[id]/
│
├── editor/
│   ├── dashboard/
│   ├── submissions/
│   ├── manuscripts/[id]/
│   ├── reviewers/
│   └── decisions/
│
├── production/
│   ├── dashboard/
│   ├── articles/
│   └── articles/[id]/
│
├── finance/
│   ├── dashboard/
│   ├── invoices/
│   ├── payments/
│   └── waivers/
│
├── admin/
│   ├── dashboard/
│   ├── users/
│   ├── journals/
│   ├── settings/
│   └── audit/
│
└── account/
    ├── profile/
    ├── security/
    └── notifications/
```

Adapt the structure when necessary, but maintain separation between roles.

---

# 7. UI / UX REQUIREMENTS

The platform must look like a professional academic publishing product.

Do NOT make it look like a generic CRUD dashboard.

Design characteristics:

* Clean
* Minimal
* Academic
* Professional
* High information density where useful
* Excellent typography
* Strong visual hierarchy
* Responsive
* Accessible
* Desktop-first for editorial workflows
* Mobile-friendly for authors/reviewers

Use shadcn/ui components consistently.

Create:

* Sidebar navigation
* Top navigation
* Breadcrumbs
* Data tables
* Filters
* Search
* Pagination
* Tabs
* Status badges
* Dialogs
* Drawers
* Forms
* Confirmation dialogs
* Empty states
* Skeleton states
* Error states
* Toast notifications
* Timeline components

Do not overuse animations.

---

# 8. Public Website

Every journal needs a public-facing website.

Create:

```text
Journal Home
About
Aims & Scope
Editorial Board
Author Guidelines
Reviewer Guidelines
Publication Ethics
APC
Announcements
Archive
Current Issue
Articles
Contact
```

Article page:

```text
Title

Authors
Affiliations
ORCID

Abstract

Keywords

Received
Revised
Accepted
Published

DOI

License

Download PDF
View HTML

Figures
Tables
References

Citation tools

BibTeX
RIS
EndNote

Metrics
```

Create SEO-friendly pages.

Use:

* Metadata API
* OpenGraph
* Twitter metadata
* JSON-LD
* Canonical URLs
* Sitemap
* Robots.txt
* Structured article metadata

---

# 9. Author Dashboard

Build a complete author dashboard.

Show:

```text
Total Submissions
Under Review
Revisions Required
Accepted
Rejected
Published
APC Pending
```

Submission table:

```text
Manuscript ID
Title
Journal
Status
Current Version
Submitted
Last Updated
Action
```

Build a manuscript submission wizard.

---

# 10. Manuscript Submission Wizard

Use multiple steps.

Recommended:

```text
Step 1 — Journal
Step 2 — Article Type
Step 3 — Title & Abstract
Step 4 — Authors
Step 5 — Affiliations
Step 6 — Keywords
Step 7 — Declarations
Step 8 — Suggested Reviewers
Step 9 — Excluded Reviewers
Step 10 — Upload Files
Step 11 — Review Submission
Step 12 — Submit
```

Make the form resumable.

A draft submission must automatically save.

Never lose user-entered data.

Use strong client-side and server-side validation.

---

# 11. Author File Upload System

Use Cloudinary.

Build reusable upload components.

Support:

* Drag and drop
* Progress indication
* File validation
* Size validation
* MIME validation
* Preview where possible
* Replace file
* Delete file
* Upload retry

Store in PostgreSQL:

```text
cloudinary_public_id
secure_url
resource_type
format
bytes
original_filename
checksum
```

Keep journal/manuscript folder organization.

Example:

```text
journal/{journalId}/manuscripts/{manuscriptId}/v1/
```

Do not expose Cloudinary secrets to the browser.

Use secure server-side signing when necessary.

---

# 12. Manuscript Versioning

This is mandatory.

Never overwrite previous submissions.

Example:

```text
JME-2026-000124

Version 1
Revision Round 0

Version 2
Revision Round 1

Version 3
Revision Round 2
```

Every version should have:

* Files
* Timestamp
* Submitter
* Revision round
* Change summary

Maintain immutable historical versions.

---

# 13. Technical Screening

After submission:

```text
SUBMITTED
    ↓
TECHNICAL_CHECK
```

Editor/admin should see a checklist:

```text
[ ] Correct article type
[ ] Journal scope
[ ] Required files
[ ] Author information
[ ] Figures
[ ] Tables
[ ] References
[ ] Conflict declaration
[ ] Funding
[ ] Ethics statement
[ ] Data availability
[ ] Originality
```

Possible outcomes:

```text
PASS
RETURN_TO_AUTHOR
DESK_REJECT
```

---

# 14. Editor Assignment

Build editor assignment interface.

Editors should be able to:

* View unassigned manuscripts
* Assign editor
* Reassign editor
* Remove editor
* View workload
* Filter by subject area
* Filter by journal
* View assignment history

Prevent unauthorized editor access across journals.

---

# 15. Editorial Screening

Editor can:

```text
Accept for peer review
Desk reject
Request technical correction
Request clarification
```

Create decision reason fields.

All important actions must produce audit records.

---

# 16. Reviewer Management

Build reviewer management system.

Reviewer profile should contain:

* Expertise
* Keywords
* Institution
* ORCID
* Country
* Availability
* Active review count
* Completed reviews
* Average review time
* Overdue count

Reviewer dashboard:

```text
Pending Invitations
Active Reviews
Completed Reviews
Overdue Reviews
```

---

# 17. Reviewer Assignment

Editor can select reviewers manually.

Show:

```text
Reviewer
Expertise
Institution
Active Reviews
Availability
Previous Reviews
Potential Conflict
```

Allow:

```text
Invite
Reject candidate
View profile
```

Support required reviewer count based on journal settings.

Default:

```text
3 reviewers
```

but do not hardcode it.

Use journal configuration.

---

# 18. Reviewer Conflict Detection

Create warnings for:

* Same institution
* Same email domain
* Existing co-authorship where available
* Explicit conflict declaration
* Author exclusion
* Reviewer suggestion

Display:

```text
Potential Conflict of Interest
```

Do not silently block unless journal policy requires it.

---

# 19. Reviewer Invitation

Reviewer invitation screen:

```text
Article Title
Abstract
Keywords
Deadline

Accept Review
Decline Review
```

Before accepting, require:

```text
Conflict of Interest declaration
Confidentiality agreement
Reviewer responsibility acknowledgement
```

---

# 20. Reviewer Portal

Reviewer should be able to:

* View assigned manuscripts
* Accept/decline invitations
* Download manuscript
* View manuscript in browser when supported
* Add comments
* Submit review
* Upload annotated file
* Provide recommendation

Review form:

```text
Originality     1–5
Methodology     1–5
Literature      1–5
Results         1–5
Discussion      1–5
Writing         1–5
Significance    1–5
```

Then:

```text
Comments to Authors

Confidential Comments to Editor

Recommendation
```

Recommendations:

```text
Accept
Minor Revision
Major Revision
Reject
```

---

# 21. Reviewer Anonymity

Support:

```text
Single Blind
Double Blind
Open Review
```

Respect journal settings automatically.

In double-blind review:

* Do not expose author identity to reviewer.
* Do not expose reviewer identity to author.
* Do not leak names through file metadata or frontend responses.

Be extremely careful with RLS and server queries.

---

# 22. Inline Review / Annotation

Build a review interface that supports comments anchored to manuscript content when practical.

Example:

```text
Reviewer selects text

"Please explain the sampling procedure."

Comment saved
```

Store:

* Version
* Page
* Selected text
* Start/end offsets if available
* Comment
* Reviewer
* Visibility
* Resolved status

Also allow reviewer file uploads.

---

# 23. Review Round System

Never assume there is only one review round.

Support:

```text
Round 1
Round 2
Round 3
...
```

Example:

```text
Round 1
Reviewer A
Reviewer B
Reviewer C

Major Revision

Round 2
Reviewer A
Reviewer B
Reviewer D
```

Keep all historical reviews.

Never overwrite previous reviews.

---

# 24. Automated Review Recommendation

After required reviews are complete:

calculate:

```text
Accept votes
Minor revision votes
Major revision votes
Reject votes
```

Example:

```text
Reviewer 1 → ACCEPT
Reviewer 2 → ACCEPT
Reviewer 3 → MINOR_REVISION

System Recommendation → ACCEPT
```

Another:

```text
Reviewer 1 → REJECT
Reviewer 2 → REJECT
Reviewer 3 → MAJOR_REVISION

System Recommendation → REJECT
```

However:

**The system recommendation must NEVER automatically become the final editorial decision.**

The editor must confirm or override it.

Show:

```text
System Recommendation

[ Confirm ]

[ Override ]

[ Request Additional Reviewer ]
```

If the editor overrides the recommendation, require a reason.

---

# 25. Editorial Decision

Editor can choose:

```text
Accept
Minor Revision
Major Revision
Reject
Desk Reject
Withdrawn
```

Decision must store:

* Editor
* Review round
* Reviewer vote summary
* System recommendation
* Final decision
* Reason
* Override flag
* Timestamp

---

# 26. Revision Workflow

When revision is requested:

```text
Editor → Revision Request
```

Include:

* Deadline
* Reviewer comments
* Editor instructions

Author submits:

```text
Revised Manuscript
Clean Manuscript
Tracked Changes
Response to Reviewers
Additional Files
```

Create a new manuscript version.

Never replace Version 1.

---

# 27. Response-to-Reviewer System

Where possible, allow structured response directly in the application.

Example:

```text
Reviewer Comment #1

"Please clarify the methodology."

Author Response

"We have clarified this in Section 3."

Status:
Addressed
```

Support:

```text
Pending
Addressed
Partially Addressed
Not Addressed
```

Allow editors to review responses.

---

# 28. Acceptance Workflow

When accepted:

```text
ACCEPTED
   ↓
Generate acceptance letter
   ↓
Notify corresponding author
```

Acceptance letter should contain:

* Journal
* Manuscript ID
* Article title
* Authors
* Acceptance date
* Editor
* Next production/APC steps

Generate it from a reusable template.

---

# 29. APC System

Implement APC management.

Journal configuration:

```text
APC Enabled
Base APC
Currency
Discount rules
Waiver rules
Tax
```

After acceptance:

```text
Accepted
    ↓
APC calculation
    ↓
Waiver check
    ↓
Invoice
    ↓
Payment
```

Support:

* APC not required
* Waiver requested
* Waiver approved
* Invoice issued
* Payment pending
* Paid
* Failed
* Refunded

Do not expose finance information to reviewers.

---

# 30. Payment Architecture

Design the system to support Stripe and future payment providers.

The frontend must never directly decide that a payment is successful.

Use server-side webhook verification.

Flow:

```text
Checkout
   ↓
Payment provider
   ↓
Webhook
   ↓
Server verifies event
   ↓
Database payment record updated
   ↓
Invoice marked paid
   ↓
Workflow continues
```

Never trust a frontend:

```text
paymentSuccess=true
```

---

# 31. Production Workflow

After acceptance/APC requirements:

```text
COPYEDITING
    ↓
TYPESETTING
    ↓
PROOF
    ↓
AUTHOR REVIEW
    ↓
CORRECTIONS
    ↓
FINAL APPROVAL
    ↓
READY TO PUBLISH
```

Production editors should see a dedicated dashboard.

---

# 32. Published Formats

Design the architecture to support:

```text
PDF
HTML
JATS XML
```

Do not force document conversion to happen synchronously in a server request.

Create an asynchronous job architecture.

For example:

```text
Production request
    ↓
system_jobs
    ↓
Worker
    ↓
Generate PDF/XML/HTML
    ↓
Cloudinary
    ↓
Update article metadata
```

---

# 33. DOI System

Build the DOI module.

Do not confuse an internal article URL with a DOI.

Internal:

```text
/journal/article/abc123
```

Actual DOI:

```text
10.xxxxx/journal.2026.000124
```

Store DOI information in the existing DOI table.

Create server-side DOI registration functionality.

Prepare Crossref-compatible metadata.

Support:

```text
pending
queued
registered
failed
updated
```

Use a background job.

Never expose Crossref credentials in the browser.

---

# 34. Article Publication

After production approval:

```text
READY_TO_PUBLISH
       ↓
Create Article
       ↓
Generate public URL
       ↓
Generate DOI metadata
       ↓
Register DOI
       ↓
Publish article
       ↓
Public article landing page
```

Do not publish an incomplete article.

---

# 35. Journal Issue Management

Admin/editor should be able to create:

```text
Volume
Issue
Special Issue
```

Support:

```text
Volume 1
Issue 1
Issue 2
Issue 3
```

Associate published articles with issues.

Support archive pages.

---

# 36. Search

Implement global search.

Search:

* Article title
* Abstract
* Authors
* DOI
* Keywords
* Manuscript ID
* Journal
* Issue

Start with PostgreSQL full-text search.

Design the search service so OpenSearch could be introduced later.

---

# 37. Notifications

Use database notifications for in-app events.

Examples:

```text
Submission received
Editor assigned
Reviewer invited
Review accepted
Review overdue
Reviews completed
Revision requested
Decision made
APC issued
Payment received
Proof available
Article published
```

Provide:

* Unread count
* Notification dropdown
* Notification center
* Mark read
* Deep links

Use Supabase Realtime where useful.

---

# 38. Email System

Create reusable templates for:

```text
submission_received
editor_assigned
reviewer_invited
reviewer_reminder
reviewer_overdue
reviews_complete
revision_requested
revision_reminder
decision_accept
decision_reject
decision_minor_revision
decision_major_revision
acceptance_letter
invoice_issued
payment_received
proof_ready
article_published
```

Emails should be sent asynchronously.

Record every email in the database.

---

# 39. Audit Logging

Every important action must be logged.

Examples:

```text
Submission created
Submission submitted
Editor assigned
Reviewer invited
Reviewer accepted
Reviewer declined
Review submitted
Decision made
Decision overridden
Revision submitted
APC generated
Invoice issued
Payment received
Article published
DOI registered
Article retracted
```

Do not allow normal users to edit audit logs.

---

# 40. Dashboard Design

Create different dashboards per role.

## Author

```text
Submissions
Under Review
Revision Required
Accepted
APC Pending
Published
```

## Reviewer

```text
Invitations
Active Reviews
Upcoming Deadlines
Completed Reviews
Overdue
```

## Editor

```text
Unassigned
Screening
Reviewer Invitations
Under Review
Decision Pending
Revisions
Accepted
```

## Production

```text
Copyediting
Typesetting
Proofs
Corrections
Ready
```

## Finance

```text
Invoices
Pending Payments
Paid
Waivers
Revenue
```

## Admin

```text
Journals
Users
Editorial Members
Submissions
Payments
System Jobs
Audit Logs
Analytics
```

---

# 41. Analytics

Build useful journal analytics.

Examples:

```text
Submissions/month
Acceptance rate
Rejection rate
Average first decision time
Average review time
Reviewer completion rate
Reviewer overdue rate
Average publication time
APC revenue
Waiver amount
Articles published
Countries
Institutions
Subjects
```

Do not calculate everything on every dashboard request.

Use appropriate SQL views/materialized views later if necessary.

---

# 42. RLS Security

The database already contains RLS.

Treat RLS as a major security boundary.

Do not bypass RLS casually.

Before deploying:

Test:

```text
Author A cannot see Author B's private manuscript.

Reviewer A cannot see Reviewer B's identity in double-blind mode.

Reviewer cannot see confidential editor comments.

Reviewer cannot see APC information.

Author cannot change editorial decision.

Author cannot assign reviewers.

Normal editor cannot access another journal unless assigned.

Finance admin cannot modify editorial decisions.

Production editor cannot modify scientific reviews.

Anonymous public user can only see published content.
```

Never expose the Supabase `service_role` secret to the client.

Never put private Cloudinary credentials in browser code.

---

# 43. Next.js Security

Use:

* Middleware
* Server Components where appropriate
* Server Actions only when appropriate
* Route Handlers for server endpoints
* Secure environment variables
* Server-side authorization checks

Never rely solely on:

```text
if (user.role === "editor")
```

in client components.

Authorization must be enforced server-side and through database RLS.

---

# 44. Data Fetching

Prefer:

```text
Server Components
```

for initial page data where practical.

Use client-side querying when interactive behavior requires it.

Avoid:

```text
useEffect(() => fetch(...))
```

for everything.

Prevent:

* N+1 queries
* Excessive database round trips
* Large uncontrolled queries
* Fetching unnecessary columns

Paginate large tables.

---

# 45. Database Query Layer

Create a clean data-access layer.

Example:

```text
lib/
├── supabase/
│   ├── browser.ts
│   ├── server.ts
│   └── admin.ts
│
├── repositories/
│   ├── manuscripts.ts
│   ├── reviews.ts
│   ├── journals.ts
│   ├── articles.ts
│   └── payments.ts
│
└── services/
    ├── manuscript-service.ts
    ├── review-service.ts
    ├── decision-service.ts
    ├── apc-service.ts
    ├── doi-service.ts
    └── notification-service.ts
```

Keep business logic out of UI components.

---

# 46. Cloudinary Integration

Create a central Cloudinary utility.

It should support:

```text
upload
delete
replace
secure_url generation
signed upload
metadata extraction
```

Do not scatter Cloudinary logic throughout the project.

Create reusable functions such as:

```text
uploadManuscript()
uploadSupplementaryFile()
uploadJournalLogo()
uploadArticleAsset()
deleteAsset()
```

---

# 47. Environment Variables

Create:

```text
.env.example
```

Include placeholders for:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

SUPABASE_SERVICE_ROLE_KEY

CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

NEXT_PUBLIC_APP_URL

EMAIL_PROVIDER_API_KEY

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

CROSSREF_USERNAME
CROSSREF_PASSWORD
CROSSREF_DEPOSIT_URL
```

Never commit real secrets.

Use current Supabase terminology for public/publishable keys where applicable.

---

# 48. Error Handling

Every important server operation must have proper error handling.

Use structured errors:

```text
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
VALIDATION_ERROR
NOT_FOUND
CONFLICT
UPLOAD_ERROR
PAYMENT_ERROR
DOI_ERROR
DATABASE_ERROR
INTERNAL_ERROR
```

Show users meaningful messages.

Do not expose:

* SQL errors
* secret keys
* stack traces
* provider credentials

---

# 49. Loading / Empty / Error States

Every page must handle:

```text
Loading
Empty
Error
Success
```

Do not leave blank screens.

Example:

```text
No submissions yet.

Start your first manuscript →
```

---

# 50. Accessibility

Follow good accessibility practices.

Use:

* Semantic HTML
* Keyboard navigation
* Focus states
* Labels
* Accessible dialogs
* Accessible tables
* Color-independent status indicators

Use WCAG-aware patterns.

---

# 51. Responsive Design

Desktop:

Optimize complex editorial dashboards for wide screens.

Mobile:

Optimize:

* Submission status
* Reviewer invitations
* Review deadlines
* Notifications
* Basic profile functions
* Article pages

Do not attempt to squeeze every complex table into mobile.

Use responsive alternatives such as cards where appropriate.

---

# 52. Testing

Build tests.

At minimum:

### Unit tests

Test:

* Review recommendation logic
* APC calculations
* DOI generation
* Status transitions
* Validation schemas
* Permission checks

### Integration tests

Test:

```text
Submission
Reviewer assignment
Review submission
Editorial decision
Revision
Acceptance
APC
Publication
```

### Security tests

Test RLS.

Especially test cross-journal access.

### E2E tests

Use Playwright.

Create major flows:

```text
Author submits manuscript

Editor assigns reviewers

Reviewer submits review

Editor makes decision

Author submits revision

Editor accepts

Finance processes APC

Production publishes

Public user views article
```

---

# 53. Seed Data

Create realistic seed data for development.

Include:

```text
2 journals

1 super admin

1 journal admin

1 editor-in-chief

2 section editors

2 managing editors

3 production editors

2 finance admins

10 authors

15 reviewers

20 manuscripts

Several review rounds

Accepted articles

Rejected articles

Published articles

Invoices

Payments

Issues
```

Never use fake production data in production.

---

# 54. Demo Account Pages

For local development, document seed accounts.

Example:

```text
admin@example.test
editor@example.test
author@example.test
reviewer@example.test
finance@example.test
production@example.test
```

Use safe development-only credentials.

Do not hardcode them into production.

---

# 55. API / Server Endpoint Architecture

Create clear server APIs or server actions for:

```text
/auth

/journals

/manuscripts

/manuscripts/:id

/manuscripts/:id/submit

/manuscripts/:id/revisions

/manuscripts/:id/files

/manuscripts/:id/assign-editor

/manuscripts/:id/reviewers

/review-invitations

/reviews

/review-rounds

/editorial-decisions

/apc

/invoices

/payments

/production

/articles

/issues

/doi

/notifications
```

Use appropriate HTTP semantics.

Validate every request.

Authorize every operation.

---

# 56. Status Transition Protection

Do not allow arbitrary status updates.

Create a workflow state machine.

For example:

```text
draft
→ submitted

submitted
→ technical_check

technical_check
→ returned_to_author
→ editor_assignment

editor_assignment
→ editorial_screening

editorial_screening
→ reviewer_invitation
→ rejected

reviewer_invitation
→ under_review

under_review
→ reviews_complete

reviews_complete
→ decision_pending

decision_pending
→ accepted
→ minor_revision
→ major_revision
→ rejected
```

And so on.

Reject invalid transitions.

For example:

```text
published → draft
```

should not be possible.

---

# 57. Business Logic Must Be Server-Side

Do NOT allow the frontend to perform:

```text
UPDATE manuscripts
SET status = 'accepted'
```

directly.

Instead:

```text
UI
 ↓
Server endpoint/service
 ↓
Permission check
 ↓
Workflow validation
 ↓
Database transaction
 ↓
Audit log
 ↓
Notification
 ↓
Email job
```

This is critical.

---

# 58. Database Transactions

Operations involving multiple related changes must use transactions where possible.

Example acceptance:

```text
1. Create editorial decision
2. Update manuscript
3. Create workflow event
4. Create acceptance notification
5. Create APC
```

Do not leave the system in half-completed states.

---

# 59. Background Jobs

Build job abstractions.

At minimum:

```text
send_email
send_reviewer_reminder
mark_review_overdue
calculate_apc
generate_invoice
payment_reconciliation
doi_registration
doi_retry
document_processing
publication_notification
```

For the initial Next.js/Supabase architecture, Supabase Edge Functions + scheduled jobs can handle lightweight operations.

For CPU-heavy document conversion, keep the code worker-compatible so a separate worker service can be introduced later.

---

# 60. Documentation

Create:

```text
README.md
ARCHITECTURE.md
DATABASE.md
SECURITY.md
WORKFLOW.md
DEPLOYMENT.md
ENVIRONMENT.md
CLOUDINARY.md
SUPABASE.md
API.md
TESTING.md
```

Document:

* How to run locally
* Environment setup
* Supabase setup
* Cloudinary setup
* Deployment
* Database migrations
* Seed data
* Testing
* Roles
* Workflow

---

# 61. Git Strategy

Use clean commits.

Examples:

```text
feat(auth): implement Supabase authentication

feat(author): create manuscript submission wizard

feat(review): implement reviewer invitation workflow

feat(editor): implement editorial decision system

feat(finance): implement APC and invoice workflow

feat(publication): implement DOI and article publication

fix(review): prevent unauthorized review access
```

Do not make one giant meaningless commit.

---

# 62. Development Process

Work incrementally.

### Phase 1

Foundation:

* Next.js setup
* Supabase connection
* Auth
* Layout
* RBAC
* Existing schema integration

### Phase 2

Author workflow:

* Dashboard
* Submission wizard
* Cloudinary uploads
* Versioning

### Phase 3

Editorial workflow:

* Technical check
* Editor assignment
* Editorial screening
* Reviewer management

### Phase 4

Peer review:

* Invitations
* Review portal
* Review form
* Review rounds
* Recommendations
* Annotations

### Phase 5

Decision/revision:

* Editorial decisions
* Revision requests
* Author responses

### Phase 6

Finance:

* APC
* Waivers
* Invoice
* Payment integration

### Phase 7

Production:

* Copyediting
* Typesetting
* Proofing
* Publication

### Phase 8

Public journal:

* Articles
* Issues
* Search
* DOI
* SEO
* Citation tools

### Phase 9

Analytics/admin:

* Dashboards
* Audit logs
* Reports
* Monitoring

---

# 63. DO NOT Do These Things

Do not:

* Recreate the existing Supabase database
* Delete existing tables
* Reset the database
* Disable RLS to make development easier
* Expose service-role credentials
* Put Cloudinary API secrets in client code
* Store large documents in PostgreSQL
* Trust client-side roles
* Trust client-side payment success
* Automatically reject/accept scientific manuscripts solely from vote counts
* Overwrite manuscript versions
* Delete historical review records
* Expose confidential reviewer/editor comments
* Leak reviewer identity in double-blind review
* Put all logic inside React components
* Build one giant 5,000-line component
* Use mock data where the real database is available
* Hardcode journal-specific logic
* Hardcode the number of reviewers
* Hardcode APC amount
* Hardcode workflow states in multiple places
* Introduce unnecessary microservices
* Leave TODO placeholders for core functionality

---

# 64. Code Quality Rules

Write production-quality TypeScript.

Requirements:

* Strict TypeScript
* Small reusable components
* Clear naming
* No unnecessary `any`
* Proper error handling
* Reusable services
* Centralized validation
* Centralized permissions
* No duplicated business logic
* No secret leakage
* No dead code
* No unnecessary dependencies

Prefer maintainability over cleverness.

---

# 65. Agent Working Rules

You are an autonomous senior engineer.

Before changing code:

1. Inspect the repository.
2. Inspect the existing Supabase schema.
3. Inspect environment configuration.
4. Identify what already exists.
5. Reuse existing functionality.
6. Avoid destructive changes.
7. Plan the current implementation phase.
8. Implement the smallest coherent feature set.
9. Run lint/type checks/tests.
10. Fix errors.
11. Verify the UI.
12. Document meaningful architectural decisions.

Never repeatedly ask me obvious implementation questions.

When something is ambiguous, make the most production-appropriate assumption and document it.

---

# 66. Definition of Done

A feature is not complete merely because the UI exists.

For every feature verify:

```text
Database
✓ Correct query
✓ RLS
✓ Permissions
✓ Validation
✓ Error handling

Backend
✓ Business logic
✓ Status transitions
✓ Transactions where appropriate
✓ Audit logging
✓ Notifications

Frontend
✓ Loading
✓ Empty state
✓ Error state
✓ Success state
✓ Responsive UI

Security
✓ Authorization
✓ No secret leakage
✓ Cross-user isolation
✓ Cross-journal isolation

Testing
✓ Unit/integration tests
✓ Critical E2E path
```

---

# 67. Final Objective

Build the platform as a real product, not a prototype.

The final user experience should feel like:

```text
Scholar
   ↓
Create account
   ↓
Select Journal
   ↓
Submit manuscript
   ↓
Track manuscript
   ↓
Receive revision request
   ↓
Submit revision
   ↓
Receive acceptance
   ↓
Pay APC
   ↓
Review proof
   ↓
Article published
   ↓
Receive DOI
```

Reviewer:

```text
Receive invitation
   ↓
Accept
   ↓
Read manuscript
   ↓
Review
   ↓
Submit recommendation
   ↓
Track completed reviews
```

Editor:

```text
Dashboard
   ↓
Screen submissions
   ↓
Assign reviewers
   ↓
Monitor review
   ↓
Review reports
   ↓
See system recommendation
   ↓
Make final decision
   ↓
Manage revision
   ↓
Accept
```

Production:

```text
Accepted manuscript
   ↓
Copyedit
   ↓
Typeset
   ↓
Proof
   ↓
Approve
   ↓
Publish
```

Public reader:

```text
Journal
   ↓
Issue
   ↓
Article
   ↓
Abstract
   ↓
Authors
   ↓
DOI
   ↓
PDF / HTML
```

## Most important architectural principle

Treat:

```text
Supabase PostgreSQL
```

as the source of truth for structured application state.

Treat:

```text
Cloudinary
```

as the file/media storage layer.

Treat:

```text
Next.js
```

as the application and UI layer.

Treat:

```text
Server-side services / Edge Functions
```

as the secure business-logic layer.

Do not collapse these responsibilities into the frontend.

Start by auditing the existing project and Supabase schema, then implement the platform incrementally while keeping the existing database and data safe.
