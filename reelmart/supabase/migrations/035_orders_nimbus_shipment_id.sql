-- Store NimbusPost's shipment_id so we can (re)generate the official label PDF
-- on demand via the old API's /shipments/label endpoint.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS nimbus_shipment_id TEXT;
