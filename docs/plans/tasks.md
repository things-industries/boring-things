# Tasks screen

Replaces the Timeline placeholder with the Tasks screen from Figma ([Tasks frame](https://www.figma.com/design/SV6xV538vbD2Vn5f1EF1rR/Boring-Things-POC?node-id=125-1963), overflow menu frame `127:523`). The backend does not support it yet: #100 delivers the contract, and the frontend builds against labelled mocks until it lands.

## Decisions

- **Task is a new entity**, separate from Event. Events become appointments (for example "Engineer visit"); Tasks are things the owner does. Import and chat suggestions move from `Event` (status `SUGGESTED`) to `Task`.
- **Thing events** (for example "Car insurance expires") are derived by the backend from DATE fields on a Thing, such as `common.warrantyEnds` or an insurance renewal date. They are read-only and are not stored as Events.
- **Recurring tasks** show once, at their next occurrence. Completing one creates the next occurrence; unchecking it removes that occurrence and reopens the task.
- **Delete task** returns the task to `SUGGESTED`, so it appears under the Thing's suggested tasks and can be scheduled again.
- **Completed items** stay in their day group, tinted, with their follow-up button, until the day passes.
- **Past items**: open tasks that are past due roll into Today's overdue block. Past Events without an open follow-up, past Thing events and items completed before today are not shown. Surfacing older follow-ups elsewhere is a separate Frontend issue.
- **Upcoming** shows everything scheduled after tomorrow, collapsed by default, revealed in pages with **Load more**.
- **Route**: `/tasks` with label **Tasks** replaces `/timeline`; no redirect.

## Screen behaviour

### Item types

| Type        | Primary action                                                          | Time line                                                                                                         |
| ----------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Task        | Check / uncheck                                                         | Overdue status, else deadline countdown ("Due in 10 days · 18 Oct"), else interval ("Every 12 months"), else none |
| Event       | Check / uncheck only when it has a follow-up; otherwise a calendar icon | Time of day ("14:00–16:00"); none for all-day                                                                     |
| Thing event | None (calendar icon)                                                    | None                                                                                                              |

- Overdue status uses the warning colour and clock icon: "Yesterday", "2 days ago", measured from the scheduled date or a passed deadline.
- Critical tasks show the flag after the title. Other priorities show no marker.
- The overflow menu offers **Ask** (chat with task context), **Reschedule**, **Go to Thing** and **Delete task**. Thing events offer **Ask** and **Go to Thing** only.
- When a completed item has a follow-up, a button appears under the title (Figma "How did it go?"). A `CHAT` follow-up opens the Thing chat with the task context. An `UPDATE_FIELD` follow-up opens a dialog with the question and an input for the target field. An `ADD_DOCUMENT` follow-up opens a dialog with the question and a file picker; the upload is linked to the Thing.
- **Reschedule** opens a dialog with the next due date and whether the task repeats: Once, or Repeats every number of days, weeks, months or years.
- Adding a suggested task (Thing page or a chat card) schedules it straight away; the backend chooses the day, and the owner can reschedule it.

### Layout and order

- Sections: **Today** and **Tomorrow** always render, with an empty state when they have no items. **Upcoming** is a collapsible section grouped by date, under month boundaries, on the connected timeline line.
- Order within a day:
  1. Events and Thing events, by start time (all-day first).
  2. Open and completed tasks due that day, by priority: critical, important, recommended, nice-to-have; then by title.
  3. Today only: overdue tasks, by priority, then oldest first.
- **Load more** reveals the next 10 date groups. Collections already load in full once per session (`docs/plans/app-state.md`), so paging is client-side; the API paging stays unchanged.

## Backend issue

#100 `Tasks: add the Task entity, Thing date events and follow-ups`. Supersedes #11 and #19.

Contract, using existing component names where they exist:

```jsonc
// GET /api/tasks?status=&thingId=&from=&to=   (paged like /api/events)
// POST /api/tasks, GET /api/tasks/{id}, PATCH /api/tasks/{id}
// Task
{
  "id": "uuid",
  "thingId": "uuid",
  "issueId": null,
  "title": "Renew car insurance",
  "description": "",
  "status": "SCHEDULED", // SUGGESTED | SCHEDULED | COMPLETED
  "priority": "CRITICAL", // CRITICAL | IMPORTANT | RECOMMENDED | NICE_TO_HAVE
  "kind": "OTHER", // CLEANING | INSPECTION | REPAIR | REPLACEMENT | SERVICE | OTHER (from #11)
  "scheduledOn": "2026-10-08", // day the task sits in the list; null while SUGGESTED
  "deadlineOn": "2026-10-18", // optional hard deadline
  "recurrence": { "interval": 12, "unit": "MONTH" }, // DAY | WEEK | MONTH | YEAR, nullable
  "followUp": {
    "type": "UPDATE_FIELD", // CHAT | UPDATE_FIELD | ADD_DOCUMENT, nullable
    "prompt": "When does the new policy end?",
    "fieldId": "uuid", // UPDATE_FIELD only: the Thing field to update
    // ADD_DOCUMENT only: "documentType", an AttachmentDocumentTypeEnum value
  },
  "completedAt": null,
  "sourceRefs": [],
  "isSample": false,
}
```

- Completing a recurring task stores `completedAt` and creates the next occurrence with `scheduledOn` set to the interval after the later of `scheduledOn` and the completion date. Reopening it (status back to `SCHEDULED`) deletes that generated occurrence if it is still unchanged. The response returns both tasks.
- Rescheduling patches `scheduledOn` and `recurrence`.
- Scheduling a suggested task patches `status: SCHEDULED` without `scheduledOn`; the server chooses the day.
- `Event` gains `endsAt` (nullable date-time, for "14:00–16:00") and the same nullable `followUp`. An Event with a follow-up accepts `status: COMPLETED`.
- `GET /api/thing-dates?from=&to=` returns derived Thing events: `{ thingId, fieldId, label, date }` from DATE fields whose definitions are marked as deadlines (warranty end, renewal, expiry). Registry seeds mark those definitions.
- `POST /api/conversations` accepts an optional `taskId` or `eventId`, so **Ask** and `CHAT` follow-ups open a conversation that starts with that context.
- Migration: existing `SUGGESTED` and suggestion-derived Events move to `bt.tasks`. Discovery and the chat `create_event` tool create Tasks for maintenance work, with priority and recurrence when the source gives them.
- Sample data includes tasks of each priority, a recurring task, a deadline task, an Event with a follow-up and a Thing with an upcoming warranty end.

## Frontend plan

Each stage is one commit, with `pnpm format` and `CI=true pnpm check` passing.

1. **Route and naming.** Rename `features/timeline` to `features/tasks` (`TasksPage`, `tasks.page.*`), route `/tasks`, `APP_TERMS.tasks`, nav icons `navTasks`/`navTasksActive` (Remix `task` / checkbox icons), bottom nav and Home **View Tasks** link. Update e2e selectors.
2. **Contract and mocks.** Add `Task`, `ThingDate`, `FollowUp` and `TaskPriority` interfaces in `app/interfaces/task.interface.ts`, shaped like the proposed contract so the swap is a type change. Add `core/mocks/tasks.mock.ts` (header naming #100). Until #100, a Task is a date-only Event (`startsOn`, or no date while suggested) and an appointment is a timed Event (`startsAt`), so status and date changes persist through `/api/events`. The mock fills priority, kind, recurrence and follow-ups from the title and description, deadlines and `UPDATE_FIELD` follow-ups from the Thing's deadline dates, and Thing dates from DATE field values whose names mention an end, expiry or renewal. Interval changes and links to generated occurrences last for the session only. Record the mock in `poc-frontend-progress.md`.
3. **State.** `TasksStore` in `core/state/` exposes the task collection and `complete`, `reopen`, `reschedule` and `unschedule`; until #100 it maps `EventsStore` through the mock, then it becomes a `withEntityCollection` store over a `TasksService`. Cross-store read model `core/state/views/agenda.view.ts` merging tasks, events and Thing dates into day groups with the ordering rules above; pure ordering and grouping helpers in `app/utils/agenda.util.ts` with Node unit tests.
4. **Task card.** `components/task-card/` (`bt-task-card`): primary action (check/uncheck or type icon), title with critical flag, time line, follow-up button and overflow menu built on `bt-menu`. Tinted completed state. Styles from `styles/CHEATSHEET.md` tokens; add a warning text class if missing.
5. **Tasks page.** Connected timeline with day points, Today/Tomorrow with empty states, collapsible Upcoming with month headings and **Load more**, loading skeleton and inline `bt-error-message` with Retry.
6. **Reschedule dialog.** `features/tasks/reschedule-dialog/` on `bt-dialog`: **Next due date**, and **Repeats** (Once or Repeats); Repeats reveals **Every** with a number and a days, weeks, months or years select.
7. **Follow-ups and Ask.** `CHAT` follow-up and **Ask** navigate to `/things/:id/chat` and start a conversation with the task context (mocked as a first user message until `taskId` is accepted). `UPDATE_FIELD` dialog on `bt-dialog`: date fields patch the Thing value through `ThingsStore.update`; document fields upload through the existing attachment flow and link to the Thing.
8. **Thing detail.** **Suggested tasks** read `TasksStore`, and completing an upcoming task goes through it so recurring tasks get their next occurrence. **Upcoming tasks › See all** goes to `/tasks?thingId=…`, which filters the page to that Thing with a clear-filter control. **Suggested tasks › See all** stays disabled: the Tasks page lists scheduled work only.
9. **Docs and tests.** Update `README.md`, `PRODUCT.md` Timeline section, `src/AGENTS.md` if structure changed. Playwright journey: open Tasks, complete and uncheck a task, reschedule, delete back to suggested, expand Upcoming and load more, answer a follow-up. Screenshots at phone and desktop widths.

## Related issues

- #100 Backend contract (this plan's mocks are removed when it lands).
- #101 Surface open follow-ups on the Thing page and Home.
- #98 Events (inc tasks) experience.
