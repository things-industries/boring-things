import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

const prompt = 'Ask about a detail, a manual, maintenance or compatible products.';

/** The visible, typed copy of the empty chat prompt. */
const introPrompt = (page: Page) => page.locator('bt-typewriter > [aria-hidden="true"]');

test('global chat starts empty with the composer', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
  await expect(introPrompt(page)).toBeVisible();
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

test('chat intro types the prompt, then fades in the data notice', async ({ page }) => {
  await page.goto('/chat', { waitUntil: 'commit' });

  // Mid-typing, untyped characters stay in place and the notice is hidden.
  await page.waitForFunction(
    () => {
      const rest = document.querySelector('.typewriter-rest')?.textContent;
      const notice = document.querySelector('.chat-data-notice');

      return !!rest && !!notice && getComputedStyle(notice).opacity === '0';
    },
    undefined,
    { polling: 'raf' },
  );
  await expect(page.locator('bt-typewriter .visually-hidden')).toHaveText(prompt);
  await expect(introPrompt(page)).toHaveText(prompt);

  await expect(page.locator('.typewriter-rest')).toHaveText('');
  await expect(page.locator('.chat-data-notice')).toHaveCSS('opacity', '1');
});

test('chat intro shows at once with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/chat');

  await expect(introPrompt(page)).toBeVisible();
  await expect(page.locator('.typewriter-rest')).toHaveText('');
  await expect(page.locator('.chat-data-notice')).toHaveCSS('opacity', '1');
});

test('chat fits the visible area while the composer has focus', async ({ page }) => {
  await page.goto('/chat');

  const chat = page.locator('bt-chat');
  const message = page.getByLabel('Message', { exact: true });

  await expect(introPrompt(page)).toBeVisible();
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

  await expect(introPrompt(page)).toBeVisible();

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
