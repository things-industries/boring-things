/** AI schema fragments shared by Task suggestions and assistant activity creation. */

export const taskProperties = {
  thingId: {
    type: 'string',
    format: 'uuid',
    description: 'Task thingId.',
  },
  issueId: {
    type: ['string', 'null'],
    format: 'uuid',
    description: 'Task issueId.',
  },
  title: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    description: 'Task title.',
  },
  description: {
    type: 'string',
    maxLength: 4000,
    description: 'Task description.',
  },
  importance: {
    type: 'string',
    description: 'Prominence and ordering within a day, independent of scheduling.',
    enum: ['CRITICAL', 'IMPORTANT', 'RECOMMENDED', 'NICE_TO_HAVE'],
  },
  scheduledOn: {
    type: ['string', 'null'],
    format: 'date',
    description: 'Task scheduledOn.',
  },
  deadlineOn: {
    type: ['string', 'null'],
    format: 'date',
    description: 'Task deadlineOn.',
  },
  recurrence: {
    anyOf: [
      {
        type: 'object',
        description: 'Calendar interval for repeating the task.',
        required: ['interval', 'unit', 'from'],
        properties: {
          interval: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
          },
          unit: {
            type: 'string',
            description: 'Calendar unit for task recurrence.',
            enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'],
          },
          from: {
            type: 'string',
            enum: ['COMPLETION', 'DEADLINE'],
            description: 'Completion date or original Task dates used for recurrence.',
          },
        },
        additionalProperties: false,
      },
      {
        type: 'null',
      },
    ],
    description: 'Documented recurrence interval; absolute dates are chosen when accepted.',
  },
  completionActions: {
    type: 'array',
    items: {
      description: 'Followup option offered after completion or the end of an event.',
      anyOf: [
        {
          type: 'object',
          description: 'Followup offered after the item ends.',
          required: ['type', 'label', 'prompt'],
          properties: {
            type: {
              type: 'string',
              const: 'CHAT',
            },
            label: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            prompt: {
              type: ['string', 'null'],
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          description: 'Followup offered after the item ends.',
          required: ['type', 'label', 'fieldSetId', 'fieldId', 'customFieldId'],
          properties: {
            type: {
              type: 'string',
              const: 'UPDATE_FIELD',
            },
            label: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            fieldSetId: {
              type: ['string', 'null'],
            },
            fieldId: {
              type: ['string', 'null'],
            },
            customFieldId: {
              type: ['string', 'null'],
              format: 'uuid',
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          description: 'Followup offered after the item ends.',
          required: ['type', 'label', 'documentType'],
          properties: {
            type: {
              type: 'string',
              const: 'ADD_ATTACHMENT',
            },
            label: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            documentType: {
              anyOf: [
                {
                  type: 'string',
                  description:
                    'Document classification, such as a manual, receipt or invoice. Null on an Attachment means unknown.',
                  enum: [
                    'MANUAL',
                    'RECEIPT',
                    'INVOICE',
                    'INSTALLATION_GUIDE',
                    'SPECIFICATION',
                    'OTHER',
                  ],
                },
                {
                  type: 'null',
                },
              ],
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          description: 'Followup offered after the item ends.',
          required: ['type', 'label'],
          properties: {
            type: {
              type: 'string',
              const: 'RESOLVE_ISSUE',
            },
            label: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
          additionalProperties: false,
        },
      ],
    },
    maxItems: 12,
    description:
      'Followups to offer after completion, using only retrieved field and issue addresses.',
  },
} as const;

export const eventProperties = {
  thingId: taskProperties.thingId,
  issueId: taskProperties.issueId,
  title: taskProperties.title,
  description: taskProperties.description,
  startsAt: { type: ['string', 'null'], format: 'date-time' },
  startsOn: { type: ['string', 'null'], format: 'date' },
  endsAt: { type: ['string', 'null'], format: 'date-time' },
  completionActions: taskProperties.completionActions,
} as const;
