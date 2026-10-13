-- Support multiple catalogue photos and make each rentable cube have one live agreement.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.products SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(image_urls) = 0;

-- Keep the latest active agreement (or latest pending request when no active
-- agreement exists) for a cube; retain older duplicates as historical rows.
WITH ranked_contracts AS (
  SELECT contract_id,
    row_number() OVER (
      PARTITION BY cube_id
      ORDER BY (status = 'Active') DESC, created_at DESC, contract_id DESC
    ) AS row_number
  FROM public.contracts
  WHERE cube_id IS NOT NULL AND status IN ('Pending', 'Active')
)
UPDATE public.contracts AS contract
SET status = 'Expired'
FROM ranked_contracts AS ranked
WHERE contract.contract_id = ranked.contract_id AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_live_contract_per_cube
  ON public.contracts (cube_id) WHERE status IN ('Pending', 'Active');
