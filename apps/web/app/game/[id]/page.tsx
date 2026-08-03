export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-1 items-center justify-center">
      <main className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Game {id}</h1>
        <p className="text-muted-foreground">Round play — coming soon.</p>
      </main>
    </div>
  );
}
