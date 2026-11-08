-- ==============================================================================
-- DEMO SEED: Expired contracts inside the 3-day extension grace period
-- ------------------------------------------------------------------------------
-- Creates 20 demo cubes + 20 Expired contracts:
--   * 10 Display cubes  (DEMO-D01..D10) -> Honey Mae   (username: Honeymae)
--   * 10 Pick-up cubes  (DEMO-P01..P10) -> Merlyn Anne (username: merlynanne)
--
-- end_date = yesterday (Philippine time), so on the renter dashboard each
-- contract shows under "Extension (Grace Period)" with the full 3 days to
-- request an extension (daysLeft = -1, window is -1 to -3).
--
-- RE-RUNNABLE: running it again wipes the previous demo cubes/contracts/
-- extension requests and recreates them with fresh dates.
-- >>> Run this on the DAY of the demo (Supabase > SQL Editor > Run). <<<
--
-- To change how many days are left, edit v_days_expired below:
--   1 = 3 days left to extend, 2 = 2 days left, 3 = last day, 4 = fully expired
-- ==============================================================================

DO $$
DECLARE
  v_days_expired integer := 1;
  v_today        date    := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_end          date;
  v_start        date;
  v_display_id   integer;
  v_pickup_id    integer;
  v_cube_id      integer;
  i              integer;
BEGIN
  v_end   := v_today - v_days_expired;
  v_start := (v_end - interval '1 month')::date;

  -- 1. Find the two renter accounts
  SELECT user_id INTO v_display_id FROM public.users
  WHERE lower(username) = 'honeymae' AND deleted_at IS NULL LIMIT 1;

  SELECT user_id INTO v_pickup_id FROM public.users
  WHERE lower(username) = 'merlynanne' AND deleted_at IS NULL LIMIT 1;

  IF v_display_id IS NULL THEN
    RAISE EXCEPTION 'Renter account "Honeymae" not found in public.users. Create it in the app first.';
  END IF;
  IF v_pickup_id IS NULL THEN
    RAISE EXCEPTION 'Renter account "merlynanne" not found in public.users. Create it in the app first.';
  END IF;

  -- 2. Clean up previous demo data (contract_extensions cascade from contracts)
  DELETE FROM public.contracts
  WHERE cube_id IN (SELECT cube_id FROM public.cubes WHERE cube_number LIKE 'DEMO-%');
  DELETE FROM public.cubes WHERE cube_number LIKE 'DEMO-%';

  -- 3. Display renter: 10 cubes + 10 expired contracts
  FOR i IN 1..10 LOOP
    INSERT INTO public.cubes (cube_number, location, type, price_per_month, status, width_cm, height_cm)
    VALUES ('DEMO-D' || lpad(i::text, 2, '0'), 'Demo Display Row', 'Display', 1500, 'Occupied', 40, 40)
    RETURNING cube_id INTO v_cube_id;

    INSERT INTO public.contracts (renter_id, cube_id, start_date, end_date, status)
    VALUES (v_display_id, v_cube_id, v_start, v_end, 'Expired');
  END LOOP;

  -- 4. Pick-up renter: 10 cubes + 10 expired contracts
  FOR i IN 1..10 LOOP
    INSERT INTO public.cubes (cube_number, location, type, price_per_month, status, width_cm, height_cm)
    VALUES ('DEMO-P' || lpad(i::text, 2, '0'), 'Demo Pick-up Shelf', 'Pick-up', 1000, 'Occupied', 40, 40)
    RETURNING cube_id INTO v_cube_id;

    INSERT INTO public.contracts (renter_id, cube_id, start_date, end_date, status)
    VALUES (v_pickup_id, v_cube_id, v_start, v_end, 'Expired');
  END LOOP;

  RAISE NOTICE 'Seeded 20 demo contracts: % -> % (expired % day(s) ago).', v_start, v_end, v_days_expired;
END $$;

-- Check result
SELECT c.contract_id, u.full_name, u.username, cu.cube_number, cu.type,
       c.start_date, c.end_date, c.status
FROM public.contracts c
JOIN public.users u  ON u.user_id  = c.renter_id
JOIN public.cubes cu ON cu.cube_id = c.cube_id
WHERE cu.cube_number LIKE 'DEMO-%'
ORDER BY cu.cube_number;


-- ==============================================================================
-- CLEANUP (after the demo) - highlight and run these two lines only:
-- ==============================================================================
-- DELETE FROM public.contracts WHERE cube_id IN (SELECT cube_id FROM public.cubes WHERE cube_number LIKE 'DEMO-%');
-- DELETE FROM public.cubes WHERE cube_number LIKE 'DEMO-%';
