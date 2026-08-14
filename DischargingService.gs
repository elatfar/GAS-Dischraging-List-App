/**
 * Entry point dari Front-End untuk upload Discharging List.
 *
 * Dipanggil oleh:
 *
 * google.script.run.uploadDischargingList(payload)
 *
 * Jangan rename function ini karena FE bergantung
 * pada nama uploadDischargingList.
 */
function uploadDischargingList(payload) {

  console.log(
    "UPLOAD DISCHARGING LIST START"
  );


  try {

    // ==========================================================
    // VALIDATE REQUEST
    // ==========================================================

    if (!payload) {

      return {
        success: false,
        status: "error",
        error_code: "INVALID_REQUEST",
        message: "Payload Discharging List tidak ditemukan.",
        detail: "Frontend tidak mengirim payload ke Apps Script."
      };

    }


    if (!payload.fileName) {

      return {
        success: false,
        status: "error",
        error_code: "INVALID_FILE",
        message: "Nama file tidak ditemukan.",
        detail: "Property fileName tidak tersedia pada payload."
      };

    }


    if (!payload.base64 && !payload.isParsed) {

      return {
        success: false,
        status: "error",
        error_code: "EMPTY_FILE",
        message: "File Discharging List kosong.",
        detail: "Data Base64 file tidak ditemukan."
      };

    }


    // ==========================================================
    // BUILD N8N PAYLOAD
    // ==========================================================

    const isPdfFile =
      String(payload.mimeType || "").toLowerCase().includes("pdf") ||
      String(payload.fileName || "").toLowerCase().endsWith(".pdf");

    const n8nPayload = {
      fileName: String(payload.fileName || ""),
      mimeType: String(payload.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      user: payload.user || {},
      userAgent: String(payload.userAgent || "")
    };

    if (payload.isParsed) {
      console.log("PDF SUDAH DIPARSING DI FRONTEND.");
      n8nPayload.isParsed = true;
      n8nPayload.parsedHeader = payload.parsedHeader || {};
      n8nPayload.parsedContainers = payload.parsedContainers || [];
    } else if (isPdfFile) {
      console.log("PARSING PDF IN APPS SCRIPT...");
      const parsedData = parseDischargingPDF(payload.base64, payload.fileName);
      
      n8nPayload.isParsed = true;
      n8nPayload.parsedHeader = parsedData.header;
      n8nPayload.parsedContainers = parsedData.containers;
    } else {
      n8nPayload.base64 = String(payload.base64 || "");
    }


    console.log(
      "DISCHARGING FILE: " +
      n8nPayload.fileName
    );


    // ==========================================================
    // SEND TO N8N
    // ==========================================================

    let n8nResponse =
      sendDischargingToN8N_(
        n8nPayload
      );

    // n8n kadang mengembalikan array:
    // [{ success:false, status:"error", ... }]
    if (Array.isArray(n8nResponse)) {
      n8nResponse = n8nResponse[0] || null;
    }

    console.log(
      "DISCHARGING N8N RESPONSE: " +
      JSON.stringify(n8nResponse)
    );


    // ==========================================================
    // EMPTY RESPONSE
    // ==========================================================

    if (!n8nResponse) {

      return {
        success: false,
        status: "error",
        error_code: "EMPTY_N8N_RESPONSE",
        message: "Tidak ada response dari n8n.",
        detail: "n8n mengembalikan response kosong."
      };

    }


    // ==========================================================
    // TECHNICAL ERROR FROM N8N
    //
    // Contoh:
    //
    // {
    //   success: false,
    //   status: "error",
    //   error_code: "PROCESSING_ERROR",
    //   message: "...",
    //   detail: "..."
    // }
    //
    // Return langsung supaya FE mendapatkan detail sebenarnya.
    // ==========================================================

    if (
      n8nResponse.success === false ||
      n8nResponse.status === "error"
    ) {

      return n8nResponse;

    }


    // ==========================================================
    // NORMAL BUSINESS RESPONSE
    // ==========================================================
    //
    // Kita pertahankan response n8n.
    //
    // Kalau n8n sudah menggunakan standard:
    //
    // {
    //   success: true,
    //   message: "...",
    //   data: {...}
    // }
    //
    // return langsung.
    // ==========================================================

    if (
      n8nResponse.success === true
    ) {

      return n8nResponse;

    }


    // ==========================================================
    // FALLBACK
    //
    // Kalau n8n mengembalikan business result langsung,
    // bungkus ke standard response Apps Script.
    // ==========================================================

    return {
      success: false,
      status: "error",
      error_code: "UNKNOWN_N8N_RESPONSE",
      message: "Response n8n tidak dikenali.",
      detail: JSON.stringify(n8nResponse)
    };


  } catch (error) {

    // ==========================================================
    // UNEXPECTED APPS SCRIPT / NETWORK ERROR
    // ==========================================================

    console.error(
      "UPLOAD DISCHARGING LIST ERROR: " +
      (
        error &&
        error.stack
          ? error.stack
          : error
      )
    );


    return {
      success: false,
      status: "error",
      error_code: "APPS_SCRIPT_ERROR",
      message: "Upload Discharging List gagal.",
      detail:
        error && error.message
          ? error.message
          : String(error)
    };

  }

}