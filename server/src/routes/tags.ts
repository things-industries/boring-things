/**
 * Registers owner-scoped tag listing, creation, renaming and deletion, updating linked Thing
 * revisions when tags are removed.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';
import { page, pageResult } from '../application/pagination.js';
import { rows, transaction } from '../db/connection.js';
import { ensure } from '../application/errors.js';

export function tagRoutes(app: FastifyInstance, db: pg.Pool) {
  route(app, 'GET', '/api/tags', async (req) => {
    const { limit, offset } = page(req.query);
    return pageResult(
      await rows(
        db,
        'select id,name from bt.tags where owner_id=$1 order by name,id limit $2 offset $3',
        [req.ownerId, limit + 1, offset],
      ),
      req.query,
    );
  });

  route<Schema['TagInput']>(app, 'POST', '/api/tags', async (req, reply) => {
    ensure(req.body.name.trim(), 'Name cannot be blank');
    const [tag] = await rows(
      db,
      'insert into bt.tags(owner_id,name) values($1,$2) returning id,name',
      [req.ownerId, req.body.name.trim()],
    );
    reply.code(201);
    return tag;
  });

  route<Schema['TagInput']>(app, 'PATCH', '/api/tags/{id}', async (req) => {
    ensure(req.body.name.trim(), 'Name cannot be blank');
    const [tag] = await rows(
      db,
      'update bt.tags set name=$1 where id=$2 and owner_id=$3 returning id,name',
      [req.body.name.trim(), req.params.id, req.ownerId],
    );
    ensure(tag, 'Tag not found', 404);
    return tag;
  });

  route(app, 'DELETE', '/api/tags/{id}', async (req, reply) => {
    await transaction(db, async (tx) => {
      const result = await tx.query(
        'select id from bt.tags where id=$1 and owner_id=$2 for update',
        [req.params.id, req.ownerId],
      );
      ensure(result.rowCount, 'Tag not found', 404);
      // Deleting a tag removes its links; bump affected Thing revisions so snapshot subscribers see the change.
      await tx.query(
        'update bt.things set revision=revision+1 where owner_id=$1 and id in(select thing_id from bt.thing_tags where tag_id=$2)',
        [req.ownerId, req.params.id],
      );
      await tx.query('delete from bt.tags where id=$1 and owner_id=$2', [
        req.params.id,
        req.ownerId,
      ]);
    });
    reply.code(204).send();
  });
}
