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
    const dayNumber = document.getElementById('dayNumber');
    const daySelect = document.getElementById('daySelect');
    const scriptureList = document.getElementById('scriptureList');
    const titleDisplay = document.getElementById('readingTitle');
    const refDisplay = document.getElementById('readingRef');
    const contentDisplay = document.getElementById('verseText');
    const spinner = document.getElementById('spinner');

    // Search modal elements
    const searchBtn = document.getElementById('searchBtn');
    const searchModal = document.getElementById('searchModal');
    const searchBackdrop = document.getElementById('searchBackdrop');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const searchMeta = document.getElementById('searchMeta');
    const searchResults = document.getElementById('searchResults');

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

        // 2. Set Today
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        currentDay = (dayOfYear > 0) ? dayOfYear : 1;

        loadDay(currentDay);

    } catch (err) {
        alert("CRITICAL ERROR: " + err.message); // Popup so you can't miss it
        contentDisplay.innerHTML = `<p style="color:red; font-weight:bold;">System Error: ${err.message}</p>`;
    }

    // --- BUTTONS ---
    document.getElementById('prevBtn').addEventListener('click', () => changeDay(-1));
    document.getElementById('nextBtn').addEventListener('click', () => changeDay(1));
    document.getElementById('completeCheck').addEventListener('change', toggleComplete);

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

    function buildDaySelectOptions() {
        if (!daySelect) return;
        const frag = document.createDocumentFragment();
        for (let d = 1; d <= 365; d++) {
            const opt = document.createElement('option');
            opt.value = String(d);
            opt.textContent = `Day ${d}`;
            frag.appendChild(opt);
        }
        daySelect.innerHTML = "";
        daySelect.appendChild(frag);
    }

    buildDaySelectOptions();

    if (daySelect) {
        daySelect.addEventListener('change', () => {
            const d = parseInt(daySelect.value);
            if (d && d > 0) loadDay(d);
        });
    }

    // --- FUNCTIONS ---

    function changeDay(offset) {
        loadDay(currentDay + offset);
    }

    function toggleComplete() {
        // (Checkbox logic same as before)
        const chk = document.getElementById('completeCheck');
        if (chk.checked) {
            if (!completedDays.includes(currentDay)) completedDays.push(currentDay);
        } else {
            completedDays = completedDays.filter(d => d !== currentDay);
        }
        localStorage.setItem('bibleProgress', JSON.stringify(completedDays));
        updateCheckboxUI();
    }

    function updateCheckboxUI() {
        const chk = document.getElementById('completeCheck');
        const lbl = document.getElementById('completeLabel');
        const txt = document.getElementById('completeText');

        if (completedDays.includes(currentDay)) {
            chk.checked = true;
            lbl.classList.add('done');
            txt.innerText = "Completed!";
        } else {
            chk.checked = false;
            lbl.classList.remove('done');
            txt.innerText = "Mark as Complete";
        }
    }

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
            return `<li class="scripture-item"><a href="#" data-ref="${encodeURIComponent(r)}">${safe}</a><small>Read</small></li>`;
        }).join("");
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
            const res = await fetch(`https://bible-api.com/${encodeURIComponent(q)}`);
            if (!res.ok) {
                if (searchMeta) searchMeta.textContent = "";
                if (searchResults) {
                    searchResults.innerHTML = `<div class="search-error">No results for “${q}” (Status: ${res.status}). Try a reference like “John 3:16”.</div>`;
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

    async function loadDay(day) {
        if (day < 1) return;
        currentDay = day;
        updateCheckboxUI();
        if (dayNumber) dayNumber.textContent = String(currentDay);
        if (daySelect) daySelect.value = String(currentDay);

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
            if (titleDisplay) titleDisplay.innerText = `Day ${day}`;
            contentDisplay.innerHTML = `<div style='text-align:center; margin-top:40px;'>
            <h3>No Data</h3>
            <p>Plan.json has no entry for Day ${day}.</p>
            </div>`;
            return;
        }

        const cleanRef = plan.verses.replace(/"/g, '').trim();
        if (titleDisplay) titleDisplay.innerText = `Day ${day}`;
        if (refDisplay) refDisplay.innerText = cleanRef;
        renderScriptureList(cleanRef);

        if (!cleanRef) {
            spinner.style.display = 'none';
            contentDisplay.innerHTML = "<p>No verses listed for this day.</p>";
            return;
        }

        try {
            const chapters = cleanRef.split(';');
            const promises = chapters.map(async (chap) => {
                const clean = chap.trim();
                if(!clean) return null;

                // Fetch
                console.log(`Fetching API: ${clean}`);
                const res = await fetch(`https://bible-api.com/${encodeURIComponent(clean)}`);
                if(!res.ok) {
                    console.error(`API Error for ${clean}: ${res.status}`);
                    return { error: true, ref: clean, status: res.status };
                }
                return await res.json();
            });

            const results = await Promise.all(promises);

            let html = "";
            results.forEach(data => {
                if (!data) return;

                if (data.error) {
                    html += `<p style="color:red; border:1px solid red; padding:10px;">Error loading ${data.ref} (Status: ${data.status})</p>`;
                } else {
                    html += `<div class="chapter-block"><h3 class="chapter-header">${data.reference}</h3><p>`;
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
});
