# Connect Google Drive for quotation PDFs

The existing folder is shared correctly. It belongs to My Drive, where new PDFs need to be owned by a Google user. The Sheets integration continues to use the existing service account. No Sheet IDs need to change.

## One-time setup on this computer

1. Open Google Cloud Console for the existing `all-gmail-api` project: https://console.cloud.google.com/auth/clients?project=all-gmail-api
2. Complete Google Auth Platform branding/audience setup if prompted. For an external app in Testing, add the Google account that will own the PDFs to the test-user list. Ensure Google Drive API is enabled.
3. Create an OAuth client with application type **Desktop app**. Download its JSON. The service-account JSON already in the project is a different credential and cannot be used for this sign-in.
4. Save the downloaded file as `C:/Users/user/Desktop/CRRNBD/credentials/drive-oauth-client.json`.
5. Open the CRM quotation page and click **Refresh connection**, then **Connect Google Drive**. Allow the popup. Sign in with the Google account that owns or can add files to `QUTAITION/DISPATCHORDER`, and grant the approved Drive access.
6. Close the success window and return to the quotation. When it says Google Drive connected, use **Save & download PDF**. The app uploads into the existing folder and updates Rate (X) and Quote Link (Z) only for the matched enquiry/material rows.

If using an existing **Web application** OAuth client instead, add this exact authorized redirect URI to that client, then download the updated JSON:

`http://127.0.0.1:4000/api/drive/oauth/callback`

Use the backend's configured port if it differs from 4000. This is a local development connection flow; deployment authentication is still required before exposing the app outside this computer.

## Configuration and credentials

The project `.env` already contains:

```env
GOOGLE_DRIVE_OAUTH_CLIENT_FILE=credentials/drive-oauth-client.json
GOOGLE_DRIVE_USER_CREDENTIALS=credentials/drive-user.json
```

Paths resolve from the project folder. Sign-in creates the second file automatically; do not paste a token into the browser or chat. Both files are under the existing gitignored `credentials/` directory. Access/refresh tokens are never returned by the connection endpoints or included in callback request logs. Keep credentials private on the local machine. The approved `https://www.googleapis.com/auth/drive` scope can access all Drive files available to the signed-in user; the PDF workflow targets the configured quotation/dispatch folders.

PKCE, random single-use state and a ten-minute expiry protect the callback. A cancelled or failed sign-in preserves the previous credentials. Refresh tokens let the backend reconnect without asking on each PDF; Google may expire or revoke them, especially for apps in Testing, in which case reconnect from the quotation page.

No live PDF is uploaded merely by signing in. Saving a quotation remains a separate action. A Drive failure leaves the Sheet rate/link cells untouched. Google Drive upload and Sheet writeback are separate operations, so a writeback error after a successful upload reports the saved file URL for review.

Google references: https://developers.google.com/workspace/guides/create-credentials#desktop-app and https://developers.google.com/identity/protocols/oauth2/native-app and https://developers.google.com/workspace/drive/api/guides/about-shareddrives
