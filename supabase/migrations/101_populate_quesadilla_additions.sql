-- 101_populate_quesadilla_additions.sql

WITH diamante_format AS (
    SELECT pf.id 
    FROM product_formats pf
    JOIN products p ON p.id = pf.product_id
    WHERE p.name ILIKE '%Diamante%'
    ORDER BY pf.portions ASC -- Try to get the individual format if multiple exist
    LIMIT 1
)
INSERT INTO addition_catalog (supply_id, format_id, name, price, grams, sort_order)
SELECT 
    ac_diamante.supply_id, 
    pf_quesadilla.id AS format_id, 
    ac_diamante.name, 
    ac_diamante.price, 
    ac_diamante.grams, 
    ac_diamante.sort_order
FROM addition_catalog ac_diamante
JOIN diamante_format df ON df.id = ac_diamante.format_id
CROSS JOIN product_formats pf_quesadilla
JOIN products p_quesadilla ON p_quesadilla.id = pf_quesadilla.product_id
WHERE p_quesadilla.name ILIKE '%Quesadilla%'
  AND NOT EXISTS (
      SELECT 1 FROM addition_catalog ac_exist 
      WHERE ac_exist.format_id = pf_quesadilla.id 
        AND ac_exist.supply_id = ac_diamante.supply_id
  );
