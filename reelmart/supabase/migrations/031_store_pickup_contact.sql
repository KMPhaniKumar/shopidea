-- Migration 031: pickup-contact fields on stores
--
-- NimbusPost's v1 (email/password) API has no warehouse pre-registration — the
-- pickup address is sent INLINE on every shipment, and that payload requires a
-- contact person name + a 10-digit contact phone (email/GST optional). The store
-- row only had store_name + address columns, so we add dedicated pickup-contact
-- fields, captured on the seller's "Add Pickup Address" form (the same fields
-- NimbusPost's own form asks for).

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pickup_contact_name text,
  ADD COLUMN IF NOT EXISTS pickup_phone        text,
  ADD COLUMN IF NOT EXISTS pickup_email        text;

-- These are written only via the service-role address routes (the authenticated
-- role's column grants on stores are locked down in migration 024), so no
-- additional GRANTs are needed for the client.
