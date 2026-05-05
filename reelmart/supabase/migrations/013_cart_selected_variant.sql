-- Migration 013: Add selected_variant JSONB to cart_items for storing chosen variant details

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS selected_variant JSONB;
