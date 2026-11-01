/** Answers assistant questions using public fields and observed citations. */

import type { AiContext } from '../types.js';
import type { ResearchAnswer } from '../../../application/conversations/types.js';
import type { PublicField } from '../../../application/public-fields.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';

// Builds task instructions from the supplied application context.
function chatResearchPrompt(question: string, fields: PublicField[], searchCalls: number) {
  return `Answer this question about a product or service: ${JSON.stringify(question)}. Model, product or service details shared across instances: ${JSON.stringify(fields.map(({ label, value }) => ({ label, value })))}. Use these details to identify the subject. Research only the question. Verify applicability and support the answer with at most three relevant sources, preferring official documentation. Explain missing evidence. Never infer personal schedules, individual cover or identifiers from public information. Use at most ${searchCalls} web tool calls including page opens; stop at that limit.`;
}

export class AssistantResearchTask extends AiTask<never, ResearchAnswer> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'low';
  private readonly searchCalls = 3;
  protected readonly maxTextCharacters = Infinity;
  protected task = 'assistant_research';
  protected instructions = getPrompt('web-research-instructions');

  constructor(
    private question: string,
    private fields: PublicField[],
  ) {
    super();
  }

  // Answers the supplied question and exposes only observed citation URLs.
  protected async runTask(context: AiContext) {
    const response = await this.execute(
      chatResearchPrompt(this.question, this.fields, this.searchCalls),
      context,
      createWebSearchOptions(this.searchCalls, 'cited'),
    );
    const result = await readWebResult(response, context, this.searchCalls, 'cited');
    this.reportMetrics({ sourceCount: result.sources.length });
    return result;
  }
}
