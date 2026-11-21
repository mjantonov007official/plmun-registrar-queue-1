import { Link } from "@tanstack/react-router";
import { APP_SHORT } from "@/lib/queue";
import { cn } from "@/lib/utils";

export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <Link to="/" className={cn("group inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "grid size-10 place-items-center rounded-lg font-display text-lg font-black",
          inverted ? "bg-signal text-signal-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        P
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-base font-extrabold tracking-tight">{APP_SHORT}</span>
        <span
          className={cn(
            "mt-1 text-[11px] font-medium uppercase tracking-[0.18em]",
            inverted ? "text-ink-muted" : "text-muted-foreground",
          )}
        >
          Registrar's Office
        </span>
      </span>
    </Link>
  );
}
