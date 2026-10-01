/** Groups values by key, keeping their order. */
export function groupBy<T>(values: T[], key: (value: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};

  for (const value of values) (groups[key(value)] ??= []).push(value);
  return groups;
}
