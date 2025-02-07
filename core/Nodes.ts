import { Converter } from "./Converter";
import invariant, {
  createChildrenArray,
  createChildrenVirtualNode,
  getOrInitNodeFromSharedType,
  getPositionFromElementAndOffset,
  isExcludedProperty,
  spliceString,
} from "./Utils";
import { AbstractType, XmlElement, XmlText, Map as YMap } from "yjs";

export type SharedType = XmlText | YMap<unknown> | XmlElement;
export type ParentNodeType = BaseNode | null;
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
  _first: NodeKey | null = null;
  _last?: NodeKey | null = null;
  _next: NodeKey | null = null;
  _prev: NodeKey | null = null;
  _sharedType: SharedType;
  _parent: ParentNodeType;
  _converter: Converter;
  _properties: Record<string, any> = {};

  constructor(
    sharedType: SharedType,
    parent: ParentNodeType,
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

  getFirstChild<T extends BaseNode>(this: T): T | null {
    const firstKey = this._first;
    const map = this._converter.nodeMap;
    if (firstKey && map.has(firstKey)) {
      return map.get(firstKey) as unknown as T;
    }
    return null;
  }

  getPreviousSibling<T extends BaseNode>(this: T): T | null {
    const prevKey = this._prev;
    const map = this._converter.nodeMap;
    if (prevKey && map.has(prevKey)) {
      return map.get(prevKey) as unknown as T;
    }

    return null;
  }

  getNextSibling<T extends BaseNode>(this: T): T | null {
    const nextKey = this._next;
    const map = this._converter.nodeMap;
    if (nextKey && map.has(nextKey)) {
      return map.get(nextKey) as unknown as T;
    }
    return null;
  }

  getParent<T extends BaseNode>(this: T): T | null {
    return this._parent as T;
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
  _children: VirtualNode[] = [];

  constructor(
    sharedType: SharedType,
    parent: ParentNodeType,
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

    const prevChildrenKeys = createChildrenArray(this, this._converter.nodeMap);

    const nextChildrenKeys: Array<NodeKey> = [];
    const visitedKeys = new Set();
    const self = this as VirtualNode;
    let prevIndex = 0;
    let prevChildNode: VirtualNode | null = null;
    let nodeKeys;

    for (let i = 0; i < childrenLength; i++) {
      const cacheKey = prevChildrenKeys[prevIndex];
      const child = children[i];
      const childKey = child._key;

      if (cacheKey === childKey) {
        const childNeedsUpdating = child.getType() === "text";
        // Update
        visitedKeys.add(cacheKey);

        if (childNeedsUpdating) {
          child._key = cacheKey;

          if (child instanceof ElementNode) {
            const sharedType = child._sharedType;
            child.syncPropertiesFromYjs(null);
            child.applyChildrenYjsDelta((sharedType as XmlText).toDelta());
            child.syncChildrenFromYjs();
          } else if (child instanceof TextNode) {
            child.syncPropertiesFromYjs(null);
          } else if (child instanceof DecoratorNode) {
            child.syncPropertiesFromYjs(null);
          } else if (!(child instanceof LineBreakNode)) {
            invariant(
              false,
              "syncChildrenFromYjs: expected text, element, decorator, or linebreak node"
            );
          }
        }

        nextChildrenKeys[i] = cacheKey;
        prevChildNode = child;
        prevIndex++;
      } else {
        if (nodeKeys === undefined) {
          nodeKeys = new Set();

          for (let s = 0; s < childrenLength; s++) {
            const child = children[s];
            const childKey = child._key;

            if (childKey !== "") {
              nodeKeys.add(childKey);
            }
          }
        }

        if (child && cacheKey !== undefined && !nodeKeys.has(cacheKey)) {
          const needToRemoveNode = this._converter.nodeMap.get(cacheKey);

          if (needToRemoveNode) {
            removeFromParent(needToRemoveNode);
          }
          i--;
          prevIndex++;
          continue;
        }

        // Create / Replace
        const childKey = createChildrenVirtualNode(child);
        this._converter.nodeMap.set(childKey, child);
        nextChildrenKeys[i] = childKey;

        if (prevChildNode === null) {
          const nextSibling = self.getFirstChild();
          self._first = childKey;
          if (nextSibling !== null) {
            nextSibling._prev = childKey;
            child._next = nextSibling._key;
          }
        } else {
          const nextSibling = prevChildNode.getNextSibling();
          prevChildNode._next = childKey;
          child._prev = prevChildNode._key;
          if (nextSibling !== null) {
            nextSibling._prev = childKey;
            child._next = nextSibling._key;
          }
        }
        if (i === childrenLength - 1) {
          self._last = childKey;
        }

        prevChildNode = child;
      }
    }

    for (let i = 0; i < childrenLength; i++) {
      const prevChildKey = prevChildrenKeys[i];

      if (!visitedKeys.has(prevChildKey)) {
        const node = this._converter.nodeMap.get(prevChildKey);

        if (node) {
          node.destroy();
          removeFromParent(node);
        }
      }
    }
  }

  getSize(): number {
    return 1;
  }

  setChildren(...children: VirtualNode[]): void {
    this._children = children;
  }

  destroy() {
    const nodeMap = this._converter.nodeMap;
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      children[i].destroy();
    }

    nodeMap.delete(this._key);
  }
}

function removeFromParent(node: VirtualNode) {
  const parent = node.getParent();
  if (parent) {
    const prevSibling = node.getPreviousSibling();
    const nextSibling = node.getNextSibling();

    if (!prevSibling) {
      if (nextSibling) {
        parent._first = nextSibling._key;
        nextSibling._prev = null;
      } else {
        parent._first = null;
      }
    } else {
      if (nextSibling) {
        nextSibling._prev = prevSibling._key;
        prevSibling._next = nextSibling._key;
      } else {
        prevSibling._next = null;
      }
      node._prev = null;
    }

    if (!nextSibling) {
      if (prevSibling) {
        parent._last = prevSibling._key;
        prevSibling._next = null;
      } else {
        parent._last = null;
      }
    } else {
      if (prevSibling) {
        prevSibling._next = nextSibling._key;
        nextSibling._prev = prevSibling._key;
      } else {
        nextSibling._prev = null;
      }
      node._next = null;
    }

    node._parent = null;
  }
}

export class TextNode extends VirtualNode {
  _type = "text";
  _text: string;
  _normalized: boolean = false;
  constructor(
    sharedType: SharedType,
    parent: ParentNodeType,
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
  heading: ElementNode,
  link: ElementNode,
  list: ElementNode,
  listitem: ElementNode,
  root: ElementNode,
  artificial: ElementNode,
  quote: ElementNode,
  table: ElementNode,
  tablecell: ElementNode,
  tablerow: ElementNode,
  autolink: ElementNode,
  overflow: ElementNode,
  "collapsible-container": ElementNode,
  "collapsible-content": ElementNode,
  "collapsible-title": ElementNode,
  "layout-container": ElementNode,
  "layout-item": ElementNode,

  specialText: TextNode,
  tab: TextNode,
  text: TextNode,
  hashtag: TextNode,
  "code-highlight": TextNode,
  mention: TextNode,
  emoji: TextNode,
  autocomplete: TextNode,
  keyword: TextNode,

  linebreak: LineBreakNode,

  decorator: DecoratorNode,
  image: DecoratorNode,
  suggestion: DecoratorNode,
  poll: DecoratorNode,
  sticky: DecoratorNode,
  "inline-image": DecoratorNode,
  excalidraw: DecoratorNode,
  equation: DecoratorNode,
  horizontalrule: DecoratorNode,
  tweet: DecoratorNode,
  youtube: DecoratorNode,
  figma: DecoratorNode,
  mark: DecoratorNode,
  "page-break": DecoratorNode,
};
