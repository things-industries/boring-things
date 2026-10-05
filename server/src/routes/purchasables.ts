// Registers owner-scoped routes for purchasable opportunities associated with Things.

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import * as purchasablesDb from '../db/entities/purchasables.js';

interface Options {
  db: pg.Pool;
}

const purchasableRoutes: FastifyPluginAsync<Options> = async (app, { db }) => {
  route(app, 'GET', '/api/purchasables', (req) =>
    purchasablesDb.listPurchasables(db, req.ownerId, req.query),
  );
  route(app, 'GET', '/api/purchasables/{id}', (req) =>
    purchasablesDb.getOwnedPurchasableOrThrow(db, req.ownerId, req.params.id),
  );
};

export default purchasableRoutes;
