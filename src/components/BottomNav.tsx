import { Link, useRouterState } from "@tanstack/react-router";
import { Home, History, User, Video } from "lucide-react";

const items = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/record", icon: Video, label: "Record" },
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
        <div className="glass border border-border rounded-3xl shadow-lg">
          <div className="grid grid-cols-4">
            {items.map(({ to, icon: Icon, label }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex flex-col items-center justify-center py-3 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5 mb-0.5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
