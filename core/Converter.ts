import { WebsocketProvider } from "y-websocket";
import {
  Doc,
  Transaction,
  XmlText,
  YEvent,
  YMapEvent,
  YTextEvent,
  YXmlEvent,
} from "yjs";
import WebSocket from "ws";
import { DecoratorNode, ElementNode, TextNode, VirtualNode } from "./Nodes";
import invariant, { getOrInitNodeFromSharedType } from "./Utils";

type IConfigRule = (text: string, properties?: Record<string, any>) => string;

interface IConfig {
  ws: string;
  room: string;
  rules?: {
    paragraph?: IConfigRule;
    linebreak?: IConfigRule;
    text?: IConfigRule;
    decorator?: IConfigRule;
  };
}

export class Converter {
  doc: Doc = new Doc();
  docMap: Map<string, Doc>;
  sharedRoot: XmlText;
  handler: (events: YEvent<any>[], transaction: Transaction) => void;
  provider: WebsocketProvider;
  currentIndex: number = 0;
  config: IConfig;

  constructor(config: IConfig) {
    this.sharedRoot = this.doc.get("root", XmlText);
    this.docMap = new Map([["main", this.doc]]);
    const root = new ElementNode(this.sharedRoot, null, this);
    root.setKey("root");

    // @ts-expect-error We need to store the node;
    this.sharedRoot._node = root;
    this.config = config;
    this.provider = new WebsocketProvider(config.ws, config.room, this.doc, {
      WebSocketPolyfill: WebSocket as any,
    });
    this.handler = this.createHandler();
    this.sharedRoot.observeDeep(this.handler);
    this.provider.on("status", this.providerStatusChange.bind(this));
  }

  private providerStatusChange(event: { status: string }) {
    console.log(event.status);
  }

  private createHandler() {
    return (events: YEvent<any>[], _transaction: Transaction) => {
      events.forEach((event) => event.delta);

      events.forEach((event) => {
        const node = getOrInitNodeFromSharedType(event.target, this);
        if (node instanceof ElementNode && event instanceof YTextEvent) {
          // @ts-expect-error We need to access the private property of the class
          const { keysChanged, childListChanged, delta } = event;
          if (keysChanged.size > 0) {
            node.syncPropertiesFromYjs(keysChanged);
          }

          if (childListChanged) {
            node.applyChildrenYjsDelta(delta);
            node.syncChildrenFromYjs();
          }
        } else if (node instanceof TextNode && event instanceof YMapEvent) {
          const { keysChanged } = event;

          if (keysChanged.size > 0) {
            node.syncPropertiesFromYjs(keysChanged);
          }
        } else if (
          node instanceof DecoratorNode &&
          event instanceof YXmlEvent
        ) {
          const { attributesChanged } = event;

          if (attributesChanged.size > 0) {
            node.syncPropertiesFromYjs(attributesChanged);
          }
        } else {
          invariant(false, "Expected text, element");
        }
      });
    };
  }

  getPlainText(): string {
    const processNode = (
      node: VirtualNode,
      result: string[],
      isSameParagraph: boolean
    ) => {
      const type = node.getType();
      if (type === "paragraph") {
        let paragraphText = "";
        const hasChildren = node._children.length > 0;
        if (hasChildren) {
          node._children.forEach((child) => {
            const childText = processNode(child, result, true);
            if (childText !== null) {
              if (!isSameParagraph) {
                paragraphText += "\n";
              }
              paragraphText += childText;
            }
          });
          if (paragraphText) {
            if (isSameParagraph) {
              result.push(paragraphText);
            } else {
              result.push("\n" + paragraphText);
            }
          }
        } else {
          result.push("\n");
        }
      } else if (type === "text") {
        const text = node.getPlainText();
        if (text.trim()) {
          return text.trim();
        }
        return null;
      }
      return null;
    };

    const result: string[] = [];
    // @ts-expect-error
    processNode(this.sharedRoot._node, result, false);
    const plainText = result.join("\n").trim();

    console.log(plainText);

    return plainText;
  }
}
