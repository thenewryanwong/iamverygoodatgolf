import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-accent">404</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Off the fairway</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try again or head back home.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >Try again</button>
          <a href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">Home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1B3A2D" },
      { title: "AI golf swing coach" },
      { name: "description", content: "record your golf swing and get analytics based on angles, tempo, balance, and timestamped tips!" },
      { name: "author", content: "SwingSense" },
      { property: "og:title", content: "AI golf swing coach" },
      { property: "og:description", content: "record your golf swing and get analytics based on angles, tempo, balance, and timestamped tips!" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AI golf swing coach" },
      { name: "twitter:description", content: "record your golf swing and get analytics based on angles, tempo, balance, and timestamped tips!" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/542ff55f-a2ee-4f01-babb-c1b868b8bb19/id-preview-4f2fbbad--9bd44cbf-eaa3-43eb-a54c-111ec8805f01.lovable.app-1781854803702.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/542ff55f-a2ee-4f01-babb-c1b868b8bb19/id-preview-4f2fbbad--9bd44cbf-eaa3-43eb-a54c-111ec8805f01.lovable.app-1781854803702.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // After a redeploy, the browser may hold a route/chunk URL that no longer
    // exists. Reload once so it picks up the new asset manifest.
    const isStaleChunk = (msg: string) =>
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
    const reloadOnce = () => {
      const key = "__lov_chunk_reload";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    };
    const onErr = (e: ErrorEvent) => { if (e?.message && isStaleChunk(e.message)) reloadOnce(); };
    const onRej = (e: PromiseRejectionEvent) => {
      const m = (e?.reason && (e.reason.message || String(e.reason))) || "";
      if (isStaleChunk(m)) reloadOnce();
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    // Clear the guard after a successful load so future stale chunks can also recover.
    const t = setTimeout(() => sessionStorage.removeItem("__lov_chunk_reload"), 5000);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      clearTimeout(t);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
