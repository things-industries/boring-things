/**
 * Read-only Icecat JSON experiment for an existing Thing.
 * Set ICECAT_ACCESS_TOKEN in .env, then run:
 * node --import tsx --env-file=.env scripts/smoke-icecat.ts OWNER_ID THING_ID
 * Use --sample to check token access with a published Philips product.
 * Queries by a GTIN custom field, or manufacturer with product code/model.
 * Review model-only matches before using their specifications. No database writes.
 */
// cspell:words Icecat PDFURL PFL relationslimit
import * as database from '../server/src/db/connection.js';
import * as thingsDb from '../server/src/db/entities/things.js';
import type { ThingData } from '../shared/model.js';

const [ownerId, thingId] = process.argv.slice(2);
const sample = ownerId === '--sample' && !thingId;
if (!sample && (!ownerId || !thingId)) {
  console.error(
    'Usage: node --import tsx --env-file=.env scripts/smoke-icecat.ts OWNER_ID THING_ID | --sample',
  );
  process.exit(1);
}

const token = process.env.ICECAT_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('ICECAT_ACCESS_TOKEN is required in .env.');
  process.exit(1);
}

function field(data: ThingData, id: string): string | undefined {
  const stored =
    Object.values(data.values)
      .map((set) => set[id])
      .find(Boolean) ?? data.standalone[id];
  return typeof stored?.value === 'string' ? stored.value.trim() || undefined : undefined;
}

function gtin(data: ThingData): string | undefined {
  const custom = data.customFields.find(
    (item) =>
      !item.sensitive &&
      !item.instanceSpecific &&
      /^(gtin|ean|upc|barcode)$/i.test(item.label.trim()) &&
      typeof item.value === 'string' &&
      /^(\d{8}|\d{12,14})$/.test(item.value.trim()),
  );
  return typeof custom?.value === 'string' ? custom.value.trim() : undefined;
}

const pool = sample
  ? undefined
  : database.createPool(
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    );

try {
  const thing = sample ? undefined : await thingsDb.getOwnedThingOrThrow(pool!, ownerId, thingId);
  const brand = sample ? 'Philips' : field(thing!.data, 'common.manufacturer');
  const productCode = sample ? '50PFL5008T/12' : field(thing!.data, 'appliances.productCode');
  const model = thing ? field(thing.data, 'common.model') : undefined;
  const barcode = thing ? gtin(thing.data) : undefined;
  if (!barcode && (!brand || (!productCode && !model))) {
    throw new Error('Thing needs a GTIN custom field or manufacturer and product code/model.');
  }

  const url = new URL('https://live.icecat.biz/api');
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('content', '');
  url.searchParams.set('relationslimit', '1');
  if (barcode) {
    url.searchParams.set('GTIN', barcode);
  } else {
    url.searchParams.set('Brand', brand!);
    url.searchParams.set('ProductCode', (productCode ?? model)!.toUpperCase());
  }

  const response = await fetch(url, {
    headers: { 'api-token': token, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const result = (await response.json()) as {
    msg?: string;
    StatusCode?: number;
    Message?: string;
    data?: {
      GeneralInfo?: {
        IcecatId?: number;
        Title?: string;
        Brand?: string;
        BrandPartCode?: string;
        GTIN?: string[];
        Category?: { Name?: { Value?: string } };
        SummaryDescription?: { ShortSummaryDescription?: string };
        Description?: { ManualPDFURL?: string; WarrantyInfo?: string };
      };
      Image?: { HighPic?: string };
      Multimedia?: { Type?: string; URL?: string }[];
      FeaturesGroups?: {
        FeatureGroup?: { Name?: { Value?: string } };
        Features?: { Feature?: { Name?: { Value?: string } }; PresentationValue?: string }[];
      }[];
    };
  };
  if (!response.ok)
    throw new Error(
      `Icecat HTTP ${response.status}, status ${result.StatusCode ?? 'unknown'}: ${result.Message ?? 'Request failed'}`,
    );
  if (result.msg !== 'OK' || !result.data?.GeneralInfo) {
    throw new Error(`Icecat: ${result.msg ?? 'No data'}`);
  }

  const info = result.data.GeneralInfo;
  const features = (result.data.FeaturesGroups ?? []).flatMap((group) =>
    (group.Features ?? []).map((feature) => ({
      group: group.FeatureGroup?.Name?.Value,
      name: feature.Feature?.Name?.Value,
      value: feature.PresentationValue,
    })),
  );
  console.log(
    JSON.stringify(
      {
        thingId: sample ? undefined : thingId,
        lookup: barcode ? { gtin: barcode } : { brand, productCode: productCode ?? model },
        match: {
          brand: brand ? brand.toLowerCase() === info.Brand?.toLowerCase() : undefined,
          productCode: productCode
            ? productCode.toUpperCase() === info.BrandPartCode?.toUpperCase()
            : undefined,
          gtin: barcode ? info.GTIN?.includes(barcode) : undefined,
        },
        product: {
          icecatId: info.IcecatId,
          title: info.Title,
          brand: info.Brand,
          productCode: info.BrandPartCode,
          gtins: info.GTIN,
          category: info.Category?.Name?.Value,
          summary: info.SummaryDescription?.ShortSummaryDescription,
          warranty: info.Description?.WarrantyInfo,
          image: result.data.Image?.HighPic,
          manuals: (result.data.Multimedia ?? [])
            .filter((asset) => /manual|leaflet|product fiche/i.test(asset.Type ?? ''))
            .slice(0, 5)
            .map(({ Type: type, URL: url }) => ({ type, url })),
          manual: info.Description?.ManualPDFURL,
          featureCount: features.length,
          features: features.slice(0, 30),
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Icecat check failed.');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
