const CACHE_TTL_SECONDS = 60;

const SHEET_SCHEMAS = {
  AppConfig: ["Key", "Value", "UpdatedAt"],
  Menus: ["ID", "Title", "Description", "Icon", "Route", "IsActive", "SortOrder", "CreatedAt", "UpdatedAt"],
  AuditLogs: ["ID", "Email", "OdooUserID", "PartnerID", "PartnerName", "Action", "Status", "Message", "CreatedAt", "UserAgent"]
};

const DEFAULT_MENUS = [
  {
    Title: "Discharging List",
    Description: "Upload dan validasi daftar container hasil discharging.",
    Icon: "ship",
    Route: "discharging-list",
    IsActive: "TRUE",
    SortOrder: "1"
  },
  {
    Title: "Stuffing Order",
    Description: "Buat order stuffing CFS dan kirim ke Odoo ERP.",
    Icon: "log-in",
    Route: "stuffing-order",
    IsActive: "TRUE",
    SortOrder: "2"
  },
  {
    Title: "Stripping Order",
    Description: "Buat dan kelola order stripping CFS.",
    Icon: "log-out",
    Route: "stripping-order",
    IsActive: "TRUE",
    SortOrder: "3"
  },
  {
    Title: "Booking Gate-In",
    Description: "Buat dan kelola booking container masuk depot.",
    Icon: "log-in",
    Route: "booking-gate-in",
    IsActive: "TRUE",
    SortOrder: "4"
  },
  {
    Title: "Booking Gate-Out",
    Description: "Buat dan kelola booking container keluar depot.",
    Icon: "log-out",
    Route: "booking-gate-out",
    IsActive: "TRUE",
    SortOrder: "5"
  },
  {
    Title: "Ambil Faktur Pajak",
    Description: "Akses dan ambil dokumen faktur pajak.",
    Icon: "receipt-text",
    Route: "ambil-faktur-pajak",
    IsActive: "TRUE",
    SortOrder: "6"
  }
];

function ensureDatabase_() {
  Object.keys(SHEET_SCHEMAS).forEach(function(sheetName) {
    ensureSheet_(sheetName, SHEET_SCHEMAS[sheetName]);
  });

  seedAppConfig_();
  seedMenus_();
}

function ensureSheet_(sheetName, headers) {
  let sheet = DB.getSheetByName(sheetName);

  if (!sheet) {
    sheet = DB.insertSheet(sheetName);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 1 || lastColumn < 1) {
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setBackground("#0f766e")
      .setFontColor("#ffffff");

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const headerRange = sheet.getRange(1, 1, 1, Math.max(lastColumn, headers.length));
  const currentHeaders = headerRange.getDisplayValues()[0];

  let changed = false;

  headers.forEach(function(header, index) {
    if (String(currentHeaders[index] || "").trim() !== header) {
      currentHeaders[index] = header;
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setBackground("#0f766e")
      .setFontColor("#ffffff");

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
}

function seedAppConfig_() {
  const records = readRecords_("AppConfig", false);

  if (records.length > 0) {
    return;
  }

  createRecord_("AppConfig", {
    Key: "APP_NAME",
    Value: APP_NAME
  });

  createRecord_("AppConfig", {
    Key: "APP_THEME",
    Value: APP_THEME
  });

  createRecord_("AppConfig", {
    Key: "LOGO_URL",
    Value: APP_LOGO_URL
  });
}

function seedMenus_() {
  const records = readRecords_("Menus", false);

  if (records.length > 0) {
    return;
  }

  DEFAULT_MENUS.forEach(function(menu) {
    createRecord_("Menus", menu);
  });
}

function getActiveMenus_() {
  const records = readRecords_("Menus", true);

  return records
    .filter(function(menu) {
      return String(menu.IsActive || "").toUpperCase() === "TRUE";
    })
    .sort(function(a, b) {
      return Number(a.SortOrder || 999) - Number(b.SortOrder || 999);
    });
}

function readRecords_(sheetName, useCache) {
  validateSheetName_(sheetName);

  const cacheKey = getCacheKey_(sheetName);

  if (useCache) {
    const cached = CacheService.getScriptCache().get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }
  }

  const sheet = DB.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  const records = values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell || "").trim() !== "";
      });
    })
    .map(function(row) {
      return rowToObject_(headers, row);
    });

  if (useCache) {
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(records), CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn("Cache gagal disimpan: " + error.message);
    }
  }

  return records;
}

function createRecord_(sheetName, payload) {
  validateSheetName_(sheetName);

  const sheet = DB.getSheetByName(sheetName);
  const headers = getHeaders_(sheet);
  const timestamp = nowIso_();

  const row = headers.map(function(header) {
    if (header === "ID") {
      return payload.ID || Utilities.getUuid();
    }

    if (header === "CreatedAt") {
      return payload.CreatedAt || timestamp;
    }

    if (header === "UpdatedAt") {
      return timestamp;
    }

    return payload[header] !== undefined && payload[header] !== null
      ? String(payload[header])
      : "";
  });

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  clearSheetCache_(sheetName);

  return rowToObject_(headers, row);
}

function updateRecord_(sheetName, id, payload) {
  validateSheetName_(sheetName);

  const sheet = DB.getSheetByName(sheetName);
  const data = sheet.getDataRange().getDisplayValues();

  if (data.length < 2) {
    throw new Error("Data kosong.");
  }

  const headers = data[0].map(function(header) {
    return String(header || "").trim();
  });

  const keyField = getPrimaryKeyField_(headers);
  const keyIndex = headers.indexOf(keyField);
  const timestamp = nowIso_();

  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    if (String(data[rowIndex][keyIndex]) === String(id)) {
      const updatedRow = headers.map(function(header, colIndex) {
        if (header === keyField) {
          return data[rowIndex][colIndex];
        }

        if (header === "CreatedAt") {
          return data[rowIndex][colIndex];
        }

        if (header === "UpdatedAt") {
          return timestamp;
        }

        if (payload[header] !== undefined && payload[header] !== null) {
          return String(payload[header]);
        }

        return data[rowIndex][colIndex];
      });

      sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([updatedRow]);
      SpreadsheetApp.flush();

      clearSheetCache_(sheetName);

      return rowToObject_(headers, updatedRow);
    }
  }

  throw new Error("Data dengan ID/Key tersebut tidak ditemukan.");
}

function deleteRecord_(sheetName, id) {
  validateSheetName_(sheetName);

  const sheet = DB.getSheetByName(sheetName);
  const data = sheet.getDataRange().getDisplayValues();

  if (data.length < 2) {
    throw new Error("Data kosong.");
  }

  const headers = data[0].map(function(header) {
    return String(header || "").trim();
  });

  const keyField = getPrimaryKeyField_(headers);
  const keyIndex = headers.indexOf(keyField);

  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    if (String(data[rowIndex][keyIndex]) === String(id)) {
      const deletedRecord = rowToObject_(headers, data[rowIndex]);

      sheet.deleteRow(rowIndex + 1);
      SpreadsheetApp.flush();

      clearSheetCache_(sheetName);

      return deletedRecord;
    }
  }

  throw new Error("Data dengan ID/Key tersebut tidak ditemukan.");
}

function appendAuditLog_(payload) {
  try {
    createRecord_("AuditLogs", payload || {});
  } catch (error) {
    console.warn("Audit log gagal disimpan: " + error.message);
  }
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();

  return sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function(header) {
      return String(header || "").trim();
    });
}

function rowToObject_(headers, row) {
  const object = {};

  headers.forEach(function(header, index) {
    if (header) {
      object[header] = row[index] !== undefined && row[index] !== null
        ? String(row[index])
        : "";
    }
  });

  return object;
}

function getPrimaryKeyField_(headers) {
  if (headers.indexOf("ID") !== -1) {
    return "ID";
  }

  if (headers.indexOf("Key") !== -1) {
    return "Key";
  }

  throw new Error("Sheet tidak memiliki kolom ID atau Key.");
}

function validateSheetName_(sheetName) {
  if (!SHEET_SCHEMAS[sheetName]) {
    throw new Error("Sheet tidak diizinkan: " + sheetName);
  }
}

function getCacheKey_(sheetName) {
  return "CDP_CACHE_" + sheetName;
}

function clearSheetCache_(sheetName) {
  CacheService.getScriptCache().remove(getCacheKey_(sheetName));
}