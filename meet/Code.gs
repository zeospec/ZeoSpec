/**
 * Google Apps Script - Calendar Booking Backend
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create or open a Google Sheet.
 * 2. Click "Extensions" -> "Apps Script" from the top menu.
 * 3. Paste this code into Code.gs.
 * 4. Run setupSheet() once from the editor to add headers to the sheet.
 * 5. ENABLE ADVANCED CALENDAR SERVICE:
 *    - On the left sidebar, click the "+" next to "Services".
 *    - Select "Google Calendar API", leave it as v3, and click "Add".
 * 6. Deploy -> New Deployment -> Web App. Execute as "Me", Access "Anyone".
 * 7. Set up an Installable Trigger for `onEdit`:
 *    - Go to "Triggers" (alarm clock icon on left).
 *    - Add Trigger -> select `onEditTrigger` -> Head -> From spreadsheet -> On edit.
 */

// CONFIGURATION
let GLOBAL_CONFIG = null;

const SHEET_NAME = 'Bookings';

function getConfig() {
  if (!GLOBAL_CONFIG) {
    GLOBAL_CONFIG = loadConfig();
  }
  return GLOBAL_CONFIG;
}

/**
 * Escapes HTML characters to prevent XSS / HTML injection in notification emails.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safely parses a date string ("YYYY-MM-DD") and time string ("hh:mm a")
 * into a Date object matching the configured script timezone.
 */
function parseScriptDateTime(dStr, tStr) {
  if (!dStr || !tStr) return null;
  const dParts = String(dStr).split('-');
  if (dParts.length !== 3) return new Date(dStr + ' ' + tStr);
  const year = parseInt(dParts[0], 10);
  const month = parseInt(dParts[1], 10) - 1;
  const day = parseInt(dParts[2], 10);
  
  const timeParts = String(tStr).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!timeParts) return new Date(dStr + ' ' + tStr);
  
  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const ampm = timeParts[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  return new Date(year, month, day, hours, minutes, 0);
}

/**
 * Sanitizes phone number for Google Sheets by storing strictly digits.
 * Prevents Google Sheets from interpreting leading '+' as formula errors (#ERROR!).
 */
function sanitizePhoneForSheet(rawPhone) {
  if (!rawPhone) return '';
  return String(rawPhone).replace(/\D/g, '');
}

/**
 * Formats phone number for notifications, emails, and calendar descriptions.
 * Keeps '+' if international or more than 10 digits; doesn't force +91 on standard 10-digit numbers.
 */
function formatDisplayPhone(rawPhone) {
  if (!rawPhone) return '';
  const str = String(rawPhone).trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';
  
  if (str.startsWith('+') || digits.length > 10) {
    return '+' + digits;
  }
  return digits;
}

/**
 * Invalidates cached month availability upon new bookings, reschedules, or cancellations.
 */
function invalidateAvailabilityCache() {
  try {
    const cache = CacheService.getScriptCache();
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const durations = [15, 30, 45, 60];
    const keysToRemove = [];
    
    for (let mOffset = 0; mOffset <= 2; mOffset++) {
      let m = curMonth + mOffset;
      let y = curYear;
      if (m > 12) {
        m -= 12;
        y += 1;
      }
      for (const d of durations) {
        keysToRemove.push(`avail_${y}_${m}_${d}`);
      }
    }
    cache.removeAll(keysToRemove);
  } catch (e) {
    Logger.log("Cache invalidation error: " + e);
  }
}

/**
 * Handles GET requests from the frontend to fetch available slots.
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'getMonthAvailability') {
      const year = parseInt(e.parameter.year, 10);
      const month = parseInt(e.parameter.month, 10); // 1-indexed
      const duration = parseInt(e.parameter.duration, 10) || 15;
      const availabilityMap = getMonthAvailability(year, month, duration);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        availability: availabilityMap
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'cancel') {
      const id = e.parameter.id;
      return cancelBooking(id);
    }
    
    return ContentService.createTextOutput("Invalid action").setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message || error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles POST requests from the frontend to save a booking request.
 */
function doPost(e) {
  try {
    // Parse the JSON payload
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Manager Dashboard API Endpoints
    if (action === 'managerLogin') {
      const userAgent = data.userAgent || '';
      const res = managerLogin(data.email, data.password, userAgent);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'validateSession') {
      const res = validateSession(data.sessionId);
      return ContentService.createTextOutput(JSON.stringify({
        status: res.valid ? 'success' : 'error',
        valid: res.valid,
        message: res.message,
        manager: res.manager
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'managerLogout') {
      const res = managerLogout(data.sessionId);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getManagerBookings') {
      const res = getManagerBookings(data.sessionId);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'approveBooking') {
      const res = apiApproveBooking(data.sessionId, data.bookingId);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'rejectBooking') {
      const res = apiRejectBooking(data.sessionId, data.bookingId, data.adminNotes);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'changePassword') {
      const res = changeManagerPassword(data.sessionId, data.currentPassword, data.newPassword);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'get_booking') {
      return getBookingDetails(data.id);
    }
    if (action === 'cancel') {
      return cancelBooking(data.id);
    }
    if (action === 'reschedule') {
      return processRescheduleBooking(data);
    }

    // Explicit Booking Creation Handler
    if (action === 'create_booking' || action === 'book' || !action) {
      const name = data.name;
      const email = data.email;
      const isoTime = data.isoTime;

      // Strict validation: Reject if missing name, email, or meeting time
      if (!name || !email || !String(name).trim() || !String(email).trim() || !isoTime) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Invalid booking submission: Name, email, and scheduled meeting time are required.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const date = new Date(); // Timestamp of request
      const rawPhone = data.phone || '';
      const phoneDigits = sanitizePhoneForSheet(rawPhone);
      const displayPhone = formatDisplayPhone(rawPhone);
      const notes = data.notes || '';
      const duration = data.duration || 15; // default 15
      const guests = data.guests || '';
      const userTimezone = data.timezone || 'Unknown';
      
      // Convert absolute isoTime to Script Owner's timezone for the spreadsheet
      const scriptTz = Session.getScriptTimeZone();
      const eventDateObj = new Date(isoTime);
      const bookingDate = Utilities.formatDate(eventDateObj, scriptTz, "yyyy-MM-dd");
      const bookingTime = Utilities.formatDate(eventDateObj, scriptTz, "hh:mm a");
      
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      let lastRow;
      const bookingId = Utilities.getUuid();
      let finalStatus = getConfig().AUTO_APPROVE_BOOKINGS ? 'Approved' : 'Pending';
      let sheet;

      try {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        sheet = spreadsheet.getSheetByName(SHEET_NAME);
        
        // Create sheet if it doesn't exist
        if (!sheet) {
          sheet = spreadsheet.insertSheet(SHEET_NAME);
          setupSheetHeaders(sheet);
        }
        
        // Unified Double Booking Protection (Checks both Spreadsheet and Google Calendar)
        if (eventDateObj) {
          verifySlotIsFree(sheet, eventDateObj, duration, null, null);
        }
        
        // Append row to Spreadsheet with pure numeric phoneDigits
        sheet.appendRow([
          bookingId,
          date,
          name,
          email,
          phoneDigits,
          bookingDate,
          bookingTime,
          notes,
          finalStatus,
          duration,
          guests,
          "", // Event ID placeholder
          "", // Calendar ID placeholder
          ""  // Admin Notes placeholder
        ]);
        
        lastRow = sheet.getLastRow();
      } finally {
        lock.releaseLock();
      }
      
      // Send host notification email
      try {
        const ownerEmail = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
        const adminSubject = `New Meeting Request: ${name} (${bookingDate} at ${bookingTime})`;
        const reviewUrl = "https://zeospec.com/meet/manage/?bookingId=" + encodeURIComponent(bookingId);
        const plainTextFallback = `New Meeting Request\n\nName: ${name}\nEmail: ${email}\nPhone: ${displayPhone}\nDate: ${bookingDate}\nTime: ${bookingTime} (${userTimezone})\nDuration: ${duration} minutes\nGuests: ${guests || 'None'}\nNotes: ${notes || 'None'}\nStatus: ${finalStatus}\n\nReview & Manage in Dashboard: ${reviewUrl}`;
        const htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
            <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">New Booking Request</h2>
            </div>
            <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
              <p style="margin-top: 0; font-size: 15px;">You have received a new meeting request:</p>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                <tr><td style="padding: 8px 0; color: #64748b; width: 120px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(email)}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Phone</td><td style="padding: 8px 0;">${escapeHtml(displayPhone)}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Date & Time</td><td style="padding: 8px 0; font-weight: 600;">${bookingDate} at ${bookingTime} (${escapeHtml(userTimezone)})</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Duration</td><td style="padding: 8px 0;">${duration} minutes</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Guests</td><td style="padding: 8px 0;">${escapeHtml(guests || 'None')}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Notes</td><td style="padding: 8px 0;">${escapeHtml(notes || 'None')}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Status</td><td style="padding: 8px 0;"><span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500;">${finalStatus}</span></td></tr>
              </table>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${reviewUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">Review & Manage in Dashboard</a>
              </div>
            </div>
          </div>
        `;
        sendBrandedEmail(ownerEmail, adminSubject, "New Booking Request", htmlContent, plainTextFallback);
      } catch (emailErr) {
        Logger.log("Failed to send admin notification: " + emailErr);
      }
      
      // Auto Approval or Pending Email
      const CONFIG = getConfig();
      if (CONFIG.AUTO_APPROVE_BOOKINGS) {
        approveBooking(sheet, lastRow);
      } else {
        try {
          const subject = `Booking Request Received: ${bookingDate} at ${bookingTime}`;
          const plainTextFallback = `Hi ${name},\n\nYour request for a meeting on ${bookingDate} at ${bookingTime} has been received and is currently pending approval.\n\nOnce approved, you will receive a Google Calendar invitation containing the Google Meet link.`;
          const htmlContent = `
            <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
            <p>Your request for a meeting on <strong>${bookingDate}</strong> at <strong>${bookingTime} (${Session.getScriptTimeZone()})</strong> has been received and is currently pending approval.</p>
            <p>Once approved, you will receive a <strong>Google Calendar invitation</strong> containing the Google Meet link.</p>
          `;
          sendBrandedEmail(email, subject, "Request Pending", htmlContent, plainTextFallback);
        } catch (e) {
          Logger.log("Failed to send pending email to user: " + e);
        }
      }
      
      // Add data validation to the status column for the new row
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Pending', 'Approved', 'Rejected', 'Canceled', 'Rescheduled'], true)
        .setAllowInvalid(false)
        .build();
      sheet.getRange(lastRow, 9).setDataValidation(rule);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Booking request saved.',
        bookingStatus: finalStatus
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Explicit catch-all for any unrecognized action
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Unrecognized action: ' + (action || 'unknown')
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message || error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * TRIGGER FUNCTION: This must be set up as an Installable Trigger.
 * Runs when you edit the Google Sheet. Checks if Status changed to Approved/Rejected.
 */
function onEditTrigger(e) {
  if (!e || !e.range) return;
  
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  
  const range = e.range;
  const col = range.getColumn();
  const row = range.getRow();
  
  // Assuming Status is Column 9 (I)
  if (col === 9 && row > 1) {
    const newValue = e.value;
    const oldValue = e.oldValue;
    
    // If it was changed to Approved
    if (newValue === 'Approved' && oldValue !== 'Approved') {
      approveBooking(sheet, row);
    } 
    // If it was changed to Rejected
    else if (newValue === 'Rejected' && oldValue !== 'Rejected') {
      rejectBooking(sheet, row);
    }
    // If it was changed to Canceled manually by the admin
    else if (newValue === 'Canceled' && oldValue !== 'Canceled') {
      adminCancelBooking(sheet, row);
    }
    // If it was changed to Rescheduled manually by the admin
    else if (newValue === 'Rescheduled' && oldValue !== 'Rescheduled') {
      adminRescheduleBooking(sheet, row);
    }
  }
}

function approveBooking(sheet, row) {
  // Get data from row (now 13 columns wide)
  const data = sheet.getRange(row, 1, 1, 13).getValues()[0];
  const name = data[2];
  const email = data[3];
  const phone = data[4];
  const dateCell = data[5]; // Could be String "YYYY-MM-DD" or Date object
  const timeCell = data[6]; // Could be String "09:00 AM" or Date object
  const notes = data[7];
  const duration = parseInt(data[9], 10) || 15; // Extract Duration from Col 10
  const guests = data[10]; // Extract Guests from Col 11

  let year, month, day;
  if (dateCell instanceof Date) {
    year = dateCell.getFullYear();
    month = dateCell.getMonth();
    day = dateCell.getDate();
  } else {
    // Parse date string
    const parts = String(dateCell).split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  }
  
  // Parse time
  let hours, minutes;
  if (timeCell instanceof Date) {
    hours = timeCell.getHours();
    minutes = timeCell.getMinutes();
  } else {
    const tStr = String(timeCell);
    const timeParts = tStr.match(/(\d+):(\d+)\s(AM|PM)/i);
    if (timeParts) {
      hours = parseInt(timeParts[1], 10);
      minutes = parseInt(timeParts[2], 10);
      const ampm = timeParts[3].toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    } else {
      hours = 9; // Fallback
      minutes = 0;
    }
  }
  
  const startTime = new Date(year, month, day, hours, minutes, 0);
  const endTime = new Date(startTime.getTime() + duration * 60000);
  
  try {
    // Create Calendar Event
    const calendar = CalendarApp.getCalendarById(getConfig().PRIMARY_CALENDAR_ID);
    
    let allGuests = email;
    if (guests && guests.trim() !== '') {
      allGuests += ',' + guests;
    }
    
    const bookingId = data[0];
    const cancelLink = getConfig().FRONTEND_URL + "?action=manage&id=" + bookingId;
    
    const event = calendar.createEvent(`${name} <> Arun Teja Godavarthi`, startTime, endTime, {
      description: `Purpose of the meeting:\n${notes}\n\nContact Details:\nName: ${name}\nEmail: ${email}\nPhone: ${formatDisplayPhone(phone)}\n\nCancel or Reschedule:\n${cancelLink}`,
      guests: allGuests,
      sendInvites: true // This automatically emails the user an invite with Google Meet link if default
    });
    
    // Configure Custom Reminders
    event.removeAllReminders();
    if (getConfig().REMINDER_EMAIL_MINUTES > 0) {
      event.addEmailReminder(getConfig().REMINDER_EMAIL_MINUTES);
    }
    if (getConfig().REMINDER_POPUP_MINUTES > 0) {
      event.addPopupReminder(getConfig().REMINDER_POPUP_MINUTES);
    }
    
    // Save the event ID and calendar ID for potential future cancellation
    sheet.getRange(row, 12).setValue(event.getId());
    sheet.getRange(row, 13).setValue(getConfig().PRIMARY_CALENDAR_ID);
    
    // Update sheet to reflect success (e.g. background color and status)
    sheet.getRange(row, 9).setValue('Approved');
    sheet.getRange(row, 9).setBackground('#d4edda'); // Green
    
  } catch (err) {
    Logger.log("Error creating event: " + err);
    sheet.getRange(row, 9).setBackground('#f8d7da'); // Red
    sheet.getRange(row, 9).setNote("Error creating event: " + err);
  }
}

function rejectBooking(sheet, row) {
  const data = sheet.getRange(row, 1, 1, 14).getValues()[0];
  const name = data[2];
  const email = data[3];
  const phone = data[4];
  const dateCell = data[5];
  const timeCell = data[6];
  const eventId = data[11]; // Col 12
  const calendarId = data[12]; // Col 13
  const adminNote = data[13]; // Col 14
  
  // If an event was previously created, delete it
  if (eventId && calendarId) {
    try {
      CalendarApp.getCalendarById(calendarId).getEventById(eventId).deleteEvent();
    } catch (e) {
      Logger.log("Failed to delete event during rejection: " + e);
    }
    // Clear the IDs so it's not checked again
    sheet.getRange(row, 12, 1, 2).clearContent();
  }
  
  let formattedDate = dateCell;
  if (dateCell instanceof Date) {
    formattedDate = Utilities.formatDate(dateCell, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  
  let formattedTime = timeCell;
  if (timeCell instanceof Date) {
    formattedTime = Utilities.formatDate(timeCell, Session.getScriptTimeZone(), "hh:mm a");
  }
  
  try {
    const subject = `Update: Your booking request for ${formattedDate}`;
    
    let plainTextFallback = '';
    let htmlContent = '';
    
    if (adminNote && adminNote.toString().trim() !== '') {
      plainTextFallback = `Hi ${name},\n\nRegarding your meeting request on ${formattedDate} at ${formattedTime}:\n\n${adminNote}\n\nBest regards,\n${getConfig().SENDER_NAME}`;
      htmlContent = `
        <p>Hi <strong>${name}</strong>,</p>
        <p>Regarding your meeting request on <strong>${formattedDate}</strong> at <strong>${formattedTime} (${Session.getScriptTimeZone()})</strong>:</p>
        <p style="padding-left: 15px; border-left: 4px solid #e5e7eb; color: #4b5563;"><em>${adminNote}</em></p>
      `;
    } else {
      plainTextFallback = `Hi ${name},\n\nUnfortunately, I won't be able to make it for our requested meeting on ${formattedDate} at ${formattedTime}.\n\nPlease let me know if another time works better or feel free to submit another request on the booking page.`;
      htmlContent = `
        <p>Hi <strong>${name}</strong>,</p>
        <p>Unfortunately, I won't be able to make it for our requested meeting on <strong>${formattedDate}</strong> at <strong>${formattedTime} (${Session.getScriptTimeZone()})</strong>.</p>
        <p>Please let me know if another time works better or feel free to submit another request on the booking page.</p>
      `;
    }
    
    sendBrandedEmail(email, subject, "Booking Update", htmlContent, plainTextFallback);
    
    sheet.getRange(row, 9).setValue('Rejected');
    sheet.getRange(row, 9).setBackground('#fff3cd'); // Yellow
    
  } catch (err) {
    Logger.log("Error sending rejection: " + err);
    sheet.getRange(row, 9).setNote("Error sending email: " + err);
  }
}

function adminCancelBooking(sheet, row) {
  const data = sheet.getRange(row, 1, 1, 14).getValues()[0];
  const name = data[2];
  const email = data[3];
  const dateCell = data[5];
  const timeCell = data[6];
  const eventId = data[11];
  const calendarId = data[12];
  const adminNote = data[13];
  
  // If an event was previously created, delete it
  if (eventId && calendarId) {
    try {
      CalendarApp.getCalendarById(calendarId).getEventById(eventId).deleteEvent();
    } catch (e) {
      Logger.log("Failed to delete event during cancellation: " + e);
    }
    sheet.getRange(row, 12, 1, 2).clearContent();
  }
  
  let formattedDate = dateCell;
  if (dateCell instanceof Date) {
    formattedDate = Utilities.formatDate(dateCell, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  
  let formattedTime = timeCell;
  if (timeCell instanceof Date) {
    formattedTime = Utilities.formatDate(timeCell, Session.getScriptTimeZone(), "hh:mm a");
  }
  
  try {
    const subject = `Canceled: Your meeting on ${formattedDate}`;
    let plainTextFallback = '';
    let htmlContent = '';
    
    if (adminNote && adminNote.toString().trim() !== '') {
      plainTextFallback = `Hi ${name},\n\nThis is to let you know that our scheduled meeting on ${formattedDate} at ${formattedTime} has been canceled.\n\nReason: ${adminNote}`;
      htmlContent = `
        <p>Hi <strong>${name}</strong>,</p>
        <p>This is to let you know that our scheduled meeting on <strong>${formattedDate}</strong> at <strong>${formattedTime} (${Session.getScriptTimeZone()})</strong> has been canceled.</p>
        <p><strong>Reason:</strong><br>${adminNote}</p>
      `;
    } else {
      plainTextFallback = `Hi ${name},\n\nThis is to let you know that our scheduled meeting on ${formattedDate} at ${formattedTime} has been canceled.`;
      htmlContent = `
        <p>Hi <strong>${name}</strong>,</p>
        <p>This is to let you know that our scheduled meeting on <strong>${formattedDate}</strong> at <strong>${formattedTime} (${Session.getScriptTimeZone()})</strong> has been canceled.</p>
        <p>Please feel free to book another time if needed.</p>
      `;
    }
    
    sendBrandedEmail(email, subject, "Meeting Canceled", htmlContent, plainTextFallback);
    sheet.getRange(row, 9).setValue('Canceled');
    sheet.getRange(row, 9).setBackground('#e2e3e5'); // Gray
    
  } catch (err) {
    Logger.log("Error sending cancellation email: " + err);
    sheet.getRange(row, 9).setNote("Error sending email: " + err);
  }
}

function adminRescheduleBooking(sheet, row) {
  const data = sheet.getRange(row, 1, 1, 14).getValues()[0];
  const name = data[2];
  const email = data[3];
  const dateCell = data[5];
  const timeCell = data[6];
  const duration = parseInt(data[9], 10) || 15;
  const eventId = data[11];
  const calendarId = data[12];
  const adminNote = data[13];
  const scriptTz = Session.getScriptTimeZone();
  
  if (!eventId || !calendarId) {
    sheet.getRange(row, 9).setNote("Cannot reschedule: No existing calendar event found.");
    return;
  }
  
  // Format Date and Time
  let formattedDate = dateCell instanceof Date ? Utilities.formatDate(dateCell, scriptTz, "yyyy-MM-dd") : dateCell;
  let formattedTime = timeCell instanceof Date ? Utilities.formatDate(timeCell, scriptTz, "hh:mm a") : timeCell;
  
  // Create Date objects for event boundary
  const dtStr = formattedDate + ' ' + formattedTime;
  const startDt = new Date(dtStr);
  
  if (isNaN(startDt.getTime())) {
    sheet.getRange(row, 9).setNote("Cannot reschedule: Invalid date/time format.");
    return;
  }
  
  const endDt = new Date(startDt.getTime() + duration * 60000);
  
  try {
    const event = CalendarApp.getCalendarById(calendarId).getEventById(eventId);
    event.setTime(startDt, endDt);
    
    const subject = `Rescheduled: Your meeting with Arun`;
    let plainTextFallback = `Hi ${name},\n\nYour meeting has been rescheduled to ${formattedDate} at ${formattedTime}.\n`;
    if (adminNote && adminNote.toString().trim() !== '') {
      plainTextFallback += `\nReason: ${adminNote}\n`;
    }
    
    let htmlContent = `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your meeting has been rescheduled to <strong>${formattedDate}</strong> at <strong>${formattedTime} (${Session.getScriptTimeZone()})</strong>.</p>
    `;
    if (adminNote && adminNote.toString().trim() !== '') {
      htmlContent += `<p><strong>Note from Arun:</strong><br>${adminNote}</p>`;
    }
    
    sendBrandedEmail(email, subject, "Meeting Rescheduled", htmlContent, plainTextFallback);
    
    // Change status back to Approved
    sheet.getRange(row, 9).setValue('Approved');
    sheet.getRange(row, 9).clearNote();
    
  } catch (err) {
    Logger.log("Error in admin reschedule: " + err);
    sheet.getRange(row, 9).setNote("Error: " + err);
  }
}
function sendBrandedEmail(to, subject, title, htmlContent, plainTextFallback) {
  const senderName = getConfig().SENDER_NAME;
  const wrapper = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px 20px; color: #111827; }
          .container { max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
          .header { background-color: #3b82f6; color: #ffffff; padding: 30px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }
          .content { padding: 32px 24px; line-height: 1.6; font-size: 16px; }
          .content p { margin-top: 0; margin-bottom: 16px; color: #374151; }
          .content strong { color: #111827; }
          .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
          .btn-container { text-align: center; margin: 24px 0; }
          .btn { display: inline-block; background-color: #3b82f6; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${senderName}
          </div>
        </div>
      </body>
    </html>
  `;
  
  GmailApp.sendEmail(to, subject, plainTextFallback, {
    name: senderName,
    htmlBody: wrapper
  });
}

/**
 * Utility to set up the headers on the sheet. Run once.
 */
function setupSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  setupSheetHeaders(sheet);
  
  let configSheet = spreadsheet.getSheetByName('Config');
  if (!configSheet) {
    configSheet = spreadsheet.insertSheet('Config');
    setupConfigSheet(configSheet);
  }
}

function setupSheetHeaders(sheet) {
  const headers = ['Booking ID', 'Timestamp', 'Name', 'Email', 'Phone', 'Date', 'Time', 'Notes', 'Status', 'Duration (Min)', 'Guests', 'Event ID', 'Calendar ID', 'Admin Note / Rejection Reason'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  
  // Freeze top row
  sheet.setFrozenRows(1);
}

function setupConfigSheet(sheet) {
  const defaults = [
    ['Setting', 'Value (Edit this column)'],
    ['FRONTEND_URL', 'https://zeospec.com/meet/'],
    ['PRIMARY_CALENDAR_ID', 'primary'],
    ['CHECK_CALENDAR_IDS', 'primary,president2627rsamdio@gmail.com,rotaract3191drr@gmail.com,helloaruntg@gmail.com,e6v16rel4smu5brcutroe1ai42s2ct0r@import.calendar.google.com,tugbcn784n0goql6srqm56jae0@group.calendar.google.com'],
    ['AUTO_APPROVE_BOOKINGS', 'FALSE'],
    ['BUFFER_MINUTES', '15'],
    ['MIN_ADVANCE_DAYS', '1'],
    ['MAX_ADVANCE_DAYS', '30'],
    ['SENDER_NAME', 'Arun Teja Godavarthi'],
    ['NOTIFICATION_EMAIL', 'hi@zeospec.com'],
    ['REMINDER_EMAIL_MINUTES', '60'],
    ['REMINDER_POPUP_MINUTES', '10'],
    ['Sunday Schedule', ''],
    ['Monday Schedule', '11:00-18:00'],
    ['Tuesday Schedule', '11:00-12:00, 13:00-18:00'],
    ['Wednesday Schedule', '11:00-18:00'],
    ['Thursday Schedule', '11:00-18:00'],
    ['Friday Schedule', '11:00-18:00'],
    ['Saturday Schedule', '']
  ];
  sheet.getRange(1, 1, defaults.length, 2).setValues(defaults);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 400);
}

function loadConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Config');
  if (!sheet) throw new Error("Config sheet not found. Please run setupSheet() first.");
  
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    config[key] = value;
  }
  
  config['AUTO_APPROVE_BOOKINGS'] = String(config['AUTO_APPROVE_BOOKINGS']).toUpperCase() === 'TRUE';
  config['BUFFER_MINUTES'] = parseInt(config['BUFFER_MINUTES'], 10) || 0;
  config['MIN_ADVANCE_DAYS'] = parseInt(config['MIN_ADVANCE_DAYS'], 10) || 0;
  config['MAX_ADVANCE_DAYS'] = parseInt(config['MAX_ADVANCE_DAYS'], 10) || 30;
  config['REMINDER_EMAIL_MINUTES'] = parseInt(config['REMINDER_EMAIL_MINUTES'], 10) || 0;
  config['REMINDER_POPUP_MINUTES'] = parseInt(config['REMINDER_POPUP_MINUTES'], 10) || 0;
  
  config['CHECK_CALENDAR_IDS'] = config['CHECK_CALENDAR_IDS'] ? config['CHECK_CALENDAR_IDS'].toString().split(',').map(id => id.trim()).filter(id => id) : [];
  
  const days = ['Sunday Schedule', 'Monday Schedule', 'Tuesday Schedule', 'Wednesday Schedule', 'Thursday Schedule', 'Friday Schedule', 'Saturday Schedule'];
  config['WEEKLY_SCHEDULE'] = {};
  
  days.forEach((dayKey, index) => {
    config['WEEKLY_SCHEDULE'][index] = [];
    const val = config[dayKey] ? String(config[dayKey]).trim() : '';
    if (val !== '') {
      const windows = val.split(',');
      windows.forEach(win => {
        const parts = win.split('-');
        if (parts.length === 2) {
          config['WEEKLY_SCHEDULE'][index].push({ start: parts[0].trim(), end: parts[1].trim() });
        }
      });
    }
  });
  
  return config;
}

function cancelBooking(id) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { // Col 1 is bookingId
      const row = i + 1;
      const eventId = data[i][11];
      const calId = data[i][12];
      
      // Delete event if exists
      if (eventId && calId) {
        try {
          CalendarApp.getCalendarById(calId).getEventById(eventId).deleteEvent();
        } catch(err) {
          Logger.log("Error deleting event: " + err);
        }
        sheet.getRange(row, 12, 1, 2).clearContent();
      }
      
      // Update sheet status
      sheet.getRange(row, 9).setValue('Canceled');
      sheet.getRange(row, 9).setBackground('#e2e3e5'); // Gray
      
      // Notify Admin
      try {
        const ownerEmail = getConfig().NOTIFICATION_EMAIL || Session.getEffectiveUser().getEmail();
        const adminSubject = `Canceled: ${data[i][2]} canceled their meeting`;
        const plainTextFallback = `A user has canceled their meeting.\nName: ${data[i][2]}\nDate: ${data[i][5]}\nTime: ${data[i][6]}`;
        const htmlContent = `
          <p>A user has canceled their booking via the scheduling portal.</p>
          <p>
            <strong>Name:</strong> ${data[i][2]}<br>
            <strong>Date:</strong> ${data[i][5]} (${Session.getScriptTimeZone()})<br>
            <strong>Time:</strong> ${data[i][6]} (${Session.getScriptTimeZone()})
          </p>
        `;
        sendBrandedEmail(ownerEmail, adminSubject, "Meeting Canceled", htmlContent, plainTextFallback);
      } catch(e) {}
      
      // Invalidate cached availability
      invalidateAvailabilityCache();
      return ContentService.createTextOutput(JSON.stringify({status: 'success', message: 'Your booking has been successfully canceled.'})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Booking not found or already canceled.'})).setMimeType(ContentService.MimeType.JSON);
}

function getBookingDetails(id) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const name = data[i][2];
      const email = data[i][3];
      const phone = data[i][4];
      const dateStr = data[i][5];
      const timeStr = data[i][6];
      const notes = data[i][7];
      const status = data[i][8];
      const duration = data[i][9];

      let formattedDate = dateStr;
      if (dateStr instanceof Date) {
        formattedDate = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      let formattedTime = timeStr;
      if (timeStr instanceof Date) {
        formattedTime = Utilities.formatDate(timeStr, Session.getScriptTimeZone(), "hh:mm a");
      }
      
      if (status === 'Canceled') {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Booking is already canceled.'})).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        booking: {
          name, email, phone, date: formattedDate, time: formattedTime, notes, status, duration
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Booking not found.'})).setMimeType(ContentService.MimeType.JSON);
}

function processRescheduleBooking(data) {
  const id = data.id;
  const newIsoTime = data.isoTime;
  const newDuration = data.duration || 15;
  const userTimezone = data.timezone || 'Unknown';
  
  const newName = data.name;
  const newEmail = data.email;
  const newPhone = data.phone;
  const newNotes = data.notes;
  
  const scriptTz = Session.getScriptTimeZone();
  const eventDateObj = new Date(newIsoTime);
  const eventEndObj = new Date(eventDateObj.getTime() + newDuration * 60000);
  const bookingDate = Utilities.formatDate(eventDateObj, scriptTz, "yyyy-MM-dd");
  const bookingTime = Utilities.formatDate(eventDateObj, scriptTz, "hh:mm a");

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const sheetData = sheet.getDataRange().getValues();

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0] === id) {
      const row = i + 1;
      const oldStatus = sheetData[i][8];
      const eventId = sheetData[i][11];
      const calId = sheetData[i][12];
      
      // Unified Double Booking Protection
      verifySlotIsFree(sheet, eventDateObj, newDuration, eventId, id);
      
      // 1. Determine new status based on Option B (inherit old status)
      const finalStatus = oldStatus;
      
      // 2. Handle Google Calendar Event Modification
      if (finalStatus === 'Approved') {
         if (eventId && calId) {
           // Edit the existing event directly without deleting it
           try {
             const event = CalendarApp.getCalendarById(calId).getEventById(eventId);
             event.setTime(eventDateObj, eventEndObj);
             if (newName) event.setTitle(`${newName} <> Arun Teja Godavarthi`);
             const cancelLink = getConfig().FRONTEND_URL + "?action=manage&id=" + id;
             event.setDescription(`Purpose of the meeting:\n${newNotes}\n\nContact Details:\nName: ${newName}\nEmail: ${newEmail}\nPhone: ${formatDisplayPhone(newPhone)}\n\nCancel or Reschedule:\n${cancelLink}`);
           } catch (e) {
             Logger.log("Error rescheduling event: " + e);
           }
         }
      }
      // If it was Pending, there is no event to modify.
      
      // 3. Update Spreadsheet Row
      sheet.getRange(row, 3).setValue(newName);
      sheet.getRange(row, 4).setValue(newEmail);
      sheet.getRange(row, 5).setValue(sanitizePhoneForSheet(newPhone));
      sheet.getRange(row, 6).setValue(bookingDate);
      sheet.getRange(row, 7).setValue(bookingTime);
      sheet.getRange(row, 8).setValue(newNotes);
      sheet.getRange(row, 9).setValue(finalStatus); // Keep inherited status (Col 9)
      sheet.getRange(row, 10).setValue(newDuration);
      
      // 4. Send Admin Notification
      try {
        const ownerEmail = getConfig().NOTIFICATION_EMAIL || Session.getEffectiveUser().getEmail();
        const adminSubject = `Reschedule ${finalStatus === 'Approved' ? 'Notice' : 'Request'}: ${newName} on ${bookingDate}`;
        const plainTextFallback = `A user has rescheduled their meeting!\nName: ${newName}\nNew Date: ${bookingDate}\nNew Time: ${bookingTime}\nStatus: ${finalStatus}\n${finalStatus === 'Pending' ? 'Please review in sheet.' : 'Event auto-updated.'}`;
        
        const htmlContent = `
          <p>A user has rescheduled their meeting!</p>
          <p>
            <strong>Name:</strong> ${escapeHtml(newName)}<br>
            <strong>New Date:</strong> ${bookingDate} (${Session.getScriptTimeZone()})<br>
            <strong>New Time:</strong> ${bookingTime} (${Session.getScriptTimeZone()})<br>
            <strong>User's Timezone:</strong> ${escapeHtml(userTimezone)}<br>
            <strong>Status:</strong> ${finalStatus}
          </p>
          <p>${finalStatus === 'Pending' ? 'Please review and approve the new time in your spreadsheet.' : 'The existing calendar event was automatically updated.'}</p>
          <div class="btn-container">
            <a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}" class="btn">View Google Sheet</a>
          </div>
        `;
        sendBrandedEmail(ownerEmail, adminSubject, `Reschedule ${finalStatus === 'Approved' ? 'Notice' : 'Request'}`, htmlContent, plainTextFallback);
      } catch(e) {
        Logger.log("Admin email fail on reschedule: " + e);
      }
      
      // 5. Process user notification
      if (finalStatus === 'Approved') {
          // Already modified the event. Just send the rescheduled email.
          try {
            const emailTarget = newEmail || sheetData[i][3];
            const subject = `Update: Your meeting has been rescheduled to ${bookingDate}`;
            const plainTextFallback = `Hi ${newName},\n\nYour meeting has been successfully rescheduled to ${bookingDate} at ${bookingTime}.`;
            const htmlContent = `
              <p>Hi <strong>${escapeHtml(newName)}</strong>,</p>
              <p>Your meeting has been successfully rescheduled to <strong>${bookingDate}</strong> at <strong>${bookingTime} (${Session.getScriptTimeZone()})</strong>.</p>
            `;
            sendBrandedEmail(emailTarget, subject, "Meeting Rescheduled", htmlContent, plainTextFallback);
          } catch(e) {}
      } else {
         // Send pending email
         try {
           const emailTarget = newEmail || sheetData[i][3];
           const subject = `Reschedule Request Received: ${bookingDate} at ${bookingTime}`;
           const plainTextFallback = `Hi ${newName},\n\nYour request to reschedule to ${bookingDate} at ${bookingTime} has been received and is pending approval.\n\nOnce approved, you will receive a Google Calendar invitation containing the Google Meet link.`;
           const htmlContent = `
             <p>Hi <strong>${escapeHtml(newName)}</strong>,</p>
             <p>Your request to reschedule to <strong>${bookingDate}</strong> at <strong>${bookingTime} (${Session.getScriptTimeZone()})</strong> has been received and is pending approval.</p>
             <p>Once approved, you will receive a <strong>Google Calendar invitation</strong> containing the Google Meet link.</p>
           `;
           sendBrandedEmail(emailTarget, subject, "Reschedule Pending", htmlContent, plainTextFallback);
         } catch(e) {
           Logger.log("User email fail on reschedule: " + e);
         }
      }

      // Invalidate cached availability
      invalidateAvailabilityCache();

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        bookingStatus: finalStatus,
        message: 'Booking rescheduled successfully.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  throw new Error("Booking ID not found.");
}

function getMonthAvailability(year, month, duration) {
  // month is 1-indexed
  const cacheKey = `avail_${year}_${month}_${duration}`;
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    try {
      return JSON.parse(cachedData);
    } catch (e) {
      Logger.log("Cache read error: " + e);
    }
  }

  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today.getTime() + getConfig().MIN_ADVANCE_DAYS * 86400000);
  const maxDate = new Date(today.getTime() + getConfig().MAX_ADVANCE_DAYS * 86400000);

  if (endDate < minDate || startDate > maxDate) {
    return {};
  }

  const queryStart = startDate < minDate ? minDate : startDate;
  const queryEnd = endDate > maxDate ? maxDate : endDate;

  let allBusyTimes = [];
  
  // 1. Fetch from Google Calendar
  const request = {
    timeMin: queryStart.toISOString(),
    timeMax: queryEnd.toISOString(),
    items: getConfig().CHECK_CALENDAR_IDS.map(id => ({ id: id }))
  };
  
  try {
    const response = Calendar.Freebusy.query(request);
    for (const calId in response.calendars) {
      const busy = response.calendars[calId].busy;
      if (busy && busy.length > 0) {
        busy.forEach(block => {
          allBusyTimes.push({
            start: new Date(block.start),
            end: new Date(block.end)
          });
        });
      }
    }
  } catch(e) {
    Logger.log("FreeBusy error: " + e);
  }
  
  // 2. Fetch from Spreadsheet to capture "Pending" and "Approved" bookings not synced
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    const dataRange = sheet.getDataRange().getValues();
    const scriptTz = Session.getScriptTimeZone();
    
    for (let i = 1; i < dataRange.length; i++) {
      const rowStatus = dataRange[i][8]; // Status (Col 9)
      if (rowStatus === 'Pending' || rowStatus === 'Approved') {
        const rowDate = dataRange[i][5]; // Date
        const rowTime = dataRange[i][6]; // Time
        const rowDuration = dataRange[i][9] || 15; // Duration
        
        let dStr = rowDate instanceof Date ? Utilities.formatDate(rowDate, scriptTz, "yyyy-MM-dd") : rowDate;
        let tStr = rowTime instanceof Date ? Utilities.formatDate(rowTime, scriptTz, "hh:mm a") : rowTime;
        
        const startDt = parseScriptDateTime(dStr, tStr);
        if (startDt && !isNaN(startDt.getTime())) {
            const endDt = new Date(startDt.getTime() + rowDuration * 60000);
            allBusyTimes.push({ start: startDt, end: endDt });
        }
      }
    }
  } catch(e) {
    Logger.log("Spreadsheet read error: " + e);
  }
  
  // 3. Compute slots for each day
  const availabilityMap = {};
  const numDays = endDate.getDate();
  const now = new Date();
  
  for (let day = 1; day <= numDays; day++) {
    const checkDate = new Date(year, month - 1, day);
    const dateStr = Utilities.formatDate(checkDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    availabilityMap[dateStr] = []; // Default to empty array
    
    if (checkDate < minDate || checkDate > maxDate) {
      continue;
    }
    
    const dayOfWeek = checkDate.getDay();
    const dailyWindows = getConfig().WEEKLY_SCHEDULE[dayOfWeek];
    if (!dailyWindows || dailyWindows.length === 0) {
      continue;
    }
    
    const fullDayEnd = new Date(year, month - 1, day, 23, 59, 59);
    if (fullDayEnd < now) continue;
    
    let validSlots = [];
    
    for (const window of dailyWindows) {
      const [startH, startM] = window.start.split(':').map(Number);
      const [endH, endM] = window.end.split(':').map(Number);
      
      const windowStart = new Date(year, month - 1, day, startH, startM, 0);
      const windowEnd = new Date(year, month - 1, day, endH, endM, 0);
      
      if (windowEnd < now) continue;
      
      let currentSlot = new Date(windowStart.getTime());
      
      if (currentSlot < now) {
        const msSinceEpoch = now.getTime();
        const roundedMs = Math.ceil(msSinceEpoch / (15 * 60000)) * (15 * 60000);
        currentSlot = new Date(roundedMs);
      }
      
      while (currentSlot < windowEnd) {
        const slotEndExact = new Date(currentSlot.getTime() + duration * 60000);
        
        if (slotEndExact > windowEnd) {
          break;
        }
        
        let collision = false;
        for (const busy of allBusyTimes) {
          const busyStartBuffered = new Date(busy.start.getTime() - getConfig().BUFFER_MINUTES * 60000);
          const busyEndBuffered = new Date(busy.end.getTime() + getConfig().BUFFER_MINUTES * 60000);
          
          if (currentSlot < busyEndBuffered && slotEndExact > busyStartBuffered) {
            collision = true;
            break;
          }
        }
        
        if (!collision) {
          validSlots.push(new Date(currentSlot).toISOString());
        }
        
        currentSlot = new Date(currentSlot.getTime() + 15 * 60000);
      }
    }
    
    availabilityMap[dateStr] = validSlots;
  }
  
  try {
    cache.put(cacheKey, JSON.stringify(availabilityMap), 300); // 5 min TTL
  } catch (e) {
    Logger.log("Cache write error: " + e);
  }

  return availabilityMap;
}

function verifySlotIsFree(sheet, eventDateObj, duration, skipEventId, skipBookingId) {
  const reqStartDt = eventDateObj;
  const reqEndDt = new Date(reqStartDt.getTime() + duration * 60000);
  const bufferMs = getConfig().BUFFER_MINUTES * 60000;
  const bufferedReqStart = new Date(reqStartDt.getTime() - bufferMs);
  const bufferedReqEnd = new Date(reqEndDt.getTime() + bufferMs);
  const scriptTz = Session.getScriptTimeZone();
  
  // 1. Spreadsheet Check (Catch Pending/Approved slots not yet on calendar)
  const dataRange = sheet.getDataRange().getValues();
  for (let i = 1; i < dataRange.length; i++) {
    const rowId = dataRange[i][0];
    if (skipBookingId && rowId === skipBookingId) continue;
    
    const rowStatus = dataRange[i][8];
    if (rowStatus === 'Pending' || rowStatus === 'Approved') {
      const rowDate = dataRange[i][5];
      const rowTime = dataRange[i][6];
      const rowDuration = parseInt(dataRange[i][9], 10) || 15;
      
      let dStr = rowDate instanceof Date ? Utilities.formatDate(rowDate, scriptTz, "yyyy-MM-dd") : rowDate;
      let tStr = rowTime instanceof Date ? Utilities.formatDate(rowTime, scriptTz, "hh:mm a") : rowTime;
      
      const rowStartDt = parseScriptDateTime(dStr, tStr);
      if (rowStartDt && !isNaN(rowStartDt.getTime())) {
        const rowEndDt = new Date(rowStartDt.getTime() + rowDuration * 60000);
        // Overlap algorithm: Start_A < End_B && Start_B < End_A
        if (bufferedReqStart < rowEndDt && bufferedReqEnd > rowStartDt) {
          throw new Error("This time slot is no longer available due to a pending booking. Please select a different time.");
        }
      }
    }
  }
  
  // 2. Google Calendar Check (Catch external events & race conditions)
  const calIds = getConfig().CHECK_CALENDAR_IDS;
  for (const calId of calIds) {
    try {
      const cal = CalendarApp.getCalendarById(calId);
      if (cal) {
        const events = cal.getEvents(bufferedReqStart, bufferedReqEnd);
        for (const ev of events) {
          if (skipEventId && ev.getId() === skipEventId) {
            continue; // Safely skip the old event when rescheduling
          }
          
          const evStart = ev.getStartTime();
          const evEnd = ev.getEndTime();
          if (evStart < bufferedReqEnd && evEnd > bufferedReqStart) {
            throw new Error("This time slot is no longer available on the calendar.");
          }
        }
      }
    } catch (e) {
      // Fallback to FreeBusy if we lack read permissions on a secondary calendar
      const request = {
        timeMin: bufferedReqStart.toISOString(),
        timeMax: bufferedReqEnd.toISOString(),
        items: [{ id: calId }]
      };
      const response = Calendar.Freebusy.query(request);
      const busy = response.calendars[calId].busy;
      if (busy && busy.length > 0) {
        throw new Error("This time slot is no longer available on the calendar.");
      }
    }
  }
}

// ===========================================================================
// MANAGER AUTHENTICATION & DASHBOARD API (PWA BACKEND)
// ===========================================================================

/**
 * Computes a salted SHA-256 password hash.
 */
function hashPassword(password, salt) {
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + String(password),
    Utilities.Charset.UTF_8
  );
  return rawBytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a high-entropy 64-character session token.
 */
function generateSessionToken() {
  return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).toLowerCase();
}

/**
 * Auto-creates Managers and Sessions sheets if missing, with an initial admin user.
 * Run once from editor or called automatically if sheets are absent.
 */
function setupManagerSheets(initialEmail, initialPassword) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Managers Sheet
  let mgrSheet = spreadsheet.getSheetByName('Managers');
  if (!mgrSheet) {
    mgrSheet = spreadsheet.insertSheet('Managers');
    const headers = ['Manager ID', 'Email', 'Password Hash', 'Salt', 'Full Name', 'Role', 'Active', 'Created At', 'Last Login At'];
    mgrSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    mgrSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    mgrSheet.setFrozenRows(1);
    mgrSheet.setColumnWidth(1, 120);
    mgrSheet.setColumnWidth(2, 220);
    mgrSheet.setColumnWidth(3, 300);
    mgrSheet.setColumnWidth(4, 150);
    mgrSheet.setColumnWidth(5, 200);
    
    // Seed initial manager
    const email = (initialEmail || getConfig().NOTIFICATION_EMAIL || 'hi@zeospec.com').toLowerCase().trim();
    const pass = initialPassword || 'ZeoSpec@2026';
    const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    const hash = hashPassword(pass, salt);
    const now = new Date().toISOString();
    
    mgrSheet.appendRow([
      'MGR-001',
      email,
      hash,
      salt,
      getConfig().SENDER_NAME || 'Arun Teja Godavarthi',
      'admin',
      true,
      now,
      ''
    ]);
  }
  
  // 2. Sessions Sheet
  let sessSheet = spreadsheet.getSheetByName('Sessions');
  if (!sessSheet) {
    sessSheet = spreadsheet.insertSheet('Sessions');
    const headers = ['Session Token', 'Manager ID', 'Email', 'Created At', 'Expires At', 'Last Active At', 'User Agent'];
    sessSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sessSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sessSheet.setFrozenRows(1);
    sessSheet.setColumnWidth(1, 300);
    sessSheet.setColumnWidth(2, 120);
    sessSheet.setColumnWidth(3, 220);
  }
  
  // 3. Ensure Bookings sheet has Column 14 header (Admin Note / Rejection Reason)
  const bookSheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (bookSheet) {
    const col14Header = bookSheet.getRange(1, 14).getValue();
    if (!col14Header) {
      bookSheet.getRange(1, 14).setValue('Admin Note / Rejection Reason');
      bookSheet.getRange(1, 14).setFontWeight('bold');
    }
  }
}

/**
 * Validates a session token against the Sessions and Managers sheets.
 */
function validateSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 32) {
    return { valid: false, message: 'Invalid session token format.' };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sessSheet = spreadsheet.getSheetByName('Sessions');
  let mgrSheet = spreadsheet.getSheetByName('Managers');
  if (!sessSheet || !mgrSheet) {
    setupManagerSheets();
    sessSheet = spreadsheet.getSheetByName('Sessions');
    mgrSheet = spreadsheet.getSheetByName('Managers');
  }
  
  const sessData = sessSheet.getDataRange().getValues();
  let sessionRow = -1;
  let sessionRecord = null;
  
  for (let i = 1; i < sessData.length; i++) {
    if (String(sessData[i][0]).trim() === sessionId.trim()) {
      sessionRow = i + 1;
      sessionRecord = {
        token: sessData[i][0],
        managerId: sessData[i][1],
        email: String(sessData[i][2]).toLowerCase().trim(),
        createdAt: new Date(sessData[i][3]),
        expiresAt: new Date(sessData[i][4]),
        lastActiveAt: sessData[i][5] ? new Date(sessData[i][5]) : null,
        userAgent: sessData[i][6]
      };
      break;
    }
  }
  
  if (!sessionRecord) {
    return { valid: false, message: 'Session not found or expired.' };
  }
  
  const now = new Date();
  if (now.getTime() > sessionRecord.expiresAt.getTime()) {
    // Delete expired session
    try { sessSheet.deleteRow(sessionRow); } catch (e) {}
    return { valid: false, message: 'Session expired. Please log in again.' };
  }
  
  // Verify manager is still active
  const mgrData = mgrSheet.getDataRange().getValues();
  let manager = null;
  for (let j = 1; j < mgrData.length; j++) {
    if (String(mgrData[j][0]).trim() === String(sessionRecord.managerId).trim()) {
      const active = mgrData[j][6];
      if (active !== true && String(active).toUpperCase() !== 'TRUE') {
        return { valid: false, message: 'Manager account is inactive.' };
      }
      manager = {
        id: mgrData[j][0],
        email: mgrData[j][1],
        name: mgrData[j][4],
        role: mgrData[j][5]
      };
      break;
    }
  }
  
  if (!manager) {
    return { valid: false, message: 'Associated manager account not found.' };
  }
  
  // Rolling update of Last Active At (once per 5 minutes to minimize sheet writes)
  if (!sessionRecord.lastActiveAt || (now.getTime() - sessionRecord.lastActiveAt.getTime() > 300000)) {
    try {
      sessSheet.getRange(sessionRow, 6).setValue(now.toISOString());
    } catch (e) {}
  }
  
  return { valid: true, manager, sessionRecord };
}

/**
 * Authenticates a manager by email and password, issuing a persistent 30-day session token.
 */
function managerLogin(email, password, userAgent) {
  if (!email || !password) {
    return { status: 'error', message: 'Email and password are required.' };
  }
  
  const cleanEmail = String(email).toLowerCase().trim();
  const cache = CacheService.getScriptCache();
  const failKey = 'login_fail_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
  const fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= 5) {
    return { status: 'error', message: 'Too many failed login attempts. Account temporarily locked for 15 minutes.' };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let mgrSheet = spreadsheet.getSheetByName('Managers');
  if (!mgrSheet) {
    setupManagerSheets();
    mgrSheet = spreadsheet.getSheetByName('Managers');
  }
  
  const mgrData = mgrSheet.getDataRange().getValues();
  let matchedRow = -1;
  let manager = null;
  
  for (let i = 1; i < mgrData.length; i++) {
    const rowEmail = String(mgrData[i][1]).toLowerCase().trim();
    const rowUsername = rowEmail.split('@')[0];
    if (rowEmail === cleanEmail || rowUsername === cleanEmail) {
      matchedRow = i + 1;
      manager = {
        id: mgrData[i][0],
        email: mgrData[i][1],
        hash: mgrData[i][2],
        salt: mgrData[i][3],
        name: mgrData[i][4],
        role: mgrData[i][5],
        active: mgrData[i][6]
      };
      break;
    }
  }
  
  if (!manager || (manager.active !== true && String(manager.active).toUpperCase() !== 'TRUE')) {
    cache.put(failKey, String(fails + 1), 900); // 15 mins lock
    return { status: 'error', message: 'Invalid credentials or inactive account.' };
  }
  
  const computedHash = hashPassword(password, manager.salt);
  if (computedHash !== manager.hash) {
    cache.put(failKey, String(fails + 1), 900);
    return { status: 'error', message: 'Invalid credentials or inactive account.' };
  }
  
  // Successful login: reset failure counter
  cache.remove(failKey);
  
  const now = new Date();
  mgrSheet.getRange(matchedRow, 9).setValue(now.toISOString());
  
  let sessSheet = spreadsheet.getSheetByName('Sessions');
  if (!sessSheet) {
    setupManagerSheets();
    sessSheet = spreadsheet.getSheetByName('Sessions');
  }
  
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  const friendlyDevice = parseUserAgent(userAgent);
  const deviceLabel = friendlyDevice ? `${friendlyDevice} - ${userAgent || ''}` : (userAgent || 'Unknown Device');

  sessSheet.appendRow([
    sessionToken,
    manager.id,
    manager.email,
    now.toISOString(),
    expiresAt.toISOString(),
    now.toISOString(),
    deviceLabel
  ]);
  
  return {
    status: 'success',
    sessionToken: sessionToken,
    manager: {
      id: manager.id,
      email: manager.email,
      name: manager.name,
      role: manager.role
    }
  };
}

/**
 * Revokes a session upon manager logout.
 */
function managerLogout(sessionId) {
  if (!sessionId) return { status: 'success' };
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sessSheet = spreadsheet.getSheetByName('Sessions');
  if (!sessSheet) return { status: 'success' };
  
  const data = sessSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === sessionId.trim()) {
      sessSheet.deleteRow(i + 1);
      break;
    }
  }
  return { status: 'success' };
}

/**
 * Returns all bookings with full metadata for the manager dashboard.
 */
function getManagerBookings(sessionId) {
  const auth = validateSession(sessionId);
  if (!auth.valid) {
    return { status: 'error', message: auth.message, requireLogin: true };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { status: 'success', bookings: [], manager: auth.manager };
  }
  
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  const scriptTz = Session.getScriptTimeZone();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !row[2] || !row[3] || !String(row[2]).trim() || !String(row[3]).trim()) continue; // Ignore empty or phantom rows missing name or email
    
    let formattedDate = '';
    let formattedTime = '';
    try {
      if (row[5] instanceof Date) {
        formattedDate = Utilities.formatDate(row[5], scriptTz, 'yyyy-MM-dd');
      } else {
        formattedDate = String(row[5] || '');
      }
      if (row[6] instanceof Date) {
        formattedTime = Utilities.formatDate(row[6], scriptTz, 'hh:mm a');
      } else {
        formattedTime = String(row[6] || '');
      }
    } catch (e) {}
    
    bookings.push({
      id: String(row[0]),
      timestamp: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      name: String(row[2] || ''),
      email: String(row[3] || ''),
      phone: formatDisplayPhone(row[4] || ''),
      phoneRaw: String(row[4] || ''),
      date: formattedDate,
      time: formattedTime,
      notes: String(row[7] || ''),
      status: String(row[8] || 'Pending'),
      duration: parseInt(row[9] || '15', 10),
      guests: String(row[10] || ''),
      eventId: String(row[11] || ''),
      calendarId: String(row[12] || ''),
      adminNotes: String(row[13] || '')
    });
  }
  
  // Sort descending by date and time
  bookings.sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
  
  return {
    status: 'success',
    bookings: bookings,
    manager: auth.manager
  };
}

/**
 * Manager action: Approves a booking from the dashboard.
 */
function apiApproveBooking(sessionId, bookingId) {
  const auth = validateSession(sessionId);
  if (!auth.valid) {
    return { status: 'error', message: auth.message, requireLogin: true };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let targetRow = -1;
  let bookingData = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(bookingId).trim()) {
      targetRow = i + 1;
      bookingData = data[i];
      break;
    }
  }
  
  if (!bookingData) {
    return { status: 'error', message: 'Booking not found.' };
  }
  
  if (bookingData[8] === 'Approved') {
    return { status: 'error', message: 'This booking is already approved.' };
  }
  
  sheet.getRange(targetRow, 9).setValue('Approved');
  sheet.getRange(targetRow, 9).setBackground('#d4edda');
  approveBooking(sheet, targetRow);
  invalidateAvailabilityCache();
  
  return {
    status: 'success',
    message: 'Booking successfully approved and calendar event created.'
  };
}

/**
 * Manager action: Rejects a booking with custom admin notes from the dashboard.
 */
function apiRejectBooking(sessionId, bookingId, adminNotes) {
  const auth = validateSession(sessionId);
  if (!auth.valid) {
    return { status: 'error', message: auth.message, requireLogin: true };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let targetRow = -1;
  let bookingData = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(bookingId).trim()) {
      targetRow = i + 1;
      bookingData = data[i];
      break;
    }
  }
  
  if (!bookingData) {
    return { status: 'error', message: 'Booking not found.' };
  }
  
  const note = String(adminNotes || '').trim();
  sheet.getRange(targetRow, 14).setValue(note);
  sheet.getRange(targetRow, 9).setValue('Rejected');
  sheet.getRange(targetRow, 9).setBackground('#fff3cd');
  rejectBooking(sheet, targetRow);
  invalidateAvailabilityCache();
  
  return {
    status: 'success',
    message: 'Booking has been rejected and attendee notified with your note.'
  };
}

/**
 * Changes a manager password from the authenticated dashboard.
 */
function changeManagerPassword(sessionId, currentPassword, newPassword) {
  const auth = validateSession(sessionId);
  if (!auth.valid) {
    return { status: 'error', message: auth.message, requireLogin: true };
  }
  
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return { status: 'error', message: 'New password must be at least 8 characters long.' };
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const mgrSheet = spreadsheet.getSheetByName('Managers');
  if (!mgrSheet) {
    return { status: 'error', message: 'Managers sheet not found.' };
  }
  
  const mgrData = mgrSheet.getDataRange().getValues();
  let targetRow = -1;
  let currentHash = '';
  let currentSalt = '';
  
  for (let i = 1; i < mgrData.length; i++) {
    if (String(mgrData[i][0]).trim() === String(auth.manager.id).trim()) {
      targetRow = i + 1;
      currentHash = mgrData[i][2];
      currentSalt = mgrData[i][3];
      break;
    }
  }
  
  if (targetRow === -1) {
    return { status: 'error', message: 'Manager account record not found.' };
  }
  
  // Verify current password
  const checkHash = hashPassword(currentPassword, currentSalt);
  if (checkHash !== currentHash) {
    return { status: 'error', message: 'Current password is incorrect.' };
  }
  
  // Generate fresh salt and new hash
  const newSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const newHash = hashPassword(newPassword, newSalt);
  
  mgrSheet.getRange(targetRow, 3).setValue(newHash);
  mgrSheet.getRange(targetRow, 4).setValue(newSalt);
  
  return {
    status: 'success',
    message: 'Password successfully updated.'
  };
}

/**
 * Standalone utility to set or reset a manager password directly from Apps Script editor.
 * Usage: Select 'updateManagerPassword' in the Apps Script toolbar dropdown and click 'Run'.
 * You can customize the pass variable below before running.
 */
function updateManagerPassword(emailOrUsername, newPassword) {
  const cleanEmail = String(emailOrUsername || getConfig().NOTIFICATION_EMAIL || 'hi@zeospec.com').toLowerCase().trim();
  const pass = newPassword || 'ZeoSpec@2026';
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let mgrSheet = spreadsheet.getSheetByName('Managers');
  if (!mgrSheet) {
    setupManagerSheets(cleanEmail, pass);
    Logger.log("Initialized Managers sheet with account: " + cleanEmail);
    return;
  }
  
  const data = mgrSheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase().trim() === cleanEmail) {
      targetRow = i + 1;
      break;
    }
  }
  
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const hash = hashPassword(pass, salt);
  
  if (targetRow > 0) {
    mgrSheet.getRange(targetRow, 3).setValue(hash);
    mgrSheet.getRange(targetRow, 4).setValue(salt);
    Logger.log("Successfully updated password for: " + cleanEmail);
  } else {
    mgrSheet.appendRow([
      'MGR-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
      cleanEmail,
      hash,
      salt,
      getConfig().SENDER_NAME || 'Arun Teja Godavarthi',
      'admin',
      true,
      new Date().toISOString(),
      ''
    ]);
    Logger.log("Created new manager account: " + cleanEmail);
  }
}

/**
 * Parses user agent string into friendly device and browser labels.
 */
function parseUserAgent(ua) {
  if (!ua) return 'Unknown Device';
  const str = String(ua);
  
  let os = 'Desktop';
  if (/iPhone/i.test(str)) os = 'iPhone';
  else if (/iPad/i.test(str)) os = 'iPad';
  else if (/Android/i.test(str)) os = 'Android Device';
  else if (/Macintosh|Mac OS X/i.test(str)) os = 'Mac';
  else if (/Windows/i.test(str)) os = 'Windows PC';
  else if (/Linux/i.test(str)) os = 'Linux PC';
  
  let browser = 'Browser';
  if (/Edg/i.test(str)) browser = 'Edge';
  else if (/Chrome/i.test(str)) browser = 'Chrome';
  else if (/Safari/i.test(str)) browser = 'Safari';
  else if (/Firefox/i.test(str)) browser = 'Firefox';
  
  return `${os} (${browser})`;
}

