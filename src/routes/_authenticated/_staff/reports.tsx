import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Download, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { countersQuery, servicesQuery } from "@/lib/queries";
import { byHour, dailyVolume, groupStats, summarize, toCsv, waitMinutes, serviceMinutes } from "@/lib/analytics";
import { STATUS_LABEL, formatMinutes, formatTime, manilaDateKey, type Ticket } from "@/lib/queue";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_staff/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — PLMun Queue Management System" },
      { name: "description", content: "Queue volume, waiting times, peak hours and window performance for the PLMun Registrar." },
      { property: "og:title", content: "Reports & Analytics — PLMun Queue" },
      { property: "og:description", content: "Registrar queue analytics and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

const rangeTicketsQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["tickets", "range", from, to],
    queryFn: async (): Promise<Ticket[]> => {
      const all: Ticket[] = [];
      const page = 1000;
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from("tickets")
          .select("*")
          .gte("queue_date", from)
          .lte("queue_date", to)
          .order("created_at", { ascending: true })
          .range(i * page, i * page + page - 1);
        if (error) throw error;
        all.push(...data);
        if (data.length < page) break;
      }
      return all;
    },
  });

const staffNamesQuery = () =>
  queryOptions({
    queryKey: ["profiles", "names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

function shiftDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Preset = "today" | "7d" | "30d" | "month" | "custom";

const volumeConfig = {
  completed: { label: "Completed", color: "var(--chart-1)" },
  no_show: { label: "No-show", color: "var(--chart-4)" },
  other: { label: "Waiting / cancelled", color: "var(--chart-2)" },
} satisfies ChartConfig;
const hourConfig = { total: { label: "Tickets", color: "var(--chart-2)" } } satisfies ChartConfig;
const serviceConfig = { total: { label: "Tickets", color: "var(--chart-1)" } } satisfies ChartConfig;

function Reports() {
  const today = manilaDateKey(new Date());
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState({ from: shiftDays(today, -6), to: today });
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const { from, to } = useMemo(() => {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "7d":
        return { from: shiftDays(today, -6), to: today };
      case "30d":
        return { from: shiftDays(today, -29), to: today };
      case "month":
        return { from: `${today.slice(0, 7)}-01`, to: today };
      default:
        return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
    }
  }, [preset, custom, today]);

  const { data: raw = [], isLoading } = useQuery(rangeTicketsQuery(from, to));
  const { data: services = [] } = useQuery(servicesQuery());
  const { data: counters = [] } = useQuery(countersQuery());
  const { data: people = [] } = useQuery(staffNamesQuery());

  const tickets = serviceFilter === "all" ? raw : raw.filter((t) => t.service_id === serviceFilter);
  const serviceNames = new Map(services.map((s) => [s.id, s.name]));
  const counterNames = new Map(counters.map((c) => [c.id, c.name]));
  const staffNames = new Map(people.map((p) => [p.id, p.full_name || p.email || "Staff"]));

  const summary = summarize(tickets);
  const daily = dailyVolume(tickets, from, to).map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }),
  }));
  const hourly = byHour(tickets);
  const perService = groupStats(tickets, (t) => t.service_id, serviceNames);
  const perCounter = groupStats(tickets, (t) => t.counter_id, counterNames);
  const perStaff = groupStats(tickets, (t) => t.served_by, staffNames);
  const peak = hourly.reduce((m, h) => (h.total > m.total ? h : m), hourly[0] ?? { label: "—", total: 0 });

  function exportCsv() {
    const rows = [
      ["Date", "Ticket", "Service", "Student ID", "Name", "Status", "Window", "Served by", "Issued", "Called", "Finished", "Wait (min)", "Service (min)"],
      ...tickets.map((t) => [
        t.queue_date,
        t.ticket_code,
        serviceNames.get(t.service_id) ?? "",
        t.student_id,
        t.customer_name,
        STATUS_LABEL[t.status],
        t.counter_id ? counterNames.get(t.counter_id) : "",
        t.served_by ? staffNames.get(t.served_by) : "",
        t.created_at,
        t.called_at,
        t.completed_at,
        waitMinutes(t)?.toFixed(1),
        serviceMinutes(t)?.toFixed(1),
      ]),
    ];
    const blob = new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plmun-queue-report_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        subtitle={`${from === to ? from : `${from} → ${to}`} · ${serviceFilter === "all" ? "All services" : serviceNames.get(serviceFilter)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Button onClick={exportCsv} disabled={!tickets.length}>
              <Download /> Export CSV
            </Button>
          </>
        }
      />

      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "Today"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
            ["month", "This month"],
            ["custom", "Custom"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              preset === k ? "border-ink bg-ink text-ink-foreground" : "border-border bg-paper text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40 bg-paper" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="w-40 bg-paper" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        <div className="ml-auto">
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-56 bg-paper">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Total tickets" value={summary.total} dark />
            <Kpi label="Served" value={summary.completed} />
            <Kpi label="No-show rate" value={`${Math.round(summary.noShowRate * 100)}%`} />
            <Kpi label="Avg. wait" value={formatMinutes(summary.avgWait)} />
            <Kpi label="Avg. service" value={formatMinutes(summary.avgService)} />
            <Kpi label="Peak hour" value={peak.total ? peak.label : "—"} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Daily volume" subtitle="Tickets issued per day">
              <ChartContainer config={volumeConfig} className="h-72 w-full">
                <BarChart data={daily}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" />
                  <Bar dataKey="no_show" stackId="a" fill="var(--color-no_show)" />
                  <Bar dataKey="other" stackId="a" fill="var(--color-other)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </Panel>
            <Panel title="Peak hours" subtitle="When students take numbers (Philippine time)">
              <ChartContainer config={hourConfig} className="h-72 w-full">
                <BarChart data={hourly}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <Panel title="Tickets by service">
              <ChartContainer config={serviceConfig} className="h-72 w-full">
                <BarChart data={perService} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={150} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </Panel>
            <Panel title="Service performance">
              <StatsTable rows={perService} label="Service" />
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Window performance">
              <StatsTable rows={perCounter} label="Window" />
            </Panel>
            <Panel title="Staff performance">
              <StatsTable rows={perStaff} label="Staff" />
            </Panel>
          </div>

          <Panel title={`Ticket log (${tickets.length})`} subtitle="Latest 200 shown — export CSV for the full list" className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Wait</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...tickets].reverse().slice(0, 200).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{t.queue_date}</TableCell>
                    <TableCell className="ticket-code">{t.ticket_code}</TableCell>
                    <TableCell>{serviceNames.get(t.service_id)}</TableCell>
                    <TableCell>{t.student_id ?? "—"}</TableCell>
                    <TableCell>{t.counter_id ? counterNames.get(t.counter_id) : "—"}</TableCell>
                    <TableCell>{formatTime(t.created_at)}</TableCell>
                    <TableCell>{formatMinutes(waitMinutes(t))}</TableCell>
                    <TableCell>
                      <Badge variant={t.status}>{STATUS_LABEL[t.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!tickets.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No tickets in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, dark }: { label: string; value: string | number; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-4 shadow-soft", dark ? "border-ink bg-ink text-ink-foreground" : "border-border bg-paper")}>
      <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", dark ? "text-ink-muted" : "text-muted-foreground")}>{label}</p>
      <p className={cn("ticket-code mt-1 text-3xl", dark && "text-signal")}>{value}</p>
    </div>
  );
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-paper p-5 shadow-soft", className)}>
      <h2 className="text-lg font-extrabold">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatsTable({ rows, label }: { rows: ReturnType<typeof groupStats>; label: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Tickets</TableHead>
          <TableHead className="text-right">Served</TableHead>
          <TableHead className="text-right">No-show</TableHead>
          <TableHead className="text-right">Avg. wait</TableHead>
          <TableHead className="text-right">Avg. service</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-right">{r.total}</TableCell>
            <TableCell className="text-right">{r.completed}</TableCell>
            <TableCell className="text-right">{r.noShow}</TableCell>
            <TableCell className="text-right">{formatMinutes(r.avgWait)}</TableCell>
            <TableCell className="text-right">{formatMinutes(r.avgService)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
