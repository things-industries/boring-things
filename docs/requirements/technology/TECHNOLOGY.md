# Technology

Boring Things is an AI that helps people track and manage life administration across appliances, memberships, subscriptions, utilities, and service providers, by finding manuals, answering questions, scheduling repairs and maintenance, offering upgrades, and more.

This document outlines the technology solution that addresses the requirements documented in PRODUCT.

## Engineering goals

- Fast web UX with low client JS payload.
- Reliable structured records for Things of varied types, able to accommodate new types of Thing
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

Many Things will be of a few common categories like Appliance/Device, Utility/Service, Membership/Subscription - but this isn't exhaustive.  Users should be able to add Things of any type, even things that are not known to the Boring Things ecosystem.  Even within a single Thing category tag, such as home appliances, there will be data that applies to some and not others.  For example, Bosch home appliances have an 'E' number, while Electrolux ones don't.  American dishwashers have a hot water inlet, European ones heat the water internally.

### Core entities

- **Thing** ("My washing machine", "Vodafone mobile service"): The primary concept of Boring Things.  A tangible entity that the user wants us to help track and support.  Could be a membership, subscription, utility contract, appliance, device, insurance policy, financial product or account, credit card, etc.  Some basic top level metadata can belong directly to Things: name ("David's car"), broad "category" ("Vehicle"), description, acquisition date.
- **Category** ("Membership"): A broad classifier for Things that helps to contextualise processing and make AI tasks simpler and more accurate. Has name, description, icon, default header image for things in this category that don't have a picture, and a set of default data properties.  Examples: membership, subscription, appliance, vehicle, device, utility contract, insurance policy, tax account, property, "other".
- **Tags**: Lightweight user-defined classifiers defined by the user that can be attached to Things.  Likely will be used for sharing, so can be used to define a household, for example, and add other people to it.
- **Data property** ("Manufacturer"): defined with JSONSchema-like detail (type, min/max, options, format, pattern, default, examples and description), can be applied to Things where appropriate and associated with Categories to guide extraction.  For example, home appliances manufactured by Bosch or Siemens have an E-Number.  Physical Things have a manufacturer, whereas utilities have a supplier and utility type.  Split into a registry of property definitions, and a table of property values for specific Things.
- **Event** ("2026 Boiler service"): Something that has happened or will happen in relation to a Thing.  Used to schedule tasks as well as record actions that have been taken.
- **Issue** ("Boiler leak"): A current problem or action in progress in relation to a Thing.  Can have events, conversations, documents, photos etc.
- **Attachment**: A binary file attached to a Thing, Event or Issue, used for photos, manuals, receipts, certificates, contracts, letters, and other paperwork. Photo examples include a serial-number plate for a Thing, damage evidence for an Issue, or before/after photos for an Event.  We will need to distinguish between documents and photos to provide appropriate UI.
- **Conversations and messages**: AI chat threads and messages related to Things and Issues
- **Offer**: A deal to buy or sell a particular type of Thing or an accessory/consumable used by/with a Thing, which can be displayed if a matching Thing is owned
- **User**: Someone that owns or uses Things.


## AI tasks

- Process submitted text/photos/documents to create or update Things
    - First-pass task: extraction, category and new vs update
        - Receives the raw input, and a list of the user's existing things
        - Prompted to determine whether this is a new thing or relates to a thing the user already owns, to convert the source into markdown (freeform, key-value and tabular data as appropriate), and if it's a new thing, what category of thing is it?
    - Second-pass task: data assignment
        - Receives the extracted raw data and a list of the fields that are applicable to the Thing category
        - Is able to use a function to search the registry of other known fields
        - Prompted to return structured data from which the thing's data properties can be populated.  May create new data properties.
- Thing enrichment
    - Receives details of a thing
    - Is able to access provider/partner APIs, eg. lookup vehicle licence plate with DVLA, bank account details using TrueLayer, or consumer products from manufacturer databases.
    - Prompted to research and locate manuals, online documentation, hints and tips, news
    - Creates documents and additional data properties on a thing.
- Chat conversations
    - Receives user query and the context of a Thing if applicable, or general information about the user's things if the chat is not for a single thing.
    - Is able to use a function to search and access details of things in the user's library
    - Use a high-quality conversational model, guide the system prompt to be brief in responses
    - Responses may be used to create Issues, Events, or Attachments.

AI tasks should also produce learnings / a context summary which can be stored against Things and provided as part of the prompt in any new task.


## Security and compliance

- UK GDPR controls across collection, retention, and deletion.
