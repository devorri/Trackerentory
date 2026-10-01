-- Add editable location details to each cube.
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS location text;