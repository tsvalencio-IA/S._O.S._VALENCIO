# Proteção imediata de integridade — incidente 22/10/2026

**NÃO PUBLICAR AS REGRAS HISTÓRICAS DO REPOSITÓRIO COMO ESTÃO.** O arquivo `firebase/firestore.rules` presente no repositório descreve uma arquitetura RBAC com `/users/{uid}` e subcoleções `financial` que não foram validadas na implantação atual. O console em 22/10/2026 mostrou uma regra implantada bem diferente: `allow read, write: if true`.

O banco de produção hoje é usado por duas versões web e potencialmente aplicativos antigos, incluindo `SAAS-2` (commit 9aeacd0 de 02/10/2026). A versão antiga tem escrita irrestrita de arrays no `js/os.js` (linhas 4745-4761 e 5537-5542).

## Contenção recomendada (a validar no Rules Playground)

- Bloquear redução de arrays `pecas` e `servicos` nas O.S. existentes.
- Exigir que os arrays `media` e `timeline` preservem todos os elementos anteriores.
- Proibir exclusão de documentos `ordens_servico`.
- Manter, temporariamente, os demais fluxos funcionando durante migração de autenticação.

Isso não torna o banco privado; somente a migração completa para Firebase Auth / regras de tenant o fará.

## Sequência

1. Backup histórico e atual independente;
2. Testes de regras com exemplos de save legítimo e save destrutivo;
3. Publicação consciente das regras e verificação;
4. Blindagem dos clientes legados, com bloqueio de gravações inseguras;
5. Reconciliação das O.S. com precondição exata de updateTime;
6. Auditoria por evento imutável e monitoramento de leituras.

A PR de integridade não é deploy, nem recupera dados em produção.
