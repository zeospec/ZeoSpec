// TODO: Replace this with your Google Apps Script Web App URL after deployment
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyc5a9eyJrsqNmzIxfhG_3U-YvADtwrhZf2iBtqPxVioVk21Drfq37IlXDoTcE1yLMhOg/exec';

let currentDate = new Date();
let selectedDate = null;
let selectedTime = null;
let selectedIsoTime = null;
let selectedDuration = 15;
let reschedulingId = null;
let currentMonthFetchStr = null;
let cachedMonthAvailability = {};

// Elements
const daysContainer = document.getElementById('calendar-days');
const currentMonthEl = document.getElementById('current-month');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const timeSlotsWrapper = document.getElementById('time-slots-container');
const timeSlotsContainer = document.getElementById('time-slots');
const selectedDateText = document.getElementById('selected-date-text');
const loadingSlots = document.getElementById('loading-slots');
const durationBtns = document.querySelectorAll('.duration-btn');
const scrollFade = document.getElementById('scroll-fade');

function updateScrollFade() {
    if (!scrollFade || !timeSlotsContainer) return;
    if (timeSlotsContainer.scrollHeight > timeSlotsContainer.clientHeight) {
        if (Math.abs(timeSlotsContainer.scrollHeight - timeSlotsContainer.clientHeight - timeSlotsContainer.scrollTop) < 5) {
            scrollFade.classList.add('hidden');
        } else {
            scrollFade.classList.remove('hidden');
        }
    } else {
        scrollFade.classList.add('hidden');
    }
}
if (timeSlotsContainer) {
    timeSlotsContainer.addEventListener('scroll', updateScrollFade);
}

const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');

const backBtn = document.getElementById('back-btn');
const bookingForm = document.getElementById('booking-form');
const bookingSummary = document.getElementById('booking-summary');
const submitBtn = document.getElementById('submit-btn');
const bookAnotherBtn = document.getElementById('book-another-btn');

// Initialize
function initCalendar() {
    populateTimezones();
    renderCalendar(currentDate);

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar(currentDate);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar(currentDate);
    });

    backBtn.addEventListener('click', () => {
        step2.classList.add('step-hidden');
        step1.classList.remove('step-hidden');
        // Re-enable duration buttons
        durationBtns.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        });
    });

    bookingForm.addEventListener('submit', handleBookingSubmit);

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

    // Duration selector logic
    durationBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active styling
            durationBtns.forEach(b => {
                b.classList.remove('pill-active', 'shadow-sm');
                b.classList.add('pill-inactive');
            });
            e.target.classList.remove('pill-inactive');
            e.target.classList.add('pill-active', 'shadow-sm');
            
            // Update duration global variable
            selectedDuration = parseInt(e.target.dataset.duration, 10);
            
            // Reset selected date UI
            selectedDate = null;
            selectedTime = null;
            selectedDateText.textContent = "Select a date";
            timeSlotsContainer.innerHTML = '';
            
            // Re-fetch slots instantly from cache for the new duration
            fetchMonthAvailability(currentDate.getFullYear(), currentDate.getMonth() + 1);
        });
    });

    bookAnotherBtn.addEventListener('click', () => {
        selectedDate = null;
        selectedTime = null;
        timeSlotsWrapper.classList.add('hidden');
        renderCalendar(currentDate);
        bookingForm.reset();
        step3.classList.add('step-hidden');
        step1.classList.remove('step-hidden');
    });
}

function renderCalendar(date) {
    daysContainer.innerHTML = '';

    const year = date.getFullYear();
    const month = date.getMonth();

    currentMonthEl.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);

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
        dayEl.textContent = i;
        
        let baseClass = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors';
        
        if (dayDate < today) {
            dayEl.className = baseClass + ' text-gray-400 cursor-not-allowed opacity-50';
        } else {
            dayEl.className = baseClass + ' text-gray-400 opacity-50 pointer-events-none day-btn';
            dayEl.dataset.dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            dayEl.dataset.fullDate = dayDate.toISOString();
            dayEl.addEventListener('click', () => selectDate(new Date(dayEl.dataset.fullDate)));
        }

        if (selectedDate && dayDate.toDateString() === selectedDate.toDateString()) {
            dayEl.className = baseClass + ' bg-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] day-btn active';
        }

        daysContainer.appendChild(dayEl);
    }
    
    fetchMonthAvailability(year, month + 1);
}

async function fetchMonthAvailability(year, month) {
    if (!APP_SCRIPT_URL) return;
    const fetchStr = `${year}-${month}-${selectedDuration}`;
    currentMonthFetchStr = fetchStr;

    const overlay = document.getElementById('calendar-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        let availability;
        
        if (cachedMonthAvailability[fetchStr]) {
            availability = cachedMonthAvailability[fetchStr];
        } else {
            let response, data;
            try {
                response = await fetch(`${APP_SCRIPT_URL}?action=getMonthAvailability&year=${year}&month=${month}&duration=${selectedDuration}`);
                data = await response.json();
            } catch (err) {
                console.warn("First fetch failed (likely Apps Script cold start). Retrying...", err);
                response = await fetch(`${APP_SCRIPT_URL}?action=getMonthAvailability&year=${year}&month=${month}&duration=${selectedDuration}`);
                data = await response.json();
            }
            
            if (currentMonthFetchStr !== fetchStr) return; // Month changed while fetching
            
            if (data.status === 'error') {
                throw new Error(data.message || "Backend error");
            }
            
            if (data.status === 'success') {
                availability = data.availability;
                cachedMonthAvailability[fetchStr] = availability;
            }
        }
        
        if (availability) {
            const dayBtns = document.querySelectorAll('.day-btn');
            dayBtns.forEach(btn => {
                const dateStr = btn.dataset.dateStr;
                if (selectedDate && new Date(btn.dataset.fullDate).toDateString() === selectedDate.toDateString()) {
                    return; 
                }
                
                if (dateStr && availability[dateStr] && availability[dateStr].length > 0) {
                    btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-600 hover:bg-gray-100 cursor-pointer day-btn';
                } else if (dateStr) {
                    btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-400 opacity-50 pointer-events-none day-btn';
                }
            });
        }
    } catch (e) {
        console.error('Error fetching month availability:', e);
        const overlay = document.getElementById('calendar-overlay');
        if (overlay) {
            overlay.innerHTML = '<div class="text-center p-6 bg-white rounded-xl shadow-xl max-w-sm"><div class="text-danger mb-2"><svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div><h3 class="text-xl font-bold mb-2 text-gray-900">Connection Error</h3><p class="text-gray-600 mb-4 font-body-md">Failed to connect to the booking server. This is often caused by a temporary Google Apps Script delay.</p><button onclick="window.location.reload()" class="bg-gray-900 text-white px-6 py-2 rounded-lg font-label-md hover:bg-gray-800 transition-colors">Reload Page</button></div>';
            overlay.classList.remove('hidden');
        }
    } finally {
        const overlay = document.getElementById('calendar-overlay');
        // Only hide the overlay if it's the original loading spinner (not an error message)
        if (overlay && currentMonthFetchStr === fetchStr && !overlay.innerHTML.includes('Connection Error')) {
            overlay.classList.add('hidden');
        }
    }
}

function selectDate(date) {
    selectedDate = date;
    
    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        const btnDate = new Date(btn.dataset.fullDate);
        if (btnDate.toDateString() === date.toDateString()) {
            btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors bg-electric-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] day-btn active';
        } else {
            if (btn.classList.contains('active')) {
                btn.className = 'aspect-square flex items-center justify-center rounded-full font-body-md transition-colors text-gray-600 hover:bg-gray-100 cursor-pointer day-btn';
            }
        }
    });

    // Formatting date
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    selectedDateText.textContent = date.toLocaleDateString('en-US', options);

    timeSlotsWrapper.classList.remove('hidden');

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    let slots = [];
    if (cachedMonthAvailability[currentMonthFetchStr] && cachedMonthAvailability[currentMonthFetchStr][dateStr]) {
        slots = cachedMonthAvailability[currentMonthFetchStr][dateStr];
    }
    
    loadingSlots.classList.add('hidden');
    renderTimeSlots(slots);
}

function renderTimeSlots(slots) {
    timeSlotsContainer.innerHTML = '';

    if (slots.length === 0) {
        timeSlotsContainer.innerHTML = '<p class="text-center text-gray-500 py-4 w-full">No availability on this date.</p>';
        return;
    }

    const selectedTz = document.getElementById('timezone-select').value;

    slots.forEach(isoTime => {
        const dateObj = new Date(isoTime);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: selectedTz });

        const slotEl = document.createElement('button');
        slotEl.className = 'time-slot w-full py-3 px-4 bg-white rounded-lg border border-gray-200 font-label-md text-label-md text-center transition-all duration-200 text-gray-900';
        slotEl.textContent = timeStr;

        slotEl.addEventListener('click', () => {
            selectedTime = timeStr;
            selectedIsoTime = isoTime;
            
            // Auto progress to next step
            goToBookingForm();
        });

        timeSlotsContainer.appendChild(slotEl);
    });
    
    // Update scroll fade indicator after rendering slots
    requestAnimationFrame(updateScrollFade);
}

function goToBookingForm() {
    step1.classList.add('step-hidden');
    step2.classList.remove('step-hidden');
    
    // Disable duration buttons so user cannot change them in step 2
    durationBtns.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    });

    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateStr = selectedDate.toLocaleDateString('en-US', options);
    
    const selectedTz = document.getElementById('timezone-select').value;
    const startDateObj = new Date(selectedIsoTime);
    const endDateObj = new Date(startDateObj.getTime() + selectedDuration * 60000);
    
    const startTimeStr = startDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: selectedTz });
    const endTimeStr = endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: selectedTz });

    bookingSummary.innerHTML = `${dateStr} • ${startTimeStr} - ${endTimeStr}`;
}

async function handleBookingSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const guests = document.getElementById('guests').value;
    const notes = document.getElementById('notes').value;
    const selectedTz = document.getElementById('timezone-select').value;
    
    submitBtn.disabled = true;
    document.getElementById('submit-spinner').classList.remove('hidden');
    document.getElementById('submit-text').textContent = 'Confirming...';

    const payload = {
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
        payload.action = 'reschedule';
        payload.id = reschedulingId;
    }

    try {
        if (APP_SCRIPT_URL) {
            const response = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                // Using text/plain prevents preflight CORS issues in Apps Script sometimes,
                // but application/json is standard. Apps script handles text/plain well for doPost.
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (data.status !== 'success') {
                throw new Error(data.message || 'Unknown error');
            }
        } else {
            console.warn("APP_SCRIPT_URL not set. Mocking submission success.");
            await new Promise(r => setTimeout(r, 1000));
        }

        // Success
        step2.classList.add('step-hidden');
        step3.classList.remove('step-hidden');

    } catch (error) {
        console.error("Submission failed:", error);
        
        // Remove existing error if any
        const existingErr = document.getElementById('submit-error-msg');
        if (existingErr) existingErr.remove();
        
        // Create inline error message
        const errorMsg = document.createElement('div');
        errorMsg.id = 'submit-error-msg';
        errorMsg.className = 'text-red-500 font-body-sm text-center mt-2 p-2 bg-red-50 rounded-lg border border-red-200';
        errorMsg.textContent = error.message;
        
        // Insert right below the submit button
        submitBtn.parentElement.appendChild(errorMsg);
        
    } finally {
        submitBtn.disabled = false;
        document.getElementById('submit-spinner').classList.add('hidden');
        document.getElementById('submit-text').textContent = 'Confirm Booking';
    }
}

// Start Execution
const urlParams = new URLSearchParams(window.location.search);
const actionParam = urlParams.get('action');
const manageId = urlParams.get('id');

if (actionParam === 'manage' && manageId) {
    document.getElementById('booking-container').classList.add('hidden');
    document.getElementById('manage-container').classList.remove('hidden');
    document.getElementById('manage-container').classList.add('flex');
    initManageFlow(manageId);
} else {
    initCalendar();
}

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
            
            // Setup Cancel
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
                        alert(cancelData.message);
                        document.getElementById('manage-cancel-btn').disabled = false;
                        document.getElementById('manage-cancel-btn').textContent = 'Cancel Meeting';
                    }
                } catch (e) {
                    alert('Failed to cancel.');
                    document.getElementById('manage-cancel-btn').disabled = false;
                    document.getElementById('manage-cancel-btn').textContent = 'Cancel Meeting';
                }
            });
            
            // Setup Reschedule
            document.getElementById('manage-reschedule-btn').addEventListener('click', () => {
                reschedulingId = id;
                document.getElementById('manage-container').classList.add('hidden');
                document.getElementById('manage-container').classList.remove('flex');
                document.getElementById('booking-container').classList.remove('hidden');
                initCalendar();
                
                // Pre-fill form
                document.getElementById('name').value = booking.name;
                document.getElementById('email').value = booking.email;
                document.getElementById('phone').value = booking.phone;
                document.getElementById('notes').value = booking.notes;
                
                // Show banner
                const banner = document.createElement('div');
                banner.className = 'w-full bg-blue-50 text-blue-800 p-4 text-center font-body-md border-b border-blue-200 absolute top-0 left-0 z-50';
                banner.textContent = 'Please select a new time for your meeting.';
                document.body.appendChild(banner);
            });
            
        } else {
            document.getElementById('manage-success').classList.remove('hidden');
            document.getElementById('manage-success').classList.add('flex');
            document.getElementById('manage-success-title').textContent = 'Error';
            document.getElementById('manage-success-desc').textContent = data.message;
        }
    } catch (e) {
        alert('Failed to fetch booking details.');
    }
}

function populateTimezones() {
    const select = document.getElementById('timezone-select');
    if (!select) return;
    
    select.innerHTML = '';
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const commonTzs = [
        "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
        "Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata", 
        "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"
    ];
    
    if (!commonTzs.includes(userTz)) {
        commonTzs.unshift(userTz);
    }
    
    commonTzs.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = tz.replace(/_/g, ' ');
        if (tz === userTz) option.selected = true;
        select.appendChild(option);
    });
    
    // Re-render slots if timezone changes
    select.addEventListener('change', () => {
        if (selectedDate) fetchAvailableSlots(selectedDate);
    });
}
