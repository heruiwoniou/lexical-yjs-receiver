import { Converter, IGeneratedRuleContext } from "./core/Converter";
import http from "node:http";

const converter = new Converter({
  ws: "ws://localhost:1234",
  room: "room/initialize/main",
  // room: "room/initialize/0"
});

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        data: "Hello World!",
      })
    );
  })
  .listen(3002, () => {
    converter.on("afterUpdated", () => {
      const plainText = converter.getPlainText();

      console.log(plainText);
    });
  });
