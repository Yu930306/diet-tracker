// Supabase connection for the diet-tracker networked app.
// Project: diet-tracker (Reconet org, ap-southeast-1, Free plan).
// The anon key is designed for client-side use and is protected by
// Row Level Security (see supabase-setup.sql) — it is NOT a secret
// like the service_role key. Never put the service_role key here.
window.DIET_CONFIG = {
  SUPABASE_URL: 'https://udtijnuefwfvgnjyofyx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkdGlqbnVlZndmdmduanlvZnl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MTEyNDMsImV4cCI6MjExMDk4NzI0M30.iFWAZ4lNcNOLkEJnz_ajBTopRzGuo1-Fbm2lRB2f7F8',
  // Countdown target (timetable page only shows this countdown).
  TARGET_DATE: '2026-12-23',
  // Weekly carb targets (g/day). Week 4 was raised to 1.5x = 77g.
  CARB_TARGETS: { 1: 155, 2: 129, 3: 103, 4: 77 },
  PROTEIN_TARGET_G: 82
};
