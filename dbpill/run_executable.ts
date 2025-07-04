// ---------------------------------------------------------------------------
// SEA bootstrap: restore a real, file-system-backed `require` BEFORE anything
// else is evaluated. We do it with plain-CommonJS so esbuild keeps the code
// right at the top of the output file.
// ---------------------------------------------------------------------------
const { createRequire } = require('node:module');
// Build a real file-system aware require without shadowing esbuild's internal
// helper (which is also called `requireX`).
const realRequire = createRequire(__filename);

// Expose it globally so libraries that call plain `require()` (e.g. inside the
// esbuild bundle) still succeed, but don't overwrite the per-module helpers
// that esbuild generates (require2, require3...).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (typeof global.require !== 'function') {
  global.require = realRequire;
}

import fs from 'fs'
import path from 'path'
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { Client } from 'pg';

// app specific imports
import args from "server/args";
import { setup_routes } from "server/apis/http";
import { setup_sockets } from "server/apis/sockets";
import { getMainProps } from "server/main_props";

// Node SEA (Single Executable Application) allows bundling assets at build time.
// We import the helper APIs so that, when the application is built as a SEA,
// we can read those embedded assets. When running in development mode the files
// will be read from the real file-system instead.
import { getAsset, isSea } from "node:sea";

// Convenience helper for loading a UTF-8 text asset — either from the real
// file-system (during local development) or from the SEA bundle (when
// isSea() === true).
function readAssetTextSync(relativePath: string): string {
  const absolute = path.resolve(__dirname, relativePath);

  if (fs.existsSync(absolute)) {
    return fs.readFileSync(absolute, "utf8");
  }

  if (isSea()) {
    // When packaged as a SEA the file will have been listed under the
    // `assets` field of sea-config.json using exactly the same key that we
    // pass here. If it does not exist an error will be thrown so let it
    // propagate up.
    return getAsset(relativePath, "utf8");
  }

  throw new Error(`Asset not found: ${relativePath}`);
}

const port = args.port;
const mode = 'production';
// const ssr_enabled = args.ssr; // Currently unused in the SEA build

// Test initial database connectivity and log the outcome
async function testDbConnection(connectionString: string) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log(`✅ Successfully connected to database: ${connectionString}`);
  } catch (error) {
    console.error(`❌ Failed to connect to database: ${connectionString}`);
    console.error(error);
  } finally {
    try { await client.end(); } catch (_) { /* ignore */ }
  }
}

async function createServer() {
  // Quickly verify database connectivity before starting the web server
  await testDbConnection(args.db);

  const app = express()

  const http_server = http.createServer(app);
  const io = new SocketIOServer(http_server, {});
  setup_sockets(io);
  setup_routes(app, io);

  // if (mode === 'production') {
  //   app.use('/client', express.static(path.resolve(__dirname, 'dist')))
  // }

  app.get('/client/index.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    const output = readAssetTextSync('dist/assets/index.css');
    res.send(output);
  });

  // Serve the browser JS bundle. Historically we renamed the file to
  // `index.js.txt` so that Node SEA treated it as an inert asset. If the
  // project keeps the original `index.js` instead, this route will now work
  // in both cases.
  app.get('/client/index.js', (req, res) => {
    res.setHeader('Content-Type', 'text/javascript');

    // Prefer the vanilla file name first (Vite's default). Fallback to the
    // legacy `.js.txt` name so existing builds keep working.
    let output: string;
    try {
      output = readAssetTextSync('dist/index.js');
    } catch (_) {
      output = readAssetTextSync('dist/index.js.txt');
    }

    res.send(output);
  });

  // vite exposes all files at root by default, this is to prevent accessing server files
  app.use(async (req, res, next) => {
    const url = req.originalUrl
    let cleaned_url = url.split('?')[0]
    // remove leading slashes
    cleaned_url = cleaned_url.replace(/^\/+/, '')

    const allowed_prefixes = ['client', 'shared', 'node_modules', 'socket.io'];
    if (cleaned_url == '' || allowed_prefixes.some(prefix => cleaned_url.startsWith(prefix))) {
      return next();
    } else {
      // check if file with exact path exists
      const file_path = path.join(__dirname, cleaned_url);
      const exists = fs.existsSync(file_path);
      if(exists) {
        res.status(404).send('Not found');
      } else {
        next();
      }
    }
  })


  app.get('*', async (req, res, next) => {
    const url = req.originalUrl

    const skip_prefixes = ['/client', '/node_modules', '/@vite', '/@react-refresh'];
    if (skip_prefixes.some(prefix => url.startsWith(prefix))) {
      return next();
    }

    const initial_state = await getMainProps(req);
  
    try {
      const template = readAssetTextSync('dist/index.html');

      let html = '';

      html = template.replace(`<!--ssr-outlet-->`, '')
        .replace(`<!--ssr-head-->`, '')
        .replace(`'<!--ssr-state-->'`, JSON.stringify(initial_state));

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
      
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back
      // to your actual source code.
      next(e)
    }
  })

  http_server.listen(port, () => {
    console.log(`Webapp listening on http://localhost:${port}`)
  })

  return app
}

// Initialize the server (wrapped in a promise chain to avoid top-level await)
createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Node:sea types are declared in `node-sea.ts`.
