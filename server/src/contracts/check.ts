import spec from '../../../openapi.json' with { type: 'json' };

const standardEnums = new Set(['SchemaTypeEnum', 'SchemaFormatEnum', 'CurrencyEnum']);
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

export function checkContract() {
  if (!spec.openapi.startsWith('3.1.')) throw new Error('OpenAPI 3.1 is required');
  const tags = new Set(
    spec.tags.map((tag) => {
      if (!tag.description) throw new Error(`Missing tag description: ${tag.name}`);
      return tag.name;
    }),
  );
  const ids = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, value] of Object.entries(item)) {
      if (!methods.has(method)) throw new Error(`Unsupported path item: ${path}/${method}`);
      const operation = value as { operationId: string; summary?: string; tags?: string[] };
      if (
        !operation.summary ||
        !operation.tags?.length ||
        operation.tags.some((tag) => !tags.has(tag))
      )
        throw new Error(`Missing operation documentation: ${method} ${path}`);
      if (!operation.operationId || ids.has(operation.operationId))
        throw new Error(`Duplicate or missing operation ID: ${path}`);
      ids.add(operation.operationId);
    }
  }
  let reachedEnums = false;
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    if (!schema.description) throw new Error(`Missing schema description: ${name}`);
    const isEnum = 'enum' in schema;
    if (reachedEnums && !isEnum) throw new Error(`Enum schemas must be last: ${name}`);
    reachedEnums ||= isEnum;
  }
  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'nullable') throw new Error(`Use null type unions: ${path.join('/')}`);
      if (key === 'enum' && Array.isArray(item)) {
        if (path.length !== 3 || path[0] !== 'components' || path[1] !== 'schemas')
          throw new Error(`Inline enum: ${path.join('/')}`);
        if (
          !standardEnums.has(path[2]) &&
          item.some((entry) => typeof entry !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry))
        )
          throw new Error(`Invalid domain enum: ${path.join('/')}`);
      }
      if (key === '$ref') {
        if (typeof item !== 'string' || !/^#\/components\/(schemas|responses)\/[\w-]+$/.test(item))
          throw new Error(`Unsupported reference: ${String(item)}`);
        const [, , group, name] = item.split('/');
        const components = spec.components as unknown as Record<string, Record<string, unknown>>;
        if (!components[group]?.[name]) throw new Error(`Missing reference: ${item}`);
      }
      visit(item, [...path, key]);
    }
  };
  visit(spec, []);
}
