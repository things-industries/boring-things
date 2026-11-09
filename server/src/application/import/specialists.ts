/** Maps identified Icecat catalogue products to registry fields for specialist enrichment. */

// cspell:words generalinfo featuregroups
import type { ThingRow } from '../../db/entities/things.js';
import type { Registry } from '../registry/registry.js';
import type { FieldProposal } from '../thing-fields.js';
import { ensure } from '../errors.js';

export interface SpecialistResult {
  setIds: string[];
  values: FieldProposal[];
}
export interface SpecialistProvider {
  id: string;
  applicable(thing: ThingRow): boolean;
  lookup(thing: ThingRow, registry: Registry, signal: AbortSignal): Promise<SpecialistResult>;
}

const endpoint = 'https://live.icecat.biz/api';
const gtinPattern = /^(?:\d{8}|\d{12,14})$/;

// Reads object properties without trusting provider response types.
function getObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

// Finds a nonempty string across registry field occurrences.
function getValue(thing: ThingRow, id: string) {
  const stored = [thing.data.standalone, ...Object.values(thing.data.values)]
    .map((fields) => fields[id]?.value)
    .find((value) => typeof value === 'string' && value.trim());
  return typeof stored === 'string' ? stored.trim() : '';
}

// Uses catalogue identifiers and excludes instance identifiers such as serial numbers.
function getLookup(thing: ThingRow) {
  const brand = getValue(thing, 'common.manufacturer');
  const code = getValue(thing, 'appliances.productCode') || getValue(thing, 'common.model');
  const gtin = getValue(thing, 'common.gtin');
  return ['appliances', 'devices'].includes(thing.categoryId) &&
    (gtinPattern.test(gtin) || (brand && code))
    ? { brand, code, gtin: gtinPattern.test(gtin) ? gtin : '' }
    : null;
}

// Feature IDs identify meanings independently of translated labels; display values include units.
const featureFields = [
  ['1649', 'common.width'],
  ['1464', 'common.height'],
  ['1650', 'common.depth'],
  ['94', 'common.weight'],
  ['1766', 'appliances.finish'],
  ['8491', 'appliances.supplyVoltage'],
  ['8484', 'appliances.supplyFrequency'],
  ['4098', 'appliances.ratedInputPower'],
  ['944', 'devices.screenDiagonal'],
  ['1585', 'devices.displayResolution'],
] as const;

export class IcecatProvider implements SpecialistProvider {
  id = 'ICECAT';

  constructor(
    private accessToken: string,
    private request: typeof fetch = fetch,
  ) {}

  // Requires a GTIN or manufacturer and product code/model number on an appliance or device.
  applicable(thing: ThingRow) {
    return getLookup(thing) !== null;
  }

  // Checks product identity and maps available catalogue fields with provider provenance.
  async lookup(
    thing: ThingRow,
    registry: Registry,
    signal: AbortSignal,
  ): Promise<SpecialistResult> {
    const input = getLookup(thing);
    ensure(input, 'Missing Icecat product identifiers');
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      lang: 'EN',
      content: 'generalinfo,featuregroups',
      ...(input.gtin ? { GTIN: input.gtin } : { Brand: input.brand, ProductCode: input.code }),
    }).toString();
    const response = await this.request(url, {
      redirect: 'error',
      headers: { 'api-token': this.accessToken },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    const body = getObject(await response.json());
    const result: SpecialistResult = { setIds: [], values: [] };

    // Missing products and subscription/publication restrictions are normal catalogue outcomes.
    if (
      [8, 9, 12, 14, 15, 16, 17].some((code) => body.StatusCode === code) ||
      (response.status === 404 && body.StatusCode === undefined && body.Code === 404)
    )
      return result;
    ensure(response.ok && body.msg === 'OK', 'Icecat lookup unavailable');
    const data = getObject(body.data);
    const info = getObject(data.GeneralInfo);
    ensure(
      typeof info.IcecatId === 'number' &&
        Number.isSafeInteger(info.IcecatId) &&
        info.IcecatId > 0 &&
        typeof info.Brand === 'string' &&
        typeof info.BrandPartCode === 'string',
      'Invalid Icecat product response',
    );
    const gtins = Array.isArray(info.GTIN)
      ? info.GTIN.filter(
          (value): value is string => typeof value === 'string' && gtinPattern.test(value),
        )
      : [];
    ensure(
      (!input.brand || info.Brand.trim().toLowerCase() === input.brand.toLowerCase()) &&
        (input.gtin
          ? gtins.some((gtin) => gtin.padStart(14, '0') === input.gtin.padStart(14, '0'))
          : info.BrandPartCode.trim().toLowerCase() === input.code.toLowerCase()),
      'Icecat product identity mismatch',
    );
    const sourceUrl = new URL(endpoint);
    sourceUrl.search = new URLSearchParams({
      lang: 'EN',
      icecat_id: String(info.IcecatId),
    }).toString();
    const retrievedAt = new Date().toISOString();
    const add = (property: string, fieldId: string, value: unknown) => {
      if (typeof value !== 'string' || !value.trim()) return;
      const set = [...registry.sets.values()].find(
        (set) =>
          set.categoryId === thing.categoryId && set.fields.some((field) => field.id === fieldId),
      );
      if (!set || thing.data.userEdited?.includes(`set:${set.id}`)) return;
      registry.validate(fieldId, value);
      if (!result.setIds.includes(set.id)) result.setIds.push(set.id);
      result.values.push({
        fieldSetId: set.id,
        fieldId,
        value,
        sourceRefs: [
          { url: sourceUrl.href, quote: `${property}: ${value}`, provider: this.id, retrievedAt },
        ],
      });
    };
    add('Brand', 'common.manufacturer', info.Brand);
    add('BrandPartCode', 'common.model', info.BrandPartCode);
    add('GTIN', 'common.gtin', input.gtin || gtins[0]);

    const features = new Map<string, Record<string, unknown>>();
    for (const group of Array.isArray(data.FeaturesGroups) ? data.FeaturesGroups : []) {
      const entries = getObject(group).Features;
      for (const entry of Array.isArray(entries) ? entries : []) {
        const feature = getObject(entry);
        const id = getObject(feature.Feature).ID;
        if (typeof id === 'string') features.set(id, feature);
      }
    }
    for (const [id, fieldId] of featureFields) {
      const feature = features.get(id);
      if (feature) add(`Feature ${id}`, fieldId, feature.PresentationValue);
    }
    return result;
  }
}
