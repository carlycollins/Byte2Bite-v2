import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://xpodlxuontvjpkxxvwts.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb2RseHVvbnR2anBreHh2d3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDcxNTEsImV4cCI6MjA5Njc4MzE1MX0.C7zbGAyAJ8H_ODQoO72WD-izHNlosrVWK9J54qBAm6c"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
