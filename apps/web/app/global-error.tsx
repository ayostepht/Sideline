"use client";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <main style={{ maxWidth: 480, margin: "64px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Sideline hit a problem</h1>
          <p>Something went wrong on our side. Try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 44, minWidth: 44, padding: "0 16px", fontSize: 16 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
