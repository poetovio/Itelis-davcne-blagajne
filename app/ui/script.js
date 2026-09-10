const invoiceIdInput = document.getElementById("invoiceId");
const submitBtn = document.getElementById("submitBtn");
const result = document.getElementById("result");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const outInvoiceId = document.getElementById("outInvoiceId");
const outZoi = document.getElementById("outZoi");
const outEor = document.getElementById("outEor");

const receiptPlaceholder =
  document.getElementById("receiptPlaceholder");

const receiptContent =
  document.getElementById("receiptContent");

const receiptInvoiceId =
  document.getElementById("receiptInvoiceId");

const receiptDate =
  document.getElementById("receiptDate");

const receiptPremise =
  document.getElementById("receiptPremise");

const receiptDevice =
  document.getElementById("receiptDevice");

const receiptTaxNumber =
  document.getElementById("receiptTaxNumber");

const receiptAmount =
  document.getElementById("receiptAmount");

const receiptVat =
  document.getElementById("receiptVat");

const receiptTotal =
  document.getElementById("receiptTotal");

const receiptStatus =
  document.getElementById("receiptStatus");

const receiptZoi =
  document.getElementById("receiptZoi");

const receiptEor =
  document.getElementById("receiptEor");

const receiptStatusBadge =
  document.getElementById("receiptStatusBadge");

const downloadPdfBtn =
  document.getElementById("downloadPdfBtn");

const downloadNote =
  document.getElementById("downloadNote");

let pollTimer = null;
let currentPayload = null;
let currentResult = null;

invoiceIdInput.value =
  String(Date.now()).slice(-6);

function setStatus(kind, text) {
  statusDot.className = "dot " + kind;
  statusText.textContent = text;
}

function formatEur(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0,00 €";
  }

  return number.toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " €";
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0,00";
  }

  return number.toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("sl-SI", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function showReceipt(data) {
  currentResult = {
    Status: data.Status || "—",
    ZOI: data.ZOI || "—",
    EOR: data.EOR || "—"
  };

  const amount = Number(currentPayload.amount);

  const vat = Number.isFinite(amount)
    ? amount - amount / 1.22
    : 0;

  receiptPlaceholder.style.display = "none";
  receiptContent.style.display = "block";

  receiptInvoiceId.textContent =
    currentPayload.invoiceId || "—";

  receiptDate.textContent =
    formatDate(currentPayload.timestamp);

  receiptPremise.textContent =
    currentPayload.premiseId || "—";

  receiptDevice.textContent =
    currentPayload.deviceId || "—";

  receiptTaxNumber.textContent =
    currentPayload.taxNumber || "—";

  receiptAmount.textContent =
    formatEur(amount);

  receiptVat.textContent =
    formatEur(vat);

  receiptTotal.textContent =
    formatEur(amount);

  receiptStatus.textContent =
    currentResult.Status;

  receiptZoi.textContent =
    currentResult.ZOI;

  receiptEor.textContent =
    currentResult.EOR;

  receiptStatusBadge.textContent =
    data.Status === "CONFIRMED"
      ? "DAVČNO POTRJENO"
      : "NAPAKA PRI FISKALIZACIJI";

  downloadPdfBtn.style.display = "block";
  downloadNote.style.display = "block";
}

async function pollStatus(invoiceId, attempt = 0) {
  if (attempt > 25) {
    setStatus(
      "error",
      "Ni odgovora — preveri Event Mesh in loge aplikacije."
    );

    submitBtn.disabled = false;

    return;
  }

  try {
    const response =
      await fetch(
        "/ui/api/status/" +
        encodeURIComponent(invoiceId)
      );

    const data =
      await response.json();

    if (data.Status === "CONFIRMED") {
      setStatus(
        "confirmed",
        "Fiskalizacija potrjena"
      );

      outZoi.textContent =
        data.ZOI || "—";

      outEor.textContent =
        data.EOR || "—";

      showReceipt(data);

      submitBtn.disabled = false;

      return;
    }

    if (data.Status === "ERROR") {
      setStatus(
        "error",
        "Fiskalizacija je vrnila napako"
      );

      outZoi.textContent =
        data.ZOI || "—";

      outEor.textContent =
        data.EOR || "—";

      showReceipt(data);

      submitBtn.disabled = false;

      return;
    }

  } catch (error) {
    console.warn(
      "Napaka pri preverjanju statusa:",
      error
    );
  }

  pollTimer =
    setTimeout(
      () =>
        pollStatus(
          invoiceId,
          attempt + 1
        ),
      1200
    );
}

submitBtn.addEventListener(
  "click",
  async () => {

    clearTimeout(pollTimer);

    submitBtn.disabled = true;

    result.style.display = "block";

    outZoi.textContent = "—";
    outEor.textContent = "—";

    setStatus(
      "pending",
      "Pošiljam na Event Mesh …"
    );

    const payload = {
      invoiceId:
        invoiceIdInput.value.trim(),

      taxNumber:
        document
          .getElementById("taxNumber")
          .value
          .trim(),

      amount:
        parseFloat(
          document
            .getElementById("amount")
            .value
        ),

      premiseId:
        document
          .getElementById("premiseId")
          .value
          .trim(),

      deviceId:
        document
          .getElementById("deviceId")
          .value
          .trim(),

      timestamp:
        new Date().toISOString()
    };

    currentPayload = payload;
    currentResult = null;

    outInvoiceId.textContent =
      payload.invoiceId;

    downloadPdfBtn.style.display =
      "none";

    downloadNote.style.display =
      "none";

    receiptContent.style.display =
      "none";

    receiptPlaceholder.style.display =
      "flex";

    try {

      const response =
        await fetch(
          "/ui/api/emit",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(payload)
          }
        );

      if (!response.ok) {
        throw new Error(
          "Napaka pri pošiljanju računa."
        );
      }

      setStatus(
        "pending",
        "V obdelavi (Event Mesh → FURS) …"
      );

      pollStatus(
        payload.invoiceId
      );

    } catch (error) {

      console.error(error);

      setStatus(
        "error",
        "Napaka pri pošiljanju na Event Mesh"
      );

      submitBtn.disabled = false;
    }
  }
);

const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";

const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";

let pdfFonts = null;

async function fetchFontAsBase64(url) {

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      "Ni mogoče naložiti PDF pisave."
    );
  }

  const buffer =
    await response.arrayBuffer();

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          Math.min(
            i + chunkSize,
            bytes.length
          )
        )
      );
  }

  return btoa(binary);
}

async function loadPdfFonts() {

  if (pdfFonts) {
    return pdfFonts;
  }

  const fonts =
    await Promise.all([
      fetchFontAsBase64(
        FONT_REGULAR_URL
      ),

      fetchFontAsBase64(
        FONT_BOLD_URL
      )
    ]);

  pdfFonts = {
    regular: fonts[0],
    bold: fonts[1]
  };

  return pdfFonts;
}

async function loadLogo() {

  const response =
    await fetch("./itelis.jpg");

  if (!response.ok) {
    throw new Error(
      "ITELIS logotipa ni bilo mogoče naložiti."
    );
  }

  const blob =
    await response.blob();

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        () => resolve(
          reader.result
        );

      reader.onerror =
        reject;

      reader.readAsDataURL(blob);
    }
  );
}

async function getImageDimensions(dataUrl) {

  return new Promise(
    (resolve, reject) => {

      const image =
        new Image();

      image.onload =
        () => {

          resolve({
            width:
              image.naturalWidth,

            height:
              image.naturalHeight
          });
        };

      image.onerror =
        () =>
          reject(
            new Error(
              "Dimenzij logotipa ni mogoče prebrati."
            )
          );

      image.src =
        dataUrl;
    }
  );
}

function pdfText(
  doc,
  text,
  x,
  y,
  size = 10,
  bold = false,
  align = "left",
  maxWidth
) {

  doc.setFont(
    "NotoSans",
    bold
      ? "bold"
      : "normal"
  );

  doc.setFontSize(size);

  const options = {
    align: align
  };

  if (maxWidth) {
    options.maxWidth =
      maxWidth;
  }

  doc.text(
    String(text),
    x,
    y,
    options
  );
}

function pdfLine(
  doc,
  x1,
  y1,
  x2,
  y2
) {

  doc.setDrawColor(
    150,
    150,
    150
  );

  doc.setLineWidth(
    0.25
  );

  doc.line(
    x1,
    y1,
    x2,
    y2
  );
}

async function createInvoicePdf() {

  if (
    !currentPayload ||
    !currentResult
  ) {

    alert(
      "Račun še nima rezultata fiskalizacije."
    );

    return;
  }

  if (
    !window.jspdf ||
    !window.jspdf.jsPDF
  ) {

    alert(
      "PDF knjižnice ni mogoče naložiti. Preveri internetno povezavo."
    );

    return;
  }

  downloadPdfBtn.disabled =
    true;

  downloadPdfBtn.textContent =
    "Pripravljam PDF …";

  try {

    const fonts =
      await loadPdfFonts();

    const {
      jsPDF
    } =
      window.jspdf;

    const doc =
      new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true
      });

    doc.addFileToVFS(
      "NotoSans-Regular.ttf",
      fonts.regular
    );

    doc.addFont(
      "NotoSans-Regular.ttf",
      "NotoSans",
      "normal"
    );

    doc.addFileToVFS(
      "NotoSans-Bold.ttf",
      fonts.bold
    );

    doc.addFont(
      "NotoSans-Bold.ttf",
      "NotoSans",
      "bold"
    );

    doc.setFont(
      "NotoSans",
      "normal"
    );

    const pageWidth =
      210;

    const margin =
      18;

    const right =
      pageWidth - margin;

    const amount =
      Number(
        currentPayload.amount
      ) || 0;

    const net =
      amount / 1.22;

    const vat =
      amount - net;

    pdfText(
      doc,
      "ITELIS d.o.o.",
      margin,
      22,
      16,
      true
    );

    pdfText(
      doc,
      "Cesta na Brdo 123",
      margin,
      28
    );

    pdfText(
      doc,
      "1000 Ljubljana",
      margin,
      33
    );

    pdfText(
      doc,
      "Slovenija",
      margin,
      38
    );

    pdfText(
      doc,
      "Davčna številka: " +
        currentPayload.taxNumber,
      margin,
      43
    );

    pdfText(
      doc,
      "Matična številka: 0000000000",
      margin,
      48
    );

    try {

      const logo =
        await loadLogo();

      const dimensions =
        await getImageDimensions(
          logo
        );

      const desiredWidth =
        48;

      const originalRatio =
        dimensions.height /
        dimensions.width;

      let logoWidth =
        desiredWidth;

      let logoHeight =
        logoWidth *
        originalRatio;

      const maxHeight =
        22;

      if (
        logoHeight >
        maxHeight
      ) {

        logoHeight =
          maxHeight;

        logoWidth =
          logoHeight /
          originalRatio;
      }

      doc.addImage(
        logo,
        "JPEG",
        right - logoWidth,
        16,
        logoWidth,
        logoHeight
      );

    } catch (error) {

      console.warn(
        "ITELIS logotipa ni bilo mogoče dodati:",
        error
      );
    }

    pdfLine(
      doc,
      margin,
      56,
      right,
      56
    );

    pdfText(
      doc,
      "RAČUN",
      margin,
      70,
      23,
      true
    );

    pdfText(
      doc,
      "Št. računa: " +
        currentPayload.invoiceId,
      margin,
      78,
      12,
      true
    );

    const metaX =
      126;

    const metaValueX =
      161;

    pdfText(
      doc,
      "Kraj izdaje:",
      metaX,
      67,
      10,
      true
    );

    pdfText(
      doc,
      "Ljubljana",
      metaValueX,
      67
    );

    pdfText(
      doc,
      "Datum izdaje:",
      metaX,
      73,
      10,
      true
    );

    pdfText(
      doc,
      formatDate(
        currentPayload.timestamp
      ),
      metaValueX,
      73
    );

    pdfText(
      doc,
      "Poslovni prostor:",
      metaX,
      79,
      10,
      true
    );

    pdfText(
      doc,
      currentPayload.premiseId,
      metaValueX,
      79
    );

    pdfText(
      doc,
      "Elektronska naprava:",
      metaX,
      85,
      10,
      true
    );

    pdfText(
      doc,
      currentPayload.deviceId,
      metaValueX,
      85
    );

    pdfText(
      doc,
      "Izdajatelj",
      margin,
      101,
      11,
      true
    );

    pdfText(
      doc,
      "ITELIS d.o.o.",
      margin,
      107
    );

    pdfText(
      doc,
      "Cesta na Brdo 123",
      margin,
      112
    );

    pdfText(
      doc,
      "1000 Ljubljana",
      margin,
      117
    );

    pdfText(
      doc,
      "Slovenija",
      margin,
      122
    );

    pdfText(
      doc,
      "Kupec",
      105,
      101,
      11,
      true
    );

    pdfText(
      doc,
      "Testni kupec",
      105,
      107
    );

    pdfText(
      doc,
      "Testna ulica 1",
      105,
      112
    );

    pdfText(
      doc,
      "1000 Ljubljana",
      105,
      117
    );

    pdfText(
      doc,
      "Slovenija",
      105,
      122
    );

    pdfText(
      doc,
      "Davčna številka: " +
        currentPayload.taxNumber,
      105,
      127
    );

    const tableTop =
      139;

    const colQuantity =
      126;

    const colPrice =
      159;

    doc.setFillColor(
      239,
      240,
      241
    );

    doc.rect(
      margin,
      tableTop - 6,
      right - margin,
      9,
      "F"
    );

    pdfText(
      doc,
      "Opis storitve / blaga",
      margin + 2,
      tableTop,
      9,
      true
    );

    pdfText(
      doc,
      "Količina",
      colQuantity,
      tableTop,
      9,
      true,
      "center"
    );

    pdfText(
      doc,
      "Cena (EUR)",
      colPrice,
      tableTop,
      9,
      true,
      "right"
    );

    pdfText(
      doc,
      "Znesek (EUR)",
      right - 2,
      tableTop,
      9,
      true,
      "right"
    );

    pdfLine(
      doc,
      margin,
      tableTop + 3,
      right,
      tableTop + 3
    );

    pdfText(
      doc,
      "Testni račun / storitev",
      margin + 2,
      tableTop + 12,
      9
    );

    pdfText(
      doc,
      "1",
      colQuantity,
      tableTop + 12,
      9,
      false,
      "center"
    );

    pdfText(
      doc,
      formatNumber(net),
      colPrice,
      tableTop + 12,
      9,
      false,
      "right"
    );

    pdfText(
      doc,
      formatNumber(amount),
      right - 2,
      tableTop + 12,
      9,
      false,
      "right"
    );

    pdfLine(
      doc,
      margin,
      tableTop + 17,
      right,
      tableTop + 17
    );

    const summaryX =
      124;

    let y =
      168;

    pdfText(
      doc,
      "Skupaj brez DDV:",
      summaryX,
      y,
      10,
      true
    );

    pdfText(
      doc,
      formatEur(net),
      right,
      y,
      10,
      false,
      "right"
    );

    y += 7;

    pdfText(
      doc,
      "DDV 22 %:",
      summaryX,
      y
    );

    pdfText(
      doc,
      formatEur(vat),
      right,
      y,
      10,
      false,
      "right"
    );

    pdfLine(
      doc,
      summaryX,
      y + 4,
      right,
      y + 4
    );

    y += 13;

    pdfText(
      doc,
      "ZA PLAČILO:",
      summaryX,
      y,
      13,
      true
    );

    pdfText(
      doc,
      formatEur(amount),
      right,
      y,
      13,
      true,
      "right"
    );

    y += 18;

    pdfLine(
      doc,
      margin,
      y - 5,
      right,
      y - 5
    );

    pdfText(
      doc,
      "Podatki o plačilu",
      margin,
      y + 2,
      11,
      true
    );

    pdfText(
      doc,
      "Način plačila: Gotovina",
      margin,
      y + 9
    );

    pdfText(
      doc,
      "Znesek plačan: " +
        formatEur(amount),
      margin,
      y + 15
    );

    pdfText(
      doc,
      "Ostane za plačilo: 0,00 €",
      margin,
      y + 21
    );

    const fiscalTop =
      y + 34;

    doc.setFillColor(
      250,
      250,
      250
    );

    doc.setDrawColor(
      150,
      150,
      150
    );

    doc.rect(
      margin,
      fiscalTop,
      right - margin,
      38,
      "FD"
    );

    pdfText(
      doc,
      "DAVČNO POTRJEN RAČUN",
      margin + 5,
      fiscalTop + 8,
      11,
      true
    );

    pdfText(
      doc,
      "Status:",
      margin + 5,
      fiscalTop + 16,
      10,
      true
    );

    pdfText(
      doc,
      currentResult.Status,
      margin + 32,
      fiscalTop + 16,
      10,
      true
    );

    pdfText(
      doc,
      "ZOI:",
      margin + 5,
      fiscalTop + 23,
      10,
      true
    );

    pdfText(
      doc,
      currentResult.ZOI,
      margin + 32,
      fiscalTop + 23,
      8,
      false,
      "left",
      137
    );

    pdfText(
      doc,
      "EOR:",
      margin + 5,
      fiscalTop + 31,
      10,
      true
    );

    pdfText(
      doc,
      currentResult.EOR,
      margin + 32,
      fiscalTop + 31,
      8,
      false,
      "left",
      137
    );

    pdfLine(
      doc,
      margin,
      270,
      right,
      270
    );

    pdfText(
      doc,
      "Hvala za vaš nakup!",
      pageWidth / 2,
      279,
      11,
      true,
      "center"
    );

    pdfText(
      doc,
      "Račun je bil davčno potrjen v skladu z ZDavPR.",
      pageWidth / 2,
      286,
      9,
      false,
      "center"
    );

    pdfText(
      doc,
      "ITELIS d.o.o. · Testno okolje",
      pageWidth / 2,
      293,
      8,
      false,
      "center"
    );

    doc.save(
      "racun-" +
      (
        currentPayload.invoiceId ||
        "test"
      ) +
      ".pdf"
    );

  } catch (error) {

    console.error(
      "PDF generation failed:",
      error
    );

    alert(
      "Pri ustvarjanju PDF-ja je prišlo do napake: " +
      error.message
    );

  } finally {

    downloadPdfBtn.disabled =
      false;

    downloadPdfBtn.textContent =
      "↓ Prenesi račun kot PDF";
  }
}


downloadPdfBtn.addEventListener(
  "click",
  createInvoicePdf
);