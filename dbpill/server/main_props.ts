import { Greeting } from 'shared/types';
import { MainProps } from 'shared/main_props';
import argv from './args';
import { ConfigManager } from './config_manager';

let configManager: ConfigManager | null = null;

export async function getMainProps(req) {
    // Initialize ConfigManager if not already done
    if (!configManager) {
        configManager = new ConfigManager('dbpill.sqlite.db');
        await configManager.initialize();
    }

    return {
        args: argv,
    } as MainProps;
}