/**
 * Mengubah file PDF Base64 menjadi data terstruktur menggunakan Google Drive API (OCR).
 * Membutuhkan Advanced Google Service "Drive API" (v2) sudah diaktifkan.
 *
 * PERUBAHAN UTAMA dari versi sebelumnya:
 * 1. Menggunakan body.getTables() (struktur tabel asli hasil OCR Google Docs)
 *    alih-alih regex per baris pada getText(). Ini penting karena OCR PDF
 *    sering me-render tabel sebagai teks berurutan PER KOLOM (semua No,
 *    lalu semua Container, lalu semua Size, dst) bukan per baris, sehingga
 *    regex per baris pada versi lama akan gagal mengambil size/type/principal.
 * 2. Container No. dan Seal No. dipisah otomatis (format asli: "KKTU8258273-").
 * 3. Nama file OCR sementara dibuat unik (timestamp) agar tidak bentrok saat
 *    proses paralel/berulang.
 * 4. Header di-parse lebih fleksibel (spasi ganda, tanpa titik dua, dll)
 *    dan vessel/voyage serta POL/POD dipecah jadi field terpisah.
 * 5. Fallback ke regex pada teks flat tetap disediakan untuk jaga-jaga jika
 *    OCR tidak menghasilkan elemen tabel (mis. PDF hasil scan buram).
 * 6. File OCR sementara dihapus di blok finally, supaya tetap terhapus
 *    meskipun terjadi error saat parsing.
 */
function parseDischargingPDF(base64Data, fileName) {
  var fileId = null;
  try {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      "application/pdf",
      fileName,
    );

    var resource = {
      title: fileName.replace(/\.[^/.]+$/, "") + "_OCR_" + new Date().getTime(),
      mimeType: blob.getContentType(),
    };

    var options = {
      ocr: true,
      ocrLanguage: "en",
    };

    var file = Drive.Files.insert(resource, blob, options);
    fileId = file.id;

    var doc = DocumentApp.openById(fileId);
    var body = doc.getBody();
    var fullText = body.getText();

    var result = {
      header: parseHeaderText(fullText),
      containers: [],
    };

    // Prioritas: baca dari struktur tabel asli
    var tables = body.getTables();
    if (tables && tables.length > 0) {
      result.containers = parseContainerTable(tables[0]);
    }

    // Fallback: kalau tabel kosong/tidak terbaca, coba regex pada teks flat
    if (result.containers.length === 0) {
      result.containers = parseContainersFromText(fullText);
    }

    return result;
  } catch (error) {
    console.error("ERROR OCR PDF: " + error.message);
    throw new Error(
      "Gagal memproses PDF dengan Drive API. Pastikan Advanced Service 'Drive API' sudah diaktifkan. Detail: " +
        error.message,
    );
  } finally {
    // Selalu bersihkan file OCR sementara, sukses maupun gagal
    if (fileId) {
      try {
        Drive.Files.remove(fileId);
      } catch (e) {
        /* abaikan */
      }
    }
  }
}

/**
 * Ekstrak informasi header (Vessel/Voyage, POL-POD, TD, ETA) dari teks OCR.
 */
function parseHeaderText(text) {
  var header = {};

  var vesselMatch = text.match(/Vessel\s*\/\s*Voyage\s+([^\n]+)/i);
  if (vesselMatch) header.vesselVoyage = vesselMatch[1].trim();

  var polPodMatch = text.match(/POL\s*-\s*POD\s*:?\s*([^\n]+)/i);
  if (polPodMatch) header.polPod = polPodMatch[1].trim();

  var tdVesselMatch = text.match(/TD\s*Vessel\s*:?\s*([^\n]+)/i);
  if (tdVesselMatch) header.tdVessel = tdVesselMatch[1].trim();

  var etaVesselMatch = text.match(/ETA\s*Vessel\s*:?\s*([^\n]+)/i);
  if (etaVesselMatch) header.etaVessel = etaVesselMatch[1].trim();

  // Pecah "MERATUS KATINGAN / BP051N" -> vesselName, voyageNo
  if (header.vesselVoyage) {
    var vParts = header.vesselVoyage.split("/");
    if (vParts.length === 2) {
      header.vesselName = vParts[0].trim();
      header.voyageNo = vParts[1].trim();
    }
  }

  // Pecah "JAKARTA, INDONESIA-TELUK BAYUR, PADANG" -> pol, pod
  if (header.polPod) {
    var ppParts = header.polPod.split("-");
    if (ppParts.length === 2) {
      header.pol = ppParts[0].trim();
      header.pod = ppParts[1].trim();
    }
  }

  return header;
}

/**
 * Ekstrak baris kontainer langsung dari struktur tabel Google Docs.
 * Kolom sesuai header PDF: No | Container and Seal No. | Size | Type |
 *                          Principal | Free Use | Commodity
 */
function parseContainerTable(table) {
  var containers = [];
  var numRows = table.getNumRows();

  // Mulai dari baris 1 (index 0 = header tabel)
  for (var r = 1; r < numRows; r++) {
    var row = table.getRow(r);
    var numCells = row.getNumCells();
    if (numCells < 6) continue; // baris tidak lengkap, lewati

    var no = row.getCell(0).getText().trim();
    var containerSeal = row.getCell(1).getText().replace(/\s+/g, " ").trim();
    var size = row.getCell(2).getText().trim();
    var type = row.getCell(3).getText().trim();
    var principal = row.getCell(4).getText().replace(/\s+/g, " ").trim();
    var freeUse = row.getCell(5).getText().trim();
    var commodity =
      numCells > 6 ? row.getCell(6).getText().replace(/\s+/g, " ").trim() : "";

    // Pisahkan Container No. dari Seal No., format: "KKTU8258273-<seal>"
    var containerMatch = containerSeal.match(/([A-Z]{4}\d{7})-?\s*(.*)/);
    if (!containerMatch) continue; // bukan baris kontainer valid

    containers.push({
      no: no,
      containerNo: containerMatch[1],
      sealNo: containerMatch[2].trim(),
      size: size,
      type: type,
      principal: principal,
      freeUse: freeUse,
      commodity: commodity,
    });
  }

  return containers;
}

/**
 * Fallback: cari nomor kontainer via regex pada teks flat.
 * Hanya dipakai jika parseContainerTable() tidak menghasilkan apa-apa
 * (mis. OCR gagal membentuk elemen tabel). Detail size/type/principal
 * tidak bisa diandalkan akurat dalam mode ini karena urutan kolom bisa
 * tercampur, jadi field tersebut dikosongkan.
 */
function parseContainersFromText(text) {
  var containers = [];
  var seen = {};
  var containerRegex = /([A-Z]{4}\d{7})-?/g;
  var match;

  while ((match = containerRegex.exec(text)) !== null) {
    var containerNo = match[1];
    if (seen[containerNo]) continue;
    seen[containerNo] = true;

    containers.push({
      containerNo: containerNo,
      sealNo: "",
      size: "",
      type: "",
      principal: "",
      freeUse: "",
      commodity: "",
    });
  }

  return containers;
}
