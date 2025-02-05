"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yjs_1 = require("yjs");
const YjsTextConverter_1 = require("./YjsTextConverter");
const node_http_1 = __importDefault(require("node:http"));
const converter = new YjsTextConverter_1.YjsTextConverter(new yjs_1.Doc(), {
    lineBreakElement: "\n\n",
    textDecorator: (text, attrs) => {
        let output = text;
        if (attrs.get("bold"))
            output = `**${output}**`;
        if (attrs.get("italic"))
            output = `*${output}*`;
        return output;
    },
});
node_http_1.default
    .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        data: "Hello World!",
    }));
})
    .listen(3002, () => {
    console.log("PORT 3002");
    setInterval(() => {
        console.log(converter.getPlainText());
    }, 5000);
});
