import type { Candidate } from './types.js';

export function candidateModel(candidate: Candidate) {
  return candidate.facts.find(
    (fact) =>
      !fact.sensitive &&
      typeof fact.value === 'string' &&
      /^(model(?: number)?|e[- ]?(?:nr\.?|number))$/i.test(fact.label.trim()),
  )?.value as string | undefined;
}

export function importedName(name: string, model: string | undefined, existing: string[]) {
  const base = name.trim().slice(0, 200);
  const used = new Set(existing.map((value) => value.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  // Keep the short name when available; add model details only after a case-insensitive collision.
  const specific =
    model && !base.toLowerCase().includes(model.toLowerCase())
      ? `${base.slice(0, 140)} (${model.slice(0, 50)})`
      : base;
  if (!used.has(specific.toLowerCase())) return specific;
  let number = 2;
  while (used.has(`${specific.slice(0, 185)} (${number})`.toLowerCase())) number++;
  return `${specific.slice(0, 185)} (${number})`;
}
