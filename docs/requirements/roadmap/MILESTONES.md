# Milestones

[Product requirements](../product/PRODUCT.md) define the journeys. The root [README](../../../README.md) describes what runs today. The [9 November kickoff](../../meeting-notes/2026-11-09%20sprint%202%20kickoff.md) records the sprint review target of 18 November and the demo target of 4 December.

## Planned MVP scope

- **Import.** Add disambiguation when a submission could refer to several Things. The current workflow accepts several Attachments and processes one Thing to keep the MVP simple. Improve large photo uploads and support email forwarding.
- **Households and onboarding.** Create a Household Thing and use a questionnaire about utilities, devices, appliances, vehicles and memberships. Allow skeleton Things with missing identifiers, and use Home followups to ask for the missing details. Household onboarding can work before collections ship.
- **Collections and sharing.** Evolve tags into collections with a featured Thing, usually the household. Add Things explicitly to control what is shared. Support sharing a collection and publishing a chosen inventory.
- **Tasks, Events and Issues.** Exercise tasks and separate one-off appointments or visits, including a tradesperson visit. Surface open Issues on Home and the Thing. Give an Issue a full-screen view with notes and attachments grouped under its Thing. Start with one Thing per Issue. Followups ask for the outcome so it can inform a field change or attachment. Structured outcomes and file upload extend the existing chat followup.
- **Assistant.** Add a conversation browser and an explicit choice to continue a chat or start a new one. The API already lists conversations, and Thing chat can resume the most recent conversation. Support attaching files in chat.
- **Purchasables.** Compare prices for compatible products and add affiliate links. Keep the evidence for compatibility with each recommendation.

The sprint also identified support email fields, UK vehicle lookup, a full-screen task suggestion list, field and task editing, hiding empty sections and button layout. See the kickoff notes for the original sprint targets.

## Later

- Process several Things from one Import. Consider candidate selection, separate confirmation of each match and policies for conflicting evidence.
- Add a dedicated Issue creation form. Explore mailbox mining and Open Banking.
- Explore recurring cost analysis, savings opportunities, Thing values, insurance gaps, duplication and unused items. Add export and reports.
- Explore resale, upgrades, fulfilment, subscriptions, service booking and billing, and service bundles.
