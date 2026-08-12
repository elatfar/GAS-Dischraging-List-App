function standardResponse_(success, data, message) {
  return {
    success: Boolean(success),
    data: data === undefined ? null : data,
    message: message || ""
  };
}

function parseJson_(text) {
  try {
    if (!text) {
      return null;
    }

    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function sanitizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function hasValidUid_(uid) {
  return uid !== undefined &&
    uid !== null &&
    uid !== false &&
    String(uid).trim() !== "";
}

function nowIso_() {
  return new Date().toISOString();
}