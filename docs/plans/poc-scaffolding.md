# POC scaffolding

Build a local framework for login, progressive Thing creation from text/photos/documents, registry-backed extraction, and chat grounded in Thing records. Include maintenance suggestions/events, issues, consumables and upgrade options. Three implementation steps.

Inputs: [Technology](../requirements/technology/TECHNOLOGY.md), [Milestones](../requirements/roadmap/MILESTONES.md), [29 September notes](../meeting-notes/2026-09-29%20data%20model.md), and the field-set review. Decisions below supersede earlier category/field proposals for this scaffold.

## Confirmed implementation scope (29 September)

- Step 1 uses one Logto Cloud tenant as the identity source for local development and production. Pause for user setup before validating live login.
- Author initial registry seeds from this plan; use a museum membership example.
- Sensitive fields are masked by default. Normal detail responses omit their values and source quotes; an owner-authorized reveal action returns the value with `Cache-Control: private, no-store`. This is display/access control, not encrypted vault storage.
- Issues, events and purchasables use labelled sample data for UI work. Real extraction and reasoning initially focus on defining Things. Activity/product discovery was implemented in step 2; assistant execution is implemented in step 3.
- The initial field subset supports strings, numbers, integers, booleans, enums, dates, bounds and patterns. Money uses integer minor units and GBP/EUR/USD. `null` clears a value.
- Step 1 includes manual creation, set selection, every empty field, tags and attachments. Sections remain one per set until the later grouping work.
- A Thing can select a linked image attachment as its image. Category artwork is the fallback.
- Uploads initially accept PDF, JPEG, PNG, WebP and UTF-8 plain text, up to a configurable 20 MiB.

## Boundaries and decisions

- TypeScript, Angular frontend in `src/`, Fastify backend in `server/`, authored OpenAPI generating client/server types. Interpret the technology doc's “AngularJS” as Angular for this scaffold.
- Local Postgres via Supabase; Logto authentication. Local filesystem blobs behind one storage interface; hosted storage/deployment follows later.
- Seed broad categories: Appliances, Devices, Vehicles, Memberships, Subscriptions, Utilities, Insurance, Other. One category per Thing; allow Other and later correction.
- Field sets belong to one category. Field definitions can be referenced by sets across categories, per the meeting notes. Future reporting can explicitly map different definitions.
- Sets have separate `includes` and `considerAlongside` ID lists. Includes are mandatory dependencies; alongside links are retrieval suggestions. Validate references and reject inclusion cycles.
- Stable registry IDs; no registry versioning. Registry changes are authored seed data; no registry editor or AI-authored global definitions.
- One occurrence of a field set per Thing. A field's value is scoped by its set; standalone values have no set. No additional domain concept for scope.
- Sets drive UI sections. All fields in a selected set appear, including empty fields. Eligibility prose guides selection; no certainty ratings or selection-explanation UI.
- Prefer relevant specialist sets through descriptions and prompts. Defer substitution rules and generic/specialist conflict resolution. Never merge different definitions merely because labels match.
- Preserve source files and extracted content before mapping. Several detected Things require user confirmation; a source attachment may belong to several Things.
- Tags provide user-defined filing now. Sharing through tags follows later; the scaffold is owner-only.
- Purchasables cover consumables, accessories and upgrades linked to a Thing. Start with outbound merchant links; checkout and repair booking follow later.
- Include bounded discovery of manuals/model information, suggested maintenance, and purchasables during import or chat. Retain source links; unsupported details remain absent.
- Defer repeated set occurrences, semantic field migration, embeddings, distributed queues, spending analysis, calendar sync and conversation history/resumption. No Field details, tag management, Timeline or Insights views.

## Database

Use UUIDs for owned records and stable text IDs for seeded registry records. Add `created_at`/`updated_at` to mutable records. Foreign keys for ordinary relations; validate registry ID arrays and Thing JSON against the registry in application code.

| Table               | Proposed columns                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | `id`, `auth_subject` unique, `display_name`                                                                                                                                                                                                  |
| `categories`        | `id`, `name`, `description`, `icon`, `default_image`, `sort_order`                                                                                                                                                                           |
| `field_definitions` | `id`, `name`, `description`, `keywords text[]`, `schema jsonb` (supported JSON Schema subset), `ui_hint`                                                                                                                                     |
| `field_sets`        | `id`, `category_id`, `name`, `eligibility`, `keywords text[]`, `includes text[]`, `consider_alongside text[]`, `field_ids text[]` in display order                                                                                           |
| `things`            | `id`, `owner_id`, `category_id`, `name`, `description`, `data jsonb`, `revision bigint` for stream ordering                                                                                                                                  |
| `attachments`       | `id`, `owner_id`, `filename`, `media_type`, `byte_size`, `storage_key`, `source_url` nullable                                                                                                                                                |
| `thing_attachments` | `thing_id`, `attachment_id`; composite primary key                                                                                                                                                                                           |
| `imports`           | `id`, `owner_id`, `attachment_id`, `target_thing_id` nullable, `status`, `extraction jsonb`, `selection jsonb`, `result_thing_ids uuid[]`, `error`, `usage jsonb`, `started_at`, `finished_at`                                               |
| `tags`              | `id`, `owner_id`, `name`; unique per owner                                                                                                                                                                                                   |
| `thing_tags`        | `thing_id`, `tag_id`; composite primary key                                                                                                                                                                                                  |
| `issues`            | `id`, `owner_id`, `thing_id`, `title`, `description`, `status` (OPEN/RESOLVED), `resolved_at` nullable                                                                                                                                       |
| `events`            | `id`, `owner_id`, `thing_id`, `issue_id` nullable, `title`, `description`, `status` (SUGGESTED/SCHEDULED/COMPLETED/DISMISSED), `starts_at` nullable, `completed_at` nullable, `source_refs jsonb`                                            |
| `purchasables`      | `id`, `owner_id`, `thing_id`, `kind` (CONSUMABLE/ACCESSORY/UPGRADE), `name`, `description`, `merchant_url`, `image_url` nullable, `price_amount` nullable, `currency` nullable, `source_refs jsonb`, `checked_at`                            |
| `conversations`     | `id`, `owner_id`, `thing_id` nullable for dashboard-started chat                                                                                                                                                                             |
| `messages`          | `id`, `conversation_id`, `request_id`, `role`, `text`, `cards jsonb`, `source_refs jsonb`, `tool_results jsonb`, `status` (QUEUED/PROCESSING/COMPLETE/FAILED), `usage jsonb`, `error` nullable; unique `(conversation_id, request_id, role)` |

`things.data` stores set IDs, values keyed by field ID within each set, standalone values, undefined fields, and pinned field references. Definitions remain in the registry. JSONB keeps the POC small; application validation enforces the structure. Add normalized value tables when field-level querying warrants them.

Missing values have no stored value entry; the detail response expands every selected set's field definitions and returns `value: null` for empty fields. Preserve `false`, `0`, and empty strings as actual values. Undefined fields have a local UUID, label, and value; they do not create registry definitions.

Each stored value can carry `sourceRefs` (attachment ID and page/quote), and `origin: IMPORT | USER`. Pinned references use `(fieldSetId, fieldId)` or an undefined-field ID. Initial pin suggestions come from the import; users can change them.

Use a suggested Event for a maintenance recommendation; scheduling it changes the same record's status/date. Support one Thing per issue/event/purchasable initially. Purchasables are contextual suggestions, without a shared product catalogue. Price requires currency and a source/check date. Persist chat messages for grounding and recovery within the active conversation; defer browsing or reopening previous chats.

Index Thing owner/category/update time, import owner/status, issue Thing/status, event Thing/status/date, purchasable Thing, message conversation/time, and both directions of attachment/tag links. Start registry search with names, keywords and descriptions using Postgres text search plus literal identifier matching. No vector service.

Apply owner checks to every record operation, stream and attachment download. Attachments are top-level resources; shared links must belong to the same owner during this scaffold. Unlinking a Thing must not delete a blob used elsewhere. Reject attachment deletion while linked to Things or retained imports. Thing deletion removes its links, dependent issues/events/purchasables and Thing-scoped conversations/messages; dashboard-chat cards referencing deleted records become unavailable.

## Backend modules

See [the backend guide](../../server/AGENTS.md) for module boundaries and [README](../../README.md) for setup and validation.

- `application/import/`, `application/conversations/` and `application/registry/` group feature workflows; shared discovery and activity rules stay in application modules.
- `application/jobs/runner.ts` consumes persisted imports and messages in one process. Interrupted work is marked failed for retry. Each job gets bounded provider work.
- `db/` owns SQL and typed persistence functions. Related writes share one transaction; chat records and retry receipts commit together.
- `contracts/` derives runtime schemas and operation types from the authored OAS 3.1 contract. `routes/` owns HTTP error translation and SSE transport.
- `routes/scaffolds/samples.ts` contains the opt-in demonstration workflow, including SQL. Production profile access is separate.
- Publish owner changes after committed mutations. Subscribe before reading the first SSE snapshot; close streams on backpressure, shutdown or authentication renewal.

## Import and AI workflow

1. Upload one source to `/attachments` (pasted text becomes a text attachment), then start an import using its ID. Create a skeleton Thing immediately, or use the supplied existing Thing. Return its ID and navigate directly to the Thing view. Extract content, candidate Things, categories and terms; save this output before mapping. If several Things are detected, pause and show a selection prompt in place of the processing state. Reuse the skeleton for the first accepted new Thing; create any further Things only after confirmation. If all selections target existing Things, remove only the untouched import-created skeleton and redirect to the first selected Thing.
2. Map each accepted candidate with a bounded tool-calling task. Evaluate retrieved eligibility prose and commit selected sets first, showing their empty fields. Populate supported values as validated batches arrive; batch-search remaining extracted keys for individual definitions. Return unmatched key/value data as undefined fields; retain other content in the extraction. Publish each committed stage through the Thing stream.
3. Run bounded discovery using the identified model and existing facts: retrieve a manual or model reference, propose maintenance, and find relevant consumable/upgrade links. Persist cited results progressively; failed discovery leaves extracted data usable. Validate IDs, category compatibility, dependency closure, value types and field membership on every write. Link the same source attachment to each resulting Thing.

Tool surface:

| Tool                | Input                                         | Output                                                                                                               |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `search_field_sets` | `categoryId`, `terms[]`                       | Bounded matches, included dependencies, and one hop of alongside suggestions, with eligibility and field definitions |
| `search_fields`     | Batched observed labels plus surrounding text | Bounded field matches with definitions and set membership summaries                                                  |

Return definitions with search results initially, avoiding an extra metadata-fetch round trip. Application code expands mandatory dependencies and deduplicates results. Alongside suggestions remain optional. Make truncation visible; permit a refined search within the tool budget.

Use an initial limit of four registry tool rounds per candidate plus a task timeout; configure both, and separately bound discovery. Hitting the limit preserves partial/unmatched data and reports an incomplete result. Do not loop until every fact fits the registry. Registry tools are read-only; only validated application code persists results. Stream structured mapping output with selected sets before value groups; commit only complete, validated groups, never partial JSON.

Use structured responses, stable prompts and batched searches. Record model, input/output/cached tokens, tool calls and elapsed time per import. Start with one configurable model; use the fixture corpus to decide whether cheaper models or narrower prompts help. No whole-registry prompt path.

## Chat and assistant workflow

- Start a new conversation from the dashboard or a Thing. Thing context supplies fields, attachments, issues, events and purchasables; dashboard chat can search the user's Things.
- Provide read tools for Thing search/detail and attachment content, plus bounded discovery. Answers cite stored records or retrieved sources. Missing evidence produces an explanation or follow-up question.
- Stream the response and render typed cards for Things, field values, attachments, issues, Events and purchasables. Support questions about known details, manual instructions, maintenance, compatible consumables and upgrade options.
- A maintenance card can create a suggested Event; “Schedule” sets its date. An explicit chat request to create an Event/Issue can invoke a write tool. Validate owner scope and arguments in application code; persist the created record and tool result together and reuse completed tool results when retrying the same message. Cards link to the persisted result.
- Purchasable cards open the merchant URL. Do not invent compatibility or prices. Include the supporting model/source information; no purchasing tool.
- Keep the active conversation usable across several messages. Allow one response in flight per conversation; failed responses can be retried using the same request ID. Defer conversation lists and resuming earlier conversations.

## API

Author `openapi.json` first. All routes use `/api` and authenticated owner scope. Lists accept `limit` and `cursor`; registry endpoints are read-only. Invalid references/values return 422; invalid import-state actions return 409. Limits on file size and supported media types are configured and reflected in the UI.

| Route                                                                                              | Operation                                                                                    |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /profile`                                                                                     | Current user; create the local user on first authenticated access                            |
| `GET /categories`                                                                                  | Static categories and current user's Thing counts                                            |
| `GET /field-sets?categoryId=&q=`; `GET /field-sets/{id}`                                           | Registry search/detail, including relation IDs and field definitions                         |
| `GET /fields?q=`; `GET /fields/{id}`                                                               | Individual definition search/detail                                                          |
| `GET /things?categoryId=&tagId=&q=`; `POST /things`                                                | List or create from literal data                                                             |
| `GET /things/{id}`; `PATCH /things/{id}`; `DELETE /things/{id}`                                    | Expanded detail; edit basics, tags, pins and changed values; delete                          |
| `GET /things/{thingId}/stream`                                                                     | SSE snapshots of progressive Thing state and related record IDs                              |
| `POST /things:import`                                                                              | `{attachmentId, thingId?}`; create/use skeleton and return 202 with `importId` and `thingId` |
| `GET /imports/{id}`                                                                                | Status, candidate selection request, results or error                                        |
| `POST /imports/{id}:confirm`                                                                       | Submit accepted candidates and optional existing target Thing IDs                            |
| `POST /imports/{id}:retry`                                                                         | Retry a failed/incomplete import without duplicating results                                 |
| `GET /attachments?thingId=`; `POST /attachments`                                                   | List or upload a top-level source; upload returns its ID                                     |
| `GET /attachments/{id}`; `GET /attachments/{id}/content`; `DELETE /attachments/{id}`               | Metadata, authorized download, delete if unreferenced                                        |
| `PUT /attachments/{id}/things/{thingId}`; `DELETE /attachments/{id}/things/{thingId}`              | Idempotently link/unlink; retain other Thing links                                           |
| `GET /tags`; `POST /tags`; `PATCH /tags/{id}`; `DELETE /tags/{id}`                                 | User-defined filing tags; deletion removes associations                                      |
| `GET /issues?thingId=&status=`; `POST /issues`; `GET /issues/{id}`; `PATCH /issues/{id}`           | Open/list/update/resolve issues                                                              |
| `GET /events?thingId=&status=&from=&to=`; `POST /events`; `GET /events/{id}`; `PATCH /events/{id}` | Suggestions, upcoming/past events, scheduling and completion                                 |
| `GET /purchasables?thingId=&kind=`; `GET /purchasables/{id}`                                       | Cited consumable/accessory/upgrade suggestions populated by discovery                        |
| `POST /conversations`; `GET /conversations/{id}`                                                   | Start a chat with optional `thingId`; fetch the active conversation                          |
| `POST /conversations/{id}/messages`                                                                | `{text, requestId}`; enqueue a response, return 202; reuse request ID for retry              |
| `GET /conversations/{id}/stream`                                                                   | SSE active-conversation snapshot, text deltas, cards, completion/error                       |

PATCH field updates use `(fieldSetId, fieldId)`; `fieldSetId: null` means standalone. `value: null` clears a value. Undefined fields use their local ID. Selected sets can be added/removed by ID; included sets cannot be removed while required. Preserve populated fields from removed sets as labelled undefined fields for the POC; richer remapping is deferred. Category correction clears incompatible set assignments using the same preservation rule.

### Progressive updates over SSE

- `GET /things/{thingId}/stream` uses `text/event-stream`. Send a full `thing.snapshot` on connection, then another after each committed change. Include import stage, selection candidates when needed, fields and related resource IDs. Increment `things.revision` when the Thing or its related records change; use it as the SSE ID and discard older snapshots on the client.
- Subscribe before reading the initial snapshot to avoid missing concurrent commits. On reconnect send current persisted state; no event-history table or replay mechanism in this POC. Reconnect restores the view even if notifications were missed.
- Use authenticated fetch-based SSE with the existing bearer token. Send keep-alive comments, disable response buffering/caching, reconnect with backoff, and abort on navigation/logout. Handle token refresh and authorization failure. SSE framing follows the [HTML standard](https://html.spec.whatwg.org/multipage/server-sent-events.html).
- Conversation streams use the same transport. Persist messages/cards before completion; reconnect starts from saved messages and the current in-flight response. Text deltas identify message and offset so reconnects cannot duplicate text. Transient text can be held in the single process; interrupted responses become retryable failures after restart.
- SSE disconnects do not cancel background work. Import completion/failure unlocks editing; incomplete results remain visible with retry. Changes made through chat also update the affected Thing streams.

Import acceptance: `{"importId":"import-1","thingId":"thing-1","status":"queued"}`. The UI opens `/things/thing-1` immediately and subscribes.

### Registry example

```json
{
  "id": "vehicles.van",
  "categoryId": "vehicles",
  "name": "Van",
  "eligibility": "A van used for carrying goods. Exclude passenger cars.",
  "keywords": ["van", "cargo", "payload"],
  "includes": ["vehicles.vehicle"],
  "considerAlongside": ["vehicles.electric"],
  "fields": [
    {
      "id": "vehicles.payloadKg",
      "name": "Load capacity",
      "description": "Maximum permitted payload, in kilograms.",
      "schema": { "type": "number", "minimum": 0 },
      "uiHint": "number"
    }
  ]
}
```

### Thing detail example

Owned-record IDs below are abbreviated. The response embeds definitions to avoid per-field fetches; the example abbreviates repeated metadata.

```json
{
  "id": "thing-1",
  "name": "Kitchen hob",
  "categoryId": "appliances",
  "revision": 4,
  "import": { "id": "import-1", "status": "mapping" },
  "tagIds": ["tag-1"],
  "fieldSets": [
    {
      "id": "appliances.neffIdentifiers",
      "name": "Neff appliance identifiers",
      "includes": [],
      "considerAlongside": [],
      "fields": [
        {
          "id": "appliances.zNumber",
          "name": "Serial number (Z-Nr)",
          "description": "Manufacturer Z-number; do not assume global uniqueness.",
          "schema": { "type": "string" },
          "value": "15",
          "origin": "import",
          "sourceRefs": [{ "attachmentId": "attachment-1", "quote": "Z-Nr: 15" }]
        },
        {
          "id": "appliances.eNumber",
          "name": "E-number",
          "schema": { "type": "string" },
          "value": null,
          "sourceRefs": []
        }
      ]
    }
  ],
  "standaloneFields": [],
  "undefinedFields": [{ "id": "local-1", "label": "Installer reference", "value": "ABC-12" }],
  "pinnedFields": [
    {
      "fieldSetId": "appliances.neffIdentifiers",
      "fieldId": "appliances.zNumber"
    }
  ],
  "attachmentIds": ["attachment-1"],
  "issueIds": [],
  "eventIds": [],
  "purchasableIds": [],
  "conversationIds": []
}
```

### Multiple-Thing import example

```json
{
  "id": "import-1",
  "status": "awaiting_selection",
  "candidates": [
    { "id": "candidate-1", "name": "Dishwasher", "categoryId": "appliances" },
    {
      "id": "candidate-2",
      "name": "Appliance protection policy",
      "categoryId": "insurance"
    }
  ]
}
```

Confirmation body: `{"selections":[{"candidateId":"candidate-1","targetThingId":null}]}`. Omitted candidates are not created. `null` creates a new Thing, reusing the import-created skeleton first; an existing authorized ID updates that Thing. Full states: `queued`, `extracting`, `awaiting_selection`, `mapping`, `discovering`, `complete`, `incomplete`, `failed`. Completed results return `thingIds`; Thing updates arrive over SSE. `GET /imports/{id}` supports reload and selection recovery.

### Activity and assistant examples

```json
{
  "event": {
    "id": "event-1",
    "thingId": "thing-1",
    "title": "Clean the dishwasher filter",
    "status": "suggested",
    "startsAt": null,
    "sourceRefs": [{ "attachmentId": "manual-1", "page": 12 }]
  },
  "issue": {
    "id": "issue-1",
    "thingId": "thing-1",
    "title": "Dishwasher does not drain",
    "status": "open"
  },
  "purchasable": {
    "id": "purchase-1",
    "thingId": "thing-1",
    "kind": "consumable",
    "name": "Dishwasher salt",
    "merchantUrl": "https://example.com/dishwasher-salt",
    "priceAmount": null,
    "currency": null
  },
  "message": {
    "id": "message-1",
    "role": "assistant",
    "text": "The manual recommends cleaning the filter. A maintenance suggestion is ready to schedule.",
    "status": "complete",
    "cards": [
      { "type": "attachment", "attachmentId": "manual-1", "page": 12 },
      { "type": "event", "eventId": "event-1" }
    ]
  }
}
```

Examples are illustrative; discovery must supply real sources and merchant links. Event scheduling uses `PATCH /events/event-1` with `{"status":"scheduled","startsAt":"2026-10-01T09:00:00Z"}`. UI date/time input uses the user's timezone; store instants in UTC. Upcoming/past cards use the Events API without a separate Timeline view.

## UI views

| View              | Scaffold behaviour                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login             | Logto login/register flow and authenticated app shell                                                                                                                                                                                                                                                                    |
| Things dashboard  | Up to three active issues and upcoming events; search, category counts, tag filters, recent Things, add/start-chat actions; empty states                                                                                                                                                                                 |
| Add Thing         | Paste text or choose file/photo; after upload/import acceptance navigate directly to the skeleton Thing. Show candidate selection only when several Things are detected                                                                                                                                                  |
| Thing view/editor | Populate progressively through SSE: source/discovered documents, fields, active issues, suggested tasks, upcoming/past events, purchasables grouped as consumables/accessories/upgrades, start-chat action. Name/category/image, pins and set sections; fields read-only during initial processing, then inline editable |
| Chat / Assistant  | Start from dashboard or Thing; active multi-message conversation, streamed responses, cited documents and interactive resource cards; loading/error/retry states. No previous-conversation list/resumption                                                                                                               |

Use inline controls on cards to schedule/complete an Event or resolve an Issue. Chat cards can open a Thing, highlight a field, open a document, schedule an Event, or open a merchant link. No separate Field details, tag management, Timeline or Insights screens. Tags remain available for filtering and basic assignment within the Thing editor.

Section heuristic, implemented in one frontend helper:

- Collapse an unbranched inclusion chain into a section labelled by the more specific set: Van + Vehicle.
- Preserve sibling sections: a policy including Buildings and Contents shows both sections; policy-level fields retain their own section.
- Keep loosely related sets separate. Display a dependency used by several sections once as its own section.
- Return every selected set, its field ownership, ordered fields and relation IDs. The frontend can change grouping without changing storage or losing a field's edit target.
- Render all declared fields; show empty values as editable prompts. Pins reference the same values displayed in sections.

## Execution: three steps

### 1. Foundation and manual Things

- Scaffold Angular/Fastify, Logto, local Postgres/blob storage, migrations, OpenAPI generation and validation commands.
- Seed categories and a small registry covering Neff/Bosch appliances, vehicle/car/van, buildings/contents insurance, and one membership.
- Implement registry reads, owner-scoped Thing/tag CRUD, top-level attachments and links, issues/events/purchasables, conversation/message storage, and a basic dashboard/detail/editor.
- Check login, owner isolation, value validation, empty fields, and independent buildings/contents sums insured.

### 2. Progressive import and discovery

Implemented locally (29 September). OpenAI provider approved through `OPENAI_API_KEY`/`OPENAI_MODEL` configuration. Source uploads, persisted selection/retry, validated registry mapping, Thing SSE and cited discovery are available. Discovery downloads up to three cited PDF manuals/specification documents into private attachments, with URL/DNS/redirect checks, size limits and deadlines; HTML snippets are not saved as text attachments. Names favour brand and product type, can be refined by cited model discovery, and use owner-local collision checks without overwriting user names. The Thing shows animated indeterminate progress above its heading; photo/file inputs use icon buttons. Extracted facts and import states persist across restarts; interrupted jobs require retry.

Validation: recorded synthetic extraction/mapping plus fixtures for Z-number, van dependencies, combined policy, unknown fields, multi-Thing confirmation, invalid IDs, tool limits and retry. Integration/browser checks cover owner isolation, source sharing, user edits, discovery deduplication, SSE reconnect and restart recovery. `scripts/smoke-import.ts` runs a live synthetic check and records usage in `test-results/import-smoke.json`. Physical camera capture and live Logto redirect checks remain manual.

- Implement import of things from unstructured source data powered by AI (take photo, choose photo from camera roll, paste something, or upload file)
- Implement immediate skeleton thing creation, persisted import states, source extraction, candidate confirmation, the two registry tools, mapping and progressive transactional persistence.
- Add Thing SSE, reconnect snapshots, and bounded discovery of manuals/model data, maintenance suggestions and purchasables.
- Preserve extracted content and unmatched facts; enforce tool/time limits and retry-safe results.
- Use small recorded fixtures plus a live smoke run: Z-number, van inclusion, combined policy, unknown field, two Things from one source, and failed-job retry.
- Inspect tool traces, token use and elapsed time; verify that identifiers remain strings and arbitrary model IDs cannot enter storage.

### 3. Assistant, usable UI and handoff

Implemented locally (29 September). Dashboard/Thing chat entry points create an active conversation with streamed answers, masked record reads, private attachment reads, focused discovery and typed resource cards. The message Action control selects answer/Event/Issue intent; application code enforces that intent before a write. Events start suggested and can be scheduled on the card. One persisted runner serves imports and messages. Request IDs, atomic write receipts, discovery receipts and interruption recovery prevent duplicate results on retry. Previous-chat browsing/resumption remains deferred.

Field grouping collapses unbranched inclusion chains while preserving sibling/shared sections and field ownership. All fields and pins retain their edit targets. Purchasables are grouped by kind. Thing streams refresh chat-created Events and Issues.

Validation: generated-contract check, lint, development/production types, unit tests and build; database integration checks for owner isolation, shared attachments, intent checks, deadlines, retry, discovery reuse, SSE and restart; desktop/mobile browser checks for cited cards, scheduling and Thing reload. Paid synthetic checks with `gpt-5.6-sol` verified import → cited Z-number answer → maintenance creation/scheduling → restart, plus three cited merchant links from a separate product-focused Miele query. The hob import returned no products. Reports are ignored local artifacts under `test-results/`; commands and limits are in README. Live Logto redirects and physical camera capture remain manual and were not repeated for this step.

- Finish direct-to-Thing upload/confirmation flows, section grouping, all-field rendering, pinning, activity/purchasable cards and error recovery.
- Implement dashboard/Thing chat entry points, grounded read/discovery tools, Event/Issue write tools, resource cards and streamed responses; no previous-chat resumption.
- Add meaningful integration checks for inclusion/sibling grouping, shared attachments, user-edit preservation, duplicate-free retry, SSE reconnection/owner isolation, and chat-created Events appearing on the Thing.
- Run generated-contract checks, lint, types, tests and build; use `CI=true` for Angular CLI and wrapper commands in the macOS sandbox.
- Document startup, environment variables, seed editing, supported file limits and deferred features. Demo login → upload → progressively populated Thing → cited answer → scheduled maintenance → consumable/upgrade link → reload.

The local real-AI flow and restart persistence have been verified with synthetic data; live identity redirects remain a manual handoff check. Hosted deployment, sharing, checkout, calendar sync and conversation history remain subsequent work.
