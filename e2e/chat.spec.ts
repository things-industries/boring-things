import { test, expect } from './fixtures.js';

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
