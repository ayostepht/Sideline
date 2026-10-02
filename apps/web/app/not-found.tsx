import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../components/empty-state";
import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <EmptyState
        icon={SearchX}
        title="We could not find that page"
        message="The league or page may not exist."
        action={
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
        className="py-24"
      />
    </main>
  );
}
