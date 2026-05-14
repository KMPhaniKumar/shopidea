-- Migration 016: Adjust product stock on order status changes
--
-- Deducts product/variant stock when seller accepts an order
-- (pending → accepted), and restores it if the order is later
-- cancelled or rejected. No-op for items on products with
-- stock_type = 'unlimited'. Stock is floored at 0 to avoid
-- negative values on oversells.

CREATE OR REPLACE FUNCTION public.adjust_stock_on_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item       JSONB;
  pid        UUID;
  vid        UUID;
  qty        INT;
  do_deduct  BOOLEAN;
  do_restore BOOLEAN;
BEGIN
  do_deduct  := OLD.status = 'pending' AND NEW.status = 'accepted';
  do_restore := OLD.status IN ('accepted', 'packed', 'shipped')
                AND NEW.status IN ('cancelled', 'rejected');

  IF NOT do_deduct AND NOT do_restore THEN
    RETURN NEW;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) LOOP
    pid := NULLIF(item->>'productId', '')::UUID;
    vid := NULLIF(item->>'variantId', '')::UUID;
    qty := COALESCE((item->>'qty')::INT, 0);

    IF qty <= 0 OR pid IS NULL THEN
      CONTINUE;
    END IF;

    IF vid IS NOT NULL THEN
      -- Variant-level stock
      IF do_deduct THEN
        UPDATE public.product_variants
        SET stock_count = GREATEST(0, stock_count - qty)
        WHERE id = vid;
      ELSE
        UPDATE public.product_variants
        SET stock_count = stock_count + qty
        WHERE id = vid;
      END IF;
    ELSE
      -- Product-level stock, only when seller is tracking it
      IF do_deduct THEN
        UPDATE public.products
        SET stock_count = GREATEST(0, stock_count - qty)
        WHERE id = pid AND stock_type = 'counted';
      ELSE
        UPDATE public.products
        SET stock_count = stock_count + qty
        WHERE id = pid AND stock_type = 'counted';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_adjust_stock ON public.orders;

CREATE TRIGGER orders_adjust_stock
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.adjust_stock_on_order_status_change();
