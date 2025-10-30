# dbpill Docker

This document describes how to run dbpill using Docker.

## Available Docker Versions

dbpill is available in two Docker versions:

### 1. Standalone Version
Requires an external PostgreSQL database. Use this if you already have a PostgreSQL instance.

### 2. PostgreSQL Integrated Version
Includes PostgreSQL database server. Available for the following PostgreSQL LTS versions:
- PostgreSQL 18.x (latest 18 release)
- PostgreSQL 17.x (latest 17 release)
- PostgreSQL 16.x (latest 16 release)
- PostgreSQL 15.x (latest 15 release)
- PostgreSQL 14.x (latest 14 release)
- PostgreSQL 13.x (latest 13 release)

## Quick Start

### Standalone Version

1. Create a `.env` file or set environment variables:
```bash
POSTGRES_URL=postgresql://user:password@your-postgres-host:5432/dbname
```

2. Run with docker-compose:
```bash
docker-compose -f docker-compose.standalone.yml up
```

Or pull and run directly from GitHub Container Registry:
```bash
docker pull ghcr.io/loule95450/dbpill-docker/dbpill-standalone:latest
docker run -p 3000:3000 -p 5433:5433 \
  -e POSTGRES_URL=postgresql://user:password@host:5432/dbname \
  ghcr.io/loule95450/dbpill-docker/dbpill-standalone:latest
```

### PostgreSQL Integrated Version

Choose your PostgreSQL version and run with docker-compose:

**PostgreSQL 17 (recommended):**
```bash
docker-compose -f docker-compose.pg17.yml up
```

**PostgreSQL 18:**
```bash
docker-compose -f docker-compose.pg18.yml up
```

**PostgreSQL 16:**
```bash
docker-compose -f docker-compose.pg16.yml up
```

**PostgreSQL 15:**
```bash
docker-compose -f docker-compose.pg15.yml up
```

**PostgreSQL 14:**
```bash
docker-compose -f docker-compose.pg14.yml up
```

**PostgreSQL 13:**
```bash
docker-compose -f docker-compose.pg13.yml up
```

Or pull and run directly from GitHub Container Registry:
```bash
docker pull ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg17
docker run -p 3000:3000 -p 5433:5433 -p 5432:5432 \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=mydb \
  ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg17
```

## Configuration

### Environment Variables

#### Standalone Version
- `POSTGRES_URL` - PostgreSQL connection string (required)
- `WEB_PORT` - Web UI port (default: 3000)
- `PROXY_PORT` - SQL proxy port (default: 5433)

#### PostgreSQL Integrated Version
- `POSTGRES_USER` - PostgreSQL username (default: dbpill)
- `POSTGRES_PASSWORD` - PostgreSQL password (default: dbpill)
- `POSTGRES_DB` - PostgreSQL database name (default: dbpill)
- `WEB_PORT` - Web UI port (default: 3000)
- `PROXY_PORT` - SQL proxy port (default: 5433)

### Ports

- **3000** - Web UI (management interface)
- **5433** - dbpill SQL Proxy (connect your application here)
- **5432** - PostgreSQL (only for integrated version, optional to expose)

## Accessing dbpill

1. **Web UI**: Open your browser at `http://localhost:3000`
2. **SQL Proxy**: Connect your application to `localhost:5433` to intercept queries

## Building Images Locally

### Build Standalone Version
```bash
docker build -f Dockerfile.standalone -t dbpill-standalone .
```

### Build PostgreSQL Integrated Version
```bash
# PostgreSQL 17
docker build -f Dockerfile.integrated --build-arg PG_VERSION=17 -t dbpill-postgres:17 .

# PostgreSQL 16
docker build -f Dockerfile.integrated --build-arg PG_VERSION=16 -t dbpill-postgres:16 .

# Other versions: 18, 15, 14, 13
```

## Data Persistence

The PostgreSQL integrated versions use Docker volumes to persist data:
- `postgres18-data`
- `postgres17-data`
- `postgres16-data`
- `postgres15-data`
- `postgres14-data`
- `postgres13-data`

To remove all data:
```bash
docker-compose -f docker-compose.pg17.yml down -v
```

## Example: Using with an Application

### Example 1: Standalone version with external PostgreSQL

Create a complete setup with dbpill standalone and a separate PostgreSQL container:

```yaml
# docker-compose.example.yml
version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    container_name: my-postgres
    environment:
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
      POSTGRES_DB: mydb
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network

  dbpill:
    image: ghcr.io/loule95450/dbpill-docker/dbpill-standalone:latest
    container_name: dbpill
    environment:
      POSTGRES_URL: postgresql://myuser:mypassword@postgres:5432/mydb
    ports:
      - "3000:3000"
      - "5433:5433"
    depends_on:
      - postgres
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

Then run: `docker-compose -f docker-compose.example.yml up -d`

### Example 2: Integrated version

1. Start dbpill with PostgreSQL 17:
```bash
docker-compose -f docker-compose.pg17.yml up -d
```

2. Configure your application to connect to dbpill proxy instead of PostgreSQL directly:
```
Before: postgresql://dbpill:dbpill@localhost:5432/dbpill
After:  postgresql://dbpill:dbpill@localhost:5433/dbpill
```

3. Access the web UI at http://localhost:3000 to see all queries and optimize them.

## Troubleshooting

### Connection Issues
- Ensure the PostgreSQL connection string is correct
- Check that ports are not already in use
- Verify network connectivity between containers

### Build Issues
- Ensure you have the latest version of Docker and docker-compose
- Check available disk space for building images

### Logs
View logs:
```bash
docker-compose -f docker-compose.pg17.yml logs -f
```

## GitHub Container Registry

Images are automatically built and pushed to GitHub Container Registry on every push to main branch and on tagged releases.

Available images:
- `ghcr.io/loule95450/dbpill-docker/dbpill-standalone:latest`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg18`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg17`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg16`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg15`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg14`
- `ghcr.io/loule95450/dbpill-docker/dbpill-postgres:pg13`
