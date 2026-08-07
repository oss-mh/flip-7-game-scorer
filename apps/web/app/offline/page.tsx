import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <main className="flex flex-col items-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-muted-foreground max-w-sm">
          This page hasn&apos;t been saved for offline use yet. Your existing games and scores are
          safe on this device — reconnect to load anything new.
        </p>
        <Link href="/">Back to games</Link>
      </main>
    </div>
  );
}
