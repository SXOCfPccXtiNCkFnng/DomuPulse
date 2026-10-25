import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal-document";
import { COMPANY, CONTACT_EMAIL, CONTACT_WHATSAPP_DISPLAY, companyIdentification } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso e condições de contratação da plataforma Domu Pulse.",
};

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline underline-offset-4">
    {CONTACT_EMAIL}
  </a>
);

const privacy = (
  <Link href="/privacidade" className="font-medium text-ink underline underline-offset-4">
    Política de Privacidade
  </Link>
);

const sections: LegalSection[] = [
  {
    title: "Quem somos e aceitação",
    body: (
      <>
        <p>
          Estes Termos de Uso (&quot;Termos&quot;) regem o acesso e o uso do Domu Pulse (&quot;Plataforma&quot;), software
          de gestão comercial e de recrutamento para empresas oferecido como serviço pela {companyIdentification()} (&quot;DomuTech&quot;,
          &quot;nós&quot;).
        </p>
        <p>
          Ao criar uma conta, aceitar um convite, marcar a caixa de aceite ou usar a Plataforma, você declara que leu,
          entendeu e concorda com estes Termos e com a {privacy}, que faz parte deles. Se não concordar, não use a
          Plataforma.
        </p>
        <p>
          Quem cria a conta de uma empresa declara ter poderes para contratar em nome dela. A contratação é feita para
          uso profissional, na atividade empresarial da contratante, e não configura relação de consumo.
        </p>
      </>
    ),
  },
  {
    title: "Definições",
    body: (
      <ul>
        <li>
          <strong>Contratante:</strong> a empresa que cria a conta e contrata a assinatura.
        </li>
        <li>
          <strong>Administrador:</strong> a pessoa que criou a conta e responde por ela perante a DomuTech.
        </li>
        <li>
          <strong>Usuários:</strong> todas as pessoas com acesso à conta da Contratante, como superintendentes, gerentes,
          corretores e recrutadores.
        </li>
        <li>
          <strong>Dados da Operação:</strong> relatórios, presença, metas, comissões, agenda e demais informações lançadas
          na Plataforma.
        </li>
        <li>
          <strong>Dados de Clientes:</strong> informações de clientes e interessados da Contratante cadastradas pelos
          Usuários, como nome, telefone, e-mail, interesse e valor de negócio.
        </li>
        <li>
          <strong>Dados de Candidatos:</strong> informações de quem se candidata às vagas da Contratante, como nome,
          telefone, e-mail, cidade, currículo, mensagens trocadas pelo WhatsApp, nota e situação no processo seletivo.
        </li>
        <li>
          <strong>Assinatura:</strong> o plano pago que libera o uso da Plataforma pela Contratante.
        </li>
      </ul>
    ),
  },
  {
    title: "O serviço",
    body: (
      <>
        <p>
          A Plataforma permite registrar relatórios de produção em horários definidos, acompanhar a equipe em tempo real,
          organizar a carteira de clientes e a agenda de visitas, definir metas e receber lembretes e avisos no celular e no
          computador.
        </p>
        <p>
          Nas contas de recrutamento, a Plataforma permite cadastrar vagas, receber currículos manualmente ou por um número
          de WhatsApp da Contratante, pontuar currículos com inteligência artificial, acompanhar os candidatos e marcar
          entrevistas.
        </p>
        <p>
          O serviço é oferecido pela internet, no estado em que se encontra, e depende de fornecedores como hospedagem,
          banco de dados, envio de e-mail, notificações do navegador, verificação contra robôs e meio de pagamento. Podemos
          melhorar, alterar, incluir ou retirar funcionalidades a qualquer tempo. Mudanças que reduzam de forma relevante o
          que foi contratado serão avisadas com antecedência razoável.
        </p>
        <p>
          A Plataforma é uma ferramenta de apoio à gestão. Ela não substitui o julgamento da Contratante, e os resultados
          comerciais dependem exclusivamente da operação da Contratante e da sua equipe.
        </p>
      </>
    ),
  },
  {
    title: "Cadastro e conta",
    body: (
      <>
        <p>
          As informações de cadastro devem ser verdadeiras, completas e atualizadas. A Contratante responde por dados falsos
          ou desatualizados e pelos efeitos deles, inclusive na cobrança.
        </p>
        <p>
          O Administrador convida e desativa Usuários, define cargos e equipes, e responde perante a DomuTech por todo o uso
          feito na conta. Cabe a ele desativar imediatamente quem deixar a empresa ou não deva mais ter acesso.
        </p>
        <p>
          Uma conta corresponde a um Administrador. Cada gestor que quiser usar a Plataforma de forma independente contrata a
          sua própria conta e Assinatura.
        </p>
      </>
    ),
  },
  {
    title: "Acesso e segurança",
    body: (
      <>
        <p>
          Login e senha são pessoais e intransferíveis. É proibido compartilhar credenciais ou usar o acesso de outra
          pessoa: quem precisa de acesso recebe um convite próprio. Toda ação feita com um login e senha válidos é
          considerada feita pelo titular do acesso, com autorização da Contratante.
        </p>
        <p>
          Recomendamos senha forte e exclusiva e a verificação em duas etapas. Em caso de suspeita de uso indevido, troque a
          senha, use a opção de sair de todos os aparelhos e avise a DomuTech pelo {mail}.
        </p>
      </>
    ),
  },
  {
    title: "Uso aceitável",
    body: (
      <>
        <p>É proibido, entre outras condutas contrárias à lei ou a estes Termos:</p>
        <ul>
          <li>usar a Plataforma para atividade ilegal, fraudulenta ou que viole direitos de terceiros;</li>
          <li>tentar acessar dados de outras contas, burlar regras de acesso, testar vulnerabilidades sem autorização ou contornar limites técnicos;</li>
          <li>copiar, modificar, descompilar, fazer engenharia reversa ou criar produto concorrente a partir da Plataforma;</li>
          <li>extrair dados de forma automatizada, sobrecarregar o serviço ou interferir no seu funcionamento;</li>
          <li>revender, sublicenciar ou disponibilizar a Plataforma a terceiros fora da Contratante;</li>
          <li>inserir vírus, código malicioso, conteúdo ofensivo, discriminatório ou que viole direitos de imagem e privacidade;</li>
          <li>usar Dados de Clientes ou de Candidatos para envio de mensagens em massa não solicitadas;</li>
          <li>usar critérios discriminatórios na seleção de candidatos, como sexo, origem, raça, cor, estado civil, situação familiar, deficiência, reabilitação profissional ou idade, ou exigir atestado de gravidez ou de esterilização, como proíbem a Lei 9.029/1995 e o art. 373-A da CLT, salvo nas exceções previstas em lei.</li>
        </ul>
        <p>
          O descumprimento autoriza a suspensão imediata do acesso, sem prejuízo das medidas legais e da cobrança dos danos
          causados.
        </p>
      </>
    ),
  },
  {
    title: "Dados de Clientes e de Candidatos e responsabilidade da Contratante",
    body: (
      <>
        <p>
          Nos Dados de Clientes e nos Dados de Candidatos, a Contratante é a controladora, nos termos da Lei 13.709/2018
          (LGPD), e a DomuTech atua como operadora: armazena e organiza esses dados apenas para prestar o serviço, conforme as
          instruções dadas pelo uso da Plataforma.
        </p>
        <p>Cabe exclusivamente à Contratante:</p>
        <ul>
          <li>ter base legal para coletar, cadastrar e usar cada dado, inclusive para contatar o cliente;</li>
          <li>informar os titulares sobre o tratamento e atender aos pedidos deles, como acesso, correção e exclusão;</li>
          <li>cadastrar apenas os dados necessários, sem dados sensíveis (saúde, religião, biometria e afins);</li>
          <li>orientar a equipe sobre o uso correto e o sigilo das informações.</li>
        </ul>
        <p>Como operadora, a DomuTech se compromete a:</p>
        <ul>
          <li>tratar esses dados só para prestar o serviço e conforme as instruções da Contratante, sem usá-los para fins próprios;</li>
          <li>manter as medidas de segurança descritas na {privacy} e exigir o mesmo dos fornecedores que listamos lá;</li>
          <li>apoiar a Contratante, no que estiver ao seu alcance, no atendimento a pedidos de titulares e da ANPD;</li>
          <li>avisar a Contratante sem demora sobre incidentes de segurança que afetem esses dados;</li>
          <li>apagar os dados ao fim do contrato, nos prazos da cláusula &quot;Dados após o encerramento&quot;.</li>
        </ul>
        <p>
          Se um titular, terceiro ou autoridade reclamar de dado inserido sem esse direito, a Contratante assume a defesa e
          os prejuízos, multas, honorários e despesas decorrentes, e mantém a DomuTech livre de responsabilidade.
        </p>
      </>
    ),
  },
  {
    title: "Recrutamento, WhatsApp e inteligência artificial",
    body: (
      <>
        <p>
          <strong>WhatsApp.</strong> O número conectado à Plataforma é da Contratante e é usado em nome dela. A Plataforma
          responde automaticamente aos candidatos, recebe os currículos e envia avisos sobre o processo seletivo, como
          aprovação e recusa. A Contratante é responsável pelo conteúdo das mensagens que configurar, por cumprir as regras de
          uso do WhatsApp e por avisar os candidatos de que o atendimento inicial é automático. A conexão não usa a API
          oficial do WhatsApp: o aplicativo pode limitar ou bloquear o número, e a DomuTech não responde por esse bloqueio
          nem pela entrega das mensagens. Quando um Usuário responde a conversa pelo próprio WhatsApp, o atendimento
          automático para naquela conversa.
        </p>
        <p>
          <strong>Inteligência artificial.</strong> A Plataforma usa um serviço de inteligência artificial contratado pela
          DomuTech para ler os currículos, extrair os dados principais e sugerir uma nota de 0 a 100 conforme os critérios
          da vaga, e para conduzir o atendimento automático no WhatsApp: escrever as respostas aos candidatos, identificar
          a vaga de interesse e passar a conversa para a equipe. A nota e as respostas são só um apoio e podem errar. Quem
          decide aprovar, recusar ou contratar é sempre a equipe da Contratante, e a Plataforma não recusa candidatos
          sozinha.
        </p>
        <p>
          A Contratante deve informar os candidatos de que conversam com um atendimento automático com inteligência
          artificial, e não com uma pessoa, e atender aos pedidos deles de informação sobre os critérios usados e de revisão
          de avaliações automatizadas (LGPD, art. 20). A Contratante não deve incluir critérios discriminatórios nas vagas
          nem nas instruções da automação, deve revisar as respostas padrão que configurar e responde pelas decisões do
          processo seletivo.
        </p>
        <p>
          <strong>Candidatos.</strong> Cabe à Contratante informar os candidatos sobre o tratamento dos dados deles,
          atender aos pedidos de acesso, correção e exclusão e apagar currículos que não precisar mais guardar. Entrevistas
          marcadas na Plataforma são só um registro: a Contratante combina e confirma o compromisso diretamente com o
          candidato.
        </p>
      </>
    ),
  },
  {
    title: "Notas fiscais dos corretores",
    body: (
      <>
        <p>
          A Plataforma permite que o corretor emita a nota fiscal de serviço (NFS-e) contra a Contratante, diretamente
          no Sistema Nacional da NFS-e do governo federal, e que envie notas emitidas fora dela. A nota sai em nome e no CNPJ do
          corretor, que é o único responsável:
        </p>
        <ul>
          <li>pela exatidão dos dados fiscais cadastrados, como CNPJ, regime tributário, inscrição municipal e endereço;</li>
          <li>pelo valor, pela descrição do serviço e pela competência informados em cada nota;</li>
          <li>pelos tributos devidos, pela escrituração e pelas demais obrigações fiscais da nota;</li>
          <li>pela validade, guarda e senha do seu certificado digital.</li>
        </ul>
        <p>
          A Contratante responde pelos dados dela como tomadora, inclusive o código do serviço, e deve confirmar com o seu
          contador as regras aplicáveis. A DomuTech apenas transmite os dados informados ao Sistema Nacional da NFS-e e não presta
          consultoria contábil ou tributária. A autorização, a rejeição e o cancelamento das notas dependem da prefeitura e
          do ambiente nacional da NFS-e, fora do controle da DomuTech. Para emitir em nome do corretor, a Plataforma guarda o
          certificado digital dele e a senha criptografados, com chave que só existe no servidor, e os usa exclusivamente
          para emitir e cancelar as notas que o próprio corretor pedir. O corretor pode trocar o certificado a qualquer
          momento e, ao sair da Plataforma ou excluir a conta, o certificado é apagado.
        </p>
      </>
    ),
  },
  {
    title: "Assinatura e pagamento",
    body: (
      <>
        <p>
          O uso depende de Assinatura mensal recorrente, em valor fixo por conta, sem limite de Usuários. O valor é o
          informado na tela de ativação no momento da contratação. A cobrança é feita pelo Asaas, por Pix, boleto ou cartão,
          e vence todo mês na mesma data.
        </p>
        <p>
          Cupons de acesso gratuito ou de desconto são concedidos a critério da DomuTech, valem uma vez por conta, podem ter
          prazo e não geram direito a crédito ou dinheiro. Ao fim do acesso gratuito, a conta fica disponível só para
          consulta até a Assinatura ser ativada.
        </p>
      </>
    ),
  },
  {
    title: "Atraso e inadimplência",
    body: (
      <p>
        Com a fatura vencida e não paga, a Contratante é avisada por e-mail e na Plataforma. A DomuTech pode restringir os
        novos lançamentos até a regularização e, persistindo o atraso, suspender ou encerrar a conta, mantendo os dados para
        consulta pelo prazo da cláusula &quot;Dados após o encerramento&quot;. O pagamento em atraso restabelece o acesso
        após a confirmação pelo meio de pagamento.
      </p>
    ),
  },
  {
    title: "Reajuste de preço",
    body: (
      <p>
        O valor pode ser reajustado. Para quem já assina, o reajuste é avisado por e-mail com pelo menos 30 dias de
        antecedência e vale a partir da cobrança seguinte a esse prazo. Se não concordar, a Contratante pode cancelar antes
        da data, sem multa.
      </p>
    ),
  },
  {
    title: "Cancelamento pela Contratante",
    body: (
      <>
        <p>
          O Administrador pode cancelar a Assinatura a qualquer momento em Conta, aba Assinatura, sem multa e sem
          fidelidade. O cancelamento interrompe as cobranças futuras na hora, e a equipe continua usando a Plataforma até o
          fim do período já pago. Depois disso, a conta fica disponível só para consulta.
        </p>
        <p>
          Não há reembolso, integral ou proporcional, de períodos já pagos, inclusive em caso de cancelamento no meio do
          mês, salvo quando a lei exigir.
        </p>
      </>
    ),
  },
  {
    title: "Estornos e contestações",
    body: (
      <p>
        Pagamentos feitos não são devolvidos, salvo obrigação legal ou falha comprovada da DomuTech. Se a Contratante pedir
        a devolução diretamente ao banco ou à operadora do cartão (chargeback) sem antes falar com a DomuTech, a conta é
        suspensa até a análise do caso. Contestações indevidas caracterizam descumprimento destes Termos e autorizam a
        cobrança dos valores devidos e das despesas de recuperação.
      </p>
    ),
  },
  {
    title: "Suspensão e encerramento pela DomuTech",
    body: (
      <p>
        A DomuTech pode suspender ou encerrar a conta, total ou parcialmente, em caso de inadimplência, violação destes
        Termos, suspeita fundada de fraude ou uso indevido, risco à segurança da Plataforma ou de outros clientes, ou ordem
        de autoridade. Sempre que possível haverá aviso prévio, que pode ser dispensado em casos graves ou urgentes. A
        DomuTech também pode descontinuar a Plataforma, com aviso de pelo menos 60 dias e devolução proporcional de valores
        pagos por períodos não usufruídos.
      </p>
    ),
  },
  {
    title: "Disponibilidade e suporte",
    body: (
      <>
        <p>
          Trabalhamos para manter a Plataforma disponível o tempo todo, mas não garantimos funcionamento ininterrupto ou
          livre de erros. Podem ocorrer manutenções, atualizações e falhas de fornecedores, da internet ou do aparelho do
          Usuário. Notificações no celular dependem do aparelho, do navegador e das permissões concedidas, e não há garantia
          de entrega.
        </p>
        <p>
          O suporte é prestado pelo WhatsApp {CONTACT_WHATSAPP_DISPLAY} e pelo {mail}, em dias úteis e horário comercial,
          sem prazo garantido de resposta.
        </p>
      </>
    ),
  },
  {
    title: "Propriedade intelectual",
    body: (
      <>
        <p>
          O software, a marca, o layout, os textos e os demais elementos da Plataforma pertencem à DomuTech. A Assinatura
          concede à Contratante e aos seus Usuários uma licença de uso não exclusiva, intransferível e válida enquanto ativa, sem
          transferir qualquer direito de propriedade.
        </p>
        <p>
          Os Dados da Operação e os Dados de Clientes continuam sendo da Contratante. Ela autoriza a DomuTech a armazená-los
          e processá-los na medida necessária para prestar o serviço, e a usar estatísticas anonimizadas e agregadas, que
          não identificam a Contratante nem pessoas, para melhorar a Plataforma. Sugestões enviadas à DomuTech podem ser
          aproveitadas livremente, sem remuneração.
        </p>
      </>
    ),
  },
  {
    title: "Dados após o encerramento",
    body: (
      <p>
        Enquanto a conta existir, a Contratante pode exportar os relatórios em planilha e cada Usuário pode baixar os
        próprios dados em Conta, aba Privacidade e dados. Encerrada a conta, os dados ficam disponíveis só para consulta
        e podem ser apagados definitivamente após 90 dias, salvo os que a lei manda guardar por mais tempo, como os
        registros de cobrança. A DomuTech não tem obrigação de manter cópias depois desses prazos. O Administrador pode,
        a qualquer momento, excluir a conta e todos os dados dela pela própria Plataforma.
      </p>
    ),
  },
  {
    title: "Limitação de responsabilidade",
    body: (
      <>
        <p>Na máxima extensão permitida pela lei, a DomuTech não responde por:</p>
        <ul>
          <li>lucros cessantes, perda de vendas, de clientes ou de oportunidades, e outros danos indiretos;</li>
          <li>decisões tomadas pela Contratante com base nas informações da Plataforma;</li>
          <li>exatidão das informações lançadas pelos Usuários;</li>
          <li>falhas de fornecedores, da internet, de energia ou dos aparelhos dos Usuários;</li>
          <li>acesso indevido causado por senha compartilhada, aparelho desprotegido ou descuido da Contratante ou da equipe;</li>
          <li>uso dos Dados de Clientes ou de Candidatos pela Contratante em desacordo com a lei;</li>
          <li>decisões de seleção ou contratação tomadas pela Contratante, inclusive com base na nota sugerida pela inteligência artificial;</li>
          <li>bloqueio, limitação ou instabilidade do número de WhatsApp conectado.</li>
        </ul>
        <p>
          Em qualquer caso, a responsabilidade total da DomuTech fica limitada ao valor pago pela Contratante nos 3 meses
          anteriores ao fato que gerou o pedido. Essas limitações não se aplicam a dolo ou culpa grave da DomuTech, nem onde
          a lei não as admitir.
        </p>
      </>
    ),
  },
  {
    title: "Indenização",
    body: (
      <p>
        A Contratante se compromete a defender e indenizar a DomuTech, seus sócios e colaboradores por reclamações,
        processos, multas, prejuízos e despesas, inclusive honorários advocatícios, decorrentes do uso da Plataforma pela
        Contratante ou pela equipe dela, do descumprimento destes Termos ou da lei, ou dos dados que inserir.
      </p>
    ),
  },
  {
    title: "Incidentes de segurança",
    body: (
      <>
        <p>
          A LGPD (art. 48) e o Regulamento de Comunicação de Incidente de Segurança da ANPD (Resolução CD/ANPD nº 15/2024)
          exigem que o controlador comunique à ANPD e aos titulares, em até 3 dias úteis, o incidente que possa gerar risco
          ou dano relevante.
        </p>
        <p>
          Nos Dados de Clientes e de Candidatos, em que a Contratante é a controladora, a DomuTech avisará a Contratante sem
          demora, em até 48 horas depois de confirmar que esses dados foram afetados, explicando o que aconteceu, quais dados
          foram atingidos, os riscos e as medidas adotadas, e fornecerá as informações de que ela precisar para fazer as
          comunicações no prazo. Nos dados em que a DomuTech é a controladora, ela mesma faz as comunicações exigidas. A
          Contratante deve avisar a DomuTech imediatamente sobre qualquer incidente que perceber.
        </p>
      </>
    ),
  },
  {
    title: "Comunicações",
    body: (
      <p>
        As comunicações da DomuTech são feitas pelo e-mail cadastrado do Administrador e por avisos na própria Plataforma, e
        são consideradas recebidas no envio. A Contratante deve manter o e-mail atualizado e acompanhar esses canais.
      </p>
    ),
  },
  {
    title: "Alterações destes Termos",
    body: (
      <p>
        Podemos atualizar estes Termos. A data da versão vigente fica no topo da página. Mudanças relevantes são avisadas
        na Plataforma, e o uso só continua após o aceite da nova versão. Quem não concordar pode cancelar a Assinatura nas
        condições destes Termos.
      </p>
    ),
  },
  {
    title: "Disposições gerais",
    body: (
      <ul>
        <li>O aceite eletrônico destes Termos é válido e vinculante, e fica registrado com data, versão e endereço IP.</li>
        <li>Se alguma cláusula for considerada inválida, as demais continuam valendo.</li>
        <li>A tolerância com qualquer descumprimento não significa renúncia a direitos.</li>
        <li>
          A Contratante não pode transferir este contrato sem autorização por escrito. A DomuTech pode transferi-lo em caso
          de reorganização, fusão, cisão ou venda do negócio, mantidas as condições contratadas.
        </li>
        <li>Nenhuma das partes responde por falhas causadas por caso fortuito ou força maior.</li>
        <li>Estes Termos e a Política de Privacidade formam o acordo completo entre as partes sobre a Plataforma.</li>
      </ul>
    ),
  },
  {
    title: "Lei aplicável e foro",
    body: (
      <p>
        Estes Termos seguem as leis da República Federativa do Brasil.{" "}
        {COMPANY.forumCity
          ? `Fica eleito o foro da comarca de ${COMPANY.forumCity} para resolver qualquer questão sobre eles, com renúncia a qualquer outro, por mais privilegiado que seja.`
          : "Fica eleito o foro do domicílio da DomuTech para resolver qualquer questão sobre eles, salvo disposição legal em contrário."}
      </p>
    ),
  },
  {
    title: "Contato",
    body: (
      <p>
        Dúvidas sobre estes Termos: {mail} ou WhatsApp {CONTACT_WHATSAPP_DISPLAY}.
      </p>
    ),
  },
];

export default function TermosPage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      intro="As regras para usar o Domu Pulse: o que oferecemos, o que esperamos de quem usa, como funcionam a assinatura, o cancelamento e a responsabilidade de cada parte."
      sections={sections}
      other={{ href: "/privacidade", label: "Política de Privacidade" }}
    />
  );
}
