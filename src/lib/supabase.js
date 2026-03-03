import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fegpsuxxtsyujnwvpovf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZ3BzdXh4dHN5dWpud3Zwb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTk5OTgsImV4cCI6MjA4Nzk5NTk5OH0.RXUVl90XuB3k2ZsRhuLcWrvkU74hq3ekwBYzmQXOqBw'

export const supabase = createClient(supabaseUrl, supabaseKey)
