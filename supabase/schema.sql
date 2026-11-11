-- أقساطي — full database setup (run once in Supabase → SQL Editor for a fresh project).
--
-- Design: no accounts in the MVP. Each browser gets a random uuid v4 "token" (localStorage).
-- Tables live in a private schema the Data API does not expose, so the browser can only reach
-- data through the public SECURITY DEFINER functions below, and every function filters by token.
-- Removing an installment is a soft remove (recorded in removed_installments).

create schema if not exists aqsati_private;

create table aqsati_private.profiles (
  token uuid primary key,
  salary numeric(12,3) not null default 0 check (salary >= 0 and salary < 1000000),
  safe_limit numeric(5,2) not null default 40 check (safe_limit > 0 and safe_limit <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table aqsati_private.installments (
  id uuid primary key default gen_random_uuid(),
  token uuid not null,
  provider text not null check (char_length(provider) between 1 and 40),
  title text not null default '' check (char_length(title) <= 80),
  monthly_amount numeric(12,3) not null check (monthly_amount > 0 and monthly_amount < 1000000),
  due_day smallint not null check (due_day between 1 and 31),
  remaining_count integer not null check (remaining_count between 1 and 360),
  first_due_date date not null,
  created_at timestamptz not null default now()
);

create index installments_token_created_idx on aqsati_private.installments (token, created_at);

create table aqsati_private.removed_installments (
  installment_id uuid primary key references aqsati_private.installments (id),
  token uuid not null,
  removed_at timestamptz not null default now()
);

create function public.aqsati_state(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null then
    raise exception 'token required' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('salary', p.salary, 'safe_limit', p.safe_limit)
                from aqsati_private.profiles p where p.token = p_token),
    'installments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'provider', i.provider, 'title', i.title,
        'monthly_amount', i.monthly_amount, 'due_day', i.due_day,
        'remaining_count', i.remaining_count, 'first_due_date', i.first_due_date,
        'created_at', i.created_at) order by i.created_at)
      from aqsati_private.installments i
      where i.token = p_token
        and not exists (select 1 from aqsati_private.removed_installments r where r.installment_id = i.id)
    ), '[]'::jsonb)
  );
end; $$;

create function public.aqsati_save(p_token uuid, p_salary numeric, p_safe_limit numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null then raise exception 'token required' using errcode = '22023'; end if;
  if p_salary is null or p_salary <= 0 or p_salary >= 1000000 then
    raise exception 'invalid salary' using errcode = '22023';
  end if;
  if p_safe_limit is null or p_safe_limit < 1 or p_safe_limit > 100 then
    raise exception 'invalid safe limit' using errcode = '22023';
  end if;
  insert into aqsati_private.profiles (token, salary, safe_limit)
  values (p_token, round(p_salary, 3), round(p_safe_limit, 2))
  on conflict (token) do update
    set salary = excluded.salary, safe_limit = excluded.safe_limit, updated_at = now();
  return public.aqsati_state(p_token);
end; $$;

create function public.aqsati_add(
  p_token uuid, p_provider text, p_title text, p_monthly numeric,
  p_due_day integer, p_remaining integer, p_first_due date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := btrim(coalesce(p_provider, ''));
  v_title text := btrim(coalesce(p_title, ''));
begin
  if p_token is null then raise exception 'token required' using errcode = '22023'; end if;
  if char_length(v_provider) < 1 or char_length(v_provider) > 40 then
    raise exception 'invalid provider' using errcode = '22023';
  end if;
  if char_length(v_title) > 80 then raise exception 'invalid title' using errcode = '22023'; end if;
  if p_monthly is null or p_monthly <= 0 or p_monthly >= 1000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then
    raise exception 'invalid due day' using errcode = '22023';
  end if;
  if p_remaining is null or p_remaining < 1 or p_remaining > 360 then
    raise exception 'invalid remaining count' using errcode = '22023';
  end if;
  if p_first_due is null or p_first_due < current_date - 2 or p_first_due > current_date + 62 then
    raise exception 'invalid first due date' using errcode = '22023';
  end if;
  if (select count(*) from aqsati_private.installments i
      where i.token = p_token
        and not exists (select 1 from aqsati_private.removed_installments r where r.installment_id = i.id)) >= 50 then
    raise exception 'too many installments' using errcode = '22023';
  end if;
  if (select count(*) from aqsati_private.installments i where i.token = p_token) >= 300 then
    raise exception 'too many installments' using errcode = '22023';
  end if;
  insert into aqsati_private.installments (token, provider, title, monthly_amount, due_day, remaining_count, first_due_date)
  values (p_token, v_provider, v_title, round(p_monthly, 3), p_due_day, p_remaining, p_first_due);
  return public.aqsati_state(p_token);
end; $$;

create function public.aqsati_remove(p_token uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_id is null then
    raise exception 'token and id required' using errcode = '22023';
  end if;
  insert into aqsati_private.removed_installments (installment_id, token)
  select i.id, i.token from aqsati_private.installments i
  where i.id = p_id and i.token = p_token
  on conflict (installment_id) do nothing;
  return public.aqsati_state(p_token);
end; $$;
