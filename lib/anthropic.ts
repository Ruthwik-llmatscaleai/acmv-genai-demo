import { createAnthropic, forwardAnthropicContainerIdFromLastStep } from '@ai-sdk/anthropic';

// Per-request header (set by the chat route) carrying comma-separated Anthropic
// Files API file_ids to expose to the code-execution container. The AI SDK has
// no content-part type for `container_upload`, so we inject the raw block into
// the outgoing request body here, at the HTTP boundary, after the SDK has
// validated/serialized the ModelMessage[]. This keeps the rich streaming UX.
const CONTAINER_FILES_HEADER = 'x-acmv-container-files';
const FILES_API_BETA = 'files-api-2025-04-14';

const acmvFetch: typeof fetch = async (input, init) => {
  try {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const fileIdsRaw = headers.get(CONTAINER_FILES_HEADER);

    if (fileIdsRaw && typeof init?.body === 'string') {
      const fileIds = fileIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const body = JSON.parse(init.body);

      if (Array.isArray(body?.messages) && fileIds.length > 0) {
        for (let i = body.messages.length - 1; i >= 0; i--) {
          if (body.messages[i]?.role !== 'user') continue;
          let content = body.messages[i].content;
          if (typeof content === 'string') content = [{ type: 'text', text: content }];
          if (!Array.isArray(content)) content = [];
          for (const fid of fileIds) content.push({ type: 'container_upload', file_id: fid });
          body.messages[i].content = content;
          break;
        }
      }

      // Ensure the Files API beta is present without clobbering existing betas.
      const existing = (headers.get('anthropic-beta') ?? '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const betas = new Set(existing);
      betas.add(FILES_API_BETA);
      headers.set('anthropic-beta', Array.from(betas).join(','));
      headers.delete(CONTAINER_FILES_HEADER);

      const url = input instanceof Request ? input.url : input;
      return fetch(url as string | URL, { ...init, headers, body: JSON.stringify(body) });
    }
  } catch (e) {
    console.error('[anthropic acmvFetch] container_upload injection failed:', e);
  }
  return fetch(input as Parameters<typeof fetch>[0], init);
};

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: acmvFetch,
});

export { forwardAnthropicContainerIdFromLastStep, CONTAINER_FILES_HEADER };
