import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { ApifyClient } from 'npm:apify-client'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { records } = await req.json()
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    const client = new ApifyClient({ token: APIFY_TOKEN })

    const enrichedRecords = []

    for (const r of records) {
      try {
        const run = await client.actor('2atkKH5LuF2AAPp3N').call({
          mode: 'search_profiles',
          searchQuery: `CEO at ${r.company}`,
          maxProfilesPerSearch: 1,
          discoverEmails: true,
          includeContactInformation: true
        })

        const { items } = await client.dataset(run.defaultDatasetId).listItems()
        
        if (items && items.length > 0) {
          const ceo = items[0]
          
          const ceoName = ceo.fullName || ceo.full_name || ceo.name || 'NA'
          let ceoEmail = ceo.email || (ceo.emails && ceo.emails[0]) || ceo.officialEmail || 'NA'
          let ceoPhone = ceo.phone || ceo.phone_number || (ceo.phoneNumbers && ceo.phoneNumbers[0]) || 'NA'

          if (Array.isArray(ceoEmail)) ceoEmail = ceoEmail[0]
          if (Array.isArray(ceoPhone)) ceoPhone = ceoPhone[0]

          enrichedRecords.push({
            ...r,
            ceoName: ceoName !== 'NA' ? ceoName : (r.ceoName || 'NA'),
            ceoEmail: ceoEmail !== 'NA' ? ceoEmail : (r.ceoEmail || 'NA'),
            ceoPhone: ceoPhone !== 'NA' ? ceoPhone : (r.ceoPhone || 'NA')
          })
        } else {
          enrichedRecords.push(r)
        }
      } catch (err) {
        enrichedRecords.push(r)
      }
    }

    return new Response(
      JSON.stringify({ records: enrichedRecords }),
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
