# BI Itah

Sistema web (Node.js) com login pela tabela de usuários do banco `dbFeedItah` e relatórios responsivos (funciona no PC e no celular).

Relatório 1: **Classificação da amostra de compra × classificação dos lotes que entraram**, com 3 visões: geral, por fornecedor e por contrato (com lote a lote).

## Jeito rápido (Windows)

- **iniciar-demo.bat** – abre com os dados de demonstração (login demo / demo).
- **descobrir-usuario.bat** – mostra as colunas da tb_usuario para configurar o `.env`.
- **iniciar.bat** – roda ligado no banco e abre o navegador. Na primeira vez instala tudo e cria o `.env`.

## 1. Instalar

Precisa do Node.js 18 ou mais novo (https://nodejs.org). Na pasta do projeto:

```
npm install
```

## 2. Testar sem banco (modo demonstração)

```
npm run demo
```

Abra http://localhost:3000 e entre com **demo / demo**. Usa os dados que estavam salvos no seu Itah2.pbix (`data/demo.json`).

## 3. Ligar no banco

1. Copie `.env.example` para `.env` e preencha `DB_USER`, `DB_PASSWORD` e `SESSION_SECRET`.
2. No portal do Azure, libere o IP do computador/servidor no firewall do SQL (igual ao Power BI).
3. Descubra as colunas da tabela de usuários e o formato da senha (não mostra as senhas):
   ```
   npm run descobrir-usuario
   ```
   Copie as linhas sugeridas para o `.env` (`USER_TABLE`, `USER_COL_LOGIN`, `USER_COL_SENHA`...).
4. Rode:
   ```
   npm start
   ```

`PASSWORD_MODE=auto` reconhece senha em texto, MD5, SHA1, SHA256, SHA512 (inclusive HASHBYTES do SQL Server) e bcrypt.
Se o seu sistema usar outro tipo (ex.: com "salt" próprio), me mande o resultado do `descobrir-usuario`.

Para acessar pelo celular na mesma rede: `http://IP-DO-COMPUTADOR:3000`.
Para acesso fora da empresa, publique atrás de HTTPS (ex.: Azure App Service) — não exponha a porta direto.

## Como o comparativo é calculado

- **Amostra**: % de cada peneira da amostra ligada ao contrato (TB_CONTRATO_AMOSTRA / TB_BLEND_CLASSIFICACAO). Mais de uma amostra → média.
- **Entrada**: % ponderado pelo volume de cada lote: `soma(sacas do lote × % peneira) / soma(sacas)`
  (tb_gc_entra → tb_lote_classificacao). Somar os percentuais dos lotes, como no .pbix, distorce o resultado.
- Cada classificação é ajustada para fechar 100% (lotes que somam menos aparecem marcados).
- **Diferença** = % entrada − % amostra (pontos percentuais).
- **Aderência** = 100 − metade da soma das diferenças absolutas = % do volume que entrou dentro do padrão da amostra.
- Por fornecedor: amostra ponderada pela quantidade contratada, entrada pelo volume entregue.
- Só contratos de compra (`tipo = 0`). Por padrão só entram contratos que têm amostra **e** entrada.

## Relatório 2: GS – café despejado × resultado

- **Despejado**: lotes de entrada da guia (tb_gs_lote_entrada) com a classificação por peneira de cada lote, ponderada pelas sacas.
  Lote despejado que saiu de outra GS (sem classificação por peneira) entra pelo tipo de produto dele.
- **Resultado**: lotes de saída da guia (tb_gs_lote_saida) pelo tipo de produto (TB_TIPO_PRODUTO).
- Peneira e tipo de produto são levados para os mesmos **grupos** (17/18, 16, 15, 14, 13 e menores, Moka, Catação/Escolha/Grinders, Fundo, Resíduo/Perdas).
  O mapa fica em `config/mapeamento-gs.json` – a aba "Tipos de produto" mostra como cada tipo foi ligado.
- Tipos que cobrem várias peneiras (14/16, 15/18...) são divididos entre esses grupos na proporção do café despejado da guia.
- Sacas esperadas = sacas despejadas × % do grupo. Rendimento = resultado ÷ despejado. Aderência = 100 − metade da soma das diferenças.

## Relatório 3: Comprado × Vendido por peneira

- **Base contratado**: sacas do contrato × % de cada peneira da amostra do contrato. Compra = contratos `tipo = 0`; venda = demais contratos.
- **Base físico**: lotes que entraram nos contratos de compra (tb_gc_entra) × lotes vinculados aos contratos de venda (TB_CONTRATO_LOTEDESPEJO), cada um com a sua classificação.
- **Vendido por tipo de produto**: a venda pode ser vista pelo tipo de produto dos lotes vendidos (TB_TIPO_PRODUTO). Aí compra (peneira) e venda (tipo) vão para os grupos de `config/mapeamento-gs.json`, os mesmos do relatório de GS.
- **Saldo** = comprado − vendido por peneira. Abas: por peneira, por mês (com saldo acumulado), fornecedores × clientes e contratos.

## Relatório 4: Lucro por lote vendido

- Lotes vendidos = lotes em TB_CONTRATO_LOTEDESPEJO de contratos de venda (`tipo <> 0`); preço de venda do contrato.
- Cada lote volta pelas guias de serviço e transferências até as GR (tb_gc_entra), igual à procedure `Node_RastreabilidadeLote` do WMS.
- Custo/saca = média dos preços dos contratos de compra das GR, pesada pela parte de cada GR no lote (rateio por volume).
- Lucro = (preço de venda − custo/saca) × sacas do lote.
- A coluna de preço de `tb_contrato_cv` é achada sozinha; para fixar, ponha `PRECO_COLUNA=<nome>` no `.env`.

## Acessos por usuário

- Cada usuário só vê no menu (e só consegue abrir) os relatórios liberados para ele.
- Administradores (`ADMIN_USUARIOS=ADM` no `.env`, pode ter vários separados por vírgula) veem tudo e têm o menu **⚙ Acessos**:
  uma tabela com os usuários da TB_USUARIO e uma caixinha por relatório. Marcou, salvou.
- As liberações ficam em `config/acessos.json` (não altera o banco).
- Relatório novo: inclua em `src/acessos.js` (lista RELATORIOS) com o prefixo da API dele.

## Publicar na Vercel

O projeto já está pronto para a Vercel (Express sem configuração). Resumo:

1. Crie conta em vercel.com e instale a CLI: `npm i -g vercel`, depois `vercel login`.
2. Na pasta do projeto: `vercel` (primeira vez, cria o projeto) e depois `vercel --prod`.
3. Em **Project → Settings → Environment Variables** cadastre: `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`,
   `SESSION_SECRET`, `USER_TABLE`, `USER_COL_LOGIN`, `USER_COL_SENHA`, `USER_COL_NOME`, `USER_COL_ATIVO`, `USER_ATIVO_VALOR`,
   `PASSWORD_MODE`, `ADMIN_USUARIOS`, `DOLAR` (os mesmos valores do `.env`). Depois rode `vercel --prod` de novo.
4. **Firewall do Azure SQL**: a Vercel não tem IP fixo no plano grátis. É preciso liberar o acesso no firewall do servidor SQL
   (ou usar um plano da Vercel com IP fixo e liberar só esse IP).

Diferenças na Vercel: a sessão fica num cookie assinado; as liberações de acesso ficam na tabela `BI_ACESSOS`
(criada sozinha no banco na primeira vez); o `explorar.txt` não é gerado.

## Enviar para o GitHub

Duplo clique em **subir-git.bat**. Na primeira vez ele cria o repositório, pergunta nome/e-mail e o endereço do repositório
(crie um **privado** e vazio em github.com/new). Depois é só rodar de novo a cada alteração.
O `.env` (senha do banco) nunca é enviado. Ligando o repositório na Vercel (Add New → Project → Import), cada envio publica sozinho.

## Estrutura

```
server.js                      servidor, login, rotas
src/auth.js                    validação do login na tb_usuario
src/fontes.js                  consultas SQL (com cache de alguns minutos)
src/relatorios/comparativo.js  cálculos do relatório
public/js/app.js               menu, gráficos, formatação
public/js/rel-comparativo.js   tela do relatório
scripts/descobrir-usuario.js   descobre colunas e formato de senha
```

Novo relatório: crie `src/relatorios/xxx.js` + rota em `server.js` e `public/js/rel-xxx.js` com `BI.registrar({...})`, e inclua o script no `index.html`. Ele aparece sozinho no menu.
