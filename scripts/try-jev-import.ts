/**
 * Trial two bounded Jev decisions from the planned Import flow.
 * Dry run: node --import tsx scripts/try-jev-import.ts
 * Paid live run: OPENROUTER_API_KEY=... node --import tsx scripts/try-jev-import.ts --live
 * Add --case=category or --case=warranty to run one case; --live runs both by default.
 * No application data, database access or writes.
 * API: https://openrouter.ai/blog/tutorials/how-to-use-jev/
 */
// cspell:words OPENROUTER typesafe
import assert from 'node:assert/strict';

const endpoint = 'https://openrouter.ai/api/alpha/decisions';
const model = 'typesafe/jev-1.13';
const args = process.argv.slice(2);
assert.ok(
  args.every((arg) => ['--live', '--case=category', '--case=warranty'].includes(arg)),
  'Usage: try-jev-import.ts [--live] [--case=category|--case=warranty]',
);
assert.ok(args.length === new Set(args).size, 'Specify each argument only once');
const selectedCase = args.find((arg) => arg.startsWith('--case='))?.slice(7);
assert.ok(!args.includes('--case=category') || !args.includes('--case=warranty'));

// Planned use case: a linked supporting document has warranty facts but no
// product model. Thing context supplies the sole target; Jev only judges which
// warranty fieldset, if any, the document supports.
const scenarios = [
  {
    id: 'warranty',
    name: 'linked warranty attachment',
    expected: 'extended',
    request: {
      model,
      state: {
        thing: {
          category: 'Appliances',
          name: 'Kitchen washing machine',
          selected_fieldsets: ['appliances.appliance', 'appliances.warranty'],
        },
        attachment_text:
          'CarePlus Extra Cover certificate. Purchased separately for your washing machine. ' +
          'The manufacturer guarantee remains separate. Extra cover begins on 1 July 2027 ' +
          'and expires on 30 June 2030. Provider: CarePlus. Policy reference: CP-4821.',
      },
      questions: {
        warranty_evidence: {
          type: 'choice',
          instructions:
            'Classify only the cover described by `attachment_text` for the known appliance. ' +
            'Use document evidence; the selected fieldsets do not prove what this document describes.',
          criteria: {
            extended:
              'Separately purchased extended warranty or cover beyond manufacturer guarantee.',
            manufacturer: 'Manufacturer guarantee or original product warranty only.',
            neither: 'No supported warranty type or insufficient information.',
          },
        },
      },
    },
  },
  {
    id: 'category',
    name: 'Thing Candidate category',
    expected: 'insurance',
    request: {
      model,
      state: {
        thing_candidate: {
          name: 'Home cover policy',
          terms: ['buildings cover', 'contents cover', 'annual premium'],
          facts: [
            'One policy number HC-2048 covers both the building and its contents.',
            'Buildings sum insured: GBP 400,000; contents sum insured: GBP 50,000.',
            'The policy renews annually with HomeShield Insurance.',
          ],
        },
      },
      questions: {
        thing_category: {
          type: 'choice',
          instructions:
            'Choose the broad Boring Things category for `thing_candidate` from its name, terms and facts. ' +
            'A combined buildings and contents policy is one candidate. Choose Other only when none fits.',
          criteria: {
            appliances: 'Physical household appliances such as ovens or washing machines.',
            devices: 'Electronic or computing devices such as phones or laptops.',
            vehicles: 'Road vehicles, bicycles, boats and similar transport.',
            memberships: 'Membership in a club, gym, association or similar organisation.',
            subscriptions: 'Recurring access to a product, service or digital content.',
            utilities: 'Household supply contracts such as electricity, water or broadband.',
            insurance:
              'Policies that insure property, possessions, vehicles, health or other risks.',
            other: 'A Thing outside the listed categories or with insufficient category evidence.',
          },
        },
      },
    },
  },
] as const;
const selectedScenarios = scenarios.filter(
  (scenario) => !selectedCase || scenario.id === selectedCase,
);

if (!args.includes('--live')) {
  console.log(JSON.stringify(selectedScenarios, null, 2));
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
assert.ok(apiKey, 'Set OPENROUTER_API_KEY for --live');

for (const scenario of selectedScenarios) {
  const [questionId, question] = Object.entries(scenario.request.questions)[0];
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(scenario.request),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Jev request failed: HTTP ${response.status}`);

  const result: unknown = await response.json();
  assert.ok(result && typeof result === 'object' && 'answers' in result);
  const answers = result.answers;
  assert.ok(answers && typeof answers === 'object' && questionId in answers);
  const answer = (answers as Record<string, unknown>)[questionId];
  assert.ok(answer && typeof answer === 'object' && 'type' in answer);
  assert.equal(answer.type, 'choice');
  assert.ok('choice' in answer && typeof answer.choice === 'string');
  assert.ok(answer.choice in question.criteria, 'Unknown choice');
  assert.ok('confidence' in answer && typeof answer.confidence === 'number');
  assert.ok(
    'probabilities' in answer && answer.probabilities && typeof answer.probabilities === 'object',
  );
  const probabilities = answer.probabilities as Record<string, unknown>;
  for (const option of Object.keys(question.criteria)) {
    const probability = probabilities[option];
    assert.ok(
      typeof probability === 'number' && probability >= 0 && probability <= 1,
      `Invalid probability for ${option}`,
    );
  }

  const usage = 'usage' in result ? result.usage : undefined;
  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        expected: scenario.expected,
        predicted: answer.choice,
        passed: answer.choice === scenario.expected,
        confidence: answer.confidence,
        probabilities,
        elapsedMs: Math.round(performance.now() - started),
        usage,
        candidateFieldset:
          scenario.name === 'linked warranty attachment' && answer.choice === 'extended'
            ? 'appliances.extendedWarranty'
            : undefined,
      },
      null,
      2,
    ),
  );
  if (answer.choice !== scenario.expected) process.exitCode = 1;
}
