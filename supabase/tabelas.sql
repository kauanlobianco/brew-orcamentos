-- Brew — tabelas do painel de orçamentos.
-- Rodar UMA vez: Supabase > SQL Editor > New query > colar > Run.
-- Pode rodar de novo sem problema (não apaga nada).

-- chave/valor: tabela de preços ("precos") e travas de login
create table if not exists public.brew_kv (
  chave      text primary key,
  valor      jsonb not null,
  atualizado timestamptz not null default now()
);

create table if not exists public.brew_orcamentos (
  id         uuid primary key default gen_random_uuid(),
  criado     timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  resumo     jsonb not null default '{}'::jsonb,   -- cliente, data, valor... (a lista usa só isto)
  estado     jsonb not null,                       -- o orçamento inteiro
  precos     jsonb                                 -- cópia da tabela usada, só de registro
);

create index if not exists brew_orcamentos_atualizado on public.brew_orcamentos (atualizado desc);

-- RLS ligado e NENHUMA política: a chave pública (anon) não enxerga nada.
-- Só as funções do painel, com a chave de serviço, leem e gravam.
alter table public.brew_kv enable row level security;
alter table public.brew_orcamentos enable row level security;
