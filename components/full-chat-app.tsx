"use client"

import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message"
// PromptInput components replaced by ClaudeChatInput
import { ScrollButton } from "@/components/prompt-kit/scroll-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// Tooltip imports removed - now handled by ClaudeChatInput
import { Switch } from "@/components/ui/switch"
// Label removed - using plain <label> in McpConnectionsSubmenu
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useChat } from "@ai-sdk/react"
import { type UIMessage, DefaultChatTransport } from "ai"
import {
  BarChart3,
  BookOpen,
  ChevronUp,
  Code2,
  Copy,
  Factory,
  FolderOpen,
  Gauge,
  Home,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Settings,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash,
  User2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboardShortcuts, CHAT_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts"
import { motion, AnimatePresence } from "motion/react"
import { createFileArtifact, type Artifact } from "@/lib/artifacts"
import { extractTagArtifacts, segmentMessageText } from "@/lib/artifact-parser"
import { ArtifactTile } from "@/components/prompt-kit/artifact-tile"
import { isPreviewableFile } from "@/lib/file-classifier"
import { useFileContent } from "@/hooks/use-file-content"
// ArtifactTile removed — artifacts now open directly in preview panel
import { ArtifactPreview } from "@/components/artifact-preview"
import { ArtifactPanelWrapper } from "@/components/artifact-panel-wrapper"
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels"
import { extractToolParts, type ToolPart } from "@/components/prompt-kit/tool"
import { Loader } from "@/components/prompt-kit/loader"
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/prompt-kit/reasoning"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { FeedbackBar } from "@/components/prompt-kit/feedback-bar"
// PromptSuggestion replaced by inline chips in welcome state
import { SystemMessage } from "@/components/prompt-kit/system-message"
import { StreamingText } from "@/components/prompt-kit/streaming-text"
import { Markdown } from "@/components/prompt-kit/markdown"
import { ToolTimeline } from "@/components/prompt-kit/tool-timeline"
import { FileCard } from "@/components/prompt-kit/file-card"
import { ClaudeChatInput, type ClaudeChatInputHandle } from "@/components/ui/claude-style-chat-input"
import { SettingsModal } from "@/components/settings-modal"
// Image import removed - welcome state no longer uses logo

// Time-based greeting helper
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  if (hour >= 17 && hour < 21) return "Good evening"
  return "Hey there"
}

// Claude 4.6 and 4.5 series models
const CLAUDE_MODELS = [
  {
    id: "claude-opus-4-6",
    name: "Claude 4.6 Opus",
    description: "Most powerful with adaptive thinking",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude 4.6 Sonnet",
    description: "Fast and intelligent with adaptive thinking",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude 4.5 Sonnet",
    description: "Most intelligent model, best for complex tasks",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude 4.5 Haiku",
    description: "Fast and efficient for simple tasks",
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude 4.5 Opus",
    description: "Best for complex reasoning and analysis",
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude 4 Sonnet",
    description: "Balanced performance and speed",
  },
] as const

// Tagline removed - welcome state now uses time-based greeting

type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]

// Database conversation type
interface Conversation {
  id: string
  title: string
  isPinned: boolean
  isShared: boolean
  model: string
  createdAt: string
  updatedAt: string
  lastMessage: string | null
}

const AUTH_SESSION_KEY = "llmatscale_auth_session"
const AUTH_TOKEN_KEY = "llmatscale_auth_token"

// Helper function to get auth headers for API calls
function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) || "" : ""
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

// Helper function to get user name from session
function getUserNameFromSession(): string {
  if (typeof window === 'undefined') return "User"
  try {
    const sessionData = localStorage.getItem(AUTH_SESSION_KEY)
    if (sessionData) {
      const session = JSON.parse(sessionData)
      return session.user?.name || session.user?.email?.split('@')[0] || "User"
    }
  } catch {
    // Ignore parse errors
  }
  return "User"
}

// Helper function to get user email from session
function getUserEmailFromSession(): string {
  if (typeof window === 'undefined') return ""
  try {
    const sessionData = localStorage.getItem(AUTH_SESSION_KEY)
    if (sessionData) {
      const session = JSON.parse(sessionData)
      return session.user?.email || ""
    }
  } catch {
    // Ignore parse errors
  }
  return ""
}


// Badge colors for MCP connection initials
const MCP_BADGE_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
]

// MCP Connections Submenu Component - Claude.ai Connectors style
function McpConnectionsSubmenu({
  activeMcpIds,
  onToggle,
  onManageConnectors,
}: {
  activeMcpIds: string[]
  onToggle: (connectionId: string, isActive: boolean) => void
  onManageConnectors?: () => void
}) {
  const [connections, setConnections] = useState<{
    id: string
    name: string
    status: string
    availableTools?: { name: string }[]
  }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const res = await fetch("/api/mcp/connections", {
          headers: getAuthHeaders(),
        })
        if (res.ok) {
          const data = await res.json()
          setConnections(data)
        }
      } catch {
        // Silently fail - MCP connections are optional
      } finally {
        setIsLoading(false)
      }
    }
    fetchConnections()
  }, [])

  const connectedConnections = connections.filter((c) => c.status === "connected")

  if (isLoading) {
    return (
      <div className="space-y-2 px-3 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <div className="h-4 w-4 shrink-0 rounded bg-muted animate-pulse" />
            <div className="h-3.5 flex-1 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          </div>
        ))}
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <>
        <div className="px-3 py-4 text-center">
          <p className="text-[13px] text-text-500">No connectors configured</p>
        </div>
        <div className="border-t border-border dark:border-sidebar-border" />
        <button
          onClick={onManageConnectors}
          className="flex items-center gap-3 px-3 py-2.5 mx-1 my-1 rounded-lg text-[14px] text-text-200 dark:text-foreground hover:bg-bg-hover dark:hover:bg-bg-hover transition-colors cursor-pointer w-[calc(100%-8px)]"
          type="button"
        >
          <Settings className="h-[18px] w-[18px] text-text-300 dark:text-text-500" />
          Manage connectors
        </button>
      </>
    )
  }

  if (connectedConnections.length === 0) {
    return (
      <>
        <div className="px-3 py-4 text-center">
          <p className="text-[13px] text-text-500">No connected servers</p>
        </div>
        <div className="border-t border-border dark:border-sidebar-border" />
        <button
          onClick={onManageConnectors}
          className="flex items-center gap-3 px-3 py-2.5 mx-1 my-1 rounded-lg text-[14px] text-text-200 dark:text-foreground hover:bg-bg-hover dark:hover:bg-bg-hover transition-colors cursor-pointer w-[calc(100%-8px)]"
          type="button"
        >
          <Settings className="h-[18px] w-[18px] text-text-300 dark:text-text-500" />
          Manage connectors
        </button>
      </>
    )
  }

  return (
    <>
      {connectedConnections.map((connection, idx) => {
        const isActive = activeMcpIds.includes(connection.id)
        const initial = connection.name.charAt(0).toUpperCase()
        const badgeColor = MCP_BADGE_COLORS[idx % MCP_BADGE_COLORS.length]

        return (
          <div
            key={connection.id}
            className="flex items-center gap-3 px-3 py-2 mx-1 rounded-lg hover:bg-bg-hover dark:hover:bg-bg-hover transition-colors"
          >
            {/* Initial badge */}
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${badgeColor}`}>
              {initial}
            </div>
            {/* Name */}
            <span
              className="flex-1 text-[14px] text-text-200 dark:text-foreground truncate cursor-default"
              title={connection.name}
            >
              {connection.name}
            </span>
            {/* Toggle */}
            <Switch
              id={`mcp-plus-${connection.id}`}
              checked={isActive}
              onCheckedChange={(checked) => onToggle(connection.id, checked)}
              className="shrink-0"
            />
          </div>
        )
      })}
      <div className="my-1 border-t border-border dark:border-sidebar-border" />
      <button
        onClick={onManageConnectors}
        className="flex items-center gap-3 px-3 py-2.5 mx-1 mb-1 rounded-lg text-[14px] text-text-200 dark:text-foreground hover:bg-bg-hover dark:hover:bg-bg-hover transition-colors cursor-pointer w-[calc(100%-8px)]"
        type="button"
      >
        <Settings className="h-[18px] w-[18px] text-text-300 dark:text-text-500" />
        Manage connectors
      </button>
    </>
  )
}

function ChatSidebar({
  conversations,
  selectedId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onPinConversation,
  onShareConversation,
  userName,
  userEmail,
  onOpenSettings,
}: {
  conversations: Conversation[]
  selectedId: string | null
  onSelectConversation: (id: string) => void
  onNewChat: () => void
  onDeleteConversation: (id: string) => void
  onPinConversation: (id: string, isPinned: boolean) => void
  onShareConversation: (id: string) => void
  userName: string
  userEmail: string
  onOpenSettings: () => void
}) {
  const router = useRouter()

  const handleSignOut = () => {
    window.localStorage.removeItem(AUTH_SESSION_KEY)
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    router.push("/")
  }

  // Ensure conversations is always an array
  const safeConversations = Array.isArray(conversations) ? conversations : []
  const pinnedConversations = safeConversations.filter((c) => c.isPinned)
  const unpinnedConversations = safeConversations.filter((c) => !c.isPinned)

  // Group unpinned conversations by time period
  const groupedConversations = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const startOf7DaysAgo = new Date(startOfToday)
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7)
    const startOf14DaysAgo = new Date(startOfToday)
    startOf14DaysAgo.setDate(startOf14DaysAgo.getDate() - 14)
    const startOf30DaysAgo = new Date(startOfToday)
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30)

    const groups: { label: string; conversations: Conversation[] }[] = [
      { label: 'Today', conversations: [] },
      { label: 'Yesterday', conversations: [] },
      { label: 'Previous 7 days', conversations: [] },
      { label: 'Previous 14 days', conversations: [] },
      { label: 'Previous 30 days', conversations: [] },
      { label: 'Older', conversations: [] },
    ]

    for (const conv of unpinnedConversations) {
      const date = new Date(conv.updatedAt)
      if (date >= startOfToday) {
        groups[0].conversations.push(conv)
      } else if (date >= startOfYesterday) {
        groups[1].conversations.push(conv)
      } else if (date >= startOf7DaysAgo) {
        groups[2].conversations.push(conv)
      } else if (date >= startOf14DaysAgo) {
        groups[3].conversations.push(conv)
      } else if (date >= startOf30DaysAgo) {
        groups[4].conversations.push(conv)
      } else {
        groups[5].conversations.push(conv)
      }
    }

    return groups.filter(g => g.conversations.length > 0)
  }, [unpinnedConversations])

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader>
        <div className="flex w-full items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium">
              LLMatscale.ai
            </span>
          </div>
          <SidebarTrigger className="size-8 shrink-0 border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="gap-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="New chat" onClick={onNewChat}>
                <Plus className="size-4" />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Projects">
                <FolderOpen className="size-4" />
                <span>Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Pinned Conversations */}
        {pinnedConversations.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs group-data-[collapsible=icon]:hidden">
              Pinned
            </SidebarGroupLabel>
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Pinned">
                  <Pin className="size-4" />
                  <span>Pinned</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu className="group-data-[collapsible=icon]:hidden">
              {pinnedConversations.map((conversation) => (
                <SidebarMenuItem key={conversation.id} className="group/item">
                  <SidebarMenuButton
                    isActive={conversation.id === selectedId}
                    onClick={() => onSelectConversation(conversation.id)}
                    className="pr-8"
                  >
                    <Pin className="size-3 text-muted-foreground" />
                    <span className="truncate">{conversation.title}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => onPinConversation(conversation.id, false)}>
                        <PinOff className="mr-2 size-4" />
                        <span>Unpin</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onShareConversation(conversation.id)}>
                        <Share2 className="mr-2 size-4" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDeleteConversation(conversation.id)}
                      >
                        <Trash className="mr-2 size-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Recent Conversations - grouped by time period */}
        {/* Single Recents icon shown only when collapsed */}
        <SidebarGroup className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Recents">
                <MessageSquare className="size-4" />
                <span>Recents</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {/* Time-grouped chat history shown only when expanded */}
        <div className="group-data-[collapsible=icon]:hidden">
          {unpinnedConversations.length === 0 ? (
            <SidebarGroup>
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No conversations yet
              </div>
            </SidebarGroup>
          ) : (
            groupedConversations.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-xs">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {group.conversations.map((conversation) => (
                    <SidebarMenuItem key={conversation.id} className="group/item">
                      <SidebarMenuButton
                        isActive={conversation.id === selectedId}
                        onClick={() => onSelectConversation(conversation.id)}
                        className="pr-8"
                      >
                        <span className="truncate">{conversation.title}</span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More options</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => onPinConversation(conversation.id, true)}>
                            <Pin className="mr-2 size-4" />
                            <span>Pin</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onShareConversation(conversation.id)}>
                            <Share2 className="mr-2 size-4" />
                            <span>Share</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDeleteConversation(conversation.id)}
                          >
                            <Trash className="mr-2 size-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))
          )}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  tooltip="Account"
                >
                  <svg viewBox="0 0 16 16" className="!size-6 shrink-0" aria-hidden="true">
                    <circle cx="8" cy="8" r="8" className="fill-primary" />
                    <text x="8" y="8" textAnchor="middle" dominantBaseline="central" className="fill-primary-foreground" fontSize="8" fontWeight="600" fontFamily="system-ui, sans-serif">
                      {userName.charAt(0).toUpperCase()}
                    </text>
                  </svg>
                  <span className="truncate">{userName}</span>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[220px] p-1"
              >
                {/* User info header */}
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-foreground">{userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenSettings} className="gap-2.5 px-3 py-2">
                  <Settings className="size-4 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="gap-2.5 px-3 py-2">
                  <LogOut className="size-4 text-muted-foreground" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function ChatContent({
  conversationId,
  selectedModel,
  setSelectedModel,
  onConversationCreated,
  userName,
  onOpenMcpSettings,
}: {
  conversationId: string | null
  selectedModel: ClaudeModelId
  setSelectedModel: (model: ClaudeModelId) => void
  onConversationCreated: (id: string) => void
  userName: string
  onOpenMcpSettings: () => void
}) {
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [activeMcpIds, setActiveMcpIds] = useState<string[]>([])
  const mcpLoadedRef = useRef(false) // Track if MCP connections have been loaded

  // Load connected MCP connections and enable them by default
  useEffect(() => {
    if (mcpLoadedRef.current) return
    mcpLoadedRef.current = true

    const loadConnectedMcps = async () => {
      try {
        const res = await fetch("/api/mcp/connections", {
          headers: getAuthHeaders(),
        })
        if (res.ok) {
          const connections = await res.json()
          // Enable all connected MCPs by default
          const connectedIds = connections
            .filter((c: { status: string }) => c.status === "connected")
            .map((c: { id: string }) => c.id)
          if (connectedIds.length > 0) {
            setActiveMcpIds(connectedIds)
          }
        }
      } catch {
        // Silently fail - MCP connections are optional
      }
    }
    loadConnectedMcps()
  }, [])

  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(!!conversationId)
  const [waitingForResponse, setWaitingForResponse] = useState(false)
  const [input, setInput] = useState("")
  const chatInputRef = useRef<ClaudeChatInputHandle>(null)
  const pendingMessageRef = useRef<{ text: string; messageId: string; attachments?: Array<{ type: 'file-attachment'; fileId: string; filename: string; mimeType: string; sizeBytes?: number; taskType?: string | null }> } | null>(null)
  const currentConversationRef = useRef<string | null>(null)
  const isNewConversationRef = useRef(false) // Track if we just created a new conversation
  const optimisticMessageCounterRef = useRef(0)

  // File content loading hook
  const { fetchFileContent, fetchFileArrayBuffer, getCache: getFileContentCache } = useFileContent()

  // Artifact state - use refs to prevent re-render loops
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([])
  const [activeArtifactIndex, setActiveArtifactIndex] = useState(0)
  const [showArtifactPreview, setShowArtifactPreview] = useState(false)
  const [artifactPanelMounted, setArtifactPanelMounted] = useState(false)
  const [panelResizeTransition, setPanelResizeTransition] = useState(false)
  const userClosedArtifactRef = useRef<boolean>(false) // Track if user manually closed
  const lastDetectedArtifactIdRef = useRef<string | null>(null) // Track last detected artifact to prevent re-opening
  const showArtifactPreviewRef = useRef<boolean>(false) // Ref version to avoid callback recreation
  const artifactMessageIdRef = useRef<string | null>(null) // Track which message owns the current artifacts
  const manuallySelectedArtifactRef = useRef<boolean>(false) // Track if artifact was manually clicked (not auto-detected)
  const isLoadedConversationRef = useRef<boolean>(!!conversationId) // Track if messages came from loading a saved conversation
  const [modelJustChanged, setModelJustChanged] = useState(false)
  type TransitionPhase = 'idle' | 'exiting-welcome' | 'entering-chat'
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle')
  const pendingSendDataRef = useRef<{ message: string; files: unknown[]; pastedContent: unknown[]; model: string; isThinkingEnabled: boolean } | null>(null)
  const prevModelRef = useRef<string>(selectedModel)

  // Keep ref in sync with state and manage panel mount lifecycle
  useEffect(() => {
    showArtifactPreviewRef.current = showArtifactPreview
    if (showArtifactPreview) {
      setArtifactPanelMounted(true)
    }
    // Enable smooth CSS transition on panels during open/close
    setPanelResizeTransition(true)
    const timer = setTimeout(() => setPanelResizeTransition(false), 350)
    return () => clearTimeout(timer)
  }, [showArtifactPreview])

  // Track model changes for SystemMessage notification
  useEffect(() => {
    if (prevModelRef.current !== selectedModel) {
      setModelJustChanged(true)
      prevModelRef.current = selectedModel
      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => setModelJustChanged(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [selectedModel])

  // Suggestions replaced by inline welcome chips in the greeting state

  // Helper to extract reasoning parts from message
  // AI SDK sends reasoning with { type: 'reasoning', text: '...' }
  const getReasoningParts = (message: UIMessage): string[] => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    return parts
      .filter((part) => part.type === "reasoning")
      .map((part) => {
        // AI SDK uses 'text' property for reasoning content
        if ("text" in part && part.text) return part.text as string
        // Fallback for 'reasoning' property (legacy)
        if ("reasoning" in part && part.reasoning) return part.reasoning as string
        return ""
      })
      .filter(Boolean)
  }

  // Extract file artifacts from message parts (file-download and data-fileDownload)
  const getFileArtifactsFromMessage = useCallback((message: UIMessage): Artifact[] => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    const fileArtifacts: Artifact[] = []

    for (const part of parts) {
      if (typeof part !== 'object' || part === null) continue
      const p = part as Record<string, unknown>
      const partType = p.type as string

      let fileData: { fileId: string; filename: string; mimeType?: string; sizeBytes?: number } | null = null

      if (partType === 'file-download') {
        fileData = {
          fileId: p.fileId as string,
          filename: p.filename as string || 'download',
          mimeType: p.mimeType as string | undefined,
          sizeBytes: p.sizeBytes as number | undefined,
        }
      } else if (partType === 'data-fileDownload') {
        const data = p.data as Record<string, unknown> | undefined
        if (data) {
          fileData = {
            fileId: data.fileId as string,
            filename: data.filename as string || 'download',
            mimeType: data.mimeType as string | undefined,
            sizeBytes: data.sizeBytes as number | undefined,
          }
        }
      }

      if (fileData?.fileId && isPreviewableFile(fileData.filename, fileData.mimeType)) {
        fileArtifacts.push(createFileArtifact(fileData))
      }
    }

    return fileArtifacts
  }, [])

  // Extract tag artifacts from message text parts
  const getTagArtifactsFromMessage = useCallback((message: UIMessage): { artifacts: Artifact[]; hasStreamingArtifact: boolean } => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    const rawText = parts
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
    if (!rawText.includes('<antArtifact')) return { artifacts: [], hasStreamingArtifact: false }
    const result = extractTagArtifacts(rawText)
    return { artifacts: result.artifacts, hasStreamingArtifact: result.hasStreamingArtifact }
  }, [])

  // Streaming state for artifact panel
  const [isArtifactStreaming, setIsArtifactStreaming] = useState(false)

  // Sidebar control for artifact panel
  const { setOpen: setSidebarOpen } = useSidebar()
  const sidebarStateBeforeArtifact = useRef<boolean>(true)

  // Open artifact and collapse sidebar - memoized to prevent re-renders
  // Uses refs instead of state in dependencies to prevent recreation and infinite loops
  // manualSelection: true when user clicks an artifact tile (not auto-detected during streaming)
  const openArtifactPanel = useCallback((artifact: Artifact, artifacts: Artifact[] = [], _streaming: boolean = false, manualSelection: boolean = false) => {
    // Check if this artifact was already opened (to prevent infinite loops)
    // Use ref version of showArtifactPreview to avoid dependency
    if (artifact.id === lastDetectedArtifactIdRef.current && showArtifactPreviewRef.current && !manualSelection) {
      // Just update the content without re-triggering
      setActiveArtifact(artifact)
      setAllArtifacts(artifacts.length > 0 ? artifacts : [artifact])
      setActiveArtifactIndex(artifacts.length > 0 ? artifacts.indexOf(artifact) : 0)
  
      return
    }

    // Track if this was a manual selection (prevents auto-detection from overwriting)
    manuallySelectedArtifactRef.current = manualSelection

    lastDetectedArtifactIdRef.current = artifact.id
    sidebarStateBeforeArtifact.current = true // Save current state (assume open)
    setSidebarOpen(false) // Collapse sidebar
    setActiveArtifact(artifact)
    setAllArtifacts(artifacts.length > 0 ? artifacts : [artifact])
    setActiveArtifactIndex(artifacts.length > 0 ? artifacts.indexOf(artifact) : 0)
    setShowArtifactPreview(true)

    userClosedArtifactRef.current = false // Reset the manual close flag
  }, [setSidebarOpen]) // Removed showArtifactPreview - using ref instead

  // Navigate between artifacts
  const navigateArtifact = useCallback((index: number) => {
    if (index >= 0 && index < allArtifacts.length) {
      setActiveArtifactIndex(index)
      setActiveArtifact(allArtifacts[index])
    }
  }, [allArtifacts])

  // Called when exit animation finishes - safe to fully unmount the panel
  const handleArtifactExitComplete = useCallback(() => {
    setArtifactPanelMounted(false)
    setActiveArtifact(null)
  }, [])

  // Close artifact and restore sidebar
  const closeArtifactPanel = useCallback(() => {
    userClosedArtifactRef.current = true // Mark as manually closed by user
    lastDetectedArtifactIdRef.current = null // Reset tracking
    manuallySelectedArtifactRef.current = false // Reset manual selection flag
    setShowArtifactPreview(false)
    // Don't null activeArtifact here — let exit animation play first, then handleArtifactExitComplete cleans up

    setSidebarOpen(true) // Expand sidebar
  }, [setSidebarOpen])

  // API endpoint
  const apiEndpoint = "/api/chat"

  // Create request body - this will be sent with each chat request
  const requestBody = useMemo(() => ({
    model: selectedModel,
    webSearch: webSearchEnabled,
    enableReasoning: thinkingEnabled,
    conversationId,
    activeMcpIds,
  }), [selectedModel, webSearchEnabled, thinkingEnabled, conversationId, activeMcpIds])

  // Create transport with memoized configuration - includes auth headers
  const transport = useMemo(() => new DefaultChatTransport({
    api: apiEndpoint,
    body: requestBody,
    headers: getAuthHeaders(),
  }), [apiEndpoint, requestBody])

  const {
    messages,
    status,
    stop,
    setMessages,
    sendMessage,
    error,
  } = useChat({
    transport,
    messages: initialMessages,
    experimental_throttle: 50,
    // Auto-scroll handled by use-stick-to-bottom
    onError: (err) => {
      console.error('[useChat] Error:', err)
    },
  })

  // Retry function - resends the last user message
  const retryLastMessage = useCallback(() => {
    if (messages.length < 2) return
    isLoadedConversationRef.current = false
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      const text = lastUserMsg.parts
        .filter(p => p.type === 'text')
        .map(p => ('text' in p ? p.text : ''))
        .join('')
      if (text) {
        // Remove the last assistant message and resend
        setMessages(messages.slice(0, -1))
        sendMessage({ text }, { body: requestBody })
      }
    }
  }, [messages, setMessages, sendMessage, requestBody])

  // Auto-generate conversation title after first exchange
  const generateTitle = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/title`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        console.error('Failed to generate title: HTTP', res.status)
      }
    } catch (error) {
      console.error('Failed to generate title:', error)
    }
  }, [])

  // Copy last response to clipboard
  const copyLastResponse = useCallback(() => {
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
    if (lastAssistantMsg) {
      const text = getMessageText(lastAssistantMsg)
      navigator.clipboard.writeText(text)
    }
  }, [messages])

  // Save feedback to API
  const saveFeedback = useCallback(async (messageId: string, feedback: 'positive' | 'negative', comment?: string) => {
    try {
      await fetch('/api/messages/feedback', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ messageId, feedback, comment }),
      })
    } catch (error) {
      console.error('Failed to save feedback:', error)
    }
  }, [])

  // Keyboard shortcuts - must be after all callbacks are defined
  useKeyboardShortcuts({
    shortcuts: [
      {
        ...CHAT_SHORTCUTS.clearInput,
        action: () => {
          if (showArtifactPreview) {
            closeArtifactPanel()
          } else {
            setInput("")
          }
        },
      },
      {
        ...CHAT_SHORTCUTS.copyLastResponse,
        action: copyLastResponse,
      },
      {
        ...CHAT_SHORTCUTS.regenerate,
        action: retryLastMessage,
      },
    ],
  })

  // Helper to check if should show feedback bar (every 3rd assistant message)
  const shouldShowFeedbackBar = useCallback((messageIndex: number, role: string): boolean => {
    if (role !== "assistant") return false
    const assistantCount = messages
      .slice(0, messageIndex + 1)
      .filter(m => m.role === "assistant")
      .length
    return assistantCount > 0 && assistantCount % 3 === 0
  }, [messages])

  const isLoading = status === "submitted" || status === "streaming"
  const isWelcomeVisible = messages.length === 0 && transitionPhase === 'idle' && !isLoadingMessages

  // Clear waitingForResponse once the AI SDK picks up the request
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      setWaitingForResponse(false)
    }
  }, [status])

  // File-download parts are now delivered in-band via the SSE stream as data-fileDownload chunks.
  // The AI SDK automatically adds them to message.parts - no polling needed.

  // If we just created a conversation, send the pending message once the id is available
  useEffect(() => {
    if (!conversationId) return
    const pending = pendingMessageRef.current
    if (!pending) return

    // Clear the ref first to prevent double-sending
    pendingMessageRef.current = null

    // Small delay to ensure React state is fully updated and transport is recreated
    const pendingBody = pending.attachments ? { ...requestBody, attachments: pending.attachments } : requestBody
    const timeoutId = setTimeout(() => {
      sendMessage({ text: pending.text, messageId: pending.messageId }, { body: pendingBody })
      // Clear the new conversation flag after message is sent
      isNewConversationRef.current = false
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [conversationId, sendMessage, requestBody])

  // Load messages when conversation changes (only for existing conversations, not new ones)
  useEffect(() => {
    // Skip loading if this is a new conversation being created
    if (isNewConversationRef.current) {
      return
    }

    // Update the ref to track current conversation
    currentConversationRef.current = conversationId

    if (conversationId) {
      setIsLoadingMessages(true)

      const fetchMessages = async () => {
        try {
          const res = await fetch(`/api/conversations/${conversationId}`, {
            headers: getAuthHeaders(),
          })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = await res.json()

          // Check if we're still on the same conversation using the ref
          if (currentConversationRef.current !== conversationId) {
            return
          }

          if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
            // API now returns UIMessage format directly - no transformation needed
            const loadedMessages: UIMessage[] = data.messages

            // Set both initial messages and current messages
            setInitialMessages(loadedMessages)
            // Use a timeout to ensure setMessages is called after any pending state updates
            setTimeout(() => {
              if (currentConversationRef.current === conversationId) {
                setMessages(loadedMessages)
                isLoadedConversationRef.current = true
              }
            }, 0)
          } else {
            // Clear messages for this conversation since server has none
            setInitialMessages([])
            setTimeout(() => {
              if (currentConversationRef.current === conversationId) {
                setMessages([])
                isLoadedConversationRef.current = true
              }
            }, 0)
          }
        } catch (error) {
          console.error("Error loading messages:", error)
        } finally {
          if (currentConversationRef.current === conversationId) {
            setIsLoadingMessages(false)
          }
        }
      }

      // Start fetching immediately
      fetchMessages()
    } else {
      // No conversation selected - clear everything
      currentConversationRef.current = null
      setInitialMessages([])
      setMessages([])
      setInput("")
    }
  }, [conversationId, setMessages])

  // Throttle ref for artifact detection (100ms minimum between updates)
  const lastArtifactUpdateRef = useRef<number>(0)
  const artifactUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-detect artifacts (both tag-based and file-based) during/after streaming
  // Tag artifacts: always update allArtifacts (inline tiles need data), never auto-open panel
  // File artifacts: auto-open panel after streaming (existing behavior)
  useEffect(() => {
    if (messages.length === 0) return

    // Find last assistant message (for loaded conversations, scan all messages)
    const lastAssistantMessage = isLoadedConversationRef.current
      ? [...messages].reverse().find(m => m.role === 'assistant')
      : messages[messages.length - 1]
    if (!lastAssistantMessage || lastAssistantMessage.role !== 'assistant') return

    // If this is a DIFFERENT assistant message than before, reset artifacts immediately
    if (artifactMessageIdRef.current !== lastAssistantMessage.id) {
      artifactMessageIdRef.current = lastAssistantMessage.id
      setActiveArtifact(null)
      setAllArtifacts([])
      lastDetectedArtifactIdRef.current = null
      manuallySelectedArtifactRef.current = false
      lastArtifactUpdateRef.current = 0
      setIsArtifactStreaming(false)
      userClosedArtifactRef.current = false
    }

    // Detect tag artifacts from all assistant messages for loaded conversations
    let tagArtifacts: Artifact[] = []
    let hasStreamingArtifact = false
    if (isLoadedConversationRef.current) {
      // For loaded conversations, collect artifacts from ALL assistant messages
      for (const msg of messages) {
        if (msg.role !== 'assistant') continue
        const result = getTagArtifactsFromMessage(msg)
        tagArtifacts.push(...result.artifacts)
      }
    } else {
      const result = getTagArtifactsFromMessage(lastAssistantMessage)
      tagArtifacts = result.artifacts
      hasStreamingArtifact = result.hasStreamingArtifact
    }

    // Detect file artifacts only after streaming completes
    const fileArtifacts = isLoading ? [] : (
      isLoadedConversationRef.current
        ? messages.filter(m => m.role === 'assistant').flatMap(m => getFileArtifactsFromMessage(m))
        : getFileArtifactsFromMessage(lastAssistantMessage)
    )

    const allDetected = [...tagArtifacts, ...fileArtifacts]

    // Always update allArtifacts — inline tiles and panel navigation need this
    setAllArtifacts(allDetected)
    setIsArtifactStreaming(isLoading && hasStreamingArtifact)

    if (allDetected.length === 0) return

    // For loaded conversations, populate allArtifacts but don't auto-open panel
    if (isLoadedConversationRef.current) return

    // Don't auto-open panel if user manually closed
    if (userClosedArtifactRef.current) return

    // Auto-open panel ONLY for file artifacts (tag artifacts open via tile click)
    if (fileArtifacts.length > 0) {
      if (!showArtifactPreviewRef.current) {
        manuallySelectedArtifactRef.current = false
        openArtifactPanel(fileArtifacts[0], allDetected, false)
      } else if (!manuallySelectedArtifactRef.current) {
        setActiveArtifact(fileArtifacts[0])
        setActiveArtifactIndex(allDetected.indexOf(fileArtifacts[0]))
      }
    }
  }, [messages, isLoading, openArtifactPanel, getFileArtifactsFromMessage, getTagArtifactsFromMessage])

  const selectedModelInfo = CLAUDE_MODELS.find((m) => m.id === selectedModel)

  const createOptimisticUserMessage = (text: string) => {
    const nextId = optimisticMessageCounterRef.current++
    const messageId = `user-${Date.now()}-${nextId}`
    const optimisticMessage: UIMessage = {
      id: messageId,
      role: "user",
      parts: [
        {
          type: "text",
          text,
        },
      ],
    }

    setMessages((prev) => [...prev, optimisticMessage])
    return messageId
  }

  // Get raw text from message parts (before stripping artifact tags)
  const getRawMessageText = (message: UIMessage): string => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    const textFromParts = parts
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
    if (textFromParts) return textFromParts
    const legacyContent = (message as { content?: unknown }).content
    return typeof legacyContent === "string" ? legacyContent : ""
  }

  // Get display text with artifact tags stripped (for copy button, etc.)
  const getMessageText = (message: UIMessage): string => {
    const raw = getRawMessageText(message)
    if (raw.includes('<antArtifact')) {
      return extractTagArtifacts(raw).cleanedText
    }
    return raw
  }

  // Extract tool parts from message using PromptKit's extractToolParts helper
  const getToolParts = (message: UIMessage): ToolPart[] => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    return extractToolParts(parts)
  }

  // Segment message parts into ordered sections for proper rendering
  // Returns array of { type: 'text' | 'tool' | 'file', content: string | ToolPart }
  type MessageSegment =
    | { type: 'text'; content: string }
    | { type: 'tool'; content: ToolPart }
    | { type: 'tool-group'; content: ToolPart[] }
    | { type: 'file'; content: { fileId: string; filename: string; mimeType?: string; sizeBytes?: number } }

  const getOrderedMessageSegments = (message: UIMessage): MessageSegment[] => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    const segments: MessageSegment[] = []
    let currentText = ''

    for (const part of parts) {
      if (typeof part !== 'object' || part === null) continue

      const p = part as Record<string, unknown>
      const partType = p.type as string

      if (!partType) continue

      // Check if this is a tool part
      const isToolPart = partType.startsWith('tool-') ||
                         partType === 'tool-invocation' ||
                         partType === 'tool-call' ||
                         partType === 'tool-result'

      if (partType === 'step-start') {
        // Step boundary - flush accumulated text to preserve step interleaving
        if (currentText.trim()) {
          segments.push({ type: 'text', content: currentText.trim() })
          currentText = ''
        }
      } else if (partType === 'text' && typeof p.text === 'string') {
        // Accumulate text
        currentText += (currentText ? '\n\n' : '') + p.text
      } else if (partType === 'file-download') {
        // File download part from DB-loaded messages
        segments.push({
          type: 'file',
          content: {
            fileId: p.fileId as string,
            filename: p.filename as string || 'download',
            mimeType: p.mimeType as string | undefined,
            sizeBytes: p.sizeBytes as number | undefined,
          },
        })
      } else if (partType === 'data-fileDownload') {
        // File download part from SSE stream (AI SDK data chunk)
        const fileData = p.data as Record<string, unknown> | undefined
        if (fileData) {
          segments.push({
            type: 'file',
            content: {
              fileId: fileData.fileId as string,
              filename: fileData.filename as string || 'download',
              mimeType: fileData.mimeType as string | undefined,
              sizeBytes: fileData.sizeBytes as number | undefined,
            },
          })
        }
      } else if (isToolPart) {
        // Flush any accumulated text before tool
        if (currentText.trim()) {
          segments.push({ type: 'text', content: currentText.trim() })
          currentText = ''
        }
        // Add tool segment
        const toolParts = extractToolParts([part])
        if (toolParts.length > 0) {
          segments.push({ type: 'tool', content: toolParts[0] })
        }
      }
      // Skip reasoning parts - they're handled separately
    }

    // Flush any remaining text
    if (currentText.trim()) {
      segments.push({ type: 'text', content: currentText.trim() })
    }

    // Move file segments to the end so FileCards appear after all text content
    const fileSegments = segments.filter(s => s.type === 'file')
    const nonFileSegments = segments.filter(s => s.type !== 'file')
    return [...nonFileSegments, ...fileSegments]
  }

  // Group consecutive tool segments into tool-group segments for compact rendering
  const groupConsecutiveTools = (segments: MessageSegment[]): MessageSegment[] => {
    const result: MessageSegment[] = []
    let toolBuffer: ToolPart[] = []

    const flushTools = () => {
      if (toolBuffer.length > 0) {
        result.push({ type: 'tool-group', content: [...toolBuffer] })
      }
      toolBuffer = []
    }

    for (const segment of segments) {
      if (segment.type === 'tool') {
        toolBuffer.push(segment.content as ToolPart)
      } else {
        flushTools()
        result.push(segment)
      }
    }

    flushTools()
    return result
  }

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    setInput("")
    setWaitingForResponse(true)
    userClosedArtifactRef.current = false // Reset so new artifacts can auto-open
    isLoadedConversationRef.current = false // Reset so new artifacts from AI can auto-open
    const optimisticMessageId = createOptimisticUserMessage(text)

    // If no conversation exists, create one first
    if (!conversationId) {
      try {
        // Mark that we're creating a new conversation - this prevents the message loading effect from clearing messages
        isNewConversationRef.current = true
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            title: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
            model: selectedModel,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }

        const newConversation = await response.json()
        console.log("[createConversation] Created:", newConversation.id)
        if (!newConversation.id) {
          throw new Error("Invalid conversation response - no ID")
        }
        onConversationCreated(newConversation.id)
        pendingMessageRef.current = { text, messageId: optimisticMessageId }
      } catch (error) {
        isNewConversationRef.current = false
        console.error("Error creating conversation:", error)
        setInput(text)
        // Roll back optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessageId))
      }
    } else {
      try {
        // Pass body in the options object (second parameter)
        await sendMessage({ text, messageId: optimisticMessageId }, { body: requestBody })
      } catch (error) {
        console.error("Error sending message:", error)
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessageId))
        setInput(text)
      }
    }
  }

  // Core send logic - extracted so it can be called directly or after transition delay
  const executeSend = useCallback((data: {
    message: string;
    files: unknown[];
    pastedContent: unknown[];
    model: string;
    isThinkingEnabled: boolean;
  }) => {
    const text = data.message.trim()

    // Map uploaded files (with a Files API fileId) into chat attachments.
    const attachments = (data.files as Array<{ fileId?: string; file?: File; type?: string; sizeBytes?: number; taskType?: string | null }>)
      .filter((f) => f && f.fileId)
      .map((f) => ({
        type: 'file-attachment' as const,
        fileId: f.fileId!,
        filename: f.file?.name ?? 'upload',
        mimeType: f.type && f.type !== 'image/unknown' ? f.type : (f.file?.type || 'application/octet-stream'),
        sizeBytes: f.sizeBytes,
        taskType: f.taskType ?? null,
      }))
    const bodyWithAttachments = attachments.length > 0 ? { ...requestBody, attachments } : requestBody

    setInput("")
    setWaitingForResponse(true)
    userClosedArtifactRef.current = false
    isLoadedConversationRef.current = false
    const optimisticMessageId = createOptimisticUserMessage(text)

    if (!conversationId) {
      ;(async () => {
        try {
          isNewConversationRef.current = true
          const response = await fetch("/api/conversations", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              title: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
              model: data.model,
            }),
          })
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `HTTP ${response.status}`)
          }
          const newConversation = await response.json()
          if (!newConversation.id) throw new Error("Invalid conversation response - no ID")
          onConversationCreated(newConversation.id)
          pendingMessageRef.current = { text, messageId: optimisticMessageId, attachments: attachments.length > 0 ? attachments : undefined }
        } catch (error) {
          isNewConversationRef.current = false
          console.error("Error creating conversation:", error)
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMessageId))
        }
      })()
    } else {
      sendMessage({ text, messageId: optimisticMessageId }, { body: bodyWithAttachments }).catch((error) => {
        console.error("Error sending message:", error)
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessageId))
      })
    }
  }, [conversationId, onConversationCreated, sendMessage, requestBody, setMessages, createOptimisticUserMessage])

  // Bridge from ClaudeChatInput's onSendMessage to existing chat flow
  // When sending from welcome state, triggers transition animation first
  const handleSendMessage = useCallback((data: {
    message: string;
    files: unknown[];
    pastedContent: unknown[];
    model: string;
    isThinkingEnabled: boolean;
  }) => {
    if (data.model !== selectedModel) {
      setSelectedModel(data.model as ClaudeModelId)
    }

    const text = data.message.trim()
    if (!text && data.files.length === 0 && data.pastedContent.length === 0) return

    // If sending from welcome state, trigger exit animation first
    if (messages.length === 0 && transitionPhase === 'idle') {
      pendingSendDataRef.current = data
      setTransitionPhase('exiting-welcome')
    } else {
      executeSend(data)
    }
  }, [selectedModel, setSelectedModel, messages.length, transitionPhase, executeSend])

  // Called when welcome exit animation completes
  const handleWelcomeExitComplete = useCallback(() => {
    if (transitionPhase === 'exiting-welcome' && pendingSendDataRef.current) {
      setTransitionPhase('entering-chat')
      executeSend(pendingSendDataRef.current)
      pendingSendDataRef.current = null
      // Reset after paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitionPhase('idle'))
      })
    }
  }, [transitionPhase, executeSend])

  return (
    <PanelGroup orientation="horizontal" className={cn("h-full", panelResizeTransition && "panel-resize-transition")}>
      {/* Left Panel: Chat + Prompt Input - SINGLE scrollable container */}
      <Panel defaultSize={artifactPanelMounted ? 50 : 100} minSize={30}>

        {/* Skeleton loader for conversation switching - rendered OUTSIDE scroll container */}
        {isLoadingMessages ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 mx-auto w-full max-w-3xl space-y-6 px-11 py-16">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "justify-end" : "justify-start")}>
                  {i % 2 === 0 ? (
                    <div className="w-[55%] space-y-2">
                      <div className="h-10 rounded-2xl bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                    </div>
                  ) : (
                    <div className="w-[70%] space-y-2">
                      <div className="h-4 w-3/4 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                      <div className="h-4 w-1/2 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100 + 50}ms` }} />
                      {i === 1 && <div className="h-4 w-2/3 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100 + 100}ms` }} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Skeleton input bar */}
            <div className="px-8 pb-5 pt-2">
              <div className="mx-auto max-w-3xl">
                <div className="h-[52px] w-full rounded-xl bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ) : (
        <ChatContainerRoot className={cn("h-full", isWelcomeVisible && "!overflow-hidden")}>
              <ChatContainerContent className={cn("space-y-0 px-5 transition-[padding] duration-300", isWelcomeVisible ? "h-full py-0" : "py-12")}>
                <AnimatePresence mode="popLayout" onExitComplete={handleWelcomeExitComplete}>
                  {/* Error Display */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mx-auto max-w-3xl px-6"
                    >
                      <SystemMessage
                        variant="error"
                        cta={{ label: "Retry", onClick: retryLastMessage }}
                        dismissible
                      >
                        {error.message || "Something went wrong. Please try again."}
                      </SystemMessage>
                    </motion.div>
                  )}

                  {/* Model Change Notification */}
                  {modelJustChanged && (
                    <SystemMessage variant="action" dismissible onDismiss={() => setModelJustChanged(false)}>
                      Now using {selectedModelInfo?.name}
                    </SystemMessage>
                  )}

                  {isWelcomeVisible ? (
                    <motion.div
                      key="welcome"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3 }}
                      className="flex h-full flex-col items-center justify-center px-6"
                    >
                      <div className="w-full max-w-2xl flex flex-col items-center text-center">
                        {/* Time-based greeting */}
                        <motion.h1
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                          className="text-3xl md:text-4xl font-light text-foreground mb-8"
                        >
                          {getGreeting()}, {userName}
                        </motion.h1>

                        {/* Centered input */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                          className="w-full mb-5"
                        >
                          <ClaudeChatInput
                            ref={chatInputRef}
                            onSendMessage={handleSendMessage}
                            defaultModel={selectedModel}
                            placeholder="Upload your raw ACMV / BMS / chiller data to begin…"
                            isLoading={isLoading}
                            onStop={stop}
                            webSearchEnabled={webSearchEnabled}
                            onWebSearchChange={setWebSearchEnabled}
                            isThinkingEnabled={thinkingEnabled}
                            onThinkingChange={setThinkingEnabled}
                            activeMcpIds={activeMcpIds}
                            onMcpToggle={(connectionId, isActive) => {
                              setActiveMcpIds((prev) =>
                                isActive
                                  ? [...prev, connectionId]
                                  : prev.filter((id) => id !== connectionId)
                              )
                            }}
                            McpConnectionsSubmenu={McpConnectionsSubmenu}
                            onManageConnectors={onOpenMcpSettings}
                          />
                        </motion.div>

                        {/* Suggestion chips */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                          className="flex flex-wrap justify-center gap-2"
                        >
                          {[
                            { label: "Analyse BMS vs MPC", icon: BarChart3, prompt: "I've uploaded BMS vs MPC operating data. Analyse the energy savings and thermal comfort, then prepare the deliverables." },
                            { label: "Airside efficiency", icon: Gauge, prompt: "I've uploaded AHU airside data (before vs after optimisation). Compute the airside efficiency in kW/RT against the BCA targets and the energy savings." },
                            { label: "Chiller plant audit", icon: Factory, prompt: "I've uploaded chiller-plant audit data. Compare 1-chiller vs 2-chiller operation, system efficiency in kW/RT, and recommend a retrofit strategy." },
                          ].map((chip) => (
                            <button
                              key={chip.label}
                              onClick={() => chatInputRef.current?.setMessage(chip.prompt)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full
                                         border border-border bg-transparent text-muted-foreground
                                         hover:bg-muted hover:text-foreground transition-colors"
                            >
                              <chip.icon className="size-4" />
                              {chip.label}
                            </button>
                          ))}
                        </motion.div>
                      </div>
                    </motion.div>
                  ) : (
                    messages.map((message, index) => {
                      const isAssistant = message.role === "assistant"
                      const isLastMessage = index === messages.length - 1
                      const isStreaming = isLoading && isLastMessage && isAssistant
                      const rawText = isAssistant ? getRawMessageText(message) : ''
                      const hasArtifactTags = isAssistant && rawText.includes('<antArtifact')
                      const artifactSegments = hasArtifactTags ? segmentMessageText(rawText) : null
                      const messageText = hasArtifactTags ? extractTagArtifacts(rawText).cleanedText : (isAssistant ? rawText : getMessageText(message))

                      // Show pulse-dot after the last user message while waiting for assistant response
                      const showWaitingIndicator = isLastMessage && !isAssistant && (waitingForResponse || status === "submitted")

                      // Get ordered message segments (text and tool parts in correct order)
                      const messageSegments = isAssistant ? groupConsecutiveTools(getOrderedMessageSegments(message)) : []
                      const hasToolParts = messageSegments.some(s => s.type === 'tool-group' || s.type === 'file')

                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            type: "spring" as const,
                            stiffness: 200,
                            damping: 25,
                            delay: index * 0.02,
                          }}
                        >
                          <Message
                            className={cn(
                              "mx-auto w-full max-w-3xl items-start gap-3 px-6",
                              isAssistant ? "justify-start" : "justify-end"
                            )}
                          >
                            {isAssistant ? (
                              <>
                                <div className="group flex-1 min-w-0">
                                  {/* Reasoning/Extended Thinking - shown when model provides reasoning */}
                                  {(() => {
                                    const reasoningParts = getReasoningParts(message)
                                    if (reasoningParts.length === 0) return null
                                    return (
                                      <Reasoning isStreaming={isStreaming}>
                                        <ReasoningTrigger>
                                          {isStreaming ? (
                                            <TextShimmer duration={2}>Thinking</TextShimmer>
                                          ) : (
                                            "Thinking"
                                          )}
                                        </ReasoningTrigger>
                                        <ReasoningContent
                                          markdown
                                          className="ml-2 border-l-2 border-l-slate-200 px-2 pb-1 dark:border-l-slate-700"
                                        >
                                          {reasoningParts.join('\n\n')}
                                        </ReasoningContent>
                                      </Reasoning>
                                    )
                                  })()}

                                  {/* Render message segments in order: text -> tool -> text -> tool -> text */}
                                  {hasToolParts ? (
                                    // Message has tool parts - render segments in order with timeline
                                    <>
                                      {(() => {
                                        // Collect artifacts from text segments to render after all text
                                        const collectedArtifacts: { artifact: Artifact; isStreamingArt: boolean }[] = []

                                        const rendered = messageSegments.map((segment, segIndex) => {
                                          if (segment.type === 'tool-group') {
                                            const tools = segment.content as ToolPart[]
                                            return (
                                              <ToolTimeline
                                                key={`timeline-${segIndex}`}
                                                tools={tools}
                                                isStreaming={isStreaming}
                                                artifacts={allArtifacts}
                                                onOpenArtifact={(artifact) => openArtifactPanel(artifact, allArtifacts, false, true)}
                                              />
                                            )
                                          } else if (segment.type === 'file') {
                                            const fileData = segment.content as { fileId: string; filename: string; mimeType?: string; sizeBytes?: number }
                                            if (!fileData.fileId) return null
                                            return (
                                              <FileCard
                                                key={`file-${segIndex}`}
                                                fileId={fileData.fileId}
                                                filename={fileData.filename}
                                                mimeType={fileData.mimeType}
                                                sizeBytes={fileData.sizeBytes}
                                                onPreview={isPreviewableFile(fileData.filename, fileData.mimeType) ? () => {
                                                  const fileArt = createFileArtifact(fileData)
                                                  const currentArtifacts = [...allArtifacts]
                                                  const exists = currentArtifacts.find(a => a.id === fileArt.id)
                                                  if (!exists) currentArtifacts.push(fileArt)
                                                  openArtifactPanel(fileArt, currentArtifacts, false, true)
                                                } : undefined}
                                              />
                                            )
                                          } else {
                                            // Text segment — collect artifacts, render text only
                                            const textContent = segment.content as string
                                            const isLastSegment = segIndex === messageSegments.length - 1

                                            if (!textContent.trim()) return null

                                            if (textContent.includes('<antArtifact')) {
                                              const { segments: artSegs, hasStreamingArtifact: segHasStreaming } = segmentMessageText(textContent)
                                              const textParts: React.ReactNode[] = []
                                              artSegs.forEach((artSeg, artIdx) => {
                                                if (artSeg.type === 'artifact') {
                                                  collectedArtifacts.push({ artifact: artSeg.artifact, isStreamingArt: isStreaming && artSeg.isStreaming })
                                                } else {
                                                  if (!artSeg.content.trim()) return
                                                  const isLastArt = isLastSegment && artIdx === artSegs.length - 1 && !segHasStreaming
                                                  textParts.push(
                                                    <MessageContent key={`art-text-${segIndex}-${artIdx}`} role="assistant">
                                                      <StreamingText
                                                        content={artSeg.content}
                                                        isStreaming={isStreaming && isLastArt}
                                                        markdown
                                                        cursorStyle="pulse-dot"
                                                      />
                                                    </MessageContent>
                                                  )
                                                }
                                              })
                                              return textParts.length > 0 ? <Fragment key={`text-${segIndex}`}>{textParts}</Fragment> : null
                                            }

                                            return (
                                              <MessageContent key={`text-${segIndex}`} role="assistant">
                                                <StreamingText
                                                  content={textContent}
                                                  isStreaming={isStreaming && isLastSegment}
                                                  markdown
                                                  cursorStyle="pulse-dot"
                                                />
                                              </MessageContent>
                                            )
                                          }
                                        })

                                        return (
                                          <>
                                            {rendered}
                                            {/* Artifact tiles collected from text segments, rendered after all text */}
                                            {collectedArtifacts.map(({ artifact, isStreamingArt }) => (
                                              <ArtifactTile
                                                key={artifact.id}
                                                artifact={artifact}
                                                isStreaming={isStreamingArt}
                                                onOpenPreview={() => openArtifactPanel(artifact, allArtifacts, false, true)}
                                              />
                                            ))}
                                          </>
                                        )
                                      })()}
                                    </>
                                  ) : artifactSegments ? (
                                    /* Has artifact tags — render text + inline ArtifactTile segments */
                                    <>
                                      {artifactSegments.segments.map((artSeg, artIdx) => {
                                        if (artSeg.type === 'artifact') {
                                          return (
                                            <ArtifactTile
                                              key={artSeg.artifact.id}
                                              artifact={artSeg.artifact}
                                              isStreaming={isStreaming && artSeg.isStreaming}
                                              onOpenPreview={() => openArtifactPanel(artSeg.artifact, allArtifacts, false, true)}
                                            />
                                          )
                                        }
                                        if (!artSeg.content.trim()) return null
                                        const isLastText = artIdx === artifactSegments.segments.length - 1 && !artifactSegments.hasStreamingArtifact
                                        return (
                                          <MessageContent key={`art-text-${artIdx}`} role="assistant">
                                            <StreamingText
                                              content={artSeg.content}
                                              isStreaming={isStreaming && isLastText}
                                              markdown
                                              cursorStyle="pulse-dot"
                                            />
                                          </MessageContent>
                                        )
                                      })}
                                    </>
                                  ) : (
                                    /* No tool parts, no artifacts - normal message display */
                                    <MessageContent role="assistant">
                                      {isStreaming ? (
                                        messageText.trim() ? (
                                        <StreamingText
                                          content={messageText}
                                          isStreaming={isStreaming}
                                          markdown
                                          charsPerTick={4}
                                          cursorStyle="pulse-dot"
                                        />
                                        ) : (
                                          <Loader variant="pulse-dot" size="md" className="justify-start" />
                                        )
                                      ) : (
                                        <StreamingText
                                          content={messageText}
                                          isStreaming={false}
                                          markdown
                                          showCursor={false}
                                        />
                                      )}
                                    </MessageContent>
                                  )}
                                  {!isStreaming && (
                                    <MessageActions
                                      className={cn(
                                        "-ml-2.5 mt-1 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                                        isLastMessage && "opacity-100"
                                      )}
                                    >
                                      <MessageAction tooltip="Copy" delayDuration={100}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                          onClick={() =>
                                            navigator.clipboard.writeText(messageText)
                                          }
                                        >
                                          <Copy />
                                        </Button>
                                      </MessageAction>
                                      <MessageAction tooltip="Upvote" delayDuration={100}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                        >
                                          <ThumbsUp />
                                        </Button>
                                      </MessageAction>
                                      <MessageAction
                                        tooltip="Downvote"
                                        delayDuration={100}
                                      >
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                        >
                                          <ThumbsDown />
                                        </Button>
                                      </MessageAction>
                                    </MessageActions>
                                  )}

                                  {/* FeedbackBar - shown every 3rd assistant message */}
                                  {!isStreaming && shouldShowFeedbackBar(index, message.role) && (
                                    <div className="mt-3 flex justify-center">
                                      <FeedbackBar
                                        title="Was this response helpful?"
                                        onHelpful={() => saveFeedback(message.id, 'positive')}
                                        onNotHelpful={() => saveFeedback(message.id, 'negative')}
                                      />
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="group max-w-[85%] sm:max-w-[75%]">
                                  <MessageContent role="user" className="inline-block w-fit max-w-full">
                                    {messageText}
                                  </MessageContent>
                                  <MessageActions
                                    className={cn(
                                      "mr-1 mt-1 flex justify-end gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                    )}
                                  >
                                    <MessageAction tooltip="Edit" delayDuration={100}>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                      >
                                        <Pencil />
                                      </Button>
                                    </MessageAction>
                                    <MessageAction tooltip="Delete" delayDuration={100}>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                      >
                                        <Trash />
                                      </Button>
                                    </MessageAction>
                                    <MessageAction tooltip="Copy" delayDuration={100}>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-none border-0 bg-transparent p-0 hover:bg-transparent"
                                        onClick={() =>
                                          navigator.clipboard.writeText(messageText)
                                        }
                                      >
                                        <Copy />
                                      </Button>
                                    </MessageAction>
                                  </MessageActions>
                                </div>
                              </>
                            )}
                          </Message>

                          {/* Pulse-dot waiting indicator */}
                          {showWaitingIndicator && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3 }}
                              className="mx-auto w-full max-w-3xl px-6 pt-3"
                            >
                              <Loader variant="pulse-dot" size="md" className="justify-start" />
                            </motion.div>
                          )}
                        </motion.div>
                      )
                    })
                  )}

                </AnimatePresence>
              </ChatContainerContent>

              {/* Scroll to bottom button */}
              <div className="pointer-events-none sticky bottom-32 z-10 flex justify-center">
                <ScrollButton className="pointer-events-auto bg-background border-border shadow-md" />
              </div>

              {/* Sticky Input - only in chat mode (messages exist) */}
              {!isWelcomeVisible && messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                  className="sticky bottom-0 z-20 bg-background px-3 pb-3 pt-2 md:px-5 md:pb-5"
                >
                  <div className="mx-auto max-w-3xl">
                    <ClaudeChatInput
                      ref={chatInputRef}
                      onSendMessage={handleSendMessage}
                      defaultModel={selectedModel}
                      placeholder="Reply..."
                      isLoading={isLoading}
                      onStop={stop}
                      webSearchEnabled={webSearchEnabled}
                      onWebSearchChange={setWebSearchEnabled}
                      isThinkingEnabled={thinkingEnabled}
                      onThinkingChange={setThinkingEnabled}
                      activeMcpIds={activeMcpIds}
                      onMcpToggle={(connectionId, isActive) => {
                        setActiveMcpIds((prev) =>
                          isActive
                            ? [...prev, connectionId]
                            : prev.filter((id) => id !== connectionId)
                        )
                      }}
                      McpConnectionsSubmenu={McpConnectionsSubmenu}
                      onManageConnectors={onOpenMcpSettings}
                    />
                    <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
                      LLM at Scale.AI. All Rights Reserved. Confidential and Proprietary Information. Version 1.0
                    </p>
                  </div>
                </motion.div>
              )}
        </ChatContainerRoot>
        )}
        </Panel>

        {/* Resize Handle + Right Panel: Artifact Preview */}
        {artifactPanelMounted && activeArtifact && (
          <>
            <PanelResizeHandle className="w-2 bg-border hover:bg-primary/20 transition-colors cursor-col-resize flex items-center justify-center">
              <div className="w-0.5 h-8 bg-muted-foreground/30 rounded-full" />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={20}>
              <ArtifactPanelWrapper
                artifact={activeArtifact}
                artifacts={allArtifacts}
                currentIndex={activeArtifactIndex}
                isStreaming={isArtifactStreaming}
                onClose={closeArtifactPanel}
                onNavigate={navigateArtifact}
                onFetchFileContent={fetchFileContent}
                onFetchFileArrayBuffer={fetchFileArrayBuffer}
                fileContentCache={getFileContentCache}
                isOpen={showArtifactPreview}
                onExitComplete={handleArtifactExitComplete}
              />
            </Panel>
          </>
        )}
      </PanelGroup>
  )
}

function FullChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<ClaudeModelId>(CLAUDE_MODELS[0].id)
  const [isLoading, setIsLoading] = useState(true)
  const [userName, setUserName] = useState<string>("User")
  const [userEmail, setUserEmail] = useState<string>("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"general" | "appearance" | "api-keys" | "mcp" | "instructions" | "advanced">("general")
  // Track the chat key separately - stays stable during new conversation creation
  // Only changes when user explicitly selects an existing conversation
  const [chatKey, setChatKey] = useState<string>('new-chat')
  const router = useRouter()

  // Load user name and email from session on mount
  useEffect(() => {
    setUserName(getUserNameFromSession())
    setUserEmail(getUserEmailFromSession())
  }, [])

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/'
          return
        }
        setConversations([])
        return
      }

      const data = await response.json()

      if (Array.isArray(data)) {
        setConversations(data)
      } else {
        setConversations([])
      }
    } catch (error) {
      console.error("Error fetching conversations:", error)
      setConversations([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null)
    setChatKey('new-chat')
  }, [])

  // Keyboard shortcuts for main app
  useKeyboardShortcuts({
    shortcuts: [
      {
        ...CHAT_SHORTCUTS.newChat,
        action: handleNewChat,
      },
      {
        ...CHAT_SHORTCUTS.openSettings,
        action: () => setSettingsOpen(true),
      },
    ],
  })

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
    setChatKey(id)
  }, [])

  const handleConversationCreated = useCallback((id: string) => {
    setSelectedConversationId(id)
    fetchConversations()
  }, [fetchConversations])

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (selectedConversationId === id) {
        setSelectedConversationId(null)
        setChatKey('new-chat-' + Date.now())
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
    }
  }, [selectedConversationId])

  const handlePinConversation = useCallback(async (id: string, isPinned: boolean) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isPinned }),
      })
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPinned } : c))
      )
    } catch (error) {
      console.error("Error pinning conversation:", error)
    }
  }, [])

  const handleShareConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isShared: true }),
      })
      const shareUrl = `${window.location.origin}/share/${id}`
      await navigator.clipboard.writeText(shareUrl)
      alert("Share link copied to clipboard!")
    } catch (error) {
      console.error("Error sharing conversation:", error)
    }
  }, [])

  return (
    <>
      <SidebarProvider>
        <ChatSidebar
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onPinConversation={handlePinConversation}
          onShareConversation={handleShareConversation}
          userName={userName}
          userEmail={userEmail}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SidebarInset className="overflow-hidden">
          <ChatContent
            key={chatKey}
            conversationId={selectedConversationId}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onConversationCreated={handleConversationCreated}
            userName={userName}
            onOpenMcpSettings={() => { setSettingsTab("mcp"); setSettingsOpen(true) }}
          />
        </SidebarInset>
      </SidebarProvider>
      <SettingsModal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsTab("general") }}
        defaultTab={settingsTab}
        currentModel={selectedModel}
        onDefaultModelChange={(modelId) => setSelectedModel(modelId as ClaudeModelId)}
      />
    </>
  )
}

export { FullChatApp }
