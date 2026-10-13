# Auditoria Windows — S.O.S. VALENCIO
Data: 13/10/2026 | Branch: homologacao

## Incidente relatado
O usuário relatou que o executável Windows RC4 deixou o computador sem resposta durante tentativa de instalação. Não houve acesso a logs de Eventos do Windows nem ao equipamento afetado; portanto a causa exata desse episódio **não foi comprovada**.

## Falhas concretas na implementação anterior
1. O arquivo Windows era o alvo `portable` do Electron Builder, não um instalador NSIS persistente; versões portáteis podem precisar extrair recursos temporários durante a inicialização.
2. O workflow só compilava e publicava, sem iniciar a aplicação no Windows.
3. O appId e a identidade do pacote Windows coincidiam com o produto original, com potencial conflito de instalação e perfil local.
4. Não existia monitoramento básico de renderer travado/crash, inicialização ou single-instance lock.
5. A abertura externa de URLs não restringia explicitamente http/https.

## Correções aplicadas
- `electron/main.js`: modo de inicialização auditável, teste automatizado da tela de perfis, log local limitado, isolamento da pasta userData, instância única, tratamento de crash e janela sem resposta, validação de URLs externas, janela inicialmente oculta até estar pronta, modo Windows conservador sem aceleração de hardware por padrão (reversível por `--sos-enable-gpu`).
- `.github/workflows/auditoria-windows-real.yml`: empacotamento persistente com `asar=true`, aplicativo Windows de homologação com appId próprio, teste de execução real, teste de memória inicial, instalação NSIS em caminho separado e execução após instalar.
- As pastas de compilação de arquivo executável e instalador são separadas para não reaproveitar DLLs bloqueadas pelo processo do teste.
- Nenhum arquivo Firebase/Cloudinary ou dado de O.S. foi alterado.

## Provas da execução
GitHub Actions: https://github.com/tsvalencio-IA/S._O.S._VALENCIO/actions/runs/38394082133
- Execução real do EXE: status `SMOKE_APROVADO`, tela de seleção renderizada com cinco perfis.
- Abertura normal por 12 segundos: aplicação permanecia ativa; memória do **processo principal** 91,3 MB. Não representa memória total de todos os subprocessos Electron nem teste de longa duração.
- Instalador NSIS: compilação concluída em diretório separado.
- Instalação NSIS real no runner Windows: concluída com sucesso.
- Execução do aplicativo **instalado**, modo smoke: exit code 0, validação aprovada.
- GitHub Actions: `success`.

Release privada: https://github.com/tsvalencio-IA/S._O.S._VALENCIO/releases/tag/windows-auditado-2

Arquivos:
- `SOS-VALENCIO-TESTE-WINDOWS-INSTALADOR-1.0.26-12-x64.exe` — instalador Windows x64 persistente, independente do software de produção.
- `SOS-VALENCIO-WINDOWS-PASTA-PORTATIL-X64.zip` — alternativa com extração uma única vez e execução da pasta, sem self-extraction a cada abertura.

## Restrições da aprovação
- Esta auditoria cobre **instalação, inicialização da tela e resposta inicial**. Não garante compatibilidade com drivers, antivírus ou hardware específico do usuário.
- O login Firebase em produção, todos os fluxos internos, abertura de PDFs/XLSX com arquivos reais, uso prolongado e consumo de memória de cada subprocesso não foram testados neste runner.
- As credenciais/URLs de Firebase da base original permanecem no pacote; não cadastrar, editar ou excluir O.S. reais durante homologação.
- O instalador não foi assinado digitalmente por certificado de editor confiável. Não desabilitar antivírus nem mecanismos de proteção do Windows para executá-lo.
- Caso persista lentidão/travamento no computador afetado, coletar versão do Windows, memória RAM, CPU, nome do antivírus e o arquivo `%APPDATA%\SOS-VALENCIO-HOMOLOGACAO-PC\diagnostico-inicializacao.log`, sem compartilhar credenciais.

**Conclusão:** candidato Windows com instalação e inicialização realmente testadas no runner, não versão final certificada para todos os perfis e equipamentos.
