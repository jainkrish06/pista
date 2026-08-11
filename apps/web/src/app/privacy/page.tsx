import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 md:py-24 text-zinc-300">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link href="/" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
            ← Back to PISTA Home
          </Link>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Last updated: July 27, 2026</p>
        </div>

        <hr className="border-zinc-800" />

        <div className="space-y-6 text-base leading-7">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">1. Core Privacy Principle: Data Minimization</h2>
            <p>
              At PISTA, we believe in collecting only what is absolutely necessary to connect you with
              others and protect our platform.
            </p>
            <p className="font-semibold text-indigo-400">
              We never record, store, or monitor your live audio and video chat streams.
            </p>
            <p>
              All video/audio communications are established peer-to-peer (P2P) directly between you
              and your chat partner. We only operate the signaling server to negotiate the peer connection.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">2. What Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account Information:</strong> If you sign up via email/password, we store your
                email, hashed password, and display name. If you use Google login, we collect your verified
                email and display name.
              </li>
              <li>
                <strong>Consent Logs:</strong> We store a record of your agreement to our terms, guidelines,
                and 18+ verification (type, document version, and timestamp).
              </li>
              <li>
                <strong>Safety & Risk Signals:</strong> Hashed IP addresses, report counts, and coarse risk
                signals are stored separately from public profiles to enforce bans and prevent evasion.
              </li>
              <li>
                <strong>Matchmaking Metadata:</strong> We store match timestamps, active state, and match termination
                reasons for performance monitoring and queue optimization.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">3. How We Use Information</h2>
            <p>We use the collected information to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Manage and authenticate your login sessions.</li>
              <li>Facilitate real-time peer matching and signaling.</li>
              <li>Investigate reports of misconduct and enforce community bans.</li>
              <li>Verify that all users are of legal age (18+).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">4. Data Sharing & Security</h2>
            <p>
              We do not sell, rent, or trade your personal data. We implement secure industry-standard hashing
              (e.g., Argon2, SHA-256) and HTTPS protocols to keep your credentials safe.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">5. Your Rights</h2>
            <p>
              You can delete your PISTA account at any time. When an account is deleted, all public profile
              data is anonymized, and personal records are permanently erased, subject only to immutable moderation
              logs necessary to maintain active bans.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
