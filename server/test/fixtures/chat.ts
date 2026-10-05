import type {
  ChatAi,
  ChatInput,
  ChatContext,
  ChatToolResult,
  ChatTools,
} from '../../src/application/conversations/types.js';
export class FixtureChat implements ChatAi {
  constructor(public creation?: 'create_event' | 'create_issue') {}
  calls = 0;
  pause?: Promise<void>;
  failOnce = false;
  foreignThing?: string;
  probe?: (
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
  ) => Promise<void>;
  research: ChatAi['research'] = async () => ({ text: 'Synthetic research answer', sources: [] });
  async respond(input: ChatInput, tools: ChatTools, context: ChatContext) {
    const execute = tools.execute;
    this.calls++;
    const searched = input.thingId ? null : await execute('search_things', { query: '' });
    const id = input.thingId ?? (searched!.output as { items: { id: string }[] }).items[0]?.id;
    const result =
      input.activeThing && !this.foreignThing
        ? { output: input.activeThing }
        : await execute('read_thing', {
            thingId: this.foreignThing ?? id,
          });
    if ('error' in (result.output as object)) {
      context.delta('That Thing is unavailable.');
      return 'That Thing is unavailable.';
    }
    await this.probe?.(input, execute);
    const { thing, attachments } = result.output as {
      thing: {
        id: string;
        fieldSets: { id: string; fields: { id: string }[] }[];
      };
      attachments: { id: string }[];
    };
    await this.pause;
    if (this.creation)
      await execute(this.creation, {
        thingId: thing.id,
        title: this.creation === 'create_event' ? 'Check the filter' : 'Filter needs attention',
        description: 'Synthetic assistant task',
      });
    await execute('show_cards', {
      cards: [
        {
          type: 'THING',
          id: thing.id,
          fieldSetId: null,
          fieldId: null,
          customFieldId: null,
          page: null,
        },
        ...(thing.fieldSets.length
          ? [
              {
                type: 'FIELD',
                id: thing.id,
                fieldSetId: thing.fieldSets[0].id,
                fieldId: thing.fieldSets[0].fields[0].id,
                customFieldId: null,
                page: null,
              },
            ]
          : []),
        ...(attachments.length
          ? [
              {
                type: 'ATTACHMENT',
                id: attachments[0].id,
                fieldSetId: null,
                fieldId: null,
                customFieldId: null,
                page: 1,
              },
            ]
          : []),
      ],
    });
    context.delta('The saved details ');
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error('Synthetic provider failure after write');
    }
    context.delta('are ready.');
    await context.record({
      model: 'fixture',
      inputTokens: 10,
      outputTokens: 5,
    });
    return 'The saved details are ready.';
  }
}
