-- Migration: 015_cube_image_urls.sql
-- Add support for multiple photos on cubes table (compatible with array of image URLs)
ALTER TABLE public.cubes
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

UPDATE public.cubes
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(image_urls) = 0;
