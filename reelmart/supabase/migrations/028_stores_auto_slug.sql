-- Migration 028: auto-generate store_slug on insert
--
-- store_slug is NOT NULL, but the seller-onboard upsert (and potentially other
-- store-creation paths) don't supply it, causing
-- "null value in column store_slug violates not-null constraint".
-- A BEFORE INSERT trigger fills it from store_name via the existing
-- generate_store_slug() (which also dedupes). On re-submit/upsert the UPDATE
-- path doesn't touch store_slug, so an existing slug is preserved.

CREATE OR REPLACE FUNCTION public.set_store_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_slug IS NULL OR NEW.store_slug = '' THEN
    NEW.store_slug := public.generate_store_slug(COALESCE(NULLIF(TRIM(NEW.store_name), ''), 'store'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stores_set_slug ON public.stores;
CREATE TRIGGER stores_set_slug
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_store_slug();
