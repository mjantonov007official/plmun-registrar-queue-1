create type public.visitor_type as enum ('Student', 'Employee', 'Alumni', 'Parent', 'Visitor');

alter table public.tickets
  add column user_type public.visitor_type not null default 'Student',
  add column transaction_details text[] not null default '{}'::text[],
  add column transaction_note text;

alter table public.tickets
  add constraint tickets_transaction_details_count check (cardinality(transaction_details) between 0 and 20),
  add constraint tickets_transaction_note_length check (transaction_note is null or length(transaction_note) <= 200);

drop function public.take_queue_number(uuid, text, text);

create function public.take_queue_number(
  _service_id uuid,
  _customer_name text,
  _student_id text,
  _user_type public.visitor_type,
  _transaction_details text[],
  _transaction_note text default null
)
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
  note text := nullif(trim(coalesce(_transaction_note, '')), '');
  allowed text[];
begin
  select * into s from public.services where id = _service_id and is_active;
  if not found then raise exception 'Service is not available'; end if;
  if nm is null then raise exception 'Name is required'; end if;
  if length(nm) > 100 then raise exception 'Name is too long'; end if;
  if _user_type = 'Student' and sid is null then raise exception 'Student ID is required'; end if;
  if _user_type <> 'Student' and sid is not null then raise exception 'Student ID is only for students'; end if;
  if sid is not null and length(sid) > 30 then raise exception 'Student ID is too long'; end if;
  if _transaction_details is null or cardinality(_transaction_details) < 1 or cardinality(_transaction_details) > 20 then
    raise exception 'Select between 1 and 20 transaction types';
  end if;
  if cardinality(_transaction_details) <> cardinality(array(select distinct unnest(_transaction_details))) then
    raise exception 'Duplicate transaction types are not allowed';
  end if;

  allowed := case s.code
    when 'E' then array['Enrollment / Registration', 'Evaluation Form', 'Subject Credit', 'Shifting Form', 'Completion Form', 'AW/Adding/Dropping Form']
    when 'T' then array['Transcript of Records Request', 'Transcript of Records Claim']
    when 'C' then array['Certificate of Grades (COG)', 'Certificate of Enrollment (COE)', 'Certificate of Graduation', 'Certificate of Earned Units', 'CHED Endorsement', 'Certificate of Incumbent', 'GWA Certificate', 'CAV/S.O. Certificate', 'Certificate for Medium of Instruction', 'Authentication', 'COPC Authentication', 'COM Reprint', 'Diploma', 'Certificate for Latin', 'Other Certificate (Please Specify)']
    when 'P' then array['Fee Assessment', 'Payment', 'Clearance']
    when 'I' then array['General Inquiry', 'Other Registrar Concern (Please Specify)']
    else array[s.name]
  end;
  if exists (select 1 from unnest(_transaction_details) as item(value) where value is null or not (value = any(allowed))) then
    raise exception 'One or more transaction types are not valid for this service';
  end if;
  if exists (select 1 from unnest(_transaction_details) as item(value) where value in ('Other Certificate (Please Specify)', 'Other Registrar Concern (Please Specify)')) and note is null then
    raise exception 'Please specify the requested item';
  end if;
  if note is not null and length(note) > 200 then raise exception 'Transaction details are too long'; end if;
  if note is not null and not exists (select 1 from unnest(_transaction_details) as item(value) where value in ('Other Certificate (Please Specify)', 'Other Registrar Concern (Please Specify)')) then
    raise exception 'Unexpected transaction note';
  end if;

  perform pg_advisory_xact_lock(hashtext(_service_id::text || d::text));
  select coalesce(max(queue_number), 0) + 1 into n from public.tickets where service_id = _service_id and queue_date = d;
  code := s.code || '-' || lpad(n::text, 3, '0');

  insert into public.tickets (service_id, queue_date, queue_number, ticket_code, customer_name, student_id, user_type, transaction_details, transaction_note)
  values (_service_id, d, n, code, nm, sid, _user_type, _transaction_details, note) returning id into new_id;

  select count(*) into ahead from public.tickets
   where service_id = _service_id and queue_date = d and status = 'waiting' and queue_number < n;

  return json_build_object('id', new_id, 'ticket_code', code, 'service_name', s.name, 'people_ahead', ahead);
end;
$$;
grant execute on function public.take_queue_number(uuid, text, text, public.visitor_type, text[], text) to anon, authenticated;

create or replace function public.get_ticket_status(_ticket_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  t public.tickets%rowtype;
  s public.services%rowtype;
  cname text;
  ahead int := 0;
  serving text;
  avg_min numeric;
begin
  select * into t from public.tickets where id = _ticket_id;
  if not found then return null; end if;
  select * into s from public.services where id = t.service_id;
  select name into cname from public.counters where id = t.counter_id;
  if t.status = 'waiting' then
    select count(*) into ahead from public.tickets
     where service_id = t.service_id and queue_date = t.queue_date and status = 'waiting' and queue_number < t.queue_number;
  end if;
  select ticket_code into serving from public.tickets
   where service_id = t.service_id and queue_date = t.queue_date and status = 'serving'
   order by called_at desc nulls last limit 1;
  select avg(extract(epoch from (completed_at - called_at)) / 60) into avg_min from public.tickets
   where service_id = t.service_id and queue_date = t.queue_date and status = 'completed' and called_at is not null and completed_at is not null;
  return json_build_object(
    'ticket_code', t.ticket_code, 'service_name', s.name, 'status', t.status,
    'counter_name', cname, 'created_at', t.created_at, 'called_at', t.called_at,
    'queue_date', t.queue_date, 'people_ahead', ahead, 'now_serving', serving,
    'estimated_wait_minutes', round(ahead * coalesce(avg_min, 5)),
    'transaction_details', t.transaction_details
  );
end;
$$;
grant execute on function public.get_ticket_status(uuid) to anon, authenticated;
