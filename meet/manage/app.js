/**
 * ZeoSpec Meet Manager Dashboard Application (Light Theme)
 * Handles authentication, persistent sessions, booking management,
 * 1-click approvals, declines with notes, deep linking, password management, and PWA integration.
 */

// Google Apps Script Web App Endpoint
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyc5a9eyJrsqNmzIxfhG_3U-YvADtwrhZf2iBtqPxVioVk21Drfq37IlXDoTcE1yLMhOg/exec';
const SESSION_KEY = 'meet_manager_session';
const MANAGER_KEY = 'meet_manager_user';

// Application State
const state = {
    sessionToken: null,
    manager: null,
    bookings: [],
    filter: 'all',
    searchQuery: '',
    pendingRejectBookingId: null,
    deferredPrompt: null,
    targetBookingId: null
};

// DOM Elements
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const rememberDeviceCheckbox = document.getElementById('remember-device');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginBtnText = document.getElementById('login-btn-text');
const loginSpinner = document.getElementById('login-spinner');
const loginErrorBanner = document.getElementById('login-error-banner');
const loginErrorText = document.getElementById('login-error-text');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const passwordVisibilityIcon = document.getElementById('password-visibility-icon');

const managerIdentityText = document.getElementById('manager-identity-text');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const refreshBookingsBtn = document.getElementById('refresh-bookings-btn');
const logoutBtn = document.getElementById('logout-btn');

const statPendingCount = document.getElementById('stat-pending-count');
const statUpcomingCount = document.getElementById('stat-upcoming-count');
const statCompletedCount = document.getElementById('stat-completed-count');
const statDeclinedCount = document.getElementById('stat-declined-count');

const tabCountAll = document.getElementById('tab-count-all');
const tabCountPending = document.getElementById('tab-count-pending');
const tabCountUpcoming = document.getElementById('tab-count-upcoming');
const tabCountPast = document.getElementById('tab-count-past');
const tabCountDeclined = document.getElementById('tab-count-declined');
const filterTabs = document.querySelectorAll('.filter-tab');

const bookingSearchInput = document.getElementById('booking-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const bookingsLoading = document.getElementById('bookings-loading');
const bookingsEmpty = document.getElementById('bookings-empty');
const bookingsList = document.getElementById('bookings-list');

const rejectionModal = document.getElementById('rejection-modal');
const modalRejectGuestName = document.getElementById('modal-reject-guest-name');
const modalRejectMeetingTime = document.getElementById('modal-reject-meeting-time');
const modalRejectionNote = document.getElementById('modal-rejection-note');
const cancelRejectionBtn = document.getElementById('cancel-rejection-btn');
const confirmRejectionBtn = document.getElementById('confirm-rejection-btn');
const confirmRejectionText = document.getElementById('confirm-rejection-text');
const rejectionSpinner = document.getElementById('rejection-spinner');
const closeRejectionModalBtn = document.getElementById('close-rejection-modal-btn');
const presetSnippetBtns = document.querySelectorAll('.preset-snippet-btn');
const toastContainer = document.getElementById('toast-container');

// Password Modal Elements
const openChangePasswordBtn = document.getElementById('open-change-password-btn');
const passwordModal = document.getElementById('password-modal');
const closePasswordModalBtn = document.getElementById('close-password-modal-btn');
const cancelPasswordBtn = document.getElementById('cancel-password-btn');
const changePasswordForm = document.getElementById('change-password-form');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmNewPasswordInput = document.getElementById('confirm-new-password');
const passwordErrorBanner = document.getElementById('password-error-banner');
const passwordErrorText = document.getElementById('password-error-text');
const submitPasswordBtn = document.getElementById('submit-password-btn');
const submitPasswordText = document.getElementById('submit-password-text');
const passwordSpinner = document.getElementById('password-spinner');

// Tab Style Constants
const TAB_ACTIVE_CLASS = 'filter-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors bg-blue-600 text-white shadow-xs';
const TAB_INACTIVE_CLASS = 'filter-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors text-slate-600 hover:text-slate-900 hover:bg-slate-100';

// ---------------------------------------------------------------------------
// PWA & Service Worker Initialization
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/meet/manage/sw.js')
            .then((reg) => {
                console.log('Meet Manager SW registered with scope:', reg.scope);
            })
            .catch((err) => {
                console.warn('Meet Manager SW registration failed:', err);
            });
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    if (pwaInstallBtn) {
        pwaInstallBtn.classList.remove('hidden');
        pwaInstallBtn.classList.add('inline-flex');
    }
});

if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
        if (!state.deferredPrompt) return;
        state.deferredPrompt.prompt();
        const { outcome } = await state.deferredPrompt.userChoice;
        console.log('User PWA install prompt response:', outcome);
        state.deferredPrompt = null;
        pwaInstallBtn.classList.add('hidden');
    });
}

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------
function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto p-3.5 rounded-xl shadow-lg border text-xs flex items-center gap-2.5 transition-all duration-300 transform translate-y-2 opacity-0 font-medium';

    let iconName = 'info';
    let colorClasses = 'bg-slate-900 text-white border-slate-800';

    if (type === 'success') {
        iconName = 'check_circle';
        colorClasses = 'bg-emerald-600 text-white border-emerald-500';
    } else if (type === 'error') {
        iconName = 'error';
        colorClasses = 'bg-red-600 text-white border-red-500';
    } else if (type === 'warning') {
        iconName = 'warning';
        colorClasses = 'bg-amber-600 text-white border-amber-500';
    }

    toast.className += ` ${colorClasses}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-base shrink-0">${iconName}</span>
        <span class="flex-grow">${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Auto dismiss
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 4000);
}

// ---------------------------------------------------------------------------
// Helper Utilities
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

function isMeetingUpcoming(dateStr, timeStr) {
    if (!dateStr) return false;
    try {
        let isoCandidate = dateStr;
        if (timeStr) {
            const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (match) {
                let hour = parseInt(match[1], 10);
                const min = parseInt(match[2], 10);
                const meridiem = match[3].toUpperCase();
                if (meridiem === 'PM' && hour < 12) hour += 12;
                if (meridiem === 'AM' && hour === 12) hour = 0;
                const hh = String(hour).padStart(2, '0');
                const mm = String(min).padStart(2, '0');
                isoCandidate = `${dateStr}T${hh}:${mm}:00`;
            }
        }
        const meetingDate = new Date(isoCandidate);
        return meetingDate.getTime() > Date.now();
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Authentication Handlers
// ---------------------------------------------------------------------------
function showAuthView(errorMessage = null) {
    authView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    if (errorMessage) {
        loginErrorText.textContent = errorMessage;
        loginErrorBanner.classList.remove('hidden');
    } else {
        loginErrorBanner.classList.add('hidden');
    }
}

function handleSessionExpired(errorMessage = 'Your session has expired or was revoked. Please sign in again.') {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(MANAGER_KEY);
    state.sessionToken = null;
    state.manager = null;
    state.bookings = [];
    if (rejectionModal) {
        rejectionModal.classList.add('hidden');
        rejectionModal.classList.remove('flex');
    }
    if (passwordModal) {
        passwordModal.classList.add('hidden');
        passwordModal.classList.remove('flex');
    }
    showAuthView(errorMessage);
}

function showDashboardView(manager) {
    authView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    if (manager && manager.name) {
        managerIdentityText.textContent = `${manager.name} (${manager.email})`;
    }
}

if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = loginPasswordInput.type === 'password';
        loginPasswordInput.type = isPassword ? 'text' : 'password';
        passwordVisibilityIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;

        if (!email || !password) return;

        loginErrorBanner.classList.add('hidden');
        loginSubmitBtn.disabled = true;
        loginBtnText.textContent = 'Authenticating...';
        loginSpinner.classList.remove('hidden');

        try {
            const response = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'managerLogin',
                    email: email,
                    password: password,
                    userAgent: navigator.userAgent
                })
            });

            const data = await response.json();

            if (data.status === 'success' && data.sessionToken) {
                state.sessionToken = data.sessionToken;
                state.manager = data.manager;

                localStorage.setItem(SESSION_KEY, data.sessionToken);
                localStorage.setItem(MANAGER_KEY, JSON.stringify(data.manager));

                showDashboardView(data.manager);
                showToast(`Welcome back, ${data.manager.name}!`, 'success');
                fetchBookings();
            } else {
                loginErrorText.textContent = data.message || 'Invalid email or password.';
                loginErrorBanner.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login error:', err);
            loginErrorText.textContent = 'Connection error. Please check your network and try again.';
            loginErrorBanner.classList.remove('hidden');
        } finally {
            loginSubmitBtn.disabled = false;
            loginBtnText.textContent = 'Sign In to Dashboard';
            loginSpinner.classList.add('hidden');
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        const token = state.sessionToken;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(MANAGER_KEY);
        state.sessionToken = null;
        state.manager = null;
        state.bookings = [];

        showAuthView();
        showToast('Logged out successfully.', 'info');

        if (token) {
            try {
                fetch(APP_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'managerLogout',
                        sessionId: token
                    })
                });
            } catch (e) {}
        }
    });
}

// ---------------------------------------------------------------------------
// Bookings Retrieval & Metrics
// ---------------------------------------------------------------------------
async function fetchBookings() {
    if (!state.sessionToken) return;

    bookingsLoading.classList.remove('hidden');
    bookingsEmpty.classList.add('hidden');
    bookingsList.innerHTML = '';

    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getManagerBookings',
                sessionId: state.sessionToken
            })
        });

        const data = await response.json();

        if (data.requireLogin) {
            handleSessionExpired(data.message);
            return;
        }

        if (data.status === 'success') {
            state.bookings = data.bookings || [];
            if (data.manager) {
                state.manager = data.manager;
                managerIdentityText.textContent = `${data.manager.name} (${data.manager.email})`;
            }
            updateStatsAndCounts();
            renderBookings();

            // Handle Deep Linking if booking ID parameter is present
            if (state.targetBookingId) {
                focusTargetBooking(state.targetBookingId);
            }
        } else {
            showToast(data.message || 'Failed to retrieve bookings.', 'error');
        }
    } catch (err) {
        console.error('Fetch bookings error:', err);
        showToast('Network error loading bookings.', 'error');
    } finally {
        bookingsLoading.classList.add('hidden');
    }
}

function updateStatsAndCounts() {
    let pending = 0;
    let upcoming = 0;
    let completed = 0;
    let declined = 0;

    state.bookings.forEach((b) => {
        const status = b.status || 'Pending';
        if (status === 'Pending') {
            pending++;
        } else if (status === 'Approved') {
            if (isMeetingUpcoming(b.date, b.time)) {
                upcoming++;
            } else {
                completed++;
            }
        } else if (status === 'Rejected' || status === 'Canceled') {
            declined++;
        }
    });

    statPendingCount.textContent = pending;
    statUpcomingCount.textContent = upcoming;
    statCompletedCount.textContent = completed;
    statDeclinedCount.textContent = declined;

    tabCountAll.textContent = state.bookings.length;
    tabCountPending.textContent = pending;
    tabCountUpcoming.textContent = upcoming;
    tabCountPast.textContent = completed;
    tabCountDeclined.textContent = declined;
}

// ---------------------------------------------------------------------------
// Filtering, Search & Card Rendering
// ---------------------------------------------------------------------------
function renderBookings() {
    const query = state.searchQuery.toLowerCase().trim();
    const filter = state.filter;

    const filtered = state.bookings.filter((b) => {
        // Tab Filter
        const status = b.status || 'Pending';
        const isUp = isMeetingUpcoming(b.date, b.time);

        if (filter === 'pending' && status !== 'Pending') return false;
        if (filter === 'upcoming' && (status !== 'Approved' || !isUp)) return false;
        if (filter === 'past' && (status !== 'Approved' || isUp)) return false;
        if (filter === 'declined' && status !== 'Rejected' && status !== 'Canceled') return false;

        // Search Query Filter
        if (query) {
            const matchName = (b.name || '').toLowerCase().includes(query);
            const matchEmail = (b.email || '').toLowerCase().includes(query);
            const matchPhone = (b.phone || '').toLowerCase().includes(query);
            const matchNotes = (b.notes || '').toLowerCase().includes(query);
            const matchId = (b.id || '').toLowerCase().includes(query);
            if (!matchName && !matchEmail && !matchPhone && !matchNotes && !matchId) return false;
        }

        return true;
    });

    bookingsList.innerHTML = '';

    if (filtered.length === 0) {
        bookingsEmpty.classList.remove('hidden');
        return;
    }

    bookingsEmpty.classList.add('hidden');

    filtered.forEach((b) => {
        const card = createBookingCard(b);
        bookingsList.appendChild(card);
    });
}

function createBookingCard(b) {
    const card = document.createElement('div');
    card.className = 'bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition-all duration-200 relative overflow-hidden';
    card.setAttribute('data-booking-id', b.id);

    const isPending = b.status === 'Pending';
    const isApproved = b.status === 'Approved';
    const isRejected = b.status === 'Rejected';
    const isCanceled = b.status === 'Canceled';

    let statusBadgeHtml = '';
    if (isPending) {
        statusBadgeHtml = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"><span class="material-symbols-outlined text-xs">pending</span> Pending Review</span>';
    } else if (isApproved) {
        statusBadgeHtml = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"><span class="material-symbols-outlined text-xs">check_circle</span> Approved</span>';
    } else if (isRejected) {
        statusBadgeHtml = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-800 border border-red-200"><span class="material-symbols-outlined text-xs">cancel</span> Declined</span>';
    } else {
        statusBadgeHtml = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200"><span class="material-symbols-outlined text-xs">block</span> Canceled</span>';
    }

    const formattedDate = formatDateDisplay(b.date);
    const displayPhone = b.phone || 'None provided';
    const phoneRaw = b.phoneRaw || b.phone || '';

    // Action buttons based on status
    let actionsHtml = '';
    if (isPending) {
        actionsHtml = `
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-3 border-t border-slate-100">
                <button class="approve-booking-btn flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 sm:py-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer" data-id="${b.id}">
                    <span class="material-symbols-outlined text-base">check</span>
                    <span>Approve Booking</span>
                </button>
                <button class="reject-booking-btn flex-1 sm:flex-initial bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-semibold px-4 py-2.5 sm:py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer" data-id="${b.id}">
                    <span class="material-symbols-outlined text-base">close</span>
                    <span>Decline with Note</span>
                </button>
            </div>
        `;
    } else if (isApproved) {
        actionsHtml = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div class="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-base text-emerald-600">event_available</span>
                    <span>Google Calendar Event Scheduled</span>
                </div>
                <button class="reject-booking-btn text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer w-fit" data-id="${b.id}">
                    <span class="material-symbols-outlined text-xs">cancel</span>
                    <span>Cancel / Decline with Note</span>
                </button>
            </div>
        `;
    } else {
        actionsHtml = `
            <div class="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>Status: ${isRejected ? 'Declined by host' : 'Canceled by attendee'}</span>
            </div>
        `;
    }

    // Admin notes block (if present)
    let adminNotesHtml = '';
    if (b.adminNotes) {
        adminNotesHtml = `
            <div class="mt-3 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                <span class="font-semibold text-red-700 block mb-0.5">Host Decline Reason / Note:</span>
                <p class="whitespace-pre-line">${escapeHtml(b.adminNotes)}</p>
            </div>
        `;
    }

    // Additional guests block
    let guestsHtml = '';
    if (b.guests) {
        guestsHtml = `
            <div class="text-xs text-slate-500 flex items-start gap-1.5 mt-1">
                <span class="material-symbols-outlined text-xs text-slate-400 mt-0.5">group</span>
                <span>Guests: <strong class="text-slate-700 font-normal">${escapeHtml(b.guests)}</strong></span>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-base text-slate-900">${escapeHtml(b.name)}</h3>
                ${statusBadgeHtml}
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">${b.duration} mins</span>
            </div>
            <div class="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-blue-600">schedule</span>
                <span>${formattedDate} &bull; ${escapeHtml(b.time)}</span>
            </div>
        </div>

        <div class="py-3 space-y-2">
            <!-- Contact links -->
            <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <a href="mailto:${escapeHtml(b.email)}" class="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">mail</span>
                    <span>${escapeHtml(b.email)}</span>
                </a>
                ${b.phone ? `
                    <a href="tel:${phoneRaw}" class="text-emerald-700 hover:text-emerald-900 font-medium inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-xs">call</span>
                        <span>${escapeHtml(displayPhone)}</span>
                    </a>
                ` : `
                    <span class="text-slate-400 inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-xs">phone_disabled</span>
                        <span>No phone</span>
                    </span>
                `}
                <span class="text-[11px] text-slate-400 ml-auto hidden sm:inline font-mono">Ref: ${b.id.slice(0, 8)}</span>
            </div>

            ${guestsHtml}

            <!-- Meeting Notes -->
            <div class="mt-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                <span class="text-slate-500 font-semibold block mb-1">Meeting Purpose / Agenda:</span>
                <p class="whitespace-pre-line leading-relaxed">${b.notes ? escapeHtml(b.notes) : '<em class="text-slate-400">No agenda details provided by attendee.</em>'}</p>
            </div>

            ${adminNotesHtml}
        </div>

        ${actionsHtml}
    `;

    // Attach Approve Listener
    const approveBtn = card.querySelector('.approve-booking-btn');
    if (approveBtn) {
        approveBtn.addEventListener('click', () => handleApproveBooking(b.id, approveBtn));
    }

    // Attach Reject Listener
    const rejectBtn = card.querySelector('.reject-booking-btn');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => openRejectionModal(b.id));
    }

    return card;
}

// ---------------------------------------------------------------------------
// 1-Click Approve Action
// ---------------------------------------------------------------------------
async function handleApproveBooking(bookingId, buttonElement) {
    if (!state.sessionToken) return;

    const originalContent = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = `
        <div class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
        <span>Approving...</span>
    `;

    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'approveBooking',
                sessionId: state.sessionToken,
                bookingId: bookingId
            })
        });

        const data = await response.json();

        if (data.requireLogin) {
            handleSessionExpired(data.message);
            return;
        }

        if (data.status === 'success') {
            showToast('Booking successfully approved! Calendar event created.', 'success');

            // Locally update booking
            const booking = state.bookings.find((b) => b.id === bookingId);
            if (booking) {
                booking.status = 'Approved';
            }

            updateStatsAndCounts();
            renderBookings();
        } else {
            showToast(data.message || 'Failed to approve booking.', 'error');
            buttonElement.disabled = false;
            buttonElement.innerHTML = originalContent;
        }
    } catch (err) {
        console.error('Approve booking error:', err);
        showToast('Network error while approving booking.', 'error');
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalContent;
    }
}

// ---------------------------------------------------------------------------
// Decline / Cancel Action
// ---------------------------------------------------------------------------
function openRejectionModal(bookingId) {
    const booking = state.bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    state.pendingRejectBookingId = bookingId;
    modalRejectGuestName.textContent = booking.name;
    modalRejectMeetingTime.textContent = `${formatDateDisplay(booking.date)} at ${booking.time}`;
    modalRejectionNote.value = '';

    rejectionModal.classList.remove('hidden');
    rejectionModal.classList.add('flex');
}

function closeRejectionModal() {
    rejectionModal.classList.add('hidden');
    rejectionModal.classList.remove('flex');
    state.pendingRejectBookingId = null;
}

if (closeRejectionModalBtn) {
    closeRejectionModalBtn.addEventListener('click', closeRejectionModal);
}
if (cancelRejectionBtn) {
    cancelRejectionBtn.addEventListener('click', closeRejectionModal);
}

// Preset Snippets Handler
presetSnippetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        const snippet = btn.getAttribute('data-snippet');
        modalRejectionNote.value = snippet;
    });
});

if (confirmRejectionBtn) {
    confirmRejectionBtn.addEventListener('click', async () => {
        const bookingId = state.pendingRejectBookingId;
        if (!bookingId || !state.sessionToken) return;

        const adminNote = modalRejectionNote.value.trim();

        confirmRejectionBtn.disabled = true;
        confirmRejectionText.textContent = 'Declining...';
        rejectionSpinner.classList.remove('hidden');

        try {
            const response = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'rejectBooking',
                    sessionId: state.sessionToken,
                    bookingId: bookingId,
                    adminNotes: adminNote
                })
            });

            const data = await response.json();

            if (data.requireLogin) {
                closeRejectionModal();
                handleSessionExpired(data.message);
                return;
            }

            if (data.status === 'success') {
                showToast('Booking declined. Attendee has been notified with your note.', 'info');
                closeRejectionModal();

                // Locally update booking
                const booking = state.bookings.find((b) => b.id === bookingId);
                if (booking) {
                    booking.status = 'Rejected';
                    booking.adminNotes = adminNote;
                }

                updateStatsAndCounts();
                renderBookings();
            } else {
                showToast(data.message || 'Failed to decline booking.', 'error');
            }
        } catch (err) {
            console.error('Decline booking error:', err);
            showToast('Network error while declining booking.', 'error');
        } finally {
            confirmRejectionBtn.disabled = false;
            confirmRejectionText.textContent = 'Confirm Decline';
            rejectionSpinner.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------------
// Deep Linking Handler
// ---------------------------------------------------------------------------
function focusTargetBooking(bookingId) {
    if (!bookingId) return;

    const booking = state.bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    // Switch to all tab so card is visible
    state.filter = 'all';
    filterTabs.forEach((tab) => {
        if (tab.getAttribute('data-filter') === 'all') {
            tab.className = TAB_ACTIVE_CLASS;
        } else {
            tab.className = TAB_INACTIVE_CLASS;
        }
    });

    renderBookings();

    requestAnimationFrame(() => {
        const card = document.querySelector(`[data-booking-id="${bookingId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-pulse');
            showToast(`Focused on booking request from ${booking.name}`, 'info');

            setTimeout(() => {
                card.classList.remove('highlight-pulse');
            }, 6000);
        }
    });
}

// ---------------------------------------------------------------------------
// Event Listeners for Filters & Search
// ---------------------------------------------------------------------------
filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        const selectedFilter = tab.getAttribute('data-filter');
        state.filter = selectedFilter;

        filterTabs.forEach((t) => {
            t.className = TAB_INACTIVE_CLASS;
        });
        tab.className = TAB_ACTIVE_CLASS;

        renderBookings();
    });
});

if (bookingSearchInput) {
    bookingSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (state.searchQuery) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
        renderBookings();
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        bookingSearchInput.value = '';
        state.searchQuery = '';
        clearSearchBtn.classList.add('hidden');
        renderBookings();
    });
}

if (refreshBookingsBtn) {
    refreshBookingsBtn.addEventListener('click', () => {
        fetchBookings();
        showToast('Refreshing bookings...', 'info');
    });
}

// ---------------------------------------------------------------------------
// Change Password Modal Handlers
// ---------------------------------------------------------------------------
function openPasswordModal() {
    if (!passwordModal) return;
    if (passwordErrorBanner) passwordErrorBanner.classList.add('hidden');
    if (changePasswordForm) changePasswordForm.reset();
    passwordModal.classList.remove('hidden');
    passwordModal.classList.add('flex');
}

function closePasswordModal() {
    if (!passwordModal) return;
    passwordModal.classList.add('hidden');
    passwordModal.classList.remove('flex');
}

if (openChangePasswordBtn) openChangePasswordBtn.addEventListener('click', openPasswordModal);
if (closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', closePasswordModal);
if (cancelPasswordBtn) cancelPasswordBtn.addEventListener('click', closePasswordModal);

if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = currentPasswordInput.value;
        const newPass = newPasswordInput.value;
        const confirmPass = confirmNewPasswordInput.value;

        if (newPass !== confirmPass) {
            passwordErrorText.textContent = 'New passwords do not match.';
            passwordErrorBanner.classList.remove('hidden');
            return;
        }

        if (newPass.length < 8) {
            passwordErrorText.textContent = 'New password must be at least 8 characters long.';
            passwordErrorBanner.classList.remove('hidden');
            return;
        }

        passwordErrorBanner.classList.add('hidden');
        submitPasswordBtn.disabled = true;
        submitPasswordText.textContent = 'Updating...';
        passwordSpinner.classList.remove('hidden');

        try {
            const res = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'changePassword',
                    sessionId: state.sessionToken,
                    currentPassword: currentPass,
                    newPassword: newPass
                })
            });
            const data = await res.json();
            if (data.requireLogin) {
                closePasswordModal();
                handleSessionExpired(data.message);
                return;
            }
            if (data.status === 'success') {
                closePasswordModal();
                showToast('Password updated successfully!', 'success');
            } else {
                passwordErrorText.textContent = data.message || 'Failed to update password.';
                passwordErrorBanner.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Change password error:', err);
            passwordErrorText.textContent = 'Network error while updating password.';
            passwordErrorBanner.classList.remove('hidden');
        } finally {
            submitPasswordBtn.disabled = false;
            submitPasswordText.textContent = 'Update Password';
            passwordSpinner.classList.add('hidden');
        }
    });
}



// ---------------------------------------------------------------------------
// Background Session Verification (Heartbeat & Window Focus)
// ---------------------------------------------------------------------------
async function verifySessionSilently() {
    if (!state.sessionToken) return;
    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateSession',
                sessionId: state.sessionToken
            })
        });
        const data = await response.json();
        if (data.requireLogin || data.valid === false || data.status === 'error') {
            handleSessionExpired('Your session was revoked from another device or deleted in the backend sheet. Please sign in again.');
        }
    } catch (e) {
        // Suppress background offline network hiccups
    }
}

// Re-verify session when switching back to tab
window.addEventListener('focus', () => {
    if (state.sessionToken) {
        verifySessionSilently();
    }
});

// Periodic heartbeat every 2 minutes while dashboard is active
setInterval(() => {
    if (state.sessionToken && !dashboardView.classList.contains('hidden')) {
        verifySessionSilently();
    }
}, 120000);

// ---------------------------------------------------------------------------
// App Startup & Session Validation
// ---------------------------------------------------------------------------
async function initApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramBookingId = urlParams.get('bookingId');
    if (paramBookingId) {
        state.targetBookingId = paramBookingId;
    }

    const storedToken = localStorage.getItem(SESSION_KEY);
    const storedManagerRaw = localStorage.getItem(MANAGER_KEY);

    if (!storedToken) {
        showAuthView();
        return;
    }

    state.sessionToken = storedToken;
    try {
        if (storedManagerRaw) {
            state.manager = JSON.parse(storedManagerRaw);
        }
    } catch (e) {}

    // Verify session with Google Apps Script
    try {
        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateSession',
                sessionId: storedToken
            })
        });

        const data = await response.json();

        if (data.status === 'success' && data.valid) {
            state.manager = data.manager || state.manager;
            showDashboardView(state.manager);
            fetchBookings();
        } else {
            handleSessionExpired('Your session has expired or was revoked. Please sign in again.');
        }
    } catch (err) {
        console.warn('Session verification offline fallback:', err);
        if (state.manager) {
            showDashboardView(state.manager);
            fetchBookings();
        } else {
            showAuthView();
        }
    }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', initApp);
