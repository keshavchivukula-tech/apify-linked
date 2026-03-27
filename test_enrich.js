import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
dotenv.config();

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
    const actorId = '2atkKH5LuF2AAPp3N';
    console.log(`Testing actor: ${actorId}`);
    
    try {
        const input = {
            mode: 'search_profiles',
            searchQuery: 'CEO at Google',
            maxProfilesPerSearch: 1,
            discoverEmails: true,
            includeContactInformation: true
        };
        
        console.log('Calling actor with input:', JSON.stringify(input, null, 2));
        const run = await client.actor(actorId).call(input);
        console.log(`Run started: ${run.id}`);
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log(`Extracted ${items.length} items.`);
        if (items.length > 0) {
            console.log('Sample item:', JSON.stringify(items[0], null, 2));
        } else {
            console.log('No items found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
