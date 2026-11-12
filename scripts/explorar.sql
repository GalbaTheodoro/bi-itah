-- colunas de custo em qualquer tabela
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%custo%' ORDER BY 1, 2
GO
-- colunas da guia de saida, lote e contrato
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_NAME IN ('TB_GSBX','TB_GSBX_SAIDA','tb_lote','tb_contrato_cv','TB_CONTRATO_LOTEDESPEJO','tb_gc_entra')
 ORDER BY TABLE_NAME, ORDINAL_POSITION
GO
-- exemplo guia de saida
SELECT TOP 8 * FROM TB_GSBX ORDER BY id DESC
GO
SELECT TOP 8 * FROM TB_GSBX_SAIDA ORDER BY id DESC
GO
-- exemplo lote GR com custo
SELECT TOP 8 * FROM tb_lote WHERE Numero LIKE 'GR%' ORDER BY id DESC
GO
-- exemplo contratos (compra e venda)
SELECT TOP 6 * FROM tb_contrato_cv WHERE tipo = 0 ORDER BY id DESC
GO
SELECT TOP 6 * FROM tb_contrato_cv WHERE tipo <> 0 ORDER BY id DESC
GO
-- tipos de contrato
SELECT tipo, tipoCadContrato, LEFT(numero, 3) AS prefixo, COUNT(*) AS n FROM tb_contrato_cv GROUP BY tipo, tipoCadContrato, LEFT(numero, 3) ORDER BY n DESC
