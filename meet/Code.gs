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

    if (action === 'get_booking') {
      return getBookingDetails(data.id);
    }
    if (action === 'cancel') {
      return cancelBooking(data.id);
    }
    if (action === 'reschedule') {
      return processRescheduleBooking(data);
    }

    const date = new Date(); // Timestamp of request
    
    const name = data.name;
    const email = data.email;
    const phone = data.phone || '';
    const notes = data.notes || '';
    const isoTime = data.isoTime; 
    const duration = data.duration || 15; // default 15
    const guests = data.guests || '';
    const userTimezone = data.timezone || 'Unknown';
    
    // Convert absolute isoTime to Script Owner's timezone for the spreadsheet
    const scriptTz = Session.getScriptTimeZone();
    let eventDateObj;
    if (isoTime) {
      eventDateObj = new Date(isoTime);
    } else {
      // Fallback for legacy requests if any
      eventDateObj = new Date();
    }
    const bookingDate = Utilities.formatDate(eventDateObj, scriptTz, "yyyy-MM-dd");
    const bookingTime = Utilities.formatDate(eventDateObj, scriptTz, "hh:mm a");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      setupSheetHeaders(sheet);
    }
    
    // Double Booking Protection
    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      const rowDate = dataRange[i][5]; // Date (Col 6)
      const rowTime = dataRange[i][6]; // Time (Col 7)
      const rowStatus = dataRange[i][8]; // Status (Col 9)
      
      let formattedRowDate = rowDate;
      if (rowDate instanceof Date) {
        formattedRowDate = Utilities.formatDate(rowDate, scriptTz, "yyyy-MM-dd");
      }
      let formattedRowTime = rowTime;
      if (rowTime instanceof Date) {
        formattedRowTime = Utilities.formatDate(rowTime, scriptTz, "hh:mm a");
      }
      
      if (formattedRowDate === bookingDate && formattedRowTime.toLowerCase() === bookingTime.toLowerCase() && (rowStatus === 'Pending' || rowStatus === 'Approved')) {
        throw new Error("This exact time slot is already pending or approved. Please refresh and select a different slot.");
      }
    }
    
    // Double Booking Protection from Google Calendar (Race Condition Check)
    if (eventDateObj) {
      const eventEndObj = new Date(eventDateObj.getTime() + duration * 60000);
      const request = {
        timeMin: eventDateObj.toISOString(),
        timeMax: eventEndObj.toISOString(),
        items: CHECK_CALENDAR_IDS.map(id => ({ id: id }))
      };
      const response = Calendar.Freebusy.query(request);
      for (const calId in response.calendars) {
        const busy = response.calendars[calId].busy;
        if (busy && busy.length > 0) {
          // Verify if the busy block overlaps with our specific slot considering buffer
          throw new Error("This time slot is no longer available. Please select a different time.");
        }
      }
    }

    // Generate a unique ID
    const bookingId = Utilities.getUuid();
    let finalStatus = getConfig().AUTO_APPROVE_BOOKINGS ? 'Approved' : 'Pending';
    
    // Append the row with Status and Duration
    sheet.appendRow([
      bookingId,
      date,
      name,
      email,
      phone,
      bookingDate,
      bookingTime,
      notes,
      finalStatus, // Status column (Col 9)
      duration,  // Duration column (Col 10)
      guests,    // Guests column (Col 11)
      '',        // Event ID (Col 12)
      ''         // Calendar ID (Col 13)
    ]);
    
    // Format Date and Time columns for the new row so Sheets natively sorts them
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 6).setNumberFormat('yyyy-mm-dd'); // Date Column
    sheet.getRange(lastRow, 7).setNumberFormat('hh:mm am/pm'); // Time Column
    
    // Send email notification to admin/owner
    try {
      const CONFIG = getConfig();
      const ownerEmail = CONFIG.NOTIFICATION_EMAIL || Session.getEffectiveUser().getEmail();
      const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
      const adminSubject = `New Booking Request: ${name} on ${bookingDate}`;
      const adminBody = `You have a new booking request!
      
Name: ${name}
Email: ${email}
Date: ${bookingDate} (Your Timezone)
Time: ${bookingTime} (Your Timezone)
User's Timezone: ${userTimezone}
Duration: ${duration} mins
Guests: ${guests || 'None'}
Purpose of the meeting: ${notes || 'None'}

Please review and approve or reject the request here:
${sheetUrl}`;

      GmailApp.sendEmail(ownerEmail, adminSubject, adminBody, {
        name: getConfig().SENDER_NAME
      });
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
        const body = `Hi ${name},\n\nYour request for a meeting on ${bookingDate} at ${bookingTime} has been received and is currently pending approval. We will notify you once it is confirmed.\n\nBest regards,\n${getConfig().SENDER_NAME}`;
        GmailApp.sendEmail(email, subject, body, { name: getConfig().SENDER_NAME });
      } catch (e) {
        Logger.log("Failed to send pending email to user: " + e);
      }
    }
    
    // Add data validation to the status column for the new row
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Pending', 'Approved', 'Rejected', 'Canceled'], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(lastRow, 9).setDataValidation(rule);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Booking request saved.',
      bookingStatus: finalStatus
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
      description: `Purpose of the meeting:\n${notes}\n\nContact Details:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nCancel or Reschedule:\n${cancelLink}`,
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
    
    // Update sheet to reflect success (e.g. background color)
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
    const subject = `Your booking request for ${formattedDate} at ${formattedTime}`;
    let body = '';
    
    if (adminNote && adminNote.toString().trim() !== '') {
      body = `Hi ${name},\n\nRegarding your meeting request on ${formattedDate} at ${formattedTime}:\n\n${adminNote}\n\nBest regards,\n${getConfig().SENDER_NAME}`;
    } else {
      body = `Hi ${name},\n\nUnfortunately, I won't be able to make it for our requested meeting on ${formattedDate} at ${formattedTime}. \n\nPlease let me know if another time works better or feel free to submit another request on the booking page.\n\nBest regards,\n${getConfig().SENDER_NAME}`;
    }
    
    GmailApp.sendEmail(email, subject, body, {
      name: getConfig().SENDER_NAME
    });
    
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
    const subject = `Update: Your meeting on ${formattedDate} has been canceled`;
    let body = '';
    
    if (adminNote && adminNote.toString().trim() !== '') {
      body = `Hi ${name},\n\nThis is to let you know that our scheduled meeting on ${formattedDate} at ${formattedTime} has been canceled.\n\nReason: ${adminNote}\n\nBest regards,\n${getConfig().SENDER_NAME}`;
    } else {
      body = `Hi ${name},\n\nThis is to let you know that our scheduled meeting on ${formattedDate} at ${formattedTime} has been canceled.\n\nPlease feel free to book another time if needed.\n\nBest regards,\n${getConfig().SENDER_NAME}`;
    }
    
    GmailApp.sendEmail(email, subject, body, { name: getConfig().SENDER_NAME });
    sheet.getRange(row, 9).setBackground('#e2e3e5'); // Gray
    
  } catch (err) {
    Logger.log("Error sending cancellation email: " + err);
    sheet.getRange(row, 9).setNote("Error sending email: " + err);
  }
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
      }
      
      // Update sheet status
      sheet.getRange(row, 9).setValue('Canceled');
      sheet.getRange(row, 9).setBackground('#e2e3e5'); // Gray
      
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

  // Overlap check
  const request = {
    timeMin: eventDateObj.toISOString(),
    timeMax: eventEndObj.toISOString(),
    items: getConfig().CHECK_CALENDAR_IDS.map(calId => ({ id: calId }))
  };
  const response = Calendar.Freebusy.query(request);
  for (const calId in response.calendars) {
    const busy = response.calendars[calId].busy;
    if (busy && busy.length > 0) {
      throw new Error("This time slot is no longer available. Please select a different time.");
    }
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const sheetData = sheet.getDataRange().getValues();

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0] === id) {
      const row = i + 1;
      const status = sheetData[i][8];
      const eventId = sheetData[i][11];
      const calId = sheetData[i][12];
      
      // Update spreadsheet row
      sheet.getRange(row, 3).setValue(newName);
      sheet.getRange(row, 4).setValue(newEmail);
      sheet.getRange(row, 5).setValue(newPhone);
      sheet.getRange(row, 6).setValue(bookingDate);
      sheet.getRange(row, 7).setValue(bookingTime);
      sheet.getRange(row, 8).setValue(newNotes);
      sheet.getRange(row, 10).setValue(newDuration);
      
      // Update event natively if Approved
      if (status === 'Approved' && eventId && calId) {
        try {
          const event = CalendarApp.getCalendarById(calId).getEventById(eventId);
          event.setTime(eventDateObj, eventEndObj);
          
          if (newName) event.setTitle(`${newName} <> Arun Teja Godavarthi`);
          
          const cancelLink = getConfig().FRONTEND_URL + "?action=manage&id=" + id;
          event.setDescription(`Purpose of the meeting:\n${newNotes}\n\nContact Details:\nName: ${newName}\nEmail: ${newEmail}\nPhone: ${newPhone}\n\nCancel or Reschedule:\n${cancelLink}`);
          
        } catch (e) {
          Logger.log("Error rescheduling event: " + e);
        }
      }
      
      // Send email
      try {
        const emailTarget = newEmail || sheetData[i][3];
        const nameTarget = newName || sheetData[i][2];
        const subject = `Update: Your meeting has been rescheduled to ${bookingDate}`;
        const body = `Hi ${nameTarget},\n\nYour meeting has been successfully rescheduled to ${bookingDate} at ${bookingTime}.\n\nBest regards,\n${getConfig().SENDER_NAME}`;
        GmailApp.sendEmail(emailTarget, subject, body, { name: getConfig().SENDER_NAME });
      } catch (e) {
        Logger.log("Email fail on reschedule: " + e);
      }

      return ContentService.createTextOutput(JSON.stringify({status: 'success', message: 'Booking rescheduled successfully.'})).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  throw new Error("Booking ID not found.");
}

function getMonthAvailability(year, month, duration) {
  // month is 1-indexed
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
        
        const dtStr = dStr + ' ' + tStr;
        const startDt = new Date(dtStr);
        if (!isNaN(startDt.getTime())) {
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
  
  return availabilityMap;
}
