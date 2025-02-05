"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YjsTextConverter = void 0;
const y_websocket_1 = require("y-websocket");
const yjs_1 = require("yjs");
const ws_1 = __importDefault(require("ws"));
class YjsTextConverter {
    constructor(doc, config) {
        this.plainText = "";
        this.currentIndex = 0;
        this.sharedRoot = doc.get("root", yjs_1.XmlText);
        this.provider = new y_websocket_1.WebsocketProvider("ws://localhost:1234", "room/initialize", doc, {
            WebSocketPolyfill: ws_1.default,
        });
        this.handler = this.createHandler(config);
        this.sharedRoot.observeDeep(this.handler);
        this.convertInitialContent(config);
        this.provider.on("status", this.providerStatusChange.bind(this));
    }
    providerStatusChange(event) {
        console.log(event.status);
    }
    convertInitialContent(config) {
        this.plainText = this.processNode(this.sharedRoot, 0, config);
    }
    processNode(node, depth, config) {
        let result = "";
        const children = this.getChildren(node);
        children.forEach((child) => {
            if (child instanceof yjs_1.XmlElement) {
                result += this.processElement(child, depth, config);
            }
            else if (child instanceof yjs_1.XmlText) {
                result += this.processTextNode(child, config);
            }
        });
        return result;
    }
    getChildren(node) {
        if (node instanceof yjs_1.XmlElement) {
            return node
                .toArray()
                .filter((child) => child instanceof yjs_1.XmlText || child instanceof yjs_1.XmlElement);
        }
        return [node];
    }
    processElement(element, depth, config) {
        const childContent = this.processNode(element, depth + 1, config);
        const tagName = element.nodeName;
        if (["paragraph", "heading", "div"].includes(tagName)) {
            return `${childContent}${(config === null || config === void 0 ? void 0 : config.lineBreakElement) || "\n"}`;
        }
        return childContent;
    }
    processTextNode(textNode, config) {
        const text = textNode.toString();
        const attributes = new Map(Object.entries(textNode.getAttributes()));
        if (config === null || config === void 0 ? void 0 : config.textDecorator) {
            return config.textDecorator(text, attributes);
        }
        return text;
    }
    createHandler(config) {
        return (events, transaction) => {
            events.forEach((event) => {
                if (event.target === this.sharedRoot) {
                    event.changes.delta.forEach((delta) => {
                        if (delta.insert) {
                            this.handleInsertDelta(delta, config);
                        }
                        else if (delta.delete) {
                            this.handleDeleteDelta(delta);
                        }
                        else if (delta.retain) {
                            this.handleRetainDelta(delta, config);
                        }
                    });
                }
            });
        };
    }
    getPlainText() {
        return this.plainText;
    }
    destroy() {
        this.sharedRoot.unobserveDeep(this.handler);
    }
    handleRetainDelta(delta, config) {
        const { retain, attributes } = delta;
        if (!retain)
            return;
        this.currentIndex += retain;
        if (attributes) {
            this.handleAttributesChange(retain, attributes, config);
        }
    }
    handleAttributesChange(length, attributes, config) {
        var _a;
        const start = this.currentIndex - length;
        const end = this.currentIndex;
        const original = this.plainText.slice(start, end);
        const transformed = ((_a = config === null || config === void 0 ? void 0 : config.textDecorator) === null || _a === void 0 ? void 0 : _a.call(config, original, attributes)) || original;
        if (transformed !== original) {
            this.plainText = [
                this.plainText.slice(0, start),
                transformed,
                this.plainText.slice(end),
            ].join("");
            this.currentIndex += transformed.length - original.length;
        }
    }
    handleInsertDelta(delta, config) {
        if (!delta.insert)
            return;
        const insertedContent = this.processDeltaContent(delta.insert, config);
        this.plainText = [
            this.plainText.slice(0, this.currentIndex),
            insertedContent,
            this.plainText.slice(this.currentIndex),
        ].join("");
        this.currentIndex += insertedContent.length;
    }
    handleDeleteDelta(delta) {
        if (!delta.delete)
            return;
        const start = this.currentIndex;
        const end = start + delta.delete;
        this.plainText = [
            this.plainText.slice(0, start),
            this.plainText.slice(end),
        ].join("");
    }
    processDeltaContent(content, config) {
        if (typeof content === "string")
            return content;
        let result = "";
        content.forEach((item) => {
            if (item instanceof yjs_1.XmlElement) {
                result += this.processElement(item, 0, config);
            }
            else if (item instanceof yjs_1.XmlText) {
                result += this.processTextNode(item, config);
            }
        });
        return result;
    }
}
exports.YjsTextConverter = YjsTextConverter;
