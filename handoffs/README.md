# Handoffs

Shared convention for passing work context between **Claude Code**, **Vault Boss**, and other delivery agents on this repo.

## Purpose

Handoff files replace manual copy-paste between chats. When one agent has context the other needs, that context lives here as a dated markdown file in git, not in a chat transcript that the next session cannot see.

## How to hand off

When Claude Code, Vault Boss, or another delivery agent needs to hand context to the other party:

1. Write a dated markdown file into `handoffs/`.
2. Commit and push it.
3. Tell the other party the **exact file path** to read (for example `handoffs/RFQ-HANDOFF-2026-09-24.md`).

The receiving agent reads that file from the repo. Do not paste the body into chat as the source of truth.

## Naming

Use one of these patterns:

- `TOPIC-YYYY-MM-DD.md`
- `TOPIC-YYYY-MM-DD-short-slug.md`

Topic is uppercase and hyphenated. The date is the day the handoff is written. Add a short slug only when more than one handoff on the same topic lands on the same day.

Example: `RFQ-HANDOFF-2026-09-24.md`

## Writing rules

- Keep each file **self-contained**. A reader who has only that file, plus the repo, should be able to continue the work.
- Prefer facts **verified against live systems** over assumptions drawn from migration files alone, especially when documenting schema.
- Do **not** put secrets, API keys, or production credentials in handoff files. Refer to secret names and where they are stored, never the values.

## What is not in this folder yet

The RFQ handoff content file will be added in a follow-up once the full Claude Code report is provided. This README only records the convention. It does not stand in for that report.
