import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso e condições da plataforma Domu Pulse.",
};

const sections: LegalSection[] = [
  {
    title: "Aceitação",
    body: (
      <p>
        Estes Termos regem o uso do Domu Pulse (&quot;Plataforma&quot;), sistema de gestão comercial para imobiliárias
        oferecido pela DomuTech. Ao criar uma conta, aceitar um convite ou contratar a assinatura, você declara que leu e
        aceitou estes Termos e que tem poderes para aceitá-los em nome da empresa cadastrada.
      </p>
    ),
  },
  {
    title: "O que a Plataforma oferece",
    body: (
      <p>
        Registro de relatórios de produção em horários definidos, painel de acompanhamento em tempo real, funil de vendas,
        ranking, agenda de visitas, gestão de equipe e notificações no celular. A Plataforma depende de serviços de
        terceiros, como hospedagem, banco de dados, envio de e-mail, notificações do navegador e meio de pagamento, cuja
        disponibilidade não está sob nosso controle. Podemos melhorar, alterar ou descontinuar funcionalidades, buscando
        avisar com antecedência razoável sobre mudanças relevantes.
      </p>
    ),
  },
  {
    title: "Conta, equipe e segurança de acesso",
    body: (
      <>
        <p>
          A conta pertence à empresa contratante. O administrador pode convidar superintendentes, gerentes e corretores,
          e responde pelo uso feito por toda a equipe. Cabe ao administrador desativar o acesso de quem deixar a empresa.
        </p>
        <p>
          Login e senha são pessoais e intransferíveis. Quem precisa de acesso deve receber um convite próprio, e não usar
          a senha de outra pessoa. Toda atividade feita com um login e senha válidos é considerada feita pelo contratante
          ou com a sua autorização.
        </p>
        <p>
          Seguir as recomendações de segurança da Plataforma, como usar senha forte e exclusiva e revisar periodicamente
          quem tem acesso, é responsabilidade do contratante.
        </p>
      </>
    ),
  },
  {
    title: "Uso aceitável e dados de terceiros",
    body: (
      <>
        <p>
          É proibido usar a Plataforma para atividades ilegais, para burlar seus mecanismos de segurança, para acessar
          dados de outras empresas ou para sobrecarregar o serviço de forma intencional.
        </p>
        <p>
          Dados de clientes cadastrados pela equipe, como nome e telefone na agenda de visitas, são de responsabilidade
          exclusiva do contratante, inclusive quanto à origem, à base legal e ao consentimento para o contato. A DomuTech
          apenas armazena e organiza esses dados conforme o uso da Plataforma pelo contratante. Se um terceiro ou
          autoridade reclamar de um dado inserido sem esse direito, o contratante assume os prejuízos, multas e despesas
          decorrentes.
        </p>
      </>
    ),
  },
  {
    title: "Teste grátis, assinatura e cancelamento",
    body: (
      <>
        <p>
          Novas contas têm 14 dias de teste grátis, sem cartão. Depois disso, o uso depende de assinatura mensal
          recorrente, cobrada pelo Asaas por Pix, boleto ou cartão, de acordo com o número de assentos (pessoas ativas na
          conta).
        </p>
        <p>
          Com o teste encerrado ou a assinatura cancelada, os dados continuam disponíveis só para consulta. O cancelamento
          pode ser pedido a qualquer momento e vale ao fim do período já pago, sem reembolso proporcional, salvo obrigação
          legal. Reajustes de preço para assinantes são avisados por e-mail com pelo menos 30 dias de antecedência.
        </p>
      </>
    ),
  },
  {
    title: "Propriedade intelectual",
    body: (
      <p>
        O software, a marca, o layout e os demais elementos da Plataforma pertencem à DomuTech, e o uso não transfere esses
        direitos. Os dados inseridos pelo contratante, como relatórios, agenda e cadastro da equipe, continuam sendo dele.
      </p>
    ),
  },
  {
    title: "Seus dados e cópias",
    body: (
      <p>
        Enquanto a conta estiver ativa, o contratante é responsável por manter as cópias que considerar importantes. Após o
        encerramento, a DomuTech não tem obrigação de guardar os dados indefinidamente, respeitados os prazos da Política de
        Privacidade.
      </p>
    ),
  },
  {
    title: "Limitação de responsabilidade",
    body: (
      <>
        <p>
          A Plataforma é fornecida no estado em que se encontra, sem garantia de funcionamento ininterrupto. Quando
          aplicável, nossa responsabilidade fica limitada ao valor pago pelo contratante nos 3 meses anteriores ao evento,
          exceto onde a lei não admitir essa limitação, como em caso de dolo ou culpa grave da DomuTech.
        </p>
        <p>A DomuTech não responde por incidentes causados, total ou parcialmente, por:</p>
        <ul>
          <li>senha fraca, reutilizada ou compartilhada pelo contratante ou sua equipe;</li>
          <li>acesso mantido para pessoas que já não deveriam tê-lo;</li>
          <li>aparelhos, redes ou programas do contratante comprometidos;</li>
          <li>dados de terceiros inseridos sem o devido direito;</li>
          <li>falhas de provedores terceiros fora do nosso controle.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Suspensão e encerramento",
    body: (
      <p>
        Podemos suspender ou encerrar contas em caso de inadimplência, uso indevido ou violação destes Termos, com aviso
        prévio sempre que possível. Os dados podem ser mantidos pelo tempo necessário para cumprir obrigações legais e
        fiscais.
      </p>
    ),
  },
  {
    title: "Incidentes de segurança",
    body: (
      <p>
        Se um incidente puder gerar risco relevante às pessoas cujos dados estão na Plataforma, a DomuTech avisará o
        contratante em prazo razoável, explicando o que aconteceu, quais dados foram afetados e o que está sendo feito.
      </p>
    ),
  },
  {
    title: "Força maior e cessão",
    body: (
      <p>
        Nenhuma das partes responde por falhas causadas por eventos fora de seu controle razoável. O contratante não pode
        transferir este contrato sem autorização por escrito; a DomuTech pode transferi-lo em caso de reorganização, fusão
        ou venda do negócio, mantidas as condições acordadas.
      </p>
    ),
  },
  {
    title: "Alterações, lei aplicável e contato",
    body: (
      <>
        <p>
          Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas na Plataforma antes de exigirem novo aceite.
          Estes Termos seguem as leis brasileiras, e fica eleito o foro do domicílio do contratante, salvo disposição legal
          em contrário.
        </p>
        <p>
          Dúvidas: <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline underline-offset-4">{CONTACT_EMAIL}</a>
        </p>
      </>
    ),
  },
];

export default function TermosPage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      intro="As regras para usar o Domu Pulse: o que oferecemos, o que esperamos de quem usa e como funcionam a assinatura e a responsabilidade de cada parte."
      sections={sections}
      other={{ href: "/privacidade", label: "Política de Privacidade" }}
    />
  );
}
