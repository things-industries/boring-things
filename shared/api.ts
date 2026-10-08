export interface paths {
    "/api/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get config
         * @description Returns sign-in settings, upload limits and feature availability for the browser client.
         */
        get: operations["getConfig"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get profile
         * @description Returns the signed-in user's profile and whether sample data has been added.
         */
        get: operations["getProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/profile:seed-samples": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Seed samples
         * @description Adds sample Things, activities and purchasables, then returns the updated profile. Repeated requests preserve the existing sample collection. Returns 404 when sample data is disabled.
         */
        post: operations["seedSamples"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List categories
         * @description Lists Thing categories with the number of your Things in each category.
         */
        get: operations["listCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/field-sets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List field sets
         * @description Lists field sets, optionally filtered by category and search text.
         */
        get: operations["listFieldSets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/field-sets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get field set
         * @description Returns a field set with its field definitions, required dependencies and suggested related sets.
         */
        get: operations["getFieldSet"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/fields": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List field definitions
         * @description Lists reusable field definitions, optionally filtered by search text.
         */
        get: operations["listFieldDefinitions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/fields/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get field
         * @description Returns a field definition with its validation rules, display settings and sensitivity.
         */
        get: operations["getField"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/things": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List thing summaries
         * @description Lists Thing summaries, optionally filtered by category, tag and search text. Results default to most recently updated first, with ties ordered by ID. A Thing is displayed as new for seven days after creation.
         */
        get: operations["listThingSummaries"];
        put?: never;
        /**
         * Create thing
         * @description Creates a Thing with the supplied category, fields, tags and pins. Accepts an optional client-generated UUID; an ID already in use returns 409.
         */
        post: operations["createThing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/things/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get thing
         * @description Returns a Thing with its fields, linked resources and current import status. Sensitive field values are masked.
         */
        get: operations["getThing"];
        put?: never;
        post?: never;
        /**
         * Delete thing
         * @description Deletes a Thing. Returns 409 while an import is active.
         */
        delete: operations["deleteThing"];
        options?: never;
        head?: never;
        /**
         * Patch thing
         * @description Updates selected properties, fields, tags and pins of a Thing. Removing a populated field set or changing category preserves displaced values as custom fields. Returns 409 while an import is active.
         */
        patch: operations["patchThing"];
        trace?: never;
    };
    "/api/things/{id}:reveal-field": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reveal field
         * @description Returns the stored value of a selected field, including sensitive values masked in Thing responses. The response must not be cached.
         */
        post: operations["revealField"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List tags
         * @description Lists labels available for organising Things.
         */
        get: operations["listTags"];
        put?: never;
        /**
         * Create tag
         * @description Creates a label for organising Things. Accepts an optional client-generated UUID; an ID already in use returns 409.
         */
        post: operations["createTag"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tags/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete tag
         * @description Deletes a tag and removes it from the Things that use it.
         */
        delete: operations["deleteTag"];
        options?: never;
        head?: never;
        /**
         * Patch tag
         * @description Renames a tag across all Things that use it. Whitespace-only names are rejected.
         */
        patch: operations["patchTag"];
        trace?: never;
    };
    "/api/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List attachments
         * @description Lists attachment metadata, optionally filtered to files linked to a Thing.
         */
        get: operations["listAttachments"];
        put?: never;
        /**
         * Upload attachment
         * @description Uploads one file and queues its Import in the same transaction. An optional Thing ID restricts processing to that Thing. The response includes the queued Import. File size, media type and content must satisfy the limits returned by getConfig.
         */
        post: operations["uploadAttachment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/attachments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get attachment
         * @description Returns attachment metadata and the IDs of linked Things.
         */
        get: operations["getAttachment"];
        put?: never;
        post?: never;
        /**
         * Delete attachment
         * @description Deletes an attachment and its stored file. Returns 409 while the attachment is linked to a Thing or referenced by an import.
         */
        delete: operations["deleteAttachment"];
        options?: never;
        head?: never;
        /**
         * Edit attachment metadata
         * @description Updates selected attachment properties across all linked Things. Omitted properties keep their values; null removes a value. Automatic document processing preserves values edited or removed by the user.
         */
        patch: operations["patchAttachment"];
        trace?: never;
    };
    "/api/attachments/{id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download attachment
         * @description Downloads the stored file using its media type and filename.
         */
        get: operations["downloadAttachment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/attachments/{id}/things/{thingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Link attachment
         * @description Links an attachment to a Thing. Repeating an existing link succeeds. Returns 409 while the Thing has an active import.
         */
        put: operations["linkAttachment"];
        post?: never;
        /**
         * Unlink attachment
         * @description Removes the link between an attachment and a Thing, retaining the attachment. Returns 409 while the Thing has an active import.
         */
        delete: operations["unlinkAttachment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/issues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List issues
         * @description Lists issues, optionally filtered by Thing and resolution status.
         */
        get: operations["listIssues"];
        put?: never;
        /**
         * Create issue
         * @description Creates an issue for a Thing, with status OPEN by default. Accepts an optional client-generated UUID; an ID already in use returns 409.
         */
        post: operations["createIssue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/issues/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get issue
         * @description Returns an issue with its status, due date and resolution timestamp.
         */
        get: operations["getIssue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch issue
         * @description Updates selected issue properties. Resolving an open issue records the resolution time; reopening it removes that timestamp. Null removes the status text or due date.
         */
        patch: operations["patchIssue"];
        trace?: never;
    };
    "/api/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List events
         * @description Lists events by schedule, earliest first, then ID, with unscheduled events last. Filters can select a Thing, status or date range. Date-only events sort at midnight in timeZone. Range bounds are inclusive: timed events use instants, and date-only events use the calendar date of each bound in timeZone.
         */
        get: operations["listEvents"];
        put?: never;
        /**
         * Create event
         * @description Creates an event for a Thing, with status SUGGESTED by default. Scheduled events require a date or timestamp. A linked issue must belong to the same Thing. Accepts an optional client-generated UUID; an ID already in use returns 409.
         */
        post: operations["createEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get event
         * @description Returns an event with its schedule, completion timestamp and supporting sources.
         */
        get: operations["getEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch event
         * @description Updates selected event properties. When switching between a date and timestamp, set the previous schedule property to null. Scheduled events require one schedule value. A linked issue must belong to the same Thing.
         */
        patch: operations["patchEvent"];
        trace?: never;
    };
    "/api/purchasables": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List purchasables
         * @description Lists opportunities to buy products that maintain or improve a Thing, optionally filtered by Thing and suggestion kind.
         */
        get: operations["listPurchasables"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/purchasables/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get purchasable
         * @description Returns a purchasable opportunity with its merchant link, price when available and supporting sources. Merchant actions for sample suggestions are disabled.
         */
        get: operations["getPurchasable"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List conversations
         * @description Lists conversation summaries, most recent message first, then ID. Omitting thingId includes conversations with and without Thing context. minMessageCount can exclude empty conversations. Page contents can shift when messages or conversations are added between requests.
         */
        get: operations["listConversations"];
        put?: never;
        /**
         * Create conversation
         * @description Creates a conversation, optionally associated with a Thing. Accepts an optional client-generated UUID; an ID already in use returns 409.
         */
        post: operations["createConversation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/conversations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get conversation
         * @description Returns a conversation and its messages in chronological order. Resource cards indicate whether their referenced records are still available.
         */
        get: operations["getConversation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/things:import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start import
         * @description Queues document processing for an uploaded attachment and links it to the target Thing. Omitting thingId creates a placeholder Thing. Returns 409 if the target already has an active import.
         */
        post: operations["startImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get import
         * @description Returns import progress, detected candidates, resulting Thing IDs and any processing error.
         */
        get: operations["getImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}:confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm import
         * @description Selects detected Things to import and resumes processing. Each selection can update an existing Thing or create one. Returns 409 unless the import is awaiting selection.
         */
        post: operations["confirmImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}:retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Retry import
         * @description Queues another attempt for a failed or incomplete import, or retries optional research on a completed import with warnings. Reuses saved progress and completed document batches. Returns 409 if there is no work to retry, a target was deleted or a target has another active import.
         */
        post: operations["retryImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/things/{thingId}/stream": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stream thing
         * @description Streams Thing updates as server-sent events. Each thing.snapshot event contains a complete Thing; replace local state with the snapshot on connection or reconnect.
         */
        get: operations["streamThing"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/conversations/{id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send message
         * @description Adds a user message and queues an assistant response. Repeating the same request ID and text returns the existing conversation or retries its latest failed response. Changed text, another response in progress or a full conversation returns 409.
         */
        post: operations["sendMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/conversations/{id}/stream": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stream conversation
         * @description Streams conversation updates as server-sent events. conversation.snapshot contains a Conversation and replaces local state on reconnect. conversation.delta contains a ConversationDelta with a message ID, text offset and text. Retry the latest failed response by sending the same request ID and text.
         */
        get: operations["streamConversation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/things/{id}:view": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record a user view
         * @description Records a user opening a Thing page by incrementing accessCount and setting lastViewedAt to the server time. Each successful request counts once, so clients must not automatically retry. Reading or streaming a Thing does not record a view. Recording a view preserves updatedAt and the content revision.
         */
        post: operations["recordThingView"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description HTTP error status and a message suitable for display to the user. */
        Error: {
            message: string;
            statusCode: number;
        };
        /** @description Amount in integer minor units and a supported currency with two decimal places. */
        Money: {
            amountMinor: number;
            currency: components["schemas"]["CurrencyEnum"];
        };
        /** @description A text, numeric, boolean or money value. Identifiers retain their string representation. */
        Value: string | number | boolean | components["schemas"]["Money"];
        /** @description A field value, or null for an empty, removed or masked value. */
        NullableValue: components["schemas"]["Value"] | null;
        /** @description Attachment or public URL supporting a value, with an optional page and quote. Sensitive field quotes may be omitted. */
        SourceRef: {
            /** Format: uuid */
            attachmentId?: string;
            page?: number;
            quote?: string;
            /** Format: uri */
            url?: string;
        };
        /** @description Reference to a field selected for prominent display on a Thing. */
        Pin: {
            fieldSetId?: string | null;
            fieldId?: string;
            /** Format: uuid */
            customFieldId?: string;
        };
        /** @description Supported JSON Schema rules for validating a field value. */
        FieldSchema: {
            type: components["schemas"]["SchemaTypeEnum"];
            format?: components["schemas"]["SchemaFormatEnum"];
            enum?: string[];
            minimum?: number;
            maximum?: number;
            minLength?: number;
            maxLength?: number;
            pattern?: string;
            properties?: {
                [key: string]: unknown;
            };
            required?: string[];
            additionalProperties?: boolean;
        };
        /** @description Reusable field definition with validation rules, display settings and sensitivity. */
        FieldDefinition: {
            id: string;
            name: string;
            description: string;
            keywords: string[];
            schema: components["schemas"]["FieldSchema"];
            uiHint: components["schemas"]["UiHintEnum"];
            sensitive: boolean;
            /** @description Semantic field icon key; the Remix mapping is documented in README.md. Clients may render a generic field icon for missing, null or unrecognised keys. */
            icon?: string | null;
            /** @description Whether the value belongs to the owned item, account or agreement. Only false values participate in public research; unclassified fields default to true. */
            instanceSpecific?: boolean;
        };
        /** @description Field definition with its current value, source information and masking state. */
        Field: {
            id: string;
            name: string;
            description: string;
            keywords: string[];
            schema: components["schemas"]["FieldSchema"];
            uiHint: components["schemas"]["UiHintEnum"];
            sensitive: boolean;
            value: components["schemas"]["NullableValue"];
            masked: boolean;
            origin: components["schemas"]["FieldOriginEnum"] | null;
            sourceRefs: components["schemas"]["SourceRef"][];
            /** @description Semantic field icon key; the Remix mapping is documented in README.md. Clients may render a generic field icon for missing, null or unrecognised keys. */
            icon?: string | null;
            /** @description Whether the value belongs to the owned item, account or agreement. Only false values participate in public research; unclassified fields default to true. */
            instanceSpecific?: boolean;
        };
        /** @description Category-specific group of field definitions, required dependencies and suggested related sets. */
        FieldSet: {
            id: string;
            categoryId: string;
            name: string;
            eligibility: string;
            keywords: string[];
            includes: string[];
            considerAlongside: string[];
            fields: components["schemas"]["FieldDefinition"][];
        };
        /** @description Selected field set with current values and source information for each field. */
        DetailFieldSet: {
            id: string;
            categoryId: string;
            name: string;
            eligibility: string;
            keywords: string[];
            includes: string[];
            considerAlongside: string[];
            fields: components["schemas"]["Field"][];
        };
        /** @description Custom field with its value, sensitivity and source information. */
        CustomField: {
            /** Format: uuid */
            id: string;
            label: string;
            value: components["schemas"]["NullableValue"];
            sensitive: boolean;
            masked: boolean;
            origin: components["schemas"]["FieldOriginEnum"];
            sourceRefs: components["schemas"]["SourceRef"][];
            valueType: components["schemas"]["ValueTypeEnum"];
            /** @description Whether the value belongs to the owned item, account or agreement. Only false values participate in public research; unclassified fields default to true. */
            instanceSpecific?: boolean;
        };
        /** @description Thing category with display settings and the number of your Things in that category. */
        Category: {
            id: string;
            name: string;
            description: string;
            /** @description Semantic category icon key. Clients map keys to their icon catalogue. */
            icon: string;
            defaultImage: string | null;
            sortOrder: number;
            thingCount: number;
        };
        /** @description Signed-in user profile and whether sample data has been added. */
        Profile: {
            /** Format: uuid */
            id: string;
            displayName: string;
            samplesAdded: boolean;
        };
        /** @description Browser sign-in settings, upload limits and feature availability. */
        Config: {
            logtoEndpoint: string;
            logtoAppId: string;
            apiResource: string;
            maxUploadBytes: number;
            supportedMediaTypes: string[];
            sampleDataEnabled: boolean;
            importEnabled: boolean;
            chatEnabled: boolean;
        };
        /** @description User-defined label for organising Things. */
        Tag: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        /** @description Tag name and optional ID for creation. Whitespace-only names are rejected. */
        TagInput: {
            /**
             * Format: uuid
             * @description Optional client-generated ID for creation. Omit to generate an ID on the server. An existing ID returns 409. Ignored on PATCH; the path ID is authoritative.
             */
            id?: string;
            name: string;
        };
        /** @description Thing metadata for lists, including category, tags and view counts. */
        ThingSummary: {
            /** Format: uuid */
            id: string;
            name: string;
            description: string;
            categoryId: string;
            revision: number;
            /** Format: uuid */
            imageAttachmentId: string | null;
            tagIds: string[];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            isSample: boolean;
            /** @description Number of explicit user views recorded for this Thing. */
            accessCount: number;
            /**
             * Format: date-time
             * @description Most recent explicit user view; null until first viewed.
             */
            lastViewedAt: string | null;
        };
        /** @description Thing details with fields, linked resource IDs and import status. Sensitive field values are masked. */
        Thing: {
            /** Format: uuid */
            id: string;
            name: string;
            description: string;
            categoryId: string;
            revision: number;
            /** Format: uuid */
            imageAttachmentId: string | null;
            tagIds: string[];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            isSample: boolean;
            fieldSets: components["schemas"]["DetailFieldSet"][];
            standaloneFields: components["schemas"]["Field"][];
            customFields: components["schemas"]["CustomField"][];
            pinnedFields: components["schemas"]["Pin"][];
            attachmentIds: string[];
            issueIds: string[];
            eventIds: string[];
            purchasableIds: string[];
            conversationIds: string[];
            import?: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                attachmentId: string;
                /** Format: uuid */
                thingId: string | null;
                status: components["schemas"]["ImportStatusEnum"];
                candidates: components["schemas"]["ImportCandidate"][];
                thingIds: string[];
                error: string | null;
                usage: components["schemas"]["ImportUsage"];
                /** @description Warnings for unfinished optional research. Imported fields and successful documents remain available. */
                warnings?: components["schemas"]["ImportWarning"][];
            } | null;
            /** @description Number of explicit user views recorded for this Thing. */
            accessCount: number;
            /**
             * Format: date-time
             * @description Most recent explicit user view; null until first viewed.
             */
            lastViewedAt: string | null;
        };
        /** @description Update to a field in a set or a standalone field. Null removes its stored value. */
        ValuePatch: {
            fieldSetId: string | null;
            fieldId: string;
            value: components["schemas"]["NullableValue"];
        };
        /** @description Update to a custom field, including its label, value, sensitivity and optional research classification. Omitted classification preserves an existing value or defaults to instance-specific. */
        CustomFieldPatch: {
            /** Format: uuid */
            id?: string;
            label: string;
            value: components["schemas"]["Value"];
            sensitive: boolean;
            /** @description Whether the value belongs to the owned item, account or agreement. Only false values participate in public research; unclassified fields default to true. */
            instanceSpecific?: boolean;
        };
        /** @description Properties for creating a Thing, including its category and optional fields, tags and pins. */
        ThingCreate: {
            /**
             * Format: uuid
             * @description Optional client-generated ID for creation. Omit to generate an ID on the server. An existing ID returns 409.
             */
            id?: string;
            name: string;
            description?: string;
            categoryId: string;
            tagIds?: string[];
            addFieldSetIds?: string[];
            removeFieldSetIds?: string[];
            values?: components["schemas"]["ValuePatch"][];
            customFields?: components["schemas"]["CustomFieldPatch"][];
            removeCustomFieldIds?: string[];
            pinnedFields?: components["schemas"]["Pin"][];
            /** Format: uuid */
            imageAttachmentId?: string | null;
        };
        /** @description Selected Thing properties to update. Omitted properties keep their current values. */
        ThingPatch: {
            name?: string;
            description?: string;
            categoryId?: string;
            tagIds?: string[];
            addFieldSetIds?: string[];
            removeFieldSetIds?: string[];
            values?: components["schemas"]["ValuePatch"][];
            customFields?: components["schemas"]["CustomFieldPatch"][];
            removeCustomFieldIds?: string[];
            pinnedFields?: components["schemas"]["Pin"][];
            /** Format: uuid */
            imageAttachmentId?: string | null;
        };
        /** @description Reference to the field whose stored value should be revealed. */
        RevealRequest: components["schemas"]["Pin"];
        /** @description Stored field value returned by an explicit reveal request. The response must not be cached. */
        RevealResult: {
            value: components["schemas"]["NullableValue"];
        };
        /** @description File metadata, document properties and IDs of linked Things. Upload responses also include the queued Import. */
        Attachment: {
            /** Format: uuid */
            id: string;
            filename: string;
            mediaType: string;
            byteSize: number;
            /** Format: uri */
            sourceUrl: string | null;
            thingIds: string[];
            /** Format: date-time */
            createdAt: string;
            /** @description Display title; null displays the original filename. */
            title: string | null;
            documentType: components["schemas"]["AttachmentDocumentTypeEnum"] | null;
            /** @description Manufacturer, retailer or organisation that issued the document. */
            publisher: string | null;
            /**
             * Format: date
             * @description Original document date, independent of upload time.
             */
            documentDate: string | null;
            /** @description PDF page count derived from the file. Null for non-PDF, unparsed, malformed or encrypted files. */
            readonly pageCount: number | null;
            metadataSources: components["schemas"]["AttachmentMetadataSources"];
            import?: components["schemas"]["ImportAccepted"];
        };
        /** @description Problem associated with a Thing, including status, due date and resolution time. */
        Issue: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string;
            title: string;
            description: string;
            status: components["schemas"]["IssueStatusEnum"];
            /** Format: date-time */
            resolvedAt: string | null;
            isSample: boolean;
            /** @description Optional freeform status shown on an Issue card. Null clears it. */
            statusText?: string | null;
            /**
             * Format: date
             * @description Optional calendar due date, without a time or timezone. Null clears it.
             */
            dueDate?: string | null;
        };
        /** @description Properties for creating an issue for a Thing. Status defaults to OPEN. */
        IssueInput: {
            /**
             * Format: uuid
             * @description Optional client-generated ID for creation. Omit to generate an ID on the server. An existing ID returns 409.
             */
            id?: string;
            /** Format: uuid */
            thingId: string;
            title: string;
            description?: string;
            status?: components["schemas"]["IssueStatusEnum"];
            /** @description Optional freeform status shown on an Issue card. Null clears it. */
            statusText?: string | null;
            /**
             * Format: date
             * @description Optional calendar due date, without a time or timezone. Null clears it.
             */
            dueDate?: string | null;
        };
        /** @description Selected issue properties to update. Null removes optional text or dates. */
        IssuePatch: {
            title?: string;
            description?: string;
            status?: components["schemas"]["IssueStatusEnum"];
            /** @description Optional freeform status shown on an Issue card. Null clears it. */
            statusText?: string | null;
            /**
             * Format: date
             * @description Optional calendar due date, without a time or timezone. Null clears it.
             */
            dueDate?: string | null;
        };
        /** @description Task or reminder for a Thing, with its schedule, completion time and supporting sources. SCHEDULED requires either startsOn or startsAt; other statuses allow neither. Both schedule properties cannot have a value together. */
        Event: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string;
            /** Format: uuid */
            issueId: string | null;
            title: string;
            description: string;
            status: components["schemas"]["EventStatusEnum"];
            /** Format: date-time */
            startsAt: string | null;
            /** Format: date-time */
            completedAt: string | null;
            sourceRefs: components["schemas"]["SourceRef"][];
            isSample: boolean;
            /**
             * Format: date
             * @description Calendar date for an event without a time. Mutually exclusive with startsAt. When switching, clear the other field explicitly.
             */
            startsOn: string | null;
        };
        /** @description Properties for creating an event for a Thing. Status defaults to SUGGESTED. SCHEDULED requires either startsOn or startsAt; both schedule properties cannot have a value together. */
        EventInput: {
            /**
             * Format: uuid
             * @description Optional client-generated ID for creation. Omit to generate an ID on the server. An existing ID returns 409.
             */
            id?: string;
            /** Format: uuid */
            thingId: string;
            /** Format: uuid */
            issueId?: string | null;
            title: string;
            description?: string;
            status?: components["schemas"]["EventStatusEnum"];
            /** Format: date-time */
            startsAt?: string | null;
            /**
             * Format: date
             * @description Calendar date for an event without a time. Mutually exclusive with startsAt. When switching, clear the other field explicitly.
             */
            startsOn?: string | null;
        };
        /** @description Selected event properties to update. Null removes an optional issue link or schedule value. SCHEDULED requires either startsOn or startsAt; when switching, set the previous schedule property to null. */
        EventPatch: {
            /** Format: uuid */
            issueId?: string | null;
            title?: string;
            description?: string;
            status?: components["schemas"]["EventStatusEnum"];
            /** Format: date-time */
            startsAt?: string | null;
            /**
             * Format: date
             * @description Calendar date for an event without a time. Mutually exclusive with startsAt. When switching, clear the other field explicitly.
             */
            startsOn?: string | null;
        };
        /** @description Opportunity to buy a consumable, accessory or upgrade that maintains or improves a Thing, with supporting sources. Merchant actions for samples are disabled. */
        Purchasable: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string;
            kind: components["schemas"]["PurchasableKindEnum"];
            name: string;
            description: string;
            /** Format: uri */
            merchantUrl: string;
            /** Format: uri */
            imageUrl: string | null;
            price: components["schemas"]["Money"] | null;
            sourceRefs: components["schemas"]["SourceRef"][];
            /** Format: date-time */
            checkedAt: string | null;
            isSample: boolean;
        };
        /** @description Conversation message with its text, resource cards, supporting sources and processing status. */
        Message: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            conversationId: string;
            /** Format: uuid */
            requestId: string;
            role: components["schemas"]["MessageRoleEnum"];
            text: string;
            cards: components["schemas"]["ResourceCard"][];
            /** @description Empty in conversation responses: attachment references are represented by document cards and web citations appear as inline links in text. */
            sourceRefs: components["schemas"]["SourceRef"][];
            status: components["schemas"]["MessageStatusEnum"];
            /** Format: date-time */
            createdAt: string;
            error?: string | null;
            usage?: components["schemas"]["ImportUsage"] | null;
        };
        /** @description Conversation with optional Thing context and its messages. */
        Conversation: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string | null;
            messages: components["schemas"]["Message"][];
        };
        /** @description Conversation details for history lists, including a title from the first user message, message count and timestamps. */
        ConversationSummary: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string | null;
            /** @description First user message ordered by creation time then ID, trimmed and truncated to 80 Unicode code points. Null when there is no user message. */
            title: string | null;
            /** @description Number of persisted user and assistant messages in every status. Retries reuse existing messages. */
            messageCount: number;
            /** Format: date-time */
            createdAt: string;
            /**
             * Format: date-time
             * @description Newest message creation time, or conversation creation time when empty. Completing or retrying a message does not change this time.
             */
            lastMessageAt: string;
        };
        /** @description A page of conversation summaries. nextCursor is null when no further page is available. */
        ConversationSummaryList: {
            items: components["schemas"]["ConversationSummary"][];
            nextCursor: string | null;
        };
        /** @description Optional ID and Thing context for a new conversation. */
        ConversationInput: {
            /**
             * Format: uuid
             * @description Optional client-generated ID for creation. Omit to generate an ID on the server. An existing ID returns 409.
             */
            id?: string;
            /** Format: uuid */
            thingId?: string | null;
        };
        /** @description A page of categories. nextCursor is null when no further page is available. */
        CategoryList: {
            items: components["schemas"]["Category"][];
            nextCursor: string | null;
        };
        /** @description A page of field sets. nextCursor is null when no further page is available. */
        FieldSetList: {
            items: components["schemas"]["FieldSet"][];
            nextCursor: string | null;
        };
        /** @description A page of field definitions. nextCursor is null when no further page is available. */
        FieldDefinitionList: {
            items: components["schemas"]["FieldDefinition"][];
            nextCursor: string | null;
        };
        /** @description A page of Thing summaries. nextCursor is null when no further page is available. */
        ThingSummaryList: {
            items: components["schemas"]["ThingSummary"][];
            nextCursor: string | null;
        };
        /** @description A page of tags. nextCursor is null when no further page is available. */
        TagList: {
            items: components["schemas"]["Tag"][];
            nextCursor: string | null;
        };
        /** @description A page of attachments. nextCursor is null when no further page is available. */
        AttachmentList: {
            items: components["schemas"]["Attachment"][];
            nextCursor: string | null;
        };
        /** @description A page of issues. nextCursor is null when no further page is available. */
        IssueList: {
            items: components["schemas"]["Issue"][];
            nextCursor: string | null;
        };
        /** @description A page of events. nextCursor is null when no further page is available. */
        EventList: {
            items: components["schemas"]["Event"][];
            nextCursor: string | null;
        };
        /** @description A page of product suggestions. nextCursor is null when no further page is available. */
        PurchasableList: {
            items: components["schemas"]["Purchasable"][];
            nextCursor: string | null;
        };
        /** @description Thing detected in an attachment and offered for confirmation. */
        ImportCandidate: {
            id: string;
            name: string;
            categoryId: string;
        };
        /** @description AI model, token counts, elapsed time and tool results for a processing attempt. */
        ImportUsage: {
            model: string;
            inputTokens: number;
            outputTokens: number;
            cachedTokens: number;
            elapsedMs: number;
            toolCalls: {
                name: string;
                resultCount: number;
                truncated: boolean;
            }[];
            /** @description Per-request task, model, token counts and latency, including retries. Older jobs may omit these entries. */
            entries?: components["schemas"]["AiUsageEntry"][];
        };
        /** @description Import status, detected candidates, resulting Thing IDs and processing details. */
        Import: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            attachmentId: string;
            /** Format: uuid */
            thingId: string | null;
            status: components["schemas"]["ImportStatusEnum"];
            candidates: components["schemas"]["ImportCandidate"][];
            thingIds: string[];
            error: string | null;
            usage: components["schemas"]["ImportUsage"];
            /** @description Warnings for unfinished optional research. Imported fields and successful documents remain available. */
            warnings?: components["schemas"]["ImportWarning"][];
        };
        /** @description Attachment to process and an optional existing Thing to update. */
        ImportStart: {
            /** Format: uuid */
            attachmentId: string;
            /** Format: uuid */
            thingId?: string;
        };
        /** @description Queued import ID, target Thing ID and initial status. */
        ImportAccepted: {
            /** Format: uuid */
            importId: string;
            /** Format: uuid */
            thingId: string;
            status: components["schemas"]["ImportStatusEnum"];
        };
        /** @description Detected candidates selected for import. Each targetThingId identifies an existing Thing or is null to create one. */
        ImportConfirmation: {
            selections: {
                candidateId: string;
                /** Format: uuid */
                targetThingId: string | null;
            }[];
        };
        /** @description Reference to a Thing, field, attachment, issue, event or product suggestion. Availability indicates whether the referenced record can still be accessed. */
        ResourceCard: {
            /** @constant */
            type: "THING";
            /** Format: uuid */
            thingId: string;
            available?: boolean;
        } | {
            /** @constant */
            type: "FIELD";
            /** Format: uuid */
            thingId: string;
            available?: boolean;
            fieldSetId: string | null;
            /** @description Registry field ID; null for a custom field. */
            fieldId: string | null;
            /**
             * Format: uuid
             * @description Custom field ID from the referenced Thing. Present only when fieldId and fieldSetId are null.
             */
            customFieldId?: string;
        } | {
            /** @constant */
            type: "ATTACHMENT";
            /** Format: uuid */
            attachmentId: string;
            available?: boolean;
            page?: number;
            /** @description Distinct one-based pages cited from this attachment, in ascending order. The page property retains the first cited page. */
            pages?: number[];
        } | {
            /** @constant */
            type: "ISSUE";
            /** Format: uuid */
            issueId: string;
            available?: boolean;
        } | {
            /** @constant */
            type: "EVENT";
            /** Format: uuid */
            eventId: string;
            available?: boolean;
        } | {
            /** @constant */
            type: "PURCHASABLE";
            /** Format: uuid */
            purchasableId: string;
            available?: boolean;
        };
        /** @description User message and request ID. Reuse the ID and text to retry the same message. */
        MessageInput: {
            text: string;
            /** Format: uuid */
            requestId: string;
        };
        /** @description Streamed text fragment with its message ID and offset in the message text. */
        ConversationDelta: {
            /** Format: uuid */
            messageId: string;
            offset: number;
            text: string;
        };
        /** @description View count and last-viewed timestamp after recording a user opening a Thing. */
        ThingAccess: {
            /** @description Number of explicit user views recorded for this Thing. */
            accessCount: number;
            /**
             * Format: date-time
             * @description Most recent explicit user view; null until first viewed.
             */
            lastViewedAt: string | null;
        };
        /** @description Selected attachment properties to update. Omitted properties keep their values; null removes a value. Automatic document processing preserves values edited or removed by the user. Filename, file content and page count are read-only. */
        AttachmentPatch: {
            /** @description Display title; null displays the original filename. */
            title?: string | null;
            documentType?: components["schemas"]["AttachmentDocumentTypeEnum"] | null;
            /** @description Manufacturer, retailer or organisation that issued the document. */
            publisher?: string | null;
            /**
             * Format: date
             * @description Original document date, independent of upload time.
             */
            documentDate?: string | null;
        };
        /** @description Origin and supporting sources for an attachment property. USER also records values explicitly removed by the user. */
        AttachmentMetadataSource: {
            origin: components["schemas"]["AttachmentMetadataOriginEnum"];
            sourceRefs: components["schemas"]["SourceRef"][];
        };
        /** @description Source information for each attachment property. An absent entry means its origin is unknown. Extracted quotes are omitted. */
        AttachmentMetadataSources: {
            title?: components["schemas"]["AttachmentMetadataSource"];
            documentType?: components["schemas"]["AttachmentMetadataSource"];
            publisher?: components["schemas"]["AttachmentMetadataSource"];
            documentDate?: components["schemas"]["AttachmentMetadataSource"];
        };
        /** @description Usage for one provider request, identified by task and model. */
        AiUsageEntry: {
            task: string;
            model: string;
            inputTokens: number;
            outputTokens: number;
            cachedTokens: number;
            elapsedMs: number;
        };
        /** @description A research operation that could not complete, with a generic reason and optional public source URL. */
        ImportWarning: {
            /** Format: uuid */
            thingId: string;
            code: components["schemas"]["ImportWarningCodeEnum"];
            /** @description Cited public document URL, or null for a search or overall processing warning. */
            sourceUrl: string | null;
            /** @description Whether another attempt may succeed without changing the document limits. */
            retryable: boolean;
            /** @description Observed byte size, text character count or page count, when known. */
            actual: number | null;
            /** @description Applicable byte, text character or page limit, when known. */
            limit: number | null;
        };
        /**
         * @description Whether an issue is open or resolved.
         * @enum {string}
         */
        IssueStatusEnum: "OPEN" | "RESOLVED";
        /**
         * @description Whether an event is suggested, scheduled, completed or dismissed.
         * @enum {string}
         */
        EventStatusEnum: "SUGGESTED" | "SCHEDULED" | "COMPLETED" | "DISMISSED";
        /**
         * @description Type of product suggestion: consumable, accessory or upgrade.
         * @enum {string}
         */
        PurchasableKindEnum: "CONSUMABLE" | "ACCESSORY" | "UPGRADE";
        /**
         * @description Supported ISO 4217 currency code.
         * @enum {string}
         */
        CurrencyEnum: "GBP" | "EUR" | "USD";
        /**
         * @description JSON data type accepted by a field validation schema.
         * @enum {string}
         */
        SchemaTypeEnum: "string" | "number" | "integer" | "boolean" | "object";
        /**
         * @description Date or timestamp format accepted by a field validation schema.
         * @enum {string}
         */
        SchemaFormatEnum: "date" | "date-time";
        /**
         * @description Suggested input control for displaying and editing a field.
         * @enum {string}
         */
        UiHintEnum: "TEXT" | "TEXTAREA" | "NUMBER" | "CHECKBOX" | "SELECT" | "DATE" | "DATETIME" | "MONEY" | "PASSWORD";
        /**
         * @description Whether a field value was entered by the user, extracted from an uploaded source or enriched from a reference document.
         * @enum {string}
         */
        FieldOriginEnum: "USER" | "IMPORT" | "DISCOVERY";
        /**
         * @description Data type of a custom field value.
         * @enum {string}
         */
        ValueTypeEnum: "STRING" | "NUMBER" | "BOOLEAN" | "MONEY";
        /**
         * @description Current stage or outcome of document processing. COMPLETE can include warnings for unfinished optional research.
         * @enum {string}
         */
        ImportStatusEnum: "QUEUED" | "EXTRACTING" | "AWAITING_SELECTION" | "MAPPING" | "DISCOVERING" | "COMPLETE" | "INCOMPLETE" | "FAILED";
        /**
         * @description Whether a message was written by the user or the assistant.
         * @enum {string}
         */
        MessageRoleEnum: "USER" | "ASSISTANT";
        /**
         * @description Current processing state of a conversation message.
         * @enum {string}
         */
        MessageStatusEnum: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
        /**
         * @description Descending Thing list order. MOST_VIEWED breaks ties by lastViewedAt; all orders finally break ties by ID. Unviewed Things sort last for RECENTLY_VIEWED.
         * @enum {string}
         */
        ThingSortEnum: "UPDATED" | "RECENTLY_VIEWED" | "MOST_VIEWED";
        /**
         * @description Document classification, such as a manual, receipt or invoice. Null on an Attachment means unknown.
         * @enum {string}
         */
        AttachmentDocumentTypeEnum: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER";
        /**
         * @description Whether attachment metadata came from a user edit, an import or source discovery.
         * @enum {string}
         */
        AttachmentMetadataOriginEnum: "USER" | "IMPORT" | "DISCOVERY";
        /**
         * @description Reason an optional research operation could not complete. PAGE_BUDGET identifies persisted page-limited imports.
         * @enum {string}
         */
        ImportWarningCodeEnum: "SIZE_LIMIT" | "MODEL_INPUT_LIMIT" | "PAGE_BUDGET" | "TIMEOUT" | "UNAVAILABLE" | "EXTRACTION_FAILED" | "RESEARCH_FAILED";
    };
    responses: {
        /** @description A valid bearer token is required. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The resource is missing, inaccessible or disabled. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The request conflicts with current state or an existing record. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The uploaded file exceeds the configured limit. */
        TooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The file or request media type is unsupported. */
        UnsupportedMedia: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The request or a referenced value is invalid. */
        InvalidInput: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The requested capability is not configured or available. */
        Unavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The request failed; private diagnostics are omitted. */
        ServerError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        /** @description Maximum number of results. */
        limit: number;
        /** @description Opaque cursor returned by the previous page. */
        cursor: string;
        /** @description Category id. */
        categoryId: string;
        /** @description Text used to search matching records. */
        search: string;
        /** @description Id. */
        registryId: string;
        /** @description Id. */
        resourceId: string;
        /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
        thingId: string;
        /** @description Owned Thing that receives this Attachment. Processing is restricted to this Thing. */
        attachmentThingId: string;
        /** @description Thing id. */
        thingIdPath: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Config"];
                };
            };
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
        };
    };
    getProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Profile"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    seedSamples: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Profile"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listCategories: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listFieldSets: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Category id. */
                categoryId?: components["parameters"]["categoryId"];
                /** @description Text used to search matching records. */
                q?: components["parameters"]["search"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FieldSetList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getFieldSet: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["registryId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FieldSet"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listFieldDefinitions: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Text used to search matching records. */
                q?: components["parameters"]["search"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FieldDefinitionList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getField: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["registryId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FieldDefinition"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listThingSummaries: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Category id. */
                categoryId?: components["parameters"]["categoryId"];
                /** @description Tag id. */
                tagId?: string;
                /** @description Text used to search matching records. */
                q?: components["parameters"]["search"];
                /** @description Sort order; defaults to UPDATED. Applied before pagination. */
                sort?: components["schemas"]["ThingSortEnum"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ThingSummaryList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    createThing: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThingCreate"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thing"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getThing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thing"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    deleteThing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    patchThing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThingPatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thing"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    revealField: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevealRequest"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevealResult"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listTags: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    createTag: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagInput"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    deleteTag: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    patchTag: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagInput"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listAttachments: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
                thingId?: components["parameters"]["thingId"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttachmentList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    uploadAttachment: {
        parameters: {
            query?: {
                /** @description Owned Thing that receives this Attachment. Processing is restricted to this Thing. */
                thingId?: components["parameters"]["attachmentThingId"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: Blob;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Attachment"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["UnsupportedMedia"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Attachment"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    deleteAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    patchAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachmentPatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Attachment"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    downloadAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": Blob;
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    linkAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
                /** @description Thing id. */
                thingId: components["parameters"]["thingIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    unlinkAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
                /** @description Thing id. */
                thingId: components["parameters"]["thingIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listIssues: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
                thingId?: components["parameters"]["thingId"];
                /** @description Status. */
                status?: components["schemas"]["IssueStatusEnum"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IssueList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    createIssue: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IssueInput"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getIssue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    patchIssue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IssuePatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listEvents: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
                thingId?: components["parameters"]["thingId"];
                /** @description Status. */
                status?: components["schemas"]["EventStatusEnum"];
                /** @description Inclusive lower start-time bound. */
                from?: string;
                /** @description Inclusive upper start-time bound. */
                to?: string;
                /** @description IANA timezone used to compare date-only events to from/to and order mixed schedules. Defaults to UTC. */
                timeZone?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    createEvent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventInput"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Event"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Event"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    patchEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventPatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Event"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listPurchasables: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
                thingId?: components["parameters"]["thingId"];
                /** @description Kind. */
                kind?: components["schemas"]["PurchasableKindEnum"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchasableList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getPurchasable: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Purchasable"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    listConversations: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: components["parameters"]["limit"];
                /** @description Opaque cursor returned by the previous page. */
                cursor?: components["parameters"]["cursor"];
                /** @description Filter by Thing. Missing or inaccessible Things return an empty list. */
                thingId?: components["parameters"]["thingId"];
                /** @description Minimum persisted message count, including user and assistant messages in every status. Use 1 to exclude empty conversations. */
                minMessageCount?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConversationSummaryList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    createConversation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConversationInput"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getConversation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    startImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImportStart"];
            };
        };
        responses: {
            /** @description Success */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportAccepted"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    getImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Import"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    confirmImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImportConfirmation"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Import"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    retryImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Import"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    streamThing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Thing id. */
                thingId: components["parameters"]["thingIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Full masked Thing snapshots; event: thing.snapshot; id: revision. Reconnect sends current persisted state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    sendMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MessageInput"];
            };
        };
        responses: {
            /** @description Success */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    streamConversation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Active conversation snapshots (conversation.snapshot) and text deltas (conversation.delta). Reconnect restores saved messages and current transient text; deltas include message ID and offset. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
            503: components["responses"]["Unavailable"];
        };
    };
    recordThingView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: components["parameters"]["resourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Updated access metadata. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ThingAccess"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidInput"];
            500: components["responses"]["ServerError"];
        };
    };
}
