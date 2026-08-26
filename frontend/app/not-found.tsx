import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-lg">
        <p className="text-5xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-3 text-xl font-semibold">This page does not exist</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The page may have moved. Head back to your workspace to continue preparing.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
          <Link href="/" className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground surface-transition">Home</Link>
          <Link href="/prepare" className="rounded-full border px-4 py-2 font-semibold surface-transition hover:bg-accent">Prepare</Link>
          <Link href="/interview" className="rounded-full border px-4 py-2 font-semibold surface-transition hover:bg-accent">Interview</Link>
        </div>
      </div>
    </main>
  );
}
