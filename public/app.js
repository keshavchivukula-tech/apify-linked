document.addEventListener('DOMContentLoaded', () => {
    // --- Supabase Configuration ---
    // PLEASE UPDATE THESE KEYS with your Supabase Project Details
    const SUPABASE_URL = 'https://wjjdfbpofwylzoovtxcq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqamRmYnBvZnd5bHpvb3Z0eGNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTE5MTksImV4cCI6MjA5MTk4NzkxOX0.sjwUYCoJwGM-gmcWEp-As7qt2YaJOYtt8Y9Uj21--d4';
    
    // Initialize Supabase Client
    const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
    const downloadFallback = document.getElementById('downloadFallback');
    const manualDownloadLink = document.getElementById('manualDownloadLink');
    
    // Management Elements
    const selectAll = document.getElementById('selectAll');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const selectionInfo = document.getElementById('selectionInfo');
    const selectedCount = document.getElementById('selectedCount');
    
    let currentRecords = []; // Holds the approved records for the CSV
    let enrichingIds = new Set(); // IDs of records currently being enriched

    // --- Navbar & Scroll Spy ---
    function initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('section[id]');
        const navbar = document.querySelector('.navbar');

        // Smooth Scroll for Nav Links
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href.startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(href);
                    if (target) {
                        window.scrollTo({
                            top: target.offsetTop - 80, // Offset for fixed navbar
                            behavior: 'smooth'
                        });
                    }
                }
            });
        });

        // Scroll Spy Logic
        window.addEventListener('scroll', () => {
            let current = '';
            const scrollPos = window.scrollY + 100;

            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                }
            });

            // Sticky Navbar Shadow
            if (window.scrollY > 20) {
                navbar.style.boxShadow = 'var(--shadow-lg)';
            } else {
                navbar.style.boxShadow = 'none';
            }
        });
    }

    initNavigation();

    // --- Slider Logic ---
    function initSlider() {
        const slider = document.getElementById('heroSlider');
        if (!slider) return;
        
        const slides = slider.querySelectorAll('.slide');
        const dots = slider.querySelectorAll('.slider-dot');
        let currentSlide = 0;
        let slideInterval;

        function showSlide(index) {
            slides.forEach(s => s.classList.remove('active'));
            dots.forEach(d => d.classList.remove('active'));
            
            slides[index].classList.add('active');
            dots[index].classList.add('active');
            currentSlide = index;
        }

        function nextSlide() {
            let next = (currentSlide + 1) % slides.length;
            showSlide(next);
        }

        function startInterval() {
            slideInterval = setInterval(nextSlide, 5000);
        }

        function resetInterval() {
            clearInterval(slideInterval);
            startInterval();
        }

        dots.forEach(dot => {
            dot.addEventListener('click', () => {
                const index = parseInt(dot.dataset.index);
                showSlide(index);
                resetInterval();
            });
        });

        startInterval();
    }

    initSlider();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted!');

        const keyword = document.getElementById('keyword').value;
        const location = document.getElementById('location').value;
        const jobsNumber = document.getElementById('jobsNumber').value;
        const datePosted = document.getElementById('datePosted').value;

        // UI Loading State
        submitBtn.disabled = true;
        btnText.textContent = 'Extracting Leads...';
        spinner.classList.remove('hidden');
        statusBox.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        statusMessage.textContent = 'Engaging scraper. This may take a minute...';
        statusMessage.style.color = '#64748b'; // Muted Slate

        try {
            console.log('Calling scraper...');
            // Call Local Express API instead of Supabase Edge Function for better reliability
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, location, jobsNumber, datePosted })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Scrape failed');

            console.log('Scrape successful!', data);

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
            
            // Scroll to results
            resultsPanel.scrollIntoView({ behavior: 'smooth' });
            
            // Background reset on main panel
            submitBtn.disabled = false;
            btnText.textContent = 'Start Extraction';
            spinner.classList.add('hidden');
            statusBox.classList.add('hidden');
            progressContainer.classList.add('hidden');

            showToast(`Successfully extracted ${currentRecords.length} leads!`, 'success');

        } catch (error) {
            console.error('Scrape Error:', error);
            statusMessage.textContent = `⚠️ Error: ${error.message}`;
            statusMessage.style.color = '#ef4444';
            progressContainer.classList.add('hidden');
            
            // Reset button
            submitBtn.disabled = false;
            btnText.textContent = 'Start Extraction';
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
        
        // Mark all selected leads as enriching
        selectedLeads.forEach(l => enrichingIds.add(l.id));
        renderTable(); 
        
        const total = selectedLeads.length;
        let successCount = 0;
        let failCount = 0;

        try {
            for (let i = 0; i < total; i++) {
                const lead = selectedLeads[i];
                
                // Update button text to show progress
                enrichBtn.innerHTML = `<i data-lucide="loader" class="spinner"></i> Enriching ${i + 1}/${total}...`;
                if (window.lucide) window.lucide.createIcons();

                try {
                    // Call Local Express API
                    const response = await fetch('/api/enrich', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ records: [lead] })
                    });

                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Enrichment failed');

                    // Update the match back into currentRecords
                    if (data.records && data.records.length > 0) {
                        const updated = data.records[0];
                        const idx = currentRecords.findIndex(r => r.company === updated.company && r.title === updated.title);
                        if (idx !== -1) {
                            currentRecords[idx] = { ...currentRecords[idx], ...updated };
                            successCount++;
                        }
                    }
                    
                    // Re-render table after EACH success for real-time feedback
                    renderTable();

                } catch (err) {
                    console.error(`Failed to enrich ${lead.company}:`, err);
                    failCount++;
                }
            }

            enrichBtn.innerHTML = `✅ Done (${successCount} s, ${failCount} f)`;

        } catch (error) {
            console.error('Global Enrichment Loop Error:', error);
            alert('Enrichment process was interrupted. Check console for details.');
        } finally {
            enrichingIds.clear();
            // ALWAYS reset the button state
            setTimeout(() => {
                enrichBtn.innerHTML = originalText;
                enrichBtn.disabled = false;
                renderTable(); 
                if (window.lucide) window.lucide.createIcons();
            }, 3000);
        }
    });

    // Go back to search form
    backBtn.addEventListener('click', () => {
        resultsPanel.classList.add('hidden');
        mainPanel.classList.remove('hidden');
    });

    // Unified Export Function (supports CSV and XLSX)
    async function handleExport(format = 'xlsx') {
        const selectedLeads = currentRecords.filter(r => r.selected);
        
        if (selectedLeads.length === 0) {
            alert('Please select at least one lead to export.');
            return;
        }

        const targetBtn = format === 'csv' ? downloadCsvBtn : approveBtn;
        const originalText = targetBtn.innerHTML;
        const extension = format.toUpperCase();
        
        targetBtn.innerHTML = `<i data-lucide="loader" class="spinner"></i> Generating ${extension}...`;
        targetBtn.disabled = true;
        downloadFallback.classList.add('hidden');

        try {
            // Send selected records and format to backend
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: selectedLeads, format })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
                throw new Error(errorData.error || `Failed to generate ${extension} file`);
            }
            
            // Get the data and create a typed blob (Distinguish between text and binary)
            let data;
            if (format === 'csv') {
                data = await response.text();
            } else {
                data = await response.arrayBuffer();
            }
            
            const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const blob = new Blob([data], { type: mimeType });
            const downloadUrl = window.URL.createObjectURL(blob);
            const filename = `leads_export.${format}`;

            // 1. Show manual download link as a fallback
            manualDownloadLink.href = downloadUrl;
            manualDownloadLink.download = filename;
            downloadFallback.classList.remove('hidden');

            // 2. Automatic trigger (Following user's "important" suggestion)
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Success feedback
            targetBtn.innerHTML = `✅ ${extension} Ready!`;
            setTimeout(() => {
                targetBtn.innerHTML = originalText;
                targetBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
                window.URL.revokeObjectURL(downloadUrl);
            }, 5000);
            
        } catch(err) {
            alert(`Error creating ${extension}: ` + err.message);
            targetBtn.innerHTML = originalText;
            targetBtn.disabled = false;
            downloadFallback.classList.add('hidden');
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // Attach listeners to both buttons
    approveBtn.addEventListener('click', () => handleExport('xlsx'));
    downloadCsvBtn.addEventListener('click', () => handleExport('csv'));

    // --- Lead Management Logic ---
    
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
        toast.innerHTML = `
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();
        
        // Remove toast after animation
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    function renderTable() {
        tableBody.innerHTML = '';
        
        // Update Stats Count
        resultsStats.textContent = `Found ${currentRecords.length} leads in your workspace.`;

        if (currentRecords.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: #a0aec0;">No leads remaining. Run a new search to find more.</td></tr>';
            selectionInfo.classList.add('hidden');
            deleteSelectedBtn.classList.add('hidden');
            return;
        }

        currentRecords.forEach((record, index) => {
            const tr = document.createElement('tr');
            if (record.selected) tr.classList.add('selected-row');
            
            const isLocked = enrichingIds.has(record.id);
            
            tr.innerHTML = `
                <td><input type="checkbox" class="lead-checkbox" data-index="${index}" ${record.selected ? 'checked' : ''} ${isLocked ? 'disabled' : ''}></td>
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
                        <button type="button" class="row-delete-btn" data-index="${index}" title="Remove Lead" ${isLocked ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
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
        
        selectAll.disabled = enrichingIds.size > 0; // Disable select all if any batch is processing
        selectAll.checked = selected === currentRecords.length && currentRecords.length > 0;
        
        // If any of the currently selected records are being enriched, disable bulk delete
        const anySelectedIsEnriching = currentRecords.some(r => r.selected && enrichingIds.has(r.id));

        if (anySelectedIsEnriching) {
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.style.opacity = '0.5';
            deleteSelectedBtn.style.cursor = 'not-allowed';
        } else {
            deleteSelectedBtn.disabled = false;
            deleteSelectedBtn.style.opacity = '1';
            deleteSelectedBtn.style.cursor = 'pointer';
        }
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

    // Individual Delete (Non-intrusive)
    tableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.row-delete-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            const recordId = currentRecords[index]?.id;
            
            if (enrichingIds.has(recordId)) return; // Guard
            
            e.preventDefault();
            e.stopPropagation();
            
            const tr = deleteBtn.closest('tr');
            const companyName = currentRecords[index]?.company || 'Lead';

            // Animation first
            tr.classList.add('deleting-row');
            
            setTimeout(() => {
                currentRecords.splice(index, 1);
                renderTable();
                showToast(`Removed "${companyName}" from list`, 'success');
            }, 300); // 300ms match CSS animation
        }
    });

    // Bulk Delete (Non-intrusive)
    deleteSelectedBtn.addEventListener('click', () => {
        const selectedLeadsCount = currentRecords.filter(r => r.selected).length;
        if (selectedLeadsCount === 0) return;

        // Ensure we don't bulk delete any records currently enriching
        const anyEnriching = currentRecords.some(r => r.selected && enrichingIds.has(r.id));
        if (anyEnriching) return; // Guard

        // Immediate removal for bulk
        currentRecords = currentRecords.filter(r => !r.selected);
        renderTable();
        showToast(`Bulk deleted ${selectedLeadsCount} leads`, 'success');
    });

});
