import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { boardQuery, servicesQuery } from "@/lib/queries";
import { APP_NAME, type Service, type TakeNumberResult } from "@/lib/queue";
import {
  isUserType,
  TRANSACTION_NOTE_OPTIONS,
  TRANSACTION_OPTIONS,
  USER_TYPES,
  type UserType,
  validateQueueRequest,
} from "@/lib/transactions";
import { PublicHeader } from "@/components/queue/public-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Get a Queue Number — PLMun Queue Management System" },
      {
        name: "description",
        content:
          "Pick a registrar service at PLMun and get your queue number instantly. No more long lines.",
      },
      { property: "og:title", content: "Get a Queue Number — PLMun Registrar" },
      {
        property: "og:description",
        content: "Pick a registrar service at PLMun and get your queue number instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(servicesQuery()),
  component: KioskPage,
});

function KioskPage() {
  const { data: services } = useSuspenseQuery(servicesQuery());
  const { data: board } = useQuery(boardQuery());
  const [selected, setSelected] = useState<Service | null>(null);
  const [userType, setUserType] = useState<UserType | "">("");
  const active = services.filter((s) => s.is_active);

  const waitingFor = (id: string) => board?.services.find((s) => s.id === id)?.waiting_count ?? 0;
  const totalWaiting = board?.services.reduce((n, s) => n + Number(s.waiting_count), 0) ?? 0;

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div className="animate-rise-in">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="size-2 rounded-full bg-success" /> Open today
            </p>
            <h1 className="text-4xl font-black leading-[0.95] sm:text-6xl">
              Skip the line.
              <br />
              <span className="text-primary">Take a number.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              Choose a Registrar service, tell us who you are, and we'll call your number when it’s your turn.
            </p>
          </div>
          <div className="flex gap-3 lg:justify-end">
            <Stat label="People waiting" value={totalWaiting} />
            <Stat label="Services open" value={active.length} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
            1 — Who is requesting a service?
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {USER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={userType === type}
                onClick={() => setUserType(type)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${userType === type ? "border-primary bg-primary text-primary-foreground" : "border-border bg-paper hover:border-primary"}`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
            2 — Choose a transaction category
          </h2>
          {!userType ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-muted-foreground">
              Choose your user type to see available transactions.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="group animate-rise-in flex flex-col rounded-2xl border border-border bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <span className="ticket-code grid size-14 place-items-center rounded-xl bg-ink text-2xl text-signal">
                      {s.code}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                      <Users className="size-3.5" /> {waitingFor(s.id)} waiting
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold">{s.name}</h3>
                  {s.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Get number{" "}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              ))}
              {active.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border p-8 text-muted-foreground">
                  No services are open right now. Please check back later.
                </p>
              )}
            </div>
          )}
        </section>
      </main>
      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        {APP_NAME}
      </footer>

      <TakeNumberDialog service={selected} userType={userType} onClose={() => setSelected(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-36 rounded-2xl bg-ink px-5 py-4 text-ink-foreground shadow-soft">
      <div className="ticket-code text-4xl text-signal">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </div>
    </div>
  );
}

function TakeNumberDialog({
  service,
  userType,
  onClose,
}: {
  service: Service | null;
  userType: UserType | "";
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [transactions, setTransactions] = useState<string[]>([]);
  const [transactionNote, setTransactionNote] = useState("");
  const [step, setStep] = useState<"transactions" | "details">("transactions");
  const options = service ? (TRANSACTION_OPTIONS[service.code] ?? [service.name]) : [];
  const needsNote = transactions.some((item) => TRANSACTION_NOTE_OPTIONS.has(item));

  const take = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("Choose a service");
      const validationError = validateQueueRequest({
        userType,
        serviceCode: service.code,
        serviceName: service.name,
        transactions,
        name,
        studentId,
        note: transactionNote,
      });
      if (validationError) throw new Error(validationError);
      if (!isUserType(userType)) throw new Error("Please choose your user type.");
      const { data, error } = await supabase.rpc("take_queue_number", {
        _service_id: service.id,
        _user_type: userType,
        _transaction_details: transactions,
        _student_id: userType === "Student" ? studentId.trim() : null,
        _customer_name: name.trim(),
        ...(needsNote ? { _transaction_note: transactionNote.trim() } : {}),
      });
      if (error) throw error;
      return data as unknown as TakeNumberResult;
    },
    onSuccess: (res) => {
      onClose();
      navigate({ to: "/ticket/$ticketId", params: { ticketId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message || "Could not get a number. Please try again."),
  });

  return (
    <Dialog
      open={!!service}
      onOpenChange={(open) => {
        if (!open) {
          setStudentId("");
          setName("");
          setTransactions([]);
          setTransactionNote("");
          setStep("transactions");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-extrabold">
            {service?.name}
          </DialogTitle>
          <DialogDescription>
            {step === "transactions"
              ? "3 — Select the specific transaction(s)."
              : "4 — Enter your details to get your queue number."}
          </DialogDescription>
        </DialogHeader>
        {step === "transactions" ? (
          <div className="space-y-4">
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {options.map((item) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <Checkbox
                    checked={transactions.includes(item)}
                    onCheckedChange={(checked) => {
                      if (!checked && TRANSACTION_NOTE_OPTIONS.has(item)) setTransactionNote("");
                      setTransactions((current) =>
                        checked ? [...current, item] : current.filter((value) => value !== item),
                      );
                    }}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            {needsNote && (
              <div className="space-y-1.5">
                <Label htmlFor="transaction-note">Please specify *</Label>
                <Input
                  id="transaction-note"
                  maxLength={200}
                  required
                  value={transactionNote}
                  onChange={(e) => setTransactionNote(e.target.value)}
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                className="w-full"
                disabled={!transactions.length || (needsNote && !transactionNote.trim())}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const validationError = validateQueueRequest({
                userType,
                serviceCode: service?.code ?? "",
                serviceName: service?.name ?? "",
                transactions,
                name,
                studentId,
                note: transactionNote,
              });
              if (validationError) {
                toast.error(validationError);
                return;
              }
              take.mutate();
            }}
          >
            <p className="rounded-lg bg-secondary p-3 text-sm">
              {userType} · {transactions.join(", ")}
              {needsNote ? `: ${transactionNote}` : ""}
            </p>
            {userType === "Student" && (
              <div className="space-y-1.5">
                <Label htmlFor="sid">Student ID *</Label>
                <Input
                  id="sid"
                  autoFocus
                  required
                  maxLength={30}
                  placeholder="e.g. 2024-00123"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nm">Name *</Label>
              <Input
                id="nm"
                maxLength={100}
                required
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("transactions")}>
                Back
              </Button>
              <Button
                type="submit"
                variant="signal"
                size="xl"
                className="w-full"
                disabled={take.isPending}
              >
                {take.isPending ? <Loader2 className="animate-spin" /> : null}
                Get Ticket
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
