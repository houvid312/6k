const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:*OlmeRuiz2030*@db.mkmvnjqyjcnaimjeryrv.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();

  console.log('=== PRODUCT FORMATS COLUMNS ===');
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_formats'`);
  console.table(cols.rows);

  console.log('=== PRODUCT FORMATS ROWS ===');
  const pf = await client.query(`SELECT * FROM product_formats LIMIT 10`);
  console.table(pf.rows);

  console.log('=== STOCK MINIMUMS IN STORES ===');
  const sm = await client.query(`
    SELECT st.name as store_name, s.name as supply_name, s.category, sm.minimum_grams, s.grams_per_bag
    FROM stock_minimums sm 
    JOIN stores st ON st.id = sm.store_id 
    JOIN supplies s ON s.id = sm.supply_id 
    WHERE s.name ILIKE '%mediana%' OR s.name ILIKE '%masa%' OR s.name ILIKE '%caja%'
    ORDER BY st.name, s.name
  `);
  console.table(sm.rows);

  await client.end();
}
run().catch(console.error);
