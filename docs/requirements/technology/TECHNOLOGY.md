# Technology

Boring Things is an AI that helps people track and manage life administration across appliances, memberships, subscriptions, utilities, and service providers, by finding manuals, answering questions, scheduling repairs and maintenance, offering upgrades, and more.

This document outlines the technology solution that addresses the requirements documented in PRODUCT.

## Engineering goals

- Fast web UX with low client JS payload.
- Reliable structured records for Things of varied types, able to accomodate new types of Thing
- Serverless where possible to minimise fixed costs and reduce blockers to early scaling needs

## Tools, frameworks, service providers and platforms

- Language: TypeScript end-to-end
- Frontend: AngularJS
- Backend: Fastify NodeJS with class/plugin based abstractions
- Edge/CDN: Fastly
    - Free unlimited Fastly service is available because Andrew is a former Fastly employee
    - Fastly should be used to validate and authenticate session data so that authenticated data can be cached at the edge
- Server runtime: Render
    - Has a good free tier which will provide a low cost starting point
- Blob storage: TBC
    - Choose the easiest solution that integrates with the server runtime.
- Database: Supabase
    - Easy integration with Render, has free tier
- Authentication: Logto?
    - Low cost, open source, quick SaaS version available for MVP, can transition to self-hosted later if desired
- Email: SendGrid/Twilio?
    - Email sending is needed for notifications / email validation etc
    - Receiving as an option for importing Things or adding information to them: provider receives email and converts it into an HTTP POST to a webhook
- Open Banking: Truelayer?


## System architecture

- Monorepo with /src for Angular app, /server for Fastify server app.  
- OpenAPI spec to define the API contract.  OpenAPI is canonical, server and client types generated from it.
- Postgres as source of truth for structured entities and events.
- Object storage for photos/documents.
- AI layer for extraction, suggestion and Q&A.
- Background/async/serverless jobs where possible
- Plugin architecture for Thing providers (utilities / membership platforms)

## Data domain

Many Things will be of a few common types like Appliance/Device, Utility/Service, Membership/Subscription - but this isn't exhaustive.  Users should be able to add Things of any type, even things that are not known to the Boring Things ecosystem.  Even within a single Thing category, such as home appliances, there will be data that applies to some sub-categories and not others.  For example, Bosch home appliances have an 'E' number, while Electrolux ones don't.  American dishwashers have a hot water inlet, European ones heat the water internally.

### Core entities

- **Thing** ("My washing machine", "Vodafone mobile service"): The primary concept of Boring Things.  A tangible entity that the user wants us to help track and support.  Could be a membership, subscription, utility contract, appliance, device, insurance policy, financial product or account, credit card, etc.  Some basic top level metadata can belong directly to Things: name ("David's car"), broad "category" ("Vehicle"), description, acquisition date.
- **Category** ("Membership"): A broad classifier for Things that helps to contextualise processing and make AI tasks simpler and more accurate. Has name, description, icon, default header image for things in this category that don't have a picture, and a set of default data properties.  Examples: membership, subscription, appliance, vehicle, device, utility contract, insurance policy, tax account, property, "other".
- **Tags**: Lightweight classifiers defined by the user that can be attached to Things
- **Data property** ("Manufacturer"): defined with JSONSchema-like detail (type, min/max, options, format, pattern, default, examples and description), can be applied to Things where appropriate and associated with Categories to guide extraction.  For example, home appliances manufactured by Bosch or Siemens have an E-Number.  Physical Things have a manufacturer, whereas utilities have a supplier and utility type.  Split into a registry of property definitions, and a table of property values for specific Things.
- **Event** ("2026 Boiler service"): Something that has or will happen in relation to a Thing.  Used to schedule tasks as well as record actions that have been taken.
- **Issue** ("Boiler leak"): A current problem or action in progress in relation to a Thing
- **Location** ("17 Park Avenue"): A place that is relevant to a Thing
- **Document**: A binary file attached to a Thing, used for manuals, receipts, certificates, contracts, letters, and other paperwork.
- **Photo**: An image captured or uploaded by the user, stored separately from Documents because photos are often evidence or visual identification rather than paperwork. Photos can be associated with a Thing, Event, or Issue; examples include a serial-number plate for a Thing, damage evidence for an Issue, or before/after photos for an Event.
- **Conversations and messages**: AI chat threads and messages related to Things and Issues
- **Offer**: A deal to buy or sell a particular type of thing, which can be displayed if a matching Thing is owned
- **User**: Someone that owns or uses Things.


## AI tasks

- Smart autosuggest
    - In "Add new thing" flow, if we ask what kind of thing is it, and they type "bike", identify that the 'vehicle' category is appropriate.
    - Prompt is list of all available options and the input provided by the user
    - Very narrowly scoped task suitable for cheap cloud model (and in future a local model or ML)
    - MVP can just cache AI lookups, longer term matches accepted by users should be used to automatically manage a set of known mapping patterns
- Extract data from submitted text/photos/documents
    - May benefit from narrower scope if submission is done via UI (we should know if it's a new thing or an update to a thing, and if its a new thing, what category of thing it is); or if done via email/post/banking integration (where we just get the raw email / records without context) the task will need to figure out the specifics from a broader set of possibilities.
    - First-pass task prompts with the raw input, classifies it and converts it into markdown (freeform, key-value and tabular data as appropriate) if possible.
    - Optional step if required to determine if this is a new thing or an update to an existing thing: Receives the summary of the input and a list of all existing things.
- Thing enrichment
    - Potentially provide model with access to provider APIs, eg. lookup vehicle licence plate or bank account details using public APIs
    - Web search to find manuals, online documentation, hints and tips, news
- Chat conversations
    - Could be in context of a Thing or broadly about all things owned by the user. Populate the system prompt accordingly.
    - Use a high-quality conversational model, guide the system prompt to be brief in responses
    - Provide an MCP so that the model can execute actions in relation to Things


## Security and compliance

- UK GDPR controls across collection, retention, and deletion.
