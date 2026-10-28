/**
 * Generated provider response and tool-argument types. Regenerate with pnpm ai:generate.
 */

export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Readable content and metadata of one Attachment. */
        Transcription: {
            /** @description Page-labelled English transcription and relevant visual descriptions. */
            text: string;
            /** @description Source-wide summary, or null when unreadable. */
            summary: string | null;
            /** @description Source-wide terms without private identifiers. */
            terms: string[];
            /**
             * @description Outcome of reading the source.
             * @enum {string}
             */
            status: "COMPLETE" | "EMPTY" | "PARTIAL" | "INSUFFICIENT_LANGUAGE";
            /** @description Source display metadata. */
            metadata: {
                /** @description Short descriptive display title based on the content or visible purpose, such as 'Data plate photo', 'Product photo' or 'Receipt from Amazon', excluding account numbers, serial numbers and secrets (min 1 char, max 200 chars). */
                title: string | null;
                /**
                 * @description Classification of the document by its purpose: MANUAL for operation or care instructions, RECEIPT for proof of purchase, INVOICE for a payment request, INSTALLATION_GUIDE for setup instructions, SPECIFICATION for technical data, or OTHER for another document type; null when the type is unknown.
                 * @enum {string|null}
                 */
                documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                /** @description Manufacturer, retailer or organisation that issued the document, as supported by the source; null when unknown (min 1 char, max 200 chars). */
                publisher: string | null;
                /**
                 * Format: date
                 * @description Original issue date printed in the document, formatted YYYY-MM-DD; null for missing or incomplete dates. A receipt's purchase date may serve as its document date; website update dates do not establish the document date.
                 */
                documentDate: string | null;
            } | null;
            /** @description Up to 30 identifier observations copied from the source. */
            identifiers: {
                /** @description Printed identifier label or a short description. */
                label: string;
                /** @description Raw identifier string retaining leading zeroes. */
                value: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim passage showing the identifier. */
                quote: string;
            }[];
        };
        /** @description Candidate identity and matching decision. */
        Resolution: {
            /** @description Up to 10 candidate descriptions; the application processes one. */
            candidates: {
                /** @description Short Thing name without private identifiers. */
                name: string;
                /** @description Recognised category ID. */
                categoryId: string;
                /** @description Up to 20 relevant Thing terms. */
                terms: string[];
                /** @description Up to 30 evidenced identifiers. */
                identifiers: {
                    /** @description Category-valid registry identifier field ID. */
                    fieldId: string;
                    /** @description Observed identifier as a string. */
                    value: string;
                    /** @description Attachment ID copied from the supplied source. */
                    attachmentId: string;
                    /** @description Original one-based page number, or null for unpaginated text. */
                    page: number | null;
                    /** @description Verbatim source passage, up to 2000 characters. */
                    quote: string;
                }[];
                /** @description Contributing Attachment IDs. */
                attachmentIds: string[];
                /** @description Relative evidence strength from 0 to 1. */
                strength: number;
                /** @description Owned Thing ID from the supplied matching candidates, or null. */
                matchedThingId: string | null;
            }[];
            /** @description Whether the sources contradict the explicitly supplied Thing context. */
            contradiction: boolean;
        };
        /** @description Applicability and public identifier coverage of one saved resource. */
        ResourceApplicability: {
            /** @description Source applies to the supplied Thing class and variant. */
            applicable: boolean;
            /** @description Cited public identifiers covered by this resource. */
            identifiers: {
                /** @description Registry identifier field ID. */
                fieldId: string;
                /** @description Printed identifier value. */
                value: string;
                /** @description Attachment ID copied from the supplied source. */
                attachmentId: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim source passage, up to 2000 characters. */
                quote: string;
            }[];
        };
        /** @description Recommendations justified by linked Attachment content. */
        SourceRecommendations: {
            /** @description Tasks recommended by source. */
            tasks: {
                /** @description Action title, up to 200 characters. */
                title: string;
                /** @description Instructions and relevant intervals, up to 4000 characters. */
                description: string;
                /** @description Attachment ID copied from the supplied source. */
                attachmentId: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim source passage, up to 2000 characters. */
                quote: string;
            }[];
            /** @description Compatible products identified by source. */
            purchasables: {
                /** @description Product name, up to 200 characters. */
                name: string;
                /**
                 * @description Kind of purchasable.
                 * @enum {string}
                 */
                kind: "CONSUMABLE" | "ACCESSORY";
                /** @description Compatibility evidence and purpose, up to 4000 characters. */
                description: string;
                /** @description Purchase URL printed in the cited source, or null. */
                merchantUrl: string | null;
                /** @description Attachment ID copied from the supplied source. */
                attachmentId: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim source passage, up to 2000 characters. */
                quote: string;
            }[];
        };
        /** @description Cited values for enabled Thing Fields. */
        Population: {
            /** @description Up to 20 values for the supplied field targets. */
            values: {
                /** @description Requested field set ID, or null for a standalone field. */
                fieldSetId: string | null;
                /** @description Requested registry field ID. */
                fieldId: string;
                value: string | number | boolean | {
                    /** @description Non-negative amount in pence or cents, expressed as the supported major-unit amount multiplied by 100, including zero. */
                    amountMinor: number;
                    /**
                     * @description ISO currency code supported by the source: GBP, EUR or USD, with symbols resolved from source context. Facts or mapped values with an unestablished currency are absent.
                     * @enum {string}
                     */
                    currency: "GBP" | "EUR" | "USD";
                };
                /** @description Attachment ID copied from the supplied source. */
                attachmentId: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim source passage, up to 2000 characters. */
                quote: string;
            }[];
            /** @description Up to three useful requested fields to highlight. */
            pinnedFields: {
                /** @description Requested field set ID or null. */
                fieldSetId: string | null;
                /** @description Requested registry field ID. */
                fieldId: string;
            }[];
        };
        /** @description Important additional information. */
        AdditionalInformation: {
            /** @description Up to 10 significant findings outside the supplied fields. */
            findings: {
                /** @description Useful field label, up to 160 characters. */
                label: string;
                /** @description Retrieved registry field ID, or null for a custom field. */
                fieldId: string | null;
                value: string | number | boolean | {
                    /** @description Non-negative amount in pence or cents, expressed as the supported major-unit amount multiplied by 100, including zero. */
                    amountMinor: number;
                    /**
                     * @description ISO currency code supported by the source: GBP, EUR or USD, with symbols resolved from source context. Facts or mapped values with an unestablished currency are absent.
                     * @enum {string}
                     */
                    currency: "GBP" | "EUR" | "USD";
                };
                /** @description Whether this finding contains sensitive information. */
                sensitive: boolean;
                /** @description Why the information matters to operating, maintaining or administering the Thing. */
                reason: string;
                /** @description Attachment ID copied from the supplied source. */
                attachmentId: string;
                /** @description Original one-based page number, or null for unpaginated text. */
                page: number | null;
                /** @description Verbatim source passage, up to 2000 characters. */
                quote: string;
            }[];
        };
        /** @description Transcription, document metadata and source-supported Things extracted from the uploaded material. */
        Extraction: {
            /** @description Display metadata for the uploaded source, including a descriptive title for photographs and notes. */
            metadata: {
                /** @description Short descriptive display title based on the content or visible purpose, such as 'Data plate photo', 'Product photo' or 'Receipt from Amazon', excluding account numbers, serial numbers and secrets (min 1 char, max 200 chars). */
                title: string | null;
                /**
                 * @description Classification of the document by its purpose: MANUAL for operation or care instructions, RECEIPT for proof of purchase, INVOICE for a payment request, INSTALLATION_GUIDE for setup instructions, SPECIFICATION for technical data, or OTHER for another document type; null when the type is unknown.
                 * @enum {string|null}
                 */
                documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                /** @description Manufacturer, retailer or organisation that issued the document, as supported by the source; null when unknown (min 1 char, max 200 chars). */
                publisher: string | null;
                /**
                 * Format: date
                 * @description Original issue date printed in the document, formatted YYYY-MM-DD; null for missing or incomplete dates. A receipt's purchase date may serve as its document date; website update dates do not establish the document date.
                 */
                documentDate: string | null;
            } | null;
            /** @description Source transcription preserving labels, identifiers and surrounding context; empty when supplied text is retained directly. */
            text: string;
            /** @description Short source-wide description of the document's content; null when the content cannot be read. */
            summary: string | null;
            /** @description Source-wide search terms without private identifiers, with at most 20 terms of at most 200 characters each. */
            terms: string[];
            /**
             * @description Outcome of reading English content: complete, partly readable, no readable content, or insufficient English content.
             * @enum {string}
             */
            transcriptionStatus: "COMPLETE" | "EMPTY" | "PARTIAL" | "INSUFFICIENT_LANGUAGE";
            /** @description Up to four distinct Things that can be identified in the source, with facts grouped by the thing they describe.  Identifying one thing in the source is typical. */
            candidates: {
                /** @description Generated identifier unique within this extraction. */
                id: string;
                /** @description Short everyday name, incorporating elements like brand/manufacturer/provider, product or type, and purpose or context, as appropriate.  Good examples are 'Bosch Oven' or 'Apple iPhone 8'.  Specificity of names should be guided by how likely it is for a person to own more than one (be more specific about iPhones than ovens).  A water utility contract could be '<company name> for <address>', since the address is important context for a contract tied to a property.  Avoid secrets, model codes and serial numbers. */
                name: string;
                /** @description One category ID copied from the category list, chosen for this Thing with its spelling preserved. */
                categoryId: string;
                /** @description Key words from the source material that relate to the Thing, with at most 20 terms of at most 200 characters each.  Type, brand, provider, product or model identifiers are typical terms.  Avoid secrets and individual identifiers. */
                terms: string[];
                /** @description Up to 100 source-supported facts belonging to this Thing, each with its own label, typed value and supporting quote, with manufacturer, model, production code and serial number represented as separate facts. */
                facts: {
                    /** @description Local generated identifier unique within this thing candidate, such as "fact-1". */
                    id: string;
                    /** @description Short attribute label as defined in the source, or a descriptive label when none is printed, such as "Model number" or "Renewal date", preserving distinctions between model, production and serial identifiers. */
                    label: string;
                    /** @description Value of this fact, as defined in the source, represented as text, number, boolean or money, with explicit false, zero and empty text preserved. */
                    value: string | number | boolean | {
                        /** @description Non-negative amount in pence or cents, expressed as the supported major-unit amount multiplied by 100, including zero. */
                        amountMinor: number;
                        /**
                         * @description ISO currency code supported by the source: GBP, EUR or USD, with symbols resolved from source context. Facts or mapped values with an unestablished currency are absent.
                         * @enum {string}
                         */
                        currency: "GBP" | "EUR" | "USD";
                    };
                    /** @description Verbatim source excerpt supporting this label and value, including surrounding text needed to interpret it, at most 2000 characters. */
                    quote: string;
                    /** @description One-based source page containing the supporting quote, supported by source page information; null when unavailable. */
                    page: number | null;
                    /** @description Sensitivity flag: true for passwords, access codes and other secrets that require masking; false for facts that do not contain a secret. */
                    sensitive: boolean;
                }[];
            }[];
        };
        /** @description Data fieldsets that are applicable to the thing */
        Selection: {
            /** @description Eligible field-set IDs returned by search_field_sets, including mandatory included sets and applicable considerAlongside suggestions; an empty array when no set applies. */
            setIds: string[];
        };
        /** @description Cited reference documents, a product photograph and identity supported by the research report and supplied retrieved URLs. */
        Discovery: {
            /** @description Source-supported everyday Thing name with evidence identifying the subject; null when the research does not establish the identity. */
            identity: {
                /** @description Short brand or provider plus everyday Thing type, such as "Bosch Oven", excluding model codes, marketing features, serial numbers and secrets. */
                name: string;
                /** @description URL copied from the supplied retrieved URL list whose content establishes the subject identity and type. */
                sourceUrl: string;
            } | null;
            /** @description Up to eight cited reference documents and product photographs supported by retrieved evidence. */
            items: {
                /**
                 * @description Resource kind: reference for an applicable downloadable PDF or image for an official product photograph.
                 * @enum {string}
                 */
                kind: "reference" | "image";
                /** @description Short display title for the document or photograph, using source-supported wording, at most 200 characters. */
                title: string;
                /** @description Summary of the resource and why it applies to this Thing, supported by the cited source, at most 4000 characters. */
                description: string;
                /** @description URL copied from the supplied retrieved URL list for the downloadable PDF or product photograph. */
                url: string;
                /** @description URL copied from the supplied retrieved URL list whose content supports applicability. It may equal url when that resource provides the evidence. */
                sourceUrl: string;
                /** @description Metadata supported by the cited reference document; null for other item kinds or when no metadata is supported, with null for each unknown property. */
                metadata: {
                    /** @description Short descriptive display title based on the content or visible purpose, such as 'Data plate photo', 'Product photo' or 'Receipt from Amazon', excluding account numbers, serial numbers and secrets (min 1 char, max 200 chars). */
                    title: string | null;
                    /**
                     * @description Classification of the document by its purpose: MANUAL for operation or care instructions, RECEIPT for proof of purchase, INVOICE for a payment request, INSTALLATION_GUIDE for setup instructions, SPECIFICATION for technical data, or OTHER for another document type; null when the type is unknown.
                     * @enum {string|null}
                     */
                    documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                    /** @description Manufacturer, retailer or organisation that issued the document, as supported by the source; null when unknown (min 1 char, max 200 chars). */
                    publisher: string | null;
                    /**
                     * Format: date
                     * @description Original issue date printed in the document, formatted YYYY-MM-DD; null for missing or incomplete dates. A receipt's purchase date may serve as its document date; website update dates do not establish the document date.
                     */
                    documentDate: string | null;
                } | null;
            }[];
        };
        /** @description Applicability evidence and supported requested field values from one supplied reference document. */
        DocumentExtraction: {
            /** @description Document applicability flag: true only when document evidence establishes the matching subject, variant, region, language and version where relevant; false with null applicability and an empty values array when evidence is insufficient or conflicting. */
            applicable: boolean;
            /** @description Page and verbatim quote establishing that this document covers the requested Thing; required when applicable is true, null when applicable is false. */
            applicability: {
                /** @description One-based page in the supplied document containing the applicability quote, numbered from the first document page. */
                page: number;
                /** @description Verbatim excerpt from the cited page establishing the subject or variant and relevant applicability conditions (min 1 char, max 2000 chars). */
                quote: string;
            } | null;
            /** @description Supported values for the requested field addresses, at most one per address, excluding unsupported values and individual identifiers inferred from public terms; an empty array when the document is inapplicable. */
            values: {
                /** @description Field-set ID copied from the requested target address; null when that target is standalone. */
                fieldSetId: string | null;
                /** @description Field definition ID copied from the requested targets, forming a requested address. */
                fieldId: string;
                /** @description Value established for this subject and variant by the cited document, satisfying the requested field schema, format, units and measurement basis. */
                value: string | number | boolean | {
                    /** @description Non-negative amount in pence or cents, expressed as the supported major-unit amount multiplied by 100, including zero. */
                    amountMinor: number;
                    /**
                     * @description ISO currency code supported by the source: GBP, EUR or USD, with symbols resolved from source context. Facts or mapped values with an unestablished currency are absent.
                     * @enum {string}
                     */
                    currency: "GBP" | "EUR" | "USD";
                };
                /** @description One-based page in the supplied document containing the value quote, numbered from the first document page. */
                page: number;
                /** @description Verbatim excerpt from the cited page supporting this value, its units and relevant conditions (min 1 char, max 2000 chars). */
                quote: string;
            }[];
            /** @description Document metadata established by the content, with null for each unsupported property. */
            metadata: {
                /** @description Short descriptive display title based on the content or visible purpose, such as 'Data plate photo', 'Product photo' or 'Receipt from Amazon', excluding account numbers, serial numbers and secrets (min 1 char, max 200 chars). */
                title: string | null;
                /**
                 * @description Classification of the document by its purpose: MANUAL for operation or care instructions, RECEIPT for proof of purchase, INVOICE for a payment request, INSTALLATION_GUIDE for setup instructions, SPECIFICATION for technical data, or OTHER for another document type; null when the type is unknown.
                 * @enum {string|null}
                 */
                documentType: "MANUAL" | "RECEIPT" | "INVOICE" | "INSTALLATION_GUIDE" | "SPECIFICATION" | "OTHER" | null;
                /** @description Manufacturer, retailer or organisation that issued the document, as supported by the source; null when unknown (min 1 char, max 200 chars). */
                publisher: string | null;
                /**
                 * Format: date
                 * @description Original issue date printed in the document, formatted YYYY-MM-DD; null for missing or incomplete dates. A receipt's purchase date may serve as its document date; website update dates do not establish the document date.
                 */
                documentDate: string | null;
            } | null;
        };
        /** @description Supported management tasks for one Thing, ready to become unscheduled suggested Events. */
        TaskSuggestions: {
            /** @description Up to eight distinct supported tasks; empty when none are established. */
            items: {
                /** @description Short action title naming the task (min 1 char, max 200 chars). */
                title: string;
                /** @description Supported instructions, intervals and conditions, with no inferred next date (min 1 char, max 4000 chars). */
                description: string;
                /** @description Supporting URL observed through web search (min 1 char, max 2000 chars). */
                sourceUrl: string;
                /** @description Supporting excerpt from the public source establishing task applicability (min 1 char, max 2000 chars). */
                quote: string;
            }[];
        };
        /** @description Supported consumables and accessories with purchase pages and compatibility evidence. */
        PurchasableSuggestions: {
            /** @description Up to eight distinct compatible products; empty when purchase links or compatibility are unproven. */
            items: {
                /**
                 * @description Consumable used or replaced during operation, or an accessory compatible with the Thing.
                 * @enum {string}
                 */
                kind: "CONSUMABLE" | "ACCESSORY";
                /** @description Source-supported product name, retaining any manufacturer part number (min 1 char, max 200 chars). */
                name: string;
                /** @description Purpose and compatibility explanation supported by retrieved evidence (min 1 char, max 4000 chars). */
                description: string;
                /** @description Direct purchase page URL observed through web search (min 1 char, max 2000 chars). */
                merchantUrl: string;
                /** @description URL observed through web search establishing compatibility (min 1 char, max 2000 chars). */
                sourceUrl: string;
                /** @description Supporting excerpt establishing model, variant, part number or technical compatibility (min 1 char, max 2000 chars). */
                quote: string;
            }[];
        };
        /** @description Category and source-supported terms used to find eligible field sets. */
        search_field_sets: {
            /** @description Candidate category ID copied from the task context, defining the search scope. */
            categoryId: string;
            /** @description Source-supported type, brand, provider, product and model terms relevant to field-set eligibility, excluding secrets and individual identifiers. */
            terms: string[];
        };
        /** @description Batch of unmatched fact labels and source context used to find standalone field definitions. */
        search_fields: {
            /** @description Observed fact labels still needing a standalone field definition, submitted together with their supporting context. */
            labels: {
                /** @description Attribute label copied from the observed fact, such as "Serial number" or "Renewal date". */
                label: string;
                /** @description Surrounding source text explaining the label, subject and units, limited to the context needed to identify the field and distinguish similar registry fields. */
                context: string;
            }[];
        };
        /** @description Source search arguments. */
        search_transcription: {
            /** @description Supplied Attachment ID. */
            attachmentId: string;
            /** @description Search phrase, or empty text for the beginning. */
            query: string;
            /** @description Character offset for reading the next source section. */
            offset: number;
        };
        /** @description Search text used to find the owner's Things. */
        search_things: {
            /** @description Thing name, brand or type from the user request to match against owned Thing names; empty text for a list of recent Things (max 4000 chars). */
            query: string;
        };
        /** @description Owned Thing to read before answering or taking action. */
        read_thing: {
            /**
             * Format: uuid
             * @description Thing UUID copied from the active conversation context or a search_things result.
             */
            thingId: string;
        };
        /** @description Owned attachment to read as evidence for a Thing already retrieved. */
        read_attachment: {
            /**
             * Format: uuid
             * @description Attachment UUID copied from a previously read Thing's linked attachments.
             */
            attachmentId: string;
            /** @description True for PDF diagrams or visual layout requiring the original file; false or null for page-labelled text. Images always retain their original content. */
            includeImages: boolean | null;
        };
        /** @description Previously read Thing and public question to answer, excluding instance-specific facts and secrets. */
        research: {
            /**
             * Format: uuid
             * @description UUID of a retrieved Thing whose model, product or service details identify the research subject.
             */
            thingId: string;
            /** @description Public research question about the product or service, with no instance-specific facts or secrets (min 1 char, max 2000 chars). */
            question: string;
        };
        /** @description Suggested maintenance Event requested by the user for a Thing already read. */
        create_event: {
            /**
             * Format: uuid
             * @description UUID of the previously read Thing for which the user requested this task.
             */
            thingId: string;
            /** @description Short action title describing the user-requested maintenance or servicing task (min 1 char, max 200 chars). */
            title: string;
            /** @description Task details and relevant instructions supported by the conversation and retrieved evidence; empty text when no further details are supported. The owner schedules the suggested Event (max 4000 chars). */
            description: string;
        };
        /** @description Open Issue requested by the user for a Thing already read. */
        create_issue: {
            /**
             * Format: uuid
             * @description UUID of the previously read Thing for which the user requested this Issue.
             */
            thingId: string;
            /** @description Short title describing the user-reported problem to track (min 1 char, max 200 chars). */
            title: string;
            /** @description Problem details supported by the conversation, such as symptoms, context and troubleshooting already tried, excluding unverified diagnoses; empty text when no further details are supported (max 4000 chars). */
            description: string;
        };
        /** @description Previously retrieved resources to cite in the assistant response. */
        show_cards: {
            /** @description Up to 12 cards citing resources retrieved in this conversation or returned by a completed write, with resource IDs copied from tool results and only properties relevant to each card type populated. */
            cards: {
                /**
                 * @description Resource kind corresponding to the retrieved resource being cited: THING, FIELD, ATTACHMENT, ISSUE, EVENT or PURCHASABLE.
                 * @enum {string}
                 */
                type: "THING" | "FIELD" | "ATTACHMENT" | "ISSUE" | "EVENT" | "PURCHASABLE";
                /**
                 * Format: uuid
                 * @description UUID copied from tool results: the containing Thing's UUID for FIELD, or the cited resource's UUID for every other type.
                 */
                id: string;
                /** @description Field's set ID copied from the read Thing for FIELD; null for a standalone field or any other card type. */
                fieldSetId: string | null;
                /** @description Registry field ID from the read Thing at the fieldSetId address for FIELD; null for a custom field or another card type. */
                fieldId: string | null;
                /** @description One-based page supporting the answer for ATTACHMENT when known; null when the page is unknown or for another card type. */
                page: number | null;
                /**
                 * Format: uuid
                 * @description Custom field UUID from the read Thing for a FIELD card; fieldId and fieldSetId are null for this address. Null for registry fields and other card types.
                 */
                customFieldId: string | null;
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
