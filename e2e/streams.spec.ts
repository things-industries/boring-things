import { test, expect } from './fixtures.js';

test('assistant reconnect restores streamed text without duplication', async ({ page }) => {
  let connections = 0;
  page.on('request', (request) => {
    if (/\/api\/conversations\/[^/]+\/stream$/.test(request.url())) connections++;
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let interrupted = false;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (
        interrupted ||
        !/\/api\/conversations\/[^/]+\/stream$/.test(response.url) ||
        !response.body
      )
        return response;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      // Interrupt one real HTTP stream after the saved answer arrives; the app must reconnect.
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          text += decoder.decode(value, { stream: true });
          if (text.includes('The saved details are ready.')) {
            interrupted = true;
            controller.close();
            await reader.cancel();
          }
        },
        cancel() {
          return reader.cancel();
        },
      });
      return new Response(body, { status: response.status, headers: response.headers });
    };
  });
  await page.goto('/chat');
  await expect(page.getByLabel('Message', { exact: true })).toBeEnabled();
  await page.getByLabel('Message', { exact: true }).fill('Read the saved details');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const answer = page.locator('bt-chat-bubble:not(.user) bt-rich-text');
  await expect(answer).toHaveText('The saved details are ready.');
  await expect.poll(() => connections).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(answer).toHaveCount(1);
  await expect(answer).toHaveText('The saved details are ready.');
});
