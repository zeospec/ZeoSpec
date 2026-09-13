/**
 * Google Apps Script - Universal Newsletter REST API Endpoint
 * 
 * Provides a lightweight, serverless REST API backed by Google Sheets.
 * Designed to be reusable across multiple personal websites.
 * 
 * Supported Fields:
 * - email (Required)
 * - firstName (Optional)
 * - lastName (Optional)
 * - reference (Optional - identifies the source website, e.g. "rtr.zeospec.com")
 */

const SHEET_NAME = 'Subscribers';
const HEADERS = ['Timestamp (IST)', 'Email', 'First Name', 'Last Name', 'Reference'];
const TIMEZONE = 'Asia/Kolkata';
const TIMESTAMP_FORMAT = "yyyy-MM-dd HH:mm:ss 'IST'";

/**
 * Handles incoming POST requests
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Wait up to 10 seconds for other concurrent executions to finish
  const lockAcquired = lock.tryLock(10000);
  
  if (!lockAcquired) {
    return responseJSON({
      status: 'error',
      code: 503,
      message: 'Server is currently busy. Please try again in a few seconds.'
    });
  }

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = doc.insertSheet(SHEET_NAME);
    }

    // Parse payload: supports raw JSON, text/plain JSON, and standard URL-encoded/FormData
    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseError) {
        // Fallback to URL-encoded parameters if JSON parsing fails
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    // Extract & normalize fields
    const rawEmail = (data.email || '').toString().trim();
    const email = rawEmail.toLowerCase();
    const firstName = (data.firstName || data.first_name || '').toString().trim();
    const lastName = (data.lastName || data.last_name || '').toString().trim();
    const reference = (data.reference || data.source || 'Unknown').toString().trim();

    // 1. Mandatory Validation: Email must not be empty
    if (!email) {
      return responseJSON({
        status: 'error',
        code: 400,
        message: 'Email address is required.'
      });
    }

    // 2. Format Validation: Basic email regex check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return responseJSON({
        status: 'error',
        code: 422,
        message: 'Please provide a valid email address.'
      });
    }

    // 3. Ensure Header Row exists
    ensureHeaders(sheet);

    // 4. Generate unified IST Timestamp (Asia/Kolkata, UTC+5:30)
    const timestampIST = Utilities.formatDate(new Date(), TIMEZONE, TIMESTAMP_FORMAT);

    // 5. Append row to sheet
    sheet.appendRow([
      timestampIST,
      email,
      firstName,
      lastName,
      reference
    ]);

    // 6. Return explicit success response with IST timestamp
    return responseJSON({
      status: 'success',
      code: 200,
      message: 'Thank you for subscribing! Your submission has been received.',
      timestamp: timestampIST
    });

  } catch (error) {
    return responseJSON({
      status: 'error',
      code: 500,
      message: 'An unexpected error occurred while processing your submission: ' + error.message
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles GET requests (Health check / ping)
 */
function doGet(e) {
  return responseJSON({
    status: 'ok',
    code: 200,
    message: 'Newsletter REST API is active and healthy.'
  });
}

/**
 * Checks if the target sheet has headers; if not, appends and formats them.
 */
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#F3F4F6');
    sheet.setFrozenRows(1);
  }
}

/**
 * Formats a JavaScript object into a JSON TextOutput
 */
function responseJSON(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
