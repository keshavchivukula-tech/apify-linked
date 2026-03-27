import express from 'express';
import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

if (!APIFY_API_TOKEN) {
    console.error('CRITICAL ERROR: APIFY_API_TOKEN is missing in the .env file.');
    process.exit(1);
}

const client = new ApifyClient({ token: APIFY_API_TOKEN });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LEADS_DIR = path.join(__dirname, 'leads');
if (!fs.existsSync(LEADS_DIR)) fs.mkdirSync(LEADS_DIR);

// Scrape endpoint
app.post('/api/scrape', async (req, res) => {
    try {
        const { keyword, location, jobsNumber, datePosted } = req.body;
        
        if (!keyword || !location) return res.status(400).json({ error: 'Keyword and location are required.' });

        console.log(`[API] Received scrape request: ${keyword} in ${location} (Limit: ${jobsNumber || 20})`);

        let searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`;
        if (datePosted) {
            searchUrl += `&f_TPR=${encodeURIComponent(datePosted)}`;
        }
        
        const actorId = 'worldunboxer/rapid-linkedin-scraper';
        const input = {
            "job_title": keyword,
            "location": location,
            "jobs_entries": parseInt(jobsNumber) || 20,
            "job_post_time": datePosted || "r2592000"
        };

        const run = await client.actor(actorId).call(input);
        console.log(`[API] Actor finished running. Run ID: ${run.id}`);
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log(`[API] Extracted ${items.length} total job postings.`);

        if (items.length === 0) return res.status(404).json({ error: 'No jobs found for the specified criteria.' });

        // Split keyword into individual words (e.g. "Software Developer" -> ["software", "developer"])
        const keywordParts = keyword.toLowerCase().split(' ').filter(p => p.trim() !== '');
        
        let records = items.map(item => ({
            company: item.company_name || 'Unknown',
            title: item.job_title || 'Unknown',
            location: item.location || 'Unknown',
            jobUrl: item.job_url || '',
            companyUrl: item.company_url || '',
            description: (item.job_description || '').substring(0, 150).replace(/\n/g, ' ') + '...'
        }));

        const originalCount = records.length;
        // Smart Filter: Ensure that EVERY word in the search keyword exists in the job title. 
        // This allows "Software Developer" to match "Junior Software Web Developer"
        records = records.filter(r => {
            const titleLower = r.title.toLowerCase();
            return keywordParts.every(part => titleLower.includes(part));
        });
        
        // If it's STILL 0, fallback to a softer filter: ensure AT LEAST ONE word from the keyword is in the title.
        // This prevents the "0 results" issue if LinkedIn returns slightly different titles (e.g. Engineer vs Developer)
        if (records.length === 0) {
             records = items.map(item => ({
                company: item.company_name || 'Unknown',
                title: item.job_title || 'Unknown',
                location: item.location || 'Unknown',
                jobUrl: item.job_url || '',
                companyUrl: item.company_url || '',
                description: (item.job_description || '').substring(0, 150).replace(/\n/g, ' ') + '...'
            })).filter(r => {
                const titleLower = r.title.toLowerCase();
                // Ignore generic words like "and", "or", "in" if doing loose match
                const significantParts = keywordParts.filter(p => p.length > 2);
                if (significantParts.length === 0) return true; // if they just searched "IT", let it pass
                return significantParts.some(part => titleLower.includes(part));
            });
            console.log(`[API] Strict filter yielded 0 results. Falling back to loose match. Found ${records.length} jobs.`);
        } else {
            console.log(`[API] Strict job title filtering applied: ${records.length} jobs remain.`);
        }

        res.json({ message: 'Success', records, originalCount });

    } catch (error) {
        res.status(500).json({ error: error.message || 'An error occurred during scraping.' });
    }
});

// Excel Generate Endpoint
app.post('/api/export', async (req, res) => {
    try {
        const { records } = req.body;
        if (!records || records.length === 0) return res.status(400).json({ error: 'No records to save.' });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `leads_${timestamp}.xlsx`;
        const filePath = path.join(LEADS_DIR, filename);

        // Create a new workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Leads');

        // Define columns
        sheet.columns = [
            { header: 'Company Name', key: 'company', width: 25 },
            { header: 'CEO Name', key: 'ceoName', width: 25 },
            { header: 'CEO Email', key: 'ceoEmail', width: 30 },
            { header: 'CEO Contact', key: 'ceoPhone', width: 20 },
            { header: 'Job Title', key: 'title', width: 35 },
            { header: 'Location', key: 'location', width: 20 },
            { header: 'Job URL', key: 'jobUrl', width: 45 },
            { header: 'Company LinkedIn', key: 'companyUrl', width: 45 },
            { header: 'Job Description', key: 'description', width: 60 }
        ];

        // Format header row
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add records
        records.forEach(r => {
            sheet.addRow({
                company: r.company,
                ceoName: r.ceoName || 'NA',
                ceoEmail: r.ceoEmail || 'NA',
                ceoPhone: r.ceoPhone || 'NA',
                title: r.title,
                location: r.location,
                jobUrl: r.jobUrl,
                companyUrl: r.companyUrl,
                description: r.description
            });
        });

        // 1. Write to file (as a persistent record)
        await workbook.xlsx.writeFile(filePath);
        console.log(`[API] Saved to disk: ${filename}`);

        // 2. Generate buffer for direct response
        const buffer = await workbook.xlsx.writeBuffer();
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Send the buffer directly
        res.send(buffer);
        console.log(`[API] Exported directly (ExcelJS): ${filename}`);

    } catch(err) {
        console.error('[API] Export error:', err);
        res.status(500).json({ error: 'Failed to generate Excel file.' });
    }
});

// Lead Enrichment Endpoint (Stage 2 - REAL DATA)
app.post('/api/enrich', async (req, res) => {
    try {
        const { records } = req.body;
        if (!records || records.length === 0) return res.status(400).json({ error: 'No records to enrich.' });

        console.log(`[API] Starting REAL CEO Enrichment for ${records.length} leads...`);

        // We will process the leads in small batches to manage concurrency and performance.
        const enrichLead = async (r) => {
            try {
                console.log(`[API] Enriching: ${r.company}`);
                
                // Call the specialized 'get-leads/linkedin-scraper' for CEO discovery
                const run = await client.actor('2atkKH5LuF2AAPp3N').call({
                    mode: 'search_profiles',
                    searchQuery: `CEO at ${r.company}`,
                    maxProfilesPerSearch: 1,
                    discoverEmails: true,
                    includeContactInformation: true
                });

                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                
                if (items && items.length > 0) {
                    const ceo = items[0];
                    return {
                        ...r,
                        ceoName: ceo.fullName || 'NA',
                        ceoEmail: ceo.email || 'NA',
                        ceoPhone: ceo.phone || 'NA'
                    };
                }
                
                return { ...r, ceoName: 'NA', ceoEmail: 'NA', ceoPhone: 'NA' };

            } catch (err) {
                console.error(`[API] Enrichment failed for ${r.company}:`, err.message);
                return { ...r, ceoName: 'NA', ceoEmail: 'NA', ceoPhone: 'NA' };
            }
        };

        // Concurrency-limited processing (limit to 3 parallel runs to avoid rate limits)
        const enrichedRecords = [];
        const batchSize = 3;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(enrichLead));
            enrichedRecords.push(...results);
        }

        res.json({ records: enrichedRecords });
        console.log(`[API] Real Enrichment complete for ${enrichedRecords.length} leads.`);

    } catch(err) {
        console.error('[API] Global Enrichment error:', err);
        res.status(500).json({ error: 'Failed to enrich leads.' });
    }
});

app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    console.log(`[API] Download request for: ${filename}`);
    if (filename.includes('..') || filename.includes('/')) return res.status(400).send('Invalid filename');
    const filePath = path.join(LEADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`[API] Download failed: File not found at ${filePath}`);
        return res.status(404).send('File not found');
    }
    res.download(filePath, (err) => {
        if (err) {
            console.log(`[API] Download error: ${err.message}`);
        } else {
            console.log(`[API] Successfully sent ${filename}`);
        }
    });
});

app.listen(PORT, () => console.log(`🎉 Server is running on http://localhost:${PORT}`));
