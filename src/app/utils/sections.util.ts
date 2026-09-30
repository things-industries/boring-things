import type { Schema } from '../../../shared/model';
// Only a single-parent, single-child inclusion edge can collapse. Shared dependencies
// and branches retain their own sections and every field retains its set identity.
export function fieldSections(sets: Schema['Thing']['fieldSets']) {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const parents = new Map<string, string[]>();
  for (const set of sets)
    for (const id of set.includes) {
      if (byId.has(id)) parents.set(id, [...(parents.get(id) ?? []), set.id]);
    }
  const absorbed = new Set<string>();
  for (const set of sets)
    if (set.includes.length === 1 && parents.get(set.includes[0])?.length === 1)
      absorbed.add(set.includes[0]);
  return sets
    .filter((set) => !absorbed.has(set.id))
    .map((root) => {
      const members = [root];
      let current = root;
      while (current.includes.length === 1 && absorbed.has(current.includes[0])) {
        const next = byId.get(current.includes[0]);
        if (!next || members.includes(next)) break;
        members.push(next);
        current = next;
      }
      return { id: root.id, name: root.name, sets: members };
    });
}
export function fieldAnchor(setId: string | null, fieldId: string) {
  return 'field-' + encodeURIComponent(JSON.stringify([setId, fieldId]));
}
