# Feature Specification: Historical Collection Report Management

**Feature Branch**: `001-migrate-supabase-reports`  
**Created**: 2026-03-30  
**Status**: Draft  
**Input**: User description: "Replace Firebase with Supabase. Add monthly historical data, public read-only management view, admin-only edits (notes + collected amounts)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review monthly collection status (Priority: P1)

Management viewers open the collection reporting workspace without signing in, review the latest published month by default, and switch to any available historical month to inspect summary totals and installment-level details.

**Why this priority**: The core business value is giving decision-makers immediate visibility into current and historical collection performance without creating an access barrier.

**Independent Test**: Can be fully tested by opening the reporting view as a signed-out user, reviewing the default month, switching months, and confirming that data is visible but not editable.

**Acceptance Scenarios**:

1. **Given** published monthly reports exist, **When** a viewer opens the reporting view, **Then** the latest published month is shown with summary metrics and installment details without requiring sign-in.
2. **Given** more than one month has been published, **When** a viewer selects a different month, **Then** the view updates to that month's data and remains read-only.
3. **Given** a viewer is not a designated administrator, **When** the viewer attempts to change report data, **Then** the system prevents the edit and preserves read-only access.

---

### User Story 2 - Publish and preserve monthly history (Priority: P2)

An authorized administrator publishes a new monthly collection report from a supported source document, making it available to all viewers while preserving previously published months for historical review.

**Why this priority**: The reporting workspace only stays useful if new months can be added reliably without overwriting historical reporting continuity.

**Independent Test**: Can be fully tested by signing in as an administrator, publishing a valid report for a new month, and confirming that the new month becomes selectable while earlier months remain available.

**Acceptance Scenarios**:

1. **Given** an administrator has a valid monthly source document for a month that is not yet published, **When** the administrator publishes it, **Then** a new month appears in the report selector and is immediately available to viewers.
2. **Given** a month has already been published, **When** the administrator republishes that same month with corrected data, **Then** that month's detail records are replaced as a single correction while all other months remain unchanged.
3. **Given** a month already has published data, **When** an attempted replacement fails validation or processing, **Then** the existing published month remains available without partial changes and the administrator is told the publication failed.
4. **Given** an administrator successfully publishes a month, **When** the publication is completed, **Then** the system records the publication time and responsible administrator for that month.

---

### User Story 3 - Correct installment details (Priority: P3)

An authorized administrator updates installment notes and collected amounts inside a published month so the report reflects the latest operational information without reopening the entire monthly import process.

**Why this priority**: Small post-publication corrections are common and should not require a full report reupload, but they must stay tightly controlled.

**Independent Test**: Can be fully tested by signing in as an administrator, editing one installment's collected amount and notes, and confirming the updated values and balances are shown while non-admin viewers remain unable to edit.

**Acceptance Scenarios**:

1. **Given** an administrator is viewing a published month, **When** the administrator changes an installment's collected amount, **Then** the installment's remaining balance and the affected month totals update to match the new value.
2. **Given** an administrator adds or updates a note on an installment, **When** the change is saved, **Then** the note is shown in the report for future review and remains non-editable for non-admin viewers.
3. **Given** an administrator is signed in, **When** the administrator edits installment notes or collected amounts, **Then** only the targeted installment is changed and the rest of the published month remains intact.

---

### Edge Cases

- No monthly reports have been published yet, so viewers see a clear empty state instead of stale or broken data.
- An administrator republishes a month that already exists, and the system replaces that month's data without creating duplicates.
- A monthly source document cannot be processed successfully, and the system leaves the previously published month unchanged.
- A signed-out or non-admin user attempts to upload or edit data, and the system blocks the action while keeping read-only access available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a collection reporting view that can be accessed without requiring sign-in.
- **FR-002**: The system MUST display all published report months and allow viewers to switch between available months.
- **FR-003**: The system MUST show summary collection metrics and installment-level details for the currently selected month.
- **FR-004**: The system MUST preserve published months as separate historical records so that newer publications do not overwrite other months.
- **FR-005**: The system MUST support one authoritative published report per calendar month.
- **FR-006**: The system MUST allow an authorized administrator to publish a monthly report from a supported source document.
- **FR-007**: When an authorized administrator republishes an existing month, the system MUST replace that month's detailed records as one correction action and MUST leave other months unchanged.
- **FR-008**: The system MUST record when each monthly report was published and which administrator published it.
- **FR-009**: The system MUST restrict report publication, replacement, and record editing to designated administrator accounts.
- **FR-010**: The system MUST allow an authorized administrator to update the collected amount for an individual installment record.
- **FR-011**: The system MUST allow an authorized administrator to add or update notes for an individual installment record.
- **FR-012**: When a collected amount is updated, the system MUST recalculate the corresponding remaining balance and refresh affected month totals before the administrator continues working.
- **FR-013**: The system MUST present notes and collected amounts in read-only form to viewers who are not designated administrators.
- **FR-014**: If no report data is available for viewing, the system MUST show a clear empty-state message.
- **FR-015**: If a monthly publication fails validation or processing, the system MUST prevent partial replacement of the published month and MUST inform the administrator that the publication did not complete.

### Key Entities *(include if feature involves data)*

- **Monthly Report**: A published reporting snapshot for one calendar month, including the month label, publication timestamp, publishing administrator, and its associated installment records.
- **Installment Record**: A single customer payment obligation within a monthly report, including customer identity, project/unit reference, due date, monetary amounts, collection status, supporting payment reference, and note.
- **Administrator Account**: A designated internal user who is allowed to publish monthly reports and edit installment-level notes and collected amounts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 95% of attempts, viewers can open the reporting view and see the latest published month's summary and detail data in under 10 seconds.
- **SC-002**: 100% of published months remain selectable and reviewable after newer months are added.
- **SC-003**: An authorized administrator can publish or replace a monthly report containing up to 5,000 installment records in under 5 minutes from upload start to viewer availability.
- **SC-004**: 100% of access-control test cases confirm that unauthorized users cannot publish reports or edit notes or collected amounts.
- **SC-005**: In user acceptance testing, at least 90% of management reviewers can locate and review a specific month's collection status on their first attempt.
- **SC-006**: In 95% of valid admin edits, updated notes or collected amounts are reflected in the visible report within 3 seconds.

## Assumptions

- A small predefined set of administrator accounts will be managed outside this feature, with one primary administrator available at launch.
- One published report represents the authoritative snapshot for a single calendar month.
- Management viewers need shared read-only access, not personalized dashboards or viewer-specific permissions, in this release.
- Existing business formulas for totals, collected amounts, and remaining balances remain unchanged by this feature.
- Supported monthly source documents contain enough information to identify each installment and populate the published report without manual row-by-row entry.
- This release does not introduce approval workflows, multi-stage publishing, or custom permission tiers beyond administrator versus read-only viewer access.
