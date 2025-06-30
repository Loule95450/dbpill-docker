import { Greeting } from 'shared/types';
import { MainProps } from 'shared/main_props';
import argv from './args';
import { ConfigManager } from './config_manager';

let configManager: ConfigManager | null = null;
let configLogged = false;

export async function getMainProps(req) {
    // Initialize ConfigManager if not already done
    if (!configManager) {
        configManager = new ConfigManager('dbpill.sqlite.db');
        await configManager.initialize();
    }

    // Get stored config
    const storedConfig = await configManager.getConfig();
    
    // Merge CLI args with stored config (stored config takes precedence)
    const mergedArgs = {
        ...argv,
        'llm-endpoint': storedConfig.llm_endpoint || argv['llm-endpoint'] || argv.llmEndpoint,
        'llm-model': storedConfig.llm_model || argv['llm-model'] || argv.llmModel,
        'llm-api-key': storedConfig.llm_api_key || argv['llm-api-key'] || argv.llmApiKey,
        // Also provide camelCase versions for consistency
        llmEndpoint: storedConfig.llm_endpoint || argv['llm-endpoint'] || argv.llmEndpoint,
        llmModel: storedConfig.llm_model || argv['llm-model'] || argv.llmModel,
        llmApiKey: storedConfig.llm_api_key || argv['llm-api-key'] || argv.llmApiKey,
    };

    // Log config source once on startup
    if (!configLogged) {
        console.log('\nLLM Configuration:');
        
        const cliEndpoint = argv['llm-endpoint'] || argv.llmEndpoint || 'anthropic';
        const cliModel = argv['llm-model'] || argv.llmModel || 'claude-sonnet-4';
        const cliApiKey = argv['llm-api-key'] || argv.llmApiKey;
        
        const usingStoredEndpoint = storedConfig.llm_endpoint && storedConfig.llm_endpoint !== cliEndpoint;
        const usingStoredModel = storedConfig.llm_model && storedConfig.llm_model !== cliModel;
        const usingStoredApiKey = storedConfig.llm_api_key && storedConfig.llm_api_key !== cliApiKey;
        
        console.log(`  Endpoint: ${mergedArgs.llmEndpoint} ${usingStoredEndpoint ? '(from config DB)' : '(from CLI args)'}`);
        console.log(`  Model: ${mergedArgs.llmModel} ${usingStoredModel ? '(from config DB)' : '(from CLI args)'}`);
        console.log(`  API Key: ${mergedArgs.llmApiKey ? '***' : 'not set'} ${usingStoredApiKey ? '(from config DB)' : '(from CLI args)'}`);
        
        configLogged = true;
    }

    return {
        args: mergedArgs,
    } as MainProps;
}