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
    let currentUser = null;
    let firebaseInitialized = false;

    // --- ELEMENTS ---
    const contentDisplay = document.getElementById('verseText');
    const spinner = document.getElementById('spinner');
    const chapterBtn = document.getElementById('chapterBtn');
    const currentChapter = document.getElementById('currentChapter');
    const dayNumber = document.getElementById('dayNumber');
    const completeCheck = document.getElementById('completeCheck');
    const completeLabel = document.getElementById('completeLabel');
    const completeText = document.getElementById('completeText');
    const completionCheckmark = document.getElementById('completionCheckmark');
    const authBtn = document.getElementById('authBtn');
    const authBtnText = document.getElementById('authBtnText');
    
    // Day select modal
    const daySelectModal = document.getElementById('daySelectModal');
    const daySelectBackdrop = document.getElementById('daySelectBackdrop');
    const daySelectCloseBtn = document.getElementById('daySelectCloseBtn');
    const dayListContainer = document.getElementById('dayListContainer');

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

    // Initialize Firebase (wait for it to be available)
    async function initFirebase() {
        if (window.firebaseAuth && window.firebaseDb) {
            firebaseInitialized = true;
            console.log("Firebase initialized");
            
            // Set up auth state listener
            const { onAuthStateChanged, signInWithPopup, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            onAuthStateChanged(window.firebaseAuth, async (user) => {
                currentUser = user;
                updateAuthUI();
                if (user) {
                    await loadProgressFromFirestore(user.uid);
                } else {
                    // Fallback to localStorage when logged out
                    loadProgressFromLocalStorage();
                }
            });
            
            // Set up auth button
            if (authBtn) {
                authBtn.addEventListener('click', async () => {
                    if (currentUser) {
                        await signOut(window.firebaseAuth);
                    } else {
                        try {
                            await signInWithPopup(window.firebaseAuth, window.googleProvider);
                        } catch (error) {
                            console.error("Sign in error:", error);
                            alert("Failed to sign in. Please check your Firebase configuration.");
                        }
                    }
                });
            }
        } else {
            console.warn("Firebase not available - using localStorage only");
            loadProgressFromLocalStorage();
        }
    }
    
    function updateAuthUI() {
        if (!authBtn || !authBtnText) return;
        if (currentUser) {
            authBtnText.textContent = "✓";
            authBtn.setAttribute('aria-label', `Signed in as ${currentUser.displayName || currentUser.email}`);
            authBtn.title = `Signed in as ${currentUser.displayName || currentUser.email}`;
        } else {
            authBtnText.textContent = "👤";
            authBtn.setAttribute('aria-label', 'Sign in with Google');
            authBtn.title = 'Sign in with Google to sync progress';
        }
    }
    
    function loadProgressFromLocalStorage() {
        const savedProgress = localStorage.getItem('bibleProgress');
        if (savedProgress) {
            try {
                completedDays = JSON.parse(savedProgress);
                console.log(`Loaded ${completedDays.length} completed days from localStorage.`);
            } catch (e) {
                console.warn("Failed to parse saved progress:", e);
                completedDays = [];
            }
        }
        updateCheckboxUI();
        if (typeof updateDayListActive === 'function') {
            updateDayListActive();
        }
    }
    
    async function loadProgressFromFirestore(userId) {
        if (!firebaseInitialized || !window.firebaseDb) return;
        
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const progressRef = doc(window.firebaseDb, 'users', userId);
            const progressSnap = await getDoc(progressRef);
            
            if (progressSnap.exists()) {
                const data = progressSnap.data();
                completedDays = data.completedDays || [];
                console.log(`Loaded ${completedDays.length} completed days from Firestore.`);
            } else {
                // No Firestore data, try to migrate from localStorage
                const savedProgress = localStorage.getItem('bibleProgress');
                if (savedProgress) {
                    try {
                        completedDays = JSON.parse(savedProgress);
                        // Save to Firestore
                        await saveProgressToFirestore(userId);
                        console.log("Migrated progress from localStorage to Firestore.");
                    } catch (e) {
                        completedDays = [];
                    }
                } else {
                    completedDays = [];
                }
            }
            updateCheckboxUI();
            if (typeof updateDayListActive === 'function') {
                updateDayListActive();
            }
        } catch (error) {
            console.error("Error loading from Firestore:", error);
            // Fallback to localStorage
            loadProgressFromLocalStorage();
        }
    }
    
    async function saveProgressToFirestore(userId) {
        if (!firebaseInitialized || !window.firebaseDb || !currentUser) return;
        
        try {
            const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const progressRef = doc(window.firebaseDb, 'users', userId);
            await setDoc(progressRef, {
                completedDays: completedDays,
                lastUpdated: new Date().toISOString()
            }, { merge: true });
            console.log("Progress saved to Firestore.");
        } catch (error) {
            console.error("Error saving to Firestore:", error);
        }
    }
    
    // Initialize Firebase after a short delay to ensure SDK is loaded
    setTimeout(() => {
        initFirebase();
    }, 500);

    try {
        // Load Progress (will be overridden by Firebase if logged in)
        loadProgressFromLocalStorage();

        // 1. Load the Plan
        console.log("Fetching plan.json...");
        const response = await fetch('plan.json');

        if (!response.ok) {
            throw new Error(`Server returned ${response.status} for plan.json`);
        }

        BIBLE_PLAN = await response.json();
        console.log(`Plan loaded successfully. Found ${BIBLE_PLAN.length} days.`);

        // 2. Build day list (for modal)
        buildDayList();

        // 3. Start with Day 1
        currentDay = 1;

        loadDay(currentDay);

    } catch (err) {
        alert("CRITICAL ERROR: " + err.message); // Popup so you can't miss it
        contentDisplay.innerHTML = `<p style="color:red; font-weight:bold;">System Error: ${err.message}</p>`;
    }

    // --- BUTTONS ---
    // Completion toggle functions
    async function toggleComplete() {
        if (!completeCheck) return;
        if (completeCheck.checked) {
            if (!completedDays.includes(currentDay)) {
                completedDays.push(currentDay);
            }
        } else {
            completedDays = completedDays.filter(d => d !== currentDay);
        }
        
        // Save to localStorage (always, for offline support)
        localStorage.setItem('bibleProgress', JSON.stringify(completedDays));
        
        // Save to Firestore if logged in
        if (currentUser) {
            await saveProgressToFirestore(currentUser.uid);
        }
        
        updateCheckboxUI();
        updateDayListActive();
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
    
    // Build day list for modal
    function buildDayList() {
        if (!dayListContainer || !BIBLE_PLAN.length) return;
        
        const frag = document.createDocumentFragment();
        for (let d = 1; d <= 365; d++) {
            const plan = BIBLE_PLAN.find(p => p.day === d);
            const ref = plan ? plan.verses.split(';')[0].trim() : `Day ${d}`;
            const isComplete = completedDays.includes(d);
            
            const item = document.createElement('div');
            item.className = 'day-list-item';
            if (d === currentDay) item.classList.add('is-active');
            if (isComplete) item.classList.add('is-complete');
            item.setAttribute('data-day', String(d));
            
            item.innerHTML = `
                <span class="day-list-item-number">Day ${d}</span>
                <span class="day-list-item-ref">${ref}</span>
                <span class="day-list-item-check">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" stroke="white" stroke-width="1.5" fill="none"/>
                        <path d="M5 8 L7 10 L11 6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </span>
            `;
            
            item.addEventListener('click', () => {
                loadDay(d);
                closeDaySelectModal();
            });
            
            frag.appendChild(item);
        }
        dayListContainer.innerHTML = '';
        dayListContainer.appendChild(frag);
    }
    
    function updateDayListActive() {
        if (!dayListContainer) return;
        const items = dayListContainer.querySelectorAll('.day-list-item');
        items.forEach(item => {
            const day = parseInt(item.getAttribute('data-day'), 10);
            item.classList.toggle('is-active', day === currentDay);
            item.classList.toggle('is-complete', completedDays.includes(day));
        });
    }
    
    // Day select modal
    function closeDaySelectModal() {
        if (daySelectModal) {
            daySelectModal.classList.remove('is-open');
            daySelectModal.setAttribute('aria-hidden', 'true');
        }
    }
    
    function openDaySelectModal() {
        if (daySelectModal) {
            buildDayList();
            daySelectModal.classList.add('is-open');
            daySelectModal.setAttribute('aria-hidden', 'false');
            // Scroll to active day
            setTimeout(() => {
                const activeItem = dayListContainer.querySelector('.day-list-item.is-active');
                if (activeItem) {
                    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }
    
    // Chapter button opens day selector
    if (chapterBtn) {
        chapterBtn.addEventListener('click', openDaySelectModal);
    }
    
    if (daySelectCloseBtn) daySelectCloseBtn.addEventListener('click', closeDaySelectModal);
    if (daySelectBackdrop) daySelectBackdrop.addEventListener('click', closeDaySelectModal);
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
        updateDayListActive();
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
