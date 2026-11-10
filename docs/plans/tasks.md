# Tasks, Events and Thing dates

## Domain

- Tasks are actions the owner performs. They carry importance, optional scheduled and deadline dates, optional recurrence, citations and followups.
- Events are appointments, visits and deliveries. They carry a date or start timestamp, an optional end timestamp, an optional issue and followups.
- Issues connect related work. Resolving an issue closes every linked Task and Event, including suggested and generated Tasks. Reopening the issue leaves those records closed.
- Thing dates derive from populated date fields, including custom date values. Today and future dates appear in the timeline. Sensitive values remain masked.
- A Subscription is a Thing representing an ongoing agreement with recurring payments. Its individual visits can be Events.

## Lifecycle

Tasks start as `SUGGESTED` or `ACTIVE`. Accepting a suggestion invokes the scheduling AI task and makes it active. Completing an active Task records the server's current `completedAt` and generates its next occurrence when configured. Completing one followup or dismissing the options closes the Task and records `closedAt`. A chosen followup also records its action and timestamp in `completedFollowup`. Closed records stay available for history. Tasks can be deleted in every state.

Task edits affect the selected occurrence. Completion is final. Accepted Tasks cannot return to suggestions. Status transitions use the accept, complete, followup and close operations; ordinary edits update task properties.

Events use `SCHEDULED` and `CLOSED`. A timed Event ends at its end timestamp, or its start timestamp when no end is supplied. A date-only Event ends after its local calendar day. Ended Events offer followups until dismissal records `closedAt`.

## Dates and importance

- `scheduledOn` is the date under which a future Task appears. A missing or passed scheduled date places it under Today.
- `deadlineOn` is the hard due date. Only a passed deadline makes an active Task overdue.
- A scheduled date cannot follow a deadline.
- Importance is `CRITICAL`, `IMPORTANT`, `RECOMMENDED` or `NICE_TO_HAVE`. It controls prominence and ordering within task groups.
- Task suggestions describe ideas and documented recurrence intervals. Absolute dates are chosen on acceptance.
- Accepting a suggestion runs `ScheduleTask`, using the saved Task, Thing details, work history and local date. Unknown dates stay null. A deadline needs evidence of an obligation, expiry or user request. Scheduling failures leave the suggestion unchanged and can be retried.

## Recurrence

Recurrence has an integer interval, a `DAY`, `WEEK`, `MONTH` or `YEAR` unit, and a `COMPLETION` or `DEADLINE` basis. Active recurring Tasks require at least one date. Suggestions provide an interval with no dates and initially use completion-based recurrence. Acceptance chooses their dates, and the owner can edit the recurrence basis.

- Completion-based recurrence sets the next deadline to completion date plus interval. The scheduled date keeps the just-completed Task's lead time in calendar days. When only a scheduled date exists, it becomes completion date plus interval and the deadline stays absent.
- Date-based recurrence advances each populated date from its original reference, so 31 January, 28 February and 31 March stay on the same monthly cadence. Missed occurrences are skipped until the next deadline, or scheduled date when no deadline exists, is in the future.
- `referenceTaskId` identifies the original occurrence. Private saved reference dates keep calculations independent of later edits or deletion of that record. Edits affect the selected occurrence and keep its original recurrence references.
- Completion locks the Task and creates one successor in the same transaction. Repeated completion returns the completed record without generating another successor.
- The successor copies importance, issue, recurrence, followups and citations. Closing or deleting an occurrence ends that occurrence without creating more work.

## Followups

`completionActions` is the ordered list offered after a Task completes or an Event ends. A Task closes after the first successful option; Events offer options until dismissal:

- `UPDATE_FIELD`: ask for a value using the field's set and definition address, or its custom field ID.
- `ADD_ATTACHMENT`: upload a file linked to the Thing; document type is optional.
- `RESOLVE_ISSUE`: resolve the linked issue and close all of its associated work.
- `CHAT`: start a conversation with the item and issue context. Send the saved opening prompt when present.

Task field, attachment and issue actions use `POST /api/tasks/{id}:followup`, applying the answer and closing the Task in one transaction. Chat creation closes the Task when it starts a saved followup. Event answers use the Thing and attachment operations. Changes take effect only after the user submits them.

## Timeline

Today and Tomorrow always appear. Upcoming expands to later dates. A Thing's tasks page shows every future date group. Suggestions appear separately by importance.

Today starts with unscheduled and overdue Tasks. Events and Thing dates follow, then other active Tasks. Task groups sort by importance. Completed Tasks and ended Events with followups appear under **How did it go?**, including on later days. Completing a Task followup or dismissing an item removes it.

The browser reads persisted Tasks, Events and Thing dates. The server generates recurrence and sample records. Conversation cards distinguish Tasks from Events.

## Delivery and validation

The schema migration deletes pre-existing Events and creates Tasks; historical records do not need conversion. Run `pnpm db:migrate` before using the changed API. Existing chat cards can identify deleted resources as unavailable.

Run `CI=true pnpm check`, `pnpm test:integration` and `pnpm test:e2e`. Unit and integration tests are under `server/test/`. Scheduling tests and browser tests use fixtures. Metered AI checks require approval for each invocation.
