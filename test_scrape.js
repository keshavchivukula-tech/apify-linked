// Use native fetch in Node.js 18+

async function testScrape() {
    console.log("Sending scrape request...");
    try {
        const response = await fetch('http://localhost:3000/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword: "Software Engineer",
                location: "Remote",
                jobsNumber: 2
            })
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        if (response.ok) {
            console.log("Success! Records received:", data.records.length);
            console.log("First record:", JSON.stringify(data.records[0], null, 2));

            // Test CSV generation
            console.log("Generating CSV...");
            const csvResponse = await fetch('http://localhost:3000/api/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: data.records })
            });
            const csvData = await csvResponse.json();
            console.log("CSV Response Status:", csvResponse.status);
            console.log("CSV Filename:", csvData.filename);
        } else {
            console.log("Error response:", data);
        }
    } catch (e) {
        console.log("Request failed:", e.message);
    }
}

testScrape();
