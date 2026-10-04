import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

/**
 * T6.1c (HOST-8): the page `proxy.ts` redirects unauthenticated requests to. Global, not
 * league-scoped: there is no league context here yet.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-3 py-6">
      <div className="w-full max-w-sm">
        <p
          className="mb-6 text-center text-lg font-semibold tracking-tight"
          data-testid="login-wordmark"
        >
          Sideline
        </p>
        <Card data-testid="login-card">
          <CardHeader>
            <h1 className="text-xl font-bold">Log in</h1>
            <p className="text-sm text-muted-foreground">Enter the password to continue.</p>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
