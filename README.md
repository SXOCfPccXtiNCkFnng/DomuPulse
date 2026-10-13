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
| E-mail | Resend, com modelo visual próprio |
| Agendador | cron-job.org chamando as rotas `/api/cron/*` |
| Cobrança | Asaas (assinatura mensal por assento, Pix, boleto ou cartão, com cupons) |
| Hospedagem | Vercel |

## Segurança: como funciona

1. **Toda autorização vive no banco.** Cada tabela tem RLS. O front só pede; o Postgres decide o que cada cargo vê e altera. As regras ficam em `supabase/migrations`.
2. **Hierarquia:** administrador (owner) > superintendente (director) > gerente (manager) > corretor (broker). Cada nível vê e edita apenas quem está abaixo dele, dentro do próprio escopo.
3. **Isolamento entre imobiliárias:** `org_id` é sempre derivado do membro por trigger, nunca do que o cliente envia.
4. **Campos sensíveis bloqueados por coluna:** o administrador não consegue alterar plano, status de pagamento, assentos nem cupom pelo cliente.
5. **Assinatura vencida = somente leitura,** aplicado no próprio RLS.
6. **Login:** senha com 10 caracteres, maiúscula, minúscula, número e símbolo; nome e sobrenome; WhatsApp com DDD validado.
7. **Limite de tentativas** no login, cadastro, recuperação de senha e convites, contado no banco (vale para todos os servidores), e **captcha** (Cloudflare Turnstile) nas mesmas telas.
8. **Verificação em duas etapas** (aplicativo autenticador): opcional para todos, obrigatória no painel interno. Exigida também no banco: com ela ativa, só a senha não lê nem grava nada.
9. **Troca de senha** pedindo a atual, aviso por e-mail quando a senha muda e botão para sair de todos os aparelhos.
10. **Aceite dos termos registrado:** data, versão e IP de quem aceitou (cadastro e primeiro acesso por convite).
11. **Chave secreta só no servidor** (`SUPABASE_SECRET_KEY`), usada apenas depois de verificar a permissão de quem chamou.
12. **Cabeçalhos de segurança** (CSP, HSTS, X-Frame-Options e outros) em `next.config.ts`.
13. **Webhook e crons autenticados** com segredo comparado em tempo constante; webhook idempotente.
14. **Auditoria:** alterações em membros, relatórios, agenda, metas, comissões e ações do painel interno ficam em `audit_log`.

## Testes

| Comando | O que faz |
|---|---|
| `npm test` | Testes de unidade: senha, nome, telefone, CPF e CNPJ, redirecionamento, fuso, ranking, preço, registro de erros |
| `npm run test:db` | Aplica as migrações num Postgres embutido e tenta quebrar as permissões de cada cargo (95 cenários) |
| `npm run typecheck` | Tipos do TypeScript |
| `npm run lint` | Lint |

O GitHub roda tudo isso e o build a cada envio para `main` (`.github/workflows/ci.yml`).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

Sem o Resend configurado, os e-mails aparecem no terminal (com os links de convite e senha), para testar localmente. Para testar notificações no computador é preciso HTTPS: `npx next dev --experimental-https`.

## Configurando o Supabase

1. Crie um projeto em supabase.com (região São Paulo).
2. Aplique o schema: `npx supabase link --project-ref SEU_REF` e depois `npx supabase db push`. Ou cole os arquivos de `supabase/migrations`, em ordem, no SQL Editor.
3. Em **Authentication > URL Configuration**:
   - Site URL: `https://pulse.domutech.digital`
   - Redirect URLs: `https://pulse.domutech.digital/auth/confirm`
4. Em **Authentication > Providers > Email**: senha com no mínimo 10 caracteres, exigindo minúsculas, maiúsculas, números e símbolos.
5. Em **Authentication > Multi-Factor**, confirme que o TOTP (aplicativo autenticador) está habilitado.

## Captcha (Cloudflare Turnstile)

1. Em dash.cloudflare.com, abra **Turnstile** e adicione o site `pulse.domutech.digital` (e `localhost` para testar), no modo **Managed**.
2. Preencha `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`.

Sem as chaves, o captcha fica desligado e a Saúde do sistema avisa.

Não é preciso mexer nos modelos de e-mail nem no SMTP do Supabase: cadastro, convite e recuperação de senha saem pelo Resend, com a marca do Pulse.

## E-mails

| E-mail | Quando |
|---|---|
| Boas-vindas | Ao criar a conta da imobiliária |
| Convite | Quando a liderança convida alguém (link vale 24 h) |
| Nova senha | Recuperação de senha (link vale 1 h) |
| Senha alterada | Quando a senha muda, com link para recuperar se não foi a pessoa |
| Teste acabando | 3 dias antes do fim do teste |
| Teste encerrado | No dia em que o teste acaba |
| Pagamento confirmado | Quando o Asaas confirma o pagamento |
| Fatura em aberto | Quando a fatura vence sem pagamento |
| Alerta de erro | Para a equipe DomuTech, quando surge um erro novo |

1. Crie a conta no [Resend](https://resend.com) e verifique o domínio domutech.digital (registros DNS que o Resend mostra).
2. Crie uma API key e preencha `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `Domu Pulse <contato@domutech.digital>`).

Os modelos ficam em `src/lib/email-templates.ts`, e a casca visual em `src/lib/email.ts`.

## Crons (cron-job.org)

O plano gratuito da Vercel só roda cron uma vez por dia, então as rotinas ficam no [cron-job.org](https://cron-job.org). Crie uma tarefa para cada rota, todas com o cabeçalho `Authorization: Bearer SEU_CRON_SECRET`:

| URL | Frequência | O que faz |
|---|---|---|
| `https://pulse.domutech.digital/api/cron/reminders` | a cada 5 minutos | Lembretes de relatório no celular |
| `https://pulse.domutech.digital/api/cron/billing` | 1 vez por dia, de manhã | Avisos de teste acabando e encerrado |
| `https://pulse.domutech.digital/api/cron/cleanup` | 1 vez por dia, de madrugada | Apaga registros técnicos antigos |
| `https://pulse.domutech.digital/api/cron/weekly` | toda segunda, às 8h | Resumo da semana por e-mail para a liderança |

Cada execução fica registrada. Se uma tarefa parar, a aba Saúde do sistema do painel interno mostra.

Gere o segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Notificações (Web Push)

1. Gere as chaves: `npx web-push generate-vapid-keys`
2. Coloque a pública em `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e a privada em `VAPID_PRIVATE_KEY`.

| Quando | Para quem | Mensagem |
|---|---|---|
| 1 h antes do primeiro horário | Corretores sem presença marcada | Marcar presença |
| 10 min antes de cada horário | Corretores trabalhando que ainda não enviaram | Lembrete do relatório |
| 15 min depois do horário | Corretor atrasado | Relatório pendente |
| 15 min depois do horário | Gerente da equipe | Resumo de quem está pendente |

No iPhone, notificações só funcionam com o app instalado na tela de início (iOS 16.4 ou mais novo). A tela Conta guia esse passo.

## Avisos no app

O sininho (barra lateral no computador, topo no celular) mostra avisos que chegam ao vivo:

| Aviso | Para quem |
|---|---|
| Meta batida | Corretor e gerente da equipe (detectado no banco, no momento em que o total do mês cruza a meta) |
| Novo membro na equipe | Liderança acima de quem aceitou o convite |
| Pagamento confirmado ou fatura em aberto | Administrador |
| Teste acabando ou encerrado | Administrador |

Avisos lidos somem em 60 dias; não lidos, em 180 (rotina de limpeza).

## Carteira de clientes

Página **Clientes**: cada cliente num quadro por etapa (novo lead, em conversa, visita agendada, visitou, proposta, pré-venda, venda, perdido). Arrastar entre colunas no computador; no celular, a etapa muda na ficha. A ficha tem WhatsApp e ligação a um toque, valor do negócio, origem, anotações, motivo da perda e botão para agendar visita (que aparece na Agenda e avança o cliente para "Visita agendada"). Mesmas regras de acesso da agenda.

O quadro não altera os números dos relatórios por horário: são registros separados.

## Resumo semanal

Toda segunda, cada pessoa da liderança recebe por e-mail (e no sininho) o resumo da semana anterior do seu escopo: leads, agendamentos, visitas e vendas com a comparação com a semana anterior, taxa de entrega dos relatórios, destaques e quem precisa de atenção. Dá para desligar em Conta, Notificações.

## Importar equipe por planilha

Em **Equipe, Importar planilha**: CSV com nome, e-mail, cargo (corretor ou gerente) e equipe. Até 200 pessoas por vez. A tela mostra o problema de cada linha antes de enviar; o servidor confere tudo de novo e checa os assentos antes de mandar qualquer convite. Planilha do Excel: salve como CSV.

## Configurações e equipe

- **Conta, Imobiliária** (só o administrador): nome, fuso horário e horários de relatório (de 1 a 8, entre 06:00 e 23:00, com 1 hora de distância). O banco também valida.
- **Equipe:** editar nome, cargo e equipe de cada pessoa, reenviar convite pendente, renomear e excluir equipes vazias, renomear diretorias.

## Painel interno

Em `/interno`, só para os e-mails listados em `PLATFORM_ADMIN_EMAILS`. Para qualquer outra pessoa, logada ou não, a página responde "não encontrada".

| Aba | O que mostra |
|---|---|
| Visão geral | Receita mensal, imobiliárias por situação, pessoas ativas, relatórios do dia, testes acabando |
| Saúde do sistema | Variáveis configuradas, migrações aplicadas e última execução de cada cron e do webhook |
| Erros | Erros e avisos agrupados, com contador, detalhes e botão de resolvido |
| Empresas | Lista com dono, assentos e último relatório; estender teste, liberar acesso e suspender |
| Comercial | Cupons de desconto: criar, limitar usos, dar validade e desativar |

Os erros do servidor chegam sozinhos: tudo que passa por `logger.error` vai para o painel, e um erro novo gera um e-mail para a equipe.

## Asaas

1. Crie a chave de API (comece pelo sandbox) e coloque em `ASAAS_API_KEY`, com `ASAAS_ENV=sandbox`.
2. Em **Integrações > Webhooks**, cadastre `https://pulse.domutech.digital/api/webhooks/asaas`, defina um token de autenticação (mínimo 32 caracteres) e coloque o mesmo valor em `ASAAS_WEBHOOK_TOKEN`.
3. Eventos usados: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`.
4. O preço por assento fica em `src/lib/plans.ts`. Os assentos pedidos só passam a valer quando o pagamento confirma.

## Termos e privacidade

Páginas em `/termos` e `/privacidade`. Ao alterar o texto, troque a data em `LEGAL_DOCS_VERSION` (`src/lib/legal.ts`): é ela que fica registrada no aceite de cada pessoa. Vale uma revisão por advogado antes de vender.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Cadastre todas as variáveis de `.env.example` em **Settings > Environment Variables**.
3. Adicione o domínio `pulse.domutech.digital` e crie o CNAME no DNS apontando para a Vercel.
4. Crie as tarefas no cron-job.org.

O plano Hobby da Vercel é para uso não comercial. Para validar está ótimo; ao começar a cobrar clientes, migre para o plano Pro.

## Estrutura

```
src/
  app/
    (auth)/          entrar, criar conta, recuperar e definir senha
    (app)/           painel, clientes, relatórios, metas, agenda, equipe, conta (exigem login)
    interno/         painel interno da DomuTech
    termos/          Termos de Uso
    privacidade/     Política de Privacidade
    api/cron/        rotinas chamadas pelo cron-job.org
    api/webhooks/    webhook do Asaas
    auth/            links de convite e senha, e saída
  components/        interface (ui/ tem as peças base)
  lib/               dados, e-mail, logger, limite de tentativas, fuso, métricas, push, Asaas
  proxy.ts           renovação de sessão e redirecionamentos
supabase/
  migrations/        schema, RLS, triggers e recursos de plataforma
  tests/             testes de segurança do banco
public/sw.js         service worker (push)
```
