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

const _yargs = yargs(hideBin(process.argv))
    .option('web-port', {
        default: 3000,
        type: 'number',
        describe: 'Web server port'
    })
    .option('mode', {
        default: 'development',
        describe: 'Server mode',
        choices: ['development', 'production'],
        hidden: true
    })
    .option('ssr', {
        default: false,
        type: 'boolean',
        describe: 'Enable server-side rendering.\n  *CSS SSR requires mode=production',
        hidden: true
    })
    .option('db', {
        default: 'postgresql://postgres@localhost:5432/postgres',
        type: 'string',
        describe: 'PostgreSQL database connection string. The user must be able to create indexes.'
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
    });

_yargs.version(packageVersion);

const argv = _yargs.argv;

const options = _yargs.getOptions();
const hiddenOptions = options.hiddenOptions;
const defaultOptions = ['help', 'version', '_', '$0'];
const visibleOptions = Object.keys(options.key).filter(key => !hiddenOptions.includes(key) && !defaultOptions.includes(key));

process.env.NODE_ENV = argv.mode;

console.log('Running with CLI args:');
for (const key of visibleOptions) {
    const value = argv[key];
    console.log(`  --${key} ${value}`);
}

export default argv as Record<string, any>;
