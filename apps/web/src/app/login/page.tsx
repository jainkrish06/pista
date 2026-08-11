"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Login failed");
      }

      setSuccess("Successfully logged in!");
      setTimeout(() => {
        router.push("/chat");
      }, 1000);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${SERVER_URL}/auth/google`;
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100 font-sans overflow-hidden">
      
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-[400px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/10 via-zinc-950/0 to-zinc-950/0 pointer-events-none z-0" />

      <div className="relative w-full max-w-md space-y-8 rounded-3xl border border-zinc-900 bg-zinc-900/35 backdrop-blur-md p-8 sm:p-10 shadow-2xl z-10">
        
        {/* Header Logo */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="text-2xl font-black tracking-widest text-indigo-500 group-hover:text-indigo-400 transition-colors">
              PISTA
            </span>
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/20">
              18+
            </span>
          </Link>
          <h2 className="text-2xl font-black tracking-wide text-white">Welcome Back</h2>
          <p className="text-xs text-zinc-400">
            Sign in to your PISTA account to start chatting
          </p>
        </div>

        {/* Notifications */}
        {error && (
          <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-3.5 text-xs text-red-300 text-center font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-950/40 border border-emerald-900/40 p-3.5 text-xs text-emerald-300 text-center font-medium">
            {success}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                placeholder="you@example.com"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>

        {/* Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-900"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
            <span className="bg-zinc-950 px-3.5 text-zinc-500">Or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div>
          <button
            onClick={handleGoogleLogin}
            className="flex w-full justify-center items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 py-3 text-xs font-bold text-zinc-300 hover:text-zinc-200 transition"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Google</span>
          </button>
        </div>

        {/* Redirect */}
        <p className="text-center text-xs text-zinc-400">
          Don't have an account?{" "}
          <Link href="/register" className="font-semibold text-indigo-400 hover:text-indigo-300 transition">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
