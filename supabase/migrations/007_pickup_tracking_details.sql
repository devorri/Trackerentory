-- Keep typed pickup product details and cube assignment on tracking records.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cube_id integer REFERENCES public.cubes(cube_id) ON DELETE SET NULL;