"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YjsTextConverter = void 0;
const y_websocket_1 = require("y-websocket");
const yjs_1 = require("yjs");
const ws_1 = __importDefault(require("ws"));
class BaseNode {
    constructor(shareType, parent) {
        this._shareType = shareType;
        this._parent = parent;
    }
}
class TextNode extends BaseNode {
    constructor(text, shareType, parent) {
        super(shareType, parent);
        this._type = "text";
        this._text = text;
    }
}
class ElementNode extends BaseNode {
    constructor(shareType, parent) {
        super(shareType, parent);
        this._type = "element";
        this._children = [];
    }
    setChildren(...children) {
        this._children = children;
    }
}
class RootNode extends BaseNode {
    constructor(shareType, parent) {
        super(shareType, parent);
        this._type = "root";
        this._children = [];
    }
    setChildren(...children) {
        this._children = children;
    }
}
class YjsTextConverter {
    constructor(doc, config) {
        this.currentIndex = 0;
        this.sharedRoot = doc.get("root", yjs_1.XmlText);
        this.provider = new y_websocket_1.WebsocketProvider("ws://localhost:1234", "room/initialize/main", doc, {
            WebSocketPolyfill: ws_1.default,
        });
        this.handler = this.createHandler(config);
        this.sharedRoot.observeDeep(this.handler);
        this.provider.on("status", this.providerStatusChange.bind(this));
    }
    providerStatusChange(event) {
        console.log(event.status);
    }
    createHandler(config) {
        return (events, transaction) => {
            events.forEach((event) => event.delta);
            events.forEach((event) => {
                const node = this.getOrInitNodeFromSharedType(event.target);
                if (event instanceof yjs_1.YTextEvent) {
                    const { keysChanged, childListChanged, delta } = event;
                    if (keysChanged.size > 0) {
                        this.syncPropertiesFromYjs(delta);
                    }
                    if (childListChanged) {
                        this.applyChildrenYjsDelta(delta);
                        this.syncChildrenFromYjs();
                    }
                }
            });
        };
    }
    getOrInitNodeFromSharedType(shareType) { }
    syncPropertiesFromYjs() { }
    applyChildrenYjsDelta() { }
    syncChildrenFromYjs() { }
    getPlainText() {
        return "";
    }
}
exports.YjsTextConverter = YjsTextConverter;
