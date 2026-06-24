"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FullChatApp } from "@/components/full-chat-app"
import { PageLoadingSkeleton } from "@/components/ui/skeleton-loaders"

const AUTH_SESSION_KEY = "llmatscale_auth_session"
const AUTH_TOKEN_KEY = "llmatscale_auth_token"

function hasValidSession() {
    if (typeof window === "undefined") return false
    const session = window.localStorage.getItem(AUTH_SESSION_KEY)
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
    return !!(session && token)
}

export default function ChatPage() {
    const router = useRouter()
    // Start in "checking" on both server and client's first render so the
    // hydrated HTML matches; resolve the (client-only) auth check in useEffect.
    const [status, setStatus] = useState<"checking" | "authed">("checking")

    useEffect(() => {
        if (!hasValidSession()) {
            router.replace("/")
            return
        }
        setStatus("authed")
    }, [router])

    if (status !== "authed") {
        return <PageLoadingSkeleton />
    }

    // FullChatApp's SidebarProvider already has h-svh - no extra wrapper needed
    return <FullChatApp />
}
