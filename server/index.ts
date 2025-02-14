import debug from 'debug';
import Koa from 'koa';
import Router from '@koa/router';
import * as Core from '../core';

const log = debug('Server');

const ws = process.env.WS || 'ws://localhost:1234';

const app = new Koa();
const router = new Router();

function callback(_plainText: string, _room: string) {
  // TODO: export plainText
}

app.on('error', (err) => {
  console.error('[Catched global error]', err);
});

router.get('/', (ctx) => {
  ctx.body = 'Shadow Editor Manager is running.';
});

router.post('/shadow/:task/:type/create', (ctx) => {
  const { task, type } = ctx.params;
  Core.create({
    ws,
    room: `${task}/${type}`,
    callback,
  });
  log(`Created ${task}/${type}`);
  ctx.body = {
    message: 'success',
  };
});

app.use(router.routes()).use(router.allowedMethods());

app.on('destroy', () => {
  Core.destroy();
  log(`Manager destroy`);
});

export default app;
