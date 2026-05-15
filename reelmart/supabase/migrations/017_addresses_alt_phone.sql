-- Migration 017: Add optional alt_phone to addresses
--
-- Used by checkout forms when buyer wants to give the delivery agent
-- a backup number (e.g. their building security desk).

ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS alt_phone TEXT;
