
create type public.app_role as enum ('admin', 'staff');
create type public.ticket_status as enum ('waiting', 'serving', 'completed', 'no_show', 'cancelled');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff'))
$$;

create policy "Users view own profile, staff view all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Users view own roles, admins view all" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Admins grant roles" on public.user_roles
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins revoke roles" on public.user_roles
  for delete to authenticated using (public.has_role(auth.uid(), 'admin') and user_id <> auth.uid());

-- New user: profile + first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Services
create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;
create policy "Anyone can view services" on public.services for select to anon, authenticated using (true);
create policy "Admins insert services" on public.services for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update services" on public.services for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete services" on public.services for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Counters / windows
create table public.counters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.counters to anon, authenticated;
grant insert, update, delete on public.counters to authenticated;
grant all on public.counters to service_role;
alter table public.counters enable row level security;
create policy "Anyone can view counters" on public.counters for select to anon, authenticated using (true);
create policy "Admins insert counters" on public.counters for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update counters" on public.counters for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete counters" on public.counters for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Tickets
create or replace function public.queue_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  queue_date date not null default public.queue_today(),
  queue_number int not null,
  ticket_code text not null,
  customer_name text,
  student_id text,
  status public.ticket_status not null default 'waiting',
  counter_id uuid references public.counters(id) on delete set null,
  served_by uuid,
  recall_count int not null default 0,
  created_at timestamptz not null default now(),
  called_at timestamptz,
  completed_at timestamptz,
  unique (service_id, queue_date, queue_number)
);
create index tickets_date_status_idx on public.tickets (queue_date, status, created_at);
create index tickets_created_idx on public.tickets (created_at);
grant select, update on public.tickets to authenticated;
grant all on public.tickets to service_role;
alter table public.tickets enable row level security;
create policy "Staff view tickets" on public.tickets for select to authenticated using (public.is_staff(auth.uid()));
create policy "Staff update tickets" on public.tickets for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Take a number (public)
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
  if nm is not null and length(nm) > 100 then raise exception 'Name is too long'; end if;
  if sid is not null and length(sid) > 30 then raise exception 'Student ID is too long'; end if;

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
grant execute on function public.take_queue_number(uuid, text, text) to anon, authenticated;

-- Ticket status (public, no personal data)
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
    'ticket_code', t.ticket_code,
    'service_name', s.name,
    'status', t.status,
    'counter_name', cname,
    'created_at', t.created_at,
    'called_at', t.called_at,
    'queue_date', t.queue_date,
    'people_ahead', ahead,
    'now_serving', serving,
    'estimated_wait_minutes', round(ahead * coalesce(avg_min, 5))
  );
end;
$$;
grant execute on function public.get_ticket_status(uuid) to anon, authenticated;

-- Public display board
create or replace function public.get_queue_board()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'counters', coalesce((
      select json_agg(x order by x.sort_order, x.counter_name) from (
        select c.id as counter_id, c.name as counter_name, c.sort_order,
               t.ticket_code, sv.name as service_name, t.called_at
        from public.counters c
        left join lateral (
          select * from public.tickets tk
          where tk.counter_id = c.id and tk.status = 'serving' and tk.queue_date = public.queue_today()
          order by tk.called_at desc nulls last limit 1
        ) t on true
        left join public.services sv on sv.id = t.service_id
        where c.is_active
      ) x), '[]'::json),
    'services', coalesce((
      select json_agg(y order by y.sort_order, y.name) from (
        select sv.id, sv.code, sv.name, sv.sort_order,
          (select count(*) from public.tickets tk where tk.service_id = sv.id and tk.queue_date = public.queue_today() and tk.status = 'waiting') as waiting_count,
          coalesce((select json_agg(w.ticket_code order by w.queue_number) from (
              select ticket_code, queue_number from public.tickets tk
              where tk.service_id = sv.id and tk.queue_date = public.queue_today() and tk.status = 'waiting'
              order by tk.queue_number limit 4) w), '[]'::json) as up_next
        from public.services sv where sv.is_active
      ) y), '[]'::json),
    'server_time', now()
  )
$$;
grant execute on function public.get_queue_board() to anon, authenticated;

-- Call next (staff)
create or replace function public.call_next_ticket(_counter_id uuid, _service_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare
  next_id uuid;
  r public.tickets%rowtype;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Not authorized'; end if;
  update public.tickets set status = 'completed', completed_at = now()
   where counter_id = _counter_id and status = 'serving';
  select id into next_id from public.tickets
   where status = 'waiting' and queue_date = public.queue_today() and service_id = any(_service_ids)
   order by created_at, queue_number limit 1 for update skip locked;
  if next_id is null then return null; end if;
  update public.tickets set status = 'serving', counter_id = _counter_id, served_by = auth.uid(), called_at = now()
   where id = next_id returning * into r;
  return row_to_json(r);
end;
$$;
revoke execute on function public.call_next_ticket(uuid, uuid[]) from anon;
grant execute on function public.call_next_ticket(uuid, uuid[]) to authenticated;

-- Seed data
insert into public.services (code, name, description, sort_order) values
  ('E', 'Enrollment', 'New and returning student enrollment, adding or dropping subjects', 1),
  ('T', 'Transcript of Records', 'Request or claim your official transcript (TOR)', 2),
  ('C', 'Certificates & Documents', 'Certificate of enrollment, good moral, diploma and other documents', 3),
  ('P', 'Payment & Assessment', 'Fee assessment, payments and clearance', 4),
  ('I', 'General Inquiry', 'Questions and other registrar concerns', 5);

insert into public.counters (name, sort_order) values
  ('Window 1', 1), ('Window 2', 2), ('Window 3', 3), ('Window 4', 4);
