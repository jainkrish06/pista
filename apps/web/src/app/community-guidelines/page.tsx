import Link from "next/link";

export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 md:py-24 text-zinc-300">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link href="/" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
            ← Back to PISTA Home
          </Link>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Community Guidelines
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Last updated: July 27, 2026</p>
        </div>

        <hr className="border-zinc-800" />

        <div className="space-y-6 text-base leading-7">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">Our Safety Mission</h2>
            <p>
              PISTA aims to provide a safe, respectful, and engaging space for adults (18+) to meet and
              chat with people around the world. These guidelines establish what behavior is allowed
              and what actions will result in immediate bans.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">1. Strict Age Gate (18+)</h2>
            <p className="text-amber-400 font-semibold">
              PISTA is strictly an 18+ platform.
            </p>
            <p>
              Minor protection is our highest priority. Do not enter this platform if you are under 18.
              Any accounts suspected of belonging to minors will be permanently banned, and serious violations
              will be escalated to the appropriate authorities.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">2. Prohibited Content</h2>
            <p>We have zero tolerance for the following behavior:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Sexual Content:</strong> Any broadcast of sexual acts, nudity, or pornography
                is strictly prohibited. Keep your clothes on and keep it appropriate.
              </li>
              <li>
                <strong>Harassment & Bullying:</strong> Do not insult, threaten, stalk, or attempt to intimidate
                your chat partners.
              </li>
              <li>
                <strong>Hate Speech:</strong> Discriminating against individuals based on race, ethnicity,
                national origin, religion, gender, sexual orientation, or disability is not allowed.
              </li>
              <li>
                <strong>Illegal Activities:</strong> Broadcasting drugs, weapons, violence, or promoting illegal acts
                will result in an immediate permanent ban.
              </li>
              <li>
                <strong>Spam & Scams:</strong> Do not use the platform to advertise products, services, discord groups,
                social media links, or attempt to fish for user data.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">3. How Reporting & Blocking Works</h2>
            <p>
              If your chat partner is violating these rules, please use the <strong>Report</strong> button
              immediately.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Reports are evaluated by our moderation team.</li>
              <li>Filing a report is completely anonymous; your partner will never know who reported them.</li>
              <li>You can also <strong>Block</strong> a user, which ends the match immediately and ensures you are never paired with them again.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">4. Enforcement & Appeals</h2>
            <p>
              Depending on the severity of the violation, we may issue a warning, a temporary ban (24 hours to 30 days),
              or a permanent ban. System bans are tied to your account and privacy-conscious risk metrics to prevent
              evasion.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
