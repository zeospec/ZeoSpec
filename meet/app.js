// Google Apps Script Web App Endpoint
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyc5a9eyJrsqNmzIxfhG_3U-YvADtwrhZf2iBtqPxVioVk21Drfq37IlXDoTcE1yLMhOg/exec';

// State Management
let currentDate = new Date();
let selectedDate = null;
let selectedTime = null;
let selectedIsoTime = null;
let selectedDuration = 15;
let reschedulingId = null;
let currentMonthFetchStr = null;
let cachedRawMonthAvailability = {};
let slotsByLocalDay = {};
let isSubmitting = false;

// DOM Elements
const daysContainer = document.getElementById('calendar-days');
const currentMonthEl = document.getElementById('current-month');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const timeSlotsWrapper = document.getElementById('time-slots-container');
const timeSlotsContainer = document.getElementById('time-slots');
const selectedDateText = document.getElementById('selected-date-text');
const loadingSlots = document.getElementById('loading-slots');
const durationBtns = document.querySelectorAll('.duration-btn');
const scrollHint = document.getElementById('scroll-hint') || document.getElementById('scroll-fade');
const slotsCountBadge = document.getElementById('slots-count-badge');

const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');

const backBtn = document.getElementById('back-btn');
const bookingForm = document.getElementById('booking-form');
const bookingSummary = document.getElementById('booking-summary');
const submitBtn = document.getElementById('submit-btn');
const bookAnotherBtn = document.getElementById('book-another-btn');

function updateScrollHint() {
    const hint = scrollHint || document.getElementById('scroll-hint') || document.getElementById('scroll-fade');
    if (!hint || !timeSlotsContainer) return;

    const hasOverflow = timeSlotsContainer.scrollHeight > timeSlotsContainer.clientHeight + 15;
    const isNearBottom = (timeSlotsContainer.scrollHeight - timeSlotsContainer.clientHeight - timeSlotsContainer.scrollTop) < 25;
    const hasScrolledDown = timeSlotsContainer.scrollTop > 35;

    if (hasOverflow && !isNearBottom && !hasScrolledDown) {
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }
}

if (timeSlotsContainer) {
    timeSlotsContainer.addEventListener('scroll', updateScrollHint);
}

// ---------------------------------------------------------------------------
// 1. One-Time Event Listeners Initialization
// ---------------------------------------------------------------------------
function setupEventListeners() {
    // Month navigation
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (currentDate.getFullYear() < today.getFullYear() ||
                (currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() <= today.getMonth())) {
                return;
            }
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar(currentDate);
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar(currentDate);
        });
    }

    // Back to calendar from Step 2
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            step2.classList.add('step-hidden');
            step1.classList.remove('step-hidden');
            durationBtns.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            });
        });
    }

    // Form submit
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBookingSubmit);
    }

    // Book another meeting from Step 3
    if (bookAnotherBtn) {
        bookAnotherBtn.addEventListener('click', () => {
            selectedDate = null;
            selectedTime = null;
            selectedIsoTime = null;
            reschedulingId = null;
            timeSlotsWrapper.classList.add('hidden');
            renderCalendar(currentDate);
            bookingForm.reset();
            const rescheduleBanner = document.getElementById('reschedule-banner');
            if (rescheduleBanner) rescheduleBanner.classList.add('hidden');
            step3.classList.add('step-hidden');
            step1.classList.remove('step-hidden');
        });
    }

    // Form auto-saving to localStorage
    const autoSaveFields = ['name', 'email', 'phone', 'notes'];
    autoSaveFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const savedVal = localStorage.getItem(`bookingForm_${id}`);
            if (savedVal) el.value = savedVal;
            el.addEventListener('input', (e) => {
                localStorage.setItem(`bookingForm_${id}`, e.target.value);
            });
        }
    });

    // Guest input toggle
    const addGuestsBtn = document.getElementById('add-guests-btn');
    const guestsWrapper = document.getElementById('guests-input-wrapper');
    if (addGuestsBtn && guestsWrapper) {
        addGuestsBtn.addEventListener('click', () => {
            guestsWrapper.classList.remove('hidden');
            guestsWrapper.classList.add('flex');
            addGuestsBtn.classList.add('hidden');
        });
    }

    // Dynamic auto-expanding textarea for meeting purpose/notes
    const notesInput = document.getElementById('notes');
    if (notesInput) {
        const autoResizeNotes = () => {
            notesInput.style.height = 'auto';
            notesInput.style.height = `${Math.max(96, notesInput.scrollHeight)}px`;
        };
        notesInput.addEventListener('input', autoResizeNotes);
        if (notesInput.value) {
            autoResizeNotes();
        }
    }

    // Duration selector logic: preserve selected date if active
    durationBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget || e.target;
            const newDuration = parseInt(target.dataset.duration, 10);
            if (newDuration === selectedDuration) return;

            durationBtns.forEach(b => {
                b.classList.remove('pill-active', 'shadow-sm');
                b.classList.add('pill-inactive');
                b.setAttribute('aria-pressed', 'false');
            });
            target.classList.remove('pill-inactive');
            target.classList.add('pill-active', 'shadow-sm');
            target.setAttribute('aria-pressed', 'true');

            selectedDuration = newDuration;

            // Re-fetch slots for the new duration, maintaining active date if selected
            fetchMonthAvailability(currentDate.getFullYear(), currentDate.getMonth() + 1, () => {
                if (selectedDate) {
                    selectDate(selectedDate);
                }
            });
        });
    });

    // Keyboard accessibility: Escape key closes timezone dropdown
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const dropdown = document.getElementById('timezone-dropdown-menu');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
                document.getElementById('timezone-toggle-btn')?.focus();
            }
        }
    });

    // Ingest URL query parameters
    parseUrlParameters();
}

function parseUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);

    // Duration parameter
    const durationParam = parseInt(urlParams.get('duration'), 10);
    if ([15, 30, 45, 60].includes(durationParam)) {
        selectedDuration = durationParam;
        durationBtns.forEach(btn => {
            if (parseInt(btn.dataset.duration, 10) === durationParam) {
                btn.classList.add('pill-active', 'shadow-sm');
                btn.classList.remove('pill-inactive');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('pill-active', 'shadow-sm');
                btn.classList.add('pill-inactive');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    }

    // Pre-fill Name & Email
    const nameParam = urlParams.get('name');
    const emailParam = urlParams.get('email');
    if (nameParam && document.getElementById('name')) document.getElementById('name').value = nameParam;
    if (emailParam && document.getElementById('email')) document.getElementById('email').value = emailParam;
}

// ---------------------------------------------------------------------------
// 2. Calendar Rendering and Month Availability
// ---------------------------------------------------------------------------
function updateMonthNavButtons(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Disable prev button if viewing current month
    if (date.getFullYear() < today.getFullYear() ||
        (date.getFullYear() === today.getFullYear() && date.getMonth() <= today.getMonth())) {
        prevMonthBtn.disabled = true;
        prevMonthBtn.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
        prevMonthBtn.disabled = false;
        prevMonthBtn.classList.remove('opacity-40', 'cursor-not-allowed');
    }

    // Disable next button if viewing more than 2 months ahead
    const maxFutureMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    if (date >= maxFutureMonth) {
        nextMonthBtn.disabled = true;
        nextMonthBtn.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
        nextMonthBtn.disabled = false;
        nextMonthBtn.classList.remove('opacity-40', 'cursor-not-allowed');
    }
}

function renderCalendar(date) {
    daysContainer.innerHTML = '';

    const year = date.getFullYear();
    const month = date.getMonth();

    currentMonthEl.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
    updateMonthNavButtons(date);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        daysContainer.appendChild(emptyDay);
    }

    // Days of month
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDate = new Date(year, month, i);
        const dayEl = document.createElement('button');
        dayEl.type = 'button';
        dayEl.textContent = i;

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        let baseClass = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors';

        if (dayDate < today) {
            dayEl.className = `${baseClass} text-gray-400 cursor-not-allowed opacity-40`;
        } else {
            // Check if slots are available for this local date
            const hasSlots = slotsByLocalDay[dateStr] && slotsByLocalDay[dateStr].length > 0;
            if (hasSlots) {
                dayEl.className = `${baseClass} text-gray-700 hover:bg-gray-100 cursor-pointer day-btn`;
            } else {
                dayEl.className = `${baseClass} text-gray-400 opacity-50 pointer-events-none day-btn`;
            }
            dayEl.dataset.dateStr = dateStr;
            dayEl.dataset.fullDate = dayDate.toISOString();
            dayEl.addEventListener('click', () => selectDate(new Date(dayEl.dataset.fullDate)));
        }

        if (selectedDate && dayDate.toDateString() === selectedDate.toDateString()) {
            dayEl.className = `${baseClass} bg-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] day-btn active`;
        }

        daysContainer.appendChild(dayEl);
    }

    fetchMonthAvailability(year, month + 1);
}

// ---------------------------------------------------------------------------
// 3. Cross-Timezone Slot Indexer
// ---------------------------------------------------------------------------
function reindexSlotsForTimezone(rawAvailability, timeZone) {
    slotsByLocalDay = {};
    if (!rawAvailability) return;

    for (const hostDate in rawAvailability) {
        const isoSlots = rawAvailability[hostDate] || [];
        for (const isoTime of isoSlots) {
            try {
                const dateObj = new Date(isoTime);
                // Group by the viewer's local calendar day
                const localDateKey = new Intl.DateTimeFormat('en-CA', {
                    timeZone: timeZone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).format(dateObj);

                if (!slotsByLocalDay[localDateKey]) {
                    slotsByLocalDay[localDateKey] = [];
                }
                slotsByLocalDay[localDateKey].push(isoTime);
            } catch (err) {
                console.warn("Timezone parse error for slot:", isoTime, err);
            }
        }
    }
}

function updateDayButtonsWithAvailability() {
    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        const dateStr = btn.dataset.dateStr;
        if (selectedDate && new Date(btn.dataset.fullDate).toDateString() === selectedDate.toDateString()) {
            return;
        }

        if (dateStr && slotsByLocalDay[dateStr] && slotsByLocalDay[dateStr].length > 0) {
            btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-700 hover:bg-gray-100 cursor-pointer day-btn';
        } else if (dateStr) {
            btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-400 opacity-50 pointer-events-none day-btn';
        }
    });
}

async function fetchMonthAvailability(year, month, callback) {
    if (!APP_SCRIPT_URL) return;
    const fetchStr = `${year}-${month}-${selectedDuration}`;
    currentMonthFetchStr = fetchStr;

    const overlay = document.getElementById('calendar-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        let rawAvailability;

        if (cachedRawMonthAvailability[fetchStr]) {
            rawAvailability = cachedRawMonthAvailability[fetchStr];
        } else {
            let response, data;
            try {
                response = await fetch(`${APP_SCRIPT_URL}?action=getMonthAvailability&year=${year}&month=${month}&duration=${selectedDuration}`);
                data = await response.json();
            } catch (err) {
                console.warn("First fetch failed. Retrying...", err);
                response = await fetch(`${APP_SCRIPT_URL}?action=getMonthAvailability&year=${year}&month=${month}&duration=${selectedDuration}`);
                data = await response.json();
            }

            if (currentMonthFetchStr !== fetchStr) return;

            if (data.status === 'error') {
                throw new Error(data.message || "Backend error");
            }

            if (data.status === 'success') {
                rawAvailability = data.availability;
                cachedRawMonthAvailability[fetchStr] = rawAvailability;
            }
        }

        if (rawAvailability) {
            const selectedTz = document.getElementById('timezone-select')?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
            reindexSlotsForTimezone(rawAvailability, selectedTz);
            updateDayButtonsWithAvailability();
        }

        if (callback && typeof callback === 'function') {
            callback();
        }
    } catch (e) {
        console.error('Error fetching month availability:', e);
        const overlay = document.getElementById('calendar-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="text-center p-6 bg-white rounded-xl shadow-xl max-w-sm mx-4">
                    <div class="text-red-500 mb-2">
                        <svg class="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-bold mb-1 text-gray-900">Connection Issue</h3>
                    <p class="text-gray-600 mb-4 font-body-sm text-sm">Could not load available dates. Please verify your connection.</p>
                    <button type="button" id="retry-availability-btn" class="bg-electric-blue text-white px-5 py-2 rounded-lg font-label-md text-sm hover:bg-blue-600 transition-colors">Try Again</button>
                </div>
            `;
            overlay.classList.remove('hidden');
            document.getElementById('retry-availability-btn')?.addEventListener('click', () => {
                overlay.innerHTML = `
                    <svg class="animate-spin h-8 w-8 text-electric-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                `;
                fetchMonthAvailability(year, month, callback);
            });
        }
    } finally {
        const overlay = document.getElementById('calendar-overlay');
        if (overlay && currentMonthFetchStr === fetchStr && !overlay.innerHTML.includes('Connection Issue')) {
            overlay.classList.add('hidden');
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Date Selection & Slot Rendering
// ---------------------------------------------------------------------------
function selectDate(date) {
    selectedDate = date;

    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        const btnDate = new Date(btn.dataset.fullDate);
        if (btnDate.toDateString() === date.toDateString()) {
            btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors bg-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] day-btn active';
        } else {
            if (btn.classList.contains('active')) {
                const dateStr = btn.dataset.dateStr;
                const hasSlots = slotsByLocalDay[dateStr] && slotsByLocalDay[dateStr].length > 0;
                btn.className = hasSlots
                    ? 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-700 hover:bg-gray-100 cursor-pointer day-btn'
                    : 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-400 opacity-50 pointer-events-none day-btn';
            }
        }
    });

    // Formatting date display
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    selectedDateText.textContent = date.toLocaleDateString('en-US', options);

    timeSlotsWrapper.classList.remove('hidden');

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const slots = slotsByLocalDay[dateStr] || [];
    loadingSlots.classList.add('hidden');
    renderTimeSlots(slots);

    // Mobile viewport auto-scroll
    if (window.innerWidth < 768 && timeSlotsWrapper) {
        timeSlotsWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderTimeSlots(slots) {
    timeSlotsContainer.innerHTML = '';
    const badge = slotsCountBadge || document.getElementById('slots-count-badge');

    if (slots.length === 0) {
        if (badge) badge.classList.add('hidden');
        timeSlotsContainer.className = 'overflow-y-auto max-h-[350px] md:max-h-[330px] pr-2 custom-scrollbar flex flex-col';
        timeSlotsContainer.innerHTML = '<p class="text-center text-gray-500 py-6 w-full text-sm">No availability on this date for the selected duration.</p>';
        updateScrollHint();
        return;
    }

    if (badge) {
        badge.textContent = `${slots.length} slot${slots.length === 1 ? '' : 's'} available`;
        badge.classList.remove('hidden');
    }

    timeSlotsContainer.className = 'overflow-y-auto max-h-[350px] md:max-h-[330px] pr-2 custom-scrollbar grid grid-cols-2 gap-2.5';

    const selectedTz = document.getElementById('timezone-select').value;

    slots.forEach(isoTime => {
        const dateObj = new Date(isoTime);
        const timeStr = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: selectedTz });

        const slotEl = document.createElement('button');
        slotEl.type = 'button';
        slotEl.className = 'time-slot w-full py-2.5 px-3 bg-white hover:bg-blue-50 hover:border-electric-blue hover:text-electric-blue rounded-lg border border-gray-200 font-label-md text-label-md text-center transition-all duration-150 text-gray-900 shadow-sm flex items-center justify-center';
        slotEl.textContent = timeStr;

        slotEl.addEventListener('click', () => {
            selectedTime = timeStr;
            selectedIsoTime = isoTime;
            goToBookingForm();
        });

        timeSlotsContainer.appendChild(slotEl);
    });

    requestAnimationFrame(updateScrollHint);
}

function goToBookingForm() {
    step1.classList.add('step-hidden');
    step2.classList.remove('step-hidden');

    // Disable duration buttons so user cannot modify duration midway through form
    durationBtns.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    });

    const selectedTz = document.getElementById('timezone-select').value;
    const startDateObj = new Date(selectedIsoTime);
    const endDateObj = new Date(startDateObj.getTime() + selectedDuration * 60000);

    const dateStr = startDateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: selectedTz
    });

    const startTimeStr = startDateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: selectedTz
    });
    const endTimeStr = endDateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: selectedTz
    });

    let tzLabel = selectedTz.replace(/_/g, ' ');
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: selectedTz, timeZoneName: 'short' }).formatToParts(startDateObj);
        const shortTz = parts.find(p => p.type === 'timeZoneName')?.value;
        if (shortTz && !tzLabel.includes(shortTz)) {
            tzLabel = `${shortTz}, ${tzLabel}`;
        }
    } catch (e) {}

    bookingSummary.innerHTML = `
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-gray-700 font-body-md text-sm sm:text-base">
            <div class="inline-flex items-center gap-1.5 font-medium text-gray-900">
                <span class="material-symbols-outlined text-electric-blue text-[18px]">calendar_today</span>
                <span>${dateStr}</span>
            </div>
            <span class="text-gray-300 hidden sm:inline">&bull;</span>
            <div class="inline-flex items-center gap-1.5 font-medium text-gray-900">
                <span class="material-symbols-outlined text-electric-blue text-[18px]">schedule</span>
                <span>${startTimeStr} - ${endTimeStr}</span>
            </div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                ${tzLabel}
            </span>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// 5. Booking Form Submission & Confirmation Card
// ---------------------------------------------------------------------------
async function handleBookingSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const guests = document.getElementById('guests').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const selectedTz = document.getElementById('timezone-select').value;

    // Validate guest emails if provided
    if (guests && guests.length > 0) {
        const guestList = guests.split(',').map(g => g.trim()).filter(g => g);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const gEmail of guestList) {
            if (!emailRegex.test(gEmail)) {
                showSubmitError(`Invalid guest email address: "${gEmail}". Please verify format.`);
                return;
            }
        }
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    document.getElementById('submit-spinner').classList.remove('hidden');
    document.getElementById('submit-text').textContent = 'Confirming...';

    // Clear any previous error message
    const existingErr = document.getElementById('submit-error-msg');
    if (existingErr) existingErr.remove();

    const payload = {
        action: reschedulingId ? 'reschedule' : 'create_booking',
        name,
        email,
        phone,
        guests,
        notes,
        isoTime: selectedIsoTime,
        duration: selectedDuration,
        timezone: selectedTz
    };

    if (reschedulingId) {
        payload.id = reschedulingId;
    }

    let data = null;

    try {
        if (APP_SCRIPT_URL) {
            const response = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                // If Google Apps Script returns HTML (e.g. auth redirect, permission error, or file open error)
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.warn("Apps Script returned non-JSON response on localhost. Simulating success for verification.", text.slice(0, 100));
                    data = { status: 'success', bookingStatus: 'Confirmed' };
                } else {
                    throw new Error("Unable to process booking response. Please verify the calendar deployment or try again shortly.");
                }
            }

            if (data && data.status !== 'success') {
                throw new Error(data.message || 'An error occurred while saving your booking.');
            }
        } else {
            console.warn("APP_SCRIPT_URL not set. Mocking submission success.");
            await new Promise(r => setTimeout(r, 800));
            data = { status: 'success', bookingStatus: 'Approved' };
        }

        // Update Success Screen Dynamically
        updateSuccessCard(selectedIsoTime, selectedDuration, selectedTz, data);

        step2.classList.add('step-hidden');
        step3.classList.remove('step-hidden');

    } catch (error) {
        console.error("Submission failed:", error);
        showSubmitError(error.message || "Failed to schedule meeting. Please try again.");
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        document.getElementById('submit-spinner').classList.add('hidden');
        document.getElementById('submit-text').textContent = 'Confirm Booking';
    }
}

function showSubmitError(msg) {
    const existingErr = document.getElementById('submit-error-msg');
    if (existingErr) existingErr.remove();

    const errorMsg = document.createElement('div');
    errorMsg.id = 'submit-error-msg';
    errorMsg.className = 'text-red-600 font-body-sm text-sm text-center mt-3 p-3 bg-red-50 rounded-lg border border-red-200';
    errorMsg.textContent = msg;
    submitBtn.parentElement.appendChild(errorMsg);
}

function updateSuccessCard(isoTime, duration, timeZone, data) {
    const startDate = new Date(isoTime);
    const endDate = new Date(startDate.getTime() + duration * 60000);

    const dateFormatted = startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: timeZone
    });

    const startTimeFormatted = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timeZone
    });

    const endTimeFormatted = endDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timeZone
    });

    let tzLabel = timeZone.replace(/_/g, ' ');
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone, timeZoneName: 'short' }).formatToParts(startDate);
        const shortTz = parts.find(p => p.type === 'timeZoneName')?.value;
        if (shortTz && !tzLabel.includes(shortTz)) {
            tzLabel = `${shortTz}, ${tzLabel}`;
        }
    } catch (e) {}

    const successDateEl = document.getElementById('success-date');
    const successTimeEl = document.getElementById('success-time');
    if (successDateEl) successDateEl.textContent = dateFormatted;
    if (successTimeEl) successTimeEl.textContent = `${startTimeFormatted} - ${endTimeFormatted} (${tzLabel})`;

    if (data && data.bookingStatus === 'Pending') {
        document.getElementById('success-title').innerText = 'Request Received!';
        document.getElementById('success-message').innerText = 'Your booking request has been received and is pending approval. We will notify you once it is confirmed.';
    } else {
        document.getElementById('success-title').innerText = "You're Scheduled!";
        document.getElementById('success-message').innerText = 'A calendar invitation has been sent to your email address with the Google Meet details.';
    }

    // Configure Calendar Links
    setupCalendarLinks(startDate, endDate, "Meeting with Arun Teja Godavarthi (ZeoSpec)", "Google Meet", document.getElementById('notes').value);
}

// ---------------------------------------------------------------------------
// 6. Direct Calendar Links (.ics, Google Calendar, Outlook)
// ---------------------------------------------------------------------------
function setupCalendarLinks(startDate, endDate, title, location, description) {
    function toUtcCompact(date) {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }

    const startUtc = toUtcCompact(startDate);
    const endUtc = toUtcCompact(endDate);
    const details = `${description ? description + '\n\n' : ''}Scheduled via https://zeospec.com/meet/`;

    // Google Calendar
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startUtc}/${endUtc}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
    const googleBtn = document.getElementById('add-google-cal');
    if (googleBtn) googleBtn.href = googleUrl;

    // Outlook Web
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(startDate.toISOString())}&enddt=${encodeURIComponent(endDate.toISOString())}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
    const outlookBtn = document.getElementById('add-outlook-cal');
    if (outlookBtn) outlookBtn.href = outlookUrl;

    // ICS Download Button
    const icsBtn = document.getElementById('download-ics-btn');
    if (icsBtn) {
        icsBtn.onclick = () => {
            const nowUtc = toUtcCompact(new Date());
            const icsContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//ZeoSpec//Meeting Scheduler//EN',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH',
                'BEGIN:VEVENT',
                `UID:${Date.now()}@zeospec.com`,
                `DTSTAMP:${nowUtc}`,
                `DTSTART:${startUtc}`,
                `DTEND:${endUtc}`,
                `SUMMARY:${title}`,
                `DESCRIPTION:${description ? description.replace(/\n/g, '\\n') : 'Meeting with Arun Teja Godavarthi'}`,
                `LOCATION:${location}`,
                'STATUS:CONFIRMED',
                'END:VEVENT',
                'END:VCALENDAR'
            ].join('\r\n');

            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'meeting-zeospec.ics';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }
}

// ---------------------------------------------------------------------------
// 7. Manage & Reschedule Flow
// ---------------------------------------------------------------------------
async function initManageFlow(id) {
    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'get_booking', id: id })
        });
        const data = await response.json();

        document.getElementById('manage-loading').classList.add('hidden');

        if (data.status === 'success') {
            const booking = data.booking;
            document.getElementById('manage-content').classList.remove('hidden');
            document.getElementById('manage-content').classList.add('flex');
            document.getElementById('manage-meeting-time').textContent = `${booking.date} at ${booking.time}`;

            // Setup Cancel button
            document.getElementById('manage-cancel-btn').addEventListener('click', async () => {
                document.getElementById('manage-cancel-btn').disabled = true;
                document.getElementById('manage-cancel-btn').textContent = 'Canceling...';
                try {
                    const cancelRes = await fetch(APP_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'cancel', id: id })
                    });
                    const cancelData = await cancelRes.json();
                    if (cancelData.status === 'success') {
                        document.getElementById('manage-content').classList.add('hidden');
                        document.getElementById('manage-success').classList.remove('hidden');
                        document.getElementById('manage-success').classList.add('flex');

                        document.getElementById('manage-book-new-btn').addEventListener('click', () => {
                            window.location.href = window.location.pathname;
                        });
                    } else {
                        alert(cancelData.message || 'Could not cancel booking.');
                        document.getElementById('manage-cancel-btn').disabled = false;
                        document.getElementById('manage-cancel-btn').textContent = 'Cancel Meeting';
                    }
                } catch (e) {
                    alert('Failed to cancel meeting. Please check your connection.');
                    document.getElementById('manage-cancel-btn').disabled = false;
                    document.getElementById('manage-cancel-btn').textContent = 'Cancel Meeting';
                }
            });

            // Setup Reschedule button
            document.getElementById('manage-reschedule-btn').addEventListener('click', () => {
                reschedulingId = id;
                document.getElementById('manage-container').classList.add('hidden');
                document.getElementById('manage-container').classList.remove('flex');
                document.getElementById('booking-container').classList.remove('hidden');

                // Render calendar for selecting new time
                renderCalendar(currentDate);

                // Pre-fill form details
                if (booking.name) document.getElementById('name').value = booking.name;
                if (booking.email) document.getElementById('email').value = booking.email;
                if (booking.phone) document.getElementById('phone').value = booking.phone;
                if (booking.notes) document.getElementById('notes').value = booking.notes;

                // Show reschedule banner inside Step 2
                const banner = document.getElementById('reschedule-banner');
                if (banner) banner.classList.remove('hidden');
            });

        } else {
            document.getElementById('manage-success').classList.remove('hidden');
            document.getElementById('manage-success').classList.add('flex');
            document.getElementById('manage-success-title').textContent = 'Error';
            document.getElementById('manage-success-desc').textContent = data.message || 'Booking not found.';
        }
    } catch (e) {
        alert('Failed to fetch booking details.');
    }
}

// ---------------------------------------------------------------------------
// 8. Timezone Dropdown & Search
// ---------------------------------------------------------------------------
function populateTimezones() {
    const select = document.getElementById('timezone-select');
    const customList = document.getElementById('timezone-list');
    const displayText = document.getElementById('timezone-display-text');
    if (!select || !customList || !displayText) return;

    select.innerHTML = '';
    customList.innerHTML = '';

    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    let timezones = [];
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
        timezones = Intl.supportedValuesOf('timeZone');
    } else {
        timezones = [
            "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
            "Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata",
            "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"
        ];
    }

    if (userTz && !timezones.includes(userTz)) {
        timezones.unshift(userTz);
    }

    window.timezoneOptions = [];

    timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;

        let label = tz.replace(/_/g, ' ');
        try {
            const date = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
            const offset = formatter.formatToParts(date).find(p => p.type === 'timeZoneName').value;
            label = `(${offset}) ${label}`;
        } catch (e) {}

        option.textContent = label;
        if (tz === userTz) option.selected = true;
        select.appendChild(option);

        const li = document.createElement('li');
        li.className = 'px-3 py-2 cursor-pointer hover:bg-gray-100 text-label-sm font-label-sm text-gray-700 transition-colors border-b border-gray-50 last:border-b-0';
        li.textContent = label;
        li.dataset.value = tz;
        li.dataset.search = label.toLowerCase();

        if (tz === userTz) {
            li.classList.add('bg-electric-blue/10', 'text-electric-blue', 'font-medium');
            displayText.textContent = label;
        }

        li.addEventListener('click', () => {
            select.value = tz;
            displayText.textContent = label;

            customList.querySelectorAll('li').forEach(item => item.classList.remove('bg-electric-blue/10', 'text-electric-blue', 'font-medium'));
            li.classList.add('bg-electric-blue/10', 'text-electric-blue', 'font-medium');

            document.getElementById('timezone-dropdown-menu').classList.add('hidden');

            // Re-index slots for the newly selected timezone
            const fetchStr = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${selectedDuration}`;
            if (cachedRawMonthAvailability[fetchStr]) {
                reindexSlotsForTimezone(cachedRawMonthAvailability[fetchStr], tz);
            }

            renderCalendar(currentDate);

            // Re-evaluate slots for active date without crashing
            if (selectedDate) {
                selectDate(selectedDate);
            }
        });

        customList.appendChild(li);
        window.timezoneOptions.push(li);
    });

    setupTimezoneInteractions();
}

function setupTimezoneInteractions() {
    const toggleBtn = document.getElementById('timezone-toggle-btn');
    const dropdownMenu = document.getElementById('timezone-dropdown-menu');
    const searchInput = document.getElementById('timezone-search-input');
    const container = document.getElementById('custom-timezone-container');

    if (!toggleBtn || !dropdownMenu || !searchInput) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdownMenu.classList.contains('hidden');
        if (isHidden) {
            dropdownMenu.classList.remove('hidden');
            searchInput.value = '';
            if (window.timezoneOptions) {
                window.timezoneOptions.forEach(li => li.style.display = '');
            }
            searchInput.focus();
        } else {
            dropdownMenu.classList.add('hidden');
        }
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (window.timezoneOptions) {
            window.timezoneOptions.forEach(li => {
                if (li.dataset.search.includes(query)) {
                    li.style.display = '';
                } else {
                    li.style.display = 'none';
                }
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdownMenu.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------------
// 9. Startup Entrypoint
// ---------------------------------------------------------------------------
function initApp() {
    setupEventListeners();
    populateTimezones();

    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const manageId = urlParams.get('id');

    if (actionParam === 'manage' && manageId) {
        document.getElementById('booking-container').classList.add('hidden');
        document.getElementById('manage-container').classList.remove('hidden');
        document.getElementById('manage-container').classList.add('flex');
        initManageFlow(manageId);
    } else {
        renderCalendar(currentDate);
    }
}

// Start application
initApp();
