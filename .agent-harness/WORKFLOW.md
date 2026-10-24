# Protocolo compartilhado de agentes

Esta base configura instruções, papéis, skills e um lembrete SessionStart. Ela não contém executor de loop, seletor de tarefas, locks executáveis, scheduler, aquisição de credenciais nem concessão de permissões. Não trate um lembrete de hook como sandbox ou como prova de isolamento.

## Precedência e escopo

1. Siga as instruções humanas e as políticas do ambiente.
2. Leia e preserve AGENTS.md, CLAUDE.md, instruções dos subdiretórios e o processo próprio do repositório. As regras específicas do projeto prevalecem sobre esta base genérica; este pacote não substitui um processo de loop já existente.
3. Inspecione os manifests e scripts reais antes de escolher comandos. Esta base não presume linguagem, banco, framework, estrutura de pastas ou comando de teste.

## Uma tarefa autorizada por vez

- Uma sessão coordena o trabalho. Um implementer escreve por tarefa; outro contexto atua como verifier. Alterações sensíveis também passam por security-reviewer.
- Descubra o mecanismo de isolamento e lock já aprovado pelo projeto antes de trabalhar em paralelo. Não libere um lock somente por sua idade quando seu proprietário pode estar vivo. O valor parallel_writers=false é uma instrução; não é uma trava executável.
- Preserve alterações alheias. Use branch/worktree separada quando houver trabalho concorrente. Não execute stash, reset, checkout destrutivo ou remoção automática da árvore de outra sessão.
- Registre critérios de aceite observáveis e verifique o diff final, incluindo arquivos novos e o índice. Se usar fingerprint de revisão, inclua os conteúdos dos arquivos novos não ignorados e o diff binário; git status sozinho não os protege.
- Um PASS precisa identificar o verificador independente, a revisão exata e os comandos/resultados observados. Não marque passes, tarefa ou revisão como concluída sem essa evidência; use o mecanismo validado próprio do projeto quando ele existir.
- Mantenha testes existentes. Corrija o comportamento ou escale o motivo da falha. Não remova ou enfraqueça teste para conseguir verde.

## Segurança e publicação

- Descubra e preserve os caminhos sensíveis definidos pelo projeto. Mudanças em identidade, autorização, segredos, permissões, isolamento, infraestrutura, migrações, backup, restauração ou release exigem revisão específica.
- Não copie dados de produção, tokens, chaves, cookies, arquivos de ambiente ou material de cliente para instruções, testes, screenshots, logs ou commits.
- Merge na branch principal e deploy ficam com o responsável humano conforme a autorização e o processo de cada repositório. Esta instalação não aprova fases, não altera a proteção de branches, não arma hooks Git nem inicia agentes.
- Antes de declarar pronto, informe o que foi verificado e o que ficou pendente. Saída de modelo não substitui saída de teste.

## Uso por ferramenta

AGENTS.md e CLAUDE.md apontam para este protocolo. Os papéis e a skill compartilhada têm nomes próprios para coexistir com os que o projeto já usa. O hook SessionStart apenas exibe um lembrete de leitura e depende do suporte/da aprovação da ferramenta; instalar seu arquivo não comprova execução do hook.
