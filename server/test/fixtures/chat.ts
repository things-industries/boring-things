import type {
  ChatAi,
  ChatInput,
  ChatContext,
  ChatToolResult,
} from '../../src/application/chat-types.js';
export class FixtureChat implements ChatAi {
  calls = 0;
  pause?: Promise<void>;
  failOnce = false;
  foreignThing?: string;
  probe?: (
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
  ) => Promise<void>;
  async respond(
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
    context: ChatContext,
  ) {
    this.calls++;
    const searched = input.thingId ? null : await execute('search_things', { query: '' });
    const id = input.thingId ?? (searched!.output as { items: { id: string }[] }).items[0]?.id;
    const result = await execute('read_thing', {
      thingId: this.foreignThing ?? id,
    });
    await this.probe?.(input, execute);
    const { thing, attachments } = result.output as {
      thing: {
        id: string;
        fieldSets: { id: string; fields: { id: string }[] }[];
      };
      attachments: { id: string }[];
    };
    await this.pause;
    if (input.intent === 'create_event' || input.intent === 'create_issue')
      await execute(input.intent, {
        thingId: thing.id,
        title: input.intent === 'create_event' ? 'Check the filter' : 'Filter needs attention',
        description: 'Synthetic assistant task',
      });
    await execute('show_cards', {
      cards: [
        {
          type: 'thing',
          id: thing.id,
          fieldSetId: null,
          fieldId: null,
          page: null,
        },
        ...(thing.fieldSets.length
          ? [
              {
                type: 'field',
                id: thing.id,
                fieldSetId: thing.fieldSets[0].id,
                fieldId: thing.fieldSets[0].fields[0].id,
                page: null,
              },
            ]
          : []),
        ...(attachments.length
          ? [
              {
                type: 'attachment',
                id: attachments[0].id,
                fieldSetId: null,
                fieldId: null,
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
