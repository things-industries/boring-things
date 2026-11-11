# Tasks, Events and Thing dates

## Domain

- Tasks are actions the owner performs. They carry importance, optional scheduled and deadline dates, optional recurrence, citations and chat followups.
- Events are appointments, visits and deliveries. They carry a date or start timestamp, an optional end timestamp, an optional issue and chat followups.
- Issues connect related work. Resolving an issue closes every linked Task and Event, including suggested and generated Tasks. Reopening the issue leaves those records closed.
- Thing dates derive from populated date fields, including custom date values. Today and future dates appear in the timeline. Sensitive values remain masked.
- A Subscription is a Thing representing an ongoing agreement with recurring payments. Its individual visits can be Events.

## Lifecycle

Tasks start as `SUGGESTED` or `ACTIVE`. Accepting a suggestion invokes the scheduling AI task and makes it active. Completing an active Task records the server's current `completedAt` and generates its next occurrence when configured. Sending the first owner message in a followup conversation or dismissing the followup closes the Task and records `closedAt`. A chat followup records `conversationId` and `completedAt` in `completedFollowup`. Closed records stay available for history. Tasks can be deleted in every state.

Task edits affect the selected occurrence. A completed Task can be unchecked until followup or dismissal closes it. Unchecking removes its unedited successor unless a later occurrence was completed. Accepted Tasks cannot return to suggestions. Status transitions use the accept, complete, reopen and close operations; ordinary edits update task properties.

Events use `SCHEDULED` and `CLOSED`. A timed Event ends at its end timestamp, or its start timestamp when no end is supplied. A date-only Event ends after its local calendar day. Ended Events offer chat followup until the first owner message or dismissal closes the Event and records `closedAt`.

## Dates and importance

- `scheduledOn` is the date under which a future Task appears. A missing or passed scheduled date places it under Today.
- `deadlineOn` is the hard due date. Only a passed deadline makes an active Task overdue.
- A scheduled date cannot follow a deadline.
- The schedule editor explains deadline and recurrence conflicts and requires the owner to remove one before saving.
- Importance is `CRITICAL`, `IMPORTANT`, `RECOMMENDED` or `NICE_TO_HAVE`. It controls prominence and ordering within task groups.
- Task suggestions describe ideas and documented recurrence intervals. Absolute dates are chosen on acceptance.
- Accepting a suggestion runs `ScheduleTask`, using the saved Task, Thing details, work history and local date. Unknown dates stay null. A deadline needs evidence of an obligation, expiry or user request. An evidenced deadline removes recurrence on acceptance. Scheduling failures leave the suggestion unchanged and can be retried.

## Recurrence

Recurrence has an integer interval, a `DAY`, `WEEK`, `MONTH` or `YEAR` unit, and a `COMPLETION` or `SCHEDULED` basis. Tasks with a deadline cannot recur. Active recurring Tasks require `scheduledOn`. Suggestions provide an interval with no dates and initially use completion-based recurrence. Acceptance chooses their dates, and the owner can edit the recurrence basis.

- Completion-based recurrence sets the next scheduled date to completion date plus interval.
- Scheduled-date recurrence advances the scheduled date from its original reference, so 31 January, 28 February and 31 March stay on the same monthly cadence. Missed occurrences are skipped until the next scheduled date is in the future.
- `referenceTaskId` identifies the original occurrence. Private saved reference dates keep calculations independent of later edits or deletion of that record. Edits affect the selected occurrence and keep its original recurrence references.
- Completion locks the Task and creates one successor in the same transaction. Repeated completion returns the completed record without generating another successor.
- The successor copies importance, issue, recurrence and citations. Closing or deleting an occurrence ends that occurrence without creating more work.

## Followups

Every completed Task and ended Event offers **How did it go?** and **Dismiss**, independently of how it was created. Opening followup chat creates or reuses one conversation with the item and linked Issue context. Opening an empty chat leaves the item pending. The first owner message records `completedFollowup: { conversationId, completedAt }` and closes the item in the message transaction. Later messages continue the same conversation. Dismissal closes the item without recording a followup.

`POST /api/conversations` accepts `taskId` or `eventId`, with `followup: true` for followup chat. Ordinary Ask uses item context without closing or recording a followup. Chat discusses the outcome using its existing tools; field updates, uploads and Issue resolution through chat are future work. Recurring occurrences have independent followup conversations.

## Timeline

Today and Tomorrow always appear. Upcoming expands to later dates. A Thing's tasks page shows every future date group. Suggestions appear separately by importance.

Today starts with unscheduled and overdue Tasks. Events and Thing dates follow, then other active Tasks. Task groups sort by importance. Completed Tasks and ended Events appear under **How did it go?**, including on later days. Sending the first followup message or dismissing an item removes it.

The browser reads persisted Tasks, Events and Thing dates. The server generates recurrence and sample records. Conversation cards distinguish Tasks from Events.

## Delivery and validation

The schema migration deletes pre-existing Events and creates Tasks; historical records do not need conversion. Run `pnpm db:migrate` before using the changed API. Existing chat cards can identify deleted resources as unavailable. Migration `20261110151123_task_deadlines_exclude_recurrence.sql` keeps deadlines and removes conflicting recurrence in every Task state, and renames remaining `DEADLINE` recurrence bases to `SCHEDULED`.

Migration `20261110161827_chat_followups.sql` removes completion-action columns and adds Event followup recording. Historical Task followup timestamps remain, with a conversation link where available; `conversationId` is null for historical followups without a chat. Run `pnpm db:migrate` before restarting the app.

Run `CI=true pnpm check`, `pnpm test:integration` and `pnpm test:e2e`. Unit and integration tests are under `server/test/`. Scheduling tests and browser tests use fixtures. Metered AI checks require approval for each invocation.
