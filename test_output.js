import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
    try {
        const runs = await client.actor('worldunboxer/rapid-linkedin-scraper').runs().list({ limit: 1, desc: true });
        
        if (runs.items.length === 0) {
            console.log('No runs found');
            return;
        }

        const lastRun = runs.items[0];
        const dataset = await client.dataset(lastRun.defaultDatasetId).listItems({ limit: 1 });
        
        if (dataset.items.length > 0) {
            fs.writeFileSync('output.json', JSON.stringify(dataset.items[0], null, 2));
            console.log('Saved to output.json');
        } else {
            console.log('Dataset is empty');
        }
    } catch (e) {
        fs.writeFileSync('output.json', JSON.stringify({error: e.message}, null, 2));
    }
}

main();
