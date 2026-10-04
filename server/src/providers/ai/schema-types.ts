/**
 * Generated provider response and tool-argument types. Regenerate with pnpm ai:generate.
 */

export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description result. */
        Extraction: {
            metadata: {
                /** @description Display title; null displays the original filename. */
                title: string | null;
                /**
                 * @description document Type.
                 * @enum {string|null}
                 */
                documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                /** @description Manufacturer, retailer or organisation that issued the document. */
                publisher: string | null;
                /** @description Original document date as YYYY-MM-DD when supported, otherwise null. */
                documentDate: string | null;
            } | null;
            /** @description Readable source transcription. */
            text: string;
            /** @description Identified source subjects, preserving the provider wire representation. */
            candidates: {
                /** @description Readable source transcription. */
                id: string;
                /** @description Readable source transcription. */
                name: string;
                /** @description Readable source transcription. */
                categoryId: string;
                /** @description terms. */
                terms: string[];
                /** @description facts. */
                facts: {
                    /** @description Readable source transcription. */
                    id: string;
                    /** @description Readable source transcription. */
                    label: string;
                    value: string | number | boolean | {
                        /** @description amount Minor. */
                        amountMinor: number;
                        /**
                         * @description currency.
                         * @enum {string}
                         */
                        currency: "GBP" | "EUR" | "USD";
                    };
                    /** @description Readable source transcription. */
                    quote: string;
                    /** @description One-based source page when available; null otherwise. */
                    page: number | null;
                    /** @description Whether the fact contains a secret requiring masking. */
                    sensitive: boolean;
                }[];
            }[];
        };
        /** @description result. */
        Selection: {
            /** @description terms. */
            setIds: string[];
        };
        /** @description result. */
        Mapping: {
            /** @description values. */
            values: {
                /** @description Readable source transcription. */
                factId: string;
                /** @description Selected field-set address; null for a standalone field. */
                fieldSetId: string | null;
                /** @description Readable source transcription. */
                fieldId: string;
                value: string | number | boolean | {
                    /** @description amount Minor. */
                    amountMinor: number;
                    /**
                     * @description currency.
                     * @enum {string}
                     */
                    currency: "GBP" | "EUR" | "USD";
                };
                /** @description Whether to suggest a non-sensitive pinned field. */
                pin: boolean;
            }[];
        };
        /** @description result. */
        Discovery: {
            identity: {
                /** @description Readable source transcription. */
                name: string;
                /** @description Readable source transcription. */
                sourceUrl: string;
            } | null;
            /** @description items. */
            items: {
                /**
                 * @description kind.
                 * @enum {string}
                 */
                kind: "reference" | "maintenance" | "consumable" | "accessory" | "upgrade";
                /** @description Readable source transcription. */
                title: string;
                /** @description Readable source transcription. */
                description: string;
                /** @description Readable source transcription. */
                url: string;
                /** @description Readable source transcription. */
                sourceUrl: string;
                metadata: {
                    /** @description Display title; null displays the original filename. */
                    title: string | null;
                    /**
                     * @description document Type.
                     * @enum {string|null}
                     */
                    documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                    /** @description Manufacturer, retailer or organisation that issued the document. */
                    publisher: string | null;
                    /** @description Original document date as YYYY-MM-DD when supported, otherwise null. */
                    documentDate: string | null;
                } | null;
            }[];
        };
        /** @description result. */
        search_field_sets: {
            /** @description Readable source transcription. */
            categoryId: string;
            /** @description Source-supported type, brand and model search terms. */
            terms: string[];
        };
        /** @description result. */
        search_fields: {
            /** @description Observed labels and surrounding evidence to search in one batch. */
            labels: {
                /** @description Readable source transcription. */
                label: string;
                /** @description Readable source transcription. */
                context: string;
            }[];
        };
        /** @description result. */
        search_things: {
            /** @description Text matched against owned Thing names; empty text lists recent Things. */
            query: string;
        };
        /** @description result. */
        read_thing: {
            /**
             * Format: uuid
             * @description thing Id.
             */
            thingId: string;
        };
        /** @description result. */
        read_attachment: {
            /**
             * Format: uuid
             * @description thing Id.
             */
            attachmentId: string;
        };
        /** @description result. */
        discover: {
            /**
             * Format: uuid
             * @description thing Id.
             */
            thingId: string;
            /**
             * @description Research target requested by the owner.
             * @enum {string}
             */
            focus: "reference" | "maintenance" | "products";
        };
        /** @description result. */
        create_event: {
            /**
             * Format: uuid
             * @description thing Id.
             */
            thingId: string;
            /** @description Owner-requested task or problem title. */
            title: string;
            /** @description query. */
            description: string;
        };
        /** @description result. */
        create_issue: {
            /**
             * Format: uuid
             * @description thing Id.
             */
            thingId: string;
            /** @description Owner-requested task or problem title. */
            title: string;
            /** @description query. */
            description: string;
        };
        /** @description result. */
        show_cards: {
            /** @description Previously read resources to cite as interactive cards. */
            cards: {
                /**
                 * @description type.
                 * @enum {string}
                 */
                type: "THING" | "FIELD" | "ATTACHMENT" | "ISSUE" | "EVENT" | "PURCHASABLE";
                /**
                 * Format: uuid
                 * @description thing Id.
                 */
                id: string;
                /** @description Selected field-set address; null for a standalone field. */
                fieldSetId: string | null;
                /** @description Field identifier retrieved from registry tools. */
                fieldId: string | null;
                /** @description One-based source page when available; null otherwise. */
                page: number | null;
            }[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
