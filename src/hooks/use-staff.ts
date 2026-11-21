import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: ("admin" | "staff")[];
  isAdmin: boolean;
  isStaff: boolean;
};

export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role);
      return {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        fullName: profile?.full_name ?? null,
        roles: r,
        isAdmin: r.includes("admin"),
        isStaff: r.includes("admin") || r.includes("staff"),
      };
    },
  });

export function useMe() {
  return useQuery(meQuery());
}
