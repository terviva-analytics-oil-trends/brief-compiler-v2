# Executive Brief Compiler — Setup

Same pattern as the Pongamia Traceability app: a static page on GitHub Pages,
talking to a Google Apps Script "webhook" that reads/writes a Google Sheet.
Nothing here needs a credit card, and nothing expires.

- **GitHub Pages** hosts the page itself (what you see and click on).
- **Apps Script + a Google Sheet** hold the shared history (saved briefs)
  and do the AI compiling, using Google's free Gemini API.
- **Google Drive** archives the original uploaded report files, organized
  into one folder per week — a permanent record separate from the app
  itself, browsable like any other Drive folder.
- The three are connected by one webhook URL, saved once per device
  inside the app itself (click the "Not connected" pill, top right).

None of this requires your CEO to touch GitHub, Apps Script, or Drive
settings at all — from his side, it's just a web page. The Drive links
inside the app are a convenience if he ever wants to browse the raw files;
he never has to set anything up.

If you ever need to shut this down: delete the GitHub repo, delete the
Google Sheet, and delete the Apps Script project. No subscriptions, no
billing anywhere to cancel.

---

## Part 1 — The backend (Google Sheet + Apps Script)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank sheet. Name it something like **Brief Compiler Data**.
2. In the sheet, go to **Extensions > Apps Script**. This opens the script editor in a new tab, already linked to this sheet.
3. Delete whatever's in the default `Code.gs` file, and paste in the entire contents of the `Code.gs` file from this folder.
4. Save it (the disk icon, or Cmd+S).

### Get a free Gemini API key

5. In a new tab, go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with any Google account.
6. Click **Create API key**. No credit card is asked for — this is the genuinely free tier.
7. Copy the key.

### Add the key to your script

8. Back in the Apps Script editor, click the gear icon (**Project Settings**) on the left.
9. Scroll to **Script Properties**, click **Add script property**.
10. Property = `GEMINI_API_KEY`, Value = the key you just copied. Click **Save script properties**.

### Deploy it as a web app

11. Click **Deploy > New deployment** (top right).
12. Click the gear next to "Select type" and choose **Web app**.
13. Set **Execute as: Me**, and **Who has access: Anyone**.
14. Click **Deploy**. The first time, Google will ask you to authorize the script — click through the "unverified app" warning (it's unverified because it's your own private script, not because anything's wrong) and allow access. It will ask for both **Google Sheets** and **Google Drive** permissions — approve both; Drive is what lets it create the weekly archive folders.
15. You'll get a URL ending in `/exec`. **Copy this URL** — this is your webhook.

Keep this tab open or bookmark it — you'll come back to it if you ever edit `Code.gs`.

> **Important habit to remember:** if you ever change the code in `Code.gs` later, saving it is *not* enough. You have to go to **Deploy > Manage deployments**, click the pencil icon on the existing deployment, set **Version: New version**, and click **Deploy** again — otherwise your changes won't actually take effect on the live URL.

---

## Part 2 — The frontend (GitHub Pages)

You likely already have a GitHub repo called `brief-compiler` from an earlier
attempt. We'll reuse it — just replace what's inside.

1. Go to your repo on github.com.
2. Delete these, if present (click each file, then the trash icon): `api` folder, `firebase-config.js`, `firestore.rules`, `package.json`. They belonged to the old setup and aren't needed anymore.
3. Delete the existing `index.html` too, or just overwrite it in the next step.
4. Click **Add file > Upload files**, and drag in the `index.html` from this folder.
5. Commit the change.

### Turn on GitHub Pages

6. In the repo, go to **Settings > Pages** (left sidebar).
7. Under **Build and deployment > Source**, choose **Deploy from a branch**.
8. Branch: `main`, folder: `/ (root)`. Click **Save**.
9. Wait about a minute, then refresh the page — GitHub will show you the live URL, something like:
   `https://terviva-analytics-oil-trends.github.io/brief-compiler/`

**This is the link you give your CEO.**

---

## Part 3 — Connect the two

1. Open your new GitHub Pages link.
2. Click the **"Not connected"** pill in the top right corner.
3. Paste in the `/exec` webhook URL from Part 1, step 15.
4. Click **Save & test**. It should say "Connected."

That's it — try uploading a couple of reports and compiling a brief.

---

## Where the weekly files go

Every time someone clicks **Save to history**, the original uploaded
files (not just the compiled brief) get copied into Google Drive,
into a folder called **Executive Brief Compiler**, with one subfolder
per reporting period — so it fills up week by week, exactly like a
shared drive of past submissions. A **"Drive archive ↗"** link appears
in the app once connected, and each saved brief in the history list
also links straight to that week's folder.

This uses whichever Google account you used to create the Apps Script
project — so for a permanent company archive, create it under a shared
company Google account rather than a personal one, same advice as the
Sheet and the GitHub repo.

---

## Notes

- **Cost:** genuinely $0. Gemini's free tier (used here) allows roughly 250
  requests a day on the flash model — miles more than a weekly brief needs.
- **Who should own this:** ideally a shared company Google account and a
  company GitHub org, same as your Pongamia app — so it keeps working no
  matter who at the company holds it.
- **Updating the page later:** same as Pongamia — replace `index.html` in
  the repo, commit, wait ~30–90 seconds, hard refresh (Cmd+Shift+R).
- **Updating the backend later:** edit `Code.gs` in the Apps Script editor,
  save, then **always** redeploy (Deploy > Manage deployments > pencil >
  New version > Deploy) — same gotcha as your other app.
- **Deleting it entirely:** delete the GitHub repo, delete the Google Sheet
  (this also removes the attached Apps Script project). Nothing else to
  cancel anywhere.
