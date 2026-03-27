import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
dotenv.config();

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
    console.log('Testing worldunboxer/rapid-linkedin-scraper...');
    
    const keyword = 'Software Developer';
    
    // Testing strictly URLs
    const input = {
        "searchTerms": [keyword],
        "maxResults": 2,
        "scrapeJobDetails": false
    };

    console.log('Input:', JSON.stringify(input, null, 2));

    try {
        const run = await client.actor('sovereigntaylor/upwork-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        console.log(`Extracted ${items.length} jobs. Sample 2 jobs:`);
        items.slice(0, 2).forEach((item, i) => {
            console.log(`\n--- Job ${i + 1} ---`);
            console.log(JSON.stringify(item, null, 2));
        });

    } catch (e) {
        console.error(e);
    }
}

main();
