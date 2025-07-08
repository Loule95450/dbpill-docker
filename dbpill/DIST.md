# murat notes

npx tsx run.ts --mode development --port 3000 --db=postgresql://cashorbit@localhost:5432/cashorbit


# Distribution & Development Guide

This document explains two workflows:

1. Local development with plain `node`/TypeScript.
2. Producing a **single-file executable** using Node SEA for shipping to end-users.

---
## 1 · Local development

1. **Install deps** (once):
   ```bash
   npm install
   ```

2. **Start the server in development mode** (Vite middleware + HMR):
   ```bash
   npx tsx run.ts --mode development --port 3000   # or: npm run dev
   ```

   * `run.ts` boots Vite in middleware mode, so it automatically handles HMR
     and transforms your React/Vue/Svelte pages on the fly—no manual `vite build` step required.
   * Requests to `/client/**` are proxied to Vite; API/Socket.IO routes work exactly as in production.

Open <http://localhost:3000> in your browser.

---
## 2 · Shipping a single executable (Node SEA)

SEA lets you bundle **one CommonJS file + static assets** into a copy of
`node`, creating an app that runs on machines **without Node installed**.

### 2.1 Prerequisites (once)
```bash
npm install --save-dev esbuild postject
```

### 2.2 Build steps

> All commands assume the project root (`dbpill`) as CWD.

1. **Build the client**
   ```bash
   npm run build              # runs Vite → dist/**
   ```

2. **Bundle & transpile the server** (TypeScript → CJS)
   ```bash
   npx esbuild run_executable.ts \
       --bundle --platform=node --format=cjs \
       --outfile=server.bundle.cjs
   ```

3. **Create `sea-config.json`**
   ```jsonc
   {
     "main": "./server.bundle.cjs",
     "disableExperimentalSEAWarning": true,
     "output": "sea-prep.blob",
     "assets": {
       "dist/index.html": "./dist/index.html",
       "dist/index.js.txt": "./dist/index.js.txt",
       "dist/assets/index.css": "./dist/assets/index.css",
       "dbpill.sqlite.db": "./dbpill.sqlite.db"
     }
   }
   ```

4. **Generate the SEA blob**
   ```bash
   node --experimental-sea-config sea-config.json
   ```

5. **Create a copy of the Node binary & inject the blob**

   ```bash
   # macOS example – adjust flags for Linux/Windows

   cp $(command -v node) dbpill          # final executable name
   codesign --remove-signature dbpill    # mac only

   npx postject dbpill NODE_SEA_BLOB sea-prep.blob \
       --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
       --macho-segment-name NODE_SEA     # omit on Linux

   codesign --sign - dbpill              # re-sign on mac
   ```

### 2.3 Run the binary
```bash
./dbpill --port 3000
```

### 2.4 What's inside vs. outside
* **Inside**: bundled server CJS, `dist/**` assets, `dbpill.sqlite.db`.
* The executable is now completely self-contained using Node.js 24's built-in SQLite.

---
## 3 Convenient npm scripts
Add these to `package.json` if you like:
```jsonc
{
  "scripts": {
    "dev": "tsx run.ts --mode development --port 3000",
    "build:client": "vite build",

    "sea:bundle": "esbuild run_executable.ts --bundle --platform=node --format=cjs --outfile=server.bundle.cjs",
    "sea:prep":   "node --experimental-sea-config sea-config.json",
    "sea:build":  "npm run build:client && npm run sea:bundle && npm run sea:prep",
    "sea:inject": "postject dbpill NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA"
  }
}
```

Then:
```bash
npm run dev         # dev server with live reload
npm run sea:build   # produce sea-prep.blob
npm run sea:inject  # inject into ./dbpill
```

Happy hacking & shipping! 🚀

