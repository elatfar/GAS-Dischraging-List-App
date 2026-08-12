const DB = SpreadsheetApp.openById("1h5XjOOm5F97MSS4NlXn93sPi6gEm60UEq9chdW3vaFY");

const APP_NAME = "Container Depot Portal";
const APP_THEME = "Modern Port Terminal";
const APP_LOGO_URL = "https://drive.google.com/thumbnail?id=1DKI9yDTEI_YTG84-tWUR0aE3XArYcxS2&sz=w1000";

const N8N_LOGIN_WEBHOOK_URL = "https://n8n.srv1798914.hstgr.cloud/webhook/login-odoo";

function doGet(e) {
  return HtmlService
    .createTemplateFromFile("Index")
    .evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function SetupDatabase() {
  try {
    ensureDatabase_();

    return standardResponse_(true, {
      sheets: Object.keys(SHEET_SCHEMAS)
    }, "Database berhasil dibuat / diperbarui.");
  } catch (error) {
    return standardResponse_(false, null, "Setup database gagal: " + error.message);
  }
}

function ResetMenus() {
  try {
    console.log("RESET MENUS VERSION: DISCHARGING V1");
    console.log("DB ID: " + DB.getId());
    console.log("DB NAME: " + DB.getName());
    console.log("DEFAULT MENUS: " + JSON.stringify(DEFAULT_MENUS));

    const sheet = DB.getSheetByName("Menus");

    if (!sheet) {
      throw new Error("Sheet Menus tidak ditemukan.");
    }

    const lastRow = sheet.getLastRow();

    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    clearSheetCache_("Menus");

    DEFAULT_MENUS.forEach(function(menu) {
      createRecord_("Menus", menu);
    });

    return standardResponse_(true, null, "Menus berhasil direset. " + DEFAULT_MENUS.length + " menu diisi ulang.");
  } catch (error) {
    return standardResponse_(false, null, "Reset menus gagal: " + error.message);
  }
}

function appBootstrap() {
  try {
    ensureDatabase_();

    return standardResponse_(true, {
      config: {
        appName: APP_NAME,
        theme: APP_THEME,
        logoUrl: APP_LOGO_URL
      },
      menus: getActiveMenus_()
    }, "Aplikasi siap digunakan.");
  } catch (error) {
    return standardResponse_(false, null, "Bootstrap gagal: " + error.message);
  }
}

function loginOdoo(email, password, userAgent) {

  try {

    ensureDatabase_();


    // ========================================================
    // INPUT
    // ========================================================

    const cleanEmail =
      sanitizeEmail_(email);

    const cleanPassword =
      String(password || "");


    // ========================================================
    // BASIC VALIDATION
    // ========================================================

    if (!isValidEmail_(cleanEmail)) {

      return standardResponse_(
        false,
        null,
        "Format email tidak valid."
      );
    }


    if (!cleanPassword) {

      return standardResponse_(
        false,
        null,
        "Password wajib diisi."
      );
    }


    // ========================================================
    // AUTHENTICATE THROUGH N8N
    // ========================================================

    const authResult =
      authenticateWithN8n_(
        cleanEmail,
        cleanPassword
      );


    console.log(
      "LOGIN AUTH RESULT: " +
      JSON.stringify(authResult)
    );


    // ========================================================
    // AUDIT LOG
    // ========================================================

    appendAuditLog_({

      Email:
        cleanEmail,

      OdooUserID:
        authResult.success &&
        authResult.data
          ? authResult.data.uid
          : "",

      PartnerID:
        authResult.success &&
        authResult.data
          ? authResult.data.partnerId
          : "",

      PartnerName:
        authResult.success &&
        authResult.data
          ? authResult.data.partnerName
          : "",

      Action:
        "LOGIN",

      Status:
        authResult.success
          ? "SUCCESS"
          : "FAILED",

      Message:
        authResult.message,

      UserAgent:
        userAgent || ""
    });


    // ========================================================
    // AUTHENTICATION FAILED
    // ========================================================

    if (!authResult.success) {

      return standardResponse_(
        false,
        null,
        authResult.message
      );
    }


    // ========================================================
    // SECOND SHIPPING AGENT VALIDATION
    // ========================================================
    //
    // N8NService sudah melakukan validation.
    //
    // Tetapi Code.gs juga melakukan defensive validation
    // supaya session portal tidak pernah dibuat untuk user
    // non Shipping Agent.
    // ========================================================

    if (
      !authResult.data ||
      authResult.data.is_shipping_agent !== true
    ) {

      appendAuditLog_({

        Email:
          cleanEmail,

        OdooUserID:
          authResult.data
            ? authResult.data.uid
            : "",

        PartnerID:
          authResult.data
            ? authResult.data.partnerId
            : "",

        PartnerName:
          authResult.data
            ? authResult.data.partnerName
            : "",

        Action:
          "LOGIN",

        Status:
          "FAILED",

        Message:
          "Akun bukan Shipping Agent.",

        UserAgent:
          userAgent || ""
      });


      return standardResponse_(
        false,
        null,
        "Akun Anda bukan Shipping Agent. Silakan gunakan portal yang sesuai."
      );
    }


    // ========================================================
    // LOGIN SUCCESS
    // ========================================================

    return standardResponse_(
      true,
      {

        uid:
          String(
            authResult.data.uid
          ),

        id:
          String(
            authResult.data.id ||
            authResult.data.uid
          ),

        email:
          cleanEmail,

        partnerId:
          String(
            authResult.data.partnerId ||
            ""
          ),

        partnerName:
          String(
            authResult.data.partnerName ||
            ""
          ),

        partner_id:
          Array.isArray(
            authResult.data.partner_id
          )
            ? authResult.data.partner_id
            : [],

        partner_tags:
          Array.isArray(
            authResult.data.partner_tags
          )
            ? authResult.data.partner_tags
            : [],

        is_shipping_agent:
          true,

        loginAt:
          nowIso_()
      },

      "Login berhasil."
    );


  } catch (error) {


    // ========================================================
    // UNEXPECTED ERROR
    // ========================================================

    console.error(
      "LOGIN ERROR: " +
      error.message
    );


    appendAuditLog_({

      Email:
        email || "",

      OdooUserID:
        "",

      PartnerID:
        "",

      PartnerName:
        "",

      Action:
        "LOGIN",

      Status:
        "ERROR",

      Message:
        error.message,

      UserAgent:
        userAgent || ""
    });


    return standardResponse_(
      false,
      null,
      "Login gagal: " +
      error.message
    );
  }
}

function getMainMenus() {
  try {
    ensureDatabase_();

    return standardResponse_(true, getActiveMenus_(), "Menu berhasil dimuat.");
  } catch (error) {
    return standardResponse_(false, [], "Menu gagal dimuat: " + error.message);
  }
}

function apiGetRecords(sheetName) {
  try {
    return standardResponse_(true, readRecords_(sheetName, true), "Data berhasil dimuat.");
  } catch (error) {
    return standardResponse_(false, [], "Data gagal dimuat: " + error.message);
  }
}

function apiCreateRecord(sheetName, payload) {
  try {
    return standardResponse_(true, createRecord_(sheetName, payload || {}), "Data berhasil ditambahkan.");
  } catch (error) {
    return standardResponse_(false, null, "Data gagal ditambahkan: " + error.message);
  }
}

function apiUpdateRecord(sheetName, id, payload) {
  try {
    return standardResponse_(true, updateRecord_(sheetName, id, payload || {}), "Data berhasil diperbarui.");
  } catch (error) {
    return standardResponse_(false, null, "Data gagal diperbarui: " + error.message);
  }
}

function apiDeleteRecord(sheetName, id) {
  try {
    return standardResponse_(true, deleteRecord_(sheetName, id), "Data berhasil dihapus.");
  } catch (error) {
    return standardResponse_(false, null, "Data gagal dihapus: " + error.message);
  }
}

function apiSearchVessels(query) {
  try {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
      return standardResponse_(true, [], "Query kosong.");
    }

    const results = searchVessels_(cleanQuery);
    console.log("searchVessels results:", JSON.stringify(results));
    return standardResponse_(true, results, "Hasil pencarian kapal.");
  } catch (error) {
    console.error("apiSearchVessels error:", error.message);
    return standardResponse_(false, [], "Gagal mencari kapal: " + error.message);
  }
}

function apiCreateBookingGateIn(formData) {
  try {
    ensureDatabase_();

    // 1. Validasi
    if (!formData.containers || formData.containers.length === 0) {
      return standardResponse_(false, null, "Minimal harus ada 1 nomor kontainer.");
    }

    // 2. Payload ke n8n — hanya data yang dibutuhkan
    const payloadN8n = {
      partner_id:   formData.partnerId,
      partner_name: formData.customerName,
      email:        formData.userEmail,
      containers:   formData.containers
    };

    // 3. Kirim ke n8n
    const n8nResult = sendBookingGateInToN8n_(payloadN8n);

    // 4. Audit log
    appendAuditLog_({
      Email:       formData.userEmail,
      OdooUserID:  formData.uid,
      PartnerID:   formData.partnerId,
      PartnerName: formData.customerName,
      Action:      "CREATE_BOOKING_GATE_IN",
      Status:      "SUCCESS",
      Message:     "Booking dikirim ke n8n. Containers: " + formData.containers.length,
      UserAgent:   ""
    });

    return standardResponse_(true, n8nResult, "Booking Gate-In berhasil diproses.");
  } catch (error) {
    return standardResponse_(false, null, "Gagal membuat booking: " + error.message);
  }
}