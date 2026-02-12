
<h1 align="center">
  Lindascan Client
  <br>
</h1>

<h4 align="center">
  Node Client for the <a href="https://github.com/Lindscan/lindascan-frontend/blob/master/document/api.md">Lindascan.org API</a>
</h4>

<p align="center">
  <a href="#how-to-use">How to Use</a>
</p>

# How to use

## Requirements

* Node v16.17.0

## Running tests

```bash
> npm test
```

## Usage

Install the package

```bash
> npm install @lindascan/apiclients
```

Use the HTTP Client

```javascript
import {Client} from "@lindascan/apiclients";

const client = new Client();

let recentBlocks = await client.getBlocks({
  sort: '-number',
  limit: 10,
});
```
