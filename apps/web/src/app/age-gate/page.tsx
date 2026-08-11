"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
const DOCUMENT_VERSION = "2026-07-27";

export default function AgeGatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checkbox states
  const [ageConfirm, setAgeConfirm] = useState(false);
  const [termsConfirm, setTermsConfirm] = useState(false);
  const [privacyConfirm, setPrivacyConfirm] = useState(false);
  const [rulesConfirm, setRulesConfirm] = useState(false);

  useEffect(() => {
    // Verify authentication and check if consents already exist
    const checkAuthAndConsents = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/auth/me`, {
          credentials: "include",
        });

        if (!res.ok) {
          router.push("/login?redirect=/age-gate");
          return;
        }

        const user = await res.json();
        const userConsents = user.consents || [];

        // Check if all four required consents are already accepted
        const required = ["AGE_CONFIRMATION", "TERMS_OF_SERVICE", "PRIVACY_POLICY", "COMMUNITY_GUIDELINES"];
        const hasAll = required.every((reqType) =>
          userConsents.some((c: { type: string }) => c.type === reqType)
        );

        if (hasAll) {
          // If already accepted, bypass and go straight to chat
          router.push("/chat");
        } else {
          setLoading(false);
        }
      } catch (err) {
        setError("Unable to verify account status. Please check your connection.");
        setLoading(false);
      }
    };

    checkAuthAndConsents();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ageConfirm || !termsConfirm || !privacyConfirm || !rulesConfirm) {
      setError("You must accept all agreements to proceed.");
      return;
    }

    setError(null);
    setSubmitLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/auth/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          types: ["AGE_CONFIRMATION", "TERMS_OF_SERVICE", "PRIVACY_POLICY", "COMMUNITY_GUIDELINES"],
          version: DOCUMENT_VERSION,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to record consent.");
      }

      router.push("/chat");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const isFormValid = ageConfirm && termsConfirm && privacyConfirm && rulesConfirm;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400 font-sans">
        <div className="text-center space-y-4">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
          <p className="text-xs font-semibold tracking-wide">Checking registration profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100 font-sans overflow-hidden">
      
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-[450px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/10 via-zinc-950/0 to-zinc-950/0 pointer-events-none z-0" />

      <div className="relative w-full max-w-lg space-y-8 rounded-3xl border border-zinc-900 bg-zinc-900/35 backdrop-blur-md p-8 sm:p-10 shadow-2xl z-10">
        
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
          <h2 className="text-2xl font-black tracking-wide text-white">Age Verification & Rules</h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            You must be an adult and agree to our guidelines to connect with the chat community.
          </p>
        </div>

        {/* Notifications */}
        {error && (
          <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-3.5 text-xs text-red-300 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 rounded-2xl bg-zinc-950/45 p-6 border border-zinc-900 space-y-4.5">
            
            {/* Age Confirmation */}
            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="ageConfirm"
                  name="ageConfirm"
                  type="checkbox"
                  checked={ageConfirm}
                  onChange={(e) => setAgeConfirm(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-zinc-800 bg-zinc-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-950"
                />
              </div>
              <div className="ml-3.5 text-xs leading-5">
                <label htmlFor="ageConfirm" className="font-extrabold text-zinc-200 uppercase tracking-wide text-[10px]">
                  Confirm 18+ Age Requirement
                </label>
                <p className="text-zinc-500 text-[11px] mt-0.5 leading-relaxed">
                  PISTA is strictly an 18+ adult chat service. Underage entry is strictly banned.
                </p>
              </div>
            </div>

            <div className="h-[1px] bg-zinc-900" />

            {/* Terms Checkbox */}
            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="termsConfirm"
                  name="termsConfirm"
                  type="checkbox"
                  checked={termsConfirm}
                  onChange={(e) => setTermsConfirm(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-zinc-800 bg-zinc-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-950"
                />
              </div>
              <div className="ml-3.5 text-xs leading-5">
                <label htmlFor="termsConfirm" className="font-semibold text-zinc-200">
                  I accept the{" "}
                  <Link href="/terms" target="_blank" className="text-indigo-400 hover:text-indigo-300 font-bold underline transition">
                    Terms of Service
                  </Link>
                </label>
              </div>
            </div>

            {/* Privacy Checkbox */}
            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="privacyConfirm"
                  name="privacyConfirm"
                  type="checkbox"
                  checked={privacyConfirm}
                  onChange={(e) => setPrivacyConfirm(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-zinc-800 bg-zinc-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-950"
                />
              </div>
              <div className="ml-3.5 text-xs leading-5">
                <label htmlFor="privacyConfirm" className="font-semibold text-zinc-200">
                  I accept the{" "}
                  <Link href="/privacy" target="_blank" className="text-indigo-400 hover:text-indigo-300 font-bold underline transition">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            </div>

            {/* Rules Checkbox */}
            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  id="rulesConfirm"
                  name="rulesConfirm"
                  type="checkbox"
                  checked={rulesConfirm}
                  onChange={(e) => setRulesConfirm(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-zinc-800 bg-zinc-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-950"
                />
              </div>
              <div className="ml-3.5 text-xs leading-5">
                <label htmlFor="rulesConfirm" className="font-semibold text-zinc-200">
                  I accept the{" "}
                  <Link href="/community-guidelines" target="_blank" className="text-indigo-400 hover:text-indigo-300 font-bold underline transition">
                    Community Guidelines
                  </Link>
                </label>
              </div>
            </div>

          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!isFormValid || submitLoading}
              className="flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-4 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitLoading ? "Recording Consents..." : "Accept & Start Chatting"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
