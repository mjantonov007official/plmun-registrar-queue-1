import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoardData, Counter, Service, TicketStatusInfo } from "./queue";

export const servicesQuery = () =>
  queryOptions({
    queryKey: ["services"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

export const countersQuery = () =>
  queryOptions({
    queryKey: ["counters"],
    queryFn: async (): Promise<Counter[]> => {
      const { data, error } = await supabase
        .from("counters")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

export const boardQuery = () =>
  queryOptions({
    queryKey: ["board"],
    queryFn: async (): Promise<BoardData> => {
      const { data, error } = await supabase.rpc("get_queue_board");
      if (error) throw error;
      return data as unknown as BoardData;
    },
    refetchInterval: 3000,
  });

export const ticketStatusQuery = (ticketId: string) =>
  queryOptions({
    queryKey: ["ticket-status", ticketId],
    queryFn: async (): Promise<TicketStatusInfo | null> => {
      const { data, error } = await supabase.rpc("get_ticket_status", { _ticket_id: ticketId });
      if (error) throw error;
      return (data as unknown as TicketStatusInfo | null) ?? null;
    },
    refetchInterval: 4000,
  });
