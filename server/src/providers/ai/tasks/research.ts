/** Answers assistant questions using public fields and observed citations. */

import type { AiContext } from '../types.js';
import type { ResearchAnswer } from '../../../application/conversations/types.js';
import type { PublicField } from '../../../application/public-fields.js';
import { AiTask, type TaskRuntime } from './task.js';
import { webResearchInstructions } from '../prompts.js';
import { createWebSearchOptions, readWebResult } from '../tools/web.js';

// Builds task instructions from the supplied application context.
function chatResearchPrompt(question: string, fields: PublicField[], searchCalls: number) {
  return `Answer this question about a product or service: ${JSON.stringify(question)}. Model, product or service details shared across instances: ${JSON.stringify(fields.map(({ label, value }) => ({ label, value })))}. Use these details to identify the subject. Research only the question. Verify applicability and support the answer with at most three relevant sources, preferring official documentation. Explain missing evidence. Never infer personal schedules, individual cover or identifiers from public information. Use at most ${searchCalls} web tool calls including page opens; stop at that limit.`;
}

export class ResearchTask extends AiTask {
  protected task = 'research';
  protected instructions = webResearchInstructions;

  constructor(
    runtime: TaskRuntime,
    private question: string,
    private fields: PublicField[],
    private searchCalls: number,
  ) {
    super(runtime);
  }

  // Answers the supplied question and exposes only observed citation URLs.
  async run(context: AiContext): Promise<ResearchAnswer> {
    const response = await this.execute(
      chatResearchPrompt(this.question, this.fields, this.searchCalls),
      context,
      createWebSearchOptions(this.searchCalls, 'cited'),
    );
    return readWebResult(response, context, this.searchCalls, 'cited');
  }
}
