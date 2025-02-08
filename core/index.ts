import { Converter, UserState } from "./Converter";
import debug from "debug";

const ws = process.env.WS || "ws://localhost:1234";

const log = debug("Converter");

const Converters: Record<string, Converter> = {};

export function create(room: string) {
  let converter: Converter | null = Converters[room];
  if (!converter) {
    converter = new Converter({
      ws,
      room,
    });

    log(`[${room}] initialized`);

    converter.on("destroy", () => {
      log(`[${room}] destroy`);
    });

    converter.on("afterUpdated", () => {
      log(`[${room}] afterUpdated`);
      if (converter) {
        const plainText = converter.getPlainText();
        log(`[${room}] Print plainText\n------------\n${plainText}\n------------\n[${room}]`);
      }
    });

    converter.on("providerAwarenessUpdate", (states: [number, UserState][]) => {
      log(
        `[${room}] providerAwarenessUpdate`,
        states.map(([, { name }]) => name).join(",")
      );
      if (states.length <= 1) {
        delete Converters[room];
        if (converter) {
          converter.destroy();
          converter = null;
        }
      }
    });

    converter.on("error", (error) => {
      log(`[${room}] error`, error)
      delete Converters[room];
      converter?.destroy();
      
      create(room);
    });

    Converters[room] = converter;

  } else {
    log(`[${room}] existing converter`);
  }

  return converter;
}

export function destroy() {
  log("destroy all");
  Object.keys(Converters).forEach((room) => {
    const converter = Converters[room];
    converter.destroy();
    delete Converters[room];
  });
}
