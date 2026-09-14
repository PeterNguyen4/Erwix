import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Use & Privacy Policy — Erwix",
  description: "Terms of Use and Privacy Policy for Erwix.",
};

const LAST_UPDATED = "September 14, 2026";

export default function LegalPage() {
  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft size={14} strokeWidth={2} />
          Back to Erwix
        </a>

        <header className="mt-6 mb-8">
          <h1 className="text-3xl font-semibold text-fg">Terms of Use &amp; Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 rounded-lg border border-border bg-panel p-4 text-sm text-fg">
            Erwix is a personal project intended only for paper (simulated) trading.
          </p>
        </header>

        <section className="space-y-4 text-[15px] leading-relaxed text-fg">
          <h2 className="text-xl font-semibold text-fg">Terms of Use</h2>

          <div>
            <h3 className="font-medium text-fg">1. Nature of the service</h3>
            <p className="mt-1 text-muted">
              Erwix is a personal, non-commercial project. It is not an investment advisor and
              is not affiliated with any brokerage.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">2. Paper trading only</h3>
            <p className="mt-1 text-muted">
              Any brokerage connection is used in paper (simulated) trading mode only. Charts,
              backtests, journal entries, and AI-generated summaries are provided for reference
              only. They do not constitute financial advice or a recommendation to buy or sell any
              security.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">3. Third-party accounts</h3>
            <p className="mt-1 text-muted">
              A connected brokerage account remains subject to that provider&apos;s own terms. A user
              may disconnect their account at any time in settings.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">4. No warranty</h3>
            <p className="mt-1 text-muted">
              Erwix is provided as-is, without warranty of any kind and without guaranteed
              uptime. The developer is not liable for any loss arising from use of the service.
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-fg">
          <h2 className="text-xl font-semibold text-fg">Privacy Policy</h2>

          <div>
            <h3 className="font-medium text-fg">1. Information collected</h3>
            <p className="mt-1 text-muted">
              Username, email address, and a hashed password; an encrypted brokerage access token
              for any connected account; and content created within the app, such as journal
              entries, strategies, and backtests.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">2. Use of information</h3>
            <p className="mt-1 text-muted">
              Information is used solely to operate the app, including user authentication, portfolio display, and data persistence.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">3. Sharing of information</h3>
            <p className="mt-1 text-muted">
              Information is not sold or shared for marketing purposes. Brokerage tokens are used
              only to call that brokerage&apos;s API on the user&apos;s behalf.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">4. Data retention and deletion</h3>
            <p className="mt-1 text-muted">
              A brokerage account can be disconnected at any time in settings, which removes its
              stored access token.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">5. Security</h3>
            <p className="mt-1 text-muted">
              Passwords are hashed and brokerage tokens are stored encrypted. No method of storage
              or transmission can be guaranteed fully secure.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-fg">6. Age restriction</h3>
            <p className="mt-1 text-muted">Erwix is not intended for use by anyone under 18.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
