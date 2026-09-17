/**
 * Executive Brief Compiler — backend
 *
 * Deploy this as a Web App (Deploy > New deployment > Web app,
 * Execute as: Me, Who has access: Anyone). The URL you get ending
 * in /exec is the "webhook" — paste it into the app's Setup panel.
 *
 * One-time setup needed before this works:
 *   1. Get a free Gemini API key at https://aistudio.google.com/apikey
 *      (no credit card required for the free tier).
 *   2. In this Apps Script project: Project Settings (gear icon) >
 *      Script Properties > Add script property.
 *      Name:  GEMINI_API_KEY
 *      Value: <paste your key>
 *
 * Whenever you edit this file, remember: saving is NOT enough.
 * Go to Deploy > Manage deployments > pencil icon > Version: "New version"
 * > Deploy, or your changes won't actually take effect.
 */

var GEMINI_MODEL = 'gemini-2.5-flash';
var SHEET_NAME = 'Briefs';

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var result;
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      body = e.parameter;
    }
    var action = body.action;
    switch (action) {
      case 'ping':
        result = { ok: true };
        break;
      case 'compile':
        result = { brief: compileBrief(body.reports) };
        break;
      case 'compress':
        result = { brief: compressBrief(body.previousBrief) };
        break;
      case 'listBriefs':
        result = listBriefs();
        break;
      case 'saveBrief':
        result = saveBrief(body.brief, body.id, body.sourceNames, body.sourceFiles);
        break;
      case 'deleteBrief':
        result = deleteBrief(body.id);
        break;
      case 'getArchiveInfo':
        result = getArchiveInfo();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err && err.message ? err.message : String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Gemini ----------------

function callGemini(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('This project is missing a GEMINI_API_KEY script property. See the setup notes at the top of Code.gs.');
  }
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code < 200 || code >= 300) {
    var msg = (data.error && data.error.message) || ('Gemini API error (' + code + ')');
    throw new Error(msg);
  }
  var text = '';
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    text = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
  }
  var cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Couldn't parse the compiled brief. Try again.");
  }
}

function compileBrief(reports) {
  if (!reports || !reports.length) throw new Error('No reports provided.');
  var todayLabel = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'MMMM d, yyyy');
  var reportsBlock = reports.map(function (r) {
    return '--- REPORT SOURCE: ' + r.name + ' ---\n' + r.text;
  }).join('\n\n');

  var prompt =
    'You are compiling a concise executive brief for a CEO from ' + reports.length +
    ' individual status reports submitted by team members or departments. The CEO will forward ' +
    'this brief on to investors or a reporting team, so it must be accurate, tightly written, and free of filler.\n\n' +
    'HARD CONSTRAINT: the finished brief must fit within 2 printed A4 pages total, all sections combined. ' +
    'This is a leadership skim document, not a full readout — prioritize ruthlessly and cut anything non-essential. Concretely:\n' +
    '- executiveSummary: 2 to 4 sentences maximum, covering the whole picture.\n' +
    '- highlights: at most 4 short items (under 10 words each).\n' +
    '- Per report in "sections": summary is ONE short sentence (under 25 words) — do not write a paragraph. ' +
    'At most 2 metrics, at most 2 risks, at most 2 actions per report. Omit the risks/actions/metrics array entirely ' +
    'for a report if it has nothing material to add — never pad.\n' +
    '- If a report is routine with no notable news, fold a one-line mention into executiveSummary instead of giving it its own section.\n' +
    '- overallRisks: at most 4 items. overallActions: at most 4 items.\n' +
    '- Every string should be as short as it can be while staying accurate. Do not invent facts or numbers not present in the reports.\n\n' +
    'Today is ' + todayLabel + '.\n\n' + reportsBlock + '\n\n' +
    'Return ONLY a JSON object with exactly this shape (omit an array entirely if it would be empty):\n' +
    '{\n' +
    '  "title": string,\n' +
    '  "period": string — inferred from the reports, otherwise "Week of ' + todayLabel + '",\n' +
    '  "executiveSummary": string,\n' +
    '  "highlights": array of short strings,\n' +
    '  "sections": array, one per source report: { "reportName": string, "summary": string, ' +
    '"metrics": array of {"label": string, "value": string}, "risks": array of short strings, "actions": array of short strings },\n' +
    '  "overallRisks": array of short strings,\n' +
    '  "overallActions": array of short strings\n' +
    '}';

  return callGemini(prompt);
}

function compressBrief(previousBrief) {
  if (!previousBrief) throw new Error('Missing previousBrief.');
  var prompt =
    'Here is a drafted executive brief as JSON:\n\n' + JSON.stringify(previousBrief) + '\n\n' +
    'It currently runs longer than 2 printed A4 pages. Compress it to comfortably fit within 2 pages total: ' +
    'shorten every sentence, drop secondary detail, merge or cut the least important report sections, and reduce ' +
    'every list (highlights, metrics, risks, actions) to at most 3 items. Keep only the most material, ' +
    'decision-relevant facts — do not invent anything new. Return ONLY the JSON object, in the exact same shape as given.';
  return callGemini(prompt);
}

// ---------------- Sheet-backed history ----------------

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'title', 'period', 'createdAt', 'sourceNames', 'briefJson', 'driveFolderUrl', 'sourceFileLinks']);
  }
  return sheet;
}

function listBriefs() {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var rows = values.slice(1);
  var items = rows
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: r[0],
        title: r[1],
        period: r[2],
        createdAt: Number(r[3]) || 0,
        sourceNames: r[4] ? JSON.parse(r[4]) : [],
        brief: r[5] ? JSON.parse(r[5]) : null,
        driveFolderUrl: r[6] || '',
        sourceFileLinks: r[7] ? JSON.parse(r[7]) : [],
      };
    });
  items.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return { items: items.slice(0, 40) };
}

function saveBrief(brief, id, sourceNames, sourceFiles) {
  if (!brief) throw new Error('Missing brief.');
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var newId = id || ('brief-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  var createdAt = Date.now();
  var existingDriveFolderUrl = '';
  var existingFileLinks = [];
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === newId) {
      rowIndex = i + 1;
      createdAt = Number(values[i][3]) || createdAt;
      existingDriveFolderUrl = values[i][6] || '';
      existingFileLinks = values[i][7] ? JSON.parse(values[i][7]) : [];
      break;
    }
  }

  var driveResult = { folderUrl: existingDriveFolderUrl, fileLinks: existingFileLinks };
  if (sourceFiles && sourceFiles.length) {
    driveResult = saveSourceFilesToDrive(brief.period, brief.title, sourceFiles);
  }

  var rowData = [
    newId,
    brief.title || 'Executive Brief',
    brief.period || '',
    createdAt,
    JSON.stringify(sourceNames || []),
    JSON.stringify(brief),
    driveResult.folderUrl || '',
    JSON.stringify(driveResult.fileLinks || []),
  ];
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { id: newId, driveFolderUrl: driveResult.folderUrl || '' };
}

// ---------------- Drive archive ----------------
// Stores the original uploaded report files (and keeps them organized by
// week) so there's a permanent, browsable record — separate from the app
// itself. Uses the same Google account already authorized for this script;
// nothing extra to set up.

var ARCHIVE_ROOT_FOLDER_NAME = 'Executive Brief Compiler';

function getOrCreateRootFolder() {
  var folders = DriveApp.getFoldersByName(ARCHIVE_ROOT_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(ARCHIVE_ROOT_FOLDER_NAME);
}

function getOrCreateSubfolder(parent, name) {
  var safeName = (name || 'Untitled').toString().slice(0, 120);
  var it = parent.getFoldersByName(safeName);
  return it.hasNext() ? it.next() : parent.createFolder(safeName);
}

function saveSourceFilesToDrive(periodLabel, titleLabel, sourceFiles) {
  var root = getOrCreateRootFolder();
  var folderName = periodLabel || titleLabel || ('Brief ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd'));
  var sub = getOrCreateSubfolder(root, folderName);
  var fileLinks = [];
  sourceFiles.forEach(function (f) {
    try {
      var bytes = Utilities.base64Decode(f.base64);
      var blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name || 'report');
      var driveFile = sub.createFile(blob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileLinks.push({ name: f.name, url: driveFile.getUrl() });
    } catch (err) {
      fileLinks.push({ name: f.name, url: '', error: err.message });
    }
  });
  try { sub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { folderUrl: sub.getUrl(), fileLinks: fileLinks };
}

function getArchiveInfo() {
  var root = getOrCreateRootFolder();
  try { root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { folderUrl: root.getUrl() };
}

function deleteBrief(id) {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { ok: true };
}
