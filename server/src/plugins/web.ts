import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function installWeb(app: FastifyInstance) {
  const web = resolve('dist/web/browser');
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
}
