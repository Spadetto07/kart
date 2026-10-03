# Votação do Kart

Site de votação fechada: cada piloto vota **uma vez**, com o próprio WhatsApp, na pista, no dia e no horário da corrida.

- **Frente:** HTML + CSS + JavaScript puros, com Tailwind via CDN. Roda no GitHub Pages.
- **Banco:** Supabase (gratuito). Toda regra é conferida lá, não no navegador.

## O que tem na pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | Tela de votação |
| `admin.html` | Área do organizador (placar completo, lista de pilotos, encerrar votação) |
| `css/style.css` | Visual |
| `js/config.js` | **O único arquivo que você edita:** chaves do Supabase, textos e dados das pistas |
| `js/api.js`, `js/app.js`, `js/admin.js` | Funcionamento. Não precisa mexer |
| `fotos/` | Fotos das pistas (`kis-1.jpg`… e `fki-1.jpg`…) |
| `supabase/setup.sql` | Cria o banco inteiro. Você cola no Supabase uma vez |

---

## Passo 1 — Criar o projeto no Supabase

1. Entre em **supabase.com** e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New project**.
3. Nome: `votacao-kart`. Região: **South America (São Paulo)**. Plano: **Free**.
4. O Supabase pede uma senha do banco (*Database password*). Guarde, mas ela **não** vai no site.
5. Clique em **Create new project** e espere uns 2 minutos.

## Passo 2 — Criar o banco e a senha do organizador

1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/setup.sql`, copie **tudo**, cole e clique em **Run**.
3. Tem que aparecer: `Banco da votação pronto: 398 horários em 82 dias.` Se o Supabase pedir confirmação antes de rodar, confirme: o arquivo não apaga nada.
4. Abra outra **New query**, cole a linha abaixo trocando a senha, e clique em **Run**:

   ```sql
   select kart_definir_senha('ESCOLHA-UMA-SENHA-AQUI');
   ```

   Mínimo de 8 caracteres. Essa é a senha da página `admin.html`. Digite só ali no Supabase: não salve em arquivo nem suba para o GitHub.

## Passo 3 — Colar a URL e a chave no site

1. No Supabase, clique em **Connect** (botão no topo da tela).
2. Copie os dois valores:
   - **Project URL** — parecido com `https://abcdxyz.supabase.co`
   - **Publishable key** — começa com `sb_publishable_`
3. Abra `js/config.js` e troque estas duas linhas:

   ```js
   SUPABASE_URL: "https://SEU-PROJETO.supabase.co",   // <- cole a Project URL
   API_KEY: "COLE_AQUI_A_CHAVE_PUBLICA",              // <- cole a Publishable key
   ```

4. Salve o arquivo.

> As chaves também ficam em **Project Settings → API Keys**. Em projeto antigo, a chave pública se chama **anon public** e começa com `eyJ`: serve igual.
> **Nunca** cole no site a chave `secret` nem a `service_role`. Essas duas dão acesso total ao banco.

## Passo 4 — Publicar no GitHub Pages

1. No GitHub, crie um repositório **público**, por exemplo `votacao-kart`.
2. **Add file → Upload files** e arraste **tudo o que está dentro** desta pasta (o `index.html` tem que ficar na raiz do repositório, não dentro de uma subpasta).
3. Clique em **Commit changes**.
4. **Settings → Pages → Branch:** escolha `main` e `/ (root)` → **Save**.
5. Em 1 ou 2 minutos o site fica em `https://SEU-USUARIO.github.io/votacao-kart/`.

## Passo 5 — Testar antes de mandar no grupo

1. Abra o link e vote com o seu número.
2. Abra uma **aba anônima** e tente votar de novo com o mesmo número. Tem que aparecer: **"Este piloto já registrou seu voto."**
3. Entre em `admin.html` (link no rodapé), digite a senha do passo 2 e clique em **Anular voto** no seu teste.
4. Mande o link no grupo.

---

## Lista de pilotos: aberta ou fechada

O site começa com a **lista aberta**: cada um digita o próprio WhatsApp na hora de votar, e cada número vota uma vez só.

Isso impede o mesmo número de votar duas vezes, mas não impede alguém de inventar um número que não é dele. Dois freios já vêm ligados: todo voto aparece com nome e número na área do organizador (dá para anular o que for estranho), e há um teto de 60 números.

Para blindar de verdade, use a **lista fechada**:

1. Entre em `admin.html`.
2. Em **Adicionar pilotos**, cole a lista do grupo, um por linha: `João 27 99999-8888`.
3. Ligue a chave **Lista fechada**.

A partir daí só vota quem estiver na lista. Os telefones ficam só no Supabase, nunca no GitHub.

## Mudanças comuns

- **Preço, endereço, vantagens, nome do evento:** edite `js/config.js` e suba o arquivo de novo.
- **Fotos:** troque os arquivos em `fotos/` mantendo os nomes (`kis-1.jpg`, `fki-3.jpg`…). Se mudar a quantidade, acerte o número `fotos:` no `config.js`.
- **Encerrar a votação:** `admin.html` → desligue **Votação aberta**.
- **Mais de 60 pilotos com a lista aberta:** no Supabase, **SQL Editor**, rode `update kart_config set limite_pilotos = 100;`
- **Datas e horários:** ficam no banco. No Supabase, **SQL Editor**:

  ```sql
  -- tirar um dia inteiro de uma pista
  delete from kart_opcoes where pista = 'fki' and data = '2026-10-12';

  -- acrescentar um horário
  insert into kart_opcoes (pista, data, horario) values ('kis', '2026-10-17', '18:30');
  ```

  Os códigos das pistas são `kis` (Kartódromo da Serra) e `fki` (FKI Racing). O banco não deixa apagar um horário que já recebeu voto.

## Como as datas foram montadas

De 06/10/2026 a 30/11/2026, só nos dias em que cada pista abre, um horário por hora cheia de funcionamento, com a última largada pelo menos 1 hora antes de fechar.

| Pista | Dias | Horários de largada |
|---|---|---|
| Kartódromo da Serra | quarta e quinta | 16h30, 17h30, 18h30, 19h30 |
| | sábado | 13h30 a 17h30 |
| | domingo | 08h30 a 14h30 |
| FKI Racing Vitória | terça a sexta | 17h, 18h, 19h, 20h |
| | sábado, domingo e feriado | 14h a 19h |

Feriados do período, que na FKI seguem o horário das 14h às 20h: 12/10, 02/11, 15/11 e 20/11. Datas que já passaram somem sozinhas do calendário.

## Como a proteção funciona

- As tabelas do banco ficam trancadas (RLS ligado, sem nenhuma permissão pública). O site não lê nem grava tabela nenhuma direto: só chama cinco funções do banco.
- O telefone é a chave primária da tabela de votos. Um número, um voto, e é o banco que garante. Aba anônima, outro navegador, outro aparelho ou chamada direta na API dão no mesmo erro.
- O site não usa `localStorage` nem cookie para decidir nada.
- O placar parcial só é entregue para quem já votou, e mostra contagens, nunca quem votou em quê.
- A senha do organizador fica embaralhada no banco (bcrypt) e a entrada trava por 15 minutos depois de 5 erros.
