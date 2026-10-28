/** Shares strict object construction and repeated value, metadata and source-evidence schema fragments. */

// Builds strict object schemas with every declared property required.
export function createObjectSchema<Properties extends Record<string, unknown>>(
  properties: Properties,
  description?: string,
) {
  return {
    ...(description ? { description } : {}),
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

export const sourceEvidenceProperties = {
  attachmentId: {
    description: 'Attachment ID copied from the supplied source.',
    type: 'string',
  },
  page: {
    description: 'Original one-based page number, or null for unpaginated text.',
    type: ['integer', 'null'],
  },
  quote: {
    description: 'Verbatim source passage, up to 2000 characters.',
    type: 'string',
  },
};

export const valueSchema = {
  anyOf: [
    {
      type: 'string',
      description:
        'Text supported by the source, with identifiers, leading zeroes and suffixes preserved as strings. Dates are formatted YYYY-MM-DD only when the full date is supported, following the target field format when supplied.',
    },
    {
      type: 'number',
      description:
        'Source-supported numeric quantity, including zero, in the target field units and measurement basis when supplied, with conversions supported by the source.',
    },
    {
      type: 'boolean',
      description:
        'Source-supported true or false, including explicit false. Absence of a statement does not establish false.',
    },
    createObjectSchema(
      {
        amountMinor: {
          type: 'integer',
          minimum: 0,
          description:
            'Non-negative amount in pence or cents, expressed as the supported major-unit amount multiplied by 100, including zero.',
        },
        currency: {
          type: 'string',
          enum: ['GBP', 'EUR', 'USD'],
          description:
            'ISO currency code supported by the source: GBP, EUR or USD, with symbols resolved from source context. Facts or mapped values with an unestablished currency are absent.',
        },
      },
      'Source-supported GBP, EUR or USD monetary amount and currency, represented in integer minor units with two decimal places: GBP 12.34 becomes {"amountMinor":1234,"currency":"GBP"}.',
    ),
  ],
};

export const attachmentMetadataSchema = createObjectSchema(
  {
    title: {
      type: ['string', 'null'],
      description:
        "Short descriptive display title based on the content or visible purpose, such as 'Data plate photo', 'Product photo' or 'Receipt from Amazon', excluding account numbers, serial numbers and secrets (min 1 char, max 200 chars).",
      minLength: 1,
      maxLength: 200,
    },
    documentType: {
      type: ['string', 'null'],
      enum: ['MANUAL', 'RECEIPT', 'INVOICE', 'INSTALLATION_GUIDE', 'SPECIFICATION', 'OTHER', null],
      description:
        'Classification of the document by its purpose: MANUAL for operation or care instructions, RECEIPT for proof of purchase, INVOICE for a payment request, INSTALLATION_GUIDE for setup instructions, SPECIFICATION for technical data, or OTHER for another document type; null when the type is unknown.',
    },
    publisher: {
      type: ['string', 'null'],
      description:
        'Manufacturer, retailer or organisation that issued the document, as supported by the source; null when unknown (min 1 char, max 200 chars).',
      minLength: 1,
      maxLength: 200,
    },
    documentDate: {
      type: ['string', 'null'],
      format: 'date',
      description:
        "Original issue date printed in the document, formatted YYYY-MM-DD; null for missing or incomplete dates. A receipt's purchase date may serve as its document date; website update dates do not establish the document date.",
    },
  },
  'Display and organisation metadata supported by the source content.',
);
