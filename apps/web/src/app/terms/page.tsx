import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 md:py-24 text-zinc-300">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link href="/" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
            ← Back to PISTA Home
          </Link>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Last updated: July 27, 2026</p>
        </div>

        <hr className="border-zinc-800" />

        <div className="space-y-6 text-base leading-7">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing and using PISTA, you agree to comply with and be bound by these
              Terms of Service, our Privacy Policy, and our Community Guidelines. If you do
              not agree to all of these terms, you must not access or use the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">2. Age Requirement</h2>
            <p className="font-semibold text-amber-400">
              PISTA is strictly for individuals aged 18 and older.
            </p>
            <p>
              By accessing PISTA, you represent and warrant that you are at least 18 years
              of age. Any access or use of the platform by anyone under the age of 18 is
              strictly prohibited and constitutes a violation of these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">3. User Conduct & Conduct Restrictions</h2>
            <p>
              When using PISTA, you agree to act in a respectful and lawful manner. You are
              prohibited from:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Broadcasting nudity, sexually explicit content, or pornography.</li>
              <li>Harassing, threatening, abusing, or intimidating other users.</li>
              <li>Promoting hate speech, discrimination, or violence.</li>
              <li>Attempting to scam, spam, or defraud users.</li>
              <li>Broadcasting under the influence of illegal substances or committing illegal acts.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">4. No Log Policy</h2>
            <p>
              Your privacy is our priority. In alignment with our data minimization principle, PISTA
              does not record, intercept, or persist any video or audio contents of your chats.
              However, connection metadata and safety reports may be logged to enforce bans and prevent
              abuse.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">5. Account Termination & Bans</h2>
            <p>
              We reserve the right to suspend or permanently terminate your access to PISTA at our sole
              discretion, without notice or liability, if you violate any of our terms or guidelines.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white">6. Limitation of Liability</h2>
            <p>
              PISTA is provided "as is" and "as available". We make no warranties, express or implied,
              regarding the platform's reliability, availability, or suitability. We are not liable
              for any conduct of users on the platform.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
