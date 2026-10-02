# App state

Front-end data lives in NgRx Signal Store entity stores, which call stateless domain services. Every user change applies optimistically. On failure it rolls back and reports the error in a toast. This is stage 3a of the [POC frontend](poc-frontend.md); stages 4–9 build on it.

Inputs: [frontend guide](../../src/AGENTS.md), `openapi.json`, `src/app/core/api/api-client.ts`.

## Decisions

- `@ngrx/signals` 21.x (peer `@angular/core ^21`). It upgrades with Angular.
- `ngx-toastr` 20.x (peer `@angular/core ^21`) renders toasts. It needs no `@angular/animations`.
- Layers: component → store → domain service → `openapi-fetch` client. Components do not call the API client.
- The browser generates entity IDs with `crypto.randomUUID()`, so optimistic creates need no ID swap and routes work immediately.
- State is normalised: one store per entity type. A child's foreign keys are the source of truth for relations.
- Collections load every page once per session. Home and list views filter and sort client-side. Revisit this when an account's collections outgrow a few pages.

## Layers

| Layer          | Path                                | Owns                                                                                                   |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Domain service | `app/core/data/<domain>.service.ts` | API calls for one domain: request shaping, pagination, streams. Stateless; returns contract types.     |
| Store          | `app/core/state/<domain>.store.ts`  | Entities, load status, optimistic mutations, selectors. `providedIn: 'root'`.                          |
| Shared views   | `app/core/state/views/`             | Cross-entity read models used by more than one page, such as an Event with its Thing name.             |
| Component      | `app/features/`                     | Reads store signals and calls store methods. Page-only view mapping and mocks stay beside the feature. |

`Api` keeps the configured client. `blob` and `download` move to `AttachmentsService`.

## Stores

| Store                | Entities                       | Loads                                                   |
| -------------------- | ------------------------------ | ------------------------------------------------------- |
| `ProfileStore`       | `Profile`                      | On sign-in                                              |
| `CategoriesStore`    | `Category`                     | On sign-in, all pages                                   |
| `TagsStore`          | `Tag`                          | On sign-in, all pages                                   |
| `RegistryStore`      | `FieldSet`, `FieldDefinition`  | First use; read-only                                    |
| `ThingsStore`        | `ThingSummary`, Thing details  | Collection on first use; details per ID; Thing stream   |
| `IssuesStore`        | `Issue`                        | Collection on first use                                 |
| `EventsStore`        | `Event`                        | Collection on first use, with the local `timeZone`      |
| `AttachmentsStore`   | `Attachment`                   | Collection on first use                                 |
| `PurchasablesStore`  | `Purchasable`                  | Per Thing (`thingId`)                                   |
| `ConversationsStore` | `Conversation` with `messages` | Conversation per ID; conversation stream; history (#35) |

- `ThingsStore` keeps one record per Thing: the `ThingSummary` fields, plus a `detail` holding the detail-only fields (`fieldSets`, `standaloneFields`, `undefinedFields`, `pinnedFields` and `import`) once the Thing is loaded by ID. A list reload keeps loaded details.
- Each collection has a status (`idle`, `loading`, `loaded`, `error`) and an error code, from the `withLoad` feature. `load()` reuses a request already in flight, `ensureLoaded()` does nothing once loaded, and `reload()` always fetches.
- Signing out clears every store and aborts their streams (`withSession`).
- `withEntityCollection` bundles the collection stores' shared parts: optimistic entities, `withLoad`, `loadOne`, a default `reset` and `withSession`. Things, Issues, Events, Attachments, Tags and Categories use it.

## Relations

- These fields are the source of truth for relations: `Thing.categoryId`, `Thing.tagIds`, `Thing.imageAttachmentId`, `Issue.thingId`, `Event.thingId`, `Event.issueId`, `Attachment.thingIds`, `Purchasable.thingId` and `Conversation.thingId`.
- The ID arrays on a Thing detail (`issueIds`, `eventIds`, `attachmentIds`, `purchasableIds`, `conversationIds`) are not stored. Selectors such as `issuesByThing` derive them from the child stores.
- `Category.thingCount` is derived from `ThingsStore` once Things are loaded, so it follows creates, deletes and category changes.
- Selectors ignore references to missing entities. Deleting a Tag or an Attachment therefore needs no change to Things.
- Stores depend in one direction only. `ThingsStore` injects the child stores it cascades to; child stores never inject `ThingsStore`.

## Optimistic mutations

A store feature, `withOptimisticEntities`, runs every mutation through pure functions in `app/core/state/optimistic.ts`:

- Each entity keeps its last server-confirmed value and an ordered list of pending changes. The visible value is the confirmed value with the pending changes applied.
- A mutation:
  1. Adds its change, which is visible immediately.
  2. Calls the domain service.
  3. On success, replaces the confirmed value with the server response (or with the change, for `204` responses) and drops the change.
  4. On failure, drops only that change, recomputes the visible value and shows an error toast.
- A failed change never discards later pending changes on the same entity.
- A transaction groups changes across stores, and a failure reverts all of them. For example, deleting a Thing hides its Issues, Events, Purchasables and Conversations, and removes it from `Attachment.thingIds`.
- A failed create removes the entity. A page showing that entity navigates back.
- A `409` reverts the change, shows a toast and fetches the entity again.
- A `401` reverts the change without a toast; `Auth` handles the redirect.
- Stream snapshots replace confirmed values; pending changes reapply on top.

| Operation                                    | Optimistic effect                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /things`                               | Insert the Thing                                                                                            |
| `PATCH /things/{id}`                         | Apply scalar fields, tags and pins. Apply values to the detail; build added field sets from `RegistryStore` |
| `DELETE /things/{id}`                        | Hide the Thing and its children; unlink attachments                                                         |
| `POST /things/{id}:view`                     | Update `lastViewedAt` and `accessCount`. A failure reverts silently                                         |
| `POST`, `PATCH`, `DELETE /tags`              | Insert, rename or remove the Tag                                                                            |
| `PATCH /attachments/{id}`                    | Apply the metadata                                                                                          |
| `DELETE /attachments/{id}`                   | Remove the Attachment                                                                                       |
| `PUT`, `DELETE /attachments/{id}/things/{t}` | Add or remove the link in `thingIds`                                                                        |
| `POST`, `PATCH /issues`                      | Insert or patch. Resolving sets `status` and `resolvedAt`                                                   |
| `POST`, `PATCH /events`                      | Insert or patch. Completing sets `status` and `completedAt`                                                 |
| `POST /conversations`                        | Insert an empty conversation                                                                                |
| `POST /conversations/{id}/messages`          | Append the user message as pending. The assistant reply arrives on the stream                               |

The server computes the result of these operations, so they are not optimistic. They show an in-progress state and report failures in a toast: attachment upload, `things:import`, import confirm and retry, `reveal-field` and `profile:seed-samples`.

## Toasts

- `ngx-toastr` is configured in `app/app.config.ts` with `provideToastr()`: bottom-centre position above the bottom nav, `timeOut` from `APP_CONFIG.toastMs`, `maxOpened` from `APP_CONFIG.toastLimit`, duplicate suppression and a close button.
- `Toasts` (`app/core/services/toasts.service.ts`) wraps `ToastrService` with `error(action, code)`. Stores call `Toasts`, never `ToastrService`.
- Copy is an action lead from `app-terms.ts` (for example, "Couldn't save changes") followed by the shared error-code copy that `bt-error-message` uses.
- `src/styles/_toasts.scss` restyles the `ngx-toastr` classes with design tokens and replaces the library stylesheet.
- Page load failures keep the inline `bt-error-message` with Retry. Toasts are for mutations.
- Figma has no toast frame. Toasts are checked visually against the surrounding screens, including screen reader announcement.

## Streams

- `ThingsStore.watch(id)` and `ConversationsStore.watch(id)` share one subscription per ID and return a stop function. Pages call `watch` and register the stop function with `DestroyRef`.
- The domain services wrap `watchThing` and `watchSse`. Retry and backoff stay in `app/core/api/thing-stream.ts`.

## Steps

1. Add `@ngrx/signals@^21` and `app/core/state/optimistic.ts`, with Node unit tests covering apply, confirm, revert, out-of-order failures and transactions.
2. Add domain services for every domain. Move `blob` and `download` to `AttachmentsService`.
3. Add `ngx-toastr@^20`, `Toasts`, `_toasts.scss`, and `toastMs` and `toastLimit` in `app/core/app.config.ts`. Add the stores and `withOptimisticEntities`.
4. Migrate Home, the dashboard and Profile to the stores. Manual creation and the import panel migrate in stage 4, Thing detail in stage 5 and chat in stage 7.
5. In `src/AGENTS.md`, replace the local-signals and "no store library" rules with the layer rules, the store rules, the optimistic-mutation rule and the toast rule.

The API accepts client-generated IDs for creates. Frontend adoption remains in `app/core/mocks/client-ids.mock.ts`.

## Backend follow-up

| Issue | Change                                                                                                                                                                                              | Needed by |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| #34   | Optional client `id` (UUID) on `ThingCreate`, `IssueInput`, `EventInput`, `TagInput` and `ConversationInput`. Implemented: successful creation returns `201`; reusing any existing ID returns `409` | 3a        |
| #35   | Implemented: `GET /conversations` with `thingId`, `minMessageCount`, `limit` and `cursor`, returning conversation summaries for chat history. Frontend history integration remains pending.         | 7         |

## Validation

- `CI=true pnpm check`, including the Node tests for `optimistic.ts`.
- An e2e spec uses Playwright route interception to fail an Issue resolve; the failure shows a toast and reverts the visible value. Thing rename and Tag delete failures join the spec when stage 5 moves the Thing page to the stores.
- The existing Home and dashboard e2e specs pass on the stores.
- Mobile and desktop screenshots of a toast over Home.
