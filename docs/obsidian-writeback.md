# E5-T03 Obsidian Write-back

Obsidian write-back produces an editable draft before anything is written to the vault.

## Draft content

Allowed sections only:

- Summary
- Decisions
- Insights
- Follow-ups

The draft rejects raw logs, stack traces and code blocks.

## Flow

1. Create a draft from the accepted run summary.
2. Let the user edit the draft.
3. Create an approval gate for the exact draft hash.
4. Write only the approved draft.
5. If the target note changed, write a conflict draft instead of overwriting.

## Completion rule

Rejected write-back, failed write-back, and conflict drafts are non-blocking for run completion.
