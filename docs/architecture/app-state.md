# App state

The Angular client uses NgRx Signal Store for entity state, stateless domain services for API calls and `ngx-toastr` for mutation errors. See the [frontend guide](../../src/AGENTS.md#components-and-state) for dependency and code conventions.

## Loading and relations

- Keep a single record per Thing. `ThingsStore` combines summary fields with detail loaded by ID. A list reload keeps existing detail, and a response with an older revision cannot replace newer state.
- Store relationships on the entity that owns them, such as `Issue.thingId` and `Attachment.thingIds`. Derive reverse relationships and category counts from the relevant stores so they follow optimistic edits. Selectors skip missing entities. Shared read models belong in `core/state/views/`.
- Collections load all pages on first use and filter client-side. Revisit this when typical accounts outgrow a few pages. `withLoad` reuses a request in progress and distinguishes initial load from reload. Signing out clears state and stops streams through `withSession`.

## Mutations and streams

- `withOptimisticEntities` computes visible state by applying pending changes in order to the last server-confirmed value. Success confirms the change. Failure removes that change and recomputes the visible value with later changes still applied. Cross-store operations stage changes together so a failed Thing deletion also restores child records and Attachment links.
- A conflict can refetch the affected record. Authentication failures defer to the sign-in flow. `Toasts` combines the attempted action with the shared error terms. Page-load errors use an inline retry.
- The browser currently inserts creates after the response. Using client-generated IDs end to end would let the UI insert and navigate immediately without an ID swap. The current seam is documented in [frontend mocks](../../src/app/core/mocks/README.md).
- Upload, Import, sensitive-field reveal and sample data use in-progress UI while the server computes their results.
- Thing and conversation stores share one SSE subscription per ID. Pages release their watcher on destruction. Domain services own connection and retry handling. New snapshots update confirmed state and pending changes reapply on top. Thing snapshots with a new revision also refresh related records.
