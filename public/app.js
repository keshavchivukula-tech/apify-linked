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
    
    // Management Elements
    const selectAll = document.getElementById('selectAll');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const selectionInfo = document.getElementById('selectionInfo');
    const selectedCount = document.getElementById('selectedCount');
    
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

            // Initialize all records as selected by default
            currentRecords = data.records.map((r, index) => ({ 
                ...r, 
                id: index, 
                selected: true 
            }));

            renderTable();

            // Stats Update
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
        const selectedLeads = currentRecords.filter(r => r.selected);
        
        if (selectedLeads.length === 0) {
            alert('Please select at least one lead to enrich.');
            return;
        }

        const originalText = enrichBtn.innerHTML;
        enrichBtn.disabled = true;
        enrichBtn.innerHTML = `<i data-lucide="loader" class="spinner"></i> Enriching ${selectedLeads.length} leads... (2-4 mins)`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const response = await fetch('/api/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: selectedLeads })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            // Update only the enriched matches back into currentRecords
            data.records.forEach(updated => {
                const idx = currentRecords.findIndex(r => r.company === updated.company && r.title === updated.title);
                if (idx !== -1) currentRecords[idx] = { ...currentRecords[idx], ...updated };
            });

            renderTable();
            
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
        const selectedLeads = currentRecords.filter(r => r.selected);
        
        if (selectedLeads.length === 0) {
            alert('Please select at least one lead to export.');
            return;
        }

        const originalText = approveBtn.textContent;
        
        approveBtn.textContent = 'Generating Excel...';
        approveBtn.disabled = true;
        downloadFallback.classList.add('hidden');

        try {
            // Send selected records to backend
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: selectedLeads })
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

    // --- Lead Management Logic ---

    function renderTable() {
        tableBody.innerHTML = '';
        
        if (currentRecords.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: #a0aec0;">No leads remaining. Run a new search to find more.</td></tr>';
            resultsStats.textContent = 'Found 0 matching jobs';
            selectionInfo.classList.add('hidden');
            deleteSelectedBtn.classList.add('hidden');
            return;
        }

        currentRecords.forEach((record, index) => {
            const tr = document.createElement('tr');
            if (record.selected) tr.classList.add('selected-row');
            
            tr.innerHTML = `
                <td><input type="checkbox" class="lead-checkbox" data-index="${index}" ${record.selected ? 'checked' : ''}></td>
                <td><strong>${record.company}</strong></td>
                <td class="text-secondary">${record.ceoName || 'NA'}</td>
                <td class="text-secondary">${record.ceoEmail || 'NA'}</td>
                <td class="text-secondary">${record.ceoPhone || 'NA'}</td>
                <td>${record.title}</td>
                <td>${record.location}</td>
                <td class="text-right">
                    <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
                        <a href="${record.jobUrl}" target="_blank" class="view-link" title="View Job">
                            <i data-lucide="external-link" style="width:16px;"></i>
                        </a>
                        <button class="row-delete-btn" data-index="${index}" title="Remove Lead">
                            <i data-lucide="trash-2" style="width:16px;"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const selected = currentRecords.filter(r => r.selected).length;
        selectedCount.textContent = selected;
        
        if (selected > 0) {
            selectionInfo.classList.remove('hidden');
            deleteSelectedBtn.classList.remove('hidden');
        } else {
            selectionInfo.classList.add('hidden');
            deleteSelectedBtn.classList.add('hidden');
        }

        selectAll.checked = selected === currentRecords.length && currentRecords.length > 0;
    }

    // Toggle Single Row Selection
    tableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('lead-checkbox')) {
            const index = e.target.dataset.index;
            currentRecords[index].selected = e.target.checked;
            renderTable();
        }
    });

    // Toggle All Selection
    selectAll.addEventListener('change', () => {
        const isChecked = selectAll.checked;
        currentRecords.forEach(r => r.selected = isChecked);
        renderTable();
    });

    // Individual Delete
    tableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.row-delete-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            if (confirm(`Remove "${currentRecords[index].company}" from results?`)) {
                currentRecords.splice(index, 1);
                renderTable();
            }
        }
    });

    // Bulk Delete
    deleteSelectedBtn.addEventListener('click', () => {
        const selectedCount = currentRecords.filter(r => r.selected).length;
        if (confirm(`Are you sure you want to remove ${selectedCount} selected leads?`)) {
            currentRecords = currentRecords.filter(r => !r.selected);
            renderTable();
        }
    });

});
