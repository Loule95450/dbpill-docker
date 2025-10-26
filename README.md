# dbpill

This is a PostgreSQL proxy that intercepts all queries & provides a web interface to profile them, sort them, auto-suggest indexes to improve performance, and immediately apply changes & measure improvements, with instant rollback when performance isn't improved. See https://dbpill.com for more info

# Quick run

```
npm install
npm run dev postgresql://user:pass@host:5432/dbname
```

There are two main components:

* The PostgreSQL `proxy` that intercepts & logs every query
* The `webapp` which displays, analyzes & optimizes the queries

# Requirements

Node version 22+ is required (for node:sqlite built-in package)
