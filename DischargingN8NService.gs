const N8N_DISCHARGING_UPLOAD_URL =
  "https://n8n.srv1798914.hstgr.cloud/webhook/discharging-list";

const N8N_PDF_CONTAINER_EXTRACTION_URL =
  "https://n8n.srv1798914.hstgr.cloud/webhook-test/extract-container-from-pdf";


/**
 * Membangun payload sesuai skema yang diminta webhook n8n
 * "extract-container-from-pdf", dari data yang SUDAH diparsing di client
 * (parsedHeader + parsedContainers hasil PDF.js).
 *
 * Skema target:
 * [
 *   {
 *     header: {
 *       feeder_voy, voyage_no, port_of_loading, etd,
 *       no_of_packages, port_of_discharge, eta
 *     },
 *     details: [
 *       { no, container_owner, container_number, size, terms,
 *         cargo, stack_date, location_stack, bl_no }
 *     ],
 *     total_containers
 *   }
 * ]
 *
 * CATATAN: parser kita saat ini belum mengekstrak terms, cargo,
 * stack_date, location_stack, bl_no, dan no_of_packages dari PDF.
 * Field-field itu tetap disertakan (nilainya null) supaya schema-nya
 * tetap lengkap sesuai kontrak n8n, bukan dihilangkan.
 */
function buildDischargingExtractionPayload_(parsedHeader, parsedContainers) {
  parsedHeader = parsedHeader || {};
  parsedContainers = parsedContainers || [];

  // "MERATUS KATINGAN / BP051N" -> feeder_voy, voyage_no
  var feederVoy = "";
  var voyageNo = "";
  if (parsedHeader.vesselVoyage) {
    var vParts = String(parsedHeader.vesselVoyage).split("/");
    feederVoy = (vParts[0] || "").trim();
    voyageNo = (vParts[1] || "").trim();
  }

  // "JAKARTA, INDONESIA-TELUK BAYUR, PADANG" -> port_of_loading, port_of_discharge
  var portOfLoading = "";
  var portOfDischarge = "";
  if (parsedHeader.polPod) {
    var ppParts = String(parsedHeader.polPod).split("-");
    portOfLoading = (ppParts[0] || "").trim();
    portOfDischarge = (ppParts[1] || "").trim();
  }

  var details = parsedContainers.map(function (c, index) {
    return {
      no: index + 1,
      container_owner: parsedHeader.principal || null,
      container_number: c.containerNo || "",
      size: c.size || "",
      terms: null,
      cargo: null,
      stack_date: null,
      location_stack: null,
      bl_no: null
    };
  });

  return [
    {
      header: {
        feeder_voy: feederVoy || null,
        voyage_no: voyageNo || null,
        port_of_loading: portOfLoading || null,
        etd: parsedHeader.tdVessel || null,
        no_of_packages: null,
        port_of_discharge: portOfDischarge || null,
        eta: parsedHeader.etaVessel || null
      },
      details: details,
      total_containers: details.length
    }
  ];
}


/**
 * Kirim langsung hasil parsing (header + containers) ke webhook
 * extraction n8n, sesuai skema target di atas.
 *
 * "Langsung kirim" = tidak dibungkus payload lama (fileName, mimeType,
 * user, dll) -- hanya array [{ header, details, total_containers }]
 * yang dikirim sebagai body JSON.
 */
function sendParsedDischargingToExtractionWebhook_(parsedHeader, parsedContainers) {
  var payload = buildDischargingExtractionPayload_(parsedHeader, parsedContainers);

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  console.log("DISCHARGING EXTRACTION PAYLOAD: " + JSON.stringify(payload));

  var response = UrlFetchApp.fetch(N8N_PDF_CONTAINER_EXTRACTION_URL, options);
  var statusCode = response.getResponseCode();
  var responseText = response.getContentText();

  console.log("DISCHARGING EXTRACTION HTTP CODE: " + statusCode);
  console.log("DISCHARGING EXTRACTION RAW RESPONSE: " + responseText);

  if (!responseText) {
    throw new Error(
      "n8n (extraction) mengembalikan response kosong. HTTP " + statusCode
    );
  }

  var parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      "Response n8n (extraction) bukan JSON valid. HTTP " +
        statusCode +
        ". Response: " +
        responseText
    );
  }

  if (Array.isArray(parsed)) {
    parsed = parsed.length > 0 ? parsed[0] : null;
  }

  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
    throw new Error(
      "n8n (extraction) mengembalikan JSON kosong/tidak valid. HTTP " +
        statusCode +
        ". Response: " +
        responseText
    );
  }

  if (statusCode < 200 || statusCode >= 300) {
    if (
      parsed.success === false ||
      parsed.status === "error" ||
      parsed.status === "rejected"
    ) {
      return parsed;
    }

    throw new Error(
      parsed.detail || parsed.message || "n8n (extraction) HTTP error " + statusCode
    );
  }

  return parsed;
}


/**
 * Mengirim payload Discharging List ke n8n.
 *
 * Function ini khusus untuk module Discharging.
 * Jangan digunakan untuk module lain.
 */
function sendDischargingToN8N_(payload) {

  const isPdfFile =
    String(payload && payload.mimeType || "")
      .toLowerCase()
      .includes("pdf") ||
    String(payload && payload.fileName || "")
      .toLowerCase()
      .endsWith(".pdf");

  // Jika payload PDF sudah diparsing di Apps Script (base64 sudah dihapus),
  // kita gunakan webhook utama, bukan webhook extraction n8n.
  const useExtractionWebhook = isPdfFile && payload && payload.base64;

  const targetUrl =
    useExtractionWebhook
      ? N8N_PDF_CONTAINER_EXTRACTION_URL
      : N8N_DISCHARGING_UPLOAD_URL;

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };


  console.log(
    "DISCHARGING N8N TARGET URL: " +
    targetUrl
  );


  const response = UrlFetchApp.fetch(
    targetUrl,
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