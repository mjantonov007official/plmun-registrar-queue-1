import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { PageHeader } from "@/components/staff/page-header";
import { AdminOnly } from "@/components/staff/admin-only";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_staff/staff")({
  head: () => ({
    meta: [
      { title: "Staff Accounts — PLMun Queue Management System" },
      { name: "description", content: "Approve registrar staff and manage administrator access." },
      { property: "og:title", content: "Staff Accounts — PLMun Queue" },
      { property: "og:description", content: "Approve registrar staff accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <StaffPage />
    </AdminOnly>
  ),
});

type Role = "admin" | "staff";

const accountsQuery = () =>
  queryOptions({
    queryKey: ["accounts"],
    queryFn: async () => {
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return profiles.map((p) => ({
        ...p,
        roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role as Role),
      }));
    },
  });

function StaffPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: accounts = [] } = useQuery(accountsQuery());

  const grant = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role?: Role }) => {
      let q = supabase.from("user_roles").delete().eq("user_id", userId);
      if (role) q = q.eq("role", role);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = accounts.filter((a) => a.roles.length === 0);

  return (
    <div>
      <PageHeader
        title="Staff accounts"
        subtitle="People create an account on the staff sign-in page, then you approve them here."
      />
      {pending.length > 0 && (
        <div className="mb-6 rounded-2xl border border-signal bg-signal/15 px-5 py-4 text-sm">
          <strong>{pending.length}</strong> account{pending.length > 1 ? "s" : ""} waiting for
          approval.
        </div>
      )}
      <section className="rounded-2xl border border-border bg-paper shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => {
              const isSelf = a.id === me?.id;
              const isAdmin = a.roles.includes("admin");
              const isStaff = a.roles.includes("staff");
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.full_name || "—"}{" "}
                    {isSelf && <span className="text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {isAdmin && <Badge>Admin</Badge>}
                      {isStaff && <Badge variant="secondary">Staff</Badge>}
                      {!a.roles.length && <Badge variant="waiting">Pending</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {!isSelf && (
                      <div className="flex justify-end gap-1">
                        {!a.roles.length && (
                          <Button
                            size="sm"
                            onClick={() => grant.mutate({ userId: a.id, role: "staff" })}
                          >
                            Approve as staff
                          </Button>
                        )}
                        {!isAdmin && a.roles.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => grant.mutate({ userId: a.id, role: "admin" })}
                          >
                            Make admin
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revoke.mutate({ userId: a.id, role: "admin" })}
                          >
                            Remove admin
                          </Button>
                        )}
                        {a.roles.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() =>
                              confirm(`Remove all access for ${a.email}?`) &&
                              revoke.mutate({ userId: a.id })
                            }
                          >
                            Remove access
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
