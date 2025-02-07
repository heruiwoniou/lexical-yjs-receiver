# Shaddow Editor Manager

manager yjs shaddow editor to sync editor text;

## Usage

### Require

- node: > 20

### Install

```
npm install
```

### Run Development
```
DEBUG=* npm run dev
```

### Build
```
npm run build
```

### Run Producation
```
npm run start
```


## API

### Create new Shaddow Yjs Editor
```
curl -X POST http://localhost:3333/shaddow/:task/:type/create/

task: number
type: disclosure | claims | ...

```

## Environment

- PORT: 3333
- WS: ws://localhost:1234