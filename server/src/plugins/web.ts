/**
 * Serves built frontend assets and GET deep links, preserving JSON 404s for unmatched API requests.
 */

import type { FastifyPluginAsync } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Options {
  directory?: string;
}

const web: FastifyPluginAsync<Options> = async (app, options) => {
  const web = resolve(options.directory ?? 'dist/web/browser');
  if (existsSync(web)) await app.register(fastifyStatic, { root: web });
  app.setNotFoundHandler((request, reply) => {
    if (
      request.url === '/api' ||
      request.url.startsWith('/api/') ||
      request.method !== 'GET' ||
      !existsSync(web)
    )
      return reply.code(404).send({ message: 'Not found', statusCode: 404 });
    return reply.sendFile('index.html');
  });
};

export default web;
