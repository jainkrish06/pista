"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, displayName }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setSuccess("Account successfully created!");
      setTimeout(() => {
        router.push("/age-gate");
      }, 1000);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
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
          <h2 className="text-2xl font-black tracking-wide text-white">Create Account</h2>
          <p className="text-xs text-zinc-400">
            Join PISTA to meet and chat with verified users
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
              <label htmlFor="displayName" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
                Display Name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                placeholder="How should people call you?"
              />
            </div>

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
              <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Registering..." : "Register"}
            </button>
          </div>
        </form>

        {/* Redirect */}
        <p className="text-center text-xs text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300 transition">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
