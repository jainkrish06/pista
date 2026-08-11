"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    // Check if user is logged in
    const checkUser = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/auth/me`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.profile);
        }
      } catch (err) {
        // Fail silently
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  const handleStartChatting = () => {
    if (user) {
      router.push("/age-gate");
    } else {
      router.push("/register");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${SERVER_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      router.refresh();
    } catch (err) {
      // Fail silently
    }
  };

  const faqs = [
    {
      q: "Is PISTA free to use?",
      a: "Yes, PISTA's core 1-to-1 video and text matchmaking service is completely free.",
    },
    {
      q: "How does matching work?",
      a: "Our backend connects you with another waiting user instantly. The matchmaking queue is random and optimized to prevent rematching with recently blocked users.",
    },
    {
      q: "Are my video calls recorded or stored?",
      a: "Absolutely not. In line with our strict data minimization policy, all video and audio traffic flows directly peer-to-peer (P2P) between browsers. PISTA never intercepts, records, or stores any stream contents.",
    },
    {
      q: "How do I report inappropriate behavior?",
      a: "You can click the Report button at any point during a chat. You can select a reason and add an optional description. All reports are evaluated anonymously by our admin moderators to protect your identity.",
    },
    {
      q: "Why do I need to agree to the Age Gate?",
      a: "PISTA is strictly an 18+ adult community. To maintain a safe and legal environment, we require all registered users to explicitly confirm their age and consent to our guidelines before chatting.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-600 selection:text-white overflow-x-hidden font-sans">
      
      {/* Premium Radial Indigo Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-600/15 via-zinc-950/0 to-zinc-950/0 pointer-events-none z-0" />

      {/* 1. Header Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-900/80 bg-zinc-950/65 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="text-xl font-black tracking-widest text-indigo-500 group-hover:text-indigo-400 transition-colors">
              PISTA
            </span>
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/20">
              18+
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <a href="#how-it-works" className="hover:text-zinc-200 transition-colors">How it Works</a>
            <a href="#safety" className="hover:text-zinc-200 transition-colors">Safety</a>
            <a href="#rules" className="hover:text-zinc-200 transition-colors">Rules</a>
            <a href="#faq" className="hover:text-zinc-200 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-4">
            {loading ? (
              <span className="text-zinc-600 text-xs font-medium">Verifying session...</span>
            ) : user ? (
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline text-xs text-zinc-400 font-semibold">
                  Logged in as <strong className="text-zinc-200">{user.displayName}</strong>
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/10 transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative mx-auto max-w-5xl px-6 py-24 md:py-36 text-center z-10">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-xs font-bold text-indigo-400 shadow-sm">
            <span>✨</span> Secure 1-to-1 Video & Text Chat
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400 leading-[1.1]">
            Meet Verified Strangers, <span className="text-indigo-500">Instantly</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Connect randomly with vetted users globally for encrypted P2P video, audio, and text chat. Built for privacy, filtered for safety, and completely free.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row justify-center items-center gap-4">
            <button
              onClick={handleStartChatting}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-indigo-600 px-8 py-4 text-sm font-black uppercase tracking-wider text-white hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 hover:scale-[1.02] transition duration-200 active:scale-[0.98]"
            >
              Start Chatting Now
            </button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 px-8 py-4 text-sm font-bold uppercase tracking-wider text-zinc-300 hover:text-white transition duration-200"
            >
              Learn More
            </a>
          </div>
          
          {/* Stats Bar */}
          <div className="pt-12 flex flex-wrap justify-center items-center gap-8 md:gap-14 text-zinc-500 text-xs">
            <div>
              <span className="block text-xl font-black text-zinc-200">5,000+</span> Online Right Now
            </div>
            <div className="hidden sm:block border-l border-zinc-900 h-8" />
            <div>
              <span className="block text-xl font-black text-zinc-200">100%</span> P2P Call Encryption
            </div>
            <div className="hidden sm:block border-l border-zinc-900 h-8" />
            <div>
              <span className="block text-xl font-black text-zinc-200">18+</span> Mandatory Age Gate
            </div>
          </div>
        </div>
      </section>

      {/* 3. How It Works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-24 border-t border-zinc-900">
        <div className="text-center space-y-3 mb-20">
          <h2 className="text-2xl font-black uppercase tracking-wider text-white">How It Works</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            PISTA matching is designed to be frictionless, secure, and instantaneous.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-8 space-y-4 hover:border-zinc-800/80 transition duration-200 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-extrabold text-sm border border-indigo-500/10">
              1
            </div>
            <h3 className="text-base font-bold text-zinc-200">Age Gate Verification</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Register securely and complete the mandatory 18+ age verification and safety agreements before entering the matching queue.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-8 space-y-4 hover:border-zinc-800/80 transition duration-200 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-extrabold text-sm border border-indigo-500/10">
              2
            </div>
            <h3 className="text-base font-bold text-zinc-200">Instant Queue matching</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Our real-time backend pairs you with compatible waiting peers globally. Skips and filters happen instantly without lag.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-8 space-y-4 hover:border-zinc-800/80 transition duration-200 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-extrabold text-sm border border-indigo-500/10">
              3
            </div>
            <h3 className="text-base font-bold text-zinc-200">Direct WebRTC Streaming</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Once matched, a direct peer-to-peer connection is established. Video and audio streams go browser-to-browser, never touching our servers.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Safety & Encryption Features */}
      <section id="safety" className="bg-zinc-900/20 border-y border-zinc-900 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            
            {/* Core Message info */}
            <div className="space-y-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Security & Protection</span>
              <h2 className="text-3xl font-black text-white tracking-wide">Privacy is Not Optional</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                PISTA is built from the ground up for strict data minimization. We only persist minimal authentication and moderation logs to keep the platform free of bad actors.
              </p>
              
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-5 w-5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs">✓</div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">True P2P Streaming</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Media connections utilize encrypted WebRTC protocols. No server persists or watches your calls.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-5 w-5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs">✓</div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Anti-Spoofing Validations</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Server validates signaling and chat relays at the Socket.IO layer, discarding unauthorized payloads.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-5 w-5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs">✓</div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Instant Blocks & Auto-Bans</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Reported users are immediately match-blocked. Accumulating 3 reports triggers an automated system ban.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Glassmorphic Mockup panel */}
            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl flex flex-col justify-between h-72 overflow-hidden group">
              <div className="absolute top-0 right-0 h-32 w-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">PISTA Call Session</span>
                <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Secure P2P</span>
              </div>
              <div className="py-4 space-y-2">
                <div className="h-2 w-3/4 rounded bg-zinc-900" />
                <div className="h-2 w-1/2 rounded bg-zinc-900" />
                <div className="h-2 w-5/6 rounded bg-zinc-900" />
              </div>
              <div className="flex items-center justify-between border-t border-zinc-900 pt-4 text-[10px] text-zinc-500">
                <span>STUN/ICE: Configured</span>
                <span>Signal Relay: Active</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. Community Rules */}
      <section id="rules" className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="space-y-4 mb-16">
          <h2 className="text-2xl font-black uppercase tracking-wider text-white">Community Guidelines</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            Maintaining a safe, welcoming, and legal space is our top priority.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 text-left">
          <div className="p-5 rounded-xl border border-zinc-900/60 bg-zinc-950 space-y-2.5">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">18+ Age Requirement</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">Strictly adult audience. Underage accounts are immediately banned on review.</p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-900/60 bg-zinc-950 space-y-2.5">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Zero Harassment</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">No hate speech, threats of violence, bullying, or abusive chat messages.</p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-900/60 bg-zinc-950 space-y-2.5">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Consent Mandatory</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">No non-consensual sharing of personal profiles, socials, or private media.</p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-900/60 bg-zinc-950 space-y-2.5">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">No Commercials</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">Spamming links, promotions, or scams results in immediate session revocation.</p>
          </div>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24 border-t border-zinc-900">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-2xl font-black uppercase tracking-wider text-white">Frequently Asked Questions</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Have questions about PISTA's architecture and privacy?
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-zinc-900 bg-zinc-900/10 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-bold text-zinc-200 hover:text-white transition-colors"
                >
                  <span>{faq.q}</span>
                  <span className="text-zinc-500 text-xs">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs text-zinc-400 leading-relaxed border-t border-zinc-900/40 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/80 py-12 text-center text-xs text-zinc-600">
        <div className="mx-auto max-w-7xl px-6 space-y-4">
          <p className="font-extrabold tracking-widest text-zinc-500 text-[10px]">PISTA — RANDOM CHAT</p>
          <p className="leading-relaxed max-w-md mx-auto">PISTA is a safe adult matching community. Video calls are peer-to-peer and protected under data minimization rules.</p>
          <div className="flex justify-center gap-6 text-[10px] font-bold text-zinc-500 uppercase">
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link href="/community-guidelines" className="hover:text-zinc-400 transition-colors">Guidelines</Link>
          </div>
          <p className="pt-4 text-[10px] text-zinc-700">© 2026 PISTA Inc. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
