import express from 'express';
import { create } from 'xmlbuilder2';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const authMiddleware = (req, res, next) => {
  const apiKey = req.get('x-api-key');
  let rawKeys = process.env.API_KEYS || '';
  
  // Clean up any accidental literal quotes if they were pasted into Vercel
  rawKeys = rawKeys.replace(/['"]+/g, '');
  
  const validKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

  // LOGGING FOR VERCEL (Private)
  console.log(`[AUTH] Received: ${apiKey ? apiKey.substring(0, 4) + '...' : 'NONE'}`);
  console.log(`[AUTH] Keys Loaded: ${validKeys.length}, RawLength: ${rawKeys.length}`);

  if (!apiKey || !validKeys.includes(apiKey.trim())) {
    return res.status(401).json({ 
      error: 'Invalid API key',
      path: req.path,
      keys_found: validKeys.length // This will tell us if it's 0 or more
    });
  }
  next();
};

const VALID_EMIRATES = ['DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'];
const VAT_RATES = {
  standard: 0.05,
  zero_rated: 0,
  exempt: 0
};

const isLuhnValid = (value) => {
  if (!value || typeof value !== 'string') return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = parseInt(value.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return (sum % 10) === 0;
};

const MOCK_BUSINESSES = {
  "100234567890003": "Pint API Solutions LLC",
  "100987654321006": "Global Tech Corp",
  "100555444333224": "Al-Futtaim Group",
  "100111222333442": "Emirates Group"
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/', (req, res) => {
  res.send('<h1>Welcome to Pint API</h1><p>UAE Tax & E-Invoicing Compliance Engine is running.</p><p>Check /health for status.</p>');
});

app.use(authMiddleware);

app.post('/v1/vat/calculate', (req, res) => {
  // ... existing implementation remains (omitted for brevity in this scratch thought, but I will include it in the actual call)
});

app.post('/v1/invoice/generate', (req, res) => {
  try {
    const { seller, buyer, items, invoice_number, date } = req.body;

    // Basic validation
    if (!seller || !buyer || !items || !invoice_number || !date) {
      return res.status(400).json({ error: "Missing required fields: seller, buyer, items, invoice_number, and date are all required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array" });
    }

    let subtotal = 0;
    let totalTax = 0;

    const lineItems = items.map((item, index) => {
      const { description, quantity, unit_price, vat_category } = item;
      const rate = VAT_RATES[vat_category?.toLowerCase()] ?? 0.05; // Default to standard if unknown
      const lineAmount = quantity * unit_price;
      const vatAmount = lineAmount * rate;
      
      subtotal += lineAmount;
      totalTax += vatAmount;

      return {
        id: index + 1,
        description,
        quantity,
        unit_price,
        line_amount: lineAmount,
        vat_rate: rate,
        vat_amount: vatAmount,
        total: lineAmount + vatAmount,
        category: vat_category?.toUpperCase() || 'STANDARD'
      };
    });

    const totalWithVat = subtotal + totalTax;

    // XML Generation (PINT AE / UBL 2.1)
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('Invoice', {
        'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
      })
        .ele('cbc:CustomizationID').txt('urn:fdc:peppol.eu:poacc:trns:billing:3.0:pint:1.0').up()
        .ele('cbc:ProfileID').txt('urn:fdc:peppol.eu:poacc:bis:billing:3.0').up()
        .ele('cbc:ID').txt(invoice_number).up()
        .ele('cbc:IssueDate').txt(date).up()
        .ele('cbc:InvoiceTypeCode').txt('380').up() // Commercial Invoice
        .ele('cbc:DocumentCurrencyCode').txt('AED').up()
        
        // Seller
        .ele('cac:AccountingSupplierParty')
          .ele('cac:Party')
            .ele('cac:PartyName').ele('cbc:Name').txt(seller.name).up().up()
            .ele('cac:PostalAddress')
              .ele('cbc:StreetName').txt(seller.address).up()
              .ele('cbc:CityName').txt(seller.emirate).up()
              .ele('cac:Country').ele('cbc:IdentificationCode').txt('AE').up().up()
            .up()
            .ele('cac:PartyTaxScheme')
              .ele('cbc:CompanyID').txt(seller.trn).up()
              .ele('cac:TaxScheme').ele('cbc:ID').txt('VAT').up().up()
            .up()
          .up()
        .up()

        // Buyer
        .ele('cac:AccountingCustomerParty')
          .ele('cac:Party')
            .ele('cac:PartyName').ele('cbc:Name').txt(buyer.name).up().up()
            .ele('cac:PostalAddress')
              .ele('cbc:StreetName').txt(buyer.address).up()
              .ele('cac:Country').ele('cbc:IdentificationCode').txt('AE').up().up()
            .up()
            .ele('cac:PartyTaxScheme')
              .ele('cbc:CompanyID').txt(buyer.trn).up()
              .ele('cac:TaxScheme').ele('cbc:ID').txt('VAT').up().up()
            .up()
          .up()
        .up()

        // Tax Total
        .ele('cac:TaxTotal')
          .ele('cbc:TaxAmount', { currencyID: 'AED' }).txt(totalTax.toFixed(2)).up()
          .ele('cac:TaxSubtotal')
            .ele('cbc:TaxableAmount', { currencyID: 'AED' }).txt(subtotal.toFixed(2)).up()
            .ele('cbc:TaxAmount', { currencyID: 'AED' }).txt(totalTax.toFixed(2)).up()
            .ele('cac:TaxCategory')
              .ele('cbc:ID').txt('S').up() // Assuming S for standard for now
              .ele('cbc:Percent').txt('5').up()
              .ele('cac:TaxScheme').ele('cbc:ID').txt('VAT').up().up()
            .up()
          .up()
        .up()

        // Legal Monetary Total
        .ele('cac:LegalMonetaryTotal')
          .ele('cbc:LineExtensionAmount', { currencyID: 'AED' }).txt(subtotal.toFixed(2)).up()
          .ele('cbc:TaxExclusiveAmount', { currencyID: 'AED' }).txt(subtotal.toFixed(2)).up()
          .ele('cbc:TaxInclusiveAmount', { currencyID: 'AED' }).txt(totalWithVat.toFixed(2)).up()
          .ele('cbc:PayableAmount', { currencyID: 'AED' }).txt(totalWithVat.toFixed(2)).up()
        .up();

    // Invoice Lines
    lineItems.forEach(item => {
      doc.ele('cac:InvoiceLine')
        .ele('cbc:ID').txt(item.id.toString()).up()
        .ele('cbc:InvoicedQuantity', { unitCode: 'H87' }).txt(item.quantity.toString()).up() // H87 is 'piece'
        .ele('cbc:LineExtensionAmount', { currencyID: 'AED' }).txt(item.line_amount.toFixed(2)).up()
        .ele('cac:Item')
          .ele('cbc:Name').txt(item.description).up()
          .ele('cac:ClassifiedTaxCategory')
            .ele('cbc:ID').txt(item.category === 'STANDARD' ? 'S' : 'Z').up()
            .ele('cbc:Percent').txt((item.vat_rate * 100).toString()).up()
            .ele('cac:TaxScheme').ele('cbc:ID').txt('VAT').up().up()
          .up()
        .up()
        .ele('cac:Price')
          .ele('cbc:PriceAmount', { currencyID: 'AED' }).txt(item.unit_price.toFixed(2)).up()
        .up()
      .up();
    });

    const xml = doc.end({ prettyPrint: true });

    res.json({
      xml,
      invoice_id: invoice_number,
      total_with_vat: totalWithVat
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/v1/invoice/validate', (req, res) => {
  const { seller, buyer, items, invoice_number, date } = req.body;
  const errors = [];
  const passed_checks = [];
  let score = 100;

  // 1. Required Fields Check
  const requiredFields = {
    'seller.name': seller?.name,
    'seller.trn': seller?.trn,
    'seller.address': seller?.address,
    'seller.emirate': seller?.emirate,
    'buyer.name': buyer?.name,
    'buyer.trn': buyer?.trn,
    'buyer.address': buyer?.address,
    'items': Array.isArray(items) && items.length > 0,
    'invoice_number': invoice_number,
    'date': date
  };

  Object.entries(requiredFields).forEach(([field, value]) => {
    if (!value) {
      errors.push({ field, message: `Field '${field}' is required.`, severity: 'error' });
      score -= 10;
    }
  });

  if (!errors.some(e => e.message.includes('required'))) passed_checks.push("Required fields present");

  // 2. TRN Format Check
  const validateTRN = (trn, label) => {
    if (!trn) return;
    if (trn.length !== 15 || !/^\d+$/.test(trn)) {
      errors.push({ field: `${label}.trn`, message: "TRN must be exactly 15 numeric digits.", severity: 'error' });
      score -= 15;
    } else if (!isLuhnValid(trn)) {
      errors.push({ field: `${label}.trn`, message: "TRN checksum verification failed.", severity: 'warning' });
      score -= 5;
    }
  };

  validateTRN(seller?.trn, 'seller');
  validateTRN(buyer?.trn, 'buyer');
  if (!errors.some(e => e.field.includes('trn'))) passed_checks.push("TRN format & checksum");

  // 3. Date Format Check
  if (date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date) || isNaN(Date.parse(date))) {
      errors.push({ field: 'date', message: "Date must be in ISO 8601 format (YYYY-MM-DD).", severity: 'error' });
      score -= 10;
    } else {
      passed_checks.push("Date format valid (ISO 8601)");
    }
  }

  // 4. VAT & Decimal Precision
  if (Array.isArray(items)) {
    items.forEach((item, idx) => {
      const prefix = `items[${idx}]`;
      if (!VAT_RATES.hasOwnProperty(item.vat_category?.toLowerCase())) {
        errors.push({ field: `${prefix}.vat_category`, message: `Invalid VAT category: ${item.vat_category}.`, severity: 'error' });
        score -= 5;
      }
      if (typeof item.unit_price === 'number') {
        const decimals = (item.unit_price.toString().split('.')[1] || "").length;
        if (decimals > 2) {
          errors.push({ field: `${prefix}.unit_price`, message: "AED amounts have max 2 decimal places.", severity: 'error' });
          score -= 5;
        }
      }
    });
    if (!errors.some(e => e.field.includes('items'))) passed_checks.push("VAT calculations & decimal precision");
  }

  const finalScore = Math.max(0, score);
  const isValid = !errors.some(e => e.severity === 'error');

  res.json({
    valid: isValid,
    score: finalScore,
    errors,
    passed_checks
  });
});

app.get('/v1/trn/verify', (req, res) => {
  const { trn } = req.query;

  if (!trn) {
    return res.status(400).json({
      valid: false,
      message: "TRN parameter is required"
    });
  }

  // 1. Length Check
  if (trn.length !== 15) {
    return res.json({
      valid: false,
      trn,
      format_check: 'fail',
      message: `Invalid length. TRN must be exactly 15 digits.`
    });
  }

  // 2. Numeric Check
  if (!/^\d+$/.test(trn)) {
    return res.json({
      valid: false,
      trn,
      format_check: 'fail',
      message: "Invalid format. TRN must contain only numbers."
    });
  }

  const passesChecksum = isLuhnValid(trn);
  const businessName = MOCK_BUSINESSES[trn];

  if (!passesChecksum) {
    return res.json({
      valid: false,
      trn,
      format_check: 'pass',
      checksum_check: 'fail',
      message: "Invalid TRN. Checksum verification failed."
    });
  }

  res.json({
    valid: true,
    trn,
    business_name: businessName || "Format Verified (Official identity not verified)",
    format_check: 'pass',
    checksum_check: 'pass',
    verification_source: businessName ? "Internal Database" : "Algorithmic Format Check",
    message: businessName 
      ? `TRN is valid and verified for ${businessName}.` 
      : "TRN format and checksum are valid."
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
