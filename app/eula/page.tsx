export default function EulaPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
        End User License Agreement
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Luca AI · Luca Technology</p>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <p>
          Luca AI is provided by Luca Technology. By using Luca AI you agree to
          use the product for lawful purposes and not to misuse generated
          output or connected accounts.
        </p>
        <p>
          Connecting Vercel grants Luca permission to publish sites to the
          Vercel account you authorize. You can disconnect at any time.
        </p>
        <p>
          The service is provided as-is. Questions:{" "}
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
