# S.O.S. VALENCIO — estado real da correção geral (2026-10-10)

## Objetivo
Corrigir o sistema completo, sem simplificar, preservando as lógicas de Cília e Tempária, e sem alterar dados Firebase/Cloudinary de produção.

## Aplicado na branch homologacao
- V5: controle de peças realmente instaladas (*177), exclusão de pendências sem confirmação do relatório de instaladas, não promover por NF/estoque automaticamente, dados antigos não excluídos.
- IA: atendimentos lançados no período e O.S. antigas finalizadas nesse período, sem confundir atualizações genéricas; datas Firestore Timestamp.
- IA: mostra pagamentos parciais e saldos por O.S. selecionada no relatório operacional quando o módulo transacional está disponível. Não afirma pagamento a partir da comissão apenas calculada.
- Controle de acesso cliente: `js/core.js` não concede `moverStatus` ao mecânico.
- Testes automatizados: `TESTES_REGRESSAO_SOS_VALENCIO.js`, `TESTES_IA_PERIODOS_E_FLUXOS_20261010.js`, `TESTES_PERMISSOES_20261010.js`.

## Conferência automatizada
- GitHub Actions `38088315306` reexecutado e concluído com sucesso (tentativa 2).
- 149 arquivos JS, 53 scripts internos HTML, 49 JSON: sintaxe/leitura OK.
- Cília, API Cília, tabela Tempária e exportação PMSP: SHA-256 idênticos à base autorizada.
- 12 verificações pré-existentes de peças/NF/serviços, 18 testes direcionados de IA e 8 de permissões; todos simulados.
- Nada publicado no Firebase, Cloudinary ou aplicativo em produção.

## Ainda NÃO comprovado / não tratar como versão final
1. Divergência de totais tela da O.S. / PDF / XLSX em aprovações parciais, dados Cília específicos e snapshots de peças editadas sem salvar.
2. Origem histórica das linhas zeradas, com metadados/auditoria do Firestore por O.S. e todos os integradores (CHECKLIS_SOS e Central Viaturas); não atribuir origem sem prova.
3. Segurança Firestore publicada. Risco relevante: o documento principal de O.S. mistura dados operacionais e valores; as regras de leitura do mecânico podem revelar campos financeiros mesmo com UI oculta. Corrigir exige separação de documentos/validação com perfis.
4. Todos os fluxos de pagamento concorrente, rateio, pagamento em lote e saldos em Firebase real.
5. Execução ponta a ponta em Android, desktop, cliente comum, cliente oficial, gestor, equipe, checklist, upload de fotos/vídeos e assinaturas.
6. Medição de leituras/gravações reais de Firestore e uploads/transformações Cloudinary antes/depois; respeitar cache e não apagar dados.
7. Segurança/keystore Android de produção, assinatura e atualização sem reinstalar.
8. Regras de O.S. reaberta, histórico imutável, timeline, provas e PDF testadas em cenários reais, incluindo concorrência.

## Política de entrega
Não chamar APK nem GitHub Actions de correção geral concluída antes de fechar os cenários acima. A branch `main` e o ambiente original de produção permanecem fora da homologação. Não apagar peças históricas automaticamente nem promover compras/checklist para peças instaladas.
