import { useEffect, useRef } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BellRing, Clock, Printer, Ticket as TicketIcon, Users } from "lucide-react";
import { ticketStatusQuery } from "@/lib/queries";
import { APP_NAME, STATUS_LABEL, formatMinutes, formatTime } from "@/lib/queue";
import { PublicHeader } from "@/components/queue/public-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { playChime } from "@/lib/sound";

export const Route = createFileRoute("/ticket/$ticketId")({
  head: () => ({
    meta: [
      { title: "Your Queue Ticket — PLMun Queue Management System" },
      { name: "description", content: "Track your registrar queue number live and see how many people are ahead of you." },
      { property: "og:title", content: "Your Queue Ticket — PLMun Registrar" },
      { property: "og:description", content: "Track your registrar queue number live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(ticketStatusQuery(params.ticketId));
    if (!data) throw notFound();
  },
  notFoundComponent: () => (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl font-black">Ticket not found</h1>
        <p className="mt-2 text-muted-foreground">This ticket link is invalid or has been removed.</p>
        <Button asChild className="mt-6">
          <Link to="/">Get a new number</Link>
        </Button>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">We couldn't load this ticket</h1>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
      <Button asChild className="mt-6">
        <Link to="/">Back to start</Link>
      </Button>
    </div>
  ),
  component: TicketPage,
});

function TicketPage() {
  const { ticketId } = Route.useParams();
  const { data } = useSuspenseQuery(ticketStatusQuery(ticketId));
  const prevStatus = useRef(data?.status);

  useEffect(() => {
    if (!data) return;
    if (prevStatus.current === "waiting" && data.status === "serving") {
      playChime();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([300, 150, 300]);
    }
    prevStatus.current = data.status;
  }, [data]);

  if (!data) return null;
  const serving = data.status === "serving";
  const waiting = data.status === "waiting";

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-lg px-4 pb-16 pt-10">
        {serving && (
          <div className="no-print mb-6 flex items-center gap-3 rounded-2xl bg-success p-4 text-success-foreground shadow-soft animate-rise-in">
            <BellRing className="size-6 shrink-0" />
            <div>
              <p className="font-display text-lg font-extrabold">It's your turn!</p>
              <p className="text-sm opacity-90">Please proceed to {data.counter_name ?? "the counter"} now.</p>
            </div>
          </div>
        )}

        <article className="ticket-stub animate-rise-in overflow-hidden" style={{ ["--notch-y" as string]: "58%" }}>
          <div className="stripe-signal h-2" />
          <div className="px-7 pb-6 pt-6 text-center">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <TicketIcon className="size-3.5" /> Queue ticket
              </span>
              <span>{data.queue_date}</span>
            </div>
            <p className="mt-6 text-sm font-semibold text-muted-foreground">{data.service_name}</p>
            <p className="ticket-code mt-1 text-7xl text-foreground sm:text-8xl">{data.ticket_code}</p>
            <div className="mt-4 flex justify-center">
              <Badge variant={data.status}>{STATUS_LABEL[data.status]}</Badge>
            </div>
          </div>
          <div className="perforation mx-6" />
          <div className="grid grid-cols-2 gap-px bg-border/60">
            {serving ? (
              <Cell icon={<BellRing className="size-4" />} label="Go to" value={data.counter_name ?? "—"} wide />
            ) : waiting ? (
              <>
                <Cell icon={<Users className="size-4" />} label="Ahead of you" value={String(data.people_ahead)} />
                <Cell icon={<Clock className="size-4" />} label="Est. wait" value={data.people_ahead === 0 ? "You're next" : `~${formatMinutes(data.estimated_wait_minutes)}`} />
              </>
            ) : (
              <Cell
                icon={<Clock className="size-4" />}
                label={data.status === "completed" ? "Served at" : "Status"}
                value={data.status === "completed" ? formatTime(data.called_at) : STATUS_LABEL[data.status]}
                wide
              />
            )}
            <Cell label="Now serving" value={data.now_serving ?? "—"} mono />
            <Cell label="Issued" value={formatTime(data.created_at)} />
          </div>
        </article>

        <p className="no-print mt-6 text-center text-sm text-muted-foreground">
          This page updates automatically. Keep it open or take a photo of your number.
        </p>

        <div className="no-print mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => window.print()}>
            <Printer /> Print ticket
          </Button>
          <Button asChild variant="default" className="flex-1">
            <Link to="/">Take another number</Link>
          </Button>
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground">{APP_NAME}</p>
      </main>
    </div>
  );
}

function Cell({
  label,
  value,
  icon,
  wide,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  wide?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={`bg-paper px-6 py-4 ${wide ? "col-span-2" : ""}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon} {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold ${mono ? "ticket-code" : "font-display"}`}>{value}</p>
    </div>
  );
}
