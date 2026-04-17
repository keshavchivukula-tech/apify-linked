import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { ApifyClient } from 'npm:apify-client'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { keyword, location, jobsNumber, datePosted } = await req.json()
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')

    if (!APIFY_TOKEN) {
      throw new Error('APIFY_API_TOKEN is not set in Supabase Edge Function secrets')
    }

    const client = new ApifyClient({ token: APIFY_TOKEN })
    const actorId = 'worldunboxer/rapid-linkedin-scraper'
    
    const input = {
      "job_title": keyword,
      "location": location,
      "jobs_entries": parseInt(jobsNumber) || 20,
      "job_post_time": datePosted || "r2592000"
    }

    const run = await client.actor(actorId).call(input)
    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    // Smart Filter (Same as index.js)
    const keywordParts = keyword.toLowerCase().split(' ').filter(p => p.trim() !== '')
    let records = items.map(item => ({
      company: item.company_name || 'Unknown',
      title: item.job_title || 'Unknown',
      location: item.location || 'Unknown',
      jobUrl: item.job_url || '',
      companyUrl: item.company_url || '',
      description: (item.job_description || '').substring(0, 150).replace(/\n/g, ' ') + '...'
    }))

    const originalCount = records.length
    records = records.filter(r => {
      const titleLower = r.title.toLowerCase()
      return keywordParts.every(part => titleLower.includes(part))
    })

    if (records.length === 0) {
      records = items.map(item => ({
        company: item.company_name || 'Unknown',
        title: item.job_title || 'Unknown',
        location: item.location || 'Unknown',
        jobUrl: item.job_url || '',
        companyUrl: item.company_url || '',
        description: (item.job_description || '').substring(0, 150).replace(/\n/g, ' ') + '...'
      })).filter(r => {
        const titleLower = r.title.toLowerCase()
        const significantParts = keywordParts.filter(p => p.length > 2)
        if (significantParts.length === 0) return true
        return significantParts.some(part => titleLower.includes(part))
      })
    }

    return new Response(
      JSON.stringify({ records, originalCount }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
