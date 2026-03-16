import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// TEMPORARY FUNCTION — DELETE IMMEDIATELY AFTER USE
serve(async () => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
              Deno.env.get('SUPABASE_SERVICE_KEY') || 
              'NOT_FOUND';
  return new Response(JSON.stringify({ key }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
