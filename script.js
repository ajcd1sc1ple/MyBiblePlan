document.addEventListener('DOMContentLoaded', async () => {

    // --- DEBUG: CONFIRM NEW FILE LOADED ---
    console.log("%c SCRIPT LOADED: V3 (Debug Mode)", "background: green; color: white; padding: 5px; font-weight: bold;");

    // --- PWA (Install + Offline) ---
    let deferredInstallPrompt = null;
    const installBtn = document.getElementById('installBtn');

    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("./sw.js");
            console.log("Service Worker registered.");
        } catch (e) {
            console.warn("Service Worker registration failed:", e);
        }
    }

    function setInstallBtnState(state) {
        if (!installBtn) return;
        // states: hidden | disabled | ready | installed
        if (state === "hidden") {
            installBtn.style.display = "none";
            return;
        }
        installBtn.style.display = "";

        if (state === "installed") {
            installBtn.disabled = true;
            installBtn.textContent = "Installed";
            return;
        }

        if (state === "ready") {
            installBtn.disabled = false;
            installBtn.textContent = "Install app";
            return;
        }

        // disabled
        installBtn.disabled = true;
        installBtn.textContent = "Install app";
    }

    const isStandalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true; // iOS Safari

    if (isStandalone) setInstallBtnState("installed");
    else setInstallBtnState("disabled");

    window.addEventListener("beforeinstallprompt", (e) => {
        // Prevent the mini-infobar
        e.preventDefault();
        deferredInstallPrompt = e;
        setInstallBtnState("ready");
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        setInstallBtnState("installed");
    });

    if (installBtn) {
        installBtn.addEventListener("click", async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                try {
                    await deferredInstallPrompt.userChoice;
                } catch (_) {
                    // ignore
                }
                deferredInstallPrompt = null;
                // If they installed, appinstalled will fire; otherwise keep disabled.
                setInstallBtnState("disabled");
                return;
            }

            // Fallback (not installable or iOS Safari): give a helpful hint
            const ua = navigator.userAgent || "";
            const isIOS = /iPad|iPhone|iPod/.test(ua);
            if (isIOS) {
                alert("To install: tap Share, then 'Add to Home Screen'.");
            } else {
                alert("Install isn’t available yet. Use a secure (HTTPS) site and a supported browser (Chrome/Edge) to enable PWA install.");
            }
        });
    }

    // --- STATE ---
    let currentDay = 1;
    let completedDays = [];
    let BIBLE_PLAN = [];

    // --- ELEMENTS ---
    const contentDisplay = document.getElementById('verseText');
    const spinner = document.getElementById('spinner');
    const chapterBtn = document.getElementById('chapterBtn');
    const currentChapter = document.getElementById('currentChapter');
    const dayNumber = document.getElementById('dayNumber');
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const completeCheck = document.getElementById('completeCheck');
    const completeLabel = document.getElementById('completeLabel');
    const completeText = document.getElementById('completeText');
    const completionCheckmark = document.getElementById('completionCheckmark');
    
    // Day select modal
    const daySelectModal = document.getElementById('daySelectModal');
    const daySelectBackdrop = document.getElementById('daySelectBackdrop');
    const daySelectCloseBtn = document.getElementById('daySelectCloseBtn');
    const daySelectInput = document.getElementById('daySelectInput');
    const daySelectGoBtn = document.getElementById('daySelectGoBtn');

    // Search modal elements
    const searchBtn = document.getElementById('searchBtn');
    const searchModal = document.getElementById('searchModal');
    const searchBackdrop = document.getElementById('searchBackdrop');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const searchMeta = document.getElementById('searchMeta');
    const searchResults = document.getElementById('searchResults');

    // --- FONT SIZE ---
    const fontSizeBtn = document.getElementById('fontSizeBtn');
    const fontSizeModal = document.getElementById('fontSizeModal');
    const fontSizeBackdrop = document.getElementById('fontSizeBackdrop');
    const fontSizeCloseBtn = document.getElementById('fontSizeCloseBtn');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const fontSizes = [0.9, 1.0, 1.12, 1.25, 1.4, 1.6]; // rem values
    const fontSizePercentages = ['80%', '89%', '100%', '112%', '125%', '143%'];
    let currentFontSizeIndex = parseInt(localStorage.getItem('fontSizeIndex') || '2', 10); // default to 1.12rem (index 2)
    if (currentFontSizeIndex < 0 || currentFontSizeIndex >= fontSizes.length) currentFontSizeIndex = 2;

    function applyFontSize() {
        if (!contentDisplay) return;
        const size = fontSizes[currentFontSizeIndex];
        contentDisplay.style.fontSize = `${size}rem`;
        localStorage.setItem('fontSizeIndex', String(currentFontSizeIndex));
        if (fontSizeSlider) fontSizeSlider.value = String(currentFontSizeIndex);
        if (fontSizeValue) fontSizeValue.textContent = fontSizePercentages[currentFontSizeIndex];
    }

    function openFontSizeModal() {
        if (!fontSizeModal) return;
        fontSizeModal.classList.add('is-open');
        fontSizeModal.setAttribute('aria-hidden', 'false');
        if (fontSizeSlider) fontSizeSlider.focus();
    }

    function closeFontSizeModal() {
        if (!fontSizeModal) return;
        fontSizeModal.classList.remove('is-open');
        fontSizeModal.setAttribute('aria-hidden', 'true');
    }

    if (fontSizeBtn) {
        fontSizeBtn.addEventListener('click', openFontSizeModal);
    }
    if (fontSizeCloseBtn) {
        fontSizeCloseBtn.addEventListener('click', closeFontSizeModal);
    }
    if (fontSizeBackdrop) {
        fontSizeBackdrop.addEventListener('click', closeFontSizeModal);
    }
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            currentFontSizeIndex = parseInt(e.target.value, 10);
            applyFontSize();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fontSizeModal && fontSizeModal.classList.contains('is-open')) {
            closeFontSizeModal();
        }
    });

    // Apply saved font size on load
    applyFontSize();

    try {
        // Load Progress
        completedDays = JSON.parse(localStorage.getItem('bibleProgress')) || [];

        // 1. Load the Plan
        console.log("Fetching plan.json...");
        const response = await fetch('plan.json');

        if (!response.ok) {
            throw new Error(`Server returned ${response.status} for plan.json`);
        }

        BIBLE_PLAN = await response.json();
        console.log(`Plan loaded successfully. Found ${BIBLE_PLAN.length} days.`);

        // 2. Start with Day 1
        currentDay = 1;

        loadDay(currentDay);

    } catch (err) {
        alert("CRITICAL ERROR: " + err.message); // Popup so you can't miss it
        contentDisplay.innerHTML = `<p style="color:red; font-weight:bold;">System Error: ${err.message}</p>`;
    }

    // --- BUTTONS ---
    if (prevDayBtn) {
        prevDayBtn.addEventListener('click', () => {
            if (currentDay > 1) loadDay(currentDay - 1);
        });
    }
    if (nextDayBtn) {
        nextDayBtn.addEventListener('click', () => {
            if (currentDay < 365) loadDay(currentDay + 1);
        });
    }
    
    // Completion toggle functions
    function toggleComplete() {
        if (!completeCheck) return;
        if (completeCheck.checked) {
            if (!completedDays.includes(currentDay)) {
                completedDays.push(currentDay);
            }
        } else {
            completedDays = completedDays.filter(d => d !== currentDay);
        }
        localStorage.setItem('bibleProgress', JSON.stringify(completedDays));
        updateCheckboxUI();
    }
    
    function updateCheckboxUI() {
        if (!completeCheck || !completeLabel || !completeText) return;
        
        const isComplete = completedDays.includes(currentDay);
        completeCheck.checked = isComplete;
        
        if (isComplete) {
            completeLabel.classList.add('done');
            completeText.textContent = "Completed!";
            // Show checkmark icon
            if (completionCheckmark) {
                completionCheckmark.style.display = 'flex';
            }
        } else {
            completeLabel.classList.remove('done');
            completeText.textContent = "Mark as Complete";
            // Hide checkmark icon
            if (completionCheckmark) {
                completionCheckmark.style.display = 'none';
            }
        }
    }
    
    if (completeCheck) {
        completeCheck.addEventListener('change', toggleComplete);
    }
    
    // Chapter button opens day selector
    if (chapterBtn) {
        chapterBtn.addEventListener('click', () => {
            if (daySelectModal) {
                daySelectModal.classList.add('is-open');
                daySelectModal.setAttribute('aria-hidden', 'false');
                if (daySelectInput) {
                    daySelectInput.value = String(currentDay);
                    daySelectInput.focus();
                    daySelectInput.select();
                }
            }
        });
    }
    
    // Day select modal
    function closeDaySelectModal() {
        if (daySelectModal) {
            daySelectModal.classList.remove('is-open');
            daySelectModal.setAttribute('aria-hidden', 'true');
        }
    }
    
    if (daySelectCloseBtn) daySelectCloseBtn.addEventListener('click', closeDaySelectModal);
    if (daySelectBackdrop) daySelectBackdrop.addEventListener('click', closeDaySelectModal);
    if (daySelectGoBtn) {
        daySelectGoBtn.addEventListener('click', () => {
            if (daySelectInput) {
                const day = parseInt(daySelectInput.value, 10);
                if (day >= 1 && day <= 365) {
                    loadDay(day);
                    closeDaySelectModal();
                }
            }
        });
    }
    if (daySelectInput) {
        daySelectInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                daySelectGoBtn?.click();
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && daySelectModal && daySelectModal.classList.contains('is-open')) {
            closeDaySelectModal();
        }
    });

    // --- SEARCH MODAL ---
    function openSearch() {
        if (!searchModal) return;
        searchModal.classList.add('is-open');
        searchModal.setAttribute('aria-hidden', 'false');
        if (searchInput) {
            searchInput.focus();
            searchInput.select?.();
        }
    }
    function closeSearch() {
        if (!searchModal) return;
        searchModal.classList.remove('is-open');
        searchModal.setAttribute('aria-hidden', 'true');
    }
    if (searchBtn) searchBtn.addEventListener('click', openSearch);
    if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch);
    if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearch);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearch();
    });

    // Day selector removed in new design

    // --- FUNCTIONS ---

    function changeDay(offset) {
        loadDay(currentDay + offset);
    }

    // Completion toggle removed in new design

    function renderScriptureList(cleanRef) {
        if (!scriptureList) return;

        const refs = (cleanRef || "")
            .split(';')
            .map(r => r.trim())
            .filter(Boolean);

        if (!refs.length) {
            scriptureList.innerHTML = `<li class="scripture-item"><a href="#" tabindex="-1">No verses listed</a><small>—</small></li>`;
            return;
        }

        scriptureList.innerHTML = refs.map(r => {
            const safe = r.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<li class="scripture-item"><a href="#" data-ref="${encodeURIComponent(r)}">${safe}</a><button class="read-btn" data-ref="${encodeURIComponent(r)}" type="button">Read</button></li>`;
        }).join("");

        // Add click handlers to all Read buttons
        scriptureList.querySelectorAll('.read-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const ref = btn.getAttribute('data-ref');
                if (!ref) return;
                await loadScriptureReference(ref);
            });
        });
    }

    function getSectionTitle(reference) {
        // Map references to section titles
        const titleMap = {
            'Genesis 1': 'The Creation of the World',
            'Genesis 2': 'The Creation of the World',
            'Genesis 3': 'The Fall',
            // Add more as needed
        };
        
        // Try to match the reference
        for (const [key, title] of Object.entries(titleMap)) {
            if (reference && reference.includes(key.split(' ')[0])) {
                const chapter = reference.match(/\d+/);
                if (chapter && key.includes(chapter[0])) {
                    return title;
                }
            }
        }
        
        // Default: extract book name
        if (reference) {
            const book = reference.split(' ')[0];
            return `${book}`;
        }
        return '';
    }

    async function loadScriptureReference(ref) {
        if (!contentDisplay) return;

        // Update chapter button
        const chapterBtn = document.getElementById('currentChapter');
        if (chapterBtn) {
            const refParts = decodeURIComponent(ref).split(';')[0].trim();
            chapterBtn.textContent = refParts;
        }

        // Show loading
        contentDisplay.innerHTML = '';
        contentDisplay.appendChild(spinner);
        spinner.style.display = 'block';

        try {
            const chapters = expandReferences(decodeURIComponent(ref));
            const promises = chapters.map(async (chap) => {
                const clean = chap.trim();
                if(!clean) return null;

                // Fetch
                console.log(`Fetching API: ${clean}`);
                const res = await fetch(`https://bible-api.com/${encodeURIComponent(clean)}?translation=kjv`);
                if(!res.ok) {
                    console.error(`API Error for ${clean}: ${res.status}`);
                    return { error: true, ref: clean, status: res.status };
                }
                return await res.json();
            });

            const results = await Promise.all(promises);

            // Get section title based on reference
            const firstRef = results.find(r => r && !r.error);
            const sectionTitle = getSectionTitle(firstRef ? firstRef.reference : '');
            
            let html = "";
            if (sectionTitle) {
                html += `<h2 class="section-title-large">${sectionTitle}</h2>`;
            }
            
            results.forEach((data, idx) => {
                if (!data) return;

                if (data.error) {
                    html += `<p style="color:red; border:1px solid red; padding:10px;">Error loading ${data.ref} (Status: ${data.status})</p>`;
                } else {
                    html += `<div class="chapter-block">`;
                    html += `<h3 class="chapter-header">${data.reference}</h3><p>`;
                    if (data.verses) {
                        data.verses.forEach(v => {
                            html += `<span class="verse-num">${v.verse}</span>${v.text} `;
                        });
                    }
                    html += `</p></div>`;
                }
            });

            spinner.style.display = 'none';
            contentDisplay.innerHTML = html;

        } catch (err) {
            spinner.style.display = 'none';
            console.error("Fetch Logic Crash:", err);
            contentDisplay.innerHTML = `<p style="color:red">Javascript Error: ${err.message}</p>`;
        }
    }

    function renderBibleApiInto(containerEl, data) {
        if (!containerEl) return;
        if (!data || !data.reference) {
            containerEl.innerHTML = `<div class="search-error">No results.</div>`;
            return;
        }
        let html = "";
        html += `<div class="chapter-block"><h3 class="chapter-header">${data.reference}</h3><p>`;
        if (data.verses && Array.isArray(data.verses)) {
            data.verses.forEach(v => {
                html += `<span class="verse-num">${v.verse}</span>${v.text} `;
            });
        } else if (data.text) {
            html += data.text;
        }
        html += `</p></div>`;
        containerEl.innerHTML = html;
    }

    async function runSearch(query) {
        const q = (query || "").trim();
        if (!q) return;
        if (searchMeta) searchMeta.textContent = "Searching…";
        if (searchResults) searchResults.innerHTML = `<div class="loading-spinner" style="margin: 18px auto;"></div>`;
        try {
            const res = await fetch(`https://bible-api.com/${encodeURIComponent(q)}?translation=kjv`);
            if (!res.ok) {
                if (searchMeta) searchMeta.textContent = "";
                if (searchResults) {
                    searchResults.innerHTML = `<div class="search-error">No results for "${q}" (Status: ${res.status}). Try a reference like "John 3:16".</div>`;
                }
                return;
            }
            const data = await res.json();
            if (searchMeta) searchMeta.textContent = data.translation_name ? `Source: bible-api.com • ${data.translation_name}` : "Source: bible-api.com";
            renderBibleApiInto(searchResults, data);
        } catch (err) {
            if (searchMeta) searchMeta.textContent = "";
            if (searchResults) searchResults.innerHTML = `<div class="search-error">Search failed: ${err.message}</div>`;
        }
    }

    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            runSearch(searchInput ? searchInput.value : "");
        });
    }

    function expandReferences(refStr) {
        const out = [];
        if (!refStr) return out;
        const segments = refStr.split(';');
        segments.forEach(seg => {
            let s = seg.trim();
            if (!s) return;

            // Expand chapter ranges like "Genesis 1-3" => Genesis 1, Genesis 2, Genesis 3
            // (but do NOT touch verse ranges like "1 Kings 15:1-24" or "Psalm 119:1-88")
            if (!s.includes(':')) {
                const rangeMatch = s.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s*$/);
                if (rangeMatch) {
                    const book = rangeMatch[1].trim();
                    const start = parseInt(rangeMatch[2], 10);
                    const end = parseInt(rangeMatch[3], 10);
                    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start && (end - start) <= 200) {
                        for (let ch = start; ch <= end; ch++) out.push(`${book} ${ch}`);
                        return;
                    }
                }
            }

            // If we have a pattern like "Psalm 7, 27, 31, 34, 52" split into separate refs
            const m = s.match(/^([1-3]?\s?[A-Za-z ]+)\s+(.+)$/);
            if (m && m[2].includes(',')) {
                const book = m[1].trim();
                m[2].split(',').forEach(part => {
                    const num = part.trim();
                    if (!num) return;
                    out.push(`${book} ${num}`);
                });
            } else {
                out.push(s);
            }
        });
        return out;
    }

    async function loadDay(day) {
        if (day < 1 || day > 365) return;
        if (!contentDisplay || !spinner) {
            console.error("Content display or spinner element not found");
            return;
        }
        
        currentDay = day;
        if (dayNumber) dayNumber.textContent = String(currentDay);
        updateCheckboxUI();
        console.log(`Loading Day ${day}...`);

        // UI Reset
        contentDisplay.innerHTML = '';
        contentDisplay.appendChild(spinner);
        spinner.style.display = 'block';

        // Find Plan
        const plan = BIBLE_PLAN.find(p => p.day === currentDay);

        if (!plan) {
            console.warn(`Day ${day} not found in JSON.`);
            spinner.style.display = 'none';
            contentDisplay.innerHTML = `<div style='text-align:center; margin-top:40px;'>
            <h3>No Data</h3>
            <p>Plan.json has no entry for Day ${day}.</p>
            </div>`;
            return;
        }

        const cleanRef = plan.verses.replace(/"/g, '').trim();
        
        // Update chapter button
        if (currentChapter) {
            const firstRef = cleanRef.split(';')[0].trim();
            currentChapter.textContent = firstRef || 'Genesis 1';
        }

        if (!cleanRef) {
            spinner.style.display = 'none';
            contentDisplay.innerHTML = "<p>No verses listed for this day.</p>";
            return;
        }

        // Auto-load verses
        try {
            const chapters = expandReferences(cleanRef);
            console.log(`Expanded references:`, chapters);
            
            if (chapters.length === 0) {
                spinner.style.display = 'none';
                contentDisplay.innerHTML = "<p>No valid references found.</p>";
                return;
            }
            
            const promises = chapters.map(async (chap) => {
                const clean = chap.trim();
                if(!clean) return null;

                // Fetch
                console.log(`Fetching API: ${clean}`);
                const res = await fetch(`https://bible-api.com/${encodeURIComponent(clean)}?translation=kjv`);
                if(!res.ok) {
                    console.error(`API Error for ${clean}: ${res.status}`);
                    return { error: true, ref: clean, status: res.status };
                }
                const data = await res.json();
                console.log(`Loaded: ${clean}`, data);
                return data;
            });

            const results = await Promise.all(promises);
            console.log(`All results:`, results);

            // Get section title based on reference
            const firstRef = results.find(r => r && !r.error);
            const sectionTitle = getSectionTitle(firstRef ? firstRef.reference : '');
            
            let html = "";
            if (sectionTitle) {
                html += `<h2 class="section-title-large">${sectionTitle}</h2>`;
            }
            
            results.forEach((data, idx) => {
                if (!data) return;

                if (data.error) {
                    html += `<p style="color:red; border:1px solid red; padding:10px;">Error loading ${data.ref} (Status: ${data.status})</p>`;
                } else {
                    html += `<div class="chapter-block">`;
                    html += `<h3 class="chapter-header">${data.reference}</h3><p>`;
                    if (data.verses && Array.isArray(data.verses)) {
                        data.verses.forEach(v => {
                            html += `<span class="verse-num">${v.verse}</span>${v.text} `;
                        });
                    } else if (data.text) {
                        html += data.text;
                    }
                    html += `</p></div>`;
                }
            });

            spinner.style.display = 'none';
            contentDisplay.innerHTML = html;
            console.log("Verses loaded successfully");

        } catch (err) {
            spinner.style.display = 'none';
            console.error("Fetch Logic Crash:", err);
            contentDisplay.innerHTML = `<p style="color:red">Javascript Error: ${err.message}</p>`;
        }
    }
});
