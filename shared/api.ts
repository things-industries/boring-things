export interface paths {
    "/api/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get config */
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
        /** Get profile */
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
        /** Seed samples */
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
        /** List categorys */
        get: operations["listCategorys"];
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
        /** List field sets */
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
        /** Get field set */
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
        /** List field definitions */
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
        /** Get field */
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
         * List thing summarys
         * @description Owner-scoped summaries ordered by updatedAt descending by default, then ID ascending. Category names provide card subtitles; a Thing is New while its creation age is less than seven days.
         */
        get: operations["listThingSummarys"];
        put?: never;
        /** Create thing */
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
        /** Get thing */
        get: operations["getThing"];
        put?: never;
        post?: never;
        /** Delete thing */
        delete: operations["deleteThing"];
        options?: never;
        head?: never;
        /** Patch thing */
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
        /** Reveal field */
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
        /** List tags */
        get: operations["listTags"];
        put?: never;
        /** Create tag */
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
        /** Delete tag */
        delete: operations["deleteTag"];
        options?: never;
        head?: never;
        /** Patch tag */
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
        /** List attachments */
        get: operations["listAttachments"];
        put?: never;
        /** Upload attachment */
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
        /** Get attachment */
        get: operations["getAttachment"];
        put?: never;
        post?: never;
        /** Delete attachment */
        delete: operations["deleteAttachment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/attachments/{id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download attachment */
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
        /** Link attachment */
        put: operations["linkAttachment"];
        post?: never;
        /** Unlink attachment */
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
        /** List issues */
        get: operations["listIssues"];
        put?: never;
        /** Create issue */
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
        /** Get issue */
        get: operations["getIssue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Patch issue */
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
         * @description Events ordered by schedule ascending, then ID; unscheduled events last. Date-only events sort at midnight in timeZone. Bounds are inclusive: timed events compare instants; date-only events compare the calendar date of each bound in timeZone, including the entire matching day.
         */
        get: operations["listEvents"];
        put?: never;
        /** Create event */
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
        /** Get event */
        get: operations["getEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Patch event */
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
        /** List purchasables */
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
        /** Get purchasable */
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
        get?: never;
        put?: never;
        /** Create conversation */
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
        /** Get conversation */
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
        /** Start import */
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
        /** Get import */
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
        /** Confirm import */
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
        /** Retry import */
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
        /** Stream thing */
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
        /** Send message */
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
         * @description Authenticated SSE: conversation.snapshot contains Conversation; conversation.delta contains ConversationDelta (message ID, text offset). Snapshots replace local state on reconnect. Failed messages retry with the same request ID.
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
         * @description Call once when a user opens a Thing page. Atomically increments accessCount and records server time in lastViewedAt. Reads and stream refreshes do not record views. Does not change updatedAt or content revision. Each successful request counts once; clients must not automatically retry.
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
        /** @description Public failure message and HTTP status; private diagnostic details are omitted. */
        Error: {
            message: string;
            statusCode: number;
        };
        /** @description Amount in integer minor units and a supported currency with two decimal places. */
        Money: {
            amountMinor: number;
            currency: components["schemas"]["CurrencyEnum"];
        };
        /** @description A stored scalar or money value. Identifiers retain their string representation. */
        Value: string | number | boolean | components["schemas"]["Money"];
        /** @description A field value, or null for an empty, cleared or masked field. */
        NullableValue: components["schemas"]["Value"] | null;
        /** @description Attachment or public URL supporting a value; quotes may be omitted for sensitive fields. */
        SourceRef: {
            /** Format: uuid */
            attachmentId?: string;
            page?: number;
            quote?: string;
            /** Format: uri */
            url?: string;
        };
        /** @description Reference to a field within its set, a standalone field, or a custom field. */
        Pin: {
            fieldSetId?: string | null;
            fieldId?: string;
            /** Format: uuid */
            undefinedFieldId?: string;
        };
        /** @description Supported JSON Schema subset used to validate registry field values. */
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
        /** @description Authored registry definition reused across categories and field sets. */
        FieldDefinition: {
            id: string;
            name: string;
            description: string;
            keywords: string[];
            schema: components["schemas"]["FieldSchema"];
            uiHint: components["schemas"]["UiHintEnum"];
            sensitive: boolean;
        };
        /** @description A field definition with its current value, provenance and masking state. */
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
        };
        /** @description Category-specific field group with required and suggested related sets. */
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
        /** @description Selected field set expanded with current field values. */
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
        /** @description Owner-specific custom field preserving data without a registry definition. */
        UndefinedField: {
            /** Format: uuid */
            id: string;
            label: string;
            value: components["schemas"]["NullableValue"];
            sensitive: boolean;
            masked: boolean;
            origin: components["schemas"]["FieldOriginEnum"];
            sourceRefs: components["schemas"]["SourceRef"][];
            valueType: components["schemas"]["ValueTypeEnum"];
        };
        /** @description Authored Thing category with owner-scoped Thing count. */
        Category: {
            id: string;
            name: string;
            description: string;
            icon: string;
            defaultImage: string | null;
            sortOrder: number;
            thingCount: number;
        };
        /** @description Authenticated owner profile and sample-data status. */
        Profile: {
            /** Format: uuid */
            id: string;
            displayName: string;
            samplesAdded: boolean;
        };
        /** @description Public client configuration and feature availability; contains no server credentials. */
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
        /** @description Owner-defined label used to organise Things. */
        Tag: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        /** @description Name for an owner-scoped tag; whitespace-only names are rejected. */
        TagInput: {
            name: string;
        };
        /** @description Public Thing metadata excluding stored field values. */
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
        /** @description Owner-scoped Thing detail with masked fields, links and current import state. */
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
            undefinedFields: components["schemas"]["UndefinedField"][];
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
            } | null;
            /** @description Number of explicit user views recorded for this Thing. */
            accessCount: number;
            /**
             * Format: date-time
             * @description Most recent explicit user view; null until first viewed.
             */
            lastViewedAt: string | null;
        };
        /** @description Set or standalone field update; null clears the stored value. */
        ValuePatch: {
            fieldSetId: string | null;
            fieldId: string;
            value: components["schemas"]["NullableValue"];
        };
        /** @description Custom field update retaining its identity and sensitivity. */
        UndefinedPatch: {
            /** Format: uuid */
            id?: string;
            label: string;
            value: components["schemas"]["Value"];
            sensitive: boolean;
        };
        /** @description Initial Thing metadata and optional field, tag and pin selections. */
        ThingCreate: {
            name: string;
            description?: string;
            categoryId: string;
            tagIds?: string[];
            addFieldSetIds?: string[];
            removeFieldSetIds?: string[];
            values?: components["schemas"]["ValuePatch"][];
            undefinedFields?: components["schemas"]["UndefinedPatch"][];
            removeUndefinedFieldIds?: string[];
            pinnedFields?: components["schemas"]["Pin"][];
            /** Format: uuid */
            imageAttachmentId?: string | null;
        };
        /** @description Specified Thing updates, merged under a lock while preserving other values. */
        ThingPatch: {
            name?: string;
            description?: string;
            categoryId?: string;
            tagIds?: string[];
            addFieldSetIds?: string[];
            removeFieldSetIds?: string[];
            values?: components["schemas"]["ValuePatch"][];
            undefinedFields?: components["schemas"]["UndefinedPatch"][];
            removeUndefinedFieldIds?: string[];
            pinnedFields?: components["schemas"]["Pin"][];
            /** Format: uuid */
            imageAttachmentId?: string | null;
        };
        /** @description Field reference for an explicit owner-authorised sensitive-value read. */
        RevealRequest: components["schemas"]["Pin"];
        /** @description Revealed field value; responses must not be cached. */
        RevealResult: {
            value: components["schemas"]["NullableValue"];
        };
        /** @description Private attachment metadata and linked Things; excludes storage keys. */
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
        };
        /** @description Problem associated with one Thing, including resolution state. */
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
        /** @description New Thing issue; defaults to OPEN. */
        IssueInput: {
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
        /** @description Specified issue updates; resolving retains the first resolution timestamp. */
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
        /** @description Suggested or scheduled Thing task with lifecycle timestamps and provenance. SCHEDULED requires exactly one of startsOn or startsAt; other statuses allow neither, but never both. */
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
        /** @description New Thing event. SCHEDULED requires exactly one of startsOn or startsAt; other statuses allow neither, but never both. */
        EventInput: {
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
        /** @description Specified event updates; null clears optional links or dates. SCHEDULED requires exactly one of startsOn or startsAt; other statuses allow neither, but never both. */
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
        /** @description Cited consumable, accessory or upgrade suggestion; sample actions are disabled. */
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
        /** @description Persisted conversation message with citations, cards and execution state. */
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
            sourceRefs: components["schemas"]["SourceRef"][];
            status: components["schemas"]["MessageStatusEnum"];
            /** Format: date-time */
            createdAt: string;
            error?: string | null;
            usage?: components["schemas"]["ImportUsage"] | null;
        };
        /** @description Active owner-scoped conversation and its persisted messages. */
        Conversation: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thingId: string | null;
            messages: components["schemas"]["Message"][];
        };
        /** @description Optional Thing context for a new conversation. */
        ConversationInput: {
            /** Format: uuid */
            thingId?: string | null;
        };
        /** @description Paginated category results and an opaque continuation cursor. */
        CategoryList: {
            items: components["schemas"]["Category"][];
            nextCursor: string | null;
        };
        /** @description Paginated field set results and an opaque continuation cursor. */
        FieldSetList: {
            items: components["schemas"]["FieldSet"][];
            nextCursor: string | null;
        };
        /** @description Paginated field definition results and an opaque continuation cursor. */
        FieldDefinitionList: {
            items: components["schemas"]["FieldDefinition"][];
            nextCursor: string | null;
        };
        /** @description Paginated thing summary results and an opaque continuation cursor. */
        ThingSummaryList: {
            items: components["schemas"]["ThingSummary"][];
            nextCursor: string | null;
        };
        /** @description Paginated tag results and an opaque continuation cursor. */
        TagList: {
            items: components["schemas"]["Tag"][];
            nextCursor: string | null;
        };
        /** @description Paginated attachment results and an opaque continuation cursor. */
        AttachmentList: {
            items: components["schemas"]["Attachment"][];
            nextCursor: string | null;
        };
        /** @description Paginated issue results and an opaque continuation cursor. */
        IssueList: {
            items: components["schemas"]["Issue"][];
            nextCursor: string | null;
        };
        /** @description Paginated event results and an opaque continuation cursor. */
        EventList: {
            items: components["schemas"]["Event"][];
            nextCursor: string | null;
        };
        /** @description Paginated purchasable results and an opaque continuation cursor. */
        PurchasableList: {
            items: components["schemas"]["Purchasable"][];
            nextCursor: string | null;
        };
        /** @description Detected Thing offered for owner confirmation. */
        ImportCandidate: {
            id: string;
            name: string;
            categoryId: string;
        };
        /** @description Provider usage and bounded tool execution totals for an attempt. */
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
        };
        /** @description Public import state excluding raw extraction and private source content. */
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
        };
        /** @description Source attachment and optional existing Thing to enrich. */
        ImportStart: {
            /** Format: uuid */
            attachmentId: string;
            /** Format: uuid */
            thingId?: string;
        };
        /** @description Queued import identity and initial Thing identity. */
        ImportAccepted: {
            /** Format: uuid */
            importId: string;
            /** Format: uuid */
            thingId: string;
            status: components["schemas"]["ImportStatusEnum"];
        };
        /** @description Selected detected candidates and their optional existing targets. */
        ImportConfirmation: {
            selections: {
                candidateId: string;
                /** Format: uuid */
                targetThingId: string | null;
            }[];
        };
        /** @description Typed reference to an owned resource; availability reflects current access. */
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
            fieldId: string;
        } | {
            /** @constant */
            type: "ATTACHMENT";
            /** Format: uuid */
            attachmentId: string;
            available?: boolean;
            page?: number;
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
        /** @description Idempotent message request. The assistant infers requested actions from the conversation. */
        MessageInput: {
            text: string;
            /** Format: uuid */
            requestId: string;
        };
        /** @description Transient text update identified by message and text offset. */
        ConversationDelta: {
            /** Format: uuid */
            messageId: string;
            offset: number;
            text: string;
        };
        /** @description Usage metadata returned after recording a user view. */
        ThingAccess: {
            /** @description Number of explicit user views recorded for this Thing. */
            accessCount: number;
            /**
             * Format: date-time
             * @description Most recent explicit user view; null until first viewed.
             */
            lastViewedAt: string | null;
        };
        /**
         * @description Issue status.
         * @enum {string}
         */
        IssueStatusEnum: "OPEN" | "RESOLVED";
        /**
         * @description Event status.
         * @enum {string}
         */
        EventStatusEnum: "SUGGESTED" | "SCHEDULED" | "COMPLETED" | "DISMISSED";
        /**
         * @description Purchasable kind.
         * @enum {string}
         */
        PurchasableKindEnum: "CONSUMABLE" | "ACCESSORY" | "UPGRADE";
        /**
         * @description Currency.
         * @enum {string}
         */
        CurrencyEnum: "GBP" | "EUR" | "USD";
        /**
         * @description Schema type.
         * @enum {string}
         */
        SchemaTypeEnum: "string" | "number" | "integer" | "boolean" | "object";
        /**
         * @description Schema format.
         * @enum {string}
         */
        SchemaFormatEnum: "date" | "date-time";
        /**
         * @description Ui hint.
         * @enum {string}
         */
        UiHintEnum: "TEXT" | "TEXTAREA" | "NUMBER" | "CHECKBOX" | "SELECT" | "DATE" | "DATETIME" | "MONEY" | "PASSWORD";
        /**
         * @description Field origin.
         * @enum {string}
         */
        FieldOriginEnum: "USER" | "IMPORT";
        /**
         * @description Value type.
         * @enum {string}
         */
        ValueTypeEnum: "STRING" | "NUMBER" | "BOOLEAN" | "MONEY";
        /**
         * @description Import status.
         * @enum {string}
         */
        ImportStatusEnum: "QUEUED" | "EXTRACTING" | "AWAITING_SELECTION" | "MAPPING" | "DISCOVERING" | "COMPLETE" | "INCOMPLETE" | "FAILED";
        /**
         * @description Message role.
         * @enum {string}
         */
        MessageRoleEnum: "USER" | "ASSISTANT";
        /**
         * @description Message status.
         * @enum {string}
         */
        MessageStatusEnum: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
        /**
         * @description Descending Thing list order. MOST_VIEWED breaks ties by lastViewedAt; all orders finally break ties by ID. Unviewed Things sort last for RECENTLY_VIEWED.
         * @enum {string}
         */
        ThingSortEnum: "UPDATED" | "RECENTLY_VIEWED" | "MOST_VIEWED";
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
    parameters: never;
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
    listCategorys: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Category id. */
                categoryId?: string;
                /** @description Text used to search matching records. */
                q?: string;
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
                id: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Text used to search matching records. */
                q?: string;
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
                id: string;
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
    listThingSummarys: {
        parameters: {
            query?: {
                /** @description Maximum number of results. */
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Category id. */
                categoryId?: string;
                /** @description Tag id. */
                tagId?: string;
                /** @description Text used to search matching records. */
                q?: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
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
                id: string;
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
                id: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Thing id. */
                thingId?: string;
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
            query?: never;
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
                id: string;
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
                id: string;
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
    downloadAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id. */
                id: string;
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
                id: string;
                /** @description Thing id. */
                thingId: string;
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
                id: string;
                /** @description Thing id. */
                thingId: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Thing id. */
                thingId?: string;
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
                id: string;
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
                id: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Thing id. */
                thingId?: string;
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
                id: string;
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
                id: string;
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
                limit?: number;
                /** @description Opaque cursor returned by the previous page. */
                cursor?: string;
                /** @description Thing id. */
                thingId?: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
                thingId: string;
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
                id: string;
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
                id: string;
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
                id: string;
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
