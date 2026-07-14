# E5-T02 Context Approval and Read-only Snapshot

Context approval turns selected Obsidian candidates into an approved read-only run snapshot.

## Flow

1. Select candidate notes from the approved-root search results.
2. Optionally edit the selected context before approval.
3. Create a context approval gate.
4. After approval, create a read-only snapshot in run artifacts.
5. Inject only the snapshot into the agent.

## Rules

- Agents receive the snapshot only, never live vault access.
- Refreshing the selection invalidates the approval.
- Changing the source note after snapshot creation does not change the run snapshot.
- Snapshot artifacts are written under the `context/` artifact category.
