import { baseExcludedProperties, baseIncludedProperties } from "./Constants";
import { Converter } from "./Converter";
import {
  BaseNode,
  DecoratorNode,
  ElementNode,
  LineBreakNode,
  registerNodes,
  SharedType,
  TextNode,
  VirtualNode,
} from "./Nodes";
import { XmlElement, XmlText, Map as YMap } from "yjs";
import { v4 as uuidv4 } from "uuid";

export default function invariant(
  cond?: boolean,
  message?: string,
  ..._: string[]
): asserts cond {
  if (cond) {
    return;
  }

  throw new Error(
    "Internal error: invariant() is meant to be replaced at compile " +
      "time. There is no runtime version. Error: " +
      message
  );
}

export function getNodeTypeFromSharedType(
  sharedType: SharedType
): keyof typeof registerNodes {
  const type =
    sharedType instanceof YMap
      ? sharedType.get("__type")
      : sharedType.getAttribute("__type");
  invariant(type != null, "Expected shared type to include type attribute");
  return type as keyof typeof registerNodes;
}

export function getOrInitNodeFromSharedType(
  sharedType: SharedType,
  converter: Converter,
  parent?: BaseNode
): VirtualNode {
  // @ts-expect-error
  const node = sharedType._node as VirtualNode;
  if (node === undefined) {
    const type = getNodeTypeFromSharedType(sharedType);
    const Node = registerNodes[type];

    invariant(Node !== undefined, "Node %s is not registered", type);

    const sharedParent = sharedType.parent;
    const targetParent =
      parent === undefined && sharedParent !== null
        ? getOrInitNodeFromSharedType(
            sharedParent as XmlText | YMap<unknown> | XmlElement,
            converter
          )
        : parent || null;

    invariant(
      targetParent instanceof VirtualNode,
      "Expected parent to be a baseNode"
    );

    if (sharedType instanceof XmlText) {
      return VirtualNode.create(
        ElementNode,
        sharedType,
        targetParent,
        converter
      );
    } else if (sharedType instanceof YMap) {
      if (type === "linebreak") {
        return VirtualNode.create(
          LineBreakNode,
          sharedType,
          targetParent,
          converter
        );
      }
      return VirtualNode.create(
        TextNode,
        sharedType,
        targetParent,
        converter,
        ""
      );
    } else if (sharedType instanceof XmlElement) {
      return VirtualNode.create(
        DecoratorNode,
        sharedType,
        targetParent,
        converter
      );
    }
  }

  return node;
}

export function getPositionFromElementAndOffset(
  node: ElementNode,
  offset: number,
  boundaryIsEdge: boolean
): {
  length: number;
  node: VirtualNode | null;
  nodeIndex: number;
  offset: number;
} {
  let index = 0;
  let i = 0;
  const children = node._children;
  const childrenLength = children.length;

  for (; i < childrenLength; i++) {
    const child = children[i];
    const childOffset = index;
    const size = child.getSize();
    index += size;
    const exceedsBoundary = boundaryIsEdge ? index >= offset : index > offset;

    if (exceedsBoundary && child instanceof TextNode) {
      let textOffset = offset - childOffset - 1;

      if (textOffset < 0) {
        textOffset = 0;
      }

      const diffLength = index - offset;
      return {
        length: diffLength,
        node: child,
        nodeIndex: i,
        offset: textOffset,
      };
    }

    if (index > offset) {
      return {
        length: 0,
        node: child,
        nodeIndex: i,
        offset: childOffset,
      };
    } else if (i === childrenLength - 1) {
      return {
        length: 0,
        node: null,
        nodeIndex: i + 1,
        offset: childOffset + 1,
      };
    }
  }

  return {
    length: 0,
    node: null,
    nodeIndex: 0,
    offset: 0,
  };
}

export function spliceString(
  str: string,
  index: number,
  delCount: number,
  newText: string
): string {
  return str.slice(0, index) + newText + str.slice(index + delCount);
}

export function isIncludedProperty(name: string) {
  if (baseIncludedProperties.has(name)) {
    return true;
  }

  return false;
}

export function isExcludedProperty(name: string) {
  if (baseExcludedProperties.has(name)) {
    return true;
  }
  return false;
}

export function createChildrenArray(
  node: VirtualNode,
  map: Map<string, VirtualNode>
) {
  const children = [];
  let nodeKey = node._first;
  while (nodeKey !== null) {
    const node = map.get(nodeKey);
    if (node === null || node === undefined) {
      invariant(false, "createChildrenArray: node does not exist in nodeMap");
    }

    children.push(nodeKey);
    nodeKey = node._next;
  }

  return children;
}

export function createChildrenVirtualNode(node: VirtualNode) {
  node.setKey(uuidv4());

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

  return node._key;
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>): void {
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}