import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

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
const ssr_enabled = args.ssr;

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function createServer() {
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

  app.get('/client/index.js', (req, res) => {
    res.setHeader('Content-Type', 'text/javascript');
    const output = readAssetTextSync('dist/index.js.txt');
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
          .replace(`'<!--ssr-state-->'`, JSON.stringify(initial_state))

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

const app = await createServer();

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Node:sea types are declared in `node-sea.ts`.
