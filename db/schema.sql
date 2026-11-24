create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'gestor', 'user')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  token_version int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists mfa_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mfa_codes_user_idx on mfa_codes (user_id, created_at desc);

create table if not exists rate_limits (
  key text primary key,
  count int not null,
  reset_at timestamptz not null
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target text,
  result text not null default 'ok',
  ip text,
  user_agent text,
  detail jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);

-- Nunca deixa o sistema sem administrador ativo.
create or replace function ensure_one_active_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and old.active and not (new.role = 'admin' and new.active) then
    perform pg_advisory_xact_lock(7242);
    if not exists (select 1 from users where role = 'admin' and active and id <> old.id) then
      raise exception 'last_admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_keep_admin on users;
create trigger users_keep_admin before update on users
  for each row execute function ensure_one_active_admin();

-- Papel "gestor" (gestor de suprimentos): bancos criados antes dele precisam ampliar a restrição.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'gestor', 'user'));
-- Links de definição de senha (convite e redefinição): uso único, o banco guarda só o HMAC do token.
create table if not exists password_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('invite', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_tokens_user_idx on password_tokens (user_id, created_at desc);