import { WebsocketProvider } from "y-websocket";
import {
  Doc,
  RelativePosition,
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
import EventEmitter from "node:events";
import {
  IS_BOLD,
  IS_CAPITALIZE,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_LOWERCASE,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
  IS_UPPERCASE,
} from "./Constants";

export type UserState = {
  anchorPos: null | RelativePosition;
  color: string;
  focusing: boolean;
  focusPos: null | RelativePosition;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
};

export interface IGeneratedRuleContext {
  text: string;
  properties?: Record<string, any>;
}

export type GeneratedRule = (context: IGeneratedRuleContext) => string;

export interface IConfig {
  ws: string;
  room: string;
}

export type IGeneratedRules = {
  /** Text */
  text?: GeneratedRule;
  hashtag?: GeneratedRule;

  /** Element */
  heading?: GeneratedRule;
  paragraph?: GeneratedRule;
  link?: GeneratedRule;
  list?: GeneratedRule;
  listitem?: GeneratedRule;

  /** LineBreak */
  linebreak?: GeneratedRule;

  /** Decorator */
  decorator?: GeneratedRule;
  suggestion?: GeneratedRule;
};

export const DEFAULT_RULES = {
  heading: (context: IGeneratedRuleContext) => `# ${context.text}\n`,
  link: (context: IGeneratedRuleContext) => {
    return `[${context.text}](${context.properties?.__url})`;
  },
  list: (context: IGeneratedRuleContext) => `${context.text}`,
  listitem: (context: IGeneratedRuleContext) => `- ${context.text}\n`,
  // root
  text: (context: IGeneratedRuleContext) => {
    const applyFormats = (text: string, formats: number) => {
      let result = text;

      if (formats & IS_UPPERCASE) {
        result = `${text.toUpperCase()}`;
      }

      if (formats & IS_CAPITALIZE) {
        result = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
      }

      if (formats & IS_LOWERCASE) {
        result = `${text.toLowerCase()}`;
      }

      if (formats & IS_BOLD) {
        result = `**${result}**`;
      }

      if (formats & IS_ITALIC) {
        result = `*${result}*`;
      }

      if (formats & IS_UNDERLINE) {
        result = `__${result}__`;
      }

      if (formats & IS_STRIKETHROUGH) {
        result = `~~${result}~~`;
      }

      if (formats & IS_CODE) {
        result = `\`${result}\``;
      }

      if (formats & IS_SUBSCRIPT) {
        result = `~${result}~`;
      }

      if (formats & IS_SUPERSCRIPT) {
        result = `^${result}^`;
      }

      if (formats & IS_HIGHLIGHT) {
        result = `==${result}==`;
      }

      return result;
    };

    // Apply formats
    return applyFormats(context.text, context.properties?.__format || 0);
  },
  // hashtag
  // linebreak
  // decorator
  // suggestion
};

export class Converter extends EventEmitter {
  doc: Doc = new Doc();
  docMap: Map<string, Doc>;
  sharedRoot: XmlText;
  nodeMap: Map<string, VirtualNode>;
  provider: WebsocketProvider;
  currentIndex: number = 0;
  config: IConfig;

  handler: ((events: YEvent<any>[], transaction: Transaction) => void) | null;
  providerStatusChangeHandler: ((event: { status: string }) => void) | null;
  providerAwarenessUpdateHandler: (() => void) | null;

  constructor(config: IConfig) {
    super();
    this.sharedRoot = this.doc.get("root", XmlText);
    this.docMap = new Map([["main", this.doc]]);
    this.nodeMap = new Map();
    const root = new ElementNode(this.sharedRoot, null, this);
    root.setKey("root");
    root.setProperty("__type", "root");

    // @ts-expect-error We need to store the node;
    this.sharedRoot._node = root;
    this.config = config;
    this.provider = new WebsocketProvider(config.ws, config.room, this.doc, {
      WebSocketPolyfill: WebSocket as any,
    });
    this.handler = this.createHandler();
    this.providerStatusChangeHandler = this.providerStatusChange.bind(this);
    this.providerAwarenessUpdateHandler =
      this.providerAwarenessUpdate.bind(this);
    this.sharedRoot.observeDeep(this.handler);
    this.provider.on("status", this.providerStatusChangeHandler);
    this.provider.awareness.on("update", this.providerAwarenessUpdateHandler);

    this.emit("initialized");
  }

  private providerStatusChange(event: { status: string }) {
    this.emit("providerStatusChange", { status: event.status });
  }

  private providerAwarenessUpdate() {
    const awareness = this.provider.awareness;
    this.emit(
      "providerAwarenessUpdate",
      Array.from(awareness.getStates().entries())
    );
  }

  private createHandler() {
    return (events: YEvent<any>[], _transaction: Transaction) => {
      try {
        this.emit("beforeUpdated");

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

        this.emit("afterUpdated");
      } catch (e) {
        this.emit("error", e);
      }
    };
  }

  public getPlainText(rules: IGeneratedRules = {}): string {
    const mergedRules = {
      ...DEFAULT_RULES,
      ...rules,
    };

    const executeFunctionRule = (
      rule: GeneratedRule,
      context: IGeneratedRuleContext
    ) => {
      if (typeof rule === "function") {
        return rule(context);
      }
      return "";
    };

    const processNode = (node: VirtualNode) => {
      if (node._type === "paragraph") {
        const type = node._properties.__type;
        const rule =
          mergedRules[type as keyof typeof mergedRules] ||
          ((context: IGeneratedRuleContext) => `${context.text}\n\n`);

        const context: IGeneratedRuleContext = {
          text: node._children.map((child) => processNode(child)).join(""),
          properties: node.getProperties(),
        };
        return executeFunctionRule(rule, context);
      } else if (node._type === "text") {
        const type = node._properties?.__type;
        const rule =
          (type
            ? mergedRules[type as keyof typeof mergedRules]
            : mergedRules.text) ||
          ((context: IGeneratedRuleContext) => `${context.text}`);

        return executeFunctionRule(rule, {
          text: (node as TextNode)._text,
          properties: node.getProperties(),
        });
      }
      return "";
    };

    // @ts-expect-error
    const result = processNode(this.sharedRoot._node);
    const plainText = result.replace(/\n\n/g, "\n").trim();

    return plainText;
  }

  public destroy() {
    if (this.providerStatusChangeHandler) {
      this.provider.off("status", this.providerStatusChangeHandler);
    }
    if (this.handler) {
      this.sharedRoot.unobserveDeep(this.handler);
    }
    if (this.providerAwarenessUpdateHandler) {
      this.provider.awareness.off(
        "update",
        this.providerAwarenessUpdateHandler
      );
    }

    this.provider.destroy();

    // @ts-expect-error
    const root = this.sharedRoot._node;

    if (root) {
      (root as VirtualNode).destroy();
      // @ts-expect-error
      this.sharedRoot._node = null;
    }

    this.handler = null;
    this.providerStatusChangeHandler = null;
    this.providerAwarenessUpdateHandler = null;

    this.emit("destroy");
  }
}
