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
    description: 'Hard deadline for a one-off Task; requires recurrence to be null.',
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
            enum: ['COMPLETION', 'SCHEDULED'],
            description: 'Completion date or original scheduled date used for recurrence.',
          },
        },
        additionalProperties: false,
      },
      {
        type: 'null',
      },
    ],
    description:
      'Documented recurrence interval for Tasks without a deadline; absolute dates are chosen when accepted.',
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
} as const;
