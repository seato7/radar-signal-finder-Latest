-- Drop check_magnitude_range — the 0-1 clamp conflicts with the design
-- which uses a 0-5 magnitude scale throughout (confirmed by compute-asset-scores
-- using Math.min(mag, 5), and every generator emitting up to 5). The constraint
-- was silently blocking every signal upsert where magnitude > 1, which included
-- virtually all breaking-news, technicals, earnings, and smart-money signals.
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS check_magnitude_range;
