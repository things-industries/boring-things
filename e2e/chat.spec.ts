import { test, expect } from './fixtures.js';

test('chat groups document pages and renders a custom field after its answer', async ({ page }) => {
  await page.goto('/things');
  const loaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/things\/[0-9a-f-]{36}$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole('heading', { name: 'Kitchen hob', exact: true }).click();
  const thing = await (await loaded).json();
  const fieldId = crypto.randomUUID();
  const attachmentId = crypto.randomUUID();
  thing.customFields = [
    {
      id: fieldId,
      label: 'Purchase date',
      value: '2026-10-01',
      sensitive: false,
      masked: false,
      origin: 'USER',
      sourceRefs: [],
      valueType: 'TEXT',
    },
  ];
  await page.route(`**/api/things/${thing.id}`, (route) => route.fulfill({ json: thing }));
  await page.route(`**/api/attachments/${attachmentId}`, (route) =>
    route.fulfill({
      json: {
        id: attachmentId,
        filename: 'manual.pdf',
        title: 'User Manual',
        mediaType: 'application/pdf',
        documentType: 'MANUAL',
        pageCount: 88,
        thingIds: [thing.id],
      },
    }),
  );
  await page.route(/\/api\/conversations\/[^/]+\/stream$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    return route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: `event: conversation.snapshot\ndata: ${JSON.stringify({
        id,
        thingId: null,
        messages: [
          {
            id: crypto.randomUUID(),
            conversationId: id,
            requestId: crypto.randomUUID(),
            role: 'ASSISTANT',
            status: 'COMPLETE',
            text: 'The purchase date is 1 October 2026. [Receipt](https://manufacturer.example/receipt)',
            createdAt: new Date().toISOString(),
            cards: [
              {
                type: 'FIELD',
                thingId: thing.id,
                fieldSetId: null,
                fieldId: null,
                customFieldId: fieldId,
              },
              { type: 'ATTACHMENT', attachmentId },
              { type: 'ATTACHMENT', attachmentId, page: 29 },
              { type: 'ATTACHMENT', attachmentId, page: 50 },
            ],
            sourceRefs: [
              { attachmentId, page: 29 },
              { attachmentId, page: 50 },
              ...Array.from({ length: 100 }, (_, id) => ({
                url: `https://candidate.example/${id}`,
              })),
            ],
          },
        ],
      })}\n\n`,
    });
  });
  await page.goto('/chat');
  const answer = page.locator('bt-chat-bubble:not(.user)');
  await expect(answer.locator('bt-rich-text')).toHaveText(
    'The purchase date is 1 October 2026. Receipt',
  );
  await expect(answer.getByRole('link', { name: 'Receipt' })).toHaveAttribute(
    'href',
    'https://manufacturer.example/receipt',
  );
  await expect(answer.locator('bt-rich-text').getByRole('link')).toHaveCount(1);
  await expect(answer.locator('a[href^="https://candidate.example/"]')).toHaveCount(0);
  await expect(answer.locator('bt-key-value-row')).toContainText('Purchase date');
  await expect(answer.locator('bt-key-value-row')).toContainText('2026-10-01');
  await expect(answer.getByRole('button', { name: 'Download User Manual' })).toHaveCount(1);
  await expect(answer).toContainText('Cited on pages 29, 50');
  expect(
    await answer.evaluate((element) => {
      const text = element.querySelector('bt-rich-text')!;
      const card = element.querySelector('bt-resource-card')!;
      return !!(text.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
});

test('global chat starts empty with the composer', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
  await expect(page.getByText('Ask about a detail, a manual, maintenance')).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toHaveAttribute(
    'placeholder',
    'Ask across all your Things',
  );
  await expect(page.getByRole('button', { name: 'Attach a file (coming soon)' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Conversation actions (coming soon)' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
});

test('chat fits the visible area while the composer has focus', async ({ page }) => {
  await page.goto('/chat');

  const chat = page.locator('bt-chat');
  const message = page.getByLabel('Message', { exact: true });

  await expect(page.getByText('Ask about a detail, a manual, maintenance')).toBeVisible();
  await message.focus();
  await expect(chat).toHaveClass(/keyboard/);
  // An on-screen keyboard shrinks the visual viewport.
  await page.setViewportSize({ width: 390, height: 400 });
  await expect.poll(async () => (await chat.boundingBox())?.height).toBe(400);

  await message.blur();
  await expect(chat).not.toHaveClass(/keyboard/);
});

test('Thing chat shows its Thing and streams an answer with cards', async ({ page }) => {
  await page.goto('/things');
  await page.getByRole('heading', { name: 'Kitchen hob', exact: true }).click();
  await page.getByRole('link', { name: 'Ask about this thing' }).click();

  await expect(page.locator('bt-thing-card')).toContainText('Kitchen hob');
  await expect(page.getByLabel('Message', { exact: true })).toHaveAttribute(
    'placeholder',
    'Ask about this Thing',
  );

  await expect(page.getByText('Ask about a detail, a manual, maintenance')).toBeVisible();

  const message = page.getByLabel('Message', { exact: true });

  await message.fill('Who makes it?');
  await message.press('Enter');
  await expect(message).toHaveValue('');
  await expect(page.locator('bt-chat-bubble.user')).toContainText('Who makes it?');

  const answer = page.locator('bt-chat-bubble:not(.user)');

  await expect(answer.locator('bt-rich-text')).toHaveText('The saved details are ready.');
  await expect(answer.locator('bt-key-value-row')).toContainText('Manufacturer');
  // The chat's own Thing shows once, in the context card.
  await expect(page.locator('bt-thing-card')).toHaveCount(1);
});

test('assistant Markdown renders as sanitised formatted text', async ({ page }) => {
  await page.route(/\/api\/conversations\/[^/]+\/stream$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const message = (role: 'USER' | 'ASSISTANT', text: string) => ({
      id: crypto.randomUUID(),
      conversationId: id,
      requestId: '00000000-0000-4000-8000-000000000001',
      role,
      text,
      cards: [],
      sourceRefs: [],
      status: 'COMPLETE',
      createdAt: new Date().toISOString(),
    });
    const snapshot = {
      id,
      thingId: null,
      messages: [
        message('USER', 'How do I run it?'),
        message(
          'ASSISTANT',
          '## 1. Prepare\n\n- Empty the **oven**\n- Wipe away grease\n\n[Manual](https://example.com/manual)\n\n<img src="x" onerror="window.injected = true"><script>window.injected = true</script>',
        ),
      ],
    };

    return route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: `event: conversation.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
    });
  });

  await page.goto('/chat');

  const text = page.locator('bt-rich-text');

  await expect(text.getByRole('heading', { name: '1. Prepare' })).toBeVisible();
  await expect(text.getByRole('listitem')).toHaveCount(2);
  await expect(text.locator('strong')).toHaveText('oven');
  await expect(text.getByRole('link', { name: 'Manual' })).toHaveAttribute('target', '_blank');
  await expect(text.locator('script, [onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
});
