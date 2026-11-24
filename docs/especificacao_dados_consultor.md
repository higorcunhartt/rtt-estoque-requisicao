# Especificação do arquivo de dados: Controle de estoque na requisição

**Objetivo:** um único arquivo `dados.json`, gerado por consulta ao banco do Protheus, que alimenta a aplicação web de controle de estoque na requisição. Substitui as planilhas Excel (BASE DE SCs, BaseDadosEstoque, PEDIDOS EMITIDOS, MAPA_PEDIDO_COMPRA e TabelaZZF).

## Regras gerais de formato
- Codificação **UTF-8** (as planilhas atuais chegam com acentos corrompidos, por exemplo `Solicita��o`).
- **Remover espaços à direita** de todo texto (hoje vêm preenchidos, como `'03029     '`).
- Códigos (filial, armazém, produto, PC, SC, item, fornecedor, projeto, centro de custo) sempre como **texto**, preservando zeros à esquerda.
- Datas em `AAAA-MM-DD`. Data vazia ou `1900-01-01` vira `null`.
- Números como número JSON (ponto decimal), nunca texto.
- Ignorar registros deletados (`D_E_L_E_T_ <> '*'`).
- Um objeto JSON no topo, com as chaves abaixo. Cada chave é um array de objetos com os campos indicados.
- Registrar em `meta` a data/hora da extração.

```json
{ "meta": { "gerado_em": "2026-11-03T06:00:00", "meses": ["2025-01", "...", "2026-10"] },
  "grupos": [], "produtos": [], "armazens": [], "saldos": [], "consumo_mensal": [],
  "lead_time": [], "pcs_abertos": [], "scs_abertas": [], "ultimo_preco": [],
  "projetos": [], "projeto_locais": [], "fornecedores": [], "locais_entrega": [], "dominios": {} }
```

## Conjuntos de dados

### 1. `grupos`: tabela SBM
`grupo` (BM_GRUPO), `descricao` (BM_DESC), `movimenta_estoque` (BM_XMVEST, "S" ou "N").

### 2. `produtos`: tabela SB1 (inclui serviços)
`cod` (B1_COD), `descricao` (B1_DESC), `tipo` (B1_TIPO), `um` (B1_UM), `grupo` (B1_GRUPO), `bloqueado` (B1_MSBLQL), `exc_estoque` (B1_XEXCEST).
Incluir produtos de grupos com `movimenta_estoque = S` **e** os de tipo `SV` (serviços).

### 3. `armazens`: filial + armazém
`filial` (B2_FILIAL), `local` (B2_LOCAL), `nome` (descrição do armazém, ex. "GALPAO ATIBAIA"; vazio se não houver).
Incluir todas as combinações existentes em SB2.

### 4. `saldos`: tabela SB2
`filial`, `local`, `produto` (B2_COD), `qtd` (B2_QATU), `valor` (B2_VATU1), `custo_medio` (B2_CM1).
Incluir só `local <> '0000'` e produtos de grupos que movimentam estoque.

### 5. `consumo_mensal`: quantidade recebida por mês
`filial` (filial de entrega), `local`, `produto`, `mes` (`AAAA-MM`), `qtd`.
- Fonte: itens de pedidos de compra aprovados (`C7_CONAPRO = 'L'`) com quantidade entregue (`C7_QUJE`/NF de entrada).
- O mês é o da **digitação da NF** (`NF_DT_DIGITACAO`). Sem NF, usar a data de entrega prevista do pedido.
- Janela: os **22 meses fechados** anteriores à data de extração. Uma linha por filial + armazém + produto + mês, só quando `qtd > 0`.
- *Confirmar com o consultor:* é a mesma regra que gera hoje o consumo na planilha MAPA_PEDIDO_COMPRA.

### 6. `lead_time`: prazo de entrega observado
`produto`, `filial`, `dias_medio`, `qtd_pedidos`.
- Dias entre a emissão do PC e a digitação da NF, média por produto + filial, nos mesmos 22 meses.
- Entregar também o nível agregado por produto (todas as filiais) e por grupo, para o fallback: pode ser a mesma lista com `filial = null` (produto) e `produto = null` com `grupo` preenchido (grupo).

### 7. `pcs_abertos`: pedidos de compra aprovados com saldo a receber
`produto`, `filial` (filial de entrega), `local`, `pc` (C7_NUM), `item`, `qtd_pendente`, `entrega_prevista`, `emissao`, `fornecedor_nome`, `projeto_nome`.
Filtro: `C7_CONAPRO = 'L'`, quantidade pendente > 0, sem eliminação de resíduo.

### 8. `scs_abertas`: SCs aprovadas sem pedido
`produto`, `filial`, `local`, `sc` (C1_NUM), `item`, `qtd_pendente`, `emissao`, `necessidade` (C1_DATPRF), `solicitante` (C1_USER), `situacao` (STATUS_APROV), `projeto_nome`.
Filtro: `C1_APROV = 'L'`, `C1_PEDIDO` vazio, `C1_RESIDUO` vazio, quantidade pendente > 0.

### 9. `ultimo_preco`: último preço pago
`produto`, `preco`, `data`, `pc`, `filial`. Uma linha por produto (inclui serviços).

### 10. `projetos` e `projeto_locais`
- `projetos`: `codigo` (C1_ITEMCTA), `nome` (NOME_PROJETO, no formato "208 - PETROBRAS - REFAP ...").
- `projeto_locais`: `projeto`, `filial`, `local`, `qtd_itens`. Quais filial + armazém cada projeto usa nas SCs aprovadas (a tela filtra o estoque por projeto com base nisso).
- Também `centros_custo_filial`: `filial`, `cc`, `nome`, `qtd_itens` (usado no preenchimento da SC).

### 11. `fornecedores`
`cod`, `loja`, `nome`, `cnpj`, `qtd_pedidos` (A2).

### 12. `locais_entrega`: tabela ZZF
`ref` (ZZF_REF), `filial` (ZZF_FILRES), `cnpj`, `local` (ZZF_LOCENT), `descricao` (ZZF_DESCLE), `projeto`, `cc`, `obs_entrega`, `cep`.

### 13. `dominios`
Listas usadas nos campos da SC: `finalidades` (ex. "Consumo"), `modalidades` (ex. "Concorrencial", "Delegada"), `demandas` (ex. "Normal"), `condicoes_pagto` (código e descrição).

## Conferência
Antes da entrega final, enviar um arquivo de teste de **uma filial** (por exemplo 03029) para validarmos campo a campo contra as planilhas atuais. Contagem de linhas esperada por conjunto na base de 03/11/2026: SCs ~72 mil linhas no total, pedidos ~58 mil, mapa ~38 mil, produtos ~37 mil, locais de entrega 270.

## Entrega e frequência
- Arquivo gerado nos horários combinados (ex. 07h, 12h, 17h), sobrescrevendo o anterior.
- Destino: a definir (pasta compartilhada, SharePoint ou envio direto a um endpoint da aplicação).
