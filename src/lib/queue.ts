import type { Database } from "@/integrations/supabase/types";

export const APP_NAME = "PLMun Queue Management System";
export const APP_SHORT = "PLMun Queue";
export const QUEUE_TZ = "Asia/Manila";

export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type Service = Database["public"]["Tables"]["services"]["Row"];
export type Counter = Database["public"]["Tables"]["counters"]["Row"];
export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  waiting: "Waiting",
  serving: "Now serving",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export type TicketStatusInfo = {
  ticket_code: string;
  service_name: string;
  status: TicketStatus;
  counter_name: string | null;
  created_at: string;
  called_at: string | null;
  queue_date: string;
  people_ahead: number;
  now_serving: string | null;
  estimated_wait_minutes: number;
};

export type BoardData = {
  counters: {
    counter_id: string;
    counter_name: string;
    ticket_code: string | null;
    service_name: string | null;
    called_at: string | null;
  }[];
  services: {
    id: string;
    code: string;
    name: string;
    waiting_count: number;
    up_next: string[];
  }[];
  server_time: string;
};

export type TakeNumberResult = {
  id: string;
  ticket_code: string;
  service_name: string;
  people_ahead: number;
};

/** YYYY-MM-DD for a date in Philippine time. */
export function manilaDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Hour of day (0-23) in Philippine time. */
export function manilaHour(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: QUEUE_TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(h) % 24;
}

export function formatTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: QUEUE_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return diff >= 0 ? diff : null;
}
