/** Maps UK registration lookups to vehicle fields with Zyfy source provenance. */

import timers from 'node:timers/promises';
import type { Value } from '../../../../shared/model.js';
import type { ThingRow } from '../../db/entities/things.js';
import type { Registry } from '../../application/registry/registry.js';
import { SpecialistProvider, type SpecialistResult } from '../specialist-data.js';
import { ApplicationError, ensure } from '../../application/errors.js';
import * as metrics from '../../metrics.js';

const ukCountries = new Set([
  'uk',
  'gb',
  'gbr',
  'united kingdom',
  'great britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
]);

// Matches current, prefix, suffix and dateless plate shapes without checking issuance rules.
const ukRegistrationPattern =
  /^(?:[A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z]|[A-Z]{1,3}[0-9]{1,4}|[0-9]{1,4}[A-Z]{1,3})$/;

const fuelNames: Record<string, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  electric: 'Electric',
  hybrid_electric: 'Hybrid electric',
  gas: 'Gas',
  other: 'Other',
};
const testStatuses: Record<string, string> = {
  valid: 'Valid',
  expired: 'Expired',
  no_mot: 'No MOT',
  no_details: 'No details',
};
const taxStatuses: Record<string, string> = { taxed: 'Taxed', untaxed: 'Untaxed', sorn: 'SORN' };
const testResults: Record<string, string> = { passed: 'Passed', failed: 'Failed' };

// Reads provider objects without trusting their shape.
function getObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

// Reads nonempty source text without coercing other values.
function getText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Accepts finite provider numbers without converting source text.
function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Accepts UK plate shapes when the recorded country is UK or absent.
function getRegistration(thing: ThingRow) {
  const fields = [thing.data.standalone, ...Object.values(thing.data.values)];
  const country = fields
    .map((fields) => getText(fields['vehicles.registrationCountry']?.value))
    .find(Boolean);
  const registration = fields
    .map((fields) => getText(fields['vehicles.registration']?.value))
    .find(Boolean)
    ?.replaceAll(/\s/g, '')
    .toUpperCase();
  return thing.categoryId === 'vehicles' &&
    (!country || ukCountries.has(country.toLowerCase())) &&
    registration &&
    ukRegistrationPattern.test(registration)
    ? registration
    : null;
}

export class ZyfyProvider extends SpecialistProvider {
  readonly id = 'ZYFY';

  constructor(
    private apiKey: string,
    request: typeof fetch = fetch,
  ) {
    super(request);
  }

  // Checks plate shape and any recorded country before making a request.
  applicable(thing: ThingRow) {
    return getRegistration(thing) !== null;
  }

  // Retries pending enrichment and maps validated fields before public research starts.
  async lookup(
    thing: ThingRow,
    registry: Registry,
    signal: AbortSignal,
  ): Promise<SpecialistResult> {
    const registration = getRegistration(thing);
    ensure(registration, 'Missing UK vehicle registration');
    const url = `https://zyfy.uk/v1/vehicle/${registration}`;
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { response, body } = await metrics.withProviderCall(
        { task: 'zyfy_lookup', provider: 'zyfy' },
        async () => {
          const response = await this.request(url, {
            headers: { 'X-Api-Key': this.apiKey },
            redirect: 'error',
            signal: requestSignal,
          });
          ensure(response.ok || response.status === 404, 'Zyfy lookup unavailable', 'UNAVAILABLE');
          return { response, body: getObject(await response.json()) };
        },
      );
      if (response.status === 404) return { setIds: [], values: [] };
      ensure(body.registration === registration, 'Zyfy vehicle identity mismatch');
      if (body.enrichmentPending === true && attempt < 2) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? 4);
        await timers.setTimeout(
          (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 4) * 1000,
          undefined,
          { signal: requestSignal },
        );
        continue;
      }
      ensure(body.enrichmentPending === false, 'Zyfy enrichment pending', 'UNAVAILABLE');

      const signals = getObject(body.signals);
      const taxCost = getNumber(signals.vedAnnualCostGbp);
      const engineCapacity = getNumber(body.engineCapacityCc);
      const co2Emissions = getNumber(signals.co2EmissionsGPerKm);
      const proposals = [
        ['vehicles.vehicle', 'common.manufacturer', getText(body.make)],
        ['vehicles.vehicle', 'common.model', getText(body.model)],
        ['vehicles.vehicle', 'vehicles.vehicleType', getText(body.vehicleType)],
        ['vehicles.vehicle', 'vehicles.colour', getText(body.colour)],
        ['vehicles.vehicle', 'vehicles.yearOfManufacture', getNumber(body.yearOfManufacture)],
        [
          'vehicles.registration',
          'vehicles.firstRegistered',
          getText(body.monthOfFirstRegistration),
        ],
        ['vehicles.roadMotor', 'vehicles.fuelOrPowerType', fuelNames[getText(body.fuelType) ?? '']],
        [
          'vehicles.combustion',
          'vehicles.engineCapacity',
          engineCapacity !== undefined && engineCapacity > 0 ? `${engineCapacity} cm³` : undefined,
        ],
        ['vehicles.combustion', 'vehicles.emissionStandard', getText(signals.euroEmissionStandard)],
        [
          'vehicles.roadMotor',
          'vehicles.co2Emissions',
          co2Emissions !== undefined && co2Emissions >= 0 ? `${co2Emissions} g/km` : undefined,
        ],
        [
          'vehicles.roadMotor',
          'vehicles.londonUlezCompliant',
          typeof signals.ulezCompliant === 'boolean' ? signals.ulezCompliant : undefined,
        ],
        [
          'vehicles.roadworthiness',
          'vehicles.roadworthinessTestScheme',
          signals.motStatus != null || signals.lastMotDate != null || signals.firstMotDue != null
            ? 'MOT'
            : undefined,
        ],
        [
          'vehicles.roadworthiness',
          'vehicles.testStatus',
          testStatuses[getText(signals.motStatus) ?? ''],
        ],
        ['vehicles.roadworthiness', 'vehicles.testExpiresOn', getText(signals.motExpiryDate)],
        ['vehicles.roadworthiness', 'vehicles.firstTestDueOn', getText(signals.firstMotDue)],
        ['vehicles.roadworthiness', 'vehicles.lastTestOn', getText(signals.lastMotDate)],
        [
          'vehicles.roadworthiness',
          'vehicles.lastTestResult',
          testResults[getText(signals.lastMotResult) ?? ''],
        ],
        [
          'vehicles.maintenance',
          'vehicles.hasOutstandingRecall',
          typeof signals.hasOutstandingRecall === 'boolean'
            ? signals.hasOutstandingRecall
            : undefined,
        ],
        ['vehicles.roadTax', 'vehicles.taxStatus', taxStatuses[getText(signals.taxStatus) ?? '']],
        ['vehicles.roadTax', 'vehicles.taxDueOn', getText(signals.taxDueDate)],
        [
          'vehicles.roadTax',
          'vehicles.annualTaxCost',
          taxCost !== undefined && taxCost >= 0 && Number.isSafeInteger(taxCost * 100)
            ? { amountMinor: taxCost * 100, currency: 'GBP' }
            : undefined,
        ],
      ] satisfies [string, string, Value | undefined][];
      const result: SpecialistResult = { setIds: [], values: [] };
      const retrievedAt = new Date().toISOString();
      const dataAsOf = getText(body.dataAsOf);
      const freshness =
        dataAsOf && dataAsOf.length <= 40 && Number.isFinite(Date.parse(dataAsOf))
          ? `; source data as of ${dataAsOf}`
          : '';
      for (const [fieldSetId, fieldId, value] of proposals) {
        if (value === undefined || thing.data.userEdited?.includes(`set:${fieldSetId}`)) continue;
        try {
          registry.validate(fieldId, value);
        } catch (error) {
          if (error instanceof ApplicationError && error.kind === 'INVALID_INPUT') continue;
          throw error;
        }
        if (!result.setIds.includes(fieldSetId)) result.setIds.push(fieldSetId);
        result.values.push({
          fieldSetId,
          fieldId,
          value,
          sourceRefs: [
            {
              url,
              quote: `${fieldId}: ${JSON.stringify(value)}${freshness}`,
              provider: this.id,
              retrievedAt,
            },
          ],
        });
      }
      return result;
    }
    throw new ApplicationError('UNAVAILABLE', 'Zyfy enrichment pending');
  }
}
