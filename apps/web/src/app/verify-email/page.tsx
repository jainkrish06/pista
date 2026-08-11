"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Verifying your email address...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing from the URL.");
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/auth/verify-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Verification failed");
        }

        setStatus("success");
        setMessage("Your email has been verified successfully!");
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "An unexpected error occurred during verification.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="relative w-full max-w-md space-y-8 rounded-3xl border border-zinc-900 bg-zinc-900/35 backdrop-blur-md p-8 sm:p-10 shadow-2xl z-10 text-center">
      
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
        <h2 className="text-2xl font-black tracking-wide text-white">Email Verification</h2>
      </div>

      <div className="mt-4 p-5 rounded-2xl bg-zinc-950/45 border border-zinc-900 text-xs leading-relaxed">
        {status === "verifying" && <p className="text-zinc-500 animate-pulse font-medium">{message}</p>}
        {status === "success" && <p className="text-emerald-400 font-bold">{message}</p>}
        {status === "error" && <p className="text-red-400 font-medium">{message}</p>}
      </div>

      <div className="pt-2">
        <Link
          href="/login"
          className="flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 transition active:scale-[0.98]"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100 font-sans overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-[400px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/10 via-zinc-950/0 to-zinc-950/0 pointer-events-none z-0" />
      <Suspense fallback={<div className="text-zinc-500 text-xs font-semibold">Resolving parameters...</div>}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
