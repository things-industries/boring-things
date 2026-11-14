/**
 * Answers a question about a product or service using public web sources.
 *
 * Runs after: The assistant asks its research tool about a Thing it has read
 * As part of: Assistant chat
 * Inputs: Research question and the Thing's public product or service fields
 * Outputs: Answer text and citation URLs observed during research
 * Next: Assistant reply generation resumes with the research result
 */

import type { ResearchAnswer } from '../../../application/conversations/types.js';
import type { AiContext } from '../types.js';
import type { PublicField } from '../../../application/public-fields.js';
import { AiTask } from './task.js';
import { getPrompt } from '../prompts.js';
import { readWebResult } from '../tools/web.js';

// Builds task instructions from the supplied application context.
function chatResearchPrompt(question: string, fields: PublicField[], searchCalls: number) {
  return `Answer this question about a product or service: ${JSON.stringify(question)}. Model, product or service details shared across instances: ${JSON.stringify(fields.map(({ label, value }) => ({ label, value })))}. Use these details to identify the subject. Research only the question. Verify applicability and support the answer with at most three relevant sources, preferring official documentation. Explain missing evidence. Never infer personal schedules, individual cover or identifiers from public information. Use at most ${searchCalls} web tool calls including page opens; stop at that limit.`;
}

export class AssistantResearchTask extends AiTask<never, ResearchAnswer> {
  protected readonly model: string = 'gpt-6.1-sol';
  protected readonly effort = 'low';
  protected override readonly searchCalls = 3;
  protected override readonly sourceMode = 'cited';
  protected readonly maxTextCharacters = Infinity;
  protected task = 'assistant_research';
  protected instructions = getPrompt('web-research-instructions');

  constructor(
    private question: string,
    private fields: PublicField[],
    context: AiContext,
  ) {
    super(context);
  }

  // Answers the supplied question and exposes only observed citation URLs.
  protected async runTask() {
    const response = await this.execute(
      chatResearchPrompt(this.question, this.fields, this.searchCalls),
    );
    const result = await readWebResult(response, this.context, this.sourceMode);
    this.reportMetrics({ sourceCount: result.sources.length });
    return result;
  }
}
