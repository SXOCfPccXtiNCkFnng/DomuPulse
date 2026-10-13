# Domu Pulse

Gestão comercial em tempo real para imobiliárias. Corretores enviam os números do funil em horários fixos; gerentes, superintendentes e administradores acompanham entregas, funil, ranking e agenda ao vivo, do celular (PWA com notificações).

Endereço de produção: `pulse.domutech.digital`

## Stack

| Camada | Tecnologia |
|---|---|
| App | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| Estilo | Tailwind CSS 4 com design tokens próprios (tema claro e escuro) |
| Dados e login | Supabase: Postgres com RLS, Auth e Realtime |
| Notificações | Web Push (VAPID) com service worker próprio |
| Agendador | `pg_cron` + `pg_net` no Supabase chamando `/api/cron/reminders` |
| Cobrança | Asaas (assinatura mensal por assento, Pix, boleto ou cartão) |
| Hospedagem | Vercel |

## Segurança: como funciona

1. **Toda autorização vive no banco.** Cada tabela tem RLS. O front só pede; o Postgres decide o que cada cargo vê e altera. As regras ficam em `supabase/migrations`.
2. **Hierarquia:** administrador (owner) > superintendente (director) > gerente (manager) > corretor (broker). Cada nível vê e edita apenas quem está abaixo dele, dentro do próprio escopo.
3. **Isolamento entre imobiliárias:** `org_id` é sempre derivado do membro por trigger, nunca do que o cliente envia.
4. **Campos sensíveis bloqueados por coluna:** o administrador não consegue alterar plano, status de pagamento nem assentos pelo cliente. Só o webhook do Asaas faz isso.
5. **Assinatura vencida = somente leitura,** aplicado no próprio RLS.
6. **Login pelo Supabase Auth:** senha forte obrigatória, e-mail de boas-vindas no cadastro, recuperação de senha, convite por e-mail e bloqueio do usuário ao desativar.
7. **Chave secreta só no servidor** (`SUPABASE_SECRET_KEY`), usada apenas depois de verificar a permissão de quem chamou.
8. **Cabeçalhos de segurança** (CSP, HSTS, X-Frame-Options e outros) em `next.config.ts`.
9. **Webhook e agendador autenticados** com segredo comparado em tempo constante, e webhook idempotente.
10. **Auditoria:** alterações em membros, relatórios, agenda, metas e comissões ficam em `audit_log`, visível ao administrador.

Os testes em `supabase/tests/rls.test.mjs` tentam quebrar essas regras (46 cenários). Rode com `npm run test:db` sempre que mexer no banco.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

Para testar notificações no computador é preciso HTTPS: `npx next dev --experimental-https`.

## Configurando o Supabase

1. Crie um projeto em supabase.com (região São Paulo).
2. Aplique o schema: `npx supabase link --project-ref SEU_REF` e depois `npx supabase db push`. Ou cole o arquivo de `supabase/migrations` no SQL Editor.
3. Em **Authentication > URL Configuration**:
   - Site URL: `https://pulse.domutech.digital`
   - Redirect URLs: `https://pulse.domutech.digital/auth/confirm`
4. Em **Authentication > Providers > Email**: senha com no mínimo 10 caracteres, exigindo maiúsculas, minúsculas e números. O cadastro da imobiliária não pede confirmação de e-mail: a conta é criada já confirmada pelo servidor.
5. Em **Authentication > Email Templates**, troque o link de cada modelo para passar pelo app:
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
6. Configure um SMTP próprio em **Authentication > SMTP** (o Resend serve: host smtp.resend.com, usuário resend, senha = a API key). O SMTP padrão do Supabase tem limite baixo de envios e é usado nos convites e na recuperação de senha.
7. Ative o captcha (Cloudflare Turnstile) em **Authentication > Attack Protection** para proteger o login. O cadastro é feito pelo servidor e não passa por esse captcha; hoje ele tem só um campo armadilha contra robôs, então vale adicionar um captcha próprio no formulário antes de divulgar o cadastro em massa.

## E-mail de boas-vindas

Ao criar a conta, a pessoa entra direto no painel e recebe um e-mail de parabéns, enviado pelo [Resend](https://resend.com) em segundo plano.

1. Crie a conta no Resend e verifique o domínio domutech.digital (registros DNS que o próprio Resend mostra).
2. Crie uma API key e preencha `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `Domu Pulse <contato@domutech.digital>`).
3. Sem essas variáveis o cadastro funciona normalmente, só não envia o e-mail.

O modelo do e-mail fica em `src/lib/email.ts`.

## Notificações (Web Push)

1. Gere as chaves: `npx web-push generate-vapid-keys`
2. Coloque a pública em `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e a privada em `VAPID_PRIVATE_KEY`.
3. Depois do deploy, rode `supabase/cron.sql` no SQL Editor (cria o agendamento a cada 5 minutos, com a URL e o segredo guardados no Vault).

Lembretes enviados:

| Quando | Para quem | Mensagem |
|---|---|---|
| 1h antes do primeiro horário | Corretores sem presença marcada | Marcar presença |
| 10 min antes de cada horário | Corretores trabalhando que ainda não enviaram | Lembrete do relatório |
| 15 min depois do horário | Corretor atrasado | Relatório pendente |
| 15 min depois do horário | Gerente da equipe | Resumo de quem está pendente |

No iPhone, notificações só funcionam com o app instalado na tela de início (iOS 16.4 ou mais novo). A tela Conta guia esse passo.

## Asaas

1. Crie a chave de API (comece pelo sandbox) e coloque em `ASAAS_API_KEY`, com `ASAAS_ENV=sandbox`.
2. Em **Integrações > Webhooks**, cadastre `https://pulse.domutech.digital/api/webhooks/asaas`, defina um token de autenticação (mínimo 32 caracteres) e coloque o mesmo valor em `ASAAS_WEBHOOK_TOKEN`.
3. Eventos usados: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`.
4. O preço por assento fica em `src/lib/plans.ts`.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Cadastre todas as variáveis de `.env.example` em **Settings > Environment Variables**.
3. Adicione o domínio `pulse.domutech.digital` e crie o CNAME no DNS apontando para a Vercel.

## Estrutura

```
src/
  app/
    (auth)/          entrar, criar conta, recuperar e definir senha
    (app)/           painel, agenda, equipe, conta (exigem login)
    api/cron/        lembretes chamados pelo pg_cron
    api/webhooks/    webhook do Asaas
    auth/            links de convite e senha, e saída
  components/        interface (ui/ tem as peças base)
  lib/               acesso a dados, fuso horário, métricas, push, Asaas
  proxy.ts           renovação de sessão e redirecionamentos
supabase/
  migrations/        schema, RLS e triggers
  tests/             testes de segurança do banco
  cron.sql           agendamento dos lembretes
public/sw.js         service worker (push)
```
