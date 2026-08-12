const N8N_DISCHARGING_UPLOAD_URL =
  "https://n8n.srv1798914.hstgr.cloud/webhook/discharging-list";


/**
 * Mengirim payload Discharging List ke n8n.
 *
 * Function ini khusus untuk module Discharging.
 * Jangan digunakan untuk module lain.
 */
function sendDischargingToN8N_(payload) {

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };


  const response = UrlFetchApp.fetch(
    N8N_DISCHARGING_UPLOAD_URL,
    options
  );


  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();


  console.log(
    "DISCHARGING N8N HTTP CODE: " +
    statusCode
  );

  console.log(
    "DISCHARGING N8N RAW RESPONSE: " +
    responseText
  );


  // ============================================================
  // EMPTY RESPONSE
  // ============================================================

  if (!responseText) {
    throw new Error(
      "n8n mengembalikan response kosong. HTTP " +
      statusCode
    );
  }


  // ============================================================
  // PARSE RESPONSE
  // ============================================================

  let parsed;

  try {

    parsed = JSON.parse(responseText);

  } catch (error) {

    throw new Error(
      "Response n8n bukan JSON valid. HTTP " +
      statusCode +
      ". Response: " +
      responseText
    );

  }


  console.log(
    "DISCHARGING N8N PARSED RESPONSE: " +
    JSON.stringify(parsed)
  );


  // ============================================================
  // NORMALIZE ARRAY RESPONSE
  //
  // n8n kadang dapat mengembalikan:
  //
  // [
  //   {
  //     success: false,
  //     status: "rejected",
  //     ...
  //   }
  // ]
  // ============================================================

  if (Array.isArray(parsed)) {

    parsed = parsed.length > 0
      ? parsed[0]
      : null;

  }


  // ============================================================
  // INVALID / EMPTY JSON RESPONSE
  // ============================================================

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Object.keys(parsed).length === 0
  ) {

    throw new Error(
      "n8n mengembalikan JSON kosong/tidak valid. HTTP " +
      statusCode +
      ". Response: " +
      responseText
    );

  }


  // ============================================================
  // HTTP ERROR
  //
  // Kalau n8n mengembalikan structured response:
  //
  // {
  //   success: false,
  //   status: "error" / "rejected",
  //   message: "...",
  //   detail: "..."
  // }
  //
  // Tetap return response tersebut.
  // Jangan hilangkan informasi dari n8n.
  // ============================================================

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {

    if (
      parsed.success === false ||
      parsed.status === "error" ||
      parsed.status === "rejected"
    ) {

      return parsed;

    }


    throw new Error(
      parsed.detail ||
      parsed.message ||
      (
        "n8n HTTP error " +
        statusCode
      )
    );

  }


  // ============================================================
  // HTTP SUCCESS
  //
  // Return response n8n APA ADANYA.
  //
  // Bisa:
  // success:true
  // success:false + rejected
  // partial
  // dll.
  // ============================================================

  return parsed;
}