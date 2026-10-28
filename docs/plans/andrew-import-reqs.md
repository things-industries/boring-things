# Import architecture and workflows

How I'd ideally like our import process to work.

## Requirements

Mandatory requirements, the solution must deliver on these.

### Core goals

- **Structured data**: Users can upload unstructured information about their Things, and we will pick out relevant information and highlight what's important.
- **Enrichment**: When users provide sufficient information to identify an instance or class of thing that we can find our more about, we'll go find that information from the public web and specialised API/data providers, and attach it to the Thing.
- **Recommendation**: We'll proactively recommend tasks and purchaseable accessories/parts/consumables that work with the user's Things. They'll be specific and relevant to that particular class or model of thing.
- **Knowledge**: We'll be able to answer questions about a thing on demand by consulting all the information we have available and doing additional on-demand research using the web, AI or specialist API/data providers. (this requirement is fulfilled by assistant chat which is not specified in this doc but the importing of relevant content is an important enabler for it)

### Import use cases

- **Basic creation**: General upload of 1 source identifies 1 new Thing
- **Augment from general upload**: General upload of 1 source identifies 1 existing Thing
- **Complex general upload (future)**: General upload of a group of n sources identifies several things, some new, some existing
- **Basic augmentation**: Owner adds a relevant source from Thing detail
- **Direct thing creation**: Owner enters details of a thing manually
- **Refresh recommendations**: Owner selects Refresh recommendations from a Thing menu

### Import edge cases

- **Nonsense input**: General upload contains no evidence of any identifiable things
- **Scrap of data**: Owner adds a source from Thing detail that has no identifiable thing, but can be assumed to be relevant to the Thing it's being added to.
- **Wrong thing**: Owner adds a source concerning other Thing(s) from an unrelated Thing detail

## Concepts

### Entities

- **Thing**: A conceptual item of value to the user which has key-value field data in well defined fields (organised into fieldsets), custom key-value data, linked attachments (user uploads and discovered public resources), recommended tasks, purchaseable items (consumables, parts, accessories, upgrades), issues and events.
- **Source**: Original file/image/text submitted by a user that is intended to provide information about their Things.
- **Attachment**: A Source or discovered public resource, with metadata, transcription, summary, terms/keywords and identifiers (which can be _candidates_ or _registry-linked_). User uploads are private, a saved public resource (eg user manual) is also an Attachment and has a source URL but _no owner user ID_. Attachments can be linked to Things. Store public documents and images as Attachments with null ownership and a source URL. An unowned attachment can be linked to Things belonging to different owners. Owner actions can unlink a public resource from their Things, but deleting a Thing, link or account preserves a shared Attachment as long as another reference uses it.
- **Transcription**: An Attachment's page-labelled readable content and image descriptions.
- **Thing Candidate**: A _possible_ Thing identified by an Import. It has a name, category, terms/keywords and identifiers with Attachment and passage references.
- **Thing Attachment**: The persisted relationship linking a Thing to an Attachment. This belongs to the thing, which belongs to a user, while the attachment itself may either be private to the user or a shared resource.
- **Thing Field**: The instance of a field for a specific Thing, with field definition (unless custom) and fieldset (unless standalone or custom) context where applicable. Records whether it can be automatically updated (fields created by import and empty registry fields added through a fieldset start out with auto population enabled; manually created custom fields and fields with manually entered values have it disabled; manually editing or clearing a field sets it to false), the origin of the current value (import, user), and source refs per the current DB (but thing fields should have a table). Value may be empty or populated.
- **Field Definition**: A definition of a single field, reusable across fieldsets and as a standalone field, including it's name, description, schema, UI type hint, whether it is sensitive, and whether it is an identifier (group ID like brand/manufacturer/supplier, class ID like model number, instance ID like registration/serial number, or not an identifier like capacity or expiry date). Custom Thing fields retain their own definition data and don't have field definitions. In future we will consider field-definition-specific normalisation/formatting/comparison functions (we could have a `fields/vehicles.registration.ts` file that contains standard functions that make formatting, normalisation or comparison of that field more intelligent)
- **Fieldset**: A group of field definitions along with eligibility criteria which allows that set of fields to be added to a Thing. Fieldsets are the best way to add fields to a Thing, since they provide confidence for their relevance and context for the field values. Fieldsets may have null eligibility criteria, if so that fieldset is always included for all Things in the associated category (those mandatory fieldsets also needn't be the target of any `include` or `considerAlongside` values since they will be added regardless). Every category should have at least one mandatory fieldset.

### Processes

As an overview: what we want to achieve is for a user to be able to upload source documents (photos of labels, warranty cards, email statements and confirmations etc), and have us accurately organise them into Things. Conceptually, I think about the reasoning process like this:

- Look at the uploaded document: what is it about? eg. It's something to do with a car and it has the car's registration number on it.
- See if we have a record of that car already. If so, update it, if not, create a new one and populate it with the registration plate number.
- Since we know the reg, use a partner-provided DVLA data API to fetch the full official record for that car
- Since it's a car, we know what's important to record, so look for all the important car-related info in the uploaded document
- See if there's anything else of importance in the uploaded document that's worth recording (name of dealer, for example), and note those down.

Trying to turn that into a formal process I get these processes:

- **Transcribe**: For each uploaded attachment, transcribe all discernable English-language text, produce a summary of limited length, a bag of terms/keywords, and a set of possible identifiers (as identifier candidates)
- **Import**: A workflow that takes 0+ Attachments, 0 or 1 Things (thing context), and does the following:
  - if it has 0 attachments and 0 things, stop, there's nothing to do.
  - if at least 1 attachment, construct thing candidates, by prompting an AI with:
    - The summary, terms/keywords, and candidate identifiers for all included attachments
    - If an existing Thing is specified in the Import, key details of that thing and instructions to consider any ambiguous or unattributable source information to be related to that thing, and to use its identifiers (except where the source material contains contradictory identifiers). Thing context supplies the target and attribution for such material; only contradictory evidence prevents its use.
    - A definition of each of our known thing categories, and for each one, a definition of each field we consider to be an identifier
    - Response schema: an array of thing candidates, and for each one, the category, the category-valid identifiers, list of attachments that contributed to the candidate, and a judgement of how strongly that thing is represented within the source material.
    - Tools: A way to search the full transcription of the attachment
  - if at least 1 attachment, match or create Thing
    - If no thing is found (use cases: scrap of data without a thing context, or clearly attributed thing related doc uploaded to the wrong existing Thing) stop and report the import as in an error state.
    - For now, keep only one thing candidate, because we have no front end support for choosing between multiple options or watching multiple Things be created in parallel, but we want to support those in principle, so we want a process that is mostly compatible with multiple thing import but right now chooses to only import one. Keep the one specified in the thing context if there is one, else keep the strongest.
    - Use the thing candidates to match existing Things by searching for matching Thing field data. Where found, those things become the thing candidate's target. Where none is found, create a thing and make that the thing candidate's target Thing.
    - If a thing is specified in the import, validate that at least one thing candidate matches the specified Thing.
    - Link the thing candidate's relevant attachments to the Thing (not all attachments in the import may be relevant to the Thing)
    - If a thing was created, add the category-mandatory fieldsets to the thing
    - Populate any fields on the Thing that match the thing candidate's candidate identifiers.
  - Research (also the starting point for zero-attachment imports)
    - Where triggered by the existence of a particular field in the identifier fields attached to the Thing, query specialised data APIs (eg if `vehicles.registration` is populated for a Thing, query a DVLA API). Specialised API handlers should return data structured into recognised fields and fieldsets, which should immediately be saved to the Thing.
    - Use the Thing's identifiers and category-specific research targets to find publicly accessible resources either by reusing existing local attachments previously saved from research and matching registry-linked identifiers, by using specialised category-specific document APIs from partners (eg https://manualsfile.com/), or by doing web search. Save the found documents as attachments and link them to the Thing and this Import. Creating the new attachment should trigger transcription. Wait for the transcription of new attachments to finish before proceeding.
  - Fieldset selection
    - Review the summary and terms/keywords of all attachments linked to the Thing, choose fieldsets from the field registry which are likely to be appropriate to what we know about the thing, and add all their fields to the Thing if they are not already on it.
  - Population
    - Identify Thing Fields with automatic population enabled. Search applicable Attachment content for their values. Before saving new or updated values, recheck the field’s current value and auto-population setting. Report conflicting evidence without replacing protected values or creating duplicate fields.
    - Review the full source content of the linked attachments (only those uploaded by the user), to identify any data of great significance that relates to the Thing, and is not represented in the fields already attached to the Thing. Search for matching fields in the field registry and if found, add them to the Thing as standalone (not linked via fieldset) field values. If not found, add custom fields. This should use a cheaper model given the need to pass a potentially huge context, and should have a high bar for custom fields.
  - Trigger Recommendation process
- **Recommendation**: Suggest management tasks and purchasables by using thing field data, category-specific hints, and the content of linked attachments. Aim to generate recommended tasks officially recommended by the provider or manufacturer, and purchasables of official products from licensed sources. User needs to be able to trigger this manually from the Thing detail page as well as having it happen automatically at the end of an import.

### Manual operation

- If a Thing is created manually, there's no import and it may not have any attachments
- Manually created Things can have an import or recommendation process triggered. Import would perform research, fieldset selection and population. Recommendation will be the same whether manually triggered or automatic.

### Accepted limitations

- Identifier matching is not exact. Two appliances from different manufacturers may have the same model number, causing them to be inadvertently considered to be the same thing. Conversely, two attachments describing the same thing might not be matched if they format the model number differently. Right now we will depend on an AI task to make a semantic judgement during the "match or create Thing" process, but in future we could have field-specific normalisation/formatting/comparison functions, or a dependence relationship between identifiers so that eg if model is matched it needs to match manufacturer as well.

## Architectural abstractions and implementation ideas

### AI tasks

Ideally I think we could have an abstract AiTask class that provides an abstract base for specific tasks and would contain functions like `requestResponse`, `outputFormat` and `runRegistryConversation` (maybe better rethought of as `runConversationWithTools`).

Each AiTask can then be a child of that:

```ts
class TranscribeTask extends AiTask {
  // prompt
  // response schema
  // orchestration of tools
}
```

Making these instantiable classes would also make it possible for them to hold intermediate state and emit events:

```ts
const mapping = new MappingTask(thingFields, sourceTranscription);
mapping.onData(setThingFieldValue);
```

or

```ts
await MappingTask::run(thingFields, sourceTranscription, callbackForSettingThingFieldValue)
```

Tools could likewise have a standard shape and be in a subfolder, eg:

/providers/ai
/tasks
/tools

### Specialist API providers

Classes which register an interest in a particular field/fields and define a mapping to other known registry fields. eg the UK DVLA

Pseudo impl:

```ts
class DvlaDataProvider extends ApiDataProvider {
  triggerField: 'vehicles.registration';
  run() {
    // return data mapped to known registry fields
  }
}
```

All providers could then be aggregated by a lightweight coordinator class like:

```ts
class ApiDataLookup {
    run(fieldData) {
        providerClasses.filter(triggerFieldIsPresent).map(class => {
            // instantiate
            // run
            // return data
        }).reduce(aggregate)
    }
}
```

And used like this:

```ts
const moreData = await ApiDataProviderLookup.run(data);
```

### Application modules

Application modules are currently very unstructured, I'd like to see more consistency to the invocation patterns, making use of well-known architectural abstraction patterns, while maintaining or reducing the number of unique types we need to define and pass around, and not overengineering it. We just want some consistency, not Enterprise Coding Nirvana.

### Task runner

Consider using a third party module to manage and run jobs, to reduce the amount of code we need.

### Database schema

We should have a table for thing_fields, not just a big 'data' blob on a thing.

### Other implementation guidance

- **Specialised enrichment**: use specialised APIs like [UK DVLA](https://vehiclesmart.com/), [Appliance API](https://www.applianceapi.com/) or [Icecat](https://iceclog.com/manual-for-icecat-json-product-requests/) to obtain data based on a known type of identifier and return structured data that we can then enrich things with.
- **Shared attachments** Public resources discovered during research can be saved once and reused across owners, including their transcription and public metadata. User uploads remain private. Users can access a shared resource through their own Things. Attachment-thing associations expose only that user's Things. Users can remove their Things' links to shared resources. Shared content and metadata are system-managed; owner-specific preferences belong to the Thing Attachment relationship. Removing a Thing, link or account preserves shared resources still referenced by another Thing, Import, citation or image selection. Physical deletion requires checking those references.
- **Progress**: Persist source outcomes, current stage, selected candidate, resolved Thing, warnings and errors. Owners can leave and return to processing without losing progress.
- **Reusable transcription**: Each Attachment transcribes independently. Imports wait for the submitted Attachments’ transcription outcomes and process usable sources.
- **Recovery**: Save completed work and its results, including Thing allocation, provider queries, resource processing, field batches and recommendations. Save related application changes and completion records together. Retries reuse saved results and resume unfinished work.
- **Failures**: Failure to identify a Thing or contradiction with the specified Thing in an import that has a Thing context produces an explained error. Research or recommendation failures produce retryable warnings while retaining completed work. Failures to save data prevent the affected operation being recorded as complete.
- **Limits and usage**: Set configurable limits on uploaded file counts and sizes, downloaded resources, text supplied in each AI request, requests to AI and other providers, and time spent processing. Process large documents in batches. When a limit prevents completion, retain saved results and report which work remains unfinished. Record request counts, AI token usage and elapsed time.
- **Lifecycle**: Restart restores persisted progress and makes interrupted work resumable. Unlinking or deleting a target prevents unfinished work from restoring removed relationships. Completion and errors release processing restrictions.
- **Source changes**: Replacing a transcription invalidates unfinished work that depended on it, while preserving committed Thing identities, owner decisions and saved values.
- All automatic field writes, including specialist-provider results, respect the Thing Field’s automatic-population setting and do not write to fields that have the flag set to false.
