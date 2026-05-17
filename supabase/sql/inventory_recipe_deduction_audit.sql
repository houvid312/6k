-- ============================================================
-- 6K Pizza - Auditoria de descuentos por receta/adicion/empaque
-- ============================================================
-- Query no destructiva. Usarla antes o despues del reset para validar
-- que los maestros conservados explican que se descontara del inventario.
-- ============================================================

-- 1) Descuento base por producto/formato con receta de venta.
select
  p.name as product_name,
  pf.name as format_name,
  pf.portions,
  s.name as supply_name,
  ri.grams_per_portion,
  round(ri.grams_per_portion * pf.portions, 2) as grams_deducted_per_unit
from public.products p
join public.product_formats pf on pf.product_id = p.id
join public.recipes r on r.product_id = p.id
join public.recipe_ingredients ri on ri.recipe_id = r.id
join public.supplies s on s.id = ri.supply_id
where p.is_active = true
  and pf.is_active = true
  and p.has_recipe = true
order by p.name, pf.sort_order, s.name;

-- 2) Descuento por adiciones disponibles para cada formato.
select
  p.name as product_name,
  pf.name as format_name,
  ac.name as addition_name,
  s.name as supply_name,
  ac.grams as grams_deducted_per_addition,
  ac.price
from public.addition_catalog ac
join public.product_formats pf on pf.id = ac.format_id
join public.products p on p.id = pf.product_id
join public.supplies s on s.id = ac.supply_id
where ac.is_active = true
  and pf.is_active = true
  and p.is_active = true
order by p.name, pf.sort_order, ac.sort_order, ac.name;

-- 3) Empaques que la app puede descontar a nivel de carrito.
select
  case s.id
    when '00000000-0000-0000-0002-000000000101' then 'Caja Familiar'
    when '00000000-0000-0000-0002-000000000102' then 'Caja Mediana'
    when '00000000-0000-0000-0002-000000000103' then 'Empaque Diamante/Individual'
    else 'Empaque no mapeado en app'
  end as app_label,
  s.id as supply_id,
  s.name as supply_name,
  s.unit,
  s.grams_per_bag,
  1 as units_deducted_per_sale_when_selected
from public.supplies s
where s.id in (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103'
)
order by app_label;

-- 4) Recetas de produccion: consumen RAW y producen PROCESSED.
select
  pr.name as production_recipe_name,
  out_supply.name as output_supply_name,
  pr.output_bags,
  pr.output_grams,
  in_supply.name as input_supply_name,
  pri.grams_required as raw_grams_consumed_per_batch
from public.production_recipes pr
join public.supplies out_supply on out_supply.id = pr.supply_id
join public.production_recipe_inputs pri on pri.production_recipe_id = pr.id
join public.supplies in_supply on in_supply.id = pri.supply_id
where pr.is_active = true
order by pr.name, in_supply.name;
