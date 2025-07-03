import OpenAI from 'openai';

import argv from './args';
import { ConfigManager } from './config_manager';

// Map logical endpoint identifiers to their corresponding OpenAI-compatible base URLs
function resolveBaseURL(endpoint: string): string {
    switch (endpoint) {
        case 'anthropic':
            // Anthropic OpenAI-compat layer
            return 'https://api.anthropic.com/v1/';
        case 'gemini':
            // Google Gemini compat endpoint
            return 'https://generativelanguage.googleapis.com/v1beta/openai/';
        case 'grok':
            // xAI Grok compat endpoint
            return 'https://api.x.ai/v1/';
        case 'openai':
            // Native OpenAI
            return 'https://api.openai.com/v1/';
        default:
            // Assume custom URL already contains protocol
            return endpoint;
    }
}

let configManager: ConfigManager | null = null;

async function getConfigManager(): Promise<ConfigManager> {
    if (!configManager) {
        configManager = new ConfigManager('dbpill.sqlite.db');
        await configManager.initialize();
    }
    return configManager;
}

async function getCredentials(endpoint: string): Promise<string> {
    const cm = await getConfigManager();
    const config = await cm.getConfig();
    
    // Map endpoint to vendor for API key lookup
    let vendor = endpoint;
    switch (endpoint) {
        case 'anthropic':
            vendor = 'anthropic';
            break;
        case 'openai':
            vendor = 'openai';
            break;
        case 'gemini':
            vendor = 'google';
            break;
        case 'grok':
            vendor = 'xai';
            break;
        default:
            // For custom endpoints, try to get the API key from general config
            vendor = null;
            break;
    }
    
    // Try vendor-specific API key first
    if (vendor) {
        const vendorApiKey = await cm.getApiKeyForVendor(vendor);
        if (vendorApiKey) {
            return vendorApiKey;
        }
    }
    
    // Fall back to general config, then CLI args
    return config.llm_api_key || argv['llm-api-key'] || argv.llmApiKey;
}

export interface Completion {
    text: string;
    input_tokens: number;
    output_tokens: number;
    stopSequence: string | undefined;
}

export async function prompt_llm({
    prompt,
    // Temperature is accepted for API compatibility but deliberately ignored
    // because certain models (e.g. o3) only support the default value (1).
    temperature: _ignoredTemperature,
    stop,
    streamHandler,
}: {
    prompt: string;
    temperature?: number;
    stop?: string[];
    streamHandler?: (stream: any, text: string, stopSequence?: string) => void
}): Promise<Completion> {

    const cm = await getConfigManager();
    const config = await cm.getConfig();

    const endpoint = config.llm_endpoint || 'anthropic';
    const baseURL = resolveBaseURL(endpoint);
    const model = config.llm_model || argv['llm-model'] || argv.llmModel || 'claude-sonnet-4-20250514';

    const API_KEY = await getCredentials(endpoint);

    const openai = new OpenAI({
        apiKey: API_KEY,
        baseURL,
    });

    // Some models (e.g. o3) reject the legacy `max_tokens` parameter in favour of
    // `max_completion_tokens`. We optimistically try the standard `max_tokens`
    // call first, then *silently* retry once with `max_completion_tokens` if the
    // API responds with the specific "Unsupported parameter: 'max_tokens'" error.
    let stream: any;
    try {
        stream = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 1,
            stop,
            stream: true,
        } as any);
    } catch (err: any) {
        const msg: string | undefined = err?.message || err?.error?.message;
        const shouldRetry = msg && msg.includes('max_completion_tokens');

        if (shouldRetry) {
            // Retry once with the new parameter. We purposefully avoid logging
            // the first failure so that consumers do not see a spurious error.
            stream = await openai.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                // The OpenAI client typings may not include this yet, so we cast
                // to any to bypass TS restrictions.
                max_completion_tokens: 4096,
                temperature: 1,
                stop,
                stream: true,
            } as any);
        } else {
            throw err; // Different error – propagate as before
        }
    }

    let text = '';
    let stopSequence: string | undefined;

    for await (const chunk of stream) {
        // Different providers surface streaming deltas differently.
        //  - OpenAI-compatible:   chunk.choices[0].delta.content
        //  - Anthropic:          chunk.content OR chunk.completion
        //  - Others (e.g. o3):   may vary but generally expose `.content` too.

        const choice = (chunk as any)?.choices?.[0];

        const delta: string =
            choice?.delta?.content ??
            (chunk as any)?.content ??
            (chunk as any)?.completion ??
            '';

        text += delta;

        // Capture finish/stop information if present.
        const finishReason: string | undefined =
            choice?.finish_reason ??
            (chunk as any)?.stop_reason ??
            (chunk as any)?.finish_reason;

        if (finishReason && !stopSequence) {
            stopSequence = finishReason;
        }

        if (streamHandler && (delta || stopSequence)) {
            streamHandler(stream, delta, stopSequence);
        }
    }

    return {
        text,
        input_tokens: 0,
        output_tokens: 0,
        stopSequence,
    } as Completion;
};
