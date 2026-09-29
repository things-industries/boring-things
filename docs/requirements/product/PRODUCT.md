# Product

Boring Things is an AI that helps people track and manage life administration across appliances, memberships, subscriptions, utilities, and service providers, by finding manuals, answering questions, scheduling repairs and maintenance, offering upgrades, and more.

This document describes the problem Boring Things sets out to solve, and the features and product experience that addresses those needs.


## Problems, goals and scope

People do not have a reliable system to stay on top of the minutiae of their lives:

- Home emergencies require immediate access to device model, manual, warranty, and service history information, which are difficult to find in moments of stress
- Membership and subscription details are fragmented across apps, inboxes, and paper trails.
- Simple problems can feel intractable and lead to a sense of powerlessness
- The stress associated with administration can often lead to procrastination and anxiety

Boring things aims to:

- Reduce time spent hunting for details (membership status, appliance model, service history).
- Surface insights and anomalies (e.g., unusually high bills, subscription totals).
- Be able to solve problems quickly and knowledgeably
- Provide proactive support when something needs attention
- Require minimal input from the user

## Personas

- **Busy independents**
  Millennials / genZ with complex, busy lives, and regular turnover of Things.  Curious and keen to try new ideas, anxious about being left behind.

- **Families**
  Adults with children at home, large footprint of appliances, household utilities, insurance, and shared subscriptions.  Juggling work with childcare and a complex schedule.

- **Vulnerable and carers** (secondary)
  Elderly or vulnerable adults who are overwhelmed with the complexity and volume of things that make up modern life. Want to retain their independence, reduce worries and avoid imposing on family members or carers.


## Use cases

Use cases have a few noticeable themes: 

* _truth-on-demand_ (access to known pieces of boring data very quickly), 
* _problem solving_ (figuring out a solution to a problem by consulting a broad set of boring information), 
* _preparedness_ (not forgetting to do the boring stuff that prevents problems occurring in future), and 
* _optimisation_ (using a comprehensive understanding of boring things to make smarter decisions or simply feel more in control of life).

### Confirming what you already have (truth on demand)

Bradley sees an ad for an exhibition at the Design Museum and cannot remember whether his membership is still active. He asks Boring Things and gets an immediate answer: yes, it is active until October, here is the membership number, and here is the email where the renewal receipt was found. Variants on the same use case include checking whether breakdown cover is still valid before a long drive, confirming whether a child still has an active swimming pass before heading to the pool, or finding the account number for a utility provider while on the phone to customer support.

### Solving frustrations (problem solving)

Daisy notices that her oven clock is flashing and displaying the wrong time. She asks Boring Things how to set the time and gets a brief, to-the-point set of instructions based on the official manual that Boring Things has already found and stored. John keeps being told by family to use Face ID on his phone, wants to do it, but cannot work out how. He asks Boring Things and is told why it is not working for him: the model of iPhone he has does not support Face ID, so the option simply is not available. Other versions of this use case include pairing a remote with a television, resetting a router, finding the right descaling steps for a coffee machine, or working out which replacement battery a doorbell camera needs.

### Acting quickly in an emergency (problem-solving)

Priya’s boiler stops working on a cold evening and she needs help without first hunting through cupboards and inboxes. Boring Things can tell her the boiler model, when it was installed, when it was last serviced, whether it is still under warranty, and which engineer serviced it most recently, so she can decide whether to call that engineer, the manufacturer, or her landlord. The same pattern applies to a leaking washing machine, or a car that will not start.

### Investigating unexpected costs or anomalies (optimisation)

Marcus notices that the water bill feels much higher than usual but cannot remember what normal looks like, whether there was a recent meter reading, or whether the tariff changed. He asks Boring Things if the bill is unusual and gets an answer that compares recent bills, highlights the jump, and points to possible causes such as a price rise, a larger-than-normal reading, or a leak that might be worth checking. Variants include spotting an extra streaming subscription that nobody in the family uses, noticing that mobile roaming charges appeared after a trip, or understanding why the electricity bill rose after a new appliance was installed.

### Seeing where the money goes (optimisation)

Leila wants to feel more in control of recurring spending without building her own spreadsheet. Boring Things can show her how much she pays each month across subscriptions, memberships, insurance, utilities, and finance agreements, group them by category, and call out things that look duplicative, dormant, or close to renewal. A related version is preparing for a tighter month by asking what can be paused or cancelled quickly, or checking the total annual cost of a hobby or household service that has gradually expanded over time.

### Staying ahead of maintenance and admin (preparedness)

Tom cannot remember when the windows were last cleaned, who did the work, or whether the dryer filter, boiler service, and home insurance renewal are all due around the same time. Boring Things keeps a record of past maintenance, answers those questions on demand, and nudges him before important tasks slip. Variants include reminding a parent when school club renewals open, prompting a car owner to book an MOT before availability becomes tight, or telling a renter when to replace water filters, smoke alarm batteries, or other easy-to-forget household items.

### Preserving household memory across people (truth on demand)

Hannah usually remembers everything about the house, but when she is away her partner needs to know which plumber fixed the upstairs leak, what broadband package they are on, and where the warranty paperwork for the washing machine lives. Instead of texting her a list of questions, he asks Boring Things and gets the answers from the household record. Variants include adult children helping an older parent from a distance, a flatshare trying to keep track of shared bills and repairs, or a carer needing access to the right service details without depending on one person’s memory.

### Making better repair, replacement, and upgrade decisions (problem solving)

Nina has a dishwasher that still works but is unreliable, expensive to run, and awkward to repair. Boring Things can combine its existing knowledge of the appliance with service history, age, warranty status, and replacement options to help her decide whether to repair it again, replace it now, or wait. Other versions include deciding whether to renew a premium membership tier, upgrade to a cheaper mobile plan with the same features, or replace an ageing mattress, laptop, or vacuum cleaner with something that better fits current needs and budget.


## Intersection with adjacent products

Boring Things does not need to replace every adjacent product to be useful. In many cases, the more realistic path is that a user already has part of the problem covered elsewhere, and Boring Things becomes the layer that pulls those fragments together, reasons over them, and helps the user act in the moment they need something done.

- `Password manager` (`1Password`, `LastPass`): a user may already keep membership numbers, account references, logins, and secure notes in their vault. Boring Things can coexist by using that as one source of truth for credentials and identifiers, while adding the surrounding context the vault does not manage well: what the thing is, when it was bought, how it has been maintained, whether it is under warranty, and what needs doing next. The split is simple: secrets stay in the password manager; household understanding and action sit in Boring Things.

- `General-purpose workspace / notes` (`Notion`, `Evernote`): many organised users already have pages full of household notes, pasted receipts, renewal dates, and running lists. Boring Things still works for them by reducing the effort needed to turn those notes into something queryable and operational. Instead of replacing the workspace as a general repository, it can become the assistant that extracts structure, connects related records, answers questions quickly, and prompts action without requiring the user to maintain a manual system perfectly.

- `Asset tracking / inventory` (`itemit`, home inventory apps): a user may already catalogue valuables, appliances, or proof-of-ownership for insurance purposes. Boring Things can build on that inventory rather than compete with it directly, using the catalogued items as the starting point for manuals, warranties, service history, maintenance, and problem solving. The inventory app remains useful for stock-style record keeping; Boring Things adds memory, interpretation, and next actions.

- `Money management and insights` (`Snoop`, `Emma`): a finance app may already be the best place for transaction feeds, budgeting, and subscription detection. Boring Things complements that by tying spending back to real-world things and decisions: which contract belongs to which provider, whether a bill increase corresponds to a tariff change or a faulty appliance, and whether a service should be renewed, switched, or cancelled. The finance app explains the money movement; Boring Things explains what in the household it means and what to do about it.

- `Services marketplaces` (`Checkatrade`, `Rated People`, `MyBuilder`): users can continue to use marketplaces when they are ready to hire someone. Boring Things becomes useful earlier in the flow by helping define the problem, gathering the relevant history, identifying the model or part involved, and packaging the context needed to brief a tradesperson well. The marketplace supplies supply-side choice; Boring Things helps the user arrive with the right diagnosis and records.

- `Comparison providers` (`MoneySuperMarket`, `Compare the Market`, `Confused.com`): comparison sites are still good tools once a user has decided to shop around. Boring Things can sit upstream by noticing the right trigger moments, such as an upcoming renewal, an out-of-contract broadband package, or an insurance policy that no longer matches what the household owns. In that setup, Boring Things identifies and frames the opportunity, while the comparison provider executes the quote-and-switch workflow, potentially as a Boring Things commercial partner.

- `Calendar / task tools`: users may already live out of Apple Reminders, Google Calendar, or a task manager for recurring jobs. Boring Things can feed those tools rather than displace them, creating or suggesting reminders that are grounded in the actual things the user owns and the service events already on record. The calendar remains the place where the user sees their day; Boring Things decides what is worth putting on it.

- `Email, cloud drive, and photo library`: many people already rely on inbox search, folders, and camera roll screenshots as their fallback household memory. Boring Things still works for those users by turning that passive archive into an active system. Instead of making them remember which keyword to search under pressure, it can pull out the relevant document, extract the model number or policy term, and answer the question directly.


## Features

### User stories

As a Boring things user, I must be able to:

- Add a Thing in a way that's convenient to me (a photo, document, or description)
- Authorise Boring Things to discover my Things automatically, via connections into other services that I use (OpenBanking, email, password manager)
- See and search a list of Things that I own
- See details of a single Thing
- Ask natural-language questions about my Things and get smart, accurate answers
- See questions I've previously asked and review those chats
- See a timeline of upcoming and past events related to my Things, and have them synced to my device calendar
- Add events (recurring or one off) to the timeline
- Track 'active issues' relating to Things that I am currently dealing with (eg. "Broken microwave", "Water leak from upstairs")

I expect Boring Things to:

- analyse information I provide and convert it into the most useful form using AI, extracting model numbers, serial numbers, etc.
- enrich the information about my Things by finding manuals, model information, physical location addresses, service provider contact information, alternative/replacement products, repair service technicians, etc.
- identify issues proactively, such as duplicate or unused subscriptions, overspend on utilities etc.
- find service technicians and book repairs
- keep track of everything I've done with or to a Thing, including regular maintenance, repairs, upgrades etc.
- show me offers for new Things I could buy to upgrade my existing Things
- allow me to sell or dispose my Things easily

### Screens / journeys

Main nav offers Things, Timeline, Assistant and Insights options.  We open on the Things view by default.

See the `UI Inspiration` folder for ideas for specific components

- **Auth**:
    - If not logged in, full screen login/register experience
- **Things section**
    - **Things Dashboard/home view**:
        - Active issues
        - Upcoming events (next 7 days)
        - Categories of thing with number of things in each
        - Insights
        - Chat UI
    - **Add new thing**:
        - Take photo, upload, type, forward email, or connect a service
        - Thing is created as a skeleton and populated as data is discovered
    - **Thing view**:
        - Image (uploaded asset or default image for tag)
        - Name and type of thing ("David's car", "Toyota Yaris XP210")
        - Current issues
        - Metadata (most important visible, expandable to show remainder)
        - Attachments (Documents / photos)
        - Upgrade/replace/sell offers
        - Acessory/consumable offers
        - Cost analysis (purchase cost, recurring costs, payment frequency)
        - Related things
        - Upcoming events (link to timeline)
        - Recommended tasks
        - Start chat UI
    - **Thing editor**:
        - Ability to add/remove any of the user-editable parts of a Thing
- **Timeline**:
    - **Main timeline view**
        - Search accepts keywords, filters for Thing name, date range, etc
        - Each event shows date, name of event, thing
    - **Event view**
        - Date, name, details
        - Links to any related Things
- **Assistant**:
    - **List of previous chats**
    - **Conversation view**
- **Insights**:
    - **Dashboard**
    - **Cost analysis**
    - **Recurring costs**
    - **Offers / opportunities**


## Security and compliance expectations

- UK GDPR and GDPR-aligned controls from day one.
- Data minimization and explicit consent boundaries.
- Support data subject rights: access, correction, deletion, portability.
- Maintain audit trails for AI-extracted and AI-generated outputs.
- Define retention/deletion policies for documents and photos.


## Product risks

- User trust if AI answers are wrong or uncited.
- Data sparsity in early usage before enough records exist.
- Liability and trust implications once repair booking is introduced.
