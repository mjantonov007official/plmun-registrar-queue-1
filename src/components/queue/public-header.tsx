import { Link } from "@tanstack/react-router";
import { MonitorPlay, Ticket, UserRound } from "lucide-react";
import { BrandMark } from "./brand";

const linkClass =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

export function PublicHeader() {
  return (
    <header className="no-print border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandMark />
        <nav className="flex items-center gap-1">
          <Link to="/" className={linkClass} activeProps={{ className: "bg-secondary text-foreground" }} activeOptions={{ exact: true }}>
            <Ticket className="size-4" />
            <span className="hidden sm:inline">Get a number</span>
          </Link>
          <Link to="/display" className={linkClass}>
            <MonitorPlay className="size-4" />
            <span className="hidden sm:inline">Now serving</span>
          </Link>
          <Link to="/dashboard" className={linkClass}>
            <UserRound className="size-4" />
            <span className="hidden sm:inline">Staff</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
