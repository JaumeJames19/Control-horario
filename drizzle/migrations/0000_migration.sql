create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nombre text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "ver perfiles" on public.profiles for select to authenticated using (true);
create policy "editar propio perfil" on public.profiles for update to authenticated using (id = auth.uid());
create policy "ver roles propios o admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.fichajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tipo text not null check (tipo in ('entrada','pausa','reanudar','salida')),
  at timestamptz not null default now(),
  dia date not null,
  lugar text not null default 'Centro principal',
  editado boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.fichajes (user_id, dia);
grant select, insert, update, delete on public.fichajes to authenticated;
grant all on public.fichajes to service_role;
alter table public.fichajes enable row level security;
create policy "ver fichajes" on public.fichajes for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "crear fichajes" on public.fichajes for insert to authenticated
  with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "borrar fichajes" on public.fichajes for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.correcciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  dia date not null,
  motivo text not null,
  por uuid not null,
  antes jsonb not null default '[]',
  at timestamptz not null default now()
);
grant select, insert on public.correcciones to authenticated;
grant all on public.correcciones to service_role;
alter table public.correcciones enable row level security;
create policy "ver correcciones" on public.correcciones for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "crear correcciones" on public.correcciones for insert to authenticated
  with check (por = auth.uid() and (user_id = auth.uid() or public.has_role(auth.uid(),'admin')));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();