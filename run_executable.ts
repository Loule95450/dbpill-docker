
// ---------------------------------------------------------------------------
// SEA bootstrap: restore a real, file-system-backed `require` BEFORE anything
// else is evaluated. We do it with plain-CommonJS so esbuild keeps the code
// right at the top of the output file.
// ---------------------------------------------------------------------------
const { createRequire } = require('node:module');
// Build a real file-system aware require without shadowing esbuild's internal
// helper (which is also called `requireX`).
// In SEA context, use a simple fallback approach
let realRequire;
try {
  // Try using __filename first (regular Node.js)
  realRequire = createRequire(__filename);
} catch (err) {
  // Fallback for SEA context - use a valid file path
  realRequire = createRequire(process.cwd() + '/package.json');
}

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

// app specific imports
import args from "server/args";
import { setup_routes } from "server/apis/http";
import { setup_sockets } from "server/apis/sockets";
import { getMainProps } from "server/main_props";
import { buildProxyUrl, startListener } from "server/proxy";
import { testDbConnection } from "server/database_helper";

// Node SEA (Single Executable Application) allows bundling assets at build time.
// We import the helper APIs so that, when the application is built as a SEA,
// we can read those embedded assets. When running in development mode the files
// will be read from the real file-system instead.
import { getAsset, isSea } from "node:sea";

// Override emitWarning so the default stderr printing is bypassed for SQLite and url.parse() warnings.
// Keep original behaviour for everything else.
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, ...args: any[]) {
  // Debugging line removed to avoid noisy console output.
  // If the first argument is the message string
  if (typeof warning === 'string' && (warning.includes('SQLite') || warning.includes('url.parse()'))) {
    return;
  }
  // If the first argument is an Error object
  if (warning instanceof Error) {
    if (warning.name === 'ExperimentalWarning' && /SQLite/.test(warning.message)) {
      return;
    }
    if (warning.name === 'DeprecationWarning' && /url\.parse\(\)/.test(warning.message)) {
      return;
    }
  }
  // @ts-ignore – preserve Node's original signature
  return originalEmitWarning.call(this, warning, ...args);
};

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

const port = args.webPort;
async function createServer() {
  // Quickly verify database connectivity before starting the web server
  await testDbConnection(args.db);

  const app = express()

  const http_server = http.createServer(app);
  const io = new SocketIOServer(http_server, {});
  setup_sockets(io);
  setup_routes(app, io);

  // Serve static assets from /client/* by mapping to /dist/*
  app.get('/client/*', (req, res, next) => {
    // Extract the path after /client/
    const assetPath = req.path.replace('/client/', '');
    
    // Handle special cases first
    if (assetPath === 'index.css') {
      res.setHeader('Content-Type', 'text/css');
      try {
        const output = readAssetTextSync('dist/assets/index.css');
        return res.send(output);
      } catch (err) {
        return res.status(404).send('CSS file not found');
      }
    }
    
    if (assetPath === 'index.js') {
      res.setHeader('Content-Type', 'text/javascript');
      // Prefer the vanilla file name first (Vite's default). Fallback to the
      // legacy `.js.txt` name so existing builds keep working.
      try {
        const output = readAssetTextSync('dist/index.js');
        return res.send(output);
      } catch (_) {
        try {
          const output = readAssetTextSync('dist/index.js.txt');
          return res.send(output);
        } catch (err) {
          return res.status(404).send('JS file not found');
        }
      }
    }
    
    // For all other assets, try to serve them from dist/
    const distPath = `dist/${assetPath}`;
    
    try {
      // Try to read the asset
      const asset = readAssetTextSync(distPath);
      
      // Set appropriate content type based on file extension
      const ext = path.extname(assetPath).toLowerCase();
      const contentTypes: { [key: string]: string } = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
      };
      
      if (contentTypes[ext]) {
        res.setHeader('Content-Type', contentTypes[ext]);
      }
      
      res.send(asset);
    } catch (err) {
      // Asset not found, continue to next middleware
      next();
    }
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
          .replace(`'<!--ssr-state-->'`, JSON.stringify(initial_state))

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
      
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back
      // to your actual source code.
      next(e)
    }
  })

  http_server.listen(port, async () => {
    
    // Log proxy URL using the helper function
    const listener = await startListener();
    const proxyUrl = buildProxyUrl(listener);
    console.log(`→ Connect to dbpill SQL proxy at ${proxyUrl} to intercept queries.`);
    console.log(`→ Go to dbpill web UI at http://localhost:${port} to manage the results.`)
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