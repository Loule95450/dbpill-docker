import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const _yargs = yargs(hideBin(process.argv))
    .option('port', {
        default: 4000,
        type: 'number',
        describe: 'Server port'
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
    .option('llm-api-key', {
        default: null,
        type: 'string',
        describe: 'API key for the LLM service'
    })
    .option('llm-endpoint', {
        default: 'anthropic',
        type: 'string',
        describe: 'LLM endpoint (anthropic, openai, or custom URL like https://openrouter.ai/api/v1)'
    })
    .option('llm-model', {
        default: 'claude-sonnet-4',
        type: 'string',
        describe: 'LLM model to use (e.g., o3, claude-sonnet-4)'
    });

const argv = _yargs.argv;

const options = _yargs.getOptions();
const hiddenOptions = options.hiddenOptions;
const defaultOptions = ['help', 'version', '_', '$0'];
const visibleOptions = Object.keys(options.key).filter(key => !hiddenOptions.includes(key) && !defaultOptions.includes(key));

process.env.NODE_ENV = argv.mode;

console.log('Running with args:');
for (const key of visibleOptions) {
    const value = argv[key];
    console.log(`  --${key} ${value}`);
}

export default argv as Record<string, any>;
