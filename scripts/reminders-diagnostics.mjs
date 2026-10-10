// Prints recent pg_cron runs and Edge Function responses for the reminder job.
import { admin } from './_env.mjs'
const { data, error } = await admin.rpc('reminders_diagnostics')
console.log(error ?? JSON.stringify(data, null, 2))
