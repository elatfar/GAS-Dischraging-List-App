/**
 * ============================================================
 * LOGIN ODOO VIA N8N
 * ============================================================
 *
 * Flow:
 * Apps Script
 *   -> n8n login webhook
 *   -> Odoo
 *   -> Partner
 *   -> Partner Tags
 *   -> validasi Shipping Agent
 *
 * Hanya user dengan is_shipping_agent === true
 * yang diperbolehkan login ke portal ini.
 */
function authenticateWithN8n_(email, password) {

  const payload = {
    email: email,
    password: password
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: true
  };


  // ==========================================================
  // CALL N8N
  // ==========================================================

  const response = UrlFetchApp.fetch(
    N8N_LOGIN_WEBHOOK_URL,
    options
  );

  const statusCode =
    response.getResponseCode();

  const responseText =
    response.getContentText() || "";


  console.log(
    "LOGIN N8N HTTP CODE: " +
    statusCode
  );

  console.log(
    "LOGIN N8N RAW RESPONSE: " +
    responseText
  );


  // ==========================================================
  // PARSE RESPONSE
  // ==========================================================

  const responseBody =
    parseJson_(responseText);

  const normalized =
    normalizeOdooLoginResponse_(responseBody);


  console.log(
    "LOGIN NORMALIZED RESPONSE: " +
    JSON.stringify(normalized)
  );


  // ==========================================================
  // HTTP ERROR
  // ==========================================================

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {

    return standardResponse_(
      false,
      {
        statusCode: statusCode,
        raw: responseBody
      },
      "Login gagal dari n8n. HTTP " +
      statusCode
    );
  }


  // ==========================================================
  // VALIDATE ODOO USER
  // ==========================================================

  if (!hasValidUid_(normalized.uid)) {

    return standardResponse_(
      false,
      {
        statusCode: statusCode,
        raw: responseBody
      },
      "Login gagal. Field id dari response Odoo tidak ditemukan."
    );
  }


  // ==========================================================
  // VALIDATE SHIPPING AGENT
  // ==========================================================
  //
  // n8n sekarang mengembalikan:
  //
  // partner_tags: ["Shipping Agent"]
  // is_shipping_agent: true
  //
  // Portal ini hanya boleh digunakan Shipping Agent.
  // ==========================================================

  if (normalized.is_shipping_agent !== true) {

    console.log(
      "LOGIN REJECTED - NOT SHIPPING AGENT: " +
      JSON.stringify({
        uid: normalized.uid,
        partnerId: normalized.partnerId,
        partnerName: normalized.partnerName,
        partner_tags: normalized.partner_tags,
        is_shipping_agent:
          normalized.is_shipping_agent
      })
    );

    return standardResponse_(
      false,
      {
        statusCode: statusCode,

        uid: String(
          normalized.uid || ""
        ),

        partnerId: String(
          normalized.partnerId || ""
        ),

        partnerName: String(
          normalized.partnerName || ""
        ),

        partner_tags:
          normalized.partner_tags || [],

        is_shipping_agent: false
      },
      "Akun Anda bukan Shipping Agent. Silakan gunakan portal yang sesuai."
    );
  }


  // ==========================================================
  // LOGIN SUCCESS
  // ==========================================================

  return standardResponse_(
    true,
    {
      uid: String(
        normalized.uid
      ),

      id: String(
        normalized.id
      ),

      partnerId: String(
        normalized.partnerId || ""
      ),

      partnerName: String(
        normalized.partnerName || ""
      ),

      partner_id:
        Array.isArray(normalized.partner_id)
          ? normalized.partner_id
          : [],

      partner_tags:
        Array.isArray(normalized.partner_tags)
          ? normalized.partner_tags
          : [],

      is_shipping_agent: true,

      raw: normalized.raw
    },
    "Login berhasil."
  );
}


/**
 * ============================================================
 * NORMALIZE LOGIN RESPONSE FROM N8N
 * ============================================================
 *
 * Expected response sekarang:
 *
 * {
 *   "success": true,
 *   "uid": 7,
 *   "id": 7,
 *   "email": "xxx@testmail.id",
 *   "partner_id": [
 *     33,
 *     "PT Samudera Indonesia"
 *   ],
 *   "partnerId": 33,
 *   "partnerName": "PT Samudera Indonesia",
 *   "partner_tags": [
 *     "Shipping Agent"
 *   ],
 *   "is_shipping_agent": true
 * }
 *
 * Function juga tetap support:
 * - array response
 * - wrapper { data: ... }
 * ============================================================
 */
function normalizeOdooLoginResponse_(body) {

  let candidate = body;


  // ==========================================================
  // ARRAY RESPONSE
  // ==========================================================

  if (Array.isArray(candidate)) {

    candidate =
      candidate.length > 0
        ? candidate[0]
        : null;
  }


  // ==========================================================
  // WRAPPER { data: ... }
  // ==========================================================

  if (
    candidate &&
    candidate.data !== undefined
  ) {

    candidate = candidate.data;

    if (Array.isArray(candidate)) {

      candidate =
        candidate.length > 0
          ? candidate[0]
          : null;
    }
  }


  // ==========================================================
  // DEFAULT VALUES
  // ==========================================================

  let id = "";
  let uid = "";

  let partnerId = "";
  let partnerName = "";

  let partner_id = [];

  let partner_tags = [];

  let is_shipping_agent = false;


  // ==========================================================
  // READ RESPONSE
  // ==========================================================

  if (
    candidate &&
    typeof candidate === "object"
  ) {


    // --------------------------------------------------------
    // USER ID
    // --------------------------------------------------------

    if (
      candidate.id !== undefined &&
      candidate.id !== null
    ) {

      id = candidate.id;
    }


    if (
      candidate.uid !== undefined &&
      candidate.uid !== null
    ) {

      uid = candidate.uid;

    } else {

      uid = id;
    }


    // --------------------------------------------------------
    // PARTNER
    // --------------------------------------------------------

    if (
      Array.isArray(candidate.partner_id)
    ) {

      partner_id =
        candidate.partner_id;

      partnerId =
        candidate.partner_id.length > 0
          ? candidate.partner_id[0]
          : "";

      partnerName =
        candidate.partner_id.length > 1
          ? candidate.partner_id[1]
          : "";

    } else {

      if (
        candidate.partnerId !== undefined &&
        candidate.partnerId !== null
      ) {

        partnerId =
          candidate.partnerId;
      }


      if (
        candidate.partnerName !== undefined &&
        candidate.partnerName !== null
      ) {

        partnerName =
          candidate.partnerName;
      }
    }


    // --------------------------------------------------------
    // PARTNER TAGS
    // --------------------------------------------------------

    if (
      Array.isArray(candidate.partner_tags)
    ) {

      partner_tags =
        candidate.partner_tags.map(
          function(tag) {
            return String(tag);
          }
        );
    }


    // --------------------------------------------------------
    // SHIPPING AGENT
    // --------------------------------------------------------

    is_shipping_agent =
      candidate.is_shipping_agent === true;
  }


  // ==========================================================
  // NORMALIZED RESULT
  // ==========================================================

  return {

    uid: uid,

    id: id,

    partnerId: partnerId,

    partnerName: partnerName,

    partner_id: partner_id,

    partner_tags: partner_tags,

    is_shipping_agent:
      is_shipping_agent,

    raw: candidate
  };
}