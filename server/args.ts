import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createRequire } from 'node:module';

// Use a try/catch to handle both regular Node.js and SEA contexts
let require;
try {
  // This works in regular Node.js ES modules
  require = createRequire(import.meta.url);
} catch (err) {
  // Fallback for SEA context - use the current working directory
  require = createRequire(process.cwd() + '/package.json');
}
// Try to load package.json from different locations
let packageVersion = '1.0.0'; // fallback version
try {
  const pkg = require('../package.json');
  packageVersion = pkg.version;
} catch (err) {
  try {
    const pkg = require('./package.json');
    packageVersion = pkg.version;
  } catch (err2) {
    // Use fallback version
  }
}

// Validation function for PostgreSQL connection strings
function validateConnectionString(connectionString: string): boolean {
  try {
    // Check if it starts with postgres:// or postgresql://
    if (!connectionString.match(/^postgres(ql)?:\/\//)) {
      throw new Error('Connection string must start with postgres:// or postgresql://');
    }

    // Try to parse as URL to validate basic structure
    const url = new URL(connectionString);
    
    // Validate protocol
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('Protocol must be postgres: or postgresql:');
    }
    
    // Validate hostname (required)
    if (!url.hostname) {
      throw new Error('Hostname is required');
    }
    
    // Validate port (if provided, must be a valid number between 1-65535)
    if (url.port) {
      const portNum = parseInt(url.port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error('Port must be a valid number between 1 and 65535');
      }
    }
    
    // Validate database name (if provided, must not be empty after removing leading slashes)
    const dbName = url.pathname.replace(/^\/+/, '');
    if (url.pathname && url.pathname !== '/' && !dbName) {
      throw new Error('Database name cannot be empty');
    }
    
    // Validate username (if provided, must not be empty)
    if (url.username === '') {
      throw new Error('Username cannot be empty if specified');
    }
    
    return true;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid connection string format');
    }
    throw error;
  }
}

const _yargs = yargs(hideBin(process.argv))
    // Treat the first positional argument as the database connection string
    .usage('$0 <db> [options]')
    .example('$0 postgres://user:pass@host:5432/db', 'Set up a proxy to intercept queries to the database.')
    .demandCommand(1, 'A PostgreSQL connection string is required as the first argument.')
    .check((argv) => {
      // Validate the database connection string
      if (argv._ && argv._.length > 0) {
        const connectionString = String(argv._[0]);
        try {
          validateConnectionString(connectionString);
          return true;
        } catch (error) {
          throw new Error(`Invalid database connection string: ${error.message}\n\nExpected format: postgres://[user[:password]@]host[:port]/database\nExamples:\n  postgres://user:pass@localhost:5432/mydb\n  postgresql://user@localhost/mydb\n  postgres://localhost:5432/mydb`);
        }
      }
      return true;
    })
    .option('web-port', {
        default: 3000,
        type: 'number',
        describe: 'Web server port'
    })
    .option('proxy-port', {
        default: 5433,
        type: 'number',
        describe: 'Port to run the SQL proxy on'
    })
    .option('verbose', {
        default: false,
        type: 'boolean',
        describe: 'Enable verbose debug logging'
    })

_yargs.version(packageVersion);

const argv = _yargs.argv;

// Map first positional argument to argv.db for downstream consumption
if (argv._ && argv._.length > 0) {
    argv.db = String(argv._[0]);
}


process.env.NODE_ENV = argv.mode;

// const options = _yargs.getOptions();
// const hiddenOptions = options.hiddenOptions;
// const defaultOptions = ['help', 'version', '_', '$0'];
// const visibleOptions = Object.keys(options.key).filter(key => !hiddenOptions.includes(key) && !defaultOptions.includes(key));
// console.log('Running with args:');
// for (const key of visibleOptions) {
//     const value = argv[key];
//     console.log(`  --${key} ${value}`);
// }

export default argv as Record<string, any>;
