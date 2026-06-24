"use client"

import * as React from "react"
import { MotionConfig } from "motion/react"
import { ErrorBoundary } from "./error-boundary"

interface ProvidersProps {
  children: React.ReactNode
}

/**
 * Global providers wrapper component
 * Includes error boundary, theme provider, and other global context
 */
export function Providers({ children }: ProvidersProps) {
  // Initialize theme from localStorage on mount
  React.useEffect(() => {
    const savedTheme = localStorage.getItem("llmatscale_theme")
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark")
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark")
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      if (prefersDark) {
        document.documentElement.classList.add("dark")
      }
    }

    // Apply saved color theme
    const savedColorTheme = localStorage.getItem("llmatscale_color_theme")
    if (savedColorTheme && savedColorTheme !== "claude") {
      document.documentElement.setAttribute("data-theme", savedColorTheme)
    } else {
      document.documentElement.removeAttribute("data-theme")
    }

    // Apply saved font size
    const savedFontSize = localStorage.getItem("llmatscale_font_size")
    if (savedFontSize) {
      document.documentElement.style.setProperty("--base-font-size", `${savedFontSize}px`)
    }
  }, [])

  // Listen for system theme changes when in "system" mode
  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = (e: MediaQueryListEvent) => {
      const savedTheme = localStorage.getItem("llmatscale_theme")
      if (!savedTheme || savedTheme === "system") {
        if (e.matches) {
          document.documentElement.classList.add("dark")
        } else {
          document.documentElement.classList.remove("dark")
        }
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  // SidebarProvider in FullChatApp already has h-svh - no extra wrapper needed
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary
        onError={(error, errorInfo) => {
          // Log to console in development
          console.error("Application error:", error)
          console.error("Component stack:", errorInfo.componentStack)

          // In production, you might want to send this to an error tracking service
          // Example: Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
        }}
      >
        {children}
      </ErrorBoundary>
    </MotionConfig>
  )
}

/**
 * Hook to detect network status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = React.useState(true)

  React.useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}

/**
 * Hook to detect reduced motion preference
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  return prefersReducedMotion
}
