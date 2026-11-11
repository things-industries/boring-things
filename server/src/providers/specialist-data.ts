/** Base class and mapped field results for specialist data providers. */

import type { ThingRow } from '../db/entities/things.js';
import type { Registry } from '../application/registry/registry.js';
import type { FieldProposal } from '../application/thing-fields.js';

export interface SpecialistResult {
  setIds: string[];
  values: FieldProposal[];
}

export abstract class SpecialistProvider {
  abstract readonly id: string;

  constructor(protected readonly request: typeof fetch = fetch) {}

  // Checks whether the saved Thing has the identifiers needed by this provider.
  abstract applicable(thing: ThingRow): boolean;

  // Returns mapped fields with provider provenance for the workflow to save.
  abstract lookup(
    thing: ThingRow,
    registry: Registry,
    signal: AbortSignal,
  ): Promise<SpecialistResult>;
}
