-- =====================================================================
--  VOTAÇÃO DO KART — banco de dados para o Supabase (PostgreSQL)
--
--  Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
--  Pode rodar de novo sem medo: não apaga pilotos nem votos.
--  Este arquivo não tem senha nem telefone; pode ficar no GitHub.
--
--  Como a segurança funciona:
--   1. As tabelas ficam trancadas (RLS ligado, sem nenhuma permissão
--      para o público). O site NÃO lê nem grava tabela nenhuma direto.
--   2. O site só consegue chamar 5 funções: kart_opcoes, kart_verificar,
--      kart_votar, kart_resultado e kart_admin. Toda regra é conferida
--      aqui dentro, no banco — nunca no navegador.
--   3. Um telefone = um voto. Quem garante é a chave primária da tabela
--      kart_votos, então aba anônima, outro navegador ou outro aparelho
--      não mudam nada.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

create table if not exists public.kart_config (
  id              smallint primary key default 1 check (id = 1),
  lista_fechada   boolean  not null default false,  -- true = só vota quem estiver em kart_pilotos
  votacao_aberta  boolean  not null default true,
  limite_pilotos  integer  not null default 60,     -- teto de cadastros quando a lista é aberta
  senha_admin     text                              -- guardada embaralhada (bcrypt)
);
insert into public.kart_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.kart_pilotos (
  telefone        text primary key check (telefone ~ '^[1-9][0-9]9[0-9]{8}$'),  -- DDD + 9 dígitos
  nome            text,
  voto_realizado  boolean     not null default false,
  votou_em        timestamptz,
  cadastrado_em   timestamptz not null default now()
);

create table if not exists public.kart_feriados (
  data  date primary key,
  nome  text not null
);

create table if not exists public.kart_opcoes (
  pista    text not null check (pista in ('kis', 'fki')),
  data     date not null,
  horario  time not null,
  primary key (pista, data, horario)
);

create table if not exists public.kart_votos (
  telefone   text primary key references public.kart_pilotos (telefone) on delete cascade,
  pista      text not null,
  data       date not null,
  horario    time not null,
  criado_em  timestamptz not null default now(),
  foreign key (pista, data, horario) references public.kart_opcoes (pista, data, horario)
);

create table if not exists public.kart_admin_falhas (
  quando timestamptz not null default now()
);

-- Tranca tudo: RLS ligado e nenhuma permissão para quem vem do site.
alter table public.kart_config       enable row level security;
alter table public.kart_pilotos      enable row level security;
alter table public.kart_feriados     enable row level security;
alter table public.kart_opcoes       enable row level security;
alter table public.kart_votos        enable row level security;
alter table public.kart_admin_falhas enable row level security;

revoke all on table public.kart_config, public.kart_pilotos, public.kart_feriados,
                    public.kart_opcoes, public.kart_votos, public.kart_admin_falhas
  from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. DATAS E HORÁRIOS (06/10/2026 a 30/11/2026)
--    Um horário por hora cheia de funcionamento; a última largada fica
--    pelo menos 1 hora antes de a pista fechar.
-- ---------------------------------------------------------------------

insert into public.kart_feriados (data, nome) values
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra')
on conflict (data) do nothing;

-- Kartódromo Internacional da Serra
--   quarta e quinta 16h30–21h · sábado 13h30–19h · domingo 08h30–16h
insert into public.kart_opcoes (pista, data, horario)
select 'kis', d::date, h::time
from generate_series(date '2026-10-06', date '2026-11-30', interval '1 day') as d
cross join lateral unnest(
  case extract(isodow from d)::int
    when 3 then array['16:30', '17:30', '18:30', '19:30']
    when 4 then array['16:30', '17:30', '18:30', '19:30']
    when 6 then array['13:30', '14:30', '15:30', '16:30', '17:30']
    when 7 then array['08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30']
    else array[]::text[]
  end) as h
on conflict do nothing;

-- FKI Racing Vitória
--   terça a sexta 17h–21h · sábado, domingo e feriado 14h–20h
insert into public.kart_opcoes (pista, data, horario)
select 'fki', d::date, h::time
from generate_series(date '2026-10-06', date '2026-11-30', interval '1 day') as d
cross join lateral unnest(
  case
    when extract(isodow from d)::int in (6, 7)
      or exists (select 1 from public.kart_feriados f where f.data = d::date)
      then array['14:00', '15:00', '16:00', '17:00', '18:00', '19:00']
    when extract(isodow from d)::int between 2 and 5
      then array['17:00', '18:00', '19:00', '20:00']
    else array[]::text[]
  end) as h
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 3. FUNÇÕES
-- ---------------------------------------------------------------------

-- Limpa o telefone: tira máscara, +55 e zero do DDD. Devolve os 11
-- números (DDD + celular) ou NULL se não for um celular brasileiro.
create or replace function public.kart_tel(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^[1-9][0-9]9[0-9]{8}$' then d end
  from (
    select case
             when x ~ '^55[1-9][0-9]9[0-9]{8}$' then substr(x, 3)
             when x ~ '^0[1-9][0-9]9[0-9]{8}$'  then substr(x, 2)
             else x
           end as d
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a
  ) b
$$;

create or replace function public.kart_hoje()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;


-- Datas e horários que ainda podem ser votados, por pista.
create or replace function public.kart_opcoes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'votacao_aberta', (select votacao_aberta from kart_config where id = 1),
    'dias', coalesce((
      select jsonb_agg(x.dia order by x.pista, x.data)
      from (
        select o.pista, o.data,
               jsonb_build_object(
                 'pista',    o.pista,
                 'data',     o.data,
                 'feriado',  f.nome,
                 'horarios', jsonb_agg(to_char(o.horario, 'HH24:MI') order by o.horario)
               ) as dia
        from kart_opcoes o
        left join kart_feriados f on f.data = o.data
        where o.data >= kart_hoje()
        group by o.pista, o.data, f.nome
      ) x
    ), '[]'::jsonb)
  )
$$;


-- Confere se o telefone pode votar. É a "porta de entrada" do site.
create or replace function public.kart_verificar(p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := kart_tel(p_telefone);
  v_cfg kart_config%rowtype;
  v_pil kart_pilotos%rowtype;
begin
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido',
      'mensagem', 'Digite o WhatsApp com DDD: 11 números, como 27 99999-9999.');
  end if;

  select * into v_cfg from kart_config where id = 1;
  select * into v_pil from kart_pilotos where telefone = v_tel;

  if v_pil.voto_realizado then
    return jsonb_build_object('ok', false, 'erro', 'ja_votou',
      'mensagem', 'Este piloto já registrou seu voto.');
  end if;

  if not v_cfg.votacao_aberta then
    return jsonb_build_object('ok', false, 'erro', 'encerrada',
      'mensagem', 'A votação está encerrada.');
  end if;

  if v_cfg.lista_fechada and v_pil.telefone is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autorizado',
      'mensagem', 'Este número não está na lista de pilotos. Fale com o organizador.');
  end if;

  return jsonb_build_object('ok', true, 'telefone', v_tel, 'nome', v_pil.nome);
end
$$;


-- Registra o voto. Confere tudo de novo aqui dentro, porque o que vem
-- do navegador nunca é confiável.
create or replace function public.kart_votar(
  p_telefone text,
  p_nome     text,
  p_pista    text,
  p_data     text,
  p_horario  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel   text := kart_tel(p_telefone);
  v_nome  text := nullif(left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 60), '');
  v_cfg   kart_config%rowtype;
  v_data  date;
  v_hora  time;
  v_n     integer;
begin
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido',
      'mensagem', 'Digite o WhatsApp com DDD: 11 números, como 27 99999-9999.');
  end if;

  if exists (select 1 from kart_pilotos where telefone = v_tel and voto_realizado) then
    return jsonb_build_object('ok', false, 'erro', 'ja_votou',
      'mensagem', 'Este piloto já registrou seu voto.');
  end if;

  select * into v_cfg from kart_config where id = 1;
  if not v_cfg.votacao_aberta then
    return jsonb_build_object('ok', false, 'erro', 'encerrada',
      'mensagem', 'A votação está encerrada.');
  end if;

  begin
    v_data := p_data::date;
    v_hora := p_horario::time;
  exception when others then
    v_data := null;
  end;

  if v_data is null or v_data < kart_hoje() or not exists (
       select 1 from kart_opcoes
       where pista = p_pista and data = v_data and horario = v_hora) then
    return jsonb_build_object('ok', false, 'erro', 'opcao_invalida',
      'mensagem', 'Essa combinação de pista, dia e horário não está disponível.');
  end if;

  if v_cfg.lista_fechada then
    if not exists (select 1 from kart_pilotos where telefone = v_tel) then
      return jsonb_build_object('ok', false, 'erro', 'nao_autorizado',
        'mensagem', 'Este número não está na lista de pilotos. Fale com o organizador.');
    end if;
  else
    if v_nome is null or char_length(v_nome) < 2 then
      return jsonb_build_object('ok', false, 'erro', 'nome_invalido',
        'mensagem', 'Escreva seu nome para o organizador saber quem votou.');
    end if;
    if not exists (select 1 from kart_pilotos where telefone = v_tel)
       and (select count(*) from kart_pilotos) >= v_cfg.limite_pilotos then
      return jsonb_build_object('ok', false, 'erro', 'limite',
        'mensagem', 'A votação chegou ao limite de pilotos. Fale com o organizador.');
    end if;
    insert into kart_pilotos (telefone, nome) values (v_tel, v_nome)
    on conflict (telefone) do nothing;
  end if;

  -- Marca "voto_realizado". Se duas abas mandarem ao mesmo tempo, só a
  -- primeira consegue: a segunda encontra a linha já marcada.
  update kart_pilotos
     set voto_realizado = true,
         votou_em       = now(),
         nome           = coalesce(nome, v_nome)
   where telefone = v_tel
     and not voto_realizado;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'erro', 'ja_votou',
      'mensagem', 'Este piloto já registrou seu voto.');
  end if;

  insert into kart_votos (telefone, pista, data, horario)
  values (v_tel, p_pista, v_data, v_hora);

  return jsonb_build_object('ok', true);

exception when unique_violation then
  return jsonb_build_object('ok', false, 'erro', 'ja_votou',
    'mensagem', 'Este piloto já registrou seu voto.');
end
$$;


-- Placar parcial. Só responde para quem já votou, e só com contagens:
-- nunca devolve o voto de um número, porque na turma todo mundo sabe o
-- WhatsApp de todo mundo.
create or replace function public.kart_resultado(p_telefone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text := kart_tel(p_telefone);
begin
  if v_tel is null or not exists (select 1 from kart_votos where telefone = v_tel) then
    return jsonb_build_object('ok', false, 'erro', 'nao_votou',
      'mensagem', 'O placar aparece depois que você votar.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'votacao_aberta', (select votacao_aberta from kart_config where id = 1),
    'total', (select count(*) from kart_votos),
    'lista', (select case when lista_fechada then (select count(*) from kart_pilotos) end
              from kart_config where id = 1),
    'votos', coalesce((
      select jsonb_agg(jsonb_build_object('pista', pista, 'data', data,
                                          'horario', to_char(horario, 'HH24:MI'), 'votos', n)
                       order by n desc, data, horario, pista)
      from (select pista, data, horario, count(*) as n
            from kart_votos group by pista, data, horario) c
    ), '[]'::jsonb)
  );
end
$$;


-- Painel do organizador. Exige a senha em toda chamada e trava por
-- 15 minutos depois de 5 senhas erradas.
create or replace function public.kart_admin(
  p_senha text,
  p_acao  text  default 'painel',
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg     kart_config%rowtype;
  v_tel     text;
  v_linha   text;
  v_achado  text;
  v_nome    text;
  v_novos   integer := 0;
  v_ruins   integer := 0;
  v_n       integer;
  v_padrao  constant text := '(?:\+?55[\s.-]*)?\(?0?[1-9][0-9]\)?[\s.-]*9[\s.-]*[0-9]{4}[\s.-]*[0-9]{4}';
begin
  select * into v_cfg from kart_config where id = 1;

  if v_cfg.senha_admin is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_senha',
      'mensagem', 'A senha do organizador ainda não foi criada no Supabase.');
  end if;

  if (select count(*) from kart_admin_falhas where quando > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'erro', 'bloqueado',
      'mensagem', 'Muitas senhas erradas. Espere 15 minutos e tente de novo.');
  end if;

  if p_senha is null or crypt(p_senha, v_cfg.senha_admin) <> v_cfg.senha_admin then
    insert into kart_admin_falhas default values;
    return jsonb_build_object('ok', false, 'erro', 'senha_errada',
      'mensagem', 'Senha errada.');
  end if;

  -- "where true": o Supabase recusa DELETE sem WHERE quando a chamada vem do site.
  delete from kart_admin_falhas where true;

  case coalesce(p_acao, 'painel')
    when 'painel' then
      null;

    when 'config' then
      update kart_config set
        lista_fechada  = coalesce((p_dados ->> 'lista_fechada')::boolean,  lista_fechada),
        votacao_aberta = coalesce((p_dados ->> 'votacao_aberta')::boolean, votacao_aberta),
        limite_pilotos = coalesce((p_dados ->> 'limite_pilotos')::integer, limite_pilotos)
      where id = 1;

    when 'adicionar_pilotos' then
      -- Uma linha por piloto, em qualquer ordem: "João 27 99999-8888".
      for v_linha in
        select btrim(l) from regexp_split_to_table(coalesce(p_dados ->> 'lista', ''), '[\n\r]+') as l
      loop
        continue when v_linha = '';
        v_achado := substring(v_linha from v_padrao);
        v_tel    := kart_tel(v_achado);
        if v_tel is null then
          v_ruins := v_ruins + 1;
          continue;
        end if;
        v_nome := nullif(left(btrim(replace(v_linha, v_achado, ''), E' \t;,:-–—|'), 60), '');
        insert into kart_pilotos (telefone, nome) values (v_tel, v_nome)
        on conflict (telefone) do update
          set nome = coalesce(excluded.nome, kart_pilotos.nome);
        get diagnostics v_n = row_count;
        v_novos := v_novos + v_n;
      end loop;

    when 'anular_voto' then
      v_tel := kart_tel(p_dados ->> 'telefone');
      delete from kart_votos where telefone = v_tel;
      update kart_pilotos set voto_realizado = false, votou_em = null where telefone = v_tel;

    when 'remover_piloto' then
      delete from kart_pilotos where telefone = kart_tel(p_dados ->> 'telefone');

    else
      return jsonb_build_object('ok', false, 'erro', 'acao_desconhecida',
        'mensagem', 'Ação desconhecida.');
  end case;

  return jsonb_build_object(
    'ok', true,
    'gravados', v_novos,
    'ignorados', v_ruins,
    'config', (select jsonb_build_object('lista_fechada', lista_fechada,
                                         'votacao_aberta', votacao_aberta,
                                         'limite_pilotos', limite_pilotos)
               from kart_config where id = 1),
    'pilotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'telefone', p.telefone,
               'nome', p.nome,
               'voto_realizado', p.voto_realizado,
               'votou_em', p.votou_em,
               'pista', v.pista,
               'data', v.data,
               'horario', to_char(v.horario, 'HH24:MI'))
             order by p.votou_em desc nulls last, p.nome nulls last, p.telefone)
      from kart_pilotos p
      left join kart_votos v on v.telefone = p.telefone
    ), '[]'::jsonb)
  );
end
$$;


-- Cria ou troca a senha do organizador. Só roda pelo SQL Editor do
-- Supabase — o site não tem permissão para chamar.
--   select kart_definir_senha('sua-senha-aqui');
create or replace function public.kart_definir_senha(p_senha text)
returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  if p_senha is null or char_length(p_senha) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  update kart_config set senha_admin = crypt(p_senha, gen_salt('bf', 10)) where id = 1;
  delete from kart_admin_falhas where true;
  return 'Senha do organizador gravada.';
end
$$;


-- ---------------------------------------------------------------------
-- 4. PERMISSÕES — o site só enxerga estas 5 funções
-- ---------------------------------------------------------------------

revoke all on function public.kart_tel(text)                         from public, anon, authenticated;
revoke all on function public.kart_hoje()                            from public, anon, authenticated;
revoke all on function public.kart_definir_senha(text)               from public, anon, authenticated;
revoke all on function public.kart_opcoes()                          from public, anon, authenticated;
revoke all on function public.kart_verificar(text)                   from public, anon, authenticated;
revoke all on function public.kart_votar(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.kart_resultado(text)                   from public, anon, authenticated;
revoke all on function public.kart_admin(text, text, jsonb)          from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant execute on function public.kart_opcoes()                          to anon, authenticated;
grant execute on function public.kart_verificar(text)                   to anon, authenticated;
grant execute on function public.kart_votar(text, text, text, text, text) to anon, authenticated;
grant execute on function public.kart_resultado(text)                   to anon, authenticated;
grant execute on function public.kart_admin(text, text, jsonb)          to anon, authenticated;

-- Avisa a API do Supabase que há funções novas.
notify pgrst, 'reload schema';

select 'Banco da votação pronto: '
       || (select count(*) from public.kart_opcoes) || ' horários em '
       || (select count(distinct (pista, data)) from public.kart_opcoes) || ' dias.' as resultado;
