import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Check,
  Loader2,
  MegaphoneIcon,
  PhoneForwarded,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countersQuery, servicesQuery } from "@/lib/queries";
import {
  STATUS_LABEL,
  formatMinutes,
  formatTime,
  manilaDateKey,
  minutesBetween,
  type Ticket,
} from "@/lib/queue";
import { useMe } from "@/hooks/use-staff";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_staff/dashboard")({
  head: () => ({
    meta: [
      { title: "Queue Console — PLMun Queue Management System" },
      { name: "description", content: "Registrar console for calling, recalling and completing queue numbers." },
      { property: "og:title", content: "Queue Console — PLMun Queue" },
      { property: "og:description", content: "Registrar console for calling queue numbers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const todayTicketsQuery = (day: string) =>
  queryOptions({
    queryKey: ["tickets", "day", day],
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("queue_date", day)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000,
  });

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (loaded) localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, loaded]);
  return [value, setValue, loaded] as const;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: services = [] } = useQuery(servicesQuery());
  const { data: counters = [] } = useQuery(countersQuery());
  const today = manilaDateKey(new Date());
  const { data: tickets = [], isLoading } = useQuery(todayTicketsQuery(today));
  const now = useNow();

  const activeCounters = counters.filter((c) => c.is_active);
  const [counterId, setCounterId, counterLoaded] = useStoredState<string | null>("plmun-counter", null);
  const [handled, setHandled, handledLoaded] = useStoredState<string[] | null>("plmun-services", null);

  useEffect(() => {
    if (counterLoaded && activeCounters.length && !activeCounters.some((c) => c.id === counterId)) {
      setCounterId(activeCounters[0]!.id);
    }
  }, [counterLoaded, activeCounters, counterId, setCounterId]);

  const activeServices = services.filter((s) => s.is_active);
  const handledIds = handledLoaded && handled ? handled.filter((id) => activeServices.some((s) => s.id === id)) : activeServices.map((s) => s.id);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const counterById = useMemo(() => new Map(counters.map((c) => [c.id, c])), [counters]);

  const current = tickets.find((t) => t.status === "serving" && t.counter_id === counterId) ?? null;
  const waiting = tickets.filter((t) => t.status === "waiting" && handledIds.includes(t.service_id));
  const allWaiting = tickets.filter((t) => t.status === "waiting");
  const otherServing = tickets.filter((t) => t.status === "serving" && t.counter_id !== counterId);
  const completed = tickets.filter((t) => t.status === "completed");
  const noShows = tickets.filter((t) => t.status === "no_show");
  const waits = tickets.map((t) => minutesBetween(t.created_at, t.called_at)).filter((x): x is number => x != null);
  const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["tickets"] });

  const callNext = useMutation({
    mutationFn: async () => {
      if (!counterId) throw new Error("Choose your window first");
      if (!handledIds.length) throw new Error("Select at least one service you handle");
      const { data, error } = await supabase.rpc("call_next_ticket", {
        _counter_id: counterId,
        _service_ids: handledIds,
      });
      if (error) throw error;
      return data as unknown as Ticket | null;
    },
    onSuccess: (t) => {
      if (!t) toast.info("No one is waiting for your services.");
      else toast.success(`Now serving ${t.ticket_code}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Ticket> }) => {
      const { error } = await supabase.from("tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const serveNow = useMutation({
    mutationFn: async (t: Ticket) => {
      if (!counterId) throw new Error("Choose your window first");
      const ts = new Date().toISOString();
      if (current) {
        const { error } = await supabase
          .from("tickets")
          .update({ status: "completed", completed_at: ts })
          .eq("id", current.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("tickets")
        .update({ status: "serving", counter_id: counterId, served_by: me?.id ?? null, called_at: ts })
        .eq("id", t.id)
        .eq("status", "waiting");
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const ts = () => new Date().toISOString();
  const busy = callNext.isPending || update.isPending || serveNow.isPending;
  const currentService = current ? serviceById.get(current.service_id) : null;
  const elapsed = current?.called_at ? (now - new Date(current.called_at).getTime()) / 60000 : null;

  return (
    <div>
      <PageHeader
        title="Queue console"
        subtitle={new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" }).format(new Date())}
        actions={
          <Select value={counterId ?? ""} onValueChange={setCounterId}>
            <SelectTrigger className="w-44 bg-paper">
              <SelectValue placeholder="Choose window" />
            </SelectTrigger>
            <SelectContent>
              {activeCounters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Waiting" value={allWaiting.length} tone="signal" />
        <Kpi label="Being served" value={tickets.filter((t) => t.status === "serving").length} />
        <Kpi label="Completed" value={completed.length} />
        <Kpi label="No-show" value={noShows.length} />
        <Kpi label="Avg. wait" value={formatMinutes(avgWait)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl bg-ink text-ink-foreground shadow-ticket">
          <div className="flex items-center justify-between border-b border-ink-line px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
              Now serving · {counterId ? counterById.get(counterId)?.name : "No window"}
            </p>
            {current && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <BellRing className="size-3.5" /> {formatMinutes(elapsed)}
              </span>
            )}
          </div>
          <div className="px-6 py-8">
            {current ? (
              <>
                <p className="ticket-code text-8xl text-signal">{current.ticket_code}</p>
                <p className="mt-2 text-lg font-semibold">{currentService?.name}</p>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <Info label="Student ID" value={current.student_id ?? "—"} />
                  <Info label="Name" value={current.customer_name ?? "—"} />
                  <Info label="Waited" value={formatMinutes(minutesBetween(current.created_at, current.called_at))} />
                </dl>
              </>
            ) : (
              <div className="py-6">
                <p className="ticket-code text-8xl text-ink-line">——</p>
                <p className="mt-2 text-ink-muted">No one at your window. Call the next number.</p>
              </div>
            )}
          </div>
          <div className="grid gap-2 border-t border-ink-line p-4 sm:grid-cols-4">
            <Button
              variant="signal"
              size="xl"
              className="sm:col-span-4"
              disabled={busy || !counterId}
              onClick={() => callNext.mutate()}
            >
              {callNext.isPending ? <Loader2 className="animate-spin" /> : <PhoneForwarded />}
              {current ? "Complete & call next" : "Call next number"}
            </Button>
            <Button
              variant="boardGhost"
              disabled={!current || busy}
              onClick={() =>
                current &&
                update.mutate({ id: current.id, patch: { called_at: ts(), recall_count: current.recall_count + 1 } })
              }
            >
              <MegaphoneIcon /> Recall
            </Button>
            <Button
              variant="boardGhost"
              disabled={!current || busy}
              onClick={() => current && update.mutate({ id: current.id, patch: { status: "completed", completed_at: ts() } })}
            >
              <Check /> Complete
            </Button>
            <Button
              variant="boardGhost"
              disabled={!current || busy}
              onClick={() => current && update.mutate({ id: current.id, patch: { status: "no_show", completed_at: ts() } })}
            >
              <UserX /> No-show
            </Button>
            <Button
              variant="boardGhost"
              disabled={!current || busy}
              onClick={() =>
                current &&
                update.mutate({ id: current.id, patch: { status: "waiting", counter_id: null, called_at: null } })
              }
            >
              <X /> Return to queue
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-paper p-5 shadow-soft">
          <h2 className="text-lg font-extrabold">Services I handle</h2>
          <p className="text-sm text-muted-foreground">"Call next" picks the earliest ticket from these.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {activeServices.map((s) => {
              const on = handledIds.includes(s.id);
              const count = allWaiting.filter((t) => t.service_id === s.id).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setHandled(on ? handledIds.filter((id) => id !== s.id) : [...handledIds, s.id])
                  }
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="ticket-code">{s.code}</span> {s.name}
                  <span className={cn("rounded-full px-1.5 text-xs", on ? "bg-primary-foreground/20" : "bg-secondary")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Other windows
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeCounters
              .filter((c) => c.id !== counterId)
              .map((c) => {
                const t = otherServing.find((x) => x.counter_id === c.id);
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-background px-3 py-2">
                    <p className="text-xs text-muted-foreground">{c.name}</p>
                    <p className="ticket-code text-xl">{t?.ticket_code ?? "—"}</p>
                  </div>
                );
              })}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-paper shadow-soft">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-extrabold">
            Waiting list <span className="text-muted-foreground">({waiting.length})</span>
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead className="hidden md:table-cell">Name</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && waiting.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No one is waiting. 🎉
                </TableCell>
              </TableRow>
            )}
            {waiting.map((t, i) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="ticket-code text-base">{t.ticket_code}</TableCell>
                <TableCell>{serviceById.get(t.service_id)?.name}</TableCell>
                <TableCell>{t.student_id ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{t.customer_name ?? "—"}</TableCell>
                <TableCell>{formatMinutes((now - new Date(t.created_at).getTime()) / 60000)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" disabled={busy || !counterId} onClick={() => serveNow.mutate(t)}>
                      Serve now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => update.mutate({ id: t.id, patch: { status: "cancelled", completed_at: ts() } })}
                      aria-label={`Cancel ${t.ticket_code}`}
                    >
                      <X />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-paper shadow-soft">
        <h2 className="px-5 py-4 text-lg font-extrabold">Recently finished</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Called</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets
              .filter((t) => ["completed", "no_show", "cancelled"].includes(t.status))
              .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
              .slice(0, 8)
              .map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="ticket-code">{t.ticket_code}</TableCell>
                  <TableCell>{serviceById.get(t.service_id)?.name}</TableCell>
                  <TableCell>{t.counter_id ? counterById.get(t.counter_id)?.name : "—"}</TableCell>
                  <TableCell>{formatTime(t.called_at)}</TableCell>
                  <TableCell>
                    <Badge variant={t.status}>{STATUS_LABEL[t.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "signal" }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-paper px-4 py-3 shadow-soft", tone === "signal" && "border-signal bg-signal/15")}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="ticket-code mt-1 text-3xl">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
