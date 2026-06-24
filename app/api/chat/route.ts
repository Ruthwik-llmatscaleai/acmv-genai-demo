import { NextRequest, NextResponse } from 'next/server';
import { streamText, convertToModelMessages, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { anthropic, forwardAnthropicContainerIdFromLastStep, CONTAINER_FILES_HEADER } from '@/lib/anthropic';
import { addMessage } from '@/lib/storage';
import { loadActiveMcpToolsWithDescriptions } from '@/lib/mcp-client';
import { requireAuth } from '@/lib/auth-middleware';
import { getAnthropicFilesClient } from '@/lib/anthropic-files';
import { toFile } from '@anthropic-ai/sdk';
import { loadPipelineFiles, type TaskId } from '@/lib/pipeline-orchestrator';
import { getPipelineResult, storePipelineResult } from '@/lib/storage';
import { buildSystemPromptWithTools } from '@/lib/system-prompts';
import { fitMessagesToContextWindow } from '@/lib/context-window';
import { validate, ChatRequestSchema, formatValidationErrors } from '@/lib/validation';

export const maxDuration = 300;

// Models that support adaptive thinking (type: "adaptive" + effort)
const ADAPTIVE_THINKING_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
];

// Models that support manual thinking (type: "enabled" + budgetTokens)
const MANUAL_THINKING_MODELS = [
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
];

function getThinkingMode(modelId: string): 'adaptive' | 'manual' | 'none' {
  if (ADAPTIVE_THINKING_MODELS.includes(modelId)) return 'adaptive';
  if (MANUAL_THINKING_MODELS.includes(modelId)) return 'manual';
  return 'none';
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    // Issue 2: Validate request body with Zod schema
    const body = await req.json();
    const validation = validate(ChatRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatValidationErrors(validation.errors!) },
        { status: 400 }
      );
    }
    const {
      messages: uiMessages,
      model: requestedModel,
      enableReasoning = true,
      conversationId,
      webSearch = false,
      activeMcpIds = [],
      attachments = [],
    } = validation.data!;

    // Use the model ID directly (frontend sends full Bedrock model IDs)
    const modelId = requestedModel || 'claude-sonnet-4-5-20250929';

    // Check if reasoning should be enabled for this model
    const thinkingMode = enableReasoning ? getThinkingMode(modelId) : 'none';

    // Get the last user message to save to database
    const lastUserMessage = uiMessages[uiMessages.length - 1];

    // Save user message to database if we have a conversation
    if (conversationId && lastUserMessage?.role === 'user') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts = lastUserMessage.parts as any[] | undefined;
      const userContent = parts
        ?.filter((p: { type: string }) => p.type === 'text')
        .map((p: { text?: string }) => p.text || '')
        .join('') || lastUserMessage.content || '';

      if (userContent) {
        await addMessage(conversationId, {
          role: 'user',
          content: userContent,
          parts: lastUserMessage.parts,
        });
      }
    }

    // Build tools object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    // Code execution - always enabled
    tools.code_execution = anthropic.tools.codeExecution_20250825();

    // Web search + web fetch - controlled by existing webSearch toggle
    if (webSearch) {
      tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 5 });
      tools.web_fetch = anthropic.tools.webFetch_20250910({
        maxUses: 3,
      });
    }

    // Track MCP tool descriptions for system prompt
    let mcpToolDescriptions: { name: string; description: string }[] = [];

    // DEBUG: Log the activeMcpIds received from frontend
    console.log(`[Chat] activeMcpIds from request:`, JSON.stringify(activeMcpIds));

    // Load MCP tools if any connections are active
    if (activeMcpIds && activeMcpIds.length > 0) {
      console.log(`[Chat] Attempting to load MCP tools from ${activeMcpIds.length} connections:`, activeMcpIds);
      try {
        const { tools: mcpTools, descriptions } = await loadActiveMcpToolsWithDescriptions(activeMcpIds);
        const mcpToolCount = Object.keys(mcpTools).length;
        if (mcpToolCount > 0) {
          Object.assign(tools, mcpTools);
          mcpToolDescriptions = descriptions;
          console.log(`[Chat] Successfully loaded ${mcpToolCount} MCP tools:`, Object.keys(mcpTools));
          console.log(`[Chat] MCP tool descriptions for prompt:`, descriptions.map(d => d.name));
        } else {
          console.log(`[Chat] No MCP tools loaded. Ensure connections are tested and tools are discovered.`);
        }
      } catch (error) {
        console.error('[Chat] Error loading MCP tools:', error);
      }
    }

    // Sanitize conversation history before conversion. Provider-executed tool
    // parts (code_execution, web_search/fetch) and other non-text parts from
    // PRIOR assistant turns are persisted without the shape convertToModelMessages
    // requires, so replaying them throws "messages do not match the ModelMessage[]
    // schema". Reduce assistant turns to their text/reasoning (the analysis the
    // model needs is in the text); keep user turns intact.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitizedUiMessages = (uiMessages as any[]).map((m) => {
      if (!m || m.role !== 'assistant' || !Array.isArray(m.parts)) return m;
      const kept = m.parts.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p && (p.type === 'text' || p.type === 'reasoning') && typeof p.text === 'string' && p.text.length > 0
      );
      return { ...m, parts: kept.length > 0 ? kept : [{ type: 'text', text: String(m.content ?? '') || '(no content)' }] };
    });

    // Convert UI messages to model messages format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await convertToModelMessages(sanitizedUiMessages as any);

    // Make uploaded files available to the code-execution container.
    // Files were pushed to the Anthropic Files API by /api/files/upload. The raw
    // `container_upload` blocks are injected at the HTTP boundary (lib/anthropic
    // acmvFetch) via the CONTAINER_FILES_HEADER set below — the AI SDK has no
    // content-part type for them. We also attach the predefined task pipeline from
    // S3 (deterministic preprocess + KPIs) so the model runs it instead of
    // re-deriving the analysis, and add a text hint naming the files + instruction.
    const containerFileIds: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detected = attachments && attachments.length > 0 ? attachments.find((a: any) => a.taskType) : undefined;
    if (attachments && attachments.length > 0) {
      containerFileIds.push(...attachments.map((a) => a.fileId));

      // Attach the predefined pipeline for the detected task (if any).
      let pipelineNote = '';
      if (detected?.taskType) {
        try {
          // Check if we already have results for this conversation
          const existingResult = conversationId
            ? await getPipelineResult(conversationId)
            : null;

          const filesClient = getAnthropicFilesClient();

          if (existingResult) {
            // Inject kpis.json directly — no need to re-run pipeline
            const kpisUploadable = await toFile(
              Buffer.from(JSON.stringify(existingResult.kpis, null, 2), 'utf8'),
              'kpis.json',
              { type: 'application/json' }
            );
            const kpisUp = await filesClient.beta.files.upload(
              { file: kpisUploadable },
              { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
            );
            containerFileIds.push(kpisUp.id);
            pipelineNote = `\n\nPrevious analysis results (kpis.json) are in the working directory. Answer from these results directly. Only re-run the pipeline if the user uploads NEW data.`;
            console.log(`[Chat] injected cached kpis.json for ${conversationId}`);
          } else {
            // First time — inject full pipeline files
            const pipelineFiles = await loadPipelineFiles(detected.taskType as TaskId);
            if (pipelineFiles) {
              for (const [, file] of Object.entries(pipelineFiles) as [string, { filename: string; code: string }][]) {
                const uploadable = await toFile(
                  Buffer.from(file.code, 'utf8'),
                  file.filename,
                  { type: file.filename.endsWith('.py') ? 'text/x-python' : (file.filename.endsWith('.html') ? 'text/html' : 'application/json') }
                );
                const up = await filesClient.beta.files.upload(
                  { file: uploadable },
                  { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
                );
                containerFileIds.push(up.id);
              }

              const dataName = detected.filename;
              pipelineNote =
                `\n\nPipeline files are in the working directory for ${detected.taskType}:` +
                `\n- template_${detected.taskType}.py (fixed math — run this on the data)` +
                `\n- schema.json (template — inspect data columns and fill this as schema_filled.json)` +
                `\n- view_schema.json (template — fill this as view_filled.json after getting kpis)` +
                `\n- renderer.html + render_view.py (rendering — run after view_filled.json is ready)` +
                `\n\nFollow the Pipeline Execution Protocol in your instructions. Data file: "${dataName}"`;
              console.log(`[Chat] attached ${Object.keys(pipelineFiles).length} pipeline files for ${detected.taskType}`);
            }
          }
        } catch (e) {
          console.error('[Chat] pipeline attach failed:', (e as Error).message);
        }
      }

      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role !== 'user') continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = messages[i] as any;
        const content = Array.isArray(msg.content)
          ? msg.content
          : [{ type: 'text', text: String(msg.content ?? '') }];
        const names = attachments.map((a) => a.filename).join(', ');
        content.push({
          type: 'text',
          text: `\n\n[Uploaded file(s) available in the code-execution working directory: ${names}. Open them by filename with pandas/openpyxl.]${pipelineNote}`,
        });
        msg.content = content;
        break;
      }
    }

    // Log available tools
    const toolNames = Object.keys(tools);
    const hasTools = toolNames.length > 0;
    console.log(`[Chat] Available tools (${toolNames.length}):`, toolNames);

    // Build dynamic system prompt with available tools
    let systemPrompt = buildSystemPromptWithTools(toolNames, mcpToolDescriptions);
    console.log(`[Chat] System prompt includes ${mcpToolDescriptions.length} MCP tool descriptions`);

    // Inject stored kpis.json into system prompt for follow-up queries
    if (conversationId) {
      const storedResult = await getPipelineResult(conversationId);
      if (storedResult) {
        systemPrompt += `\n\n## Analysis Results (source of truth — cite numbers from here)\n\`\`\`json\n${JSON.stringify(storedResult.kpis, null, 2)}\n\`\`\`\n\nFor follow-up questions, answer directly from these pre-computed results. Do NOT re-run the pipeline unless the user uploads a new file.`;
      }
    }

    // Fit messages within the context window (trim tool results + drop old groups)
    const fittedMessages = fitMessagesToContextWindow(messages, systemPrompt);

    // Build streamText configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamConfig: Record<string, any> = {
      model: anthropic(modelId),
      system: systemPrompt,
      messages: fittedMessages,
      maxTokens: 65536,
      ...(thinkingMode !== 'none' ? {} : { temperature: 0.7 }),
      // Log tool calls for debugging - this is called after each step (including tool executions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onStepFinish: (event: any) => {
        console.log(`[Chat] ========== STEP FINISHED ==========`);
        console.log(`[Chat] Step type: ${event.stepType}`);
        console.log(`[Chat] Finish reason: ${event.finishReason}`);

        if (event.toolCalls && event.toolCalls.length > 0) {
          console.log(`[Chat] Tool calls made:`, event.toolCalls.map((tc: Record<string, unknown>) => ({
            name: tc.toolName,
            args: JSON.stringify(tc.args ?? {}).substring(0, 200)
          })));
        }

        if (event.toolResults && event.toolResults.length > 0) {
          console.log(`[Chat] Tool results received:`);
          event.toolResults.forEach((tr: Record<string, unknown>, i: number) => {
            const trResult = tr.result;
            const resultStr = trResult === undefined || trResult === null
              ? '(no result)'
              : typeof trResult === 'string'
                ? trResult.substring(0, 300)
                : JSON.stringify(trResult).substring(0, 300);
            console.log(`[Chat]   Result ${i + 1} (${tr.toolName || 'unknown'}):`, resultStr);
            // Log file_ids from code execution results
            if (trResult && typeof trResult === 'object') {
              const resultObj = trResult as Record<string, unknown>;
              const content = resultObj.content as Array<Record<string, unknown>> | undefined;
              if (content && Array.isArray(content) && content.length > 0) {
                const fileIds = content.filter(c => c.file_id).map(c => c.file_id);
                if (fileIds.length > 0) {
                  console.log(`[Chat]   File IDs in result:`, fileIds);
                }
              }
            }
          });
        }

        if (event.text) {
          console.log(`[Chat] Text generated: ${event.text.substring(0, 200)}...`);
        }
        console.log(`[Chat] ========================================`);
      },
    };

    // Add tools if any are defined
    if (hasTools) {
      streamConfig.tools = tools;
      // Enable multi-step tool calls - model continues after tool results until done
      streamConfig.stopWhen = stepCountIs(20);
      console.log(`[Chat] Tools attached to model config:`, Object.keys(tools));
    }

    // Build anthropic provider options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anthropicOptions: Record<string, any> = {};

    if (thinkingMode === 'adaptive') {
      anthropicOptions.thinking = { type: 'adaptive' };
      // For Opus 4.6 use 'max', for Sonnet 4.6 use 'high' (max is Opus-only)
      const effort = modelId === 'claude-opus-4-6' ? 'max' : 'high';
      anthropicOptions.effort = effort;
      console.log(`[Chat] Adaptive thinking enabled (effort: ${effort})`);
    } else if (thinkingMode === 'manual') {
      anthropicOptions.thinking = { type: 'enabled', budgetTokens: 16000 };
      console.log(`[Chat] Manual thinking enabled (budget: 16000)`);
    }

    // Agent skills for code execution (always enabled)
    anthropicOptions.container = {
      skills: [
        { type: 'anthropic', skillId: 'pptx', version: 'latest' },
        { type: 'anthropic', skillId: 'docx', version: 'latest' },
        { type: 'anthropic', skillId: 'pdf', version: 'latest' },
        { type: 'anthropic', skillId: 'xlsx', version: 'latest' },
      ],
    };

    // Enable prompt caching for 90% input token savings on repeat turns
    anthropicOptions.cacheControl = { type: 'ephemeral' };

    streamConfig.providerOptions = { anthropic: anthropicOptions };

    // Pass uploaded file_ids (data + predefined pipeline) to the provider fetch
    // wrapper, which injects the raw `container_upload` blocks + Files API beta.
    if (containerFileIds.length > 0) {
      streamConfig.headers = {
        [CONTAINER_FILES_HEADER]: containerFileIds.join(','),
      };
      console.log(`[Chat] container files -> ${containerFileIds.join(',')}`);
    }

    // Propagate container ID between steps for code execution continuity
    streamConfig.prepareStep = forwardAnthropicContainerIdFromLastStep;

    // Create the streaming response using createUIMessageStream
    // This keeps the HTTP response open so we can merge the AI stream,
    // then write file-download data chunks after completion - all in one response.
    // DB persistence uses onFinish which receives responseMessage.parts — the exact
    // parts the client saw (including step-start, interleaved text/tool parts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText(streamConfig as any);

    // Issue 18: Ensure backend completes even if client disconnects
    result.consumeStream();

    // Shared state between execute and onFinish
    const fileDownloadParts: Array<Record<string, unknown>> = [];

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // 1. Merge AI stream (tokens flow to client in real-time)
        writer.merge(result.toUIMessageStream({ sendReasoning: true, sendSources: true }));

        // 2. Wait for completion
        const [, , steps] = await Promise.all([
          result.text, result.reasoning, result.steps,
        ]);

        // 3. Extract file_ids from code_execution outputs and write to stream
        if (conversationId && steps && steps.length > 0) {
          const fileDownloads: Array<{ fileId: string; filename: string; mimeType: string; sizeBytes: number }> = [];
          const seenFileIds = new Set<string>();

          const extractFileIds = (output: unknown) => {
            if (!output || typeof output !== 'object') return;
            const obj = output as Record<string, unknown>;

            if (typeof obj.file_id === 'string' && obj.file_id.startsWith('file_') && !seenFileIds.has(obj.file_id)) {
              seenFileIds.add(obj.file_id);
              fileDownloads.push({
                fileId: obj.file_id,
                filename: (obj.file_name as string) || (obj.filename as string) || 'download',
                mimeType: (obj.file_type as string) || (obj.mime_type as string) || 'application/octet-stream',
                sizeBytes: (obj.file_size as number) || (obj.size_bytes as number) || 0,
              });
            }

            const content = obj.content as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (typeof block.file_id === 'string' && block.file_id.startsWith('file_') && !seenFileIds.has(block.file_id)) {
                  seenFileIds.add(block.file_id);
                  fileDownloads.push({
                    fileId: block.file_id,
                    filename: (block.file_name as string) || (block.filename as string) || 'download',
                    mimeType: (block.file_type as string) || (block.mime_type as string) || 'application/octet-stream',
                    sizeBytes: (block.file_size as number) || (block.size_bytes as number) || 0,
                  });
                }
              }
            }
          };

          // Scan tool results for file IDs
          for (const step of steps) {
            if (step.toolResults) {
              for (const tr of step.toolResults) {
                const trAny = tr as Record<string, unknown>;
                extractFileIds(trAny.result);
                extractFileIds(trAny.output);
              }
            }
          }

          // Deduplicate by filename — code execution often produces intermediate
          // and final versions of the same file with different file_ids.
          // Keep the last file_id per filename (the final version).
          const fileByName = new Map<string, typeof fileDownloads[0]>();
          for (const file of fileDownloads) {
            fileByName.set(file.filename, file);
          }
          const uniqueFiles = Array.from(fileByName.values());

          // Enrich with metadata from Files API and write data chunks to stream
          for (const file of uniqueFiles) {
            try {
              const client = getAnthropicFilesClient();
              const metadata = await client.beta.files.retrieveMetadata(file.fileId);
              if (metadata.filename) file.filename = metadata.filename;
              if (metadata.mime_type) file.mimeType = metadata.mime_type;
              if (metadata.size_bytes) file.sizeBytes = metadata.size_bytes;
            } catch {
              // Use what we have from the output
            }

            console.log(`[Chat] File download: ${file.fileId} (${file.filename})`);

            // Write file-download data chunk through the SSE stream
            writer.write({
              type: 'data-fileDownload',
              data: {
                fileId: file.fileId,
                filename: file.filename,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
              },
            });

            // Save for DB persistence in onFinish
            fileDownloadParts.push({
              type: 'file-download',
              fileId: file.fileId,
              filename: file.filename,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
            });
          }
        }
      },
      onFinish: async ({ responseMessage }) => {
        // Persist the message to DB using the exact parts the client received.
        // responseMessage.parts has step-start, text, tool-*, reasoning parts
        // in the correct interleaved order — matching what the streaming view showed.
        if (!conversationId) return;

        try {
          // Convert the streaming parts to a serializable format for DB storage
          const streamParts = Array.isArray(responseMessage.parts) ? responseMessage.parts : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbParts: Array<Record<string, unknown>> = streamParts.map((part: any) => {
            const partType = part.type as string;

            if (partType === 'text') {
              return { type: 'text', text: part.text || '' };
            }

            if (partType === 'reasoning') {
              return { type: 'reasoning', text: part.text || '' };
            }

            if (partType === 'step-start') {
              return { type: 'step-start' };
            }

            if (partType?.startsWith('tool-')) {
              return {
                type: partType,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input ?? part.args ?? {},
                output: part.output ?? part.result ?? undefined,
                state: part.state || 'output-available',
              };
            }

            if (partType === 'dynamic-tool') {
              return {
                type: `tool-${part.toolName || 'unknown'}`,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input ?? part.args ?? {},
                output: part.output ?? part.result ?? undefined,
                state: part.state || 'output-available',
              };
            }

            if (partType?.startsWith('data-')) {
              // data-fileDownload parts are handled separately
              return null;
            }

            // Pass through other parts (source-url, source-document, file, etc.)
            return { ...part };
          }).filter(Boolean) as Array<Record<string, unknown>>;

          // Append file-download parts at the end
          dbParts.push(...fileDownloadParts);

          // Extract plain text for the content field
          const text = await result.text;
          const reasoning = await result.reasoning;
          const steps = await result.steps;

          // Ensure we have at least one part
          if (dbParts.length === 0 && text) {
            dbParts.push({ type: 'text', text });
          }

          const message = await addMessage(conversationId, {
            role: 'assistant',
            content: text || '',
            parts: dbParts.length > 0 ? dbParts : [{ type: 'text', text: text || '' }],
            metadata: {
              reasoning: reasoning || null,
              stepsCount: steps?.length || 0,
              model: modelId,
            },
          });

          // Store pipeline result if the model produced kpis.json
          if (detected?.taskType) {
            try {
              const kpisMatch = text.match(/```json\n(\{[\s\S]*?"task"[\s\S]*?\})\n```/);
              if (kpisMatch) {
                const kpis = JSON.parse(kpisMatch[1]);
                if (kpis.task || kpis.level1_raw || kpis.level2_derived) {
                  await storePipelineResult(conversationId, detected.taskType, kpis);
                  console.log('[Chat] Stored pipeline result for', conversationId);
                }
              }
            } catch {
              // Best effort — don't fail the response
            }
          }

        } catch (error) {
          console.error('[Chat] Error persisting message:', error);
        }
      },
      onError: (error) => {
        console.error('[Stream] Error:', error);
        if (error == null) return 'An unknown error occurred.';
        if (typeof error === 'string') return error;
        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('rate_limit') || msg.includes('rate limit')) return 'Rate limit exceeded. Please wait a moment and try again.';
          if (msg.includes('overloaded') || msg.includes('529')) return 'The model is currently overloaded. Please try again in a few moments.';
          if (msg.includes('invalid_api_key') || msg.includes('authentication')) return 'API authentication error. Please check your API key in settings.';
          if (msg.includes('credit') || msg.includes('billing')) return 'Billing issue detected. Please check your Anthropic account.';
          return error.message;
        }
        return JSON.stringify(error);
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// GET endpoint to return available models
export async function GET() {
  const models = [
    {
      id: 'claude-opus-4-6',
      name: 'Claude 4.6 Opus',
      description: 'Most powerful model with adaptive thinking',
      supportsReasoning: true,
    },
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude 4.6 Sonnet',
      description: 'Fast and intelligent with adaptive thinking',
      supportsReasoning: true,
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude 4.5 Sonnet',
      description: 'Most intelligent, best for complex tasks with extended thinking',
      supportsReasoning: true,
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude 4.5 Haiku',
      description: 'Fast and efficient with thinking capabilities',
      supportsReasoning: true,
    },
    {
      id: 'claude-opus-4-5-20251101',
      name: 'Claude 4.5 Opus',
      description: 'Most capable model for complex reasoning and analysis',
      supportsReasoning: true,
    },
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude 4 Opus',
      description: 'Advanced reasoning and deep analysis',
      supportsReasoning: true,
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude 4 Sonnet',
      description: 'Balanced performance with reasoning support',
      supportsReasoning: true,
    },
  ];

  return Response.json({
    models,
    defaultModel: 'claude-sonnet-4-5-20250929'
  });
}
