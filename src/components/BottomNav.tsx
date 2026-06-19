import { Link, useRouterState } from "@tanstack/react-router";
import { Home, History, User, Video } from "lucide-react";

// Four-column nav with an empty slot in column 3 reserved for the floating
// Record button. Without this spacer the FAB sits on top of one of the nav
// links and intercepts its clicks (the History tab becomes un-tappable).
const items = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/history", icon: History, label: "History" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  // hide on record route to maximize camera real estate
  if (pathname.startsWith("/record")) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="mx-auto max-w-[480px] px-4 pb-2">
        <div className="relative glass border border-border rounded-3xl shadow-lg">
          <div className="grid grid-cols-4">
            <NavItem item={items[0]} pathname={pathname} />
            <NavItem item={items[1]} pathname={pathname} />
            {/* spacer column reserved for the floating Record FAB */}
            <div aria-hidden className="py-3" />
            <NavItem item={items[2]} pathname={pathname} />
          </div>
          <Link
            to="/record"
            aria-label="Record swing"
            className="absolute -top-7 left-1/2 -translate-x-1/2 h-16 w-16 rounded-full hero-gradient text-primary-foreground grid place-items-center shadow-xl ring-4 ring-background"
          >
            <Video className="h-6 w-6" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  item: { to, icon: Icon, label },
  pathname,
}: {
  item: (typeof items)[number];
  pathname: string;
}) {
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center py-3 text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-5 w-5 mb-0.5" />
      {label}
    </Link>
  );
}
