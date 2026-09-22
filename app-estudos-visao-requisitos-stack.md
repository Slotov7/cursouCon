# App de Estudos para Concursos
## Visão do projeto, levantamento de requisitos e proposta de stack

**Versão:** 1.1 — aplicativo local com sincronização opcional  
**Data:** 22/09/2026  
**Nome do produto:** a definir  
**Idioma inicial:** português brasileiro  
**Plataforma proposta:** Windows desktop, com possibilidade de expansão  
**Status:** requisitos consolidados da conversa; decisões técnicas abaixo são recomendações, ainda não implementação.

---

## 1. Visão do projeto

Construir uma central pessoal de preparação para concursos que ajude o estudante a descobrir oportunidades, transformar editais em planos executáveis, estudar com seus materiais, resolver questões, revisar dificuldades e acompanhar a evolução com gamificação discreta.

A experiência deve responder rapidamente: **“O que vale a pena estudar agora?”**

O aplicativo será local: instalado no computador, com dados e materiais salvos no dispositivo e funcionamento offline para os estudos. Não haverá backend próprio na nuvem nem conta do aplicativo. A sincronização será opcional, desativada por padrão e configurada somente por iniciativa do usuário, por meio de uma pasta atendida por seu cliente de sincronização. Também será possível copiar ou restaurar o espaço manualmente, sem nuvem. O app deverá funcionar sem assinatura obrigatória e sem depender de IA.

A busca de concursos continuará sendo um recurso online acionado pelo usuário, com cache local. Consultar fontes públicas não implica enviar seu histórico, materiais ou plano para a nuvem.

### 1.1 Público inicial

Estudante individual de concursos públicos brasileiros, inicialmente com atenção à área de TI, que usa computador, reúne materiais de diversas fontes e quer continuidade entre máquinas. A organização de disciplinas deve servir também a outras áreas.

### 1.2 Problemas que o produto resolve

- Materiais, questões e anotações espalhados em várias ferramentas.
- Dificuldade para transformar o edital em tarefas realistas.
- Falta de clareza sobre o que revisar e quais assuntos precisam de atenção.
- Medição de esforço sem avaliação do aprendizado.
- Descontinuidade ao trocar de computador ou retomar após uma pausa.
- Busca dispersa por concursos compatíveis com a formação e área de interesse.

### 1.3 Proposta de valor

**Edital → plano → sessão → material → questões → diagnóstico → revisão.** A descoberta de concursos alimenta esse ciclo; a gamificação estimula constância; a portabilidade preserva a jornada.

As referências conceituais são trilhas de estudo, filtros de questões, cadernos e análise de desempenho, como os mencionados na conversa sobre Estratégia e Qconcursos. O projeto terá identidade própria e não pressupõe acesso aos bancos ou conteúdos dessas plataformas.

### 1.4 Princípios

1. Abrir o app e encontrar uma próxima ação clara.
2. Priorizar aprendizado e consistência sobre quantidade de cliques.
3. Separar esforço, cobertura do edital e domínio estimado.
4. Manter o núcleo de estudo disponível offline.
5. Preservar dados e explicitar conflitos, sem sobrescrita silenciosa.
6. Explicar recomendações e permitir edição pelo usuário.
7. Usar uma interface limpa e revelar recursos avançados conforme a necessidade.

### 1.5 Resultados esperados

- Criar uma preparação e concluir a primeira sessão sem treinamento externo.
- Continuar os estudos em outro computador, com materiais e histórico íntegros.
- Identificar dificuldades por assunto, com base e quantidade de tentativas visíveis.
- Recuperar dados de um backup independente da pasta sincronizada.
- Encontrar concursos de uma área, quando houver fonte integrada disponível, com origem e data da consulta.

## 2. Escopo e premissas

### 2.1 Confirmado pela necessidade apresentada

- Aplicativo desktop local e pessoal.
- Plano e guia de estudos, materiais anexados e gamificação.
- Conteúdo transportável por pasta compartilhada/sincronizada.
- Interface simples e bonita.
- Busca de concursos por área, incluindo TI.
- Questões ligadas aos concursos e assuntos estudados.

### 2.2 Premissas propostas para começar

| Tema | Proposta inicial | Consequência |
|---|---|---|
| Sistema operacional | Windows 11 x64 como alvo de validação inicial | Outras versões e sistemas exigem homologação específica |
| Identidade | Um usuário local por espaço, sem login obrigatório | Sem colaboração ou ranking público no MVP |
| Preparações | Várias preparações, uma principal | A tela Hoje prioriza a principal, permitindo troca |
| Uso entre computadores | Um computador por vez | Edição simultânea não é suportada na primeira versão |
| Armazenamento padrão | Exclusivamente local | Nenhuma sincronização ou envio de estudos ativado automaticamente |
| Sincronização opcional | Usuário escolhe uma pasta e configura seu próprio cliente | O app prepara revisões consistentes, mas não afirma que o upload terminou sem integração verificável |
| Questões | Banco vazio, cadastro e importação pelo usuário | Não pressupõe catálogo comercial incluído |
| Fontes de concursos | Adaptadores validados individualmente | Cobertura nacional completa não é promessa inicial |
| IA | Opcional e posterior | Nenhum fluxo essencial depende dela |

### 2.3 Fora do escopo inicial

Aplicativo móvel, rede social, aulas próprias, venda de cursos, assinatura de conteúdo, ranking entre usuários, múltiplos editores, robô universal para todos os sites, cópia automática de bancos comerciais, execução de código de questões e estimativa de chance de aprovação.

## 3. Priorização e releases

**P0:** essencial para a primeira versão utilizável. **P1:** expansão prioritária. **P2:** evolução posterior.

| Release | Objetivo | Entrega |
|---|---|---|
| R0 — validações | Reduzir riscos antes da construção ampla | Provas técnicas de portabilidade, PDF, empacotamento e fonte de concursos |
| R1 — MVP pessoal | Estudar de ponta a ponta offline | Espaço portátil, edital manual, ciclo, Hoje, sessões, materiais, notas, questões manuais/JSON, revisões simples, XP, evolução básica, backup e cadastro manual de concursos |
| R2 — produto ampliado | Descobrir oportunidades e melhorar o aprendizado | Busca online validada, importação assistida de PDFs, flashcards, cadernos dinâmicos, simulados, agenda e recomendações |
| R3 — refinamento | Ampliar automação e conforto | OCR, busca textual em materiais, IA opcional, gamificação avançada sem ampliação automática para serviços de nuvem |

**Compromisso de escopo:** busca online é parte do produto completo, mas a R1 não será anunciada como contendo busca automática se só houver cadastro manual. Caso a descoberta automática seja indispensável no lançamento, os requisitos de busca da R2 passam a ser bloqueadores da R1, após a validação da fonte.

## 4. Experiência e navegação

| Área | Conteúdo e ação principal |
|---|---|
| Hoje | Próxima tarefa, plano do dia, revisões e botão Começar a estudar |
| Plano | Preparações, edital, ciclo e calendário |
| Materiais | Arquivos, links, anotações e resumos |
| Praticar | Questões, cadernos, revisões, flashcards e simulados |
| Evolução | Esforço, desempenho, cobertura e conquistas |
| Explorar | Concursos, filtros, favoritos e prazos |

Configurações, backups e troca de espaço ficam em um menu secundário. A tela Hoje mostra poucos indicadores; os detalhes ficam nas áreas correspondentes.

### 4.1 Jornadas principais

**Primeiro uso:** criar espaço → escolher pasta → cadastrar preparação → inserir disciplinas/assuntos → informar disponibilidade → gerar ciclo → anexar material → iniciar sessão.

**Estudo diário:** abrir Hoje → iniciar tarefa → consultar material → registrar notas → responder questões → encerrar sessão → ver próxima revisão e XP.

**Novo concurso:** filtrar oportunidades → conferir fonte e requisitos → favoritar → escolher Quero me preparar → revisar dados e edital → gerar plano.

**Troca de computador:** encerrar sessão → preparar espaço para troca → fechar app → copiar a pasta manualmente ou, se a sincronização opcional estiver configurada, aguardar o cliente escolhido → abrir pasta no outro PC → validar revisão e anexos → continuar.

**Sincronização opcional:** abrir configurações → escolher pasta atendida pelo cliente de sincronização do usuário → conferir conteúdo que será colocado nela → confirmar → preparar primeira revisão. Desativar interrompe novas publicações nesse destino e mantém uma cópia local completa; não apaga automaticamente cópias já existentes no serviço externo.

**Retomada:** identificar tarefas atrasadas → informar disponibilidade atual → visualizar proposta de redistribuição → aceitar ou editar → começar uma tarefa viável.

### 4.2 Diretrizes de interface

Tema claro/escuro, tipografia legível, espaçamento consistente, cores discretas, atalhos, foco visível e navegação por teclado. Não depender apenas de cor para informar acerto, erro ou atraso. Respeitar redução de movimento e permitir ocultar a gamificação.

O modo foco apresenta objetivo, material, notas e cronômetro. Importações e backups mostram progresso, cancelamento seguro e erros acionáveis. Estados vazios explicam como começar; falta de internet mantém acessíveis os dados já salvos.

## 5. Requisitos funcionais

Cada requisito tem um identificador rastreável. O critério listado é o aceite mínimo e deve ser desdobrado em cenários de implementação.

### 5.1 Espaço de estudos, portabilidade e recuperação

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-001 | Criar, abrir e nomear um espaço de estudos | P0 | Criar em pasta escolhida e reabrir preserva identidade, configurações e dados |
| RF-002 | Manter lista de espaços recentes e alternar entre eles | P0 | Troca não mistura registros nem mantém sessão ativa no espaço anterior |
| RF-003 | Validar versão do formato, integridade e permissão de escrita | P0 | Formato incompatível ou pacote incompleto gera orientação e não é alterado |
| RF-004 | Persistir operações locais e recuperar sessão após falha | P0 | Reabrir recupera operações confirmadas; sessão interrompida exige conferência do tempo |
| RF-005 | Publicar uma revisão portátil consistente | P0 | Revisão contém banco consistente e referências verificáveis aos anexos; falha mantém revisão anterior utilizável |
| RF-006 | Preparar troca manual ou por sincronização opcional | P0 | Exibe revisão portátil e pendências; sincronização vem desativada, só publica no destino externo após configuração explícita e, ao desativar, preserva cópia local completa. Lembrete de aguardar o cliente externo aparece apenas quando aplicável |
| RF-007 | Detectar revisões divergentes e preservar ambas | P0 | Dois descendentes da mesma revisão não são fundidos ou descartados automaticamente |
| RF-008 | Criar backup completo em destino independente | P0 | Backup inclui dados, anexos e versão do formato, com validação de integridade |
| RF-009 | Restaurar backup com prévia e proteção do estado atual | P0 | Restaura em novo espaço por padrão; substituição exige confirmação e cópia de recuperação |
| RF-010 | Exportar dados em formatos documentados | P0 | Exporta JSON e anexos, mais notas em Markdown, sem depender do app para ler o formato |
| RF-011 | Configurar backups e retenção | P1 | Usuário escolhe destino e retenção; histórico mostra sucesso ou falha de cada execução |

### 5.2 Preparações e edital

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-012 | Cadastrar preparação com órgão, cargo, banca e data opcional | P0 | Permite estudar sem data definida e alternar preparação principal |
| RF-013 | Organizar disciplinas e árvore de assuntos | P0 | Cria, move, ordena e arquiva assuntos sem apagar histórico associado |
| RF-014 | Anexar edital e registrar pesos/regras da prova | P0 | Cada preparação mantém documento de referência e pesos editáveis |
| RF-015 | Separar estado de estudo e indicadores de domínio | P0 | Concluir teoria não marca domínio automaticamente |
| RF-016 | Reaproveitar assuntos entre preparações | P1 | Mesmo assunto pode atender a editais diferentes sem duplicar tentativas; cobertura permanece por preparação |
| RF-017 | Extrair estrutura de edital com revisão assistida | P1 | Extração cria rascunho editável; nada altera o plano antes da confirmação |
| RF-018 | Comparar edital anterior e novo | P2 | Exibe inclusões, remoções e correspondências sugeridas para conferência |
| RF-019 | Operar em modo pré-edital | P0 | Documento anterior fica identificado como referência e não como edital vigente |

### 5.3 Planejamento e guia de estudos

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-020 | Informar disponibilidade, descanso e prioridades | P0 | Distribuição não ultrapassa disponibilidade sem aviso explícito |
| RF-021 | Gerar e editar ciclo de estudos | P0 | Ciclo continua da próxima atividade após um dia perdido |
| RF-022 | Criar tarefas com assunto, objetivo, duração e material | P0 | Tarefa informa ação concreta e permite iniciar sessão vinculada |
| RF-023 | Apresentar plano diário e próxima ação | P0 | Hoje mostra tarefas ordenadas, andamento e revisões vencidas |
| RF-024 | Reagendar, pular ou concluir tarefa parcialmente | P0 | Preserva histórico e não registra conclusão integral para atividade parcial |
| RF-025 | Adaptar plano para menos tempo e retomada | P1 | Mostra proposta com alterações antes de aplicar; não elimina histórico |
| RF-026 | Oferecer agenda semanal alternativa ao ciclo | P1 | Mesmo compromisso não é contado duas vezes quando aparece na agenda e no ciclo |
| RF-027 | Recomendar ajustes por peso, prazo e dificuldade | P1 | Cada sugestão explica fatores utilizados e pode ser recusada |
| RF-028 | Oferecer modo reta final | P1 | Proposta aumenta foco em revisão/questões conforme preferências, com aprovação do usuário |

### 5.4 Sessões e modo foco

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-029 | Iniciar, pausar, retomar e encerrar sessão | P0 | Apenas uma sessão ativa por espaço; pausas não contam como estudo |
| RF-030 | Abrir material e notas no contexto da tarefa | P0 | Encerrar e reabrir mantém nota e posição de leitura suportada |
| RF-031 | Registrar estudo manual e corrigir duração | P0 | Correção fica auditável e recalcula métricas e XP sem duplicação |
| RF-032 | Registrar resumo, dificuldade e próximos passos | P0 | Dados ficam vinculados à sessão e ao assunto |
| RF-033 | Oferecer Pomodoro e lembretes configuráveis | P1 | Intervalos não contam como estudo; notificações respeitam preferências |
| RF-034 | Tratar suspensão do computador e encerramento inesperado | P0 | Tempo de suspensão não é somado silenciosamente; usuário revisa trecho incerto |

### 5.5 Materiais e anotações

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-035 | Importar arquivos para dentro do espaço | P0 | Após remover o original externo, a cópia importada continua abrindo |
| RF-036 | Classificar por disciplina, assunto e etiquetas | P0 | Um material pode ter vários vínculos sem duplicar o arquivo |
| RF-037 | Ler PDFs e guardar página atual | P0 | Reabrir retoma página; PDF inválido exibe erro sem travar o aplicativo |
| RF-038 | Registrar links e abrir outros formatos no app padrão | P0 | Link é identificado como externo; formato sem leitor integrado tem ação de abertura externa |
| RF-039 | Criar notas em Markdown ligadas a assunto/material | P0 | Edição persiste e exportação mantém texto e referências |
| RF-040 | Buscar materiais por metadados e notas | P0 | Busca filtra título, etiquetas, assunto e texto das notas |
| RF-041 | Detectar anexos idênticos por hash | P0 | Importação repetida reutiliza conteúdo e preserva vínculos independentes |
| RF-042 | Anotar e destacar trechos de PDF | P2 | Marcações persistem vinculadas à versão do arquivo |
| RF-043 | Buscar texto dentro de materiais e executar OCR local | P2 | Texto extraído indica origem; falha de OCR não impede acessar o documento |

### 5.6 Banco local e resolução de questões

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-044 | Cadastrar questões de múltipla escolha e certo/errado | P0 | Valida enunciado, alternativas aplicáveis e gabarito conhecido ou pendente |
| RF-045 | Registrar origem, banca, órgão, cargo, ano e assuntos | P0 | Campos desconhecidos são permitidos e identificados, sem inventar metadados |
| RF-046 | Importar/exportar JSON versionado com imagens | P0 | Prévia lista válidos, inválidos e duplicados; usuário confirma o lote antes da gravação |
| RF-047 | Filtrar banco de questões | P0 | Combina disciplina, assunto, banca, ano, situação e histórico de resolução |
| RF-048 | Separar prova anterior do concurso e compatibilidade temática | P0 | Interface informa o tipo de relação e não apresenta questão semelhante como pertencente ao concurso |
| RF-049 | Resolver, descartar alternativas e registrar confiança | P0 | Tentativa guarda resposta, tempo, data e certeza/dúvida/chute; mostra gabarito após resposta |
| RF-050 | Salvar cada tentativa e registrar correções de gabarito | P0 | Repetições não sobrescrevem primeira tentativa; alteração preserva versão usada originalmente |
| RF-051 | Favoritar e criar cadernos manuais | P0 | Questão pertence a vários cadernos sem duplicação do conteúdo |
| RF-052 | Manter caderno de erros com motivo e observação | P0 | Erro pode ser classificado como conteúdo, interpretação, distração ou esquecimento |
| RF-053 | Registrar lote resolvido fora do app | P0 | Aceita totais coerentes de respondidas/acertos; métricas distinguem lote externo de tentativas individuais |
| RF-054 | Criar cadernos dinâmicos por filtros | P1 | Novas tentativas atualizam coleções de erros persistentes, dúvidas e inéditas |
| RF-055 | Importar prova e gabarito em PDF com conferência | P1 | Preserva número e versão do caderno; permite corrigir separação e associação do gabarito antes de salvar |
| RF-056 | Renderizar código, tabelas, imagens e fórmulas | P0 | Conteúdo de TI mantém indentação e legibilidade, sem executar código importado |
| RF-057 | Marcar anulada, desatualizada ou gabarito alterado | P0 | Filtros e métricas aplicam tratamento explícito e preservam histórico |
| RF-058 | Registrar discursivas e estudos de caso | P1 | Armazena resposta, referência, rubrica e autoavaliação separadas da nota objetiva |
| RF-059 | Integrar fontes externas de questões autorizadas | P2 | Cada conector documenta acesso, atribuição e limites; sem conector, banco local continua funcional |

### 5.7 Revisões, flashcards e simulados

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-060 | Agendar revisões por assunto | P0 | Conclusão pode gerar revisão; permite reagendar e concluir sem duplicar a mesma ocorrência |
| RF-061 | Criar flashcards com texto e imagens | P1 | Frente/verso e vínculo ao assunto ficam disponíveis offline |
| RF-062 | Usar repetição espaçada para flashcards | P1 | Resposta de dificuldade altera próxima data de forma determinística e registra versão do algoritmo |
| RF-063 | Separar revisão de conteúdo e de flashcards | P1 | Concluir uma não marca a outra automaticamente como concluída |
| RF-064 | Montar simulado por filtros e distribuição | P1 | Valida quantidade disponível e informa insuficiência sem repetir questões silenciosamente |
| RF-065 | Aplicar tempo, pesos e penalidades configurados | P1 | Gabarito fica oculto até finalizar; nota reproduz regras cadastradas, incluindo brancos e anuladas |
| RF-066 | Retomar simulado interrompido conforme regra | P1 | Modo treino permite pausa; modo prova aplica regra de relógio exibida antes do início |
| RF-067 | Produzir diagnóstico e tarefas após simulado | P1 | Resultado detalha assunto/tempo e permite adicionar recuperação ao plano |

### 5.8 Gamificação e evolução

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-068 | Conceder XP e níveis por atividades registradas | P0 | Cada concessão tem origem única; salvar novamente não gera XP adicional |
| RF-069 | Acompanhar sequência em dias planejados | P0 | Dias de descanso não interrompem sequência; perder dia não remove níveis |
| RF-070 | Mostrar indicadores de estudo e questões | P0 | Informa período, amostra e separação de primeiras tentativas, repetições e registros externos |
| RF-071 | Mostrar cobertura do edital | P0 | Exibe assuntos iniciados/concluídos e informa denominador e critério de cobertura |
| RF-072 | Oferecer conquistas e missões semanais | P1 | Regras são visíveis e prêmios não são concedidos duas vezes pelo mesmo marco |
| RF-073 | Permitir avatar, jornada e recompensas pessoais | P2 | Personalização pode ser ocultada sem afetar os estudos |
| RF-074 | Exportar resumo de evolução em CSV | P1 | Valores exportados correspondem aos filtros da tela |

### 5.9 Descoberta e acompanhamento de concursos

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-075 | Cadastrar interesse por área e especialidade | P1 | TI inclui desenvolvimento, dados, segurança, redes, infraestrutura, suporte e governança |
| RF-076 | Cadastrar manualmente concurso e fonte | P0 | Salva cargo, órgão, URL, situação e prazos conhecidos, aceitando campos ausentes |
| RF-077 | Buscar concursos em fontes integradas | P1 | Ao menos uma fonte aprovada retorna resultados reais; cada item apresenta origem e última consulta |
| RF-078 | Filtrar por área, local, formação, banca, salário e prazo | P1 | Valores ausentes não viram zero; filtros deixam clara a exclusão de registros sem dados |
| RF-079 | Classificar fase e separar expectativa de confirmação | P1 | Previsto, autorizado, edital publicado, inscrições abertas/encerradas e concluído têm evidência ou indicação de incerteza |
| RF-080 | Favoritar oportunidades e salvar edital | P0 | Favoritos e documentos baixados continuam disponíveis offline |
| RF-081 | Atualizar favoritas e sinalizar alterações | P1 | Mantém histórico de mudança, informa falhas e não apaga valor anterior por erro de coleta |
| RF-082 | Alertar sobre inscrição, pagamento e prova | P1 | Com app aberto, alerta usa data/fuso registrados; sem horário oficial, indica informação incompleta |
| RF-083 | Converter oportunidade em preparação | P1 | Prévia permite revisar cargo, data e edital antes de criar; evita duplicação acidental |
| RF-084 | Comparar oportunidades por perfil e conteúdo comum | P2 | Mostra critérios utilizados e requisitos ainda não conferidos, sem afirmar elegibilidade definitiva |
| RF-085 | Atualizar em segundo plano com app fechado | P2 | Só é habilitado com componente específico, preferência explícita e estado de execução visível |

### 5.10 Configurações e assistência opcional

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-086 | Configurar tema, acessibilidade, fuso e gamificação | P0 | Preferências persistem; caminhos locais de máquina não migram como se fossem portáteis |
| RF-087 | Exibir diagnóstico e versão do aplicativo | P0 | Exportação de diagnóstico omite conteúdo de materiais e segredos por padrão |
| RF-088 | Usar IA opcional para rascunhos de cards e explicações | P2 | Informa serviço e conteúdo a enviar; saída exige revisão e fica identificada como gerada |
| RF-089 | Atualizar aplicativo preservando os dados | P1 | Migração cria recuperação antes de alterar esquema; versão antiga não grava em formato novo incompatível |

## 6. Regras de negócio

| ID | Regra |
|---|---|
| RN-001 | Material importado pertence ao espaço por cópia; caminho absoluto externo não é referência portátil |
| RN-002 | Teoria concluída, domínio estimado, XP e cobertura são dimensões distintas |
| RN-003 | Primeira tentativa e repetições devem ser consultáveis separadamente |
| RN-004 | Acerto com chute/dúvida mantém resultado correto, mas sinaliza necessidade de revisão |
| RN-005 | Questão sem gabarito conhecido permite registrar resposta, mas não gera acerto/erro definitivo |
| RN-006 | Questões anuladas ficam fora da taxa geral de acerto; em simulado seguem a regra configurada da prova |
| RN-007 | Questão desatualizada é sinalizada e excluída por padrão de novas seleções, com opção explícita de incluir |
| RN-008 | Alterar gabarito preserva tentativas e versão anterior; interface distingue nota original e recalculada |
| RN-009 | Conclusão de sessão e concessão de XP devem ser idempotentes, inclusive após recuperação de falha |
| RN-010 | Mudanças no plano não apagam sessões, respostas ou revisões concluídas |
| RN-011 | Não há transferência automática de arquivos privados para IA ou outros serviços externos |
| RN-012 | Dados de oportunidades exibem fonte e data; notícia de expectativa não equivale a edital publicado |
| RN-013 | Falha de internet mantém cache e histórico, com estado de desatualização visível |
| RN-014 | Fonte e tipo de comentário são distintos: pessoal, importado, oficial informado ou gerado por IA |
| RN-015 | Revisão confirmada no disco local não significa sincronização confirmada na nuvem |
| RN-016 | Bloqueio em arquivo sincronizado é apenas indício; não garante exclusão mútua entre máquinas offline |
| RN-017 | Remover vínculo não elimina anexo usado em outro contexto; exclusão física respeita retenção e backups |
| RN-018 | XP não é evidência de aprovação ou conhecimento; o app não estima chance de aprovação no escopo atual |

### 6.1 Política inicial de XP — proposta ajustável

- Sessão concluída: 1 XP por minuto efetivo, limitado a 120 XP por dia nessa categoria.
- Primeira resolução válida de uma questão no dia: 2 XP, até 60 XP/dia; repetir a mesma questão nesse dia não soma novamente.
- Revisão de assunto concluída: 5 XP por ocorrência prevista, até 30 XP/dia.
- Descansos não geram nem removem XP; não existe perda de níveis por ausência.
- Fontes de pontuação não se duplicam: questões dentro de um simulado usam o mesmo identificador de atividade.
- Correção ou exclusão de atividade gera ajuste rastreável do XP correspondente.
- A versão das regras é registrada. Valores devem ser calibrados no uso, sem reescrever silenciosamente concessões anteriores.

### 6.2 Planejamento e revisões — política inicial

Na R1, usar distribuição determinística do tempo pelos pesos informados e prioridades escolhidas. Reservar uma parcela configurável para revisões; informar sobrecarga quando a demanda exceder o tempo. Sem desempenho suficiente, não inferir dificuldade automaticamente.

Revisões de assunto podem começar com intervalos configuráveis sugeridos de 1, 7 e 30 dias. São uma regra operacional inicial, não uma promessa de retenção ideal. Flashcards terão algoritmo próprio na R2, validado separadamente.

Na R2, recomendações podem combinar peso, atraso de revisão e erros recentes. Mostrar amostra, período e justificativa; exigir confirmação para mudanças relevantes no plano.

## 7. Requisitos não funcionais

Metas de desempenho abaixo são propostas de aceite a medir, não resultados já obtidos. Máquina de referência: Windows 11 x64, SSD, 8 GB de RAM e processador com quatro núcleos; registrar modelo exato na homologação. Base de referência: 50 mil questões, 100 mil tentativas, 5 mil notas e mil materiais, sem OCR em execução.

| ID | Requisito | Meta/validação |
|---|---|---|
| RNF-001 | Operação offline | Todos os fluxos P0 de estudo funcionam sem rede, após instalação das dependências |
| RNF-002 | Inicialização | Tela Hoje interativa em até 3 segundos no p95 de 20 aberturas com base de referência |
| RNF-003 | Busca local | Metadados e notas respondem em até 500 ms no p95 de consultas padronizadas |
| RNF-004 | Responsividade | Importação, snapshot e indexação não bloqueiam interação; operações longas exibem progresso |
| RNF-005 | Durabilidade | Operações confirmadas sobrevivem ao encerramento abrupto, dentro das garantias do sistema de arquivos |
| RNF-006 | Portabilidade | Troca entre dois PCs preserva contagem de registros, conteúdo e hashes dos anexos |
| RNF-007 | Acessibilidade | Fluxos essenciais utilizáveis por teclado, zoom de 200%, foco visível e contraste compatível com objetivo WCAG AA |
| RNF-008 | Segurança local | Privilégios mínimos, validação no backend e bloqueio de caminhos que escapem da raiz autorizada |
| RNF-009 | Conteúdo importado | HTML sanitizado; scripts, comandos e código dos materiais não são executados |
| RNF-010 | Privacidade | Sem telemetria por padrão; chaves fora do espaço sincronizado e protegidas pelo sistema operacional |
| RNF-011 | Evolução do formato | Versão explícita, migrações testadas e recuperação antes de alterações irreversíveis |
| RNF-012 | Datas e tempo | Instantes em UTC, fuso por contexto e datas sem hora preservadas como datas; cronômetro usa relógio monotônico |
| RNF-013 | Testabilidade | Regras de plano, pontuação, importação e recuperação testáveis sem interface |
| RNF-014 | Diagnóstico | Logs locais com rotação, erros compreensíveis e sem materiais completos ou credenciais |
| RNF-015 | Distribuição | Instalação e atualização preservam espaços; desinstalação não exclui estudos automaticamente |
| RNF-016 | Resiliência de rede | Timeout, cancelamento, tentativas limitadas e cache por fonte de concursos |
| RNF-017 | Compatibilidade | Cada release declara sistemas e versões do formato homologados |
| RNF-018 | Falta de espaço | Falha ao anexar/publicar/gerar backup mantém dados anteriores; sucesso só aparece após persistência |

O espaço inicialmente não terá criptografia própria. A confidencialidade em repouso dependerá da proteção do dispositivo e, somente quando o usuário optar por sincronizar, também do serviço escolhido. Criptografia do espaço poderá ser uma evolução específica, com plano de recuperação de chave.

## 8. Arquitetura proposta para dados portáteis

### 8.1 Decisão central

**Usar SQLite como banco de trabalho local e manter anexos no dispositivo. Gerar revisões imutáveis consistentes para portabilidade e recuperação; publicar em pasta sincronizada apenas quando o usuário configurar essa opção. O banco ativo permanece fora de qualquer pasta sincronizada.** Esta é uma decisão de projeto proposta, baseada nos riscos de transportar um banco em uso, e não uma funcionalidade pronta de sincronização do SQLite.

A documentação do SQLite aborda limitações de acesso em rede e a necessidade de coordenação dos arquivos de WAL [S3, S4]. Uma pasta local sincronizada não é exatamente um sistema de arquivos de rede, mas o transporte assíncrono de arquivos tampouco fornece transações entre computadores. Portanto, não sincronizar diretamente o banco ativo e seus arquivos auxiliares.

No modo padrão, o aplicativo não depende de cliente de nuvem e não publica dados em destinos externos. As revisões portáteis ficam locais e podem ser copiadas manualmente. A ativação opcional muda apenas o destino das revisões preparadas, sem transformar o banco ativo em um banco remoto. Não serão adicionados servidor de sincronização, autenticação própria ou armazenamento gerenciado pelo produto.

### 8.2 Organização lógica

| Local | Conteúdo |
|---|---|
| Diretório local do aplicativo | Banco ativo, cache, índices, logs, identidade do dispositivo e pendências |
| `espaco/workspace.json` | Identidade estável do espaço e versão básica do formato |
| `espaco/revisions/<id>/` | Snapshot fechado do banco e manifesto dessa revisão |
| `espaco/blobs/<hash>` | Anexos imutáveis referenciados pelo conteúdo |
| `espaco/exports/` | Exportações explicitamente solicitadas pelo usuário |
| Destino independente | Backups completos, com retenção própria |

Notas e metadados são autoritativos no banco da revisão. Arquivos Markdown exportados não formam uma segunda fonte editável sincronizada no MVP. Caminhos locais, segredos e cache não integram o conteúdo portátil.

### 8.3 Protocolo mínimo de publicação e abertura

1. Cada espaço, dispositivo, entidade e revisão recebe identificador estável.
2. Uma revisão registra seu pai, versão do esquema, dispositivo, checksums e conjunto de anexos necessários.
3. Operações são gravadas transacionalmente no banco local. A publicação utiliza mecanismo consistente de snapshot, como a Online Backup API do SQLite [S5].
4. Gravar snapshot e anexos por arquivos temporários; validar e publicar o manifesto completo por último no disco local. A ordem de chegada pela nuvem não é presumida.
5. Ao abrir em outro PC, validar manifesto, banco e todos os anexos requeridos. Revisão parcial não substitui a última revisão válida.
6. Havendo uma única revisão descendente válida e nenhuma alteração local pendente, carregar seu snapshot no banco de trabalho.
7. Havendo duas pontas divergentes ou trabalho local não publicado, preservar todos os estados e abrir fluxo de conflito. Não escolher automaticamente pelo horário do arquivo.
8. R1 oferece comparação de metadados, escolha explícita da versão a continuar e exportação da alternativa. Mesclagem de registros fica para evolução.
9. Publicar após conclusão de sessão, por intervalo configurado e na ação Preparar troca. Mostrar pendências quando a publicação falhar.
10. Anexos só podem ser coletados como não utilizados após considerar todas as revisões retidas; a R1 pode adiar a limpeza automática.

### 8.4 Limites que a interface deve comunicar

- O app salva localmente. Se o usuário ativar a opção, prepara conteúdo na pasta escolhida e o cliente externo faz o transporte.
- Desativar a opção interrompe publicações futuras, preserva os dados locais e não revoga compartilhamentos nem remove arquivos que já chegaram ao provedor. O usuário gerencia esses arquivos no próprio serviço.
- Não há garantia de perceber imediatamente edições em um PC desconectado.
- Usar um computador por vez reduz conflitos, mas não elimina a necessidade de recuperação.
- Arquivos “somente online” precisam estar baixados para estudo offline; a validação detecta ausências.
- Desligar o computador sem sincronizar pode deixar o outro PC com uma revisão anterior.
- Snapshot completo simplifica recuperação, mas pode aumentar custo de armazenamento e transferência. Medir tamanho e frequência na R0.
- Backup deve estar fora da raiz sincronizada. Cópia no mesmo disco ajuda em exclusões, mas não protege contra falha desse disco.

## 9. Modelo conceitual de dados

| Entidade | Dados principais e relações |
|---|---|
| Espaço | Identidade, versão de formato, preferências portáteis |
| Dispositivo/Revisão | Origem, revisão pai, hashes, data e esquema |
| Perfil de interesse | Áreas, especialidades, formação e locais desejados |
| Concurso/Cargo | Órgão, banca, fase, requisitos, remuneração, fonte e prazos |
| Registro de fonte | URL, momento da consulta, evidência e histórico de alterações |
| Preparação | Concurso/cargo opcional, edital, data, estado e prioridade |
| Disciplina/Assunto | Taxonomia, hierarquia e vínculos com itens de edital |
| Item de edital | Preparação, assunto, peso, estado da teoria e documento de origem |
| Plano/Ciclo/Tarefa | Disponibilidade, ordem, duração, objetivos e referências |
| Sessão | Tarefa, assunto, início, pausas, duração e observações |
| Material/Blob | Metadados, hash, tipo, tamanho e vínculos reutilizáveis |
| Nota | Conteúdo Markdown, revisões e referências |
| Questão/Versão | Enunciado, alternativas, gabarito, origem, situação e taxonomia |
| Tentativa | Versão da questão, resposta, confiança, tempo e resultado original |
| Registro agregado | Questões externas por assunto/período, total e acertos |
| Caderno | Seleção manual ou filtro dinâmico |
| Revisão de assunto | Agendamento, conclusão, motivo e sessão associada |
| Flashcard/Histórico | Frente, verso, avaliações e estado do agendamento |
| Simulado/Resultado | Seleção congelada, regras de pontuação e tentativas |
| Evento de XP/Conquista | Origem única, regra, pontos, ajustes e data |
| Backup/Importação | Estado da operação, versão, diagnóstico e resumo |

Relações muitos-para-muitos devem ser explícitas: material–assunto, questão–assunto, preparação–assunto e caderno–questão. Não usar o nome do assunto como chave. Questões em simulados apontam para uma versão congelada para preservar reprodutibilidade.

### 9.1 Contrato inicial de importação de questões

O formato JSON deve ter `schemaVersion`, identificação do conjunto, origem, lista de questões e referências a anexos. Cada questão contém identificador externo opcional, tipo, enunciado, alternativas, gabarito opcional, comentário, metadados e assuntos.

Rejeitar alternativas inexistentes no gabarito, caminhos fora do pacote, anexos ausentes e IDs conflitantes. Duplicatas exatas podem ser detectadas por hash normalizado; duplicatas aproximadas são sugestões para revisão. A importação não mescla questões parecidas automaticamente.

Importação de PDF cria um rascunho. Questões com imagens, duas colunas, tabelas, fórmulas, código e versões diferentes de prova exigem associação explícita; OCR entra depois. Nenhuma taxa de extração automática é prometida antes do protótipo.

## 10. Stack e responsabilidades

### 10.1 Direção escolhida, sujeita à validação do protótipo

**Tauri 2 + React + TypeScript + Vite + Rust + SQLite.**

Tauri permite frontend web e núcleo nativo, com acesso ao sistema delimitado por comandos e capabilities [S1, S2]. A direção escolhida é Tauri, com interface moderna e operações locais centralizadas. A experiência prévia do desenvolvedor é Java e NestJS/TypeScript; por isso, a interface permanecerá em TypeScript e o núcleo Rust terá limites pequenos e explícitos. A contrapartida é manter código em TypeScript e Rust e testar o comportamento do WebView em cada sistema.

| Camada | Escolha proposta | Responsabilidade |
|---|---|---|
| Aplicativo desktop | Tauri 2 | Janela, integração com sistema, instalador e comunicação com backend |
| Interface | React + TypeScript + Vite | Telas, componentes e build da interface |
| Estilo | Tailwind CSS + componentes shadcn/ui | Design consistente, temas e componentes adaptáveis |
| Navegação | React Router | Organização das áreas da interface |
| Estado de interface | Estado React; Zustand se necessário | Sessão visual, filtros temporários e preferências de tela |
| Consultas e invalidação | TanStack Query, se a complexidade justificar | Coordenar consultas ao backend sem tornar cache a fonte oficial |
| Formulários | React Hook Form + Zod | Validação de experiência; regras críticas são revalidadas em Rust |
| Núcleo local | Rust + Serde | Casos de uso, arquivos, publicação, importação e regras de integridade |
| Banco | SQLite via rusqlite | Repositórios, transações e snapshots; uma fila controlada de escrita |
| Migrações | SQL versionado executado pelo núcleo | Evolução reproduzível com cópia de recuperação |
| Leitura de PDF | PDF.js | Renderização local e navegação [S6] |
| Notas | Markdown com renderização sanitizada | Escrita, leitura e exportação portátil |
| Pesquisa | SQLite FTS5, após verificar build | Busca em notas e metadados; indexação de arquivos na R3 |
| Gráficos | Recharts | Histórico e comparação com alternativas textuais acessíveis |
| Rede | Cliente HTTP no backend Rust | Adaptadores de concursos, cache, timeout e controle de acesso |
| Testes de domínio | Testes Rust | Plano, pontuação, importações, migrações e protocolo de revisões |
| Testes de interface | Vitest + Testing Library | Estados relevantes e interações |
| Fluxos completos | Harness web para UI + testes nativos no Windows | Verificar separadamente interface e acesso real a disco/instalador |
| Qualidade | ESLint, formatador, rustfmt e Clippy | Consistência e análise estática |
| CI | GitHub Actions ou equivalente | Build, testes e artefatos em runner Windows |

Bibliotecas auxiliares são escolhas de projeto, não dependências obrigatórias. Fixar versões estáveis compatíveis em lockfiles após o protótipo e conferir licenças antes da distribuição. Evitar instalar bibliotecas para necessidades ainda inexistentes.

### 10.2 Limites entre frontend e backend

O frontend solicita ações como `finish_session`, `import_questions` e `publish_revision`. O backend valida entradas, aplica regras e grava em transação. A interface não recebe permissão genérica para executar SQL ou escrever em qualquer caminho.

Não usar simultaneamente acesso direto ao SQLite pelo frontend e um repositório Rust para as mesmas entidades. A proposta escolhe o backend como único responsável pela persistência. Conteúdo remoto abre no navegador padrão; não recebe capacidades nativas da janela principal.

### 10.3 Aplicativo local, sem backend próprio na nuvem

A arquitetura será um monólito modular desktop. Não faz parte do plano criar servidor NestJS, conta do aplicativo, banco remoto, hospedagem de materiais ou sincronização própria por API. A possibilidade de nuvem discutida anteriormente foi substituída pela decisão de manter o produto local com sincronização opcional controlada pelo usuário.

A busca de concursos utiliza conectores executados localmente e fontes cujo acesso seja viável nesse modelo. Fontes que exijam segredo compartilhado de servidor ou infraestrutura própria ficam fora do escopo; manter cadastro manual como alternativa. A sincronização opcional usa o cliente externo escolhido pelo usuário e não é requisito para abrir ou estudar.

### 10.3.1 Divisão de responsabilidades

| Parte | Responsabilidade | Linguagem |
|---|---|---|
| Interface | Telas, formulários, navegação, gráficos e interação | TypeScript/React |
| Ponte local | Contratos de comandos e respostas tipados | TypeScript e Rust |
| Núcleo | Regras que alteram dados, banco, arquivos, importação, backups e integração com o sistema | Rust |
| Trabalho pesado | Processamento em tarefas ou workers para preservar a fluidez | Conforme a operação, coordenado pelo núcleo |

Organizar o núcleo em módulos, serviços e repositórios, com erros explícitos e testes das operações críticas. Desenvolver com apoio de IA em incrementos pequenos e revisáveis; compilação bem-sucedida não substitui testes de recuperação e integridade. Não duplicar regras persistentes entre frontend e núcleo.

### 10.4 Alternativa de contingência: Electron

Electron + React + TypeScript + SQLite é uma alternativa caso a familiaridade com JavaScript e a velocidade de implementação pesem mais que a adoção de Rust. Electron usa a arquitetura de processos do Chromium [S7]; seria necessário concentrar persistência no processo principal e limitar a ponte para a interface.

| Critério | Tauri | Electron |
|---|---|---|
| Conhecimento de implementação | TypeScript e Rust | JavaScript/TypeScript e APIs nativas necessárias |
| Motor da interface | WebView do sistema | Chromium distribuído com o app |
| Previsibilidade visual entre sistemas | Exige validar WebViews distintos | Motor mais uniforme por versão do aplicativo |
| Integração do projeto | Núcleo Rust centraliza operações locais | Processo principal centraliza operações locais |
| Escolha recomendada | Padrão proposto para este produto | Alternativa se a equipe preferir concentrar trabalho em TypeScript |

Não há benchmark realizado para este projeto. Tamanho, RAM e desempenho devem ser medidos no protótipo. A troca entre Tauri e Electron não elimina o trabalho de sincronização, recuperação ou extração de PDFs.

### 10.5 Instalação e distribuição

No Windows, Tauri utiliza WebView2 [S8]. O instalador precisa verificar esse requisito e a estratégia para instalação sem internet deve ser definida antes da distribuição. O funcionamento offline do estudo não implica que uma instalação incompleta funcione sem suas dependências.

Builds de release devem ser produzidas e testadas em Windows. Planejar assinatura do instalador, atualização assinada quando habilitada, versionamento semântico e política de compatibilidade do formato de dados. Atualizações automáticas ficam após a base de recuperação estar validada.

## 11. Integração de concursos

### 11.1 Estratégia

Começar por um adaptador pequeno, baseado em fonte com acesso e uso tecnicamente validados. Priorizar publicações de órgãos e bancas para conferir fatos. Agregadores podem ajudar na descoberta, mantendo a origem verificável. Não está validada neste documento uma API que cubra todos os concursos brasileiros.

Cada adaptador deve produzir um modelo normalizado: identificador de origem, órgão, cargo, área, local, escolaridade, remuneração e periodicidade, vagas, fase, prazos, URL, data de consulta e campos desconhecidos. Um concurso pode ter vários cargos e locais; não reduzir todos a um único salário ou requisito.

### 11.2 Condições de aceite do primeiro conector

- Acesso reproduzível, condições de uso avaliadas e limites de requisição documentados.
- Amostra real de cargos de TI consultável com fonte e data.
- Deduplicação sem confundir cargos distintos do mesmo edital.
- Tratamento de campo ausente, retificação, erro e indisponibilidade.
- Testes com exemplos congelados da estrutura de resposta e checagem manual de resultados.
- Nenhuma chave privada de serviço compartilhada embutida no executável.
- Alternativa de cadastro manual permanece disponível.

A importação de oportunidades não deve automaticamente importar questões nem inferir que todas as questões de uma banca atendem ao edital. A relação depende de concurso/prova ou classificação temática conferida.

## 12. Backlog inicial e dependências

| Ordem | Pacote | Dependência | Definição de concluído |
|---|---|---|---|
| 1 | Protótipo desktop e decisões de formato | Nenhuma | App instalável abre pasta e valida permissões no Windows |
| 2 | Banco, migrações, snapshots e backups | 1 | Recupera falha e transfere espaço entre duas máquinas sem perda |
| 3 | Preparações, disciplinas e edital manual | 2 | Usuário cadastra uma preparação completa |
| 4 | Materiais, PDF e notas | 2–3 | Arquivo importado e posição de leitura acompanham o espaço |
| 5 | Ciclo, Hoje e sessões | 3–4 | Tarefa gera sessão e atualização consistente do plano |
| 6 | Questões manuais/JSON e tentativas | 2–3 | Resolve bateria offline com gabarito, confiança e histórico |
| 7 | Revisões simples, XP e evolução | 5–6 | Ciclo de estudo completo com métricas verificáveis |
| 8 | Endurecimento e release R1 | 1–7 | Gates da seção 13 aprovados |
| 9 | Busca online e conversão em preparação | Validação da fonte + 3 | Busca real com proveniência e cache |
| 10 | PDF assistido, cards e simulados | 6–7 | R2 utilizável com revisão de importações e notas reproduzíveis |

O levantamento não atribui datas artificiais. Estimativas exigem definir equipe, familiaridade com Rust, fonte de concursos e resultados dos protótipos de R0.

## 13. Critérios de aceite de release

### 13.1 Gate da R1

1. Sem internet, criar preparação, planejar, importar PDF, estudar, responder questões e revisar.
2. Encerrar uma sessão repetindo a mesma requisição não duplica tempo, resposta ou XP.
3. Copiar o espaço para outro PC e abrir todos os dados confirmados e anexos publicados.
4. Interromper publicação mantém revisão anterior válida; pacote parcial recebido não é carregado como completo.
5. Simular duas revisões divergentes preserva ambas e exige resolução explícita.
6. Restaurar backup em novo espaço e comparar registros e hashes dos materiais.
7. Remover o arquivo de origem externa não afeta a cópia anexada.
8. Testar falta de espaço, permissão negada, PDF inválido, JSON inválido e esquema mais novo.
9. Conferir primeira tentativa, repetição, chute, anulação e alteração de gabarito nas métricas.
10. Instalar em máquina Windows de teste e percorrer os fluxos essenciais por teclado.
11. Verificar que a instalação padrão não publica dados em destino externo; ativar e desativar a sincronização opcional preserva uma cópia local completa e não interfere no estudo offline.

### 13.2 Gate da R2

Busca online com fonte real e estado offline; importação de prova com prévia editável; agendamento de flashcards determinístico; simulado com cálculo conferido; alertas de prazos e documentação dos limites de cobertura.

### 13.3 Testes de maior risco

Priorizar testes de invariantes: integridade do snapshot, relações entre dados e anexos, migração/restauração, idempotência, pontuação e datas. Testes de interface devem cobrir fluxos reais e falhas observáveis. Testes em navegador não substituem testes do núcleo nativo e do instalador.

## 14. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Edição concorrente ou sincronização parcial | Perda de progresso | Revisões imutáveis, parentagem, checksums e preservação de divergências |
| Volume dos snapshots | Transferência lenta e armazenamento alto | Medir na R0, ajustar frequência e retenção; considerar incremental depois |
| Fonte de concursos instável | Busca incompleta ou indisponível | Adaptadores isolados, cache, fonte/data e cadastro manual |
| PDF de layout complexo | Gabarito ou questão extraídos incorretamente | Rascunho revisável, preservação da página original e importação manual |
| Acertos inflados por repetição | Diagnóstico enganoso | Separar primeira tentativa, repetição e confiança |
| Excesso de recursos iniciais | Atraso e interface confusa | R1 fecha o ciclo principal; demais recursos entram por release |
| Curva de aprendizado Rust | Menor velocidade inicial | Protótipo curto; escolher Electron antes da construção ampla se necessário |
| Migração defeituosa | Espaço não abre | Backup prévio, testes de versões e recusa de downgrade inseguro |
| Dependências e conteúdo não confiável | Vulnerabilidade local | Atualização controlada, sanitização e comandos nativos mínimos |
| Backup no mesmo provedor/disco | Falha comum às cópias | Destino independente e teste periódico de restauração |

## 15. Decisões pendentes

Estas decisões não impedem detalhar o projeto; as premissas deste documento orientam o trabalho até serem revisadas.

| ID | Decisão | Padrão proposto | Quando resolver |
|---|---|---|---|
| D-01 | Sistemas suportados | Windows 11 x64 primeiro | Antes do empacotamento |
| D-02 | Framework desktop | Tauri 2 escolhido como direção; Electron apenas como contingência | Validar no protótipo R0 |
| D-03 | Sincronização opcional | Desativada por padrão; transporte manual sempre disponível | Homologar cliente somente para a opção que o usuário escolher |
| D-04 | Uso simultâneo | Fora da primeira versão | Antes de fechar formato portátil |
| D-05 | Fonte de concursos | Uma fonte viável validada | Antes de prometer busca online |
| D-06 | Busca online no primeiro lançamento | R2; antecipar se requisito de lançamento | Ao fechar backlog da R1 |
| D-07 | Origem inicial das questões | Cadastro e JSON; PDFs assistidos depois | Antes do contrato de importação |
| D-08 | Nome e identidade visual | A definir; visual adulto e discreto | Antes dos protótipos finais de telas |
| D-09 | Limites e retenção | Medir com dados reais e definir configuração | Durante R0/R1 |
| D-10 | Distribuição pública ou uso pessoal | Uso pessoal inicialmente | Antes de assinatura e atualização automática |
| D-11 | IA e envio de conteúdo | Desabilitados inicialmente | Apenas ao iniciar R3 |

## 16. Sequência recomendada para iniciar o desenvolvimento

1. Confirmar premissas de Windows, funcionamento local e uso de um computador por vez.
2. Validar em protótipo a passagem manual do espaço entre dois PCs, com arquivos incompletos e conflito simulado; repetir com cliente de sincronização somente para homologar essa opção.
3. Validar Tauri no ambiente alvo com uma janela React, cadastro de disciplina no SQLite, importação/leitura de PDF, reabertura preservando dados e criação/restauração de backup. Medir abertura e memória; revisar a capacidade de manter o núcleo Rust antes de ampliar o app.
4. Investigar uma fonte de concursos e decidir se a busca entra no lançamento inicial.
5. Criar protótipos das telas Hoje, Plano, Praticar e modo foco.
6. Fechar esquema de dados e contratos de comandos/importação.
7. Implementar o backlog da R1 em fatias completas, começando pela persistência e recuperação.

### 16.1 Histórico desta revisão

Versão 1.1: Tauri como direção de implementação; fronteiras entre TypeScript e Rust; protótipo vertical de validação; produto exclusivamente local com sincronização opcional desativada por padrão. Backend próprio na nuvem, NestJS remoto e sincronização própria por API não integram o escopo. Os identificadores dos requisitos existentes foram preservados.

## 17. Fontes técnicas consultadas

Consultadas em 22/09/2026. Fundamentam capacidades das tecnologias; arquitetura, prioridades, metas e regras do produto são propostas deste documento. Recursos e versões devem ser reconferidos ao implementar.

- **[S1] Tauri 2:** https://v2.tauri.app/ — integração de frontend e plataformas.
- **[S2] Segurança do Tauri:** https://v2.tauri.app/security/ — limites entre núcleo, WebView e capacidades.
- **[S3] SQLite em rede:** https://www.sqlite.org/useovernet.html — considerações de acesso por sistemas de arquivos de rede.
- **[S4] SQLite WAL:** https://www.sqlite.org/wal.html — coordenação e arquivos auxiliares do modo WAL.
- **[S5] SQLite Online Backup API:** https://sqlite.org/backup.html — mecanismo de cópia consistente do banco.
- **[S6] PDF.js:** https://mozilla.github.io/pdf.js/ — processamento e renderização de PDF.
- **[S7] Modelo de processos do Electron:** https://www.electronjs.org/docs/latest/tutorial/process-model — organização de processos.
- **[S8] Pré-requisitos do Tauri:** https://tauri.app/start/prerequisites/ — dependências de plataforma, incluindo WebView2.

---

**Resultado deste levantamento:** escopo completo organizado por módulos, 89 requisitos funcionais, 18 regras de negócio, 18 requisitos não funcionais, releases, critérios de aceite, modelo conceitual e arquitetura recomendada. O documento é uma base para backlog e desenho técnico; não representa integração com fontes já homologadas nem software já desenvolvido.
