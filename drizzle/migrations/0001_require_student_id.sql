
create or replace function public.take_queue_number(_service_id uuid, _customer_name text default null, _student_id text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  s public.services%rowtype;
  d date := public.queue_today();
  n int;
  code text;
  new_id uuid;
  ahead int;
  nm text := nullif(trim(coalesce(_customer_name, '')), '');
  sid text := nullif(trim(coalesce(_student_id, '')), '');
begin
  select * into s from public.services where id = _service_id and is_active;
  if not found then raise exception 'Service is not available'; end if;
  if sid is null then raise exception 'Student ID is required'; end if;
  if length(sid) > 30 then raise exception 'Student ID is too long'; end if;
  if nm is not null and length(nm) > 100 then raise exception 'Name is too long'; end if;

  perform pg_advisory_xact_lock(hashtext(_service_id::text || d::text));
  select coalesce(max(queue_number), 0) + 1 into n from public.tickets where service_id = _service_id and queue_date = d;
  code := s.code || '-' || lpad(n::text, 3, '0');

  insert into public.tickets (service_id, queue_date, queue_number, ticket_code, customer_name, student_id)
  values (_service_id, d, n, code, nm, sid) returning id into new_id;

  select count(*) into ahead from public.tickets
   where service_id = _service_id and queue_date = d and status = 'waiting' and queue_number < n;

  return json_build_object('id', new_id, 'ticket_code', code, 'service_name', s.name, 'people_ahead', ahead);
end;
$$;
