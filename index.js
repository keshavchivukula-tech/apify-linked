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
    console.warn('[WARNING] APIFY_API_TOKEN is missing. Application will start but scraper functionality will be disabled.');
}

const client = new ApifyClient({ token: APIFY_API_TOKEN || 'MISSING' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LEADS_DIR = path.join(os.tmpdir(), 'apify_leads');
try {
    if (!fs.existsSync(LEADS_DIR)) fs.mkdirSync(LEADS_DIR, { recursive: true });
} catch (e) {
    console.error('[CRITICAL] Failed to create leads directory:', e.message);
}

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        token_configured: !!APIFY_API_TOKEN,
        env: process.env.NODE_ENV || 'production'
    });
});

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
        records = records.filter(r => {
            const titleLower = r.title.toLowerCase();
            return keywordParts.every(part => titleLower.includes(part));
        });
        
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
                const significantParts = keywordParts.filter(p => p.length > 2);
                if (significantParts.length === 0) return true;
                return significantParts.some(part => titleLower.includes(part));
            });
            console.log(`[API] Strict filter yielded 0 results. Falling back to loose match. Found ${records.length} jobs.`);
        } else {
            console.log(`[API] Strict job title filtering applied: ${records.length} jobs remain.`);
        }

        res.json({ message: 'Success', records, originalCount });

    } catch (error) {
        console.error(`[API] Scrape Error [${error.code || 'UNKNOWN'}]:`, error.message);
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

        const worksheet = XLSX.utils.json_to_sheet(records);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

        const TEMP_DIR = path.join(os.tmpdir(), 'apify_exports');
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        const tempFilePath = path.join(TEMP_DIR, filename);

        if (isCsv) {
            XLSX.writeFile(workbook, tempFilePath, { bookType: 'csv' });
        } else {
            XLSX.writeFile(workbook, tempFilePath, { bookType: 'xlsx' });
        }

        console.log(`[API] Temp file created for download: ${tempFilePath}`);

        res.download(tempFilePath, filename, (err) => {
            if (err) {
                console.error('[API] Download error:', err);
            }
            setTimeout(() => {
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            }, 60000);
        });

    } catch(err) {
        console.error('[API] Export error:', err);
        res.status(500).json({ error: 'Failed to generate Excel file.' });
    }
});

// Lead Enrichment Endpoint
app.post('/api/enrich', async (req, res) => {
    try {
        const { records } = req.body;
        if (!records || records.length === 0) return res.status(400).json({ error: 'No records to enrich.' });

        console.log(`[API] Enrichment request for ${records.length} lead(s). Processing...`);

        const enrichLead = async (r) => {
            try {
                console.log(`[API] Enriching: ${r.company}`);
                let run = await client.actor('2atkKH5LuF2AAPp3N').call({
                    mode: 'search_profiles',
                    searchQuery: `CEO at ${r.company}`,
                    maxProfilesPerSearch: 1,
                    discoverEmails: true,
                    includeContactInformation: true
                });

                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                if (items && items.length > 0) {
                    const ceo = items[0];
                    const ceoName = ceo.fullName || ceo.full_name || ceo.name || 'NA';
                    let ceoEmail = 'NA';
                    if (ceo.email) {
                        ceoEmail = Array.isArray(ceo.email) ? ceo.email[0] : ceo.email;
                    } else if (ceo.emails && Array.isArray(ceo.emails)) {
                        ceoEmail = ceo.emails[0];
                    }
                    let ceoPhone = 'NA';
                    if (ceo.phone) {
                        ceoPhone = Array.isArray(ceo.phone) ? ceo.phone[0] : ceo.phone;
                    }
                    return {
                        ...r,
                        ceoName: ceoName !== 'NA' ? ceoName : (r.ceoName || 'NA'),
                        ceoEmail: ceoEmail !== 'NA' ? ceoEmail : (r.ceoEmail || 'NA'),
                        ceoPhone: ceoPhone !== 'NA' ? ceoPhone : (r.ceoPhone || 'NA')
                    };
                }
                return { ...r };
            } catch (err) {
                console.error(`[API] Enrichment failed for ${r.company}:`, err.message);
                return { ...r };
            }
        };

        const enrichedRecords = [];
        for (const record of records) {
            const result = await enrichLead(record);
            enrichedRecords.push(result);
        }
        res.json({ records: enrichedRecords });

    } catch(err) {
        console.error('[API] Global Enrichment Error:', err.message);
        res.status(500).json({ error: 'Internal server error during enrichment.' });
    }
});

app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/')) return res.status(400).send('Invalid filename');
    const filePath = path.join(LEADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    res.download(filePath, (err) => {
        if (err) console.log(`[API] Download error: ${err.message}`);
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🎉 [v2] Server is running on http://localhost:${PORT}`);
});
