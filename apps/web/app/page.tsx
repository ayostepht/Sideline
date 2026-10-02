import { Card } from "../components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <Card className="p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Sideline</h1>
        <p className="mt-2 text-base text-muted-foreground">
          A self-hosted fantasy football analyzer for your Sleeper leagues.
        </p>
      </Card>
    </main>
  );
}
