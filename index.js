import express from 'express';
import os from 'os';
import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

dotenv.config();

// Global Exception Handlers to prevent server crashes from network aborts
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.message);
    if (err.code === 'ECONNRESET' || err.message === 'aborted') {
        console.warn('[WARN] Network abort detected, keeping server alive...');
    } else {
        // For other errors, we might want to exit, but let's stay alive for now in this dev environment
        console.error(err.stack);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

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

const LEADS_DIR = path.join(os.tmpdir(), 'apify_leads');
if (!fs.existsSync(LEADS_DIR)) fs.mkdirSync(LEADS_DIR, { recursive: true });

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
        console.error(`[API] Scrape Error [${error.code || 'UNKNOWN'}]:`, error.message);
        
        // Don't crash on network timeouts or resets
        const statusCode = error.code === 'ECONNRESET' ? 503 : 500;
        const msg = error.code === 'ECONNRESET' 
            ? 'Connection to Apify was reset. Please try again in 30 seconds.'
            : (error.message || 'An error occurred during scraping.');

        res.status(statusCode).json({ error: msg });
    }
});

// Excel Generate Endpoint
app.post('/api/export', async (req, res) => {
    try {
        const { records, format = 'xlsx' } = req.body;
        if (!records || records.length === 0) return res.status(400).json({ error: 'No records to save.' });

        const isCsv = format.toLowerCase() === 'csv';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = isCsv ? 'csv' : 'xlsx';
        const filename = `leads_${timestamp}.${extension}`;
        const filePath = path.join(LEADS_DIR, filename);

        const worksheet = XLSX.utils.json_to_sheet(records);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

        const TEMP_DIR = path.join(os.tmpdir(), 'apify_exports');
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        const tempFilePath = path.join(TEMP_DIR, filename);

        // 2. Write to file using SheetJS
        if (isCsv) {
            XLSX.writeFile(workbook, tempFilePath, { bookType: 'csv' });
        } else {
            XLSX.writeFile(workbook, tempFilePath, { bookType: 'xlsx' });
        }

        console.log(`[API] Temp file created for download: ${tempFilePath}`);

        // 3. Serve the file using res.download
        res.download(tempFilePath, filename, (err) => {
            if (err) {
                console.error('[API] Download error:', err);
            }
            // Cleanup temp file after some time or immediately
            setTimeout(() => {
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            }, 60000); // Wait 1 minute
        });

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

        console.log(`[API] Enrichment request for ${records.length} lead(s). Processing...`);

        const enrichLead = async (r) => {
            try {
                console.log(`[API] Enriching: ${r.company}`);
                
                // Call the specialized actor for CEO discovery
                let run;
                try {
                    run = await client.actor('2atkKH5LuF2AAPp3N').call({
                        mode: 'search_profiles',
                        searchQuery: `CEO at ${r.company}`,
                        maxProfilesPerSearch: 1,
                        discoverEmails: true,
                        includeContactInformation: true
                    });
                } catch (actorErr) {
                    console.error(`[API] Apify Actor Call Error for ${r.company}:`, actorErr.message);
                    return { ...r, ceoName: 'NA (Error)', ceoEmail: 'NA (Error)', ceoPhone: 'NA (Error)' };
                }

                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                console.log(`[API] Actor found ${items.length} items for ${r.company}`);
                
                if (items && items.length > 0) {
                    const ceo = items[0];
                    
                    // Log the first item for debugging schema
                    console.log(`[DEBUG] Item keys for ${r.company}:`, Object.keys(ceo).join(', '));
                    if (ceo.email) console.log(`[DEBUG] Email found: ${ceo.email}`);

                    // Robust Field Mapping
                    const ceoName = ceo.fullName || ceo.full_name || ceo.name || 'NA';
                    
                    let ceoEmail = 'NA';
                    if (ceo.email) {
                        ceoEmail = Array.isArray(ceo.email) ? ceo.email[0] : ceo.email;
                    } else if (ceo.emails && Array.isArray(ceo.emails)) {
                        ceoEmail = ceo.emails[0];
                    } else if (ceo.officialEmail) {
                        ceoEmail = ceo.officialEmail;
                    }

                    let ceoPhone = 'NA';
                    if (ceo.phone) {
                        ceoPhone = Array.isArray(ceo.phone) ? ceo.phone[0] : ceo.phone;
                    } else if (ceo.phone_number) {
                        ceoPhone = ceo.phone_number;
                    } else if (ceo.phoneNumbers && Array.isArray(ceo.phoneNumbers)) {
                        ceoPhone = ceo.phoneNumbers[0];
                    }

                    return {
                        ...r,
                        ceoName: ceoName !== 'NA' ? ceoName : (r.ceoName || 'NA'),
                        ceoEmail: ceoEmail !== 'NA' ? ceoEmail : (r.ceoEmail || 'NA'),
                        ceoPhone: ceoPhone !== 'NA' ? ceoPhone : (r.ceoPhone || 'NA')
                    };
                }
                
                console.log(`[API] No enrichment data found for ${r.company}`);
                return { ...r };

            } catch (err) {
                console.error(`[API] Enrichment failed for ${r.company}:`, err.message);
                return { ...r }; // Return original record on failure
            }
        };

        // Process sequentially or in very small batches for stability
        const enrichedRecords = [];
        try {
            for (const record of records) {
                const result = await enrichLead(record);
                enrichedRecords.push(result);
            }
            res.json({ records: enrichedRecords });
        } catch (loopErr) {
            console.error('[API] Enrichment Loop Error:', loopErr.message);
            res.status(500).json({ error: 'Failed to complete enrichment batch due to network error.' });
        }

    } catch(err) {
        console.error('[API] Global Enrichment Error:', err.message);
        res.status(500).json({ error: 'Internal server error during enrichment.' });
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🎉 [v2] Server is running on http://localhost:${PORT}`);
});
