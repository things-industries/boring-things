/**
 * Registers owner-scoped issue, event and product reads, plus issue and event writes with lifecycle
 * and relationship validation.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';
import { rows, transaction } from '../db/connection.js';
import { ensure } from '../application/errors.js';
import { page, pageResult } from '../application/pagination.js';
import { ownedThing, bumpThing } from '../db/things.js';

export function activityRoutes(app: FastifyInstance, db: pg.Pool) {
  for (const kind of ['issues', 'events', 'purchasables'] as const) {
    const select =
      kind === 'purchasables'
        ? `*,case when price_amount is null then null else jsonb_build_object('amountMinor',price_amount,'currency',currency) end as price`
        : '*';

    route(app, 'GET', `/api/${kind}`, async (req) => {
      if (req.query.thingId) await ownedThing(db, req.ownerId, req.query.thingId);
      const { limit, offset } = page(req.query);
      const filters = ['owner_id=$1'];
      const params: unknown[] = [req.ownerId];

      for (const [key, column] of [
        ['thingId', 'thing_id'],
        [kind === 'purchasables' ? 'kind' : 'status', kind === 'purchasables' ? 'kind' : 'status'],
      ] as const) {
        const value = req.query[key];

        if (value) {
          params.push(value);
          filters.push(`${column}=$${params.length}`);
        }
      }

      if (kind === 'events')
        for (const [key, op] of [
          ['from', '>='],
          ['to', '<='],
        ] as const) {
          if (req.query[key]) {
            params.push(req.query[key]);
            filters.push(`starts_at ${op} $${params.length}`);
          }
        }

      params.push(limit + 1, offset);
      return pageResult(
        await rows(
          db,
          `select ${select} from bt.${kind} where ${filters.join(' and ')} order by ${kind === 'events' ? 'starts_at asc nulls last' : 'created_at desc'},id limit $${params.length - 1} offset $${params.length}`,
          params,
        ),
        req.query,
      );
    });

    route(app, 'GET', `/api/${kind}/{id}`, async (req) => {
      const [item] = await rows(
        db,
        `select ${select} from bt.${kind} where id=$1 and owner_id=$2`,
        [req.params.id, req.ownerId],
      );
      ensure(item, 'Record not found', 404);
      return item;
    });

    if (kind === 'purchasables') continue;
    type Input = Schema['EventInput'] | Schema['IssueInput'];

    // The HTTP contract chooses the resource-specific input before this shared workflow runs.
    for (const method of ['POST', 'PATCH'] as const)
      route<Partial<Input>>(
        app,
        method,
        `/api/${kind}${method === 'PATCH' ? '/{id}' : ''}`,
        async (req, reply) =>
          transaction(db, async (tx) => {
            let existing: Record<string, unknown> | undefined;

            if (method === 'PATCH') {
              [existing] = await rows<Record<string, unknown>>(
                tx,
                `select * from bt.${kind} where id=$1 and owner_id=$2 for update`,
                [req.params.id, req.ownerId],
              );
              ensure(existing, 'Record not found', 404);
            }

            const body = req.body as Record<string, unknown>;
            const thingId = (existing?.['thingId'] ?? body['thingId']) as string;
            await ownedThing(tx, req.ownerId, thingId, true);
            const status = (body['status'] ??
              existing?.['status'] ??
              (kind === 'events' ? 'suggested' : 'open')) as string;
            const title = (body['title'] ?? existing?.['title']) as string;
            ensure(title.trim(), 'Title cannot be blank');
            const description = body['description'] ?? existing?.['description'] ?? '';
            let item;

            if (kind === 'events') {
              const startsAt =
                body['startsAt'] === undefined
                  ? (existing?.['startsAt'] ?? null)
                  : body['startsAt'];

              const issueId =
                body['issueId'] === undefined ? (existing?.['issueId'] ?? null) : body['issueId'];
              ensure(status !== 'scheduled' || startsAt, 'Scheduled events need a date');

              if (issueId)
                ensure(
                  (
                    await tx.query(
                      'select id from bt.issues where id=$1 and thing_id=$2 and owner_id=$3',
                      [issueId, thingId, req.ownerId],
                    )
                  ).rowCount,
                  'Issue must belong to this Thing',
                );

              // Preserve the first completion timestamp while completed; reopening clears it for a later completion.
              const completedAt =
                status === 'completed'
                  ? (existing?.['completedAt'] ?? new Date().toISOString())
                  : null;

              const values = [title.trim(), description, status, startsAt, completedAt, issueId];
              [item] =
                method === 'POST'
                  ? await rows(
                      tx,
                      'insert into bt.events(title,description,status,starts_at,completed_at,issue_id,thing_id,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',
                      [...values, thingId, req.ownerId],
                    )
                  : await rows(
                      tx,
                      'update bt.events set title=$1,description=$2,status=$3,starts_at=$4,completed_at=$5,issue_id=$6 where id=$7 and owner_id=$8 returning *',
                      [...values, req.params.id, req.ownerId],
                    );
            } else {
              const resolvedAt =
                status === 'resolved'
                  ? (existing?.['resolvedAt'] ?? new Date().toISOString())
                  : null;
              [item] =
                method === 'POST'
                  ? await rows(
                      tx,
                      'insert into bt.issues(title,description,status,resolved_at,thing_id,owner_id) values($1,$2,$3,$4,$5,$6) returning *',
                      [title.trim(), description, status, resolvedAt, thingId, req.ownerId],
                    )
                  : await rows(
                      tx,
                      'update bt.issues set title=$1,description=$2,status=$3,resolved_at=$4 where id=$5 and owner_id=$6 returning *',
                      [title.trim(), description, status, resolvedAt, req.params.id, req.ownerId],
                    );
            }

            await bumpThing(tx, req.ownerId, thingId);
            if (method === 'POST') reply.code(201);
            return item;
          }),
      );
  }
}
