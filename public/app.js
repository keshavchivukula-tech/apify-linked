document.addEventListener('DOMContentLoaded', () => {
    // Main Panel Elements
    const form = document.getElementById('scrapeForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnArrow = submitBtn.querySelector('.btn-arrow');
    const spinner = submitBtn.querySelector('.spinner');
    const statusBox = document.getElementById('statusBox');
    const statusMessage = document.getElementById('statusMessage');
    const progressContainer = document.getElementById('progressContainer');
    const mainPanel = document.getElementById('mainPanel');

    // Results Panel Elements
    const resultsPanel = document.getElementById('resultsPanel');
    const tableBody = document.getElementById('tableBody');
    const resultsStats = document.getElementById('resultsStats');
    const backBtn = document.getElementById('backBtn');
    const enrichBtn = document.getElementById('enrichBtn');
    const approveBtn = document.getElementById('approveBtn');
    const downloadFallback = document.getElementById('downloadFallback');
    const manualDownloadLink = document.getElementById('manualDownloadLink');
    
    let currentRecords = []; // Holds the approved records for the CSV

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const keyword = document.getElementById('keyword').value;
        const location = document.getElementById('location').value;
        const jobsNumber = document.getElementById('jobsNumber').value;
        const datePosted = document.getElementById('datePosted').value;

        // UI Loading State
        submitBtn.disabled = true;
        btnText.textContent = 'Searching...';
        spinner.classList.remove('hidden');
        statusBox.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        statusMessage.textContent = 'Fetching data. This may take a minute...';
        statusMessage.style.color = '#e2e8f0';

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, location, jobsNumber, datePosted })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            currentRecords = data.records;

            // Handle Empty Match Case
            if (currentRecords.length === 0) {
               statusMessage.textContent = `⚠️ Found 0 jobs perfectly matching the keyword "${keyword}". Try a broader term.`;
               statusMessage.style.color = '#fbbf24'; // Yellow
               progressContainer.classList.add('hidden');
               
               // Restore button
               submitBtn.disabled = false;
               btnText.textContent = 'Search LinkedIn';
               spinner.classList.add('hidden');
               return;
            }

            // Successfully got matches, build the review table
            tableBody.innerHTML = '';
            currentRecords.forEach(record => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${record.company}</strong></td>
                    <td class="text-secondary">${record.ceoName || 'NA'}</td>
                    <td class="text-secondary">${record.ceoEmail || 'NA'}</td>
                    <td class="text-secondary">${record.ceoPhone || 'NA'}</td>
                    <td>${record.title}</td>
                    <td>${record.location}</td>
                    <td class="text-right"><a href="${record.jobUrl}" target="_blank" class="view-link">View Job <i data-lucide="external-link" style="width:14px; height:14px; vertical-align:middle; margin-left:4px;"></i></a></td>
                `;
                tableBody.appendChild(tr);
            });

            // Re-initialize Lucide icons for new rows
            if (window.lucide) {
                window.lucide.createIcons();
            }

            // Update stats text
            resultsStats.textContent = `Found ${currentRecords.length} exact matches (from ${data.originalCount} initial scraped jobs).`;
            
            // Switch UI Panels
            mainPanel.classList.add('hidden');
            resultsPanel.classList.remove('hidden');
            
            // Background reset on main panel
            submitBtn.disabled = false;
            btnText.textContent = 'Search LinkedIn';
            spinner.classList.add('hidden');
            statusBox.classList.add('hidden');
            progressContainer.classList.add('hidden');

        } catch (error) {
            console.error('Scrape Error:', error);
            statusMessage.textContent = `⚠️ Error: ${error.message}`;
            statusMessage.style.color = '#ef4444';
            progressContainer.classList.add('hidden');
            
            // Reset button
            submitBtn.disabled = false;
            btnText.textContent = 'Search LinkedIn';
            spinner.classList.add('hidden');
        } 
    });

    // Stage 2: Lead Enrichment (CEO, Email, Phone) - REAL DATA
    enrichBtn.addEventListener('click', async () => {
        const originalText = enrichBtn.innerHTML;
        enrichBtn.disabled = true;
        enrichBtn.innerHTML = '<i data-lucide="loader" class="spinner"></i> Finding Real Contacts... (2-4 mins)';
        if (window.lucide) window.lucide.createIcons();

        try {
            const response = await fetch('/api/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: currentRecords })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            currentRecords = data.records;

            // Re-render table with enriched data
            tableBody.innerHTML = '';
            currentRecords.forEach(record => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${record.company}</strong></td>
                    <td class="text-secondary">${record.ceoName || 'NA'}</td>
                    <td class="text-secondary">${record.ceoEmail || 'NA'}</td>
                    <td class="text-secondary">${record.ceoPhone || 'NA'}</td>
                    <td>${record.title}</td>
                    <td>${record.location}</td>
                    <td class="text-right"><a href="${record.jobUrl}" target="_blank" class="view-link">View Job <i data-lucide="external-link" style="width:14px; height:14px; vertical-align:middle; margin-left:4px;"></i></a></td>
                `;
                tableBody.appendChild(tr);
            });

            if (window.lucide) window.lucide.createIcons();
            
            enrichBtn.innerHTML = '✅ Enriched';
            setTimeout(() => {
                enrichBtn.innerHTML = originalText;
                enrichBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }, 3000);

        } catch (error) {
            console.error('Enrichment Error:', error);
            alert('Enrichment failed: ' + error.message);
            enrichBtn.innerHTML = originalText;
            enrichBtn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    });

    // Go back to search form
    backBtn.addEventListener('click', () => {
        resultsPanel.classList.add('hidden');
        mainPanel.classList.remove('hidden');
    });

    // Approve the records and download the Excel file (.xlsx)
    approveBtn.addEventListener('click', async () => {
        const originalText = approveBtn.textContent;
        
        approveBtn.textContent = 'Generating Excel...';
        approveBtn.disabled = true;
        downloadFallback.classList.add('hidden');

        try {
            // Send records to backend to be saved as XLSX
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: currentRecords })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate Excel file');
            }

            // Handle the response as a binary blob
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            
            // Generate a filename based on current timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `leads_${timestamp}.xlsx`;

            // 1. Show manual download link as a fallback
            manualDownloadLink.href = downloadUrl;
            manualDownloadLink.download = filename;
            downloadFallback.classList.remove('hidden');

            // 2. Automatic trigger using a temporary link element
            // This is safer than window.location.href for blobs
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Success feedback
            approveBtn.textContent = '✅ Success! Downloaded.';
            setTimeout(() => {
                approveBtn.textContent = originalText;
                approveBtn.disabled = false;
            }, 5000);
            
        } catch(err) {
            alert('Error creating Excel: ' + err.message);
            approveBtn.textContent = originalText;
            approveBtn.disabled = false;
            downloadFallback.classList.add('hidden');
        }
    });

});
