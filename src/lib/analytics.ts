import { manilaHour, minutesBetween, type Ticket } from "./queue";

type T = Pick<
  Ticket,
  | "status"
  | "created_at"
  | "called_at"
  | "completed_at"
  | "queue_date"
  | "service_id"
  | "counter_id"
  | "served_by"
>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Minutes from taking a number until being called. */
export function waitMinutes(t: T) {
  return minutesBetween(t.created_at, t.called_at);
}

/** Minutes from being called until completed (completed tickets only). */
export function serviceMinutes(t: T) {
  return t.status === "completed" ? minutesBetween(t.called_at, t.completed_at) : null;
}

export function summarize(tickets: T[]) {
  const count = (s: Ticket["status"]) => tickets.filter((t) => t.status === s).length;
  const completed = count("completed");
  const noShow = count("no_show");
  const finished = completed + noShow;
  return {
    total: tickets.length,
    completed,
    noShow,
    cancelled: count("cancelled"),
    waiting: count("waiting"),
    serving: count("serving"),
    avgWait: mean(tickets.map(waitMinutes).filter((x): x is number => x != null)),
    avgService: mean(tickets.map(serviceMinutes).filter((x): x is number => x != null)),
    noShowRate: finished ? noShow / finished : 0,
    completionRate: tickets.length ? completed / tickets.length : 0,
  };
}

/** Every YYYY-MM-DD from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function dailyVolume(tickets: T[], from: string, to: string) {
  const days = eachDay(from, to);
  const map = new Map(
    days.map((d) => [d, { date: d, total: 0, completed: 0, no_show: 0, other: 0 }]),
  );
  for (const t of tickets) {
    const row = map.get(t.queue_date);
    if (!row) continue;
    row.total++;
    if (t.status === "completed") row.completed++;
    else if (t.status === "no_show") row.no_show++;
    else row.other++;
  }
  return days.map((d) => map.get(d)!);
}

export function byHour(tickets: T[], startHour = 7, endHour = 18) {
  const counts = new Map<number, number>();
  for (const t of tickets) {
    const h = manilaHour(t.created_at);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const hours = [...counts.keys()];
  const lo = Math.min(startHour, ...hours);
  const hi = Math.max(endHour, ...hours);
  const out: { hour: number; label: string; total: number }[] = [];
  for (let h = lo; h <= hi; h++) {
    const suffix = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ hour: h, label: `${h12}${suffix}`, total: counts.get(h) ?? 0 });
  }
  return out;
}

export function groupStats<K extends string>(
  tickets: T[],
  keyOf: (t: T) => string | null,
  names: Map<string, K | string>,
) {
  const groups = new Map<string, T[]>();
  for (const t of tickets) {
    const k = keyOf(t);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([id, list]) => {
      const s = summarize(list);
      return { id, name: String(names.get(id) ?? "Unknown"), ...s };
    })
    .sort((a, b) => b.total - a.total);
}

/** RFC 4180 CSV. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
