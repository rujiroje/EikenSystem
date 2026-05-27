-- =============================================================================
-- V001: Cleanup orphaned camelCase columns in [product] table
--
-- WHY:  @Column(name = ...) ใน Product.java เคยใช้ชื่อ camelCase ผิด
--       Hibernate (ddl-auto: update) จึงสร้าง column ชื่อ camelCase ทิ้งไว้
--       หลังจาก fix @Column ให้ถูก Hibernate สร้าง snake_case ใหม่โดยไม่ลบเก่า
--
-- RUN:  รัน หลัง restart Spring Boot ครั้งแรก
--       (เพื่อให้ Hibernate สร้าง column snake_case ก่อน)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: ดูสภาพข้อมูลก่อน (run แล้ว verify ก่อน step 2)
-- -----------------------------------------------------------------------------
SELECT
    product_code,
    -- old (camelCase) columns
    weighingMode,
    doubleWeighingTolerance,
    innerNumberingMode,
    standardWeight1,
    standardWeight2,
    -- new (snake_case) columns
    weighing_mode,
    double_weighing_tolerance,
    inner_numbering_mode,
    standard_weight1,
    standard_weight2
FROM product;

-- -----------------------------------------------------------------------------
-- STEP 2: ย้ายข้อมูลจาก column เก่า → column ใหม่ (กันข้อมูลสูญหาย)
--         COALESCE: ถ้า snake_case มีค่าอยู่แล้วให้คงไว้ ถ้าไม่มีให้ใช้ค่าจาก camelCase
-- -----------------------------------------------------------------------------
UPDATE product
SET
    weighing_mode             = COALESCE(weighing_mode,             weighingMode),
    double_weighing_tolerance = COALESCE(double_weighing_tolerance, doubleWeighingTolerance),
    inner_numbering_mode      = COALESCE(inner_numbering_mode,      innerNumberingMode),
    standard_weight1          = COALESCE(standard_weight1,          standardWeight1),
    standard_weight2          = COALESCE(standard_weight2,          standardWeight2);

-- ตั้งค่า default ให้แถวที่ยังไม่มีค่า (backward-compat กับข้อมูลเก่าก่อนมี DOUBLE mode)
UPDATE product
SET
    weighing_mode        = 'SINGLE'     WHERE weighing_mode        IS NULL;
UPDATE product
SET
    inner_numbering_mode = 'CONTINUOUS' WHERE inner_numbering_mode IS NULL;

-- -----------------------------------------------------------------------------
-- STEP 3: verify ก่อน drop — ค่าควร match กัน ไม่มีแถวที่ snake_case ยัง NULL
-- -----------------------------------------------------------------------------
SELECT
    product_code,
    weighing_mode,
    double_weighing_tolerance,
    inner_numbering_mode,
    standard_weight1,
    standard_weight2
FROM product
WHERE weighing_mode IS NULL OR inner_numbering_mode IS NULL;
-- ผลลัพธ์ควรเป็น 0 แถว

-- -----------------------------------------------------------------------------
-- STEP 4: ลบ column camelCase เก่าที่ไม่ได้ใช้แล้ว
-- NOTE:   SQL Server ต้อง drop default constraint ก่อน (ถ้ามี)
--         ถ้า Hibernate ไม่ได้สร้าง named constraint จะ drop ได้เลย
-- -----------------------------------------------------------------------------

-- ลบ default constraint (ถ้ามี) ก่อน drop column
DECLARE @sql NVARCHAR(500);

SELECT @sql = 'ALTER TABLE product DROP CONSTRAINT ' + dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'product' AND c.name = 'weighingMode';
IF @sql IS NOT NULL EXEC(@sql); SET @sql = NULL;

SELECT @sql = 'ALTER TABLE product DROP CONSTRAINT ' + dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'product' AND c.name = 'doubleWeighingTolerance';
IF @sql IS NOT NULL EXEC(@sql); SET @sql = NULL;

SELECT @sql = 'ALTER TABLE product DROP CONSTRAINT ' + dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'product' AND c.name = 'innerNumberingMode';
IF @sql IS NOT NULL EXEC(@sql); SET @sql = NULL;

SELECT @sql = 'ALTER TABLE product DROP CONSTRAINT ' + dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'product' AND c.name = 'standardWeight1';
IF @sql IS NOT NULL EXEC(@sql); SET @sql = NULL;

SELECT @sql = 'ALTER TABLE product DROP CONSTRAINT ' + dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'product' AND c.name = 'standardWeight2';
IF @sql IS NOT NULL EXEC(@sql); SET @sql = NULL;

-- Drop column เก่า
ALTER TABLE product DROP COLUMN weighingMode;
ALTER TABLE product DROP COLUMN doubleWeighingTolerance;
ALTER TABLE product DROP COLUMN innerNumberingMode;
ALTER TABLE product DROP COLUMN standardWeight1;
ALTER TABLE product DROP COLUMN standardWeight2;

-- -----------------------------------------------------------------------------
-- STEP 5: verify schema หลัง cleanup
-- -----------------------------------------------------------------------------
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'product'
ORDER BY ORDINAL_POSITION;
