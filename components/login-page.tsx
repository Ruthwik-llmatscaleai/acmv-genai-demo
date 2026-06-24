"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import {
    Shield,
    Zap,
    ArrowRight,
    Check,
    Lock,
    Globe,
    BarChart3,
    Network
} from "lucide-react"

type AuthMode = "signin" | "signup"

const AUTH_SESSION_KEY = "llmatscale_auth_session"
const AUTH_TOKEN_KEY = "llmatscale_auth_token"

// Animation variants for staggered capability list
const capabilitiesContainerVariants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.1,
        },
    },
}

const capabilityItemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: "spring" as const,
            stiffness: 300,
            damping: 30,
        },
    },
}

export function LoginPage() {
    const router = useRouter()
    const [mode, setMode] = React.useState<AuthMode>("signin")
    const [error, setError] = React.useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [loginSuccess, setLoginSuccess] = React.useState(false)

    React.useEffect(() => {
        if (typeof window === "undefined") return
        const sessionData = window.localStorage.getItem(AUTH_SESSION_KEY)
        const token = window.localStorage.getItem(AUTH_TOKEN_KEY)

        if (sessionData && token) {
            try {
                const session = JSON.parse(sessionData)
                if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
                    router.replace("/chat")
                } else {
                    window.localStorage.removeItem(AUTH_SESSION_KEY)
                    window.localStorage.removeItem(AUTH_TOKEN_KEY)
                }
            } catch {
                window.localStorage.removeItem(AUTH_SESSION_KEY)
                window.localStorage.removeItem(AUTH_TOKEN_KEY)
            }
        }
    }, [router])

    const normalizeEmail = (value: string) => value.trim().toLowerCase()

    const writeSession = (token: string, user: { id: string; email: string; name?: string | null }, expiresAt: string) => {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token)
        window.localStorage.setItem(
            AUTH_SESSION_KEY,
            JSON.stringify({ user, signedInAt: new Date().toISOString(), expiresAt })
        )
    }

    const handleModeChange = (nextMode: AuthMode) => {
        setMode(nextMode)
        setError(null)
        setLoginSuccess(false)
    }

    const navigateAfterSuccess = () => {
        setLoginSuccess(true)
        setTimeout(() => {
            router.push("/chat")
        }, 400)
    }

    const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        setIsSubmitting(true)

        const formData = new FormData(event.currentTarget)
        const email = normalizeEmail(String(formData.get("email") || ""))
        const password = String(formData.get("password") || "")

        if (!email || !password) {
            setError("Please enter your email and password.")
            setIsSubmitting(false)
            return
        }

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Invalid email or password.")
                setIsSubmitting(false)
                return
            }

            writeSession(data.token, data.user, data.expiresAt)
            navigateAfterSuccess()
        } catch (err) {
            console.error("Login error:", err)
            setError("Failed to sign in. Please try again.")
            setIsSubmitting(false)
        }
    }

    const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        setIsSubmitting(true)

        const formData = new FormData(event.currentTarget)
        const firstName = String(formData.get("firstName") || "").trim()
        const lastName = String(formData.get("lastName") || "").trim()
        const email = normalizeEmail(String(formData.get("email") || ""))
        const password = String(formData.get("password") || "")
        const acceptedTerms = Boolean(formData.get("terms"))

        if (!firstName || !lastName || !email || !password) {
            setError("Please complete all required fields.")
            setIsSubmitting(false)
            return
        }

        if (!acceptedTerms) {
            setError("Please accept the terms to continue.")
            setIsSubmitting(false)
            return
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters long.")
            setIsSubmitting(false)
            return
        }

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    name: `${firstName} ${lastName}`,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Failed to create account.")
                setIsSubmitting(false)
                return
            }

            writeSession(data.token, data.user, data.expiresAt)
            navigateAfterSuccess()
        } catch (err) {
            console.error("Signup error:", err)
            setError("Failed to create account. Please try again.")
            setIsSubmitting(false)
        }
    }

    const capabilities = [
        { icon: Network, text: "Upload BMS, AHU and chiller-plant data" },
        { icon: Globe, text: "Ask questions in natural language" },
        { icon: BarChart3, text: "Generate energy, efficiency and comfort insights" },
        { icon: Lock, text: "Export ready-to-present reports and slides" },
    ]

    // Determine submit button content based on state
    const getSignInButtonContent = () => {
        if (loginSuccess) {
            return (
                <>
                    <Check className="mr-2 size-4" />
                    Success
                </>
            )
        }
        if (isSubmitting) {
            return "Signing in..."
        }
        return (
            <>
                Sign in
                <ArrowRight className="ml-2 size-4" />
            </>
        )
    }

    const getSignUpButtonContent = () => {
        if (loginSuccess) {
            return (
                <>
                    <Check className="mr-2 size-4" />
                    Account created
                </>
            )
        }
        if (isSubmitting) {
            return "Creating account..."
        }
        return (
            <>
                Create account
                <ArrowRight className="ml-2 size-4" />
            </>
        )
    }

    return (
        <div className="relative flex h-screen overflow-hidden bg-background">
            {/* Left Section - Branding */}
            <div className="hidden w-[55%] flex-col justify-between border-r border-border bg-muted/40 lg:flex">
                {/* Subtle dot pattern */}
                <div
                    className="pointer-events-none absolute inset-0 w-[55%] opacity-[0.04]"
                    style={{
                        backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                        backgroundSize: "32px 32px",
                    }}
                />

                <div className="relative z-10 flex h-full flex-col justify-between p-14">
                    {/* Logo */}
                    <div>
                        <Image
                            src="/logos/ngeeann-logo.png"
                            alt="Ngee Ann Polytechnic"
                            width={220}
                            height={70}
                            className="h-[64px] w-auto object-contain"
                            priority
                            unoptimized
                        />
                        <div className="mt-4">
                            <p className="text-2xl font-semibold tracking-tight text-foreground">
                                ACMV Analytics Studio
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                                <div className="h-px w-8 bg-primary/60" />
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    AI-Assisted HVAC Energy Analytics
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="max-w-lg">
                        <h2 className="text-[2.75rem] font-semibold leading-[1.15] text-foreground">
                            Your ACMV data, your questions,
                            <br />
                            <span className="text-primary">instant insights.</span>
                        </h2>

                        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                            Upload BMS, AHU and chiller-plant logs, ask in plain English, and get
                            energy, efficiency and comfort analysis — with charts and ready-to-present
                            reports, reviewed by your engineer.
                        </p>

                        {/* Capabilities - staggered entrance */}
                        <motion.div
                            className="mt-10 space-y-4"
                            variants={capabilitiesContainerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            {capabilities.map(({ icon: Icon, text }) => (
                                <motion.div
                                    key={text}
                                    variants={capabilityItemVariants}
                                    className="flex items-center gap-4"
                                >
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] ring-1 ring-primary/10">
                                        <Icon className="size-[18px] text-primary" />
                                    </div>
                                    <span className="text-sm text-foreground/70">{text}</span>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>

                    {/* Footer - Badges with subtle hover scale */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 ring-1 ring-border hover:scale-[1.02] transition-transform">
                            <Shield className="size-3.5 text-primary/80" />
                            <span className="text-xs font-medium text-muted-foreground">SOC 2 Compliant</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 ring-1 ring-border hover:scale-[1.02] transition-transform">
                            <Zap className="size-3.5 text-primary/80" />
                            <span className="text-xs font-medium text-muted-foreground">Enterprise Ready</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Section - Auth Form */}
            <div className="flex w-full flex-col lg:w-[45%]">
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-16">
                    {/* Mobile Logo */}
                    <div className="mb-10 w-full max-w-[400px] lg:hidden">
                        <Image
                            src="/logos/ngeeann-logo.png"
                            alt="Ngee Ann Polytechnic"
                            width={200}
                            height={60}
                            className="h-[52px] w-auto object-contain"
                            priority
                            unoptimized
                        />
                        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                            ACMV Analytics Studio
                        </h1>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                            AI-Assisted HVAC Energy Analytics
                        </p>
                    </div>

                    <div className="w-full max-w-[400px]">
                            {/* Header */}
                            <div className="mb-8">
                                <AnimatePresence mode="wait">
                                    <motion.h2
                                        key={mode}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.15 }}
                                        className="text-2xl font-bold text-foreground"
                                    >
                                        {mode === "signin" ? "Welcome back" : "Create account"}
                                    </motion.h2>
                                </AnimatePresence>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {mode === "signin"
                                        ? "Sign in to your account to continue."
                                        : "Get started with your free account today."}
                                </p>
                            </div>

                            {/* Error Message */}
                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                                    >
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Forms */}
                            <AnimatePresence mode="wait">
                                {mode === "signin" ? (
                                    <motion.form
                                        key="signin"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="space-y-5"
                                        onSubmit={handleSignIn}
                                    >
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-foreground">
                                                Email address
                                            </label>
                                            <Input
                                                name="email"
                                                type="email"
                                                placeholder="name@company.com"
                                                autoComplete="email"
                                                required
                                                className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-foreground">
                                                Password
                                            </label>
                                            <Input
                                                name="password"
                                                type="password"
                                                placeholder="Enter your password"
                                                autoComplete="current-password"
                                                required
                                                className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <label className="flex items-center gap-2 text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    className="size-4 rounded border-input bg-background text-primary focus:ring-ring"
                                                />
                                                Remember me
                                            </label>
                                            <button
                                                type="button"
                                                className="font-medium text-primary hover:text-primary/70 transition-colors"
                                            >
                                                Forgot password?
                                            </button>
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting || loginSuccess}
                                            className={cn(
                                                "h-12 w-full rounded-lg text-sm font-semibold tracking-wide shadow-md shadow-primary/15 transition-[box-shadow,colors] hover:shadow-lg hover:shadow-primary/20",
                                                loginSuccess && "bg-green-600 hover:bg-green-600 shadow-green-600/20"
                                            )}
                                        >
                                            {getSignInButtonContent()}
                                        </Button>
                                    </motion.form>
                                ) : (
                                    <motion.form
                                        key="signup"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="space-y-5"
                                        onSubmit={handleSignUp}
                                    >
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-foreground">
                                                    First name
                                                </label>
                                                <Input
                                                    name="firstName"
                                                    type="text"
                                                    placeholder="John"
                                                    autoComplete="given-name"
                                                    required
                                                    className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-foreground">
                                                    Last name
                                                </label>
                                                <Input
                                                    name="lastName"
                                                    type="text"
                                                    placeholder="Doe"
                                                    autoComplete="family-name"
                                                    required
                                                    className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-foreground">
                                                Work email
                                            </label>
                                            <Input
                                                name="email"
                                                type="email"
                                                placeholder="name@company.com"
                                                autoComplete="email"
                                                required
                                                className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-foreground">
                                                Password
                                            </label>
                                            <Input
                                                name="password"
                                                type="password"
                                                placeholder="Min. 8 characters"
                                                autoComplete="new-password"
                                                required
                                                className="h-11 rounded-lg border-border bg-muted/30 transition-colors focus:bg-background"
                                            />
                                        </div>
                                        <label className="flex items-start gap-2 text-sm text-muted-foreground">
                                            <input
                                                name="terms"
                                                type="checkbox"
                                                required
                                                className="mt-0.5 size-4 rounded border-input bg-background text-primary focus:ring-ring"
                                            />
                                            I agree to the Terms of Service and Privacy Policy
                                        </label>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting || loginSuccess}
                                            className={cn(
                                                "h-12 w-full rounded-lg text-sm font-semibold tracking-wide shadow-md shadow-primary/15 transition-[box-shadow,colors] hover:shadow-lg hover:shadow-primary/20",
                                                loginSuccess && "bg-green-600 hover:bg-green-600 shadow-green-600/20"
                                            )}
                                        >
                                            {getSignUpButtonContent()}
                                        </Button>
                                    </motion.form>
                                )}
                            </AnimatePresence>

                            {/* Mode Switch */}
                            <p className="mt-6 text-center text-sm text-muted-foreground">
                                {mode === "signin" ? (
                                    <>
                                        Don&apos;t have an account?{" "}
                                        <button
                                            type="button"
                                            onClick={() => handleModeChange("signup")}
                                            className="font-semibold text-primary hover:text-primary/80 transition-colors"
                                        >
                                            Sign up
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        Already have an account?{" "}
                                        <button
                                            type="button"
                                            onClick={() => handleModeChange("signin")}
                                            className="font-semibold text-primary hover:text-primary/80 transition-colors"
                                        >
                                            Sign in
                                        </button>
                                    </>
                                )}
                            </p>

                        {/* Copyright */}
                        <p className="mt-8 text-center text-[11px] text-muted-foreground/50">
                            &copy; 2026 LLM at Scale.AI. All Rights Reserved.
                            <br />
                            Confidential and Proprietary Information. Version 1.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
