import { Converter } from "./Converter";
import {
  getOrInitNodeFromSharedType,
  getPositionFromElementAndOffset,
  isExcludedProperty,
  spliceString,
} from "./Utils";
import { AbstractType, XmlElement, XmlText, Map as YMap } from "yjs";

export type SharedType = XmlText | YMap<unknown> | XmlElement;
export type ParentSharedType = BaseNode | null;
export type NodeKey = string;

export type Delta = {
  insert?: string | object | AbstractType<unknown>;
  delete?: number;
  retain?: number;
  attributes?: {
    [x: string]: unknown;
  };
};

export interface IInternalNode {
  _children: BaseNode[];
  setChildren(...children: BaseNode[]): void;
}

export interface IVirtualNode {
  applyChildrenYjsDelta(delta: Delta[]): void;
  syncPropertiesFromYjs(keysChanged: null | Set<string>): void;
}

export class BaseNode {
  _key: NodeKey;
  _sharedType: SharedType;
  _parent: ParentSharedType;
  _converter: Converter;
  _properties: Record<string, any> = {};
  constructor(
    sharedType: SharedType,
    parent: ParentSharedType,
    converter: Converter
  ) {
    this._key = "";
    this._sharedType = sharedType;
    this._parent = parent;
    this._converter = converter;
  }

  setProperty(key: string, value: any) {
    this._properties[key] = value;
  }

  setKey(key: string) {
    this._key = key;
  }
}

export class VirtualNode extends BaseNode implements IVirtualNode {
  static create<T>(
    ConstructorFunc: new (sharedType: SharedType, ...args: any[]) => T,
    sharedType: SharedType,
    ...args: any[]
  ): T {
    const node = new ConstructorFunc(sharedType, ...args);

    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    sharedType._node = node;
    return node;
  }

  _type: string | undefined;
  _children: VirtualNode[];
  constructor(
    sharedType: SharedType,
    parent: ParentSharedType,
    converter: Converter
  ) {
    super(sharedType, parent, converter);
    this._children = [];
  }
  getPlainText() {
    return "";
  }
  getType() {
    return this._type as keyof typeof registerNodes;
  }
  getProperties() {
    return this._properties;
  }
  applyChildrenYjsDelta(deltas: Delta[]) {
    const children = this._children;
    let currIndex = 0;

    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      const insertDelta = delta.insert;
      const deleteDelta = delta.delete;

      if (delta.retain != null) {
        currIndex += delta.retain;
      } else if (typeof deleteDelta === "number") {
        let deletionSize = deleteDelta;

        while (deletionSize > 0) {
          const { node, nodeIndex, offset, length } =
            getPositionFromElementAndOffset(
              this as unknown as ElementNode,
              currIndex,
              false
            );

          if (
            node instanceof ElementNode ||
            node instanceof LineBreakNode ||
            node instanceof DecoratorNode
          ) {
            children.splice(nodeIndex, 1);
            deletionSize -= 1;
          } else if (node instanceof TextNode) {
            const delCount = Math.min(deletionSize, length);
            const prevNode = nodeIndex !== 0 ? children[nodeIndex - 1] : null;
            const nodeSize = node.getSize();

            if (offset === 0 && length === nodeSize) {
              // Text node has been deleted.
              children.splice(nodeIndex, 1);
              // If this was caused by an undo from YJS, there could be dangling text.
              const danglingText = spliceString(
                node._text,
                offset,
                delCount - 1,
                ""
              );
              if (danglingText.length > 0) {
                if (prevNode instanceof TextNode) {
                  // Merge the text node with previous.
                  prevNode._text += danglingText;
                } else {
                  // No previous text node to merge into, just delete the text.
                  // @ts-expect-error
                  this._sharedType.delete(offset, danglingText.length);
                }
              }
            } else {
              node._text = spliceString(node._text, offset, delCount, "");
            }

            deletionSize -= delCount;
          } else {
            // Can occur due to the deletion from the dangling text heuristic below.
            break;
          }
        }
      } else if (insertDelta != null) {
        if (typeof insertDelta === "string") {
          const { node, offset } = getPositionFromElementAndOffset(
            this as unknown as ElementNode,
            currIndex,
            true
          );

          if (node instanceof TextNode) {
            node._text = spliceString(node._text, offset, 0, insertDelta);
          } else {
            // @ts-expect-error
            this._sharedType.delete(offset, insertDelta.length);
          }

          currIndex += insertDelta.length;
        } else {
          const sharedType = insertDelta;
          const { nodeIndex } = getPositionFromElementAndOffset(
            this as unknown as ElementNode,
            currIndex,
            false
          );
          const node = getOrInitNodeFromSharedType(
            sharedType as XmlText | YMap<unknown> | XmlElement,
            this._converter,
            this
          );
          children.splice(nodeIndex, 0, node);
          currIndex += 1;
        }
      } else {
        throw new Error("Unexpected delta format");
      }
    }
  }
  syncPropertiesFromYjs(keysChanged: null | Set<string>) {
    const sharedType = this._sharedType;
    const properties =
      keysChanged === null
        ? sharedType instanceof YMap
          ? Array.from(sharedType.keys())
          : Object.keys(sharedType.getAttributes())
        : Array.from(keysChanged);

    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const nextValue =
        sharedType instanceof YMap
          ? sharedType.get(property)
          : sharedType.getAttribute(property);

      if (!isExcludedProperty(property)) {
        this.setProperty(property, nextValue);
      }
    }
  }

  syncChildrenFromYjs() {
    const children = this._children;
    const childrenLength = children.length;

    for (let i = 0; i < childrenLength; i++) {
      const node = children[i];

      if (node instanceof ElementNode) {
        const sharedType = node._sharedType;
        node.syncPropertiesFromYjs(null);
        node.applyChildrenYjsDelta((sharedType as XmlText).toDelta());
        node.syncChildrenFromYjs();
      } else if (node instanceof TextNode) {
        node.syncPropertiesFromYjs(null);
      } else if (node instanceof DecoratorNode) {
        node.syncPropertiesFromYjs(null);
      }
    }
  }

  getSize(): number {
    return 1;
  }

  setChildren(...children: VirtualNode[]): void {
    this._children = children;
  }
}

export class TextNode extends VirtualNode {
  _type = "text";
  _text: string;
  _normalized: boolean = false;
  constructor(
    sharedType: SharedType,
    parent: ParentSharedType,
    converter: Converter,
    text: string
  ) {
    super(sharedType, parent, converter);
    this._text = text;
  }

  getPlainText(): string {
    return this._text;
  }

  getSize() {
    return this._text.length + (this._normalized ? 0 : 1);
  }
}

export class ElementNode extends VirtualNode implements IInternalNode {
  _type: string = "paragraph";
}

export class LineBreakNode extends VirtualNode {
  _type: string = "linebreak";
}

export class DecoratorNode extends VirtualNode {
  _type: string = "decorator";
}

export class RootNode extends VirtualNode implements IInternalNode {
  _type = "root";
}

export const registerNodes = {
  paragraph: ElementNode,
  text: TextNode,
  linebreak: LineBreakNode,
  decorator: DecoratorNode,
  heading: ElementNode,
  link: ElementNode
};
