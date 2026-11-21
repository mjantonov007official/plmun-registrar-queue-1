import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countersQuery, servicesQuery } from "@/lib/queries";
import type { Counter, Service } from "@/lib/queue";
import { PageHeader } from "@/components/staff/page-header";
import { AdminOnly } from "@/components/staff/admin-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_staff/settings")({
  head: () => ({
    meta: [
      { title: "Services & Windows — PLMun Queue Management System" },
      {
        name: "description",
        content: "Manage registrar services, queue letter codes and service windows.",
      },
      { property: "og:title", content: "Services & Windows — PLMun Queue" },
      { property: "og:description", content: "Manage registrar services and windows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <Settings />
    </AdminOnly>
  ),
});

type ServiceDraft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
};

function Settings() {
  const qc = useQueryClient();
  const { data: services = [] } = useQuery(servicesQuery());
  const { data: counters = [] } = useQuery(countersQuery());
  const [svc, setSvc] = useState<ServiceDraft | null>(null);
  const [ctr, setCtr] = useState<{ id?: string; name: string; sort_order: number } | null>(null);

  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["counters"] });
  };
  const fail = (e: Error) =>
    toast.error(
      e.message.includes("foreign key")
        ? "This has ticket history — turn it off instead of deleting."
        : e.message,
    );

  const saveService = useMutation({
    mutationFn: async (d: ServiceDraft) => {
      const code = d.code.trim().toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(code)) throw new Error("Code must be 1–3 letters, e.g. E");
      if (!d.name.trim()) throw new Error("Name is required");
      const row = {
        code,
        name: d.name.trim(),
        description: d.description.trim() || null,
        sort_order: d.sort_order,
      };
      const { error } = d.id
        ? await supabase.from("services").update(row).eq("id", d.id)
        : await supabase.from("services").insert(row);
      if (error) throw error.code === "23505" ? new Error("That code is already used") : error;
    },
    onSuccess: () => {
      setSvc(null);
      done("Service saved");
    },
    onError: fail,
  });

  const toggleService = useMutation({
    mutationFn: async (s: Service) => {
      const { error } = await supabase
        .from("services")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => done("Service updated"),
    onError: fail,
  });

  const deleteService = useMutation({
    mutationFn: async (s: Service) => {
      const { error } = await supabase.from("services").delete().eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => done("Service deleted"),
    onError: fail,
  });

  const saveCounter = useMutation({
    mutationFn: async (d: { id?: string; name: string; sort_order: number }) => {
      if (!d.name.trim()) throw new Error("Name is required");
      const row = { name: d.name.trim(), sort_order: d.sort_order };
      const { error } = d.id
        ? await supabase.from("counters").update(row).eq("id", d.id)
        : await supabase.from("counters").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      setCtr(null);
      done("Window saved");
    },
    onError: fail,
  });

  const toggleCounter = useMutation({
    mutationFn: async (c: Counter) => {
      const { error } = await supabase
        .from("counters")
        .update({ is_active: !c.is_active })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => done("Window updated"),
    onError: fail,
  });

  const deleteCounter = useMutation({
    mutationFn: async (c: Counter) => {
      const { error } = await supabase.from("counters").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => done("Window deleted"),
    onError: fail,
  });

  return (
    <div>
      <PageHeader
        title="Services & windows"
        subtitle="Each service's letter becomes the start of its queue number, e.g. E-001."
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border bg-paper p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Services</h2>
            <Button
              size="sm"
              onClick={() =>
                setSvc({ code: "", name: "", description: "", sort_order: services.length + 1 })
              }
            >
              <Plus /> Add service
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {services.map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-3">
                <span className="ticket-code grid size-11 shrink-0 place-items-center rounded-lg bg-ink text-lg text-signal">
                  {s.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{s.description}</p>
                </div>
                <Switch
                  checked={s.is_active}
                  onCheckedChange={() => toggleService.mutate(s)}
                  aria-label={`Open ${s.name}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit"
                  onClick={() =>
                    setSvc({
                      id: s.id,
                      code: s.code,
                      name: s.name,
                      description: s.description ?? "",
                      sort_order: s.sort_order,
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => confirm(`Delete ${s.name}?`) && deleteService.mutate(s)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-paper p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Windows</h2>
            <Button
              size="sm"
              onClick={() =>
                setCtr({ name: `Window ${counters.length + 1}`, sort_order: counters.length + 1 })
              }
            >
              <Plus /> Add window
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {counters.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <p className="flex-1 font-semibold">{c.name}</p>
                <Switch
                  checked={c.is_active}
                  onCheckedChange={() => toggleCounter.mutate(c)}
                  aria-label={`Open ${c.name}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Rename"
                  onClick={() => setCtr({ id: c.id, name: c.name, sort_order: c.sort_order })}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => confirm(`Delete ${c.name}?`) && deleteCounter.mutate(c)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Dialog open={!!svc} onOpenChange={(o) => !o && setSvc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{svc?.id ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>
          {svc && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveService.mutate(svc);
              }}
            >
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Letter</Label>
                  <Input
                    id="code"
                    maxLength={3}
                    value={svc.code}
                    onChange={(e) => setSvc({ ...svc, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={svc.name}
                    onChange={(e) => setSvc({ ...svc, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  value={svc.description}
                  onChange={(e) => setSvc({ ...svc, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order">Display order</Label>
                <Input
                  id="order"
                  type="number"
                  value={svc.sort_order}
                  onChange={(e) => setSvc({ ...svc, sort_order: Number(e.target.value) })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveService.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!ctr} onOpenChange={(o) => !o && setCtr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ctr?.id ? "Rename window" : "Add window"}</DialogTitle>
          </DialogHeader>
          {ctr && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveCounter.mutate(ctr);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="cname">Name</Label>
                <Input
                  id="cname"
                  value={ctr.name}
                  onChange={(e) => setCtr({ ...ctr, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="corder">Display order</Label>
                <Input
                  id="corder"
                  type="number"
                  value={ctr.sort_order}
                  onChange={(e) => setCtr({ ...ctr, sort_order: Number(e.target.value) })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveCounter.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
