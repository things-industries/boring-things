# Frontend design

The [POC Figma file](https://www.figma.com/design/SV6xV538vbD2Vn5f1EF1rR/Boring-Things-POC?node-id=0-1) is the design reference. Use the [frontend guide](../../src/AGENTS.md) for implementation and the [style cheatsheet](../../src/styles/CHEATSHEET.md) for tokens, typography and shared patterns.

| Screen                    | Figma node | Route                 |
| ------------------------- | ---------- | --------------------- |
| Sign in                   | `9:2202`   | `/login`              |
| Home                      | `9:2243`   | `/`                   |
| Add Thing                 | `9:2362`   | `/things/new`         |
| Thing detail, discovering | `27:19`    | `/things/:id`         |
| Thing detail, processing  | `23:610`   | `/things/:id`         |
| Thing detail              | `9:2481`   | `/things/:id`         |
| Status summary concept    | `9:2507`   | Thing detail          |
| All details               | `9:2642`   | `/things/:id/details` |
| Thing chat                | `9:2771`   | `/things/:id/chat`    |
| Global chat               | `9:2776`   | `/chat`               |

## Decisions

- Design for the phone frame. Wider screens centre the same column using the max-width token. Snap Figma values to the shared Sass tokens. Use the standard palette in chat and map Figma icons to Remix. The route controls bottom navigation through `bottomNav` data.
- Use the same top bar and back control across routes. Both chat entry points use the title **Assistant**. Render Thing cards above the answer and other resource cards below it. Shared list rows stretch the title link and keep trailing buttons separate.
- Give paste text and manual creation their own Add Thing routes so the browser back button returns to the option tiles. Thing detail can show import progress as values arrive. Field pins refer to the same field occurrences as All details.
- Put details absent from the frames in existing controls. Field pins, reveal and delete belong to the field row menu. Edits to fields and sections belong in All details. Thing actions belong in the Thing overflow menu. Image selection, unlink and delete belong in the Attachment row menu. Use the relevant record cards for activity actions and Profile for sign out and sample data.
- The status summary concept has a component and awaits backend data. Controls for future capabilities can use a labelled placeholder or disabled action. [Frontend mocks](../../src/app/core/mocks/README.md) lists the remaining API seams.

## Follow-up

Use [Milestones](../requirements/roadmap/MILESTONES.md) for scope. The original plan also linked issues for [Apple sign-in](https://github.com/things-industries/boring-things/issues/16), [Terms and Privacy pages](https://github.com/things-industries/boring-things/issues/17), [Issues list](https://github.com/things-industries/boring-things/issues/18), [compatible products list](https://github.com/things-industries/boring-things/issues/20), [chat attachments](https://github.com/things-industries/boring-things/issues/21) and [chat overflow](https://github.com/things-industries/boring-things/issues/22). Check the issue before resuming work.

Manual checks include Logto login, callback and logout, and phone camera capture. On a phone, check import progress and the sheet transition, chat auto-scroll and the composer above the keyboard. Check Enter-to-send, clipboard copy and toast announcements with a screen reader. Use the [validation guide](../../README.md#validation) for automated checks.
