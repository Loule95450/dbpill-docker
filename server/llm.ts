import OpenAI from 'openai';

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
    
    // Fall back to general config
    return config.llm_api_key;
}

export interface Completion {
    text: string;
    input_tokens: number;
    output_tokens: number;
    stopSequence: string | undefined;
}

// Helper to decide which parameter name to use for specifying the number of
// completion tokens. Some providers/models (e.g. OpenAI reasoning models like
// o1, o3, o4) have migrated to `max_completion_tokens` while the majority still expect `max_tokens`.
function resolveMaxTokensParam(endpoint: string, model: string): 'max_tokens' | 'max_completion_tokens' {
    const m = model?.toLowerCase() || '';

    // OpenAI reasoning models (o1, o3, o4, etc. and their variants like mini)
    // require the newer parameter
    if (endpoint === 'openai' && /^o\d+/.test(m)) {
        return 'max_completion_tokens';
    }

    // Default – legacy OpenAI-style parameter.
    return 'max_tokens';
}

// Helper to choose a sensible default for the maximum number of tokens the
// model is allowed to generate. Most contemporary chat models comfortably
// support ≥8k completion tokens, so we default to 8192 unless explicitly
// overridden at runtime.
function resolveDefaultMaxTokens(endpoint: string, model: string): number {
    // In future this could consult per-model limits. For now, follow the user
    // guidance of using ~8k across the board.
    return 8192;
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
    const model = config.llm_model || 'claude-sonnet-4-0';

    const API_KEY = await getCredentials(endpoint);

    const openai = new OpenAI({
        apiKey: API_KEY,
        baseURL,
    });

    // Determine parameter name & sensible default for completion length based
    // on the provider/model.
    const tokenParamName = resolveMaxTokensParam(endpoint, model);
    const maxTokens = resolveDefaultMaxTokens(endpoint, model);

    const completionParams: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
        stop,
        stream: true,
    };
    completionParams[tokenParamName] = maxTokens;

    // Attempt the request with the selected parameter. If the provider rejects
    // it, retry once with the alternative parameter name for maximum
    // compatibility.
    const altTokenParamName = tokenParamName === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';

    let stream: any;
    try {
        stream = await openai.chat.completions.create(completionParams as any);
    } catch (err: any) {
        const msg: string | undefined = err?.message || err?.error?.message;
        const shouldRetry = msg && msg.includes(`Unsupported parameter`) && msg.includes(tokenParamName);

        if (shouldRetry) {
            // Swap the parameter name and try once more.
            delete completionParams[tokenParamName];
            completionParams[altTokenParamName] = maxTokens;
            stream = await openai.chat.completions.create(completionParams as any);
        } else {
            throw err; // Propagate unknown errors
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
