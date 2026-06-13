-- Migration 027: one store per seller
--
-- The seller-onboard route upserts the store with ON CONFLICT (seller_id), and
-- the whole app assumes a single store per seller (countless
-- `.eq('seller_id', …).single()` reads). Postgres requires a UNIQUE constraint
-- for ON CONFLICT to resolve — without it the upsert fails with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Idempotent via a guard (Postgres has no ADD CONSTRAINT IF NOT EXISTS).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_seller_id_unique'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_seller_id_unique UNIQUE (seller_id);
  END IF;
END $$;
