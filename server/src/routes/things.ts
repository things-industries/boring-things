/**
 * Registers Thing listing, creation, editing, deletion and explicit field reveal, keeping stored
 * sensitive data out of list responses.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import type { Registry } from '../application/registry.js';
import { route } from '../contracts/routes.js';
import { page, pageResult } from '../application/pagination.js';
import { rows, transaction } from '../db/connection.js';
import { detail, writeThing } from '../application/things.js';
import { assertEditable } from '../db/imports.js';
import { ownedThing } from '../db/things.js';
import { revealValue } from '../application/thing-data.js';

export function thingRoutes(app: FastifyInstance, db: pg.Pool, registry: Registry) {
  route(app, 'GET', '/api/things', async (req) => {
    const { limit, offset } = page(req.query);
    const result = await rows<Schema['ThingSummary']>(
      db,
      `select t.*,revision::integer, coalesce((select jsonb_agg(tag_id order by tag_id) from bt.thing_tags where thing_id=t.id),'[]') as tag_ids from bt.things t where owner_id=$1 and ($2::text is null or category_id=$2) and ($3::uuid is null or exists(select 1 from bt.thing_tags where thing_id=t.id and tag_id=$3)) and ($4='' or strpos(lower(name || ' ' || description),lower($4))>0) order by updated_at desc,id limit $5 offset $6`,
      [
        req.ownerId,
        req.query.categoryId ?? null,
        req.query.tagId ?? null,
        req.query.q ?? '',
        limit + 1,
        offset,
      ],
    );

    // Explicitly omit stored data; sensitive values never enter list responses.
    return pageResult(
      result.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        categoryId: t.categoryId,
        revision: t.revision,
        imageAttachmentId: t.imageAttachmentId,
        tagIds: t.tagIds,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        isSample: t.isSample,
      })),
      req.query,
    );
  });

  route<Schema['ThingCreate']>(app, 'POST', '/api/things', async (req, reply) => {
    reply.code(201);
    return writeThing(db, req.ownerId, req.body, registry);
  });

  route(app, 'GET', '/api/things/{id}', (req) => detail(db, req.ownerId, req.params.id, registry));

  route<Schema['ThingPatch']>(app, 'PATCH', '/api/things/{id}', (req) =>
    writeThing(db, req.ownerId, req.body, registry, req.params.id),
  );

  route(app, 'DELETE', '/api/things/{id}', async (req, reply) => {
    await transaction(db, async (tx) => {
      await ownedThing(tx, req.ownerId, req.params.id, true);
      await assertEditable(tx, req.ownerId, req.params.id);
      await tx.query('delete from bt.things where id=$1 and owner_id=$2', [
        req.params.id,
        req.ownerId,
      ]);
    });
    reply.code(204).send();
  });

  route<Schema['Pin']>(app, 'POST', '/api/things/{id}:reveal-field', async (req) => ({
    value: revealValue((await ownedThing(db, req.ownerId, req.params.id)).data, req.body, registry),
  }));
}
