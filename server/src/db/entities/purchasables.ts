// Persists user-scoped opportunities to buy products that maintain or improve a Thing.

import { createHash } from 'node:crypto';
import type { Schema } from '../../../../shared/model.js';
import type { RouteTypes } from '../../contracts/routes.js';
import * as database from '../connection.js';
import type { Database } from '../connection.js';
import { ensure } from '../../application/errors.js';
import { page, pageResult } from '../../application/pagination.js';

export type PurchasableQuery = RouteTypes<'/api/purchasables', 'get'>['Querystring'];
const columns =
  "id,thing_id,kind,name,description,merchant_url,image_url,source_refs,checked_at,is_sample,created_at,updated_at,case when price_amount is null then null else jsonb_build_object('amountMinor',price_amount,'currency',currency) end as price";

export async function listPurchasables(
  db: Database,
  userId: string,
  query: PurchasableQuery,
): Promise<Schema['PurchasableList']> {
  const { limit, offset } = page(query);
  return pageResult(
    await database.rows<Schema['Purchasable']>(
      db,
      `select ${columns} from bt.purchasables where user_id=$1 and ($2::uuid is null or thing_id=$2) and ($3::text is null or kind=$3) order by created_at desc,id limit $4 offset $5`,
      [userId, query.thingId ?? null, query.kind ?? null, limit + 1, offset],
    ),
    query,
  );
}

export async function getPurchasableForUserOrThrow(
  db: Database,
  userId: string,
  id: string,
  options: { lock?: boolean } = {},
): Promise<Schema['Purchasable']> {
  const [item] = await database.rows<Schema['Purchasable']>(
    db,
    `select ${columns} from bt.purchasables where id=$1 and user_id=$2${options.lock ? ' for update' : ''}`,
    [id, userId],
  );
  ensure(item, 'Record not found', 'NOT_FOUND');
  return item;
}

export async function existingPurchasables(db: Database, userId: string, thingId: string) {
  return database.rows<Pick<Schema['Purchasable'], 'name' | 'kind'>>(
    db,
    'select name,kind from bt.purchasables where thing_id=$1 and user_id=$2 order by created_at desc,id limit 200',
    [thingId, userId],
  );
}

/** Removes generated purchasables so research can reassess compatibility. */
export async function removeSuggestions(db: Database, userId: string, thingId: string) {
  await database.execute(
    db,
    'delete from bt.purchasables where user_id=$1 and thing_id=$2 and import_key is not null',
    [userId, thingId],
  );
}

// Inserts a researched purchasable once, preserving existing products and user edits.
export async function saveSuggestedPurchasable(
  db: Database,
  userId: string,
  thingId: string,
  product: Pick<
    Schema['Purchasable'],
    'kind' | 'name' | 'description' | 'merchantUrl' | 'sourceRefs'
  >,
) {
  const [saved] = await database.rows<{ id: string }>(
    db,
    `insert into bt.purchasables(user_id,thing_id,kind,name,description,merchant_url,source_refs,checked_at,import_key)
     select $1,$2,$3,$4,$5,$6,$7,now(),$8
     where not exists(select 1 from bt.purchasables where user_id=$1 and thing_id=$2 and kind=$3 and (lower(trim(name))=lower(trim($4)) or merchant_url=$6))
     on conflict(import_key) do nothing returning id`,
    [
      userId,
      thingId,
      product.kind,
      product.name,
      product.description,
      product.merchantUrl,
      JSON.stringify(product.sourceRefs),
      createHash('sha256')
        .update(
          `${thingId}:${product.kind}:${product.merchantUrl.trim().toLowerCase().replace(/\s+/g, ' ')}`,
        )
        .digest('hex'),
    ],
  );
  return saved?.id;
}
