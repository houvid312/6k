-- =============================================================================
-- Migración 102: Reclasificación contable de Gastos (Traslados, Insumos,
--                Inversión / Equipos, Publicidad / Mercadeo, Mantenimiento, Dotación)
-- =============================================================================

BEGIN;

-- Deshabilitar temporalmente los triggers de bloqueo de periodo contable durante la reclasificación administrativa
SET LOCAL session_replication_role = 'replica';

-- 1. San Juan: Reclasificar a 'Traslado' los dos pagos de $1.000.000 de la primera semana al Centro de Producción
UPDATE public.expenses
SET category = 'Traslado'
WHERE id IN (
  '72597900-e928-4941-9ad4-9cc82e94d58e', -- Pago insumos una semana al Centro de Producción ($1.000.000)
  'd5d404e4-fe3a-46bd-a42e-8f8cd27a7074'  -- Insumos primera semana (segundo pago) ($1.000.000)
);

-- 2. San Juan y Centro de Producción: Reclasificar pedidos de Gaseosas, Salsas, Bolsas y Aseo que estaban en 'Otro' -> a 'Insumos'
UPDATE public.expenses
SET category = 'Insumos'
WHERE id IN (
  '3fabc761-0ca4-4831-ab3e-f378a149592a', -- SJ: Gaseosas ($227.900)
  'abdf4556-e164-4fc3-8164-ac468c8c08d2', -- SJ: Gaseosas ($377.600)
  '75adf5df-d40c-4fc7-b634-009d877142b7', -- SJ: Meras Salsas ($30.000)
  '4bc901d1-66ce-4528-b94d-5f07a04afbff', -- CP: 4 paquetes de Bolsas 1x1 resellables ($6.000)
  '7427e12e-7e2b-4628-a5a0-4f5cf25e6510', -- CP: Bolsa pedido Food Services ($400)
  '13249b16-2d07-4436-9d08-af7c94d2b7dd', -- CP: 5 paquetes bolsas libra ($6.000)
  '2ae2c9a1-4839-405c-b834-ed754504a8ad', -- CP: Esponjas ($8.000)
  'c84a91f6-536f-4fdd-be27-a15a3b4ebaff', -- CP: Bolsas de basura ($6.150)
  '04c5188d-d652-4c91-816c-35b1126a53a5', -- CP: Vinagre blanco ($7.850)
  '6bad6ed3-d2ea-4471-b035-40916826c56c', -- CP: Jabón Axión ($33.000)
  '424cde55-f16d-443d-af8e-1fa6606760c0', -- CP: Bolsas varias ($70.800)
  '1dae1d4d-c3c2-4289-a022-24757eba7469', -- CP: Frascos para empacado de champiñones ($34.789)
  '73da6e6b-97eb-4fa6-b3f6-97e3cc9a3c0a', -- CP: Lavaplatos 3000 ml ($33.000)
  '465f1a2a-42bc-4350-ba71-731c6f571638', -- CP: 24 frascos champis y fletes envíos ($64.400)
  '535cb4e6-e30d-43e2-92a7-d139b7ba3eb5', -- CP: Salsa de chocolate, cerezas, aceitunas ($23.800)
  'edac90ff-63fc-4c26-8994-4290a19faa45', -- CP: Axión 3000 ml ($33.000)
  '8789a2aa-25c7-4320-98e9-c29b4d435ad4'  -- CP: Axion líquido ($33.000)
);

-- 3. Reclasificar compra de equipamiento, maquinaria, neveras, planchas, TV y mobiliario -> 'Inversión / Equipos'
UPDATE public.expenses
SET category = 'Inversión / Equipos'
WHERE id IN (
  -- San Juan
  '103a6ab3-cbd3-4249-ae76-b314229060a5', -- Pago Fletes 8 sillas desde Bogotá ($73.333)
  '9ace5ad2-c51f-4d2d-afef-63de62e8e9c0', -- Mouse óptico sencillo ($14.000)
  'bcf9cb1f-9ca0-46e5-b16f-afc15f678389', -- Pago cuota de la nevera ($190.150)
  '0f564a6b-f201-4522-b0df-20f5695fd5f8', -- Plancha eléctrica para quesadilla ($97.666)
  '0454279e-383b-4eb5-87d4-d3ddb62148ad', -- Pago cuota nevera gaseosa ($190.150)
  '75c49b9e-ab6d-4a05-ba64-62bc598f9eeb', -- Servilleteros ($14.000)
  '300b9f68-b3dd-48fc-a5cb-ea99e54ef65c', -- Pago cuota de nevera Gaseosas ($190.150)
  -- Margaritas
  'a878c663-601d-49ee-bbe4-429edddf78f8', -- Artículos de baño ($103.000)
  'ef2f6495-3278-41e0-b65a-9e9d89c8170e', -- Plancha para quesadillas ($97.700)
  'c1a1786e-7ee0-4e7d-b19c-389207e5b012', -- Servilleteros ($14.000)
  'b6de91dd-4962-4965-b5b0-d6679bae30bd', -- Televisor Bayron ($300.000 - estaba en Compra Turno)
  'd91bd45b-8c3c-42ef-929c-fe27e2e8a994', -- Control Xiaomi TV ($185.000 - estaba en Compra Turno)
  -- Centro de Producción
  '336b1aca-8e15-49b4-892a-bcd516867ec0', -- Caja plástica Alaska ($120.000)
  'd05fdee0-ed96-43cf-8301-ac240ce9c111', -- 12 Caja polar monaco ($67.200)
  'cc320a78-521e-4e28-b5bb-08322d756967', -- Pago totalidad deuda rayadora queso ($950.000)
  '0a25262c-b53b-408f-ba39-40e2b7fd73fa', -- Caja polar Mónaco ($67.200)
  '137ba649-0ecd-4519-9493-ab16dbd6985e', -- Caldero N34 ($100.000)
  'd9aacf5a-1838-41f8-8fa7-683265d4813f', -- Estante luxus ($58.000)
  '4362010a-d0b7-43b2-b128-05c777fe41ca', -- Salsero Persal ($114.000)
  'f3673209-9cec-4479-85da-3be74b56762c', -- Caja Alaska #4 ($120.000)
  'ad7de9d6-a3ff-4581-b63a-e36c5b3f3bbb', -- Caja Monserrat ($29.000)
  '3e9a4716-75e9-46d1-9d9e-9cbea2cb816e', -- Canastilla con tapa grande ($87.846)
  '13c74ba9-af77-4a40-9152-9e96179090c5', -- Pago cuota nevera nueva CP ($150.000)
  'f971891d-9280-42b2-acc4-9b9ef35e6158', -- Tarritos para jalapeño y salsa bbq ($32.000)
  '1b55808b-00cb-43f0-87a1-a666917cf9c6', -- 4 Salseros 1L ($24.000)
  'a6cff7b5-da6c-47c1-b9e1-ad021988a9b3', -- Cuota nevera CP ($150.000)
  '8719d7d1-9c1b-4b59-a36a-79270f77092a', -- Embudo ($3.000)
  '1230d404-b452-42b7-b394-b7baa7fd2803'  -- Plancha para cajas pizza ($175.000)
);

-- 4. Reclasificar campañas, eventos, decoración e impresiones -> 'Publicidad / Mercadeo'
UPDATE public.expenses
SET category = 'Publicidad / Mercadeo'
WHERE id IN (
  -- San Juan
  'b7556ab5-31bd-470d-b45b-ef21b25bce53', -- Pago de impresiones pizza diamante, quesadillas y sellos ($144.200)
  '949a70ee-6227-4e31-8ce5-d7e28032a388', -- Dummy de Halloween ($184.000)
  -- Margaritas
  '73614d1d-62ac-4129-89fb-3fceef85768c', -- Sonido inauguración ($70.000)
  '6a67b220-540a-4d5f-886d-66096f046e7d', -- Habladores, sello, tarjetas promoción ($260.800)
  '17530a67-6562-40c0-81fe-da05bcc875c7', -- Decoración Halloween dollar city ($77.500)
  '622bd287-29ca-4bf1-8a04-7f06437714f7', -- Decoración Halloween ($13.400)
  '3f23567c-a539-4650-b971-21971b0b7027'  -- Dummy Halloween y arreglo pc ($234.000)
);

-- 5. Reclasificar arreglos locativos, plomería, electricidad y control de plagas -> 'Mantenimiento'
UPDATE public.expenses
SET category = 'Mantenimiento'
WHERE id IN (
  -- San Juan
  '640c2872-3717-4fb5-b310-01a9c5f6c26e', -- Reparación llave lavatraperos ($46.000)
  -- Margaritas
  '1de86910-688b-4146-a5d6-5ebb8a1b416e', -- Copias de llaves, destornillador y tornillos ($19.200)
  '2309ee71-b3b1-4510-84ff-e4630af8bea6', -- Cable duplex, toma doble, grapas ($60.000)
  'a2b0f974-ca19-4d13-8a97-3731309c147a', -- Piedra y filtro de llave lavaplatos ($26.500)
  -- Centro de Producción
  '1cb42203-c5c9-44f6-af77-1fe1fa7caa81'  -- Veneno Jeringa ($46.000)
);

-- 6. Reclasificar uniformes y certificados de manipulación de alimentos -> 'Dotación y Personal'
UPDATE public.expenses
SET category = 'Dotación y Personal'
WHERE id IN (
  -- San Juan
  '69400203-4ff1-414a-8e98-64f4a663f5e3', -- Faltante certificado manipulación alimentos ($20.000)
  'c655838a-09a2-4f31-a3d7-2055b27561dd', -- Certificados de manipulación de alimentos ($80.000)
  -- Margaritas
  '4fe9cf04-c48a-4eec-988e-01eac51e9f97', -- Certificados de manipulación de alimentos ($125.000)
  '8262340b-4f7a-4dd7-8dec-25fd4201e983', -- Abono camisas uniformes ($100.000)
  '2e19a905-bd6d-4333-b923-f382ce61fec3'  -- Restante de pago uniformes ($70.000)
);

-- 7. Reclasificar Servicios CP pagados desde San Juan y Turno apoyo en CP
UPDATE public.expenses
SET category = 'Servicios', is_fixed = true
WHERE id = '9d7e7090-a9d8-4a31-b217-9b48ec446e93'; -- SJ: Servicios Centro de Producción ($300.000)

UPDATE public.expenses
SET category = 'Nomina', is_fixed = true
WHERE id = 'c719fd8b-4ded-476e-9b0a-5421962d85f6'; -- CP: Turno apoyo Francy ($70.000)

-- 8. Ajustar closing.expenses en Margaritas para los dos días donde el Televisor ($300.000)
--    y el Control Xiaomi ($185.000) pasaron de 'Compra Turno' a 'Inversión / Equipos',
--    evitando que Caja General los descuente dos veces:
UPDATE public.cash_closings
SET expenses = 103900
WHERE id = '30b676ce-c359-43a1-aced-08a6f60e449c'
  AND expenses = 403900; -- Margaritas 2026-09-20 ($403.900 - $300.000 TV = $103.900)

UPDATE public.cash_closings
SET expenses = 68550
WHERE id = '6fe1dc91-b959-48b4-976e-7cf7860f125e'
  AND expenses = 253550; -- Margaritas 2026-10-31 ($253.550 - $185.000 Xiaomi = $68.550)

SET LOCAL session_replication_role = 'origin';

COMMIT;
