-- Migration 012: RLS gaps and realtime + storage setup

-- Realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('store-logos', 'store-logos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('review-photos', 'review-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('seller-documents', 'seller-documents', false, 10485760, ARRAY['image/jpeg','image/png','application/pdf'])
ON CONFLICT DO NOTHING;

-- Product images storage policies
CREATE POLICY "Product images public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "Sellers upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE id::TEXT = (storage.foldername(name))[1] AND seller_id = auth.uid()
    )
  );

CREATE POLICY "Sellers delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE id::TEXT = (storage.foldername(name))[1] AND seller_id = auth.uid()
    )
  );

-- Store logos storage policies
CREATE POLICY "Store logos public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'store-logos');

CREATE POLICY "Sellers upload own logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos' AND
    (storage.foldername(name))[1]::UUID IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
  );

-- Review photos storage policies
CREATE POLICY "Review photos public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'review-photos');

CREATE POLICY "Buyers upload review photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'review-photos');

-- Seller documents (private)
CREATE POLICY "Sellers read own documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'seller-documents' AND (storage.foldername(name))[1]::UUID = auth.uid());

CREATE POLICY "Sellers upload own documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'seller-documents' AND (storage.foldername(name))[1]::UUID = auth.uid());
