-- Cara bayar mingguan yang aktif beralih ke harian mulai hari migrasi (WIB).
-- Kesepakatan lampau dan seluruh penerimaan uang tetap disimpan.
WITH migration_date AS (
  SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS today
), current_plans AS (
  SELECT DISTINCT ON (house_id) payment_plans.*
  FROM payment_plans, migration_date
  WHERE effective_from <= migration_date.today
  ORDER BY house_id, effective_from DESC
)
INSERT INTO payment_plans (
  house_id, effective_from, cadence, rate_per_night, due_timing,
  grace_days, week_start, recorded_by
)
SELECT house_id, migration_date.today, 'daily', rate_per_night, due_timing,
       grace_days, week_start, recorded_by
FROM current_plans, migration_date
WHERE cadence = 'weekly'
ON CONFLICT (house_id, effective_from)
DO UPDATE SET cadence = 'daily', updated_at = now();
--> statement-breakpoint
-- Kesepakatan mingguan yang belum berlaku juga menjadi harian pada tanggal semula.
UPDATE payment_plans
SET cadence = 'daily', updated_at = now()
WHERE cadence = 'weekly'
  AND effective_from > (now() AT TIME ZONE 'Asia/Jakarta')::date;
