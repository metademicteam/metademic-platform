# WORKFLOW

Full state machine at `src/lib/workflow.ts`: `MANUSCRIPT_STATUS_TRANSITIONS` + `canTransition` + `validateTransition`.

```
draft → submitted
submitted → technical_check
technical_check → [editor_assignment | returned_to_author | rejected]
editor_assignment → editorial_screening
editorial_screening → [reviewer_invitation | rejected]
reviewer_invitation → under_review
under_review → reviews_complete
reviews_complete → decision_pending
decision_pending → [accepted | minor_revision | major_revision | rejected | withdrawn]
minor_revision / major_revision → revision_submitted
revision_submitted → re_review
re_review → reviews_complete (loop)
accepted → [apc_pending | copyediting]
apc_pending → copyediting (after paid/waiver)
copyediting → typesetting → author_proof → production_approval → ready_to_publish → published
published / rejected / withdrawn are terminal (no outgoing except retracted)
```

- Invalid like `published → draft` is rejected via `validateTransition` (throws `WorkflowError`).
- Every transition writes `workflow_events` + `audit_logs` + `notifications` + `system_jobs` where needed.
- **Technical Check** (`src/components/editor/TechnicalCheckList.tsx`): 12-item checklist; outcomes `PASS` → `editor_assignment`, `RETURN_TO_AUTHOR` → `returned_to_author`, `DESK_REJECT` → `rejected`.
- **Review**: `review_rounds` (required_reviewers from `journals.reviewers_required`, not hardcoded); `calculate_review_recommendation` via SQL; UI shows `Confirm / Override (requires reason) / Request Additional Reviewer`; editor must confirm.
- **Revision**: creates new `manuscript_versions` row, never overwrites; files under `journals/{journalId}/manuscripts/{manuscriptId}/v{n}/`.
- **APC**: after `accepted`, `apcs` calculated, `invoices` issued, Stripe webhook drives `paid` → `copyediting`.
- **Production**: `production_records` status `not_started → copyediting → typesetting → proof_ready → author_review → corrections_requested → final_approval → ready → published`; assign copyeditor/production editor.
- **DOI**: `doi_records` (`pending → queued → registered → failed/updated`); `POST /api/doi/register` enqueues `system_jobs` (`doi_registration`); Crossref metadata via `doi-service`.

See `src/lib/services/manuscript-service.ts` for transactional acceptance (decision + manuscript update + workflow + APC), and `src/lib/services/review-service.ts` for recommendation.
