const CONFIG = {
  spreadsheetId: '', // Leave blank to use attached sheet
  sheetName: 'Transactions',
  remindersSheetName: 'Reminders'
};

function json_(obj, callback) {
  const body = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(`${callback}(${body});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function doGet(e) {
  try {
    const p = e.parameter || {};
    const action = p.action;

    if (action === 'getDashboard') {
      const ss = CONFIG.spreadsheetId ? SpreadsheetApp.openById(CONFIG.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
      
      const sh = ss.getSheetByName(CONFIG.sheetName);
      const txs = [];
      if (sh) {
        const data = sh.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          const r = data[i];
          if (!r[0]) continue;
          let dVal = r[4];
          if (dVal instanceof Date) dVal = Utilities.formatDate(dVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          txs.push({ id: String(r[0]), type: r[1], category: r[2], desc: r[3], date: dVal, amount: Number(r[10]), method: r[14], notes: r[15], user: r[8] || r[16] });
        }
      }

      const remSh = getOrCreateSheet(ss, CONFIG.remindersSheetName, ['ID', 'Date', 'Title', 'Type', 'Amount', 'Status']);
      const rems = [];
      const remData = remSh.getDataRange().getValues();
      for (let i = 1; i < remData.length; i++) {
        const r = remData[i];
        if (!r[0]) continue;
        let dVal = r[1];
        if (dVal instanceof Date) dVal = Utilities.formatDate(dVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        rems.push({ id: String(r[0]), date: dVal, title: r[2], type: r[3], amount: Number(r[4]), status: r[5] });
      }

      return json_({ ok: true, transactions: txs, reminders: rems }, p.callback);
    }
    return json_({ ok: true, message: "Enterprise Sync Engine Active" }, p.callback);
  } catch (err) {
    return json_({ ok: false, error: String(err.message) }, e.parameter?.callback);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock(); 
  lock.waitLock(15000); 
  
  try {
    const p = JSON.parse(e.postData.contents || "{}");
    const action = p.action;
    const data = p.data;
    
    const ss = CONFIG.spreadsheetId ? SpreadsheetApp.openById(CONFIG.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date().toISOString();

    if (action === "addTransaction" || action === "editTransaction" || action === "deleteTransaction") {
      const sh = ss.getSheetByName(CONFIG.sheetName);
      if (action === "addTransaction") {
        sh.appendRow([ data.id, data.type, data.category, data.desc, data.date, '', '', '', data.user, 'Personal', data.amount, '', '', '', data.method || 'UPI', data.notes || '', data.user, now, now ]);
      } else if (action === "editTransaction") {
        const rows = sh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(data.id)) {
            sh.getRange(i + 1, 2, 1, 4).setValues([[data.type, data.category, data.desc, data.date]]);
            sh.getRange(i + 1, 9, 1, 3).setValues([[data.user, 'Personal', data.amount]]);
            sh.getRange(i + 1, 15, 1, 2).setValues([[data.method, data.notes]]);
            sh.getRange(i + 1, 19).setValue(now);
            break;
          }
        }
      } else if (action === "deleteTransaction") {
        const rows = sh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(data.id)) { sh.deleteRow(i + 1); break; }
        }
      }
    }
    
    if (action === "addReminder" || action === "editReminder" || action === "deleteReminder") {
      const remSh = getOrCreateSheet(ss, CONFIG.remindersSheetName, ['ID', 'Date', 'Title', 'Type', 'Amount', 'Status']);
      if (action === "addReminder") {
        remSh.appendRow([ data.id, data.date, data.title, data.type, data.amount || 0, data.status ]);
      } else if (action === "editReminder") {
        const rows = remSh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(data.id)) {
            remSh.getRange(i + 1, 2, 1, 5).setValues([[data.date, data.title, data.type, data.amount || 0, data.status]]);
            break;
          }
        }
      } else if (action === "deleteReminder") {
        const rows = remSh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(data.id)) { remSh.deleteRow(i + 1); break; }
        }
      }
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err.message) });
  } finally {
    lock.releaseLock();
  }
}
