import { notFound } from "next/navigation";
import { GalleryClient } from "./gallery-client";
import { GalleryCore } from "./gallery-core";
import { GalleryStates } from "./gallery-states";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gallery | Sideline", robots: { index: false } };

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  if (process.env.NODE_ENV === "production" && process.env.SIDELINE_GALLERY !== "1") notFound();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 lg:p-8" data-testid="gallery-page">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Component gallery</h1>
          <p className="text-sm text-muted-foreground">Every component in every state.</p>
        </div>
        <GalleryClient part="theme" />
      </header>
      <GalleryCore />
      <GalleryStates />
      <GalleryClient part="why" open={open} />
      <GalleryClient part="primitives" open={open} />
    </main>
  );
}
