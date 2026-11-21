import { useMe } from "@/hooks/use-staff";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  if (!me?.isAdmin) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
        Only administrators can open this page.
      </div>
    );
  }
  return <>{children}</>;
}
