import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { boardQuery } from "@/lib/queries";
import { QUEUE_TZ } from "@/lib/queue";
import { announce, playChime, speakableCode } from "@/lib/sound";
import { BrandMark } from "@/components/queue/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/display")({
  head: () => ({
    meta: [
      { title: "Now Serving — PLMun Queue Management System" },
      { name: "description", content: "Live registrar display board showing which queue numbers are being served at each window." },
      { property: "og:title", content: "Now Serving — PLMun Registrar" },
      { property: "og:description", content: "Live registrar display board for PLMun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(boardQuery()),
  component: DisplayBoard,
});

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function DisplayBoard() {
  const { data } = useSuspenseQuery(boardQuery());
  const now = useClock();
  const [sound, setSound] = useState(false);
  const [flashing, setFlashing] = useState<Record<string, number>>({});
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const current = new Map(
      data.counters.map((c) => [c.counter_id, `${c.ticket_code ?? ""}|${c.called_at ?? ""}`]),
    );
    if (seen.current) {
      const changed = data.counters.filter(
        (c) => c.ticket_code && seen.current?.get(c.counter_id) !== current.get(c.counter_id),
      );
      if (changed.length) {
        setFlashing((f) => {
          const next = { ...f };
          changed.forEach((c) => (next[c.counter_id] = Date.now()));
          return next;
        });
        if (sound) {
          playChime();
          changed.forEach((c) =>
            announce(`Now serving ${speakableCode(c.ticket_code!)}, at ${c.counter_name}`),
          );
        }
      }
    }
    seen.current = current;
  }, [data, sound]);

  const totalWaiting = data.services.reduce((n, s) => n + Number(s.waiting_count), 0);

  return (
    <div className="board-surface flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-ink-line px-6 py-4 lg:px-10">
        <BrandMark inverted />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="ticket-code text-3xl text-ink-foreground">
              {now
                ? new Intl.DateTimeFormat("en-PH", { timeZone: QUEUE_TZ, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now)
                : "--:--"}
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
              {now
                ? new Intl.DateTimeFormat("en-PH", { timeZone: QUEUE_TZ, weekday: "long", month: "long", day: "numeric" }).format(now)
                : ""}
            </p>
          </div>
          <Button
            variant="boardGhost"
            size="icon"
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            onClick={() => {
              const next = !sound;
              setSound(next);
              if (next) playChime();
            }}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="boardGhost"
            size="icon"
            aria-label="Full screen"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize />
          </Button>
        </div>
      </header>

      <main className="grid flex-1 gap-6 p-6 lg:grid-cols-[1fr_380px] lg:p-10">
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <h1 className="text-4xl font-black text-ink-foreground lg:text-5xl">Now serving</h1>
            <p className="text-sm uppercase tracking-[0.18em] text-ink-muted">
              {totalWaiting} waiting
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.counters.map((c) => (
              <div
                key={`${c.counter_id}-${flashing[c.counter_id] ?? 0}`}
                className={cn(
                  "rounded-2xl border border-ink-line p-6",
                  flashing[c.counter_id] && "animate-call-flash",
                )}
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-muted">
                  {c.counter_name}
                </p>
                <p
                  className={cn(
                    "ticket-code mt-2 text-7xl lg:text-8xl",
                    c.ticket_code ? "text-signal" : "text-ink-line",
                  )}
                >
                  {c.ticket_code ?? "——"}
                </p>
                <p className="mt-2 h-5 text-sm text-ink-muted">{c.service_name ?? "Available"}</p>
              </div>
            ))}
            {data.counters.length === 0 && (
              <p className="text-ink-muted">No windows are open.</p>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-ink-line p-6">
          <h2 className="text-xl font-extrabold text-ink-foreground">Up next</h2>
          <div className="mt-4 space-y-5">
            {data.services.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink-foreground">
                    <span className="ticket-code mr-2 text-signal">{s.code}</span>
                    {s.name}
                  </span>
                  <span className="text-ink-muted">{s.waiting_count}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.up_next.length ? (
                    s.up_next.map((code) => (
                      <span
                        key={code}
                        className="ticket-code rounded-md bg-ink-line px-2.5 py-1 text-base text-ink-foreground"
                      >
                        {code}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-ink-muted">No one waiting</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
      <div className="stripe-signal h-2" />
    </div>
  );
}
