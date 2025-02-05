const http = require("http");
const { WebsocketProvider } = require("y-websocket");
const WebSocket = require("ws");
const Y = require("yjs");

const doc = new Y.Doc();

const xmlText = doc.get("root");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "room/initialize",
  //"playground/0/main",
  doc,
  {
    WebSocketPolyfill: WebSocket,
  }
);

const { awareness } = provider;

provider.on("status", (event) => {
  console.log(event.status); // logs "connected" or "disconnected"
});

awareness.on("update", (e) => {
  // console.log(Array.from(provider.awareness.getStates().entries()).map(([, o]) => o))
});

function disposeEvent(event) {
  if (event instanceof Y.YTextEvent) {
    const { keysChanged, childListChanged, delta } = event;

    // Update
    if (keysChanged.size > 0) {
      //TODO: to sync keysChanged (keysChanged)
    }

    if (childListChanged) {
      // TODO: apply children Delta (delta)
      // TODO: sync children
    }
  } else if (event instanceof Y.YMapEvent) {
    const { keysChanged } = event;

    // Update
    if (keysChanged.size > 0) {
      // TODO: sync properties and text (keysChanged)
    }
  } else if (event instanceof Y.YXmlEvent) {
    const { attributesChanged } = event;

    // Update
    if (attributesChanged.size > 0) {
      // TODO: sync Properties (attributesChanged)
    }
  }
}

xmlText.observeDeep((events, transaction) => {
  // eslint-disable-next-line no-console
  events.forEach((event) => event.delta);

  const len = events.length;

  for (let i = 0; i < len; i++) {
    disposeEvent(events[i]);
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello World\n");
});

server.listen(3002, () => {
  // eslint-disable-next-line no-console
  console.log("服务器运行在 http://localhost:3002");
});
