import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

import argv from './args';

function getCredentials(service: string, key: string): string {
    return argv['llm-api-key'] || argv.llmApiKey;
}

export interface Completion {
    text: string;
    input_tokens: number;
    output_tokens: number;
    stopSequence: string | undefined;
}

export async function prompt_claude({
    prompt,
    temperature=0.0,
    stop,
    streamHandler,
}: {
    prompt: string;
    temperature?: number;
    stop?: string[];
    streamHandler?: (stream: any, text: string, stopSequence?: string) => void
}): Promise<Completion> {

    const messages: Anthropic.MessageParam[] = [{
        role: 'user',
        content: prompt,
    
    }]

    const API_KEY = getCredentials("anthropic", "api_key");
    const anthropic = new Anthropic({
        apiKey: API_KEY,
    });

    const stream = await anthropic.messages.create({
        messages,
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        stream: true,
        temperature,
        stop_sequences: stop,
    })

    /* notes from claude api docs

    event: message_start
    data: {"type": "message_start", "message": {"id": "msg_1nZdL29xx5MUA1yADyHTEsnR8uuvGzszyY", "type": "message", "role": "assistant", "content": [], "model": "claude-3-opus-20240229, "stop_reason": null, "stop_sequence": null, "usage": {"input_tokens": 25, "output_tokens": 1}}}

    event: content_block_start
    data: {"type": "content_block_start", "index":0, "content_block": {"type": "text", "text": ""}}

    event: ping
    data: {"type": "ping"}

    event: content_block_delta
    data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}

    event: content_block_delta
    data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "!"}}

    event: content_block_stop
    data: {"type": "content_block_stop", "index": 0}

    event: message_delta
    data: {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence":null}, "usage":{"output_tokens": 15}}

    event: message_stop
    data: {"type": "message_stop"}


    */

    let input_tokens = 0;
    let output_tokens = 0;
    let text = '';
    let stopSequence: string | undefined;

    for await (const messageStreamEvent of stream) {
        const { type } = messageStreamEvent;
        // console.log(messageStreamEvent);
        let text_delta = '';

        if (type === 'message_start') {
            text_delta = messageStreamEvent.message.content.join('\n');
            text += text_delta;
            input_tokens += messageStreamEvent.message.usage.input_tokens;
            output_tokens += messageStreamEvent.message.usage.output_tokens;
        } else if (type === 'content_block_delta') {
            //@ts-ignore
            text_delta = messageStreamEvent.delta.text;
            text += text_delta;
        } else if (type === 'message_delta') {
            output_tokens += messageStreamEvent.usage.output_tokens;
            if (messageStreamEvent.delta.stop_reason === 'stop_sequence') {
                // console.log('stop sequence', messageStreamEvent.delta.stop_sequence);
                stopSequence = messageStreamEvent.delta.stop_sequence || undefined;
            }
        } else if (type === 'content_block_start') {
            //@ts-ignore
            text_delta = messageStreamEvent.content_block.text;
            text += text_delta;
            const content_type = messageStreamEvent.content_block.type;
        }

        if (streamHandler && (text_delta || stopSequence)) {
            streamHandler(stream, text_delta, stopSequence);
            // process.stdout.write(text_delta);
        }
    }
    return { text, input_tokens, output_tokens, stopSequence } as Completion;
};
