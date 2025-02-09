import debug from 'debug';
import Koa from "koa";
import Router from "@koa/router";
import * as Core from "../core";

const log = debug("Server");

const app = new Koa();

const router = new Router();

app.on("error", (err) => {
  console.error("[Catched global error]", err);
});

router.get("/", (ctx) => {
  ctx.body = "Shaddow Editor Manager is running.";
});

router.post("/shaddow/:task/:type/create", (ctx) => {
  const { task, type } = ctx.params;

  Core.create(`${task}/${type}`);

  log(`Created ${task}/${type}`);

  ctx.body = {
    message: "success",
  };
});

app.use(router.routes()).use(router.allowedMethods());

app.on("destroy", () => {
  Core.destroy();
  log(`Manager destroy`);
});

export default app;
