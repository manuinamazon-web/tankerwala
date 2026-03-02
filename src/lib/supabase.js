import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fegpsuxxtsyujnwvpovf.supabase.co'
const supabaseKey = 'sb_publishable_eTvGlQ1Db-QMN4K5AotJJQ_OUSDpIbK'

export const supabase = createClient(supabaseUrl, supabaseKey)
