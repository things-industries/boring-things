# Milestones

## POC - sprint 1

The app can be used locally to register, log in, add and manage Things.

- Scaffold a project
- Connect an authentication provider
- Create data and blob storage abstractions and connect them to something simple for local testing (plan to connect to Supabase and cloud blob storage in production)
- Create an initial database data structure.
- Populate an initial set of placeholder Categories
- Create UI for auth, things dashboard, thing view, thing editor, add thing, conversation.  Empty placeholder pages for other areas.
- Implement integration with OpenAI and use it for smart autosuggest during thing creation, and to Extract data from submitted text/photos/documents.

Use cases:

- Add a thing from a pasted dump of text
- Add a thing by uploading a file
- Ask a question about a thing and get the right answer
- See details about a thing that BT has discovered without you providing them
- See upcoming events related to things
- Get suggestions for maintenance activities that could be turned into events
- Buy consumables, eg salt for dishwasher
- Upgrade options

Screens:

- Thing dashboard
    - Active issues (up to 3)
    - Upcoming events (up to 3)
    - List of things (frequent things, recently created)
    - Category tags (with counts)
    - Actions: add a thing, start a chat
- Add thing step 1: upload source file/photo/text
- Thing view (with progressive building for new things, read only until initial thing processing is complete)
    - Documents (initial source + discovered stuff)
    - Suggested tasks + upcoming/past events
    - Things available to buy (accessories / consumables)
    - Upgrade options (your thing is old, want a new one?)
    - Start conversation
- Chat/conversation view
    - Start in thing context or from dashboard
    - Can't resume previous convo (but will be able to eventually)
    - Surface Things, Data Property Values, Documents, Events (including ones created by chat)

API operations:

- defining the following resources:
    - `/profile` (current user)
    - `/things` (collection for things)
    - `/issues` (collection for issues)
    - `/events` (collection for events)
    - `/tags` (collection for user defined tags)
    - `/conversations` (collection for AI chats)
- with appropriate relationship patterns - child collections or accessors for association entities
    - `/things/{thingId}` - containing arrays of IDs for embedded objects like events, issues, conversations, tags - where they have their own global collections.
    - `/things/{thingId}/attachments` - something like this for attachments since they are only accessible through things
        - `/things/{thingId}/attachments/{id}` - for metadata
        - `/things/{thingId}/attachments/{id}/content` - for content (download, with correct content-type and content-disposition)
- with `:{action}` for non-RESTful actions
    - `/things/{thingId}:upload` (to add a photo / document to a thing)
    - `/things/{thingId}:import` (for thing creation from a photo / document / source material.  POST /things should be for creating a thing from literal data)

Possible thing data model for /things/{thingId}:

{
    /* derivative/automatic/system metadata not editable by user */
    "id": uuid,
    "createdByUserId": uuid,
    "createdAt": {date},
    "updatedAt": {date},

    /* basics for all things */
    "name": "Toyota Yaris",
    "description": "David's car",
    
    /* classifiers */
    "tags": [ uuid, uuid, uuid ],
    "categories": [ "vehicle" ],

    /* Data associated with the Thing.  The core set of data fields associated with the thing's category should all be present.  Import jobs may add other known fields from the data property registry and reference the field ID, so that less common data can be captured and can still be semantically comparable between things.  Completely one-off fields that aren't in the fields registry could also be added to a thing. */
    "fields": [
        { "refFieldId": uuid, "label": "Registration", "value": "PX65 PWO", uiType: "string", "fieldTrigger": "category" },
        { "refFieldId": null, "label": "Chassis number", "value": "066286828758343453564", uiType: "string", "fieldTrigger": "import" },
        { "refFieldId": uuid, "label": "Parking code", "value": "6723", uiType: "number", "fieldTrigger": "user-defined" },
    ],

    /* Entities with global accessor resources eg `/issues` can just be listed as IDs */
    "issues": [ uuid, uuid, uuid],
    "events": [ uuid, uuid, uuid],
    "conversations": [ uuid, uuid, uuid],

    /* attachments belong only to things, so we can just provide a count here and access them via a child collection */
    "attachmentsCount: 4
}

