"use client"

import { cn } from "@/lib/utils"
import type { ToolPart } from "@/components/prompt-kit/tool"
import type { Artifact } from "@/lib/artifacts"
import {
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
} from "@/components/ui/disclosure"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import {
  Globe,
  Code2,
  FileText,
  FolderOpen,
  Search,
  Terminal,
  Database,
  Wrench,
  CheckCircle,
  Loader2,
  XCircle,
  ChevronDown,
} from "lucide-react"
import { useState, type ReactNode } from "react"

// -- Icon mapping ----

function getToolIcon(toolName: string, state: string): ReactNode {
  const isProcessing = state === "input-streaming" || state === "input-available"
  const isError = state === "output-error"

  if (isProcessing) {
    return <Loader2 className="size-4 animate-spin text-blue-500" />
  }
  if (isError) {
    return <XCircle className="size-4 text-red-500" />
  }

  const name = toolName.toLowerCase()

  if (name === "web_search" || name === "web_fetch") {
    return <Globe className="size-4 text-blue-500" />
  }
  if (name === "code_execution") {
    return <Code2 className="size-4 text-violet-500" />
  }
  if (/read|view|get_file|write|create|edit/.test(name)) {
    return <FileText className="size-4 text-amber-500" />
  }
  if (/list|directory|folder/.test(name)) {
    return <FolderOpen className="size-4 text-amber-500" />
  }
  if (/search|find|query/.test(name)) {
    return <Search className="size-4 text-blue-500" />
  }
  if (/exec|run|shell|bash/.test(name)) {
    return <Terminal className="size-4 text-green-500" />
  }
  if (/database|sql|db/.test(name)) {
    return <Database className="size-4 text-emerald-500" />
  }

  return <Wrench className="size-4 text-muted-foreground" />
}

// -- Human-readable summary generation ---

const TOOL_ACTION_VERBS: Record<string, string> = {
  web_search: "Searched the web",
  web_fetch: "Fetched a webpage",
  code_execution: "Ran code",
}

const PATTERN_VERBS: [RegExp, string][] = [
  [/read|view|get_file/, "Read a file"],
  [/write|create/, "Created a file"],
  [/edit|update|modify/, "Edited a file"],
  [/list|directory|folder/, "Listed files"],
  [/search|find|query/, "Searched"],
  [/exec|run|shell|bash/, "Ran a command"],
  [/database|sql|db/, "Queried a database"],
]

function getToolActionVerb(toolName: string): string {
  if (TOOL_ACTION_VERBS[toolName]) return TOOL_ACTION_VERBS[toolName]
  const lower = toolName.toLowerCase()
  for (const [pattern, verb] of PATTERN_VERBS) {
    if (pattern.test(lower)) return verb
  }
  // Fallback: format tool name
  const formatted = toolName
    .replace(/^mcp_/, "")
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
  return `Used ${formatted}`
}

function generateTimelineSummary(tools: ToolPart[]): string {
  const seen = new Set<string>()
  const verbs: string[] = []
  for (const tool of tools) {
    const verb = getToolActionVerb(tool.type)
    if (!seen.has(verb)) {
      seen.add(verb)
      verbs.push(verb)
    }
  }
  if (verbs.length === 0) return "Used tools"
  if (verbs.length === 1) return verbs[0]
  if (verbs.length === 2) return `${verbs[0]} and ${verbs[1].toLowerCase()}`
  return verbs.slice(0, -1).join(", ") + `, and ${verbs[verbs.length - 1].toLowerCase()}`
}

// -- Format tool name for display ----

function formatToolName(name: string): string {
  const knownNames: Record<string, string> = {
    web_search: "Web Search",
    web_fetch: "Web Fetch",
    code_execution: "Code Execution",
  }
  if (knownNames[name]) return knownNames[name]
  return name
    .replace(/^mcp_/, "")
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// -- Format value for detail display ---

function formatValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return value
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

// -- ToolTimelineItem ----

interface ToolTimelineItemProps {
  toolPart: ToolPart
  isLast: boolean
  artifact?: Artifact
  onOpenArtifact?: (artifact: Artifact) => void
}

function ToolTimelineItem({ toolPart, isLast, artifact, onOpenArtifact }: ToolTimelineItemProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const { state, input, output, errorText } = toolPart
  const isProcessing = state === "input-streaming" || state === "input-available"
  const isError = state === "output-error"
  const hasDetails = (input && Object.keys(input).length > 0) || output || (isError && errorText)

  return (
    <div className="relative flex gap-3">
      {/* Vertical connecting line */}
      {!isLast && (
        <div
          className="absolute left-[9px] top-[22px] bottom-[-8px] w-px bg-border"
          aria-hidden
        />
      )}

      {/* Icon */}
      <div className="relative z-10 mt-0.5 flex size-[18px] shrink-0 items-center justify-center">
        {getToolIcon(toolPart.type, toolPart.state)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">
            {getToolActionVerb(toolPart.type)}
          </span>
          {isProcessing && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Artifact tag */}
        {artifact && onOpenArtifact && (
          <button
            type="button"
            onClick={() => onOpenArtifact(artifact)}
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5",
              "text-xs font-medium text-blue-600 dark:text-blue-400",
              "border border-blue-200 dark:border-blue-800",
              "bg-blue-50 dark:bg-blue-950/30",
              "hover:bg-blue-100 dark:hover:bg-blue-900/40",
              "transition-colors cursor-pointer"
            )}
          >
            <FileText className="size-3" />
            {artifact.title}
          </button>
        )}

        {/* Expandable details */}
        {hasDetails && (
          <Disclosure
            open={detailOpen}
            onOpenChange={setDetailOpen}
            className="mt-1"
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <DisclosureTrigger>
              <span
                className={cn(
                  "inline-flex cursor-pointer select-none items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted",
                  isError
                    ? "border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"
                    : isProcessing
                    ? "border-blue-300 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {isError ? "Error" : isProcessing ? "Running" : "Result"}
                {isProcessing && <Loader2 className="size-3 animate-spin" />}
                <ChevronDown className={cn("size-3 transition-transform duration-200", detailOpen && "rotate-180")} />
              </span>
            </DisclosureTrigger>
            <DisclosureContent>
              <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-muted/40 dark:bg-zinc-900/40">
                {input && Object.keys(input).length > 0 && (
                  <div className="max-h-40 overflow-auto p-3">
                    <div className="text-muted-foreground mb-2 text-xs font-medium">Input</div>
                    <pre className="font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                      {formatValue(input)}
                    </pre>
                  </div>
                )}
                {(isError && errorText) || output ? (
                  <>
                    {input && Object.keys(input).length > 0 && <div className="border-t border-border" />}
                    <div className="max-h-40 overflow-auto p-3">
                      {isError && errorText ? (
                        <>
                          <div className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">Error</div>
                          <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-red-700 dark:text-red-300">
                            {errorText}
                          </pre>
                        </>
                      ) : output ? (
                        <>
                          <div className="text-muted-foreground mb-2 text-xs font-medium">Output</div>
                          <pre className="font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                            {formatValue(output)}
                          </pre>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {state === "input-available" && !output && !errorText && (
                  <>
                    {input && Object.keys(input).length > 0 && <div className="border-t border-border" />}
                    <div className="text-muted-foreground flex items-center gap-1.5 p-3 text-xs">
                      <Loader2 className="size-3 animate-spin" />
                      Executing...
                    </div>
                  </>
                )}
              </div>
            </DisclosureContent>
          </Disclosure>
        )}
      </div>
    </div>
  )
}

// -- ToolTimelineDone ----

function ToolTimelineDone({ isRunning, errorCount }: { isRunning: boolean; errorCount: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-[18px] shrink-0 items-center justify-center">
        {isRunning ? (
          <Loader2 className="size-4 animate-spin text-blue-500" />
        ) : (
          <CheckCircle className="size-4 text-green-500" />
        )}
      </div>
      <span className="text-sm text-muted-foreground">
        {isRunning
          ? "Running..."
          : errorCount > 0
          ? `Done (${errorCount} ${errorCount === 1 ? "error" : "errors"})`
          : "Done"}
      </span>
    </div>
  )
}

// -- ToolTimeline (main component) ---

export interface ToolTimelineProps {
  tools: ToolPart[]
  isStreaming: boolean
  artifacts?: Artifact[]
  onOpenArtifact?: (artifact: Artifact) => void
  defaultOpen?: boolean
}

export function ToolTimeline({
  tools,
  isStreaming,
  artifacts = [],
  onOpenArtifact,
  defaultOpen = false,
}: ToolTimelineProps) {
  const [open, setOpen] = useState(defaultOpen)

  const allCompleted = tools.every(
    (t) => t.state === "output-available" || t.state === "output-error"
  )
  const hasError = tools.some((t) => t.state === "output-error")
  const errorCount = tools.filter((t) => t.state === "output-error").length
  const completedCount = tools.filter(
    (t) => t.state === "output-available" || t.state === "output-error"
  ).length
  const isRunning = !allCompleted && isStreaming

  const summary = generateTimelineSummary(tools)

  // Match artifacts to tool calls by toolCallId in artifact metadata
  // Simple heuristic: if an artifact was produced during this tool group,
  // attach it to the last completed tool
  const getArtifactForTool = (_tool: ToolPart, _index: number): Artifact | undefined => {
    // For now, artifacts are shown separately after text.
    // This can be enhanced later with toolCallId-based matching.
    return undefined
  }

  return (
    <div className="my-2">
      {/* Trigger row */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2 text-sm transition-colors",
          "text-muted-foreground hover:text-foreground"
        )}
      >
        {/* Status icon */}
        <span className="relative inline-flex size-4 items-center justify-center">
          <span className={cn("transition-opacity", "group-hover:opacity-0")}>
            {isRunning ? (
              <Loader2 className="size-4 animate-spin text-blue-500" />
            ) : hasError ? (
              <XCircle className="size-4 text-red-500" />
            ) : (
              <CheckCircle className="size-4 text-green-500" />
            )}
          </span>
          <ChevronDown
            className={cn(
              "absolute size-4 opacity-0 transition-[transform,opacity] duration-200 group-hover:opacity-100",
              open && "rotate-180"
            )}
          />
        </span>

        {/* Summary text */}
        <span>
          {isRunning ? (
            <TextShimmer duration={2}>
              {completedCount > 0
                ? `${summary} (${completedCount}/${tools.length})...`
                : `${summary}...`}
            </TextShimmer>
          ) : (
            summary
          )}
        </span>
      </button>

      {/* Expandable timeline content */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-3 pl-0.5">
            {tools.map((toolPart, idx) => (
              <ToolTimelineItem
                key={toolPart.toolCallId || `tool-${idx}`}
                toolPart={toolPart}
                isLast={idx === tools.length - 1}
                artifact={getArtifactForTool(toolPart, idx)}
                onOpenArtifact={onOpenArtifact}
              />
            ))}
            <ToolTimelineDone isRunning={isRunning} errorCount={errorCount} />
          </div>
        </div>
      </div>
    </div>
  )
}
