/* =====================================================================
   Procedure : dbo.Node_RastreabilidadeLote
   Módulo    : WMS - Relatórios - Rastreabilidade de lote

   Mostra o caminho de um lote nos dois sentidos:

     IDA   (para onde foi)   : lote -> transferência -> lote novo -> ...
                               lote -> guia de serviço -> lotes resultado -> ...
                               lote -> embarque (fim)
     VOLTA (de onde veio)    : lote <- transferência <- lote de origem <- ...
                               lote <- guia de serviço <- lotes que entraram <- ...
                               lote <- guia de entrada (fim)

   ---------------------------------------------------------------------
   PROPORCIONALIDADE
   ---------------------------------------------------------------------
   Cada linha leva uma "Fracao":

     IDA  : quanto do lote daquela linha é material do lote pesquisado.
            Ex.: o lote A (100) entrou numa guia de serviço junto com o B
            (300). A participação de A na guia é 100/400 = 25%. Se a guia
            gerou o lote C com 200, então 25% de C (50) é de A.

     VOLTA: quanto do lote pesquisado veio daquela origem.
            Ex.: o lote C (200) saiu de uma guia em que entraram A (100) e
            B (300). 25% de C veio de A e 75% de B.

   VolumeRastreado = volume do lote pesquisado que passou por aquela linha.
   SaldoRastreado  = (ida) do saldo atual do lote daquela linha, quanto é
                     material do lote pesquisado — o que ainda está em
                     estoque.

   Transferência: Fracao do lote novo = Fracao do lote usado × volume
   transferido / volume inicial do lote novo (um lote novo pode receber de
   mais de um lote).

   ---------------------------------------------------------------------
   PARÂMETROS
   ---------------------------------------------------------------------
     @IDLote      id do tb_lote (tem preferência)
     @NumeroLote  número do lote, se não souber o id
     @Sentido     'I' = só ida | 'V' = só volta | 'A' = os dois (padrão)
     @MaxNivel    profundidade máxima (padrão 30)
     @MaxLinhas   trava contra explosão de linhas (padrão 5000)

   ---------------------------------------------------------------------
   RESULTADOS
   ---------------------------------------------------------------------
     1) o lote pesquisado + totais
     2) as linhas do rastro, já na ordem de árvore (coluna Ordem)
     3) o rastro AGRUPADO por movimento + documento (guia) + lote: o mesmo
        lote alcançado por vários caminhos vira uma linha só, com os
        volumes e as porcentagens somados
     4) RESUMO DE ORIGEM: quanto do lote pesquisado veio de cada guia de
        entrada (GR) e de cada produtor, proporcional

   Produtor: toda guia tem IDDomicilio (TB_DOMICILIO -> TB_PESSOA). Na
   transferência (GT) há também o IDDomicilioNovo: o domicílio para onde
   o lote foi — aparece em ProdutorNovo / DomicilioNovo.

   @Sentido = 'O' (só origem) é o mesmo que 'V': a volta é que leva às
   guias de entrada; a tela é que mostra só o resumo.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.Node_RastreabilidadeLote
    @IDLote      INT          = NULL,
    @NumeroLote  VARCHAR(50)  = NULL,
    @Sentido     CHAR(1)      = 'A',
    @MaxNivel    INT          = 30,
    @MaxLinhas   INT          = 5000
AS
BEGIN
    SET NOCOUNT ON;

    SET @Sentido    = UPPER(ISNULL(NULLIF(LTRIM(RTRIM(@Sentido)), ''), 'A'));
    SET @NumeroLote = NULLIF(LTRIM(RTRIM(@NumeroLote)), '');
    IF @MaxNivel  IS NULL OR @MaxNivel  < 1 SET @MaxNivel  = 30;
    IF @MaxLinhas IS NULL OR @MaxLinhas < 1 SET @MaxLinhas = 5000;

    IF @Sentido NOT IN ('I', 'V', 'A', 'O')
    BEGIN
        RAISERROR('Sentido inválido. Use I (ida), V (volta), A (os dois) ou O (só origem).', 16, 1);
        RETURN;
    END
    IF @Sentido = 'O' SET @Sentido = 'V';

    -- ---------------------------------------------------------------
    -- Acha o lote
    -- ---------------------------------------------------------------
    IF @IDLote IS NULL AND @NumeroLote IS NOT NULL
    BEGIN
        DECLARE @qtd INT = (SELECT COUNT(*) FROM tb_lote
                            WHERE LTRIM(RTRIM(Numero)) = @NumeroLote);
        IF @qtd > 1
        BEGIN
            RAISERROR('Existe mais de um lote com o número %s. Escolha o lote pela lista.', 16, 1, @NumeroLote);
            RETURN;
        END
        SELECT @IDLote = id FROM tb_lote WHERE LTRIM(RTRIM(Numero)) = @NumeroLote;
    END

    IF @IDLote IS NULL OR NOT EXISTS (SELECT 1 FROM tb_lote WHERE id = @IDLote)
    BEGIN
        RAISERROR('Lote não encontrado.', 16, 1);
        RETURN;
    END

    DECLARE @VolRaiz DECIMAL(18, 4) =
        (SELECT ISNULL(VolumeInicial, 0) FROM tb_lote WHERE id = @IDLote);

    -- ---------------------------------------------------------------
    -- Tabela do rastro
    -- ---------------------------------------------------------------
    CREATE TABLE #r (
        Seq               INT IDENTITY(1, 1) PRIMARY KEY,
        SeqPai            INT            NULL,
        Sentido           CHAR(1)        NOT NULL,   -- I / V
        Nivel             INT            NOT NULL,
        Movimento         VARCHAR(20)    NOT NULL,   -- LOTE, ENTRADA, TRANSFERENCIA, SERVICO, EMBARQUE
        IDDocumento       INT            NULL,
        Documento         VARCHAR(50)    NULL,       -- nº da guia / transferência / embarque
        DataDocumento     DATETIME       NULL,
        IDLoteAnterior    INT            NULL,       -- o lote de onde esta linha parte
        LoteAnterior      VARCHAR(50)    NULL,
        IDLote            INT            NULL,       -- o lote a que esta linha chega
        Lote              VARCHAR(50)    NULL,
        VolumeMovimento   DECIMAL(18, 4) NULL,       -- volume da linha do movimento
        VolumeEntradaGuia DECIMAL(18, 4) NULL,       -- serviço: volume do lote que entrou
        TotalEntradaGuia  DECIMAL(18, 4) NULL,       -- serviço: soma de tudo que entrou na guia
        Proporcao         FLOAT          NULL,       -- serviço: participação do lote na guia (0..1)
        Fracao            FLOAT          NOT NULL,   -- ver cabeçalho
        VolumeRastreado   DECIMAL(18, 4) NULL,
        SaldoLote         DECIMAL(18, 4) NULL,
        SaldoRastreado    DECIMAL(18, 4) NULL,
        Expandir          BIT            NOT NULL DEFAULT 0,
        Ciclo             BIT            NOT NULL DEFAULT 0,
        Caminho           VARCHAR(4000)  NOT NULL,   -- ,id,id, — impede andar em círculo
        Ordem             VARCHAR(2000)  NOT NULL DEFAULT '',
        IDDomicilio       INT            NULL,       -- domicílio da guia (produtor)
        Produtor          VARCHAR(200)   NULL,
        Domicilio         VARCHAR(200)   NULL,
        IDDomicilioNovo   INT            NULL,       -- GT: domicílio para onde foi
        ProdutorNovo      VARCHAR(200)   NULL,
        DomicilioNovo     VARCHAR(200)   NULL
    );

    -- volume em lote novo: parte que uma linha representa do lote (0..1)
    -- (sem volume inicial, considera o lote inteiro)

    -- ---------------------------------------------------------------
    -- Raízes
    -- ---------------------------------------------------------------
    INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDLote, Lote, DataDocumento,
                    VolumeMovimento, Fracao, VolumeRastreado, SaldoLote, SaldoRastreado,
                    Expandir, Caminho)
    SELECT NULL, s.Sentido, 0, 'LOTE', l.id, l.Numero, l.Data,
           l.VolumeInicial, 1, l.VolumeInicial, l.Volume,
           CASE WHEN s.Sentido = 'I' THEN l.Volume END,
           1, ',' + CAST(l.id AS VARCHAR(12)) + ','
    FROM tb_lote l
    CROSS JOIN (SELECT 'I' AS Sentido UNION ALL SELECT 'V') s
    WHERE l.id = @IDLote
      AND (@Sentido = 'A' OR @Sentido = s.Sentido);

    UPDATE #r SET Ordem = RIGHT('0000000' + CAST(Seq AS VARCHAR(10)), 7) WHERE Nivel = 0;

    DECLARE @nivel INT = 0, @truncado BIT = 0;

    WHILE @nivel < @MaxNivel
          AND EXISTS (SELECT 1 FROM #r WHERE Nivel = @nivel AND Expandir = 1)
    BEGIN
        -- =============================================================
        -- IDA
        -- =============================================================

        -- Transferência: o lote foi usado e gerou um lote novo
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, IDLote, Lote, VolumeMovimento,
                        Fracao, VolumeRastreado, SaldoLote, SaldoRastreado, Expandir, Ciclo, Caminho)
        SELECT p.Seq, 'I', @nivel + 1, 'TRANSFERENCIA', c.id, c.Numero, c.Data,
               p.IDLote, p.Lote, ln.id, ln.Numero, tl.Volume,
               x.Fracao,
               p.Fracao * tl.Volume,
               ln.Volume,
               x.Fracao * ln.Volume,
               CASE WHEN CHARINDEX(',' + CAST(ln.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 0 ELSE 1 END,
               CASE WHEN CHARINDEX(',' + CAST(ln.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 1 ELSE 0 END,
               p.Caminho + CAST(ln.id AS VARCHAR(12)) + ','
        FROM #r p
        -- várias linhas do mesmo lote na mesma transferência: soma numa só
        INNER JOIN (SELECT IDCab, IDLote, IDLoteNovo, SUM(ISNULL(Volume, 0)) AS Volume
                     FROM tb_trans_lote
                     GROUP BY IDCab, IDLote, IDLoteNovo) tl
                    ON tl.IDLote = p.IDLote
        INNER JOIN tb_cab_trans c   ON c.id = tl.IDCab
        INNER JOIN tb_lote ln       ON ln.id = tl.IDLoteNovo
        CROSS APPLY (SELECT p.Fracao *
                       CASE WHEN ISNULL(ln.VolumeInicial, 0) <= 0 OR tl.Volume >= ln.VolumeInicial THEN 1.0
                            ELSE CAST(tl.Volume AS FLOAT) / CAST(ln.VolumeInicial AS FLOAT) END AS Fracao) x
        WHERE p.Sentido = 'I' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- Guia de serviço: o lote entrou na guia; os lotes resultado levam a
        -- parte proporcional dele
        ;WITH ent AS (
            SELECT IDGuiaServico, IDLote, SUM(ISNULL(Volume, 0)) AS Volume
            FROM TB_GS_LOTE_ENTRADA
            GROUP BY IDGuiaServico, IDLote
        ), tot AS (
            SELECT IDGuiaServico, SUM(Volume) AS Total, COUNT(*) AS Qtd
            FROM ent GROUP BY IDGuiaServico
        ), sai AS (
            -- Numero no agrupamento: lote resultado ainda sem IDLote não se
            -- mistura com outro na mesma linha
            SELECT IDGuiaServico, IDLote, MAX(Numero) AS Numero, SUM(ISNULL(Volume, 0)) AS Volume
            FROM TB_GS_LOTE_SAIDA
            GROUP BY IDGuiaServico, IDLote, CASE WHEN IDLote IS NULL THEN Numero END
        )
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, IDLote, Lote, VolumeMovimento,
                        VolumeEntradaGuia, TotalEntradaGuia, Proporcao,
                        Fracao, VolumeRastreado, SaldoLote, SaldoRastreado, Expandir, Ciclo, Caminho)
        SELECT p.Seq, 'I', @nivel + 1, 'SERVICO', g.id, g.Numero, g.Data,
               p.IDLote, p.Lote, lo.id, ISNULL(lo.Numero, s.Numero), s.Volume,
               e.Volume, t.Total, pr.Proporcao,
               x.Fracao,
               p.Fracao * pr.Proporcao * s.Volume,
               lo.Volume,
               x.Fracao * lo.Volume,
               CASE WHEN lo.id IS NULL THEN 0
                    WHEN CHARINDEX(',' + CAST(lo.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 0 ELSE 1 END,
               CASE WHEN lo.id IS NOT NULL
                     AND CHARINDEX(',' + CAST(lo.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 1 ELSE 0 END,
               p.Caminho + ISNULL(CAST(lo.id AS VARCHAR(12)), '0') + ','
        FROM #r p
        INNER JOIN ent e             ON e.IDLote = p.IDLote
        INNER JOIN tot t             ON t.IDGuiaServico = e.IDGuiaServico
        INNER JOIN TB_GUIA_SERVICO g ON g.id = e.IDGuiaServico
        INNER JOIN sai s             ON s.IDGuiaServico = e.IDGuiaServico
        LEFT  JOIN tb_lote lo        ON lo.id = s.IDLote
        CROSS APPLY (SELECT CASE WHEN t.Total > 0 THEN CAST(e.Volume AS FLOAT) / CAST(t.Total AS FLOAT)
                                 ELSE 1.0 / t.Qtd END AS Proporcao) pr
        CROSS APPLY (SELECT p.Fracao * pr.Proporcao *
                       CASE WHEN ISNULL(lo.VolumeInicial, 0) <= 0 OR s.Volume >= lo.VolumeInicial THEN 1.0
                            ELSE CAST(s.Volume AS FLOAT) / CAST(lo.VolumeInicial AS FLOAT) END AS Fracao) x
        WHERE p.Sentido = 'I' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- Guia de serviço que ainda não gerou lote resultado: aparece mesmo
        -- assim, para a pessoa saber que o lote está lá dentro
        ;WITH ent AS (
            SELECT IDGuiaServico, IDLote, SUM(ISNULL(Volume, 0)) AS Volume
            FROM TB_GS_LOTE_ENTRADA
            GROUP BY IDGuiaServico, IDLote
        ), tot AS (
            SELECT IDGuiaServico, SUM(Volume) AS Total, COUNT(*) AS Qtd
            FROM ent GROUP BY IDGuiaServico
        )
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, VolumeMovimento,
                        VolumeEntradaGuia, TotalEntradaGuia, Proporcao,
                        Fracao, VolumeRastreado, Expandir, Caminho)
        SELECT p.Seq, 'I', @nivel + 1, 'SERVICO', g.id, g.Numero, g.Data,
               p.IDLote, p.Lote, e.Volume,
               e.Volume, t.Total,
               CASE WHEN t.Total > 0 THEN CAST(e.Volume AS FLOAT) / CAST(t.Total AS FLOAT) ELSE 1.0 / t.Qtd END,
               p.Fracao, p.Fracao * e.Volume, 0, p.Caminho
        FROM #r p
        INNER JOIN ent e             ON e.IDLote = p.IDLote
        INNER JOIN tot t             ON t.IDGuiaServico = e.IDGuiaServico
        INNER JOIN TB_GUIA_SERVICO g ON g.id = e.IDGuiaServico
        WHERE p.Sentido = 'I' AND p.Nivel = @nivel AND p.Expandir = 1
          AND NOT EXISTS (SELECT 1 FROM TB_GS_LOTE_SAIDA s WHERE s.IDGuiaServico = e.IDGuiaServico);

        -- Embarque: o lote saiu (fim do caminho)
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, VolumeMovimento,
                        Fracao, VolumeRastreado, Expandir, Caminho)
        SELECT p.Seq, 'I', @nivel + 1, 'EMBARQUE', g.id, g.Numero, g.Data,
               p.IDLote, p.Lote, gs.Volume,
               p.Fracao, p.Fracao * gs.Volume, 0, p.Caminho
        FROM #r p
        -- várias linhas do mesmo lote no mesmo embarque: soma numa só
        INNER JOIN (SELECT IDGSBX, IDLote, SUM(ISNULL(Volume, 0)) AS Volume
                    FROM TB_GSBX_SAIDA
                    GROUP BY IDGSBX, IDLote) gs ON gs.IDLote = p.IDLote
        INNER JOIN TB_GSBX g        ON g.id = gs.IDGSBX
        WHERE p.Sentido = 'I' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- =============================================================
        -- VOLTA
        -- =============================================================

        -- Guia de entrada que gerou o lote (fim do caminho)
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, Lote, VolumeMovimento,
                        Fracao, VolumeRastreado, Expandir, Caminho)
        SELECT p.Seq, 'V', @nivel + 1, 'ENTRADA', g.id, g.Numero, g.Data,
               p.IDLote, p.Lote, ge.Numero, ge.Volume,
               x.Fracao, x.Fracao * @VolRaiz, 0, p.Caminho
        FROM #r p
        INNER JOIN tb_lote lx      ON lx.id = p.IDLote
        -- várias desdobras da mesma guia no mesmo lote: soma numa só
        -- (o número mostra a primeira desdobra e quantas mais tem)
        INNER JOIN (SELECT IDGCI, IDLote, SUM(ISNULL(Volume, 0)) AS Volume,
                           CASE WHEN COUNT(*) > 1
                                THEN CAST(MIN(Numero) AS VARCHAR(50)) + ' (+' + CAST(COUNT(*) - 1 AS VARCHAR(10)) + ')'
                                ELSE CAST(MIN(Numero) AS VARCHAR(50)) END AS Numero
                    FROM tb_gc_entra
                    WHERE IDLote IS NOT NULL
                    GROUP BY IDGCI, IDLote) ge ON ge.IDLote = p.IDLote
        INNER JOIN tb_gci g        ON g.id = ge.IDGCI
        CROSS APPLY (SELECT p.Fracao *
                       CASE WHEN ISNULL(lx.VolumeInicial, 0) <= 0 OR ge.Volume >= lx.VolumeInicial THEN 1.0
                            ELSE CAST(ge.Volume AS FLOAT) / CAST(lx.VolumeInicial AS FLOAT) END AS Fracao) x
        WHERE p.Sentido = 'V' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- Transferência que gerou o lote: volta para o lote usado
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, IDLote, Lote, VolumeMovimento,
                        Fracao, VolumeRastreado, SaldoLote, Expandir, Ciclo, Caminho)
        SELECT p.Seq, 'V', @nivel + 1, 'TRANSFERENCIA', c.id, c.Numero, c.Data,
               p.IDLote, p.Lote, l.id, l.Numero, tl.Volume,
               x.Fracao, x.Fracao * @VolRaiz, l.Volume,
               CASE WHEN CHARINDEX(',' + CAST(l.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 0 ELSE 1 END,
               CASE WHEN CHARINDEX(',' + CAST(l.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 1 ELSE 0 END,
               p.Caminho + CAST(l.id AS VARCHAR(12)) + ','
        FROM #r p
        INNER JOIN tb_lote lx       ON lx.id = p.IDLote
        -- várias linhas do mesmo lote na mesma transferência: soma numa só
        INNER JOIN (SELECT IDCab, IDLote, IDLoteNovo, SUM(ISNULL(Volume, 0)) AS Volume
                     FROM tb_trans_lote
                     GROUP BY IDCab, IDLote, IDLoteNovo) tl
                    ON tl.IDLoteNovo = p.IDLote
        INNER JOIN tb_cab_trans c   ON c.id = tl.IDCab
        INNER JOIN tb_lote l        ON l.id = tl.IDLote
        CROSS APPLY (SELECT p.Fracao *
                       CASE WHEN ISNULL(lx.VolumeInicial, 0) <= 0 OR tl.Volume >= lx.VolumeInicial THEN 1.0
                            ELSE CAST(tl.Volume AS FLOAT) / CAST(lx.VolumeInicial AS FLOAT) END AS Fracao) x
        WHERE p.Sentido = 'V' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- Guia de serviço que gerou o lote: volta para cada lote que entrou,
        -- na proporção em que entrou
        ;WITH ent AS (
            SELECT IDGuiaServico, IDLote, SUM(ISNULL(Volume, 0)) AS Volume
            FROM TB_GS_LOTE_ENTRADA
            GROUP BY IDGuiaServico, IDLote
        ), tot AS (
            SELECT IDGuiaServico, SUM(Volume) AS Total, COUNT(*) AS Qtd
            FROM ent GROUP BY IDGuiaServico
        ), sai AS (
            SELECT IDGuiaServico, IDLote, SUM(ISNULL(Volume, 0)) AS Volume
            FROM TB_GS_LOTE_SAIDA
            GROUP BY IDGuiaServico, IDLote
        )
        INSERT INTO #r (SeqPai, Sentido, Nivel, Movimento, IDDocumento, Documento, DataDocumento,
                        IDLoteAnterior, LoteAnterior, IDLote, Lote, VolumeMovimento,
                        VolumeEntradaGuia, TotalEntradaGuia, Proporcao,
                        Fracao, VolumeRastreado, SaldoLote, Expandir, Ciclo, Caminho)
        SELECT p.Seq, 'V', @nivel + 1, 'SERVICO', g.id, g.Numero, g.Data,
               p.IDLote, p.Lote, l.id, l.Numero, e.Volume,
               e.Volume, t.Total, pr.Proporcao,
               x.Fracao, x.Fracao * @VolRaiz, l.Volume,
               CASE WHEN CHARINDEX(',' + CAST(l.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 0 ELSE 1 END,
               CASE WHEN CHARINDEX(',' + CAST(l.id AS VARCHAR(12)) + ',', p.Caminho) > 0 THEN 1 ELSE 0 END,
               p.Caminho + CAST(l.id AS VARCHAR(12)) + ','
        FROM #r p
        INNER JOIN tb_lote lx        ON lx.id = p.IDLote
        INNER JOIN sai s             ON s.IDLote = p.IDLote
        INNER JOIN TB_GUIA_SERVICO g ON g.id = s.IDGuiaServico
        INNER JOIN ent e             ON e.IDGuiaServico = s.IDGuiaServico
        INNER JOIN tot t             ON t.IDGuiaServico = s.IDGuiaServico
        INNER JOIN tb_lote l         ON l.id = e.IDLote
        CROSS APPLY (SELECT CASE WHEN t.Total > 0 THEN CAST(e.Volume AS FLOAT) / CAST(t.Total AS FLOAT)
                                 ELSE 1.0 / t.Qtd END AS Proporcao) pr
        CROSS APPLY (SELECT p.Fracao * pr.Proporcao *
                       CASE WHEN ISNULL(lx.VolumeInicial, 0) <= 0 OR s.Volume >= lx.VolumeInicial THEN 1.0
                            ELSE CAST(s.Volume AS FLOAT) / CAST(lx.VolumeInicial AS FLOAT) END AS Fracao) x
        WHERE p.Sentido = 'V' AND p.Nivel = @nivel AND p.Expandir = 1;

        -- -------------------------------------------------------------
        -- ordem de árvore dos filhos deste nível
        -- -------------------------------------------------------------
        UPDATE r
           SET Ordem = p.Ordem + '.' + RIGHT('0000000' + CAST(r.Seq AS VARCHAR(10)), 7)
        FROM #r r
        INNER JOIN #r p ON p.Seq = r.SeqPai
        WHERE r.Nivel = @nivel + 1;

        IF (SELECT COUNT(*) FROM #r) > @MaxLinhas
        BEGIN
            SET @truncado = 1;
            BREAK;
        END

        SET @nivel += 1;
    END

    -- chegou no limite de níveis com coisa ainda para abrir
    IF @truncado = 0 AND EXISTS (SELECT 1 FROM #r WHERE Nivel = @nivel AND Expandir = 1 AND Nivel >= @MaxNivel)
        SET @truncado = 1;

    -- ---------------------------------------------------------------
    -- Produtor / domicílio de cada guia
    -- ---------------------------------------------------------------
    UPDATE r SET IDDomicilio = x.IDDomicilio
    FROM #r r INNER JOIN tb_gci x ON x.id = r.IDDocumento
    WHERE r.Movimento = 'ENTRADA';

    UPDATE r SET IDDomicilio = x.IDDomicilio
    FROM #r r INNER JOIN TB_GUIA_SERVICO x ON x.id = r.IDDocumento
    WHERE r.Movimento = 'SERVICO';

    UPDATE r SET IDDomicilio = x.IDDomicilio
    FROM #r r INNER JOIN TB_GSBX x ON x.id = r.IDDocumento
    WHERE r.Movimento = 'EMBARQUE';

    UPDATE r SET IDDomicilio = x.IDDomicilio, IDDomicilioNovo = x.IDDomicilioNovo
    FROM #r r INNER JOIN tb_cab_trans x ON x.id = r.IDDocumento
    WHERE r.Movimento = 'TRANSFERENCIA';

    UPDATE r SET Produtor = p.Nome, Domicilio = d.Nome
    FROM #r r
    INNER JOIN TB_DOMICILIO d ON d.id = r.IDDomicilio
    LEFT  JOIN TB_PESSOA p    ON p.id = d.IDPessoa;

    UPDATE r SET ProdutorNovo = p.Nome, DomicilioNovo = d.Nome
    FROM #r r
    INNER JOIN TB_DOMICILIO d ON d.id = r.IDDomicilioNovo
    LEFT  JOIN TB_PESSOA p    ON p.id = d.IDPessoa;

    -- ---------------------------------------------------------------
    -- 1) o lote pesquisado + totais
    -- ---------------------------------------------------------------
    SELECT l.id                AS IDLote,
           l.Numero            AS Lote,
           l.Data              AS Data,
           l.VolumeInicial     AS VolumeInicial,
           l.Volume            AS Saldo,
           (SELECT SUM(VolumeRastreado) FROM #r WHERE Sentido = 'I' AND Movimento = 'EMBARQUE') AS TotalEmbarcado,
           (SELECT SUM(SaldoRastreado)  FROM #r WHERE Sentido = 'I' AND IDLote IS NOT NULL
                                          AND Ciclo = 0)                                        AS TotalEmEstoque,
           (SELECT SUM(VolumeRastreado) FROM #r WHERE Sentido = 'I' AND Movimento = 'SERVICO'
                                          AND IDLote IS NULL)                                   AS TotalEmServico,
           (SELECT SUM(VolumeRastreado) FROM #r WHERE Sentido = 'V' AND Movimento = 'ENTRADA') AS TotalOrigemEntradas,
           (SELECT COUNT(*) FROM #r)                                                            AS Linhas,
           @truncado                                                                            AS Truncado
    FROM tb_lote l
    WHERE l.id = @IDLote;

    -- ---------------------------------------------------------------
    -- 2) o rastro
    -- ---------------------------------------------------------------
    SELECT Seq, SeqPai, Sentido, Nivel, Movimento,
           IDDocumento, Documento, DataDocumento,
           IDLoteAnterior, LoteAnterior, IDLote, Lote,
           VolumeMovimento, VolumeEntradaGuia, TotalEntradaGuia,
           CAST(Proporcao * 100 AS DECIMAL(9, 4))   AS ProporcaoPct,
           CAST(Fracao * 100 AS DECIMAL(9, 4))      AS FracaoPct,
           VolumeRastreado, SaldoLote, SaldoRastreado,
           Ciclo, Ordem,
           IDDomicilio, Produtor, Domicilio, IDDomicilioNovo, ProdutorNovo, DomicilioNovo
    FROM #r
    ORDER BY CASE Sentido WHEN 'V' THEN 0 ELSE 1 END, Ordem;

    -- ---------------------------------------------------------------
    -- 3) agrupado por guia + lote
    --
    -- Somar é o certo: cada caminho até um lote leva uma parte diferente
    -- do lote pesquisado, e as partes se somam. A porcentagem fica limitada
    -- a 100% só por arredondamento.
    -- ---------------------------------------------------------------
    SELECT g.Sentido, g.Nivel, g.Movimento,
           g.IDDocumento, g.Documento, g.DataDocumento,
           g.IDLote, g.Lote,
           STUFF((
               SELECT DISTINCT ', ' + r2.LoteAnterior
               FROM #r r2
               WHERE r2.Sentido = g.Sentido
                 AND r2.Movimento = g.Movimento
                 AND ISNULL(r2.IDDocumento, -1) = ISNULL(g.IDDocumento, -1)
                 AND ISNULL(r2.IDLote, -1) = ISNULL(g.IDLote, -1)
                 AND ISNULL(r2.Lote, '') = ISNULL(g.Lote, '')
                 AND r2.LoteAnterior IS NOT NULL
               FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS LotesAnteriores,
           g.VolumeMovimento,
           CAST(CASE WHEN g.Fracao > 1 THEN 100 ELSE g.Fracao * 100 END AS DECIMAL(9, 4)) AS FracaoPct,
           g.VolumeRastreado, g.SaldoLote, g.SaldoRastreado,
           g.Caminhos, g.Ciclo,
           g.IDDomicilio, g.Produtor, g.Domicilio, g.IDDomicilioNovo, g.ProdutorNovo, g.DomicilioNovo
    FROM (
        SELECT Sentido, Movimento, IDDocumento, Documento, DataDocumento, IDLote, Lote,
               IDDomicilio, Produtor, Domicilio, IDDomicilioNovo, ProdutorNovo, DomicilioNovo,
               MIN(Nivel)                   AS Nivel,
               MAX(VolumeMovimento)         AS VolumeMovimento,
               SUM(CASE WHEN Ciclo = 1 THEN 0 ELSE Fracao END)          AS Fracao,
               SUM(CASE WHEN Ciclo = 1 THEN 0 ELSE VolumeRastreado END) AS VolumeRastreado,
               MAX(SaldoLote)               AS SaldoLote,
               SUM(CASE WHEN Ciclo = 1 THEN 0 ELSE SaldoRastreado END)  AS SaldoRastreado,
               COUNT(*)                     AS Caminhos,
               MAX(CAST(Ciclo AS INT))      AS Ciclo
        FROM #r
        GROUP BY Sentido, Movimento, IDDocumento, Documento, DataDocumento, IDLote, Lote,
                 IDDomicilio, Produtor, Domicilio, IDDomicilioNovo, ProdutorNovo, DomicilioNovo
    ) g
    ORDER BY CASE g.Sentido WHEN 'V' THEN 0 ELSE 1 END, g.Nivel, g.DataDocumento, g.Documento, g.Lote;

    -- ---------------------------------------------------------------
    -- 4) resumo de origem: GR de entrada + produtor
    --
    --   PctDoLote      quanto do lote pesquisado veio desta GR (0..100)
    --   VolumeOrigem   essa parte sobre o volume inicial do lote
    --   VolumeNoSaldo  essa parte sobre o saldo ATUAL do lote — o que
    --                  existe hoje no lote, proporcional a esta origem
    -- ---------------------------------------------------------------
    DECLARE @Saldo DECIMAL(18, 4) = (SELECT ISNULL(Volume, 0) FROM tb_lote WHERE id = @IDLote);

    SELECT o.IDGuia, o.Guia, o.Data,
           o.IDDomicilio, o.Produtor, o.Domicilio,
           STUFF((
               SELECT DISTINCT ', ' + r2.Lote
               FROM #r r2
               WHERE r2.Sentido = 'V' AND r2.Movimento = 'ENTRADA' AND r2.Ciclo = 0
                 AND r2.IDDocumento = o.IDGuia AND r2.Lote IS NOT NULL
               FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS Desdobras,
           CAST(CASE WHEN o.Fracao > 1 THEN 100 ELSE o.Fracao * 100 END AS DECIMAL(9, 4)) AS PctDoLote,
           CAST(o.Fracao * @VolRaiz AS DECIMAL(18, 4)) AS VolumeOrigem,
           CAST(o.Fracao * @Saldo   AS DECIMAL(18, 4)) AS VolumeNoSaldo,
           o.Caminhos
    FROM (
        SELECT IDDocumento AS IDGuia, Documento AS Guia, DataDocumento AS Data,
               IDDomicilio, Produtor, Domicilio,
               SUM(Fracao) AS Fracao,
               COUNT(*)    AS Caminhos
        FROM #r
        WHERE Sentido = 'V' AND Movimento = 'ENTRADA' AND Ciclo = 0
        GROUP BY IDDocumento, Documento, DataDocumento, IDDomicilio, Produtor, Domicilio
    ) o
    ORDER BY o.Fracao DESC, o.Data, o.Guia;
END
GO

/* ---------------- Exemplos de uso ----------------

-- pelo id do lote, ida e volta
EXEC dbo.Node_RastreabilidadeLote @IDLote = 1234;

-- pelo número, só para onde foi
EXEC dbo.Node_RastreabilidadeLote @NumeroLote = 'GR000026/1', @Sentido = 'I';

-- só de onde veio
EXEC dbo.Node_RastreabilidadeLote @IDLote = 1234, @Sentido = 'V';
*/
