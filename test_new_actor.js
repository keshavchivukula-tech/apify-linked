import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
dotenv.config();

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function testActor(actorId, input) {
    console.log(`\nTesting ${actorId}...`);
    try {
        const run = await client.actor(actorId).call(input);
        console.log(`Run status: ${run.status}`);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log(`Success! Extracted ${items.length} items.`);
        if (items.length > 0) {
            console.log(JSON.stringify(items[0], null, 2).substring(0, 300) + '...');
        }
    } catch (e) {
        console.log(`Failed: ${e.message}`);
    }
}

async function main() {
    const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=Developer&location=Remote';
    await testActor('worldunboxer/rapid-linkedin-scraper', { "urls": [searchUrl], "count": 2 });
}

main();
