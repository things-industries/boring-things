import OpenAI from 'openai';
import type { Response, ResponseInput, Tool } from 'openai/resources/responses/responses';
import * as prompts from './prompts.js';
/**
 * Adapts streamed OpenAI Responses calls to assistant text deltas and sequential application tools,
 * including requested attachment content.
 */

import type {
  ChatAi,
  ChatInput,
  ChatContext,
  ChatToolResult,
} from '../../application/conversations/types.js';
import { chatFunctions } from '../../contracts/chat-tools.js';
import { ensure } from '../../application/errors.js';
import type { PublicField } from '../../application/public-fields.js';
import type { AiContext } from '../../application/import/types.js';
import { searchWeb } from './responses.js';

export class OpenAiChat implements ChatAi {
  private client: OpenAI;
  constructor(
    key: string,
    private model: string,
    private maxOutputTokens: number,
    private rounds: number,
    private searchCalls = 3,
  ) {
    this.client = new OpenAI({ apiKey: key, maxRetries: 0 });
  }

  async research(question: string, fields: PublicField[], context: AiContext) {
    return searchWeb(
      this.client,
      this.model,
      this.maxOutputTokens,
      prompts.chatResearchPrompt(question, fields, this.searchCalls),
      this.searchCalls,
      context,
    );
  }

  async respond(
    task: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
    context: ChatContext,
  ) {
    const conversation: ResponseInput = task.messages.map((message) => ({
      ...message,
      role: message.role === 'USER' ? ('user' as const) : ('assistant' as const),
    }));
    conversation.push({
      role: 'developer',
      content: prompts.chatContextPrompt(task),
    });
    let answer = '';

    for (let round = 0; round <= this.rounds; round++) {
      context.signal.throwIfAborted();
      let completed: Response | undefined;
      try {
        const stream = await this.client.responses.create(
          {
            model: this.model,
            store: false,
            stream: true,
            max_output_tokens: this.maxOutputTokens,
            instructions: prompts.chatInstructions,
            input: conversation,
            tools: chatFunctions as Tool[],
            parallel_tool_calls: false,
            include: ['reasoning.encrypted_content'],
            ...(round === this.rounds ? { tool_choice: 'none' as const } : {}),
          },
          { signal: context.signal },
        );
        try {
          for await (const event of stream) {
            context.signal.throwIfAborted();
            if (event.type === 'response.output_text.delta') {
              answer += event.delta;
              context.delta(event.delta);
            }
            if (event.type === 'response.completed') completed = event.response;
            if (['error', 'response.failed', 'response.incomplete'].includes(event.type))
              throw new Error('chat_provider_failed');
          }
          context.signal.throwIfAborted();
        } finally {
          stream.controller.abort();
        }
      } catch {
        context.signal.throwIfAborted();
        throw new Error('chat_provider_failed');
      }

      ensure(completed?.status === 'completed', 'Assistant response incomplete');
      await context.record({
        model: this.model,
        inputTokens: completed.usage?.input_tokens ?? 0,
        outputTokens: completed.usage?.output_tokens ?? 0,
        cachedTokens: completed.usage?.input_tokens_details?.cached_tokens ?? 0,
      });
      // Replay output and tool results for the next turn because remote response storage is disabled.
      conversation.push(...(completed.output as ResponseInput));
      const calls = completed.output.filter((o) => o.type === 'function_call');
      if (!calls.length) return answer;
      ensure(calls.length === 1 && round < this.rounds, 'tool_limit');

      for (const call of calls) {
        let args: unknown;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          throw new Error('chat_provider_failed');
        }
        const result = await execute(call.name, args);
        conversation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result.output),
        });

        if (result.source) {
          const source = result.source;
          const data = `data:${source.mediaType};base64,${source.content.toString('base64')}`;
          conversation.push({
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompts.attachmentEvidencePrompt,
              },
              source.mediaType === 'text/plain'
                ? { type: 'input_text', text: source.content.toString('utf8') }
                : source.mediaType.startsWith('image/')
                  ? { type: 'input_image', image_url: data, detail: 'auto' }
                  : {
                      type: 'input_file',
                      filename: source.filename,
                      file_data: data,
                    },
            ],
          });
        }
      }
    }

    throw new Error('tool_limit');
  }
}
