import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Domu Pulse trata dados pessoais, de acordo com a LGPD.",
};

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline underline-offset-4">
    {CONTACT_EMAIL}
  </a>
);

const sections: LegalSection[] = [
  {
    title: "Quem é responsável pelos dados",
    body: (
      <p>
        A DomuTech é controladora dos dados de conta, cadastro e cobrança da empresa contratante e da sua equipe, nos
        termos da Lei 13.709/2018 (LGPD). Para os dados de clientes que a equipe cadastra na Plataforma, como nome e
        telefone na agenda de visitas, a DomuTech atua como operadora: trata esses dados conforme o uso feito pelo
        contratante, que responde pela origem e pela base legal deles. Contato sobre privacidade: {mail}.
      </p>
    ),
  },
  {
    title: "Dados que tratamos",
    body: (
      <ul>
        <li>Conta: nome, e-mail, WhatsApp de contato e senha (guardada pelo Supabase Auth de forma que ninguém consegue lê-la).</li>
        <li>Empresa e equipe: nome da imobiliária, equipes, cargos e quem está ativo.</li>
        <li>Operação: relatórios de produção, presença do dia, metas, comissões e agenda de visitas.</li>
        <li>Clientes da agenda: nome, telefone e horário da visita, inseridos pela equipe do contratante.</li>
        <li>Cobrança: CPF ou CNPJ e histórico de pagamentos, enviados ao Asaas, que processa a cobrança.</li>
        <li>Aparelhos: o endereço técnico de notificação de cada celular ou computador que ativar os lembretes.</li>
        <li>Segurança: endereço IP no aceite destes documentos e nas tentativas de login, e registro de alterações feitas na conta.</li>
      </ul>
    ),
  },
  {
    title: "Para que usamos",
    body: (
      <p>
        Para operar a Plataforma e suas funcionalidades; enviar avisos operacionais, como boas-vindas, convites,
        recuperação de senha, lembretes de relatório e avisos de cobrança; processar pagamentos; prevenir fraude e acesso
        indevido; cumprir obrigações legais; e melhorar a segurança e a qualidade do serviço. Não vendemos dados e não os
        usamos para publicidade de terceiros.
      </p>
    ),
  },
  {
    title: "Com quem compartilhamos",
    body: (
      <>
        <p>Somente com fornecedores necessários para o serviço funcionar:</p>
        <ul>
          <li>Supabase: banco de dados, login e atualização em tempo real.</li>
          <li>Vercel: hospedagem da Plataforma.</li>
          <li>Resend: envio dos e-mails da Plataforma.</li>
          <li>Asaas: cobrança e emissão de faturas.</li>
          <li>Serviços de notificação do navegador (Google, Apple, Mozilla ou Microsoft, conforme o aparelho): entrega dos lembretes.</li>
        </ul>
        <p>
          Fora isso, só compartilhamos com autorização sua, por obrigação legal ou ordem de autoridade, ou em caso de
          reorganização, fusão ou venda do negócio, mantido o mesmo nível de proteção.
        </p>
      </>
    ),
  },
  {
    title: "Transferência internacional",
    body: (
      <p>
        Alguns desses fornecedores podem processar dados fora do Brasil. Nesses casos, exigimos padrões de proteção
        compatíveis com a LGPD, por cláusulas contratuais ou certificações reconhecidas.
      </p>
    ),
  },
  {
    title: "Como protegemos",
    body: (
      <ul>
        <li>Cada imobiliária fica isolada das demais; uma nunca enxerga dados de outra.</li>
        <li>Cada cargo vê só o que lhe cabe: o corretor vê os próprios números, o gerente a própria equipe, e assim por diante.</li>
        <li>Essas regras são aplicadas dentro do banco de dados, e não só na tela.</li>
        <li>Senhas fortes obrigatórias e limite de tentativas contra adivinhação de senha.</li>
        <li>Conexão sempre criptografada e registro das alterações feitas em relatórios, agenda e equipe.</li>
      </ul>
    ),
  },
  {
    title: "Por quanto tempo guardamos",
    body: (
      <p>
        Enquanto a conta estiver ativa e, depois do encerramento, pelo prazo necessário para obrigações legais e fiscais,
        como registros de cobrança. Registros técnicos de tentativas de acesso são apagados automaticamente em poucos dias.
        Você pode pedir a exclusão a qualquer momento pelo {mail}, respeitadas as guardas obrigatórias por lei.
      </p>
    ),
  },
  {
    title: "Seus direitos",
    body: (
      <p>
        Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização, portabilidade, exclusão e
        revogação de consentimento. Respondemos em até 15 dias. Clientes cadastrados na agenda devem procurar primeiro a
        imobiliária responsável pelo cadastro.
      </p>
    ),
  },
  {
    title: "Cookies e armazenamento no aparelho",
    body: (
      <p>
        Usamos apenas o necessário para funcionar: cookies de sessão para manter você conectado e, no próprio aparelho, a
        preferência de tema claro ou escuro. Não usamos cookies de rastreamento nem de publicidade.
      </p>
    ),
  },
  {
    title: "Alterações e contato",
    body: (
      <p>
        Podemos atualizar esta Política; a versão vigente aparece no topo desta página e mudanças relevantes serão avisadas
        na Plataforma. Dúvidas ou pedidos: {mail}.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      intro="Quais dados o Domu Pulse trata, para quê, com quem compartilha e como você exerce seus direitos pela LGPD."
      sections={sections}
      other={{ href: "/termos", label: "Termos de Uso" }}
    />
  );
}
