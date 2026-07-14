# E6-T05 New Run Wizard and Pipeline Approval

The new run wizard prepares Gate A without starting an agent process.

## Wizard steps

1. Task title and description.
2. Git project path and target branch.
3. Approved pipeline template.
4. Acceptance criteria.
5. Approved or explicitly skipped context.
6. Adapter recommendations and role assignments.
7. Full preflight result.
8. Permission, network and secret-alias approval.
9. Pipeline approval request preview.

## Acceptance behavior

- A trained user has a modeled path to approval within 180 seconds for a prepared project.
- `Blocked` preflight prevents approval request creation.
- `Ready with Warnings` requires explicit warning approval.
- The UI only creates REST request envelopes; it does not start agents or invoke CLI tools.
- Gate A preview includes template, assignments, context, preflight and permission summary.
