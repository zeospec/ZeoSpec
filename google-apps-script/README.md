# Google Apps Script: Universal Newsletter REST API

This folder contains the Google Apps Script (`Code.gs`) that acts as a serverless REST API backend backed by Google Sheets. It collects newsletter subscriptions from any of your personal websites into a single unified sheet.

---

## Features

- **Single endpoint, multiple sites:** The `reference` field identifies which site submitted the entry; one deployment serves all your websites.
- **Flexible field names:** Accepts both camelCase (`firstName`) and snake_case (`first_name`) variants.
- **Unified IST Timestamps:** Every entry is stamped in Indian Standard Time (`Asia/Kolkata`, UTC+5:30) as `YYYY-MM-DD HH:mm:ss IST`.
- **Structured JSON responses:** Every response (success or error) is a consistent JSON object, easy to handle on any frontend.
- **Auto-initialisation:** Creates the `Subscribers` sheet with bold, frozen headers on first run if it doesn't exist.
- **LockService protection:** Prevents duplicate row writes under concurrent submissions.

---

## API Contract

### Endpoint

```
POST https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
GET  https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

> **Important (Content-Type):** Google Apps Script's CORS handling requires the body to be sent as `text/plain;charset=utf-8` (not `application/json`) to avoid a preflight OPTIONS request that Apps Script does not support. The body itself is a JSON string.

```http
Content-Type: text/plain;charset=utf-8
Body: {"email":"...","firstName":"...","lastName":"...","reference":"..."}
```

---

### Request Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | **Required** | Normalised to lowercase before storage. |
| `firstName` | string | Optional* | Also accepted as `first_name`. |
| `lastName` | string | Optional* | Also accepted as `last_name`. |
| `reference` | string | Optional | Identifies the source site (e.g. `rtr.zeospec.com`). Defaults to `Unknown` if omitted. Also accepted as `source`. |

> \* `firstName` and `lastName` are optional at the **API level**. Individual frontends may enforce them as required fields in their own validation before calling this API.

---

### Response Schema

Every response is a JSON object with at minimum `status` and `code`:

```ts
{
  status:    "success" | "error" | "ok",
  code:      number,       // mirrors an HTTP status code semantically
  message:   string,       // human-readable description
  timestamp?: string       // present only on success: "YYYY-MM-DD HH:mm:ss IST"
}
```

### Response Codes

| Scenario | `status` | `code` | `message` |
|---|---|---|---|
| Successful subscription | `"success"` | `200` | `"Thank you for subscribing! Your submission has been received."` |
| GET health check | `"ok"` | `200` | `"Newsletter REST API is active and healthy."` |
| Missing email | `"error"` | `400` | `"Email address is required."` |
| Invalid email format | `"error"` | `422` | `"Please provide a valid email address."` |
| Concurrent lock timeout | `"error"` | `503` | `"Server is currently busy. Please try again in a few seconds."` |
| Unhandled script exception | `"error"` | `500` | `"An unexpected error occurred while processing your submission: <detail>"` |

---

### Google Sheet Structure

Sheet tab name: **`Subscribers`**

| Column | Header | Notes |
|---|---|---|
| A | `Timestamp (IST)` | Auto-generated. Format: `YYYY-MM-DD HH:mm:ss IST` |
| B | `Email` | Stored lowercase |
| C | `First Name` | As submitted |
| D | `Last Name` | As submitted |
| E | `Reference` | Source site identifier |

Headers are auto-created, bold, with a light grey background, and the first row is frozen on first run.

---

## Deployment Instructions

### 1. Create a Google Sheet
1. Open [sheets.new](https://sheets.new) in your browser.
2. Name your spreadsheet (e.g. `ZeoSpec Newsletter Subscriptions`).

### 2. Add the Script
1. In your Google Sheet, click **Extensions → Apps Script**.
2. Replace all existing code with the contents of [`Code.gs`](./Code.gs).
3. Name the project (e.g. `Newsletter API`).
4. Click the 💾 **Save project** icon.

### 3. Deploy as a Web App
1. Click **Deploy → New deployment**.
2. Under the ⚙️ gear icon, select **Web app**.
3. Configure:
   - **Description:** `Newsletter REST API v1`
   - **Execute as:** `Me (<your-email>@gmail.com)`: allows anonymous visitors to write to your sheet
   - **Who has access:** `Anyone`: allows cross-origin submissions without Google login
4. Click **Deploy**.
5. If prompted, click **Authorize access**, select your account, then **Advanced → Go to Newsletter API (unsafe) → Allow**.
6. Copy the **Web App URL**:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

> **Re-deploying after code changes:** Any time you edit `Code.gs`, you must create a **New deployment** (not edit the existing one) for the changes to take effect on the live endpoint.

### 4. Connect to Your Jekyll Site
Paste the Web App URL into your site's `_config.yml`:

```yaml
newsletter_api_url: "https://script.google.com/macros/s/AKfycbx.../exec"
newsletter_reference: "rtr.zeospec.com"   # change per site
```

---

## Testing the API

### Health Check (GET)

```bash
curl -L "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected response:

```json
{"status":"ok","code":200,"message":"Newsletter REST API is active and healthy."}
```

### Submission (POST)

```bash
curl -L \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"email":"test@example.com","firstName":"John","lastName":"Doe","reference":"test-cli"}' \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected response:

```json
{
  "status": "success",
  "code": 200,
  "message": "Thank you for subscribing! Your submission has been received.",
  "timestamp": "2026-09-11 07:05:00 IST"
}
```

After submitting, open your Google Sheet; a new row should appear under the `Subscribers` tab.

---

## Integrating on Another Website

Because the API accepts a `reference` field, the **same Web App URL works across all your sites**. Each site just identifies itself with its own `reference` value.

### Vanilla JavaScript (fetch)

```javascript
fetch("https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec", {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({
    email: "reader@example.com",
    firstName: "Alice",
    lastName: "Smith",
    reference: "zeospec.com"   // <-- change this per site
  })
})
.then(res => res.json())
.then(data => {
  if (data.status === "success") {
    // show success UI
  } else {
    // show data.message as an error
  }
});
```

### Frontend Validation Contract

Before calling the API, your frontend should validate:

1. `email`: must not be empty and must match a basic email pattern
2. `firstName`: recommended to enforce as required for clean data
3. `lastName`: recommended to enforce as required for clean data
4. **Anti-spam:** Add a hidden honeypot field (invisible to users) and check it is empty before submitting. If filled, silently fake a success response without calling the API.

### Content-Type Note

Always send `Content-Type: text/plain;charset=utf-8`. Sending `application/json` triggers a CORS preflight (`OPTIONS`) request that Google Apps Script Web Apps do not handle, causing the submission to fail silently.
