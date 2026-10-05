import schemas from './schemas.json' with { type: 'json' };

// Expand authored local references for provider requests, validation and type generation.
export default JSON.parse(
  JSON.stringify(schemas, (_key, value) => {
    if (!value?.$ref) return value;
    const definition =
      schemas.$defs[value.$ref.slice('#/$defs/'.length) as keyof typeof schemas.$defs];
    if (!value.$ref.startsWith('#/$defs/') || !definition)
      throw new Error('Unknown AI schema reference');
    const { $ref: _reference, ...properties } = value;
    return { ...definition, ...properties };
  }),
) as typeof schemas;
