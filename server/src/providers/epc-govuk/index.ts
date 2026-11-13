/** Matches England and Wales domestic EPCs to Household fields and records their provenance. */

import { addYears, format, isValid, parseISO, subDays } from 'date-fns';
import type { Value } from '../../../../shared/model.js';
import type { ThingRow } from '../../db/entities/things.js';
import type { Registry } from '../../application/registry/registry.js';
import { ApplicationError, ensure, ProviderHttpError } from '../../application/errors.js';
import { getEnv } from '../../config.js';
import * as metrics from '../../metrics.js';
import { SpecialistProvider, type SpecialistResult } from '../specialist-data.js';

const endpoint = 'https://api.get-energy-performance-data.communities.gov.uk';
const registerUrl = 'https://www.gov.uk/find-energy-certificate';
const certificateUrl = 'https://find-energy-certificate.service.gov.uk/energy-certificate/';
const basics = 'household.household';
const building = 'household.building';
const energy = 'household.energyPerformance';
const domesticReportTypes = new Set<unknown>([2, 3]);
const certificatePattern = /^(?:\d{4}-){4}\d{4}$/;
const postcodePattern =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})(?:[\s,]+(?:UK|GB|United Kingdom|Great Britain|England|Wales))?\s*$/i;

// MHCLG's code lists use the same labels for these codes across certificate schemas.
const dwellingTypes: Readonly<Record<string, string>> = {
  '0': 'House',
  '1': 'House',
  '2': 'Flat',
  '3': 'Maisonette',
  '4': 'Mobile home',
};
const houseForms: Readonly<Record<string, string>> = {
  '1': 'Detached',
  '2': 'Semi-detached',
  '3': 'End-terrace',
  '4': 'Mid-terrace',
  '5': 'End-terrace',
  '6': 'Mid-terrace',
};

// Reads provider objects without trusting their shape.
function getObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

// Reads text, including the localized text shape used by older certificates.
function getText(value: unknown) {
  const text = typeof value === 'string' ? value : getObject(value).value;
  return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

// Reads a calendar date without accepting partial or invalid dates.
function getDate(value: unknown) {
  const text = getText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) && isValid(parseISO(text)) ? text : undefined;
}

// Normalizes postcode case and spacing.
function normalizePostcode(value: string) {
  return value.toUpperCase().replace(/[\s+]+/g, '');
}

// Compares addresses across differences in case, commas and line breaks.
function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s,]+/g, ' ')
    .trim();
}

// Reads a Household address or an explicitly supplied certificate reference.
function getIdentity(thing: ThingRow) {
  if (thing.categoryId !== 'household') return null;
  const fields = thing.data.values[basics];
  const country = getText(fields?.['household.country']?.value);
  if (country && country !== 'GB') return null;
  const address = getText(fields?.['household.address']?.value) ?? '';
  const match = postcodePattern.exec(address);
  const postcode = match ? normalizePostcode(match[1]) : undefined;
  if (postcode?.startsWith('BT')) return null;
  const premise = match ? normalizeAddress(address.slice(0, match.index)) : '';
  const stored = thing.data.values[energy]?.['household.energyCertificateReference'];
  const reference = getText(stored?.value);
  const certificate =
    stored?.origin === 'USER' && reference && certificatePattern.test(reference)
      ? reference
      : undefined;
  return (premise && postcode) || certificate ? { address, postcode, premise, certificate } : null;
}

// Requires the full premise, including any flat number, and allows an omitted post town.
function matchesAddress(
  identity: NonNullable<ReturnType<typeof getIdentity>>,
  postcode: unknown,
  addressParts: unknown[],
  town: unknown,
) {
  const candidatePostcode = getText(postcode);
  const parts = addressParts.map(getText).filter(Boolean);
  const address = normalizeAddress(parts.join(' '));
  const postTown = normalizeAddress(getText(town) ?? '');
  return (
    candidatePostcode &&
    normalizePostcode(candidatePostcode) === identity.postcode &&
    address &&
    (identity.premise === address ||
      identity.premise === normalizeAddress(address + ' ' + postTown))
  );
}

// Validates a register identifier before comparing search and certificate responses.
function getUprn(value: unknown) {
  const text = typeof value === 'number' ? String(value) : getText(value);
  return text && /^\d{1,12}$/.test(text) && /[1-9]/.test(text) ? text.padStart(12, '0') : undefined;
}

export class EpcGovUkProvider extends SpecialistProvider {
  readonly id = 'EPC_GOVUK';

  // Checks whether the saved Household has enough information to attempt a lookup.
  applicable(thing: ThingRow) {
    return getIdentity(thing) !== null;
  }

  // Fetches and maps the selected certificate before public research starts.
  async lookup(
    thing: ThingRow,
    registry: Registry,
    signal: AbortSignal,
  ): Promise<SpecialistResult> {
    const identity = getIdentity(thing);
    ensure(identity, 'Missing Household EPC identity');
    const result: SpecialistResult = { setIds: [], values: [] };
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);

    // Search the postcode and select the latest certificate for a single matched dwelling.
    let reference = identity.certificate;
    let searchUprn: string | undefined;
    if (!reference && identity.postcode) {
      const page = await this.get(
        'domestic/search',
        { postcode: identity.postcode, page_size: '500' },
        requestSignal,
      );
      if (!page) return result;
      ensure(Array.isArray(page.data), 'Invalid EPC search response');
      const { totalPages } = getObject(page.pagination);
      ensure(typeof totalPages === 'number', 'Invalid EPC search pagination');
      if (totalPages !== 1) return result;
      const matches = page.data
        .map(getObject)
        .filter((row) =>
          matchesAddress(
            identity,
            row.postcode,
            [row.addressLine1, row.addressLine2, row.addressLine3, row.addressLine4],
            row.postTown,
          ),
        );
      const propertyIds = new Set(matches.map((row) => getUprn(row.uprn)).filter(Boolean));
      if (propertyIds.size > 1) return result;
      const dates = matches.map((row) => getDate(row.registrationDate));
      if (dates.some((date) => date === undefined)) return result;
      const latest = dates.sort().at(-1);
      if (!latest) return result;
      const references = new Set(
        matches
          .filter((row) => row.registrationDate === latest)
          .map((row) => row.certificateNumber),
      );
      const [match] = references;
      if (references.size !== 1 || typeof match !== 'string' || !certificatePattern.test(match))
        return result;
      reference = match;
      searchUprn = getUprn(matches.find((row) => row.certificateNumber === match)?.uprn);
    }
    if (!reference) return result;

    // Confirm the detail response identifies the same dwelling and a published domestic EPC.
    const response = await this.get(
      'certificate',
      { certificate_number: reference },
      requestSignal,
    );
    if (!response) return result;
    const certificate = getObject(response.data);
    ensure(typeof certificate.status === 'string', 'Invalid EPC certificate response');
    if (certificate.status !== 'entered' || !domesticReportTypes.has(certificate.report_type))
      return result;
    const certificateUprn = getUprn(certificate.uprn);
    if (searchUprn && certificateUprn && certificateUprn !== searchUprn) return result;
    if (
      identity.postcode &&
      normalizePostcode(getText(certificate.postcode) ?? '') !== identity.postcode
    )
      return result;
    if (
      identity.premise &&
      !matchesAddress(
        identity,
        certificate.postcode,
        [
          certificate.address_line_1,
          certificate.address_line_2,
          certificate.address_line_3,
          certificate.address_line_4,
        ],
        certificate.post_town,
      )
    )
      return result;

    const rating = getText(certificate.current_energy_efficiency_band);
    const registered = getDate(certificate.registration_date);
    const expiry = registered
      ? format(subDays(addYears(parseISO(registered), 10), 1), 'yyyy-MM-dd')
      : undefined;
    const dwelling = dwellingTypes[String(certificate.property_type)];
    const floorArea = certificate.total_floor_area;
    const firstWall = Array.isArray(certificate.walls) ? certificate.walls[0] : undefined;
    const wall = getText(getObject(firstWall).description ?? firstWall);
    const proposals = [
      [basics, 'household.country', 'GB'],
      [basics, 'household.dwellingType', dwelling],
      [energy, 'household.energyCertificateScheme', 'EPC'],
      [energy, 'household.energyRating', rating && /^[A-G]$/.test(rating) ? rating : undefined],
      [energy, 'household.energyAssessedOn', getDate(certificate.inspection_date)],
      [energy, 'household.energyCertificateExpires', expiry],
      [energy, 'household.energyCertificateReference', reference],
      [
        building,
        'household.houseForm',
        dwelling === 'House' ? houseForms[String(certificate.built_form)] : undefined,
      ],
      [
        building,
        'household.floorArea',
        typeof floorArea === 'number' && Number.isFinite(floorArea) && floorArea > 0
          ? floorArea
          : undefined,
      ],
      [
        building,
        'household.wallConstruction',
        wall && !/^(?:n\/?a|not recorded|unknown)$/i.test(wall) ? wall : undefined,
      ],
    ] satisfies [string, string, Value | undefined][];
    if (!thing.data.userEdited?.includes(`set:${building}`)) {
      proposals.push([
        building,
        'household.constructionPeriod',
        await this.getConstructionPeriod(certificate, requestSignal),
      ]);
    }

    const retrievedAt = new Date().toISOString();
    for (const [fieldSetId, fieldId, value] of proposals) {
      if (value === undefined || thing.data.userEdited?.includes(`set:${fieldSetId}`)) continue;
      try {
        registry.validate(fieldId, value);
      } catch (error) {
        if (error instanceof ApplicationError && error.kind === 'INVALID_INPUT') continue;
        throw error;
      }
      const isReference = fieldId === 'household.energyCertificateReference';
      if (!result.setIds.includes(fieldSetId)) result.setIds.push(fieldSetId);
      result.values.push({
        fieldSetId,
        fieldId,
        value,
        sourceRefs: [
          {
            url: isReference ? certificateUrl + reference : registerUrl,
            quote:
              fieldId === 'household.energyCertificateExpires'
                ? `Valid through ${value} based on the EPC registration date`
                : `${fieldId}: ${value}`,
            provider: this.id,
            retrievedAt,
          },
        ],
      });
    }
    result.matchesThing = (current) => {
      const saved = getIdentity(current);
      return saved?.address === identity.address && saved.certificate === identity.certificate;
    };
    return result;
  }

  // Resolves the main building's age band against the certificate schema.
  private async getConstructionPeriod(certificate: Record<string, unknown>, signal: AbortSignal) {
    const parts = Array.isArray(certificate.sap_building_parts)
      ? certificate.sap_building_parts
      : [];
    const main = parts.map(getObject).find((part) => part.building_part_number === 1);
    const key = getText(main?.construction_age_band);
    const schemaVersion = getText(certificate.schema_type);
    if (!key || !schemaVersion) return undefined;
    const response = await this.get(
      'codes/info',
      { code: 'construction_age_band', key, schemaVersion },
      signal,
    );
    if (!response || !Array.isArray(response.data)) return undefined;
    const code = response.data.map(getObject).find((entry) => entry.key === key);
    if (!Array.isArray(code?.values)) return undefined;
    const values = new Set(
      code.values
        .map(getObject)
        .filter((entry) => entry.schemaVersion === schemaVersion)
        .map((entry) => getText(entry.value)?.replace(/^England and Wales:\s*/i, ''))
        .filter((value): value is string => value !== undefined && /\d/.test(value)),
    );
    return values.size === 1 ? [...values][0] : undefined;
  }

  // Records each request without sending address, reference or response content to telemetry.
  private async get(path: string, params: Record<string, string>, signal: AbortSignal) {
    const url = new URL('/api/' + path, endpoint);
    url.search = new URLSearchParams(params).toString();
    return metrics.withProviderCall(
      { task: 'epc_govuk_lookup', provider: 'epc_govuk', units: 1, costUsd: 0 },
      async (report) => {
        const response = await this.request(url, {
          headers: {
            Authorization: `Bearer ${getEnv('EPC_GOVUK_API_KEY')}`,
            Accept: 'application/json',
          },
          redirect: 'error',
          signal,
        });
        if (!response.ok && response.status !== 404)
          throw new ProviderHttpError(response.status, 'GOV.UK EPC lookup unavailable');
        report({ httpStatus: response.status, outcome: response.ok ? 'found' : 'not_found' });
        return response.ok ? getObject(await response.json()) : null;
      },
    );
  }
}
