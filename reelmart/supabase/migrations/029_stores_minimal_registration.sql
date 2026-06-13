-- Migration 029: allow minimal store creation at registration
--
-- The seller-onboarding redesign creates the store at registration with only
-- name + PAN; store details (category, city, address, logo, …) are collected
-- afterward in onboarding/settings. category and city were NOT NULL from the
-- old single-step flow, which breaks the minimal onboard upsert. Relax them to
-- nullable — a store fills these before it's approved and ever shown publicly
-- (the storefront only lists approved stores). The category CHECK still applies
-- to non-null values.

ALTER TABLE public.stores ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.stores ALTER COLUMN city DROP NOT NULL;
