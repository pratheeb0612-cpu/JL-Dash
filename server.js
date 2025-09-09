const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// IMPORTANT: Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Data storage (in production, use a proper database)
let dashboardData = {};
const dataFilePath = path.join(__dirname, 'data', 'dashboard_data.json');

// Admin credentials (in production, store in database with proper hashing)
const ADMIN_PASSWORD = 'admin123';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize data storage
async function initializeDataStorage() {
  try {
    await fs.mkdir('data', { recursive: true });
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('templates', { recursive: true });
    
    try {
      const data = await fs.readFile(dataFilePath, 'utf8');
      dashboardData = JSON.parse(data);
      console.log('✅ Dashboard data loaded successfully');
    } catch (error) {
      // File doesn't exist, initialize with empty data
      dashboardData = {};
      await saveDashboardData();
      console.log('📁 Created new dashboard data file');
    }
  } catch (error) {
    console.error('Error initializing data storage:', error);
  }
}

// Save dashboard data to file
async function saveDashboardData() {
  try {
    await fs.writeFile(dataFilePath, JSON.stringify(dashboardData, null, 2));
  } catch (error) {
    console.error('Error saving dashboard data:', error);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Entity configurations
const entities = [
  { 
    id: 'janashakthi-limited', 
    name: 'Janashakthi Limited', 
    shortName: 'JXG',
    description: 'Parent Entity'
  },
  { 
    id: 'janashakthi-insurance', 
    name: 'Janashakthi Insurance PLC', 
    shortName: 'JINS',
    description: 'Life Insurance'
  },
  { 
    id: 'first-capital', 
    name: 'First Capital Holdings PLC', 
    shortName: 'FCH',
    description: 'Investment Banking'
  },
  { 
    id: 'janashakthi-finance', 
    name: 'Janashakthi Finance PLC', 
    shortName: 'JF',
    description: 'Non-Financial Banking'
  }
];

// Enhanced KPI Templates for each entity
const kpiTemplates = {
  'janashakthi-limited': [
    { name: 'Profit Before Tax', unit: 'LKR Mn' },
    { name: 'Finance Cost', unit: 'LKR Mn' },
    { name: 'Share of Profit from Subsidiaries', unit: 'LKR Mn' },
    { name: 'Debt to Equity Ratio', unit: 'x' },
    { name: 'ROE Annualized', unit: '%' },
    { name: 'Total Assets', unit: 'LKR Mn' },
    { name: 'Equity', unit: 'LKR Mn' },
    { name: 'Staff Count', unit: '' }
  ],
  'janashakthi-insurance': [
    { name: 'PAT', unit: 'LKR Mn' },
    { name: 'Gross Written Premium (GWP)', unit: 'LKR Mn' },
    { name: 'Total Assets', unit: 'LKR Mn' },
    { name: 'Investments', unit: 'LKR Mn' },
    { name: 'NAV', unit: 'LKR Mn' },
    { name: 'Total Liabilities', unit: 'LKR Mn' },
    { name: 'Insurance Provisions', unit: 'LKR Mn' },
    { name: 'ROE Annualized', unit: '%' },
    { name: 'Acquisition Cost as % of FYP', unit: '%' },
    { name: 'Cost + Claims + OH as % of GWP', unit: '%' },
    { name: 'Branches', unit: '' },
    { name: 'Staff Count', unit: '' }
  ],
  'first-capital': [
    { name: 'PAT', unit: 'LKR Mn' },
    { name: 'Total Assets', unit: 'LKR Mn' },
    { name: 'Financial Assets', unit: 'LKR Mn' },
    { name: 'Total Liabilities', unit: 'LKR Mn' },
    { name: 'Securities Sold', unit: 'LKR Mn' },
    { name: 'NAV', unit: 'LKR Mn' },
    { name: 'Investment Impairment', unit: 'LKR Mn' },
    { name: 'Debt to Equity Ratio', unit: 'x' },
    { name: 'ROI', unit: '%' },
    { name: 'PBT', unit: 'LKR Mn' },
    { name: 'ROE Annualized', unit: '%' },
    { name: 'ROA Annualized', unit: '%' },
    { name: 'Net Interest Income / Total Interest Income', unit: '%' },
    { name: 'Operating Cost to Income', unit: '%' }
  ],
  'janashakthi-finance': [
    { name: 'PAT', unit: 'LKR Mn' },
    { name: 'Total Assets', unit: 'LKR Mn' },
    { name: 'Fixed & Savings Deposits', unit: 'LKR Mn' },
    { name: 'Total Liabilities', unit: 'LKR Mn' },
    { name: 'Loans & Advances', unit: 'LKR Mn' },
    { name: 'NAV', unit: 'LKR Mn' },
    { name: 'Debt to Equity Ratio', unit: 'x' },
    { name: 'ROE Annualized', unit: '%' },
    { name: 'ROA Annualized', unit: '%' },
    { name: 'Net Interest Margin', unit: '%' },
    { name: 'Cost of Borrowings', unit: '%' },
    { name: 'Cost to Income Ratio', unit: '%' },
    { name: 'Branches', unit: '' },
    { name: 'Staff Count', unit: '' }
  ]
};

// Chart Templates for each entity
const chartTemplates = {
  'janashakthi-limited': {
    'Share Composition': [
      ['Subsidiary', 'Share of Profits'],
      ['Janashakthi Insurance PLC', ''],
      ['First Capital Holdings PLC', ''],
      ['Janashakthi Finance PLC', '']
    ],
    'Overheads vs Budget': [
      ['Category', 'Actual', 'Budget'],
      ['Staff Cost', '', ''],
      ['Admin Cost', '', ''],
      ['Marketing', '', ''],
      ['Professional Charges', '', '']
    ],
    'WACD Movement': [
      ['Month', 'WACD Actual', 'AWPLR Budget'],
      ['Jan-25', '', ''],
      ['Feb-25', '', ''],
      ['Mar-25', '', ''],
      ['Apr-25', '', ''],
      ['May-25', '', ''],
      ['Jun-25', '', '']
    ],
    'Maturity Profile': [
      ['Period', 'Amount'],
      ['0-3 Months', ''],
      ['3-6 Months', ''],
      ['6-12 Months', ''],
      ['1-2 Years', ''],
      ['3-6 Years', '']
    ]
  },
  'janashakthi-insurance': {
    'Retail Business FYP': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'JSV FYP': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'DTA FYP': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'Renewal Premium': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'UL CR vs UL FY': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'Surplus Actual vs Budget': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ]
  },
  'first-capital': {
    'Net Income vs Budget': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'Trading Composition': [
      ['Segment', 'Amount'],
      ['Primary Dealing', ''],
      ['Dealing Securities', ''],
      ['Corporate Finance', ''],
      ['Asset Management', ''],
      ['Stock Brokering', '']
    ],
    'Overheads vs Budget': [
      ['Category', 'Actual', 'Budget'],
      ['Staff Cost', '', ''],
      ['Admin Cost', '', ''],
      ['Marketing', '', ''],
      ['Professional Charges', '', '']
    ],
    'Unit Trust AUM': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'WM AUM': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'Portfolio Management': [
      ['Month', 'Actual'],
      ['Jun-25', ''],
      ['Jul-25', ''],
      ['Aug-25', '']
    ],
    'Treasuries Data': [
      ['Month', 'T-Bills', 'Outright Sale', 'Gov Securities'],
      ['Jun-25', '', '', ''],
      ['Jul-25', '', '', ''],
      ['Aug-25', '', '', '']
    ],
    'Dealing Securities': [
      ['Category', 'Jun-25', 'Jul-25', 'Aug-25'],
      ['Investment in Corporate & Gov Debts', '', '', ''],
      ['MTM Gain/Loss on Corporate & Gov. Debts', '', '', ''],
      ['Investment in Listed Equity Securities FVTPL', '', '', ''],
      ['MTM Gain/Loss on Listed Equity Securities FVTPL', '', '', ''],
      ['Investment in Listed Equity Securities FVTOCI', '', '', ''],
      ['MTM Gain/Loss on Listed Equity Securities FVTOCI', '', '', ''],
      ['Value of Debt Mandates executed for the Month', '', '', '']
    ],
    'FCE Market Turnover': [
      ['Metric', 'Jun-25', 'Jul-25', 'Aug-25'],
      ['Volume %', '', '', ''],
      ['Commission %', '', '', '']
    ]
  },
  'janashakthi-finance': {
    'Net Interest Income vs Budget': [
      ['Month', 'Actual', 'Budget'],
      ['Jun-25', '', ''],
      ['Jul-25', '', ''],
      ['Aug-25', '', '']
    ],
    'Loan Composition': [
      ['Segment', 'Amount'],
      ['Factoring', ''],
      ['Gold Loans', ''],
      ['Leasing', ''],
      ['Loans', ''],
      ['Ijara', '']
    ],
    'Overheads vs Budget': [
      ['Category', 'Actual', 'Budget'],
      ['Staff Cost', '', ''],
      ['Admin Cost', '', ''],
      ['Marketing', '', ''],
      ['Professional Charges', '', '']
    ],
    'Business Activity': [
      ['Month', 'New FDs', 'FDs Withdrawn', 'Other Loans', 'Gold Loans'],
      ['Jun-25', '', '', '', ''],
      ['Jul-25', '', '', '', ''],
      ['Aug-25', '', '', '', '']
    ]
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    dataStatus: Object.keys(dashboardData).length > 0 ? 'Loaded' : 'Empty'
  });
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, message: 'Authentication successful' });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get all dashboard data
app.get('/api/dashboard-data', (req, res) => {
  console.log('📊 Dashboard data requested, available periods:', Object.keys(dashboardData));
  res.json(dashboardData);
});

// Get specific entity data for a period
app.get('/api/dashboard-data/:entity/:month/:year', (req, res) => {
  const { entity, month, year } = req.params;
  
  const periodKey = `${month}-${year}`;
  const data = dashboardData[periodKey]?.[entity];
  
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Data not found for specified period and entity' });
  }
});

// Get available periods
app.get('/api/periods', (req, res) => {
  const periods = Object.keys(dashboardData).map(periodKey => {
    const [month, year] = periodKey.split('-');
    return { month, year, key: periodKey };
  });
  
  res.json(periods);
});

// Debug endpoint to check specific entity data
app.get('/api/debug/:entity/:month/:year', (req, res) => {
  const { entity, month, year } = req.params;
  const periodKey = `${month}-${year}`;
  const data = dashboardData[periodKey]?.[entity];
  
  console.log(`🔍 Debug request for ${entity} ${periodKey}`);
  console.log('Available data keys:', data ? Object.keys(data) : 'No data found');
  
  if (entity === 'janashakthi-limited' && data) {
    console.log('WACD Movement data:', data.wacdMovement);
  }
  
  res.json({
    entity,
    period: periodKey,
    dataKeys: data ? Object.keys(data) : [],
    wacdMovement: data?.wacdMovement || null,
    fullData: data
  });
});

// Get entities
app.get('/api/entities', (req, res) => {
  res.json(entities);
});

// Enhanced Download template with all chart data
app.get('/api/template/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const entity = entities.find(e => e.id === entityId);
    
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const kpiTemplate = kpiTemplates[entityId];
    const chartTemplate = chartTemplates[entityId];
    
    if (!kpiTemplate) {
      return res.status(404).json({ error: 'Template not found for entity' });
    }

    // Create Excel workbook
    const workbook = xlsx.utils.book_new();
    
    // 1. KPI Sheet
    const kpiData = [
      ['KPI Name', 'Actual Value', 'Budget Value', 'Unit'],
      ...kpiTemplate.map(kpi => [kpi.name, '', '', kpi.unit])
    ];
    
    const kpiSheet = xlsx.utils.aoa_to_sheet(kpiData);
    xlsx.utils.book_append_sheet(workbook, kpiSheet, 'KPIs');

    // 2. Chart Sheets
    if (chartTemplate) {
      Object.entries(chartTemplate).forEach(([sheetName, sheetData]) => {
        const chartSheet = xlsx.utils.aoa_to_sheet(sheetData);
        xlsx.utils.book_append_sheet(workbook, chartSheet, sheetName);
      });
    }

    // 3. Instructions Sheet
    const instructionsData = [
      ['Janashakthi Dashboard Template Instructions'],
      [''],
      ['How to use this template:'],
      ['1. Fill in all the data in each sheet'],
      ['2. KPIs sheet: Enter actual and budget values'],
      ['3. Chart sheets: Enter monthly data for line charts'],
      ['4. Save the file and upload through Admin Panel'],
      ['5. Dashboard will automatically update with your data'],
      [''],
      ['Important Notes:'],
      ['- Do not change column headers'],
      ['- Use numeric values only (no text in value fields)'],
      ['- Month format: Jun-25, Jul-25, Aug-25'],
      ['- Leave budget blank if not applicable'],
      [''],
      [`Template for: ${entity.name} (${entity.shortName})`,],
      [`Generated: ${new Date().toISOString().split('T')[0]}`]
    ];
    
    const instructionsSheet = xlsx.utils.aoa_to_sheet(instructionsData);
    xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    // Generate file
    const fileName = `${entity.shortName}_Complete_Template_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, 'templates', fileName);
    
    xlsx.writeFile(workbook, filePath);
    
    console.log(`📋 Generated complete template for ${entity.shortName} with ${Object.keys(chartTemplate || {}).length + 1} sheets`);
    
    res.download(filePath, `${entity.shortName}_Template_Complete.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
      }
      // Clean up temporary file
      fs.unlink(filePath).catch(console.error);
    });

  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Enhanced Upload data with chart data processing
app.post('/api/upload', authenticateToken, upload.single('dataFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { entityId, month, year } = req.body;
    
    if (!entityId || !month || !year) {
      return res.status(400).json({ error: 'Entity ID, month, and year are required' });
    }

    const entity = entities.find(e => e.id === entityId);
    if (!entity) {
      return res.status(400).json({ error: 'Invalid entity ID' });
    }

    // Read and parse Excel file
    const workbook = xlsx.readFile(req.file.path);
    const data = {};

    console.log(`📊 Processing upload for ${entity.shortName}, available sheets:`, workbook.SheetNames);

    // Parse KPI data
    if (workbook.SheetNames.includes('KPIs')) {
      const kpiSheet = workbook.Sheets['KPIs'];
      const kpiData = xlsx.utils.sheet_to_json(kpiSheet, { header: 1 });
      
      data.kpis = [];
      
      // Skip header row
      for (let i = 1; i < kpiData.length; i++) {
        const row = kpiData[i];
        if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
          data.kpis.push({
            name: row[0],
            actual: parseFloat(row[1]) || null,
            budget: parseFloat(row[2]) || null,
            unit: row[3] || ''
          });
        }
      }
      console.log(`✅ KPIs processed: ${data.kpis.length} entries`);
    }

    // Parse Chart data for each entity
    if (entityId === 'janashakthi-limited') {
      console.log(`🔍 Processing Janashakthi Limited charts...`);
      
      // Check for WACD Movement sheet specifically
      if (workbook.SheetNames.includes('WACD Movement')) {
        console.log(`✅ Found 'WACD Movement' sheet`);
      } else {
        console.log(`❌ 'WACD Movement' sheet not found. Available sheets:`, workbook.SheetNames);
      }
      // Share Composition
      if (workbook.SheetNames.includes('Share Composition')) {
        const sheet = workbook.Sheets['Share Composition'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.shareComposition = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            data.shareComposition.push({
              name: row[0],
              value: parseFloat(row[1]) || 0,
              color: ['#8B5CF6', '#06B6D4', '#10B981'][i-1]
            });
          }
        }
      }

      // Overheads vs Budget
      if (workbook.SheetNames.includes('Overheads vs Budget')) {
        const sheet = workbook.Sheets['Overheads vs Budget'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.overheads = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.overheads.push({
              name: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }
      }

      // WACD Movement - Check for exact match and variations
      const wacdSheetNames = ['WACD Movement', 'WACD vs AWPLR', 'WACD', 'WACD_Movement'];
      let wacdSheetName = null;
      
      for (const name of wacdSheetNames) {
        if (workbook.SheetNames.includes(name)) {
          wacdSheetName = name;
          break;
        }
      }
      
      // Also check for case-insensitive match
      if (!wacdSheetName) {
        wacdSheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().includes('wacd') || 
          name.toLowerCase().includes('awplr')
        );
      }
      
      if (wacdSheetName) {
        console.log(`✅ Found WACD sheet: "${wacdSheetName}"`);
        const sheet = workbook.Sheets[wacdSheetName];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.wacdMovement = [];
        console.log(`📊 Raw WACD sheet data:`, sheetData);
        
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          console.log(`Processing row ${i}:`, row);
          if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
            const wacdEntry = {
              month: String(row[0]).trim(),
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            };
            data.wacdMovement.push(wacdEntry);
            console.log(`📈 Added WACD Entry:`, wacdEntry);
          }
        }
        console.log(`✅ WACD Movement processed: ${data.wacdMovement.length} entries`);
        console.log(`📋 Final WACD data:`, JSON.stringify(data.wacdMovement, null, 2));
      } else {
        console.log(`❌ No WACD sheet found. Available sheets:`, workbook.SheetNames);
      }

      // Maturity Profile
      if (workbook.SheetNames.includes('Maturity Profile')) {
        const sheet = workbook.Sheets['Maturity Profile'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.maturityProfile = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            data.maturityProfile.push({
              name: row[0],
              value: parseFloat(row[1]) || 0,
              color: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i-1]
            });
          }
        }
      }
    }

    if (entityId === 'janashakthi-insurance') {
      // Process all line chart data for JINS
      const chartSheets = ['Retail Business FYP', 'JSV FYP', 'DTA FYP', 'Renewal Premium', 'UL CR vs UL FY', 'Surplus Actual vs Budget'];
      const chartKeys = ['retailBusinessFYP', 'jsvFYP', 'dtaFYP', 'renewalPremium', 'ulCreditRating', 'surplusActual'];
      
      chartSheets.forEach((sheetName, index) => {
        if (workbook.SheetNames.includes(sheetName)) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          data[chartKeys[index]] = [];
          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (row[0]) {
              data[chartKeys[index]].push({
                month: row[0],
                actual: parseFloat(row[1]) || 0,
                budget: parseFloat(row[2]) || 0
              });
            }
          }
        }
      });
    }

    if (entityId === 'first-capital') {
      // Net Income vs Budget
      if (workbook.SheetNames.includes('Net Income vs Budget')) {
        const sheet = workbook.Sheets['Net Income vs Budget'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.netIncomeAgainstBudget = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.netIncomeAgainstBudget.push({
              month: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }
      }

      // Trading Composition
      if (workbook.SheetNames.includes('Trading Composition')) {
        const sheet = workbook.Sheets['Trading Composition'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.tradingComposition = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            data.tradingComposition.push({
              name: row[0],
              value: parseFloat(row[1]) || 0,
              color: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i-1]
            });
          }
        }
      }

      // Other FCH charts
      const fchChartSheets = ['Unit Trust AUM', 'WM AUM', 'Portfolio Management'];
      const fchChartKeys = ['unitTrustAUM', 'wmAUM', 'portfolioManagement'];
      
      fchChartSheets.forEach((sheetName, index) => {
        if (workbook.SheetNames.includes(sheetName)) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          data[fchChartKeys[index]] = [];
          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (row[0]) {
              data[fchChartKeys[index]].push({
                month: row[0],
                actual: parseFloat(row[1]) || 0,
                budget: parseFloat(row[2]) || 0
              });
            }
          }
        }
      });

      // Overheads vs Budget for FCH
      if (workbook.SheetNames.includes('Overheads vs Budget')) {
        const sheet = workbook.Sheets['Overheads vs Budget'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.overheadsAgainstBudget = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.overheadsAgainstBudget.push({
              name: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }
      }

      // Treasuries Data
      if (workbook.SheetNames.includes('Treasuries Data')) {
        const sheet = workbook.Sheets['Treasuries Data'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.treasuriesData = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.treasuriesData.push({
              month: row[0],
              tBills: parseFloat(row[1]) || 0,
              outrightSale: parseFloat(row[2]) || 0,
              govSecurities: parseFloat(row[3]) || 0
            });
          }
        }
      }

      // Dealing Securities
      if (workbook.SheetNames.includes('Dealing Securities')) {
        const sheet = workbook.Sheets['Dealing Securities'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.dealingSecurities = [];
        const headerRow = sheetData[0];
        const month1Label = headerRow[1] || 'Month 1';
        const month2Label = headerRow[2] || 'Month 2'; 
        const month3Label = headerRow[3] || 'Month 3';

        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.dealingSecurities.push({
              category: row[0],
              month1: parseFloat(row[1]) || 0,
              month2: parseFloat(row[2]) || 0,
              month3: parseFloat(row[3]) || 0,
              month1Label: month1Label,
              month2Label: month2Label,
              month3Label: month3Label
            });
          }
        }
      }

      // Market Turnover
      if (workbook.SheetNames.includes('FCE Market Turnover') || workbook.SheetNames.includes('Market Turnover')) {
        const sheetName = workbook.SheetNames.includes('FCE Market Turnover') ? 'FCE Market Turnover' : 'Market Turnover';
        const sheet = workbook.Sheets[sheetName];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        console.log(`📊 Processing ${sheetName} sheet data:`, sheetData);

        data.fceMarketTurnover = {
          jun: { volume: '0%', commission: '0%' },
          jul: { volume: '0%', commission: '0%' },
          aug: { volume: '0%', commission: '0%' }
       };
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          const metric = row[0] ? String(row[0]).toLowerCase().trim() : '';

          if (metric.includes('volume')) {
            data.fceMarketTurnover.jun.volume = row[1] ? `${row[1]}%` : '0%';
            data.fceMarketTurnover.jul.volume = row[2] ? `${row[2]}%` : '0%';
            data.fceMarketTurnover.aug.volume = row[3] ? `${row[3]}%` : '0%';
          } else if (metric.includes('commission')) {

            data.fceMarketTurnover.jun.commission = row[1] ? `${row[1]}%` : '0%';
            data.fceMarketTurnover.jul.commission = row[2] ? `${row[2]}%` : '0%';
            data.fceMarketTurnover.aug.commission = row[3] ? `${row[3]}%` : '0%';
          }
        }
        console.log(`✅ FCE Market Turnover processed:`, data.fceMarketTurnover);
      }
    }

    if (entityId === 'janashakthi-finance') {
      // Net Interest Income vs Budget
      if (workbook.SheetNames.includes('Net Interest Income vs Budget')) {
        const sheet = workbook.Sheets['Net Interest Income vs Budget'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.netInterestIncomeAgainstBudget = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.netInterestIncomeAgainstBudget.push({
              month: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }
      }

      // Loan Composition
      if (workbook.SheetNames.includes('Loan Composition')) {
        const sheet = workbook.Sheets['Loan Composition'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.loanComposition = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            data.loanComposition.push({
              name: row[0],
              value: parseFloat(row[1]) || 0,
              color: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i-1]
            });
          }
        }
      }

      // Overheads vs Budget for JF
      if (workbook.SheetNames.includes('Overheads vs Budget')) {
        const sheet = workbook.Sheets['Overheads vs Budget'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.overheadsAgainstBudget = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.overheadsAgainstBudget.push({
              name: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }
      }

      // Business Activity
      if (workbook.SheetNames.includes('Business Activity')) {
        const sheet = workbook.Sheets['Business Activity'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.businessActivity = [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0]) {
            data.businessActivity.push({
              month: row[0],
              newFDs: parseFloat(row[1]) || 0,
              fdsWithdrawn: parseFloat(row[2]) || 0,
              otherLoans: parseFloat(row[3]) || 0,
              goldLoans: parseFloat(row[4]) || 0
            });
          }
        }
      }
    }

    // Store the data
    const periodKey = `${month}-${year}`;
    if (!dashboardData[periodKey]) {
      dashboardData[periodKey] = {};
    }
    
    dashboardData[periodKey][entityId] = data;
    
    // Save to file
    await saveDashboardData();
    
    // Clean up uploaded file
    await fs.unlink(req.file.path);
    
    console.log(`✅ Data uploaded successfully for ${entity.shortName} - ${month} ${year}`);
    console.log(`📊 KPIs processed: ${data.kpis?.length || 0}`);
    console.log(`📈 WACD entries: ${data.wacdMovement?.length || 0}`);
    console.log(`🔍 All data keys:`, Object.keys(data));
    
    if (data.wacdMovement && data.wacdMovement.length > 0) {
      console.log(`📋 WACD sample:`, data.wacdMovement[0]);
    }
    
    res.json({ 
      message: 'Data uploaded successfully',
      entity: entity.shortName,
      period: `${month}-${year}`,
      kpiCount: data.kpis?.length || 0,
      wacdCount: data.wacdMovement?.length || 0,
      chartsProcessed: Object.keys(data).filter(key => key !== 'kpis').length,
      dataKeys: Object.keys(data)
    });

  } catch (error) {
    console.error('Error processing upload:', error);
    
    // Clean up file if it exists
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process uploaded data',
      details: error.message 
    });
  }
});

// Delete data for a specific period and entity
app.delete('/api/dashboard-data/:entity/:month/:year', authenticateToken, async (req, res) => {
  try {
    const { entity, month, year } = req.params;
    const periodKey = `${month}-${year}`;
    
    if (dashboardData[periodKey] && dashboardData[periodKey][entity]) {
      delete dashboardData[periodKey][entity];
      
      // If no entities left for this period, delete the period
      if (Object.keys(dashboardData[periodKey]).length === 0) {
        delete dashboardData[periodKey];
      }
      
      await saveDashboardData();
      
      res.json({ message: 'Data deleted successfully' });
    } else {
      res.status(404).json({ error: 'Data not found' });
    }
  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Initialize and start server
initializeDataStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
    console.log(`🔑 Admin panel available at http://localhost:${PORT}/admin.html`);
    console.log(`📋 API health check: http://localhost:${PORT}/api/health`);
  });
}).catch(error => {
  console.error('❌ Failed to initialize server:', error);
  process.exit(1);
});