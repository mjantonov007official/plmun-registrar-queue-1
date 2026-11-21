import { describe, expect, it } from "vitest";
import { byHour, dailyVolume, eachDay, summarize, toCsv } from "@/lib/analytics";

const base = {
  service_id: "s1",
  counter_id: "c1",
  served_by: null,
  queue_date: "2026-11-20",
};

describe("report calculations", () => {
  it("average wait is the time from taking a number until being called", () => {
    const s = summarize([
      {
        ...base,
        status: "completed",
        created_at: "2026-11-20T01:00:00Z",
        called_at: "2026-11-20T01:10:00Z",
        completed_at: "2026-11-20T01:15:00Z",
      },
      {
        ...base,
        status: "completed",
        created_at: "2026-11-20T01:00:00Z",
        called_at: "2026-11-20T01:20:00Z",
        completed_at: "2026-11-20T01:23:00Z",
      },
    ]);
    expect(s.avgWait).toBe(15);
    expect(s.avgService).toBe(4);
  });

  it("no-show rate counts no-shows out of finished tickets only", () => {
    const s = summarize([
      {
        ...base,
        status: "completed",
        created_at: "2026-11-20T01:00:00Z",
        called_at: null,
        completed_at: null,
      },
      {
        ...base,
        status: "completed",
        created_at: "2026-11-20T01:00:00Z",
        called_at: null,
        completed_at: null,
      },
      {
        ...base,
        status: "completed",
        created_at: "2026-11-20T01:00:00Z",
        called_at: null,
        completed_at: null,
      },
      {
        ...base,
        status: "no_show",
        created_at: "2026-11-20T01:00:00Z",
        called_at: null,
        completed_at: null,
      },
      {
        ...base,
        status: "waiting",
        created_at: "2026-11-20T01:00:00Z",
        called_at: null,
        completed_at: null,
      },
    ]);
    expect(s.noShowRate).toBe(0.25);
    expect(s.total).toBe(5);
  });

  it("daily volume includes days with zero tickets", () => {
    const rows = dailyVolume(
      [
        {
          ...base,
          status: "completed",
          queue_date: "2026-11-18",
          created_at: "2026-11-18T01:00:00Z",
          called_at: null,
          completed_at: null,
        },
      ],
      "2026-11-17",
      "2026-11-19",
    );
    expect(rows.map((r) => [r.date, r.total])).toEqual([
      ["2026-11-17", 0],
      ["2026-11-18", 1],
      ["2026-11-19", 0],
    ]);
    expect(eachDay("2026-11-30", "2026-12-01")).toEqual(["2026-11-30", "2026-12-01"]);
  });

  it("peak hours use Philippine time", () => {
    // 01:30 UTC = 9:30 AM in Manila
    const rows = byHour([
      {
        ...base,
        status: "waiting",
        created_at: "2026-11-20T01:30:00Z",
        called_at: null,
        completed_at: null,
      },
    ]);
    expect(rows.find((r) => r.hour === 9)?.total).toBe(1);
  });

  it("CSV export quotes commas and quotes", () => {
    expect(toCsv([["a,b", 'say "hi"', null]])).toBe('"a,b","say ""hi""",');
  });
});
