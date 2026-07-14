# E6-T02 SSE Stream and Replay

The local API exposes `GET /api/v1/events` for authenticated Server-Sent Events.

## Rules

- Supports `runId` filtering.
- Supports `Last-Event-ID` replay.
- Emits `stream.reset.required` when the requested cursor is older than retained events.
- Uses heartbeat events for liveness.
- Batches replayed events and never exposes secret payload values.

## Reset behavior

When the client receives `stream.reset.required`, it must load a REST snapshot before resuming the stream.
