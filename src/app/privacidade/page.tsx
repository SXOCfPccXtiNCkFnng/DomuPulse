import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal-document";
import { COMPANY, CONTACT_EMAIL, companyIdentification } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Domu Pulse trata dados pessoais, de acordo com a LGPD.",
};

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline underline-offset-4">
    {CONTACT_EMAIL}
  </a>
);

const terms = (
  <Link href="/termos" className="font-medium text-ink underline underline-offset-4">
    Termos de Uso
  </Link>
);

const table = "w-full border-collapse text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-semibold";

const sections: LegalSection[] = [
  {
    title: "Quem somos e a quem esta Política se aplica",
    body: (
      <>
        <p>
          Esta Política explica como a {companyIdentification()} (&quot;DomuTech&quot;, &quot;nós&quot;) trata dados
          pessoais no Domu Pulse (&quot;Plataforma&quot;), de acordo com a Lei 13.709/2018 (Lei Geral de Proteção de Dados,
          &quot;LGPD&quot;) e o Marco Civil da Internet (Lei 12.965/2014).
        </p>
        <p>
          Ela vale para quem visita o site, para as empresas que contratam a Plataforma (&quot;Contratante&quot;) e para
          as pessoas da equipe delas que usam o sistema (&quot;Usuários&quot;). Ela completa os {terms}.
        </p>
      </>
    ),
  },
  {
    title: "Papel da DomuTech em cada tipo de dado",
    body: (
      <>
        <p>
          <strong>Controladora:</strong> nos dados de cadastro, acesso, segurança e cobrança da Contratante e dos Usuários, a
          DomuTech decide como e por que tratá-los.
        </p>
        <p>
          <strong>Operadora:</strong> nos dados de clientes e interessados que a equipe cadastra na carteira de clientes e na
          agenda, e nos dados de candidatos às vagas da empresa, a controladora é a empresa. A DomuTech só armazena e organiza esses dados para prestar o serviço,
          conforme o uso da Plataforma pela Contratante, que responde pela origem, pela base legal e pelos pedidos desses
          titulares.
        </p>
      </>
    ),
  },
  {
    title: "Dados que tratamos",
    body: (
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail, WhatsApp de contato, cargo, equipe e empresa.</li>
        <li><strong>Acesso:</strong> senha (guardada de forma irreversível pelo provedor de login, que ninguém consegue ler), código da verificação em duas etapas, quando ativada, e sessões ativas.</li>
        <li><strong>Operação:</strong> relatórios de produção, presença do dia, metas, comissões, observações e visitas agendadas.</li>
        <li><strong>Clientes da carteira:</strong> nome, telefone, e-mail, origem, interesse, valor do negócio, etapa e anotações inseridos pela equipe.</li>
        <li><strong>Candidatos (contas de recrutamento):</strong> nome, telefone, nome de perfil do WhatsApp, e-mail, cidade, currículo, resumo e nota gerados pela inteligência artificial, histórico das mensagens trocadas com o atendimento automático no WhatsApp (incluindo as respostas escritas pela inteligência artificial), vaga escolhida, situação no processo seletivo e entrevistas marcadas.</li>
        <li><strong>Cobrança:</strong> CPF ou CNPJ, valores, faturas e situação dos pagamentos, processados pelo Asaas.</li>
        <li><strong>Notas fiscais:</strong> dados fiscais do corretor e da empresa (CNPJ, razão social, regime, inscrição municipal e endereço), as notas emitidas ou enviadas e os arquivos delas. O certificado digital A1 do corretor e a senha dele ficam guardados criptografados (AES-256), só são abertos no servidor no momento de emitir ou cancelar uma nota pedida pelo próprio corretor e são apagados junto com a conta.</li>
        <li><strong>Aparelhos:</strong> endereço técnico de notificação e tipo de navegador de cada aparelho que ativar os avisos.</li>
        <li><strong>Segurança e registros:</strong> endereço IP, data e hora de acesso, tentativas de login, aceite destes documentos e registro de alterações feitas na conta.</li>
        <li><strong>Contato:</strong> mensagens trocadas com o suporte por e-mail ou WhatsApp.</li>
      </ul>
    ),
  },
  {
    title: "Como os dados chegam até nós",
    body: (
      <ul>
        <li>Informados por você, no cadastro, no uso da Plataforma e no contato com o suporte.</li>
        <li>Informados pela sua empresa, quando o administrador ou a liderança convidam você ou cadastram sua equipe.</li>
        <li>Gerados automaticamente pelo uso, como registros de acesso, IP e tipo de aparelho.</li>
        <li>Recebidos de parceiros, como a confirmação de pagamento enviada pelo Asaas e o resultado da verificação contra robôs.</li>
      </ul>
    ),
  },
  {
    title: "Para que usamos e com qual base legal",
    body: (
      <table className={table}>
        <thead>
          <tr>
            <th>Finalidade</th>
            <th>Base legal (LGPD, art. 7º)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Criar e manter a conta, prestar o serviço e o suporte</td>
            <td>Execução de contrato</td>
          </tr>
          <tr>
            <td>Cobrar a Assinatura e emitir faturas</td>
            <td>Execução de contrato e cumprimento de obrigação legal</td>
          </tr>
          <tr>
            <td>Enviar e-mails operacionais: boas-vindas, convites, senha, cobrança e resumo semanal</td>
            <td>Execução de contrato</td>
          </tr>
          <tr>
            <td>Enviar notificações no celular e no computador</td>
            <td>Consentimento, dado ao ativar os avisos e revogável a qualquer momento</td>
          </tr>
          <tr>
            <td>Prevenir fraude, robôs e acesso indevido, e manter a segurança</td>
            <td>Legítimo interesse e proteção do crédito</td>
          </tr>
          <tr>
            <td>Guardar registros de acesso e cobrança</td>
            <td>Cumprimento de obrigação legal (Marco Civil e legislação fiscal)</td>
          </tr>
          <tr>
            <td>Registrar o aceite dos Termos e desta Política e defender direitos em processos e reclamações</td>
            <td>Exercício regular de direitos</td>
          </tr>
          <tr>
            <td>
              Guardar, organizar e processar dados de clientes e de candidatos, inclusive com inteligência artificial,
              como operadora da Contratante
            </td>
            <td>A base legal é definida pela Contratante, que é a controladora desses dados</td>
          </tr>
          <tr>
            <td>Melhorar a Plataforma com estatísticas anonimizadas</td>
            <td>Legítimo interesse</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "O que não fazemos",
    body: (
      <ul>
        <li>Não vendemos nem alugamos dados pessoais.</li>
        <li>Não usamos dados para publicidade nem os compartilhamos para que terceiros façam publicidade.</li>
        <li>Não usamos cookies de rastreamento ou de anúncios.</li>
        <li>Não tomamos decisões automatizadas que afetem seus direitos. A nota que a inteligência artificial sugere para um currículo é só um apoio: quem aprova ou recusa um candidato é sempre uma pessoa da empresa. Ainda assim, o candidato pode pedir à empresa informações sobre os critérios usados e a revisão de qualquer avaliação feita de forma automática (LGPD, art. 20).</li>
        <li>Não usamos os currículos, as conversas nem os demais dados das empresas para treinar modelos de inteligência artificial próprios.</li>
        <li>Não acessamos os dados das empresas, salvo para suporte pedido por elas, segurança ou obrigação legal.</li>
      </ul>
    ),
  },
  {
    title: "Quem vê seus dados dentro da sua empresa",
    body: (
      <p>
        Cada empresa é isolada das demais. Dentro dela, cada cargo vê apenas o que lhe cabe: o corretor vê os próprios
        números e clientes, o gerente vê a equipe dele, o superintendente vê a diretoria dele e o administrador vê a
        empresa inteira. A liderança acompanha a carteira de clientes da equipe, mas só o corretor responsável altera os
        clientes dele.
      </p>
    ),
  },
  {
    title: "Com quem compartilhamos",
    body: (
      <>
        <p>Somente com fornecedores necessários para o serviço, contratados com obrigação de sigilo e segurança:</p>
        <ul>
          <li><strong>Supabase:</strong> banco de dados, login e atualização em tempo real.</li>
          <li><strong>Vercel:</strong> hospedagem da Plataforma.</li>
          <li><strong>Resend:</strong> envio dos e-mails.</li>
          <li><strong>Asaas:</strong> cobrança, faturas e confirmação de pagamentos.</li>
          <li><strong>Cloudflare (Turnstile):</strong> verificação contra robôs nas telas de entrada e cadastro.</li>
          <li><strong>Sistema Nacional da NFS-e (Receita Federal):</strong> autorização e cancelamento das notas fiscais de serviço dos corretores. É o sistema oficial do governo; o Pulse envia a nota assinada com o certificado do corretor.</li>
          <li><strong>Google (Gemini):</strong> inteligência artificial das contas de recrutamento. Lê os currículos e sugere a nota (recebe o currículo e os critérios da vaga) e escreve as respostas do atendimento automático no WhatsApp e identifica a vaga de interesse (recebe as mensagens da conversa, o nome do candidato, as vagas abertas e as instruções configuradas pela empresa).</li>
          <li><strong>Evolution API e WhatsApp:</strong> conexão do número de WhatsApp da empresa, para receber e enviar as mensagens dos candidatos. O servidor da Evolution API é operado pela DomuTech em provedor de nuvem contratado, e as mensagens também trafegam pelo próprio WhatsApp (Meta).</li>
          <li><strong>ViaCEP:</strong> consulta de endereço pelo CEP no cadastro fiscal (só o CEP é enviado).</li>
          <li><strong>Serviços de notificação do navegador</strong> (Google, Apple, Mozilla ou Microsoft, conforme o aparelho): entrega dos avisos.</li>
        </ul>
        <p>
          Também podemos compartilhar por ordem judicial ou exigência de autoridade, para defender direitos da DomuTech, ou em
          caso de reorganização, fusão ou venda do negócio, mantido o mesmo nível de proteção.
        </p>
      </>
    ),
  },
  {
    title: "Transferência internacional",
    body: (
      <>
        <p>
          Alguns dos fornecedores listados acima, como Vercel, Resend, Cloudflare e Google, podem armazenar ou processar
          dados fora do Brasil, principalmente nos Estados Unidos e na União Europeia.
        </p>
        <p>
          Essas transferências seguem o art. 33 da LGPD e o regulamento de transferência internacional da ANPD (Resolução
          CD/ANPD nº 19/2024), com base em cláusulas contratuais de proteção de dados firmadas com os fornecedores ou em
          outro mecanismo admitido pela lei. Você pode pedir mais informações sobre essas transferências pelo canal do
          encarregado, no fim desta Política.
        </p>
      </>
    ),
  },
  {
    title: "Como protegemos",
    body: (
      <ul>
        <li>Conexão sempre criptografada (HTTPS) e dados guardados em provedores com padrões de segurança reconhecidos.</li>
        <li>Regras de acesso aplicadas dentro do próprio banco de dados, e não só na tela.</li>
        <li>Senha forte obrigatória, verificação em duas etapas disponível e limite de tentativas contra adivinhação de senha.</li>
        <li>Verificação contra robôs no login, no cadastro e na recuperação de senha.</li>
        <li>Registro das alterações em relatórios, agenda, clientes e equipe.</li>
        <li>Acesso interno restrito à equipe da DomuTech que precisa dele, com verificação em duas etapas obrigatória.</li>
      </ul>
    ),
  },
  {
    title: "Por quanto tempo guardamos",
    body: (
      <table className={table}>
        <thead>
          <tr>
            <th>Dado</th>
            <th>Prazo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cadastro, Dados da Operação, carteira de clientes, candidatos e conversas do WhatsApp</td>
            <td>
              Enquanto a conta existir e até 90 dias após o encerramento, salvo exclusão antes pelo próprio usuário ou pela
              empresa (excluir um candidato apaga também o currículo e as conversas dele)
            </td>
          </tr>
          <tr>
            <td>Registros de acesso à aplicação (IP, data e hora)</td>
            <td>6 meses, como exige o Marco Civil da Internet (art. 15)</td>
          </tr>
          <tr>
            <td>Registros de cobrança e faturas</td>
            <td>5 anos, pela legislação fiscal e tributária</td>
          </tr>
          <tr>
            <td>Registro de alterações feitas na conta</td>
            <td>2 anos</td>
          </tr>
          <tr>
            <td>Aceite dos Termos e da Política</td>
            <td>Enquanto a conta existir e pelo prazo para defesa de direitos</td>
          </tr>
          <tr>
            <td>Avisos dentro da Plataforma</td>
            <td>60 dias depois de lidos, ou 180 dias se não lidos</td>
          </tr>
          <tr>
            <td>Histórico de envio de notificações ao celular e ao computador</td>
            <td>30 dias</td>
          </tr>
          <tr>
            <td>Tentativas de acesso usadas no limite de segurança</td>
            <td>Até 1 dia</td>
          </tr>
          <tr>
            <td>Cópias de segurança dos provedores</td>
            <td>Pelo ciclo de backup do provedor, depois são sobrescritas</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "Seus direitos",
    body: (
      <>
        <p>Pela LGPD (art. 18), você pode pedir:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>portabilidade dos dados a outro fornecedor;</li>
          <li>eliminação dos dados tratados com base no consentimento, e informação sobre a possibilidade de não consentir;</li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>revogação do consentimento, como desativar as notificações;</li>
          <li>oposição a tratamento feito com base em outra hipótese legal, quando estiver em desacordo com a LGPD;</li>
          <li>revisão de decisões tomadas unicamente com base em tratamento automatizado (art. 20).</li>
        </ul>
        <p>
          <strong>Pela própria Plataforma:</strong> em Conta, aba Privacidade e dados, você baixa uma cópia dos seus dados e
          pode excluir sua conta a qualquer momento. Nome, e-mail e cargo podem ser corrigidos pela liderança da sua
          empresa, e as notificações são desativadas em Conta, aba Notificações.
        </p>
        <p>
          <strong>Por e-mail:</strong> pelo {mail}. A confirmação de que tratamos seus dados é dada de imediato, em formato
          simplificado, e a declaração completa, em até 15 dias do pedido (LGPD, art. 19). Podemos pedir informações para
          confirmar sua identidade. Alguns pedidos podem ser limitados quando a lei exigir a guarda dos dados, e nesse caso
          explicamos o motivo.
        </p>
        <p>
          Você também pode reclamar à Agência Nacional de Proteção de Dados (ANPD), em gov.br/anpd.
        </p>
      </>
    ),
  },
  {
    title: "Exclusão da conta",
    body: (
      <>
        <p>
          <strong>Corretor, gerente e superintendente:</strong> nome, e-mail, aparelhos, avisos e registros de alteração do
          cadastro são apagados, e o acesso é bloqueado de vez. Os números de produção lançados ficam com a empresa, sem
          identificar a pessoa, porque fazem parte do histórico de trabalho da empresa.
        </p>
        <p>
          <strong>Administrador:</strong> como é o titular da conta, a exclusão apaga a empresa inteira, com equipe,
          relatórios, clientes, agenda e metas, e cancela a assinatura. Ficam guardados só os registros que a lei manda
          manter, como os de cobrança.
        </p>
      </>
    ),
  },
  {
    title: "Dados de clientes e candidatos cadastrados pela empresa",
    body: (
      <p>
        Se você é cliente, interessado ou candidato a uma vaga de uma empresa que usa o Pulse, quem decide sobre os seus dados é a
        empresa. Procure-a primeiro para exercer seus direitos. Se nos procurar, encaminhamos o pedido à empresa
        responsável e a apoiamos no atendimento.
      </p>
    ),
  },
  {
    title: "Menores de idade",
    body: (
      <p>
        A Plataforma é destinada a uso profissional por maiores de 18 anos e não é direcionada a crianças e adolescentes.
        Não coletamos, de forma consciente, dados deles. Se a empresa receber a candidatura de um menor de idade, por
        exemplo a vagas de jovem aprendiz, cabe a ela tratar esses dados no melhor interesse do adolescente, como exige o
        art. 14 da LGPD.
      </p>
    ),
  },
  {
    title: "Cookies e armazenamento no aparelho",
    body: (
      <ul>
        <li>
          <strong>Cookies de sessão:</strong> mantêm você conectado com segurança. São essenciais e não podem ser desligados
          sem impedir o login.
        </li>
        <li>
          <strong>Preferências no aparelho:</strong> o tema claro ou escuro fica salvo no próprio navegador.
        </li>
        <li>
          <strong>Verificação contra robôs:</strong> a Cloudflare pode usar sinais técnicos do navegador nas telas de entrada,
          só para diferenciar pessoas de robôs.
        </li>
      </ul>
    ),
  },
  {
    title: "Incidentes de segurança",
    body: (
      <>
        <p>
          Se ocorrer um incidente que possa gerar risco ou dano relevante aos titulares, adotaremos medidas para conter seus
          efeitos e comunicaremos a ANPD e as pessoas afetadas em até 3 dias úteis contados de quando soubermos que dados
          pessoais foram afetados, como exigem o art. 48 da LGPD e o Regulamento de Comunicação de Incidente de Segurança
          (Resolução CD/ANPD nº 15/2024).
        </p>
        <p>
          A comunicação, em linguagem simples e de preferência direta para cada pessoa afetada, informa o que aconteceu,
          quais dados foram afetados, os riscos, as medidas adotadas e o canal para esclarecimentos. Nos dados de clientes e
          de candidatos, em que a empresa é a controladora, avisamos a empresa sem demora para que ela faça essas
          comunicações dentro do prazo. Todos os incidentes ficam registrados por pelo menos 5 anos.
        </p>
      </>
    ),
  },
  {
    title: "Alterações desta Política",
    body: (
      <p>
        Podemos atualizar esta Política. A data da versão vigente fica no topo da página. Mudanças relevantes são avisadas na
        Plataforma e pedem um novo aceite antes de continuar o uso.
      </p>
    ),
  },
  {
    title: "Encarregado e contato",
    body: (
      <p>
        {COMPANY.dpoName ? (
          <>
            O encarregado pelo tratamento de dados pessoais (LGPD, art. 41) é {COMPANY.dpoName}, com contato pelo {mail}.
          </>
        ) : (
          <>Para falar com o encarregado pelo tratamento de dados pessoais (LGPD, art. 41), escreva para o {mail}.</>
        )}{" "}
        Use esse canal para dúvidas, pedidos e reclamações sobre privacidade.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      intro="Quais dados o Domu Pulse trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos pela LGPD."
      sections={sections}
      other={{ href: "/termos", label: "Termos de Uso" }}
    />
  );
}
