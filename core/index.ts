import debug from 'debug';
import { Converter, UserState } from './Converter';

const log = debug('Converter');

const Converters: Record<string, Converter> = {};

export function create({
  ws,
  room,
  token,
  callback,
}: {
  ws: string;
  room: string;
  token?: string;
  callback: (plainText: string, room: string) => void;
}) {
  let converter: Converter | null = Converters[room];
  if (!converter) {
    converter = new Converter({
      ws,
      room,
      token,
    });

    log(`[${room}] initialized`);

    converter.on('destroy', () => {
      log(`[${room}] destroy`);
    });

    converter.on('afterUpdated', () => {
      log(`[${room}] afterUpdated`);
      if (converter) {
        const plainText = converter.getPlainText();
        log(
          `[${room}] Print plainText\n------------\n${plainText}\n------------\n[${room}]`
        );

        callback(plainText, room);
      }
    });

    converter.on('providerAwarenessUpdate', (states: [number, UserState][]) => {
      log(
        `[${room}] providerAwarenessUpdate`,
        states.map(([, { name }]) => name).join(',')
      );
      if (states.length <= 1) {
        delete Converters[room];
        if (converter) {
          converter.destroy();
          converter = null;
        }
      }
    });

<<<<<<< Updated upstream
    converter.on("error", (error) => {
      log(`[${room}] CatchedError`, error)
=======
    converter.on('error', (error) => {
      log(`[${room}] CatchedError`, error);
>>>>>>> Stashed changes
      delete Converters[room];
      converter?.destroy();

      create({ ws, room, token, callback });
    });

    Converters[room] = converter;
  } else {
    log(`[${room}] existing converter`);
  }

  return converter;
}

export function destroy() {
  log('destroy all');
  Object.keys(Converters).forEach((room) => {
    const converter = Converters[room];
    converter.destroy();
    delete Converters[room];
  });
}
