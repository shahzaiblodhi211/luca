export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Luca AI · Luca Technology</p>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <p>
          Luca AI collects the account information you provide (such as name and
          email), project prompts, and files you upload so we can run the
          product.
        </p>
        <p>
          If you connect Vercel, we store an access token so we can publish
          sites to your Vercel account. We do not sell your personal data.
        </p>
        <p>
          Questions:{" "}
          <a
            href="mailto:hello@lucaai.app"
            className="text-zinc-100 underline underline-offset-2"
          >
            hello@lucaai.app
          </a>
        </p>
      </div>
    </main>
  );
}
