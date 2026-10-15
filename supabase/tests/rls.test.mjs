// Testes de segurança do banco. Aplica as migrações num Postgres embutido
// (PGlite), simula o ambiente do Supabase (roles e auth.uid) e tenta
// quebrar as permissões de cada cargo. Rode com: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dirname, "..", "migrations");
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Igual ao padrão do Supabase: tudo liberado, o RLS é que restringe.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  console.log(`migração aplicada: ${file}`);
}
console.log();

const ids = {};
const uid = (n) => (ids[n] ??= crypto.randomUUID());

// ---- Dados: duas imobiliárias -----------------------------------------
await db.exec(`
  insert into auth.users (id) values
    ('${uid("ownerA")}'), ('${uid("dirA")}'), ('${uid("mgr1")}'), ('${uid("mgr2")}'),
    ('${uid("b1")}'), ('${uid("b2")}'), ('${uid("b3")}'), ('${uid("bOff")}'),
    ('${uid("ownerB")}'), ('${uid("bB")}');

  insert into organizations (id, name, status) values ('${uid("orgA")}', 'Imob A', 'active'), ('${uid("orgB")}', 'Imob B', 'active');
  insert into organizations (id, name, status, trial_ends_at) values ('${uid("orgC")}', 'Imob Expirada', 'trialing', now() - interval '1 day');
  insert into divisions (id, org_id, name) values ('${uid("d1")}', '${uid("orgA")}', 'Diretoria'), ('${uid("dB")}', '${uid("orgB")}', 'Diretoria');
  insert into teams (id, org_id, division_id, name) values
    ('${uid("t1")}', '${uid("orgA")}', '${uid("d1")}', 'Equipe 1'),
    ('${uid("t2")}', '${uid("orgA")}', '${uid("d1")}', 'Equipe 2'),
    ('${uid("tB")}', '${uid("orgB")}', '${uid("dB")}', 'Equipe B');

  insert into members (id, org_id, user_id, full_name, role, division_id, team_id, active) values
    ('${uid("m_ownerA")}', '${uid("orgA")}', '${uid("ownerA")}', 'Dona A', 'owner', null, null, true),
    ('${uid("m_dirA")}', '${uid("orgA")}', '${uid("dirA")}', 'Super A', 'director', '${uid("d1")}', null, true),
    ('${uid("m_mgr1")}', '${uid("orgA")}', '${uid("mgr1")}', 'Gerente 1', 'manager', null, '${uid("t1")}', true),
    ('${uid("m_mgr2")}', '${uid("orgA")}', '${uid("mgr2")}', 'Gerente 2', 'manager', null, '${uid("t2")}', true),
    ('${uid("m_b1")}', '${uid("orgA")}', '${uid("b1")}', 'Corretor 1', 'broker', null, '${uid("t1")}', true),
    ('${uid("m_b2")}', '${uid("orgA")}', '${uid("b2")}', 'Corretor 2', 'broker', null, '${uid("t1")}', true),
    ('${uid("m_b3")}', '${uid("orgA")}', '${uid("b3")}', 'Corretor 3', 'broker', null, '${uid("t2")}', true),
    ('${uid("m_bOff")}', '${uid("orgA")}', '${uid("bOff")}', 'Desligado', 'broker', null, '${uid("t1")}', false),
    ('${uid("m_ownerB")}', '${uid("orgB")}', '${uid("ownerB")}', 'Dono B', 'owner', null, null, true),
    ('${uid("m_bB")}', '${uid("orgB")}', '${uid("bB")}', 'Corretor B', 'broker', null, '${uid("tB")}', true);
`);

const today = (await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text as d`)).rows[0].d;

// ---- Harness ------------------------------------------------------------
let passed = 0;
let failed = 0;

async function as(user, sql, params = [], role = "authenticated", aal = "aal1") {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ? uid(user) : ""]);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [user ? JSON.stringify({ sub: uid(user), aal }) : ""]);
    return tx.query(sql, params);
  });
}

function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASSA" : "FALHA"}  ${name}${ok ? "" : `  ${detail}`}`);
}

async function expectRows(name, user, sql, n, params, role, aal) {
  try {
    const r = await as(user, sql, params, role, aal);
    const count = r.affectedRows && !r.rows.length ? r.affectedRows : r.rows.length;
    check(name, count === n, `esperado ${n}, veio ${count}`);
  } catch (e) {
    check(name, false, `erro: ${e.message}`);
  }
}

async function expectError(name, user, sql, pattern, params, role) {
  try {
    await as(user, sql, params, role);
    check(name, false, "executou sem erro");
  } catch (e) {
    check(name, pattern.test(e.message), `erro diferente: ${e.message}`);
  }
}

const insertReport = (member, slot = "12:00", date = today) =>
  `insert into reports (member_id, report_date, report_slot, visits) values ('${uid("m_" + member)}', '${date}', '${slot}', 3) returning id, org_id`;

// ---- Visibilidade ------------------------------------------------------
console.log("Visibilidade de membros");
await expectRows("corretor vê só a si mesmo", "b1", "select id from members", 1);
await expectRows("gerente vê a si e os 2 corretores ativos e 1 inativo da equipe", "mgr1", "select id from members", 4);
await expectRows("superintendente vê a diretoria inteira, sem a dona", "dirA", "select id from members", 7);
await expectRows("dona vê a imobiliária inteira", "ownerA", "select id from members", 8);
await expectRows("dona B não vê nada da imobiliária A", "ownerB", `select id from members where org_id = '${uid("orgA")}'`, 0);
await expectRows("membro desativado não vê nada", "bOff", "select id from members", 0);
await expectRows("sem sessão não vê nada", null, "select id from members", 0);
await expectError("anon não acessa tabelas", null, "select id from members", /permission denied/, [], "anon");

// ---- Relatórios --------------------------------------------------------
console.log("\nRelatórios");
await expectRows("corretor lança o próprio relatório", "b1", insertReport("b1"), 1);
await expectError("corretor não lança para colega", "b1", insertReport("b2"), /row-level security/);
await expectError("corretor não lança para outra imobiliária", "b1", insertReport("bB"), /row-level security/);
await expectError("horário fora da configuração", "b1", insertReport("b1", "13:00"), /Horário de relatório inválido/);
await expectError("data futura", "b1", insertReport("b1", "15:00", "2999-01-01"), /data futura/);
await expectError("corretor não edita relatório antigo", "b1", insertReport("b1", "15:00", "2020-01-01"), /Prazo/);
await expectRows("gerente corrige relatório antigo do seu corretor", "mgr1", insertReport("b2", "15:00", "2020-01-01"), 1);
await expectError("gerente não lança para outra equipe", "mgr1", insertReport("b3"), /row-level security/);
await expectError("não lança para corretor desativado", "mgr1", insertReport("bOff"), /corretores ativos/);
await expectError("não lança relatório para gerente", "dirA", insertReport("mgr1"), /corretores ativos/);
await expectRows("superintendente lança para qualquer corretor da diretoria", "dirA", insertReport("b3"), 1);

const spoof = await as("b1", `insert into reports (org_id, member_id, report_date, report_slot) values ('${uid("orgB")}', '${uid("m_b1")}', '${today}', '18:00') returning org_id`);
check("org_id enviado pelo cliente é ignorado", spoof.rows[0].org_id === uid("orgA"), `veio ${spoof.rows[0].org_id}`);

await expectRows("corretor não apaga relatório (só liderança)", "b1", `delete from reports where member_id = '${uid("m_b1")}' returning id`, 0);
await expectRows("sem sessão não apaga nada (falha do sistema antigo)", null, "delete from reports returning id", 0);
await expectRows("gerente vê relatórios só da equipe", "mgr1", "select id from reports", 3);
await expectRows("corretor 3 não vê relatórios da equipe 1", "b3", "select id from reports", 1);
await expectRows("gerente apaga relatório do seu corretor", "mgr1", `delete from reports where member_id = '${uid("m_b1")}' and report_slot = '18:00' returning id`, 1);

await expectRows("corretor marca presença", "b1", `insert into daily_status (member_id, status_date, online) values ('${uid("m_b1")}', '${today}', true) returning member_id`, 1);
await expectError("corretor não marca presença de colega", "b1", `insert into daily_status (member_id, status_date) values ('${uid("m_b2")}', '${today}')`, /row-level security/);

// ---- Organização e cobrança -------------------------------------------
console.log("\nOrganização e cobrança");
await expectError("dona não muda o próprio status de pagamento", "ownerA", "update organizations set status = 'active'", /permission denied/);
await expectError("dona não aumenta assentos sem pagar", "ownerA", "update organizations set seats = 999", /permission denied/);
await expectRows("dona renomeia a imobiliária", "ownerA", "update organizations set name = 'Imob A Nova' returning id", 1);
await expectRows("corretor não renomeia a imobiliária", "b1", "update organizations set name = 'Hack' returning id", 0);
await expectError("corretor não se promove", "b1", `update members set role = 'owner' where id = '${uid("m_b1")}'`, /permission denied/);
await expectError("corretor não cria membros", "b1", `insert into members (org_id, user_id, full_name, role) values ('${uid("orgA")}', '${uid("b1")}', 'x', 'owner')`, /permission denied/);

await db.exec(`
  insert into auth.users (id) values ('${uid("bC")}');
  insert into divisions (id, org_id, name) values ('${uid("dC")}', '${uid("orgC")}', 'Diretoria C');
  insert into teams (id, org_id, division_id, name) values ('${uid("tC")}', '${uid("orgC")}', '${uid("dC")}', 'Equipe C');
  insert into members (org_id, user_id, full_name, role, team_id) values ('${uid("orgC")}', '${uid("bC")}', 'Corretor C', 'broker', '${uid("tC")}');
`);
await expectError("teste expirado fica somente leitura", "bC", `insert into reports (member_id, report_date, report_slot) select id, '${today}', '12:00' from members`, /row-level security/);

// ---- Demais tabelas ----------------------------------------------------
console.log("\nMetas, agenda, dispositivos e auditoria");
await expectError("corretor não define a própria meta", "b1", `insert into goals (member_id, month, metric, target) values ('${uid("m_b1")}', '2026-10-01', 'sales', 5)`, /row-level security/);
await expectRows("gerente define meta do corretor", "mgr1", `insert into goals (member_id, month, metric, target) values ('${uid("m_b1")}', '2026-10-01', 'sales', 5) returning id`, 1);
await expectRows("corretor agenda visita", "b1", `insert into appointments (member_id, client_name, client_phone, scheduled_at) values ('${uid("m_b1")}', 'Cliente', '(11) 99999-0000', now()) returning id`, 1);
await expectError("telefone com caracteres inválidos", "b1", `insert into appointments (member_id, client_name, client_phone, scheduled_at) values ('${uid("m_b1")}', 'Cliente', '<script>', now())`, /check constraint/);
await expectRows("gerente da outra equipe não vê a agenda", "mgr2", "select id from appointments", 0);
await expectError("não registra dispositivo para outro usuário", "b1", `insert into push_subscriptions (user_id, endpoint, p256dh, auth_key) values ('${uid("b2")}', 'https://push.example/x', 'k', 'a')`, /row-level security/);
await expectRows("registra o próprio dispositivo", "b1", `insert into push_subscriptions (endpoint, p256dh, auth_key) values ('https://push.example/y', 'k', 'a') returning id`, 1);
await expectRows("corretor não lê a auditoria", "b1", "select id from audit_log", 0);
const audit = await as("ownerA", "select id from audit_log");
check("dona lê a auditoria", audit.rows.length > 0, `veio ${audit.rows.length}`);
await expectError("cliente não acessa o log de notificações", "b1", "select * from notification_log", /permission denied/);
await expectError("cliente não acessa eventos de cobrança", "ownerA", "select * from billing_events", /permission denied/);
await expectError("funções internas não ficam expostas ao anon", null, "select private.my_org_id()", /permission denied/, [], "anon");

// ---- Verificação em duas etapas ----------------------------------------
console.log("\nVerificação em duas etapas");
await db.exec(`insert into auth.mfa_factors (user_id, status) values ('${uid("mgr2")}', 'verified'), ('${uid("b3")}', 'unverified')`);
const mgr2Sees = async (aal) => (await as("mgr2", "select id from members", [], "authenticated", aal)).rows.length;
check("com 2FA ativa, só a senha não dá acesso a nada", (await mgr2Sees("aal1")) === 0);
check("com o código confirmado, acesso normal", (await mgr2Sees("aal2")) === 2);
await expectError("com 2FA ativa, só a senha não grava", "mgr2", `insert into daily_status (member_id, status_date) values ('${uid("m_b3")}', '${today}')`, /row-level security/);
await expectRows("fator não confirmado não muda nada", "b3", "select id from members", 1);
await expectRows("quem não ativou 2FA segue normal", "b1", "select id from members", 1);

// ---- Configurações da imobiliária --------------------------------------
console.log("\nConfigurações da imobiliária");
await expectError("fuso inexistente é recusado", "ownerA", "update organizations set timezone = 'Lua/Base'", /Fuso horário inválido/);
await expectError("horário de madrugada é recusado", "ownerA", "update organizations set report_slots = '{03:00,12:00}'", /entre 06:00 e 23:00/);
const slotsSaved = await as("ownerA", "update organizations set report_slots = '{18:00,09:00}' returning report_slots::text as s");
check("horários ficam em ordem", slotsSaved.rows[0]?.s === "{09:00:00,18:00:00}", JSON.stringify(slotsSaved.rows));
await as("ownerA", "update organizations set report_slots = '{12:00,15:00,18:00,21:00}'");

// ---- Avisos no app -----------------------------------------------------
console.log("\nAvisos no app");
await as("mgr1", `insert into goals (member_id, month, metric, target) values ('${uid("m_b2")}', date_trunc('month', '${today}'::date), 'visits', 5)`);
await as("b2", `insert into reports (member_id, report_date, report_slot, visits) values ('${uid("m_b2")}', '${today}', '12:00', 3)`);
await expectRows("abaixo da meta não avisa", "b2", "select id from notifications", 0);
await as("b2", `insert into reports (member_id, report_date, report_slot, visits) values ('${uid("m_b2")}', '${today}', '15:00', 2)`);
await expectRows("ao bater a meta, o corretor recebe o aviso", "b2", "select id from notifications where kind = 'goal_reached'", 1);
await expectRows("o gerente da equipe também", "mgr1", "select id from notifications where kind = 'goal_reached'", 1);
await as("b2", `insert into reports (member_id, report_date, report_slot, visits) values ('${uid("m_b2")}', '${today}', '18:00', 4)`);
await expectRows("passar da meta não avisa de novo", "b2", "select id from notifications", 1);
await expectRows("outro corretor não vê o aviso", "b1", "select id from notifications", 0);
await expectError("cliente não cria aviso", "b2", `insert into notifications (user_id, kind, title) values ('${uid("b2")}', 'x', 'x')`, /permission denied/);
await expectRows("marca o próprio aviso como lido", "b2", "update notifications set read_at = now() returning id", 1);
await expectError("não altera o texto do aviso", "b2", "update notifications set title = 'hack'", /permission denied/);
await expectRows("não marca aviso dos outros", "b1", "update notifications set read_at = now() returning id", 0);

// ---- Carteira de clientes ----------------------------------------------
console.log("\nCarteira de clientes");
await expectRows("corretor cadastra o próprio cliente", "b1", `insert into clients (member_id, name, phone) values ('${uid("m_b1")}', 'Cliente do 1', '(11) 98888-7777') returning id`, 1);
await expectError("corretor não cadastra cliente para colega", "b1", `insert into clients (member_id, name) values ('${uid("m_b2")}', 'x')`, /row-level security/);
await expectError("gerente não cadastra cliente para o corretor", "mgr1", `insert into clients (member_id, name) values ('${uid("m_b2")}', 'x')`, /row-level security/);
await expectRows("corretor 2 cadastra o próprio cliente", "b2", `insert into clients (member_id, name) values ('${uid("m_b2")}', 'Cliente do 2') returning id`, 1);
await expectRows("corretor vê só a própria carteira", "b1", "select id from clients", 1);
await expectRows("gerente vê a carteira da equipe", "mgr1", "select id from clients", 2);
await expectRows("gerente de outra equipe não vê", "mgr2", "select id from clients", 0, [], "authenticated", "aal2");
await expectRows("dona B não vê nada", "ownerB", "select id from clients", 0);
await expectError("telefone inválido é recusado", "b1", `insert into clients (member_id, name, phone) values ('${uid("m_b1")}', 'x', '<b>')`, /check constraint/);
await expectError("e-mail do resumo precisa ser válido", null, `update members set digest_email = 'sem-arroba' where id = '${uid("m_ownerA")}'`, /check constraint/, [], "service_role");
await expectRows("e-mail do resumo válido é aceito", null, `update members set digest_email = 'outro@empresa.com' where id = '${uid("m_ownerA")}' returning id`, 1, [], "service_role");
await expectError("membro não grava o próprio e-mail do resumo pela API", "ownerA", `update members set digest_email = 'x@y.com' where id = '${uid("m_ownerA")}'`, /permission denied|row-level security/);
await expectRows("gerente não edita cliente do corretor", "mgr1", "update clients set stage = 'won' where name = 'Cliente do 2' returning id", 0);
await expectRows("dona não edita cliente do corretor", "ownerA", "update clients set stage = 'won' returning id", 0);
await expectRows("dona não apaga cliente do corretor", "ownerA", "delete from clients returning id", 0);
await expectError("corretor não passa cliente para colega", "b2", `update clients set member_id = '${uid("m_b1")}' where name = 'Cliente do 2'`, /row-level security/);
const moved = await as("b1", "update clients set stage = 'visited' returning stage_changed_at > created_at as ok");
check("mudar de etapa registra o momento", moved.rows[0]?.ok === true, JSON.stringify(moved.rows));
await as(null, `insert into clients (id, org_id, member_id, name) values ('${uid("cB")}', '${uid("orgB")}', '${uid("m_bB")}', 'Cliente B')`, [], "service_role");
await expectError("visita não liga a cliente de outra imobiliária", "b1", `insert into appointments (member_id, client_id, client_name, scheduled_at) values ('${uid("m_b1")}', '${uid("cB")}', 'x', now())`, /foreign key/);
await expectError("membro não muda a própria preferência de resumo direto", "mgr1", "update members set weekly_digest = false", /permission denied/);

// ---- Somas por período ------------------------------------------------
console.log("\nSomas por período");
const monthAgo = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
const totalsSql = `select * from report_totals_by_member('${monthAgo}', '${today}')`;
await expectRows("corretor soma só os próprios relatórios", "b1", totalsSql, 1);
await expectRows("gerente soma só a própria equipe (sem o corretor 3)", "mgr1", totalsSql, 2);
await expectRows("dona soma a imobiliária inteira", "ownerA", totalsSql, 3);
await expectRows("dona B não soma nada da imobiliária A", "ownerB", totalsSql, 0);
await expectError("anon não chama as somas", null, totalsSql, /permission denied/, [], "anon");
await expectError("período maior que 1 ano é recusado", "ownerA", "select * from report_totals_by_day('2020-01-01', '2026-01-01')", /Período inválido/);

// ---- Plataforma (só o servidor) ---------------------------------------
console.log("\nPlataforma");
for (const table of ["rate_limits", "ops_alerts", "system_heartbeats", "coupons"]) {
  await expectError(`cliente não lê ${table}`, "ownerA", `select * from ${table}`, /permission denied/);
}
await expectError("cliente não chama o limitador", "ownerA", "select * from hit_rate_limit('x', 60)", /permission denied/);
await expectError("anon não resgata cupom", null, "select redeem_coupon('X', null)", /permission denied/, [], "anon");
await expectError("cliente não registra erro", "ownerA", "select record_ops_event('f','s','error','m',null,'{}',1)", /permission denied/);
await expectError("dona não aplica cupom direto na organização", "ownerA", "update organizations set coupon_code = 'X'", /permission denied/);
await expectError("membro não grava o próprio aceite dos termos", "b1", "update members set terms_accepted_at = now()", /permission denied/);

const hits = [];
for (let i = 0; i < 3; i++) hits.push((await as(null, "select hits from hit_rate_limit('login:1.2.3.4', 60)", [], "service_role")).rows[0].hits);
check("limitador conta as tentativas em sequência", JSON.stringify(hits) === "[1,2,3]", `veio ${hits}`);

const ev = async () => (await as(null, "select record_ops_event('fp1','cron','error','falhou',null,'{}',1) as novo", [], "service_role")).rows[0].novo;
const firstEv = await ev();
const secondEv = await ev();
const grouped = await as(null, "select occurrences from ops_alerts where fingerprint = 'fp1'", [], "service_role");
check("erro novo avisa, repetição só soma", firstEv === true && secondEv === false && grouped.rows[0].occurrences === 2, `${firstEv} ${secondEv} ${JSON.stringify(grouped.rows)}`);
await as(null, "update ops_alerts set resolved_at = now() where fingerprint = 'fp1'", [], "service_role");
check("erro resolvido que volta abre de novo", (await ev()) === true);

await as(null, "select record_heartbeat('cron.x', true, '{}', null)", [], "service_role");
await as(null, "select record_heartbeat('cron.x', false, '{}', 'caiu')", [], "service_role");
const hb = (await as(null, "select run_count, last_error, last_ok_at is not null as ok_before from system_heartbeats where name = 'cron.x'", [], "service_role")).rows[0];
check("batimento guarda a falha sem perder o último sucesso", hb.run_count === 2 && hb.last_error === "caiu" && hb.ok_before, JSON.stringify(hb));

const redeem = async (code, org) =>
  (await as(null, `select * from redeem_coupon('${code}', '${uid(org)}')`, [], "service_role")).rows[0] ?? null;
await as(null, "insert into coupons (code, percent_off, max_redemptions) values ('PILOTO', 20, 1)", [], "service_role");
const r1 = await redeem("piloto", "orgA");
const r2 = await redeem("PILOTO", "orgB");
check("cupom respeita o limite de usos", Number(r1?.percent_off) === 20 && r2 === null, `${JSON.stringify(r1)} ${JSON.stringify(r2)}`);

await as(null, "insert into coupons (code, free_days) values ('AMIGO30', 30)", [], "service_role");
const d1 = await redeem("AMIGO30", "orgA");
const d2 = await redeem("AMIGO30", "orgA");
const d3 = await redeem("AMIGO30", "orgB");
check("cupom de dias grátis devolve os dias", d1?.free_days === 30 && d1?.percent_off === null, JSON.stringify(d1));
check("a mesma imobiliária não usa o cupom duas vezes", d2 === null, JSON.stringify(d2));
check("outra imobiliária usa normalmente", d3?.free_days === 30, JSON.stringify(d3));
check("cupom inexistente não devolve nada", (await redeem("NAOEXISTE", "orgA")) === null);
await expectError("cupom precisa de exatamente um benefício", null, "insert into coupons (code, percent_off, free_days) values ('DUPLO', 10, 10)", /coupons_one_benefit/, [], "service_role");

// ---- Valor fixo e link de convite --------------------------------------
await expectRows("conta existente ganha link de convite", null, "select code from org_invites where code ~ '^[0-9a-f]{32}$'", 3, [], "service_role");
await expectRows("valor padrão de R$ 500", null, "select 1 from platform_settings where monthly_price_cents = 50000", 1, [], "service_role");
await expectError("corretor não lê o código de convite", "b1", "select code from org_invites", /permission denied/);
await expectError("dono não lê o código de convite pela API", "ownerA", "select code from org_invites", /permission denied/);
await expectError("visitante não lê o código de convite", null, "select code from org_invites", /permission denied/, [], "anon");
await expectError("dono não muda o valor da assinatura", "ownerA", "update platform_settings set monthly_price_cents = 1", /permission denied/);
await expectError("dono não muda o valor que assinou", "ownerA", "update organizations set price_cents = 1", /permission denied/);
// ---- Notas fiscais --------------------------------------------------------
await as(null, `insert into invoices (org_id, member_id, number, amount_cents, issued_on, description, file_path, file_name) values
  ('${uid("orgA")}', '${uid("m_b1")}', '101', 50000, current_date, 'Comissão de teste', 'x/y/1.pdf', '1.pdf'),
  ('${uid("orgA")}', '${uid("m_b3")}', '202', 70000, current_date, 'Valor mensal', 'x/y/2.pdf', '2.pdf')`, [], "service_role");
await expectRows("corretor vê só as próprias notas", "b1", "select id from invoices", 1);
await expectRows("gerente vê as notas da equipe dele", "mgr1", "select id from invoices", 1);
await expectRows("dona vê todas as notas", "ownerA", "select id from invoices", 2);
await expectRows("outra imobiliária não vê as notas", "ownerB", "select id from invoices", 0);
await expectError("corretor não cria nota sem passar pelo servidor", "b1", `insert into invoices (org_id, member_id, number, amount_cents, issued_on, description, file_path, file_name) values ('${uid("orgA")}', '${uid("m_b1")}', '1', 1, current_date, 'xx', 'a', 'a')`, /permission denied/);
await expectError("liderança não muda situação sem passar pelo servidor", "ownerA", "update invoices set status = 'paid'", /permission denied/);

// ---- Emissão de NFS-e ----------------------------------------------------
await as(null, `insert into fiscal_profiles (member_id, org_id, cnpj, legal_name, simples_option, cep, street, number, district, city, uf, city_ibge, certificate_encrypted)
  values ('${uid("m_b1")}', '${uid("orgA")}', '12345678000195', 'Corretor 1 MEI', 2, '01001000', 'Rua A', '1', 'Centro', 'São Paulo', 'SP', '3550308', 'cifrado')`, [], "service_role");
await expectError("corretor não lê o próprio certificado guardado", "b1", "select certificate_encrypted from fiscal_profiles", /permission denied/);
await expectError("dona não lê os dados fiscais dos corretores pela API", "ownerA", "select * from fiscal_profiles", /permission denied/);
await expectError("ninguém pega número de nota pela API", "b1", `select take_dps_number('${uid("m_b1")}')`, /permission denied/);
const dps1 = await as(null, `select take_dps_number('${uid("m_b1")}') as n`, [], "service_role");
const dps2 = await as(null, `select take_dps_number('${uid("m_b1")}') as n`, [], "service_role");
check("número da nota é sequencial e não repete", dps1.rows[0].n === 1 && dps2.rows[0].n === 2, JSON.stringify([dps1.rows, dps2.rows]));
await expectError("dona não muda os dados fiscais da imobiliária pela API", "ownerA", "update organizations set fiscal_cnpj = '11111111000111'", /permission denied/);
await expectError("nota enviada pronta precisa de arquivo", null, `insert into invoices (org_id, member_id, number, amount_cents, issued_on, description, source) values ('${uid("orgA")}', '${uid("m_b1")}', '9', 100, current_date, 'teste', 'upload')`, /invoices_upload_has_file/, [], "service_role");

await expectError("ninguém lê a fila de reenvio de notas pela API", "ownerA", "select * from nfse_pending", /permission denied/);
await expectError("ninguém lê os registros de acesso pela API", "ownerA", "select * from access_logs", /permission denied/);
await expectError("dono não estende o próprio acesso após cancelar", "ownerA", "update organizations set cancel_at = now() + interval '1 year'", /permission denied/);
await expectError("só existe uma linha de configuração", null, "insert into platform_settings (id) values (false)", /check/, [], "service_role");

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
