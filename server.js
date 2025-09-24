const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Import database connection and models
const db = require('./database/connection');
const { User, Dashboard } = require('./models');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'janashakthi-super-secret-jwt-key-2024-production';

// Middleware
app.use(cors());
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.json());

// Rate limiting setup
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too many login attempts, please try again in 15 minutes',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

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

// Initialize database storage
async function initializeDatabaseStorage() {
  try {
    await db.init();
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('templates', { recursive: true });
    
    console.log('Database connection initialized successfully');
    console.log('Upload directories created');
    
  } catch (error) {
    console.error('Error initializing database storage:', error);
    throw error;
  }
}

// Email validation helper
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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

// Public access middleware (checks if any users exist)
const requireRegistration = async (req, res, next) => {
  try {
    const userCount = await User.count();
    
    // If no users exist, allow access (first-time setup)
    if (userCount === 0) {
      req.isSetup = true;
      return next();
    }

    // If users exist, require authentication
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        requiresLogin: true 
      });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ 
          error: 'Invalid token',
          requiresLogin: true 
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Database error in requireRegistration:', error);
    res.status(500).json({ error: 'Database connection error' });
  }
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

// KPI Templates
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

// excel update validation
function validateEntityByFilename(filename, selectedEntityId) {
  const lowerFilename = filename.toLowerCase();
  
  // Define entity identifiers that should appear in filenames
  const entityPatterns = {
    'janashakthi-limited': ['janashakthi limited', 'jxg', 'janashakthi_limited', 'janashakthi-limited'],
    'janashakthi-insurance': ['janashakthi insurance', 'jins', 'janashakthi_insurance', 'janashakthi-insurance'],
    'first-capital': ['first capital', 'fch', 'first_capital', 'first-capital'],
    'janashakthi-finance': ['janashakthi finance', 'jf', 'janashakthi_finance', 'janashakthi-finance']
  };

  // Check if filename contains patterns for selected entity
  const selectedPatterns = entityPatterns[selectedEntityId] || [];
  const isValidForSelected = selectedPatterns.some(pattern => 
    lowerFilename.includes(pattern.toLowerCase())
  );

  // Find which entity the filename actually matches
  let detectedEntity = null;
  for (const [entityId, patterns] of Object.entries(entityPatterns)) {
    if (patterns.some(pattern => lowerFilename.includes(pattern.toLowerCase()))) {
      detectedEntity = entityId;
      break;
    }
  }

  return {
    isValid: isValidForSelected,
    detectedEntity,
    selectedEntity: selectedEntityId,
    detectedEntityName: entities.find(e => e.id === detectedEntity)?.name || 'Unknown',
    selectedEntityName: entities.find(e => e.id === selectedEntityId)?.name || 'Unknown'
  };
}


// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    dataSource: 'Database'
  });
});

// Check authentication status
app.get('app.github.dev/api/auth/status', async (req, res) => {
  try {
    const userCount = await User.count();
    const hasUsers = userCount > 0;
    
    if (!hasUsers) {
      return res.json({ 
        requiresSetup: true,
        message: 'No users registered. First user will become admin.' 
      });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.json({ 
        requiresLogin: true,
        message: 'Please login to continue' 
      });
    }
    
    jwt.verify(token, JWT_SECRET, async (err, tokenUser) => {
      if (err) {
        return res.json({ 
          requiresLogin: true,
          message: 'Session expired. Please login again.' 
        });
      }
      
      const user = await User.findByEmail(tokenUser.email);
      if (!user) {
        return res.json({ 
          requiresLogin: true,
          message: 'User not found. Please login again.' 
        });
      }
      
      res.json({ 
        authenticated: true,
        user: { email: user.email, name: user.name, role: user.role }
      });
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// User registration
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Determine role (first user becomes admin)
    const userCount = await User.count();
    const role = userCount === 0 ? 'admin' : 'user';

    // Create user
    const user = await User.create({ email, name, password, role });

    // Generate token
    const token = jwt.sign(
      { email: user.email, role: user.role, name: user.name }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    console.log(`New ${role} registered: ${email}`);

    res.json({ 
      token,
      user: { email: user.email, name: user.name, role: user.role },
      message: role === 'admin' ? 'Welcome! You are now the admin.' : 'Registration successful'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await User.validatePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Generate token
    const token = jwt.sign(
      { email: user.email, role: user.role, name: user.name }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    console.log(`User logged in: ${email}`);

    res.json({ 
      token, 
      user: { email: user.email, name: user.name, role: user.role },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get all dashboard data
app.get('/api/dashboard-data', requireRegistration, async (req, res) => {
  try {
    console.log('Dashboard data requested from database');
    const data = await Dashboard.getAllData();
    console.log('Available periods:', Object.keys(data));
    res.json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get specific entity data for a period
app.get('/api/dashboard-data/:entity/:month/:year', requireRegistration, async (req, res) => {
  try {
    const { entity, month, year } = req.params;
    
    const period = await Dashboard.createOrGetPeriod(month, parseInt(year));
    if (!period) {
      return res.status(404).json({ error: 'Period not found' });
    }

    const kpis = await Dashboard.getKPIsByEntityAndPeriod(entity, period.id);
    const chartData = await Dashboard.getChartData(entity, period.id);
    
    const data = {
      kpis,
      ...chartData
    };
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching entity data:', error);
    res.status(500).json({ error: 'Failed to fetch entity data' });
  }
});

// Get available periods
app.get('/api/periods', requireRegistration, async (req, res) => {
  try {
    const query = 'SELECT period_key, month, year FROM periods ORDER BY year DESC, month DESC';
    const result = await db.query(query);
    
    const periods = result.rows.map(row => ({
      month: row.month,
      year: row.year,
      key: row.period_key
    }));
    
    res.json(periods);
  } catch (error) {
    console.error('Error fetching periods:', error);
    res.status(500).json({ error: 'Failed to fetch periods' });
  }
});

// Get entities
app.get('/api/entities', requireRegistration, (req, res) => {
  res.json(entities);
});

// Serve index.html at root
app.get('/', requireRegistration, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Download template
app.get('/api/template/:entityId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for template download' });
    }
    const { entityId } = req.params;
    const entity = entities.find(e => e.id === entityId);
    
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const kpiTemplate = kpiTemplates[entityId];
    
    if (!kpiTemplate) {
      return res.status(404).json({ error: 'Template not found for entity' });
    }

    // Create Excel workbook
    const workbook = xlsx.utils.book_new();
    
    // KPI Sheet
    const kpiData = [
      ['KPI Name', 'Actual Value', 'Budget Value', 'Unit'],
      ...kpiTemplate.map(kpi => [kpi.name, '', '', kpi.unit])
    ];
    
    const kpiSheet = xlsx.utils.aoa_to_sheet(kpiData);
    xlsx.utils.book_append_sheet(workbook, kpiSheet, 'KPIs');

    // Entity-specific sheets
    if (entityId === 'janashakthi-limited') {
      // Share Composition Sheet
      const shareCompositionData = [
        ['Entity', 'Percentage'],
        ['Janashakthi Insurance PLC', ''],
        ['First Capital Holdings PLC', ''],
        ['Janashakthi Finance PLC', '']
      ];
      const shareSheet = xlsx.utils.aoa_to_sheet(shareCompositionData);
      xlsx.utils.book_append_sheet(workbook, shareSheet, 'Share Composition');

      // Overheads Sheet
      const overheadsData = [
        ['Category', 'Actual', 'Budget'],
        ['Staff Cost', '', ''],
        ['Admin Cost', '', ''],
        ['Marketing', '', ''],
        ['Professional Charges', '', '']
      ];
      const overheadsSheet = xlsx.utils.aoa_to_sheet(overheadsData);
      xlsx.utils.book_append_sheet(workbook, overheadsSheet, 'Overheads');

      // WACD Movement Sheet
      const wacdData = [
        ['Month', 'Actual', 'Budget'],
        ['24-Aug', '', ''],
        ['24-Sep', '', ''],
        ['24-Oct', '', ''],
        ['24-Nov', '', ''],
        ['24-Dec', '', '']
      ];
      const wacdSheet = xlsx.utils.aoa_to_sheet(wacdData);
      xlsx.utils.book_append_sheet(workbook, wacdSheet, 'WACD Movement');

      // Maturity Profile Sheet
      const maturityProfileData = [
        ['Period', 'Amount'],
        ['0-3 Months', ''],
        ['3-6 Months', ''],
        ['6-12 Months', ''],
        ['1-2 Years', ''],
        ['3-6 Years', '']
      ];
      const maturitySheet = xlsx.utils.aoa_to_sheet(maturityProfileData);
      xlsx.utils.book_append_sheet(workbook, maturitySheet, 'Maturity Profile');

    } else if (entityId === 'janashakthi-insurance') {
      // Insurance-specific sheets
      const insuranceSheets = [
        { name: 'Retail Business FYP', headers: ['Month', 'Actual', 'Budget'] },
        { name: 'JSV FYP', headers: ['Month', 'Actual', 'Budget'] },
        { name: 'DTA FYP', headers: ['Month', 'Actual', 'Budget'] },
        { name: 'Renewal Premium', headers: ['Month', 'Actual', 'Budget'] },
        { name: 'UL Credit Rating', headers: ['Month', 'Actual', 'Budget'] },
        { name: 'Surplus Actual', headers: ['Month', 'Actual', 'Budget'] }
      ];

      insuranceSheets.forEach(sheetConfig => {
        const data = [
          sheetConfig.headers,
          ['25-Apr', '', ''],
          ['25-May', '', ''],
          ['25-Jun', '', ''],
          ['25-Jul', '', ''],
          ['25-Aug', '', '']
        ];
        const sheet = xlsx.utils.aoa_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, sheet, sheetConfig.name);
      });

    } else if (entityId === 'first-capital') {
      // First Capital-specific sheets
      
      // Net Income Against Budget
      const netIncomeData = [
        ['Month', 'Actual', 'Budget'],
        ['25-Jun', '', ''],
        ['25-Jul', '', ''],
        ['25-Aug', '', '']
      ];
      const netIncomeSheet = xlsx.utils.aoa_to_sheet(netIncomeData);
      xlsx.utils.book_append_sheet(workbook, netIncomeSheet, 'Net Income Against Budget');

      // Trading Composition
      const tradingCompositionData = [
        ['Business Line', 'Value'],
        ['Primary Dealing', ''],
        ['Dealing Securities', ''],
        ['Corporate Finance', ''],
        ['Asset Management', ''],
        ['Stock Brokering', '']
      ];
      const tradingSheet = xlsx.utils.aoa_to_sheet(tradingCompositionData);
      xlsx.utils.book_append_sheet(workbook, tradingSheet, 'Trading Composition');

      // Overheads Against Budget
      const overheadsData = [
        ['Category', 'Actual', 'Budget'],
        ['Staff Cost', '', ''],
        ['Admin Cost', '', ''],
        ['Marketing', '', ''],
        ['Professional Charges', '', '']
      ];
      const overheadsSheet = xlsx.utils.aoa_to_sheet(overheadsData);
      xlsx.utils.book_append_sheet(workbook, overheadsSheet, 'Overheads Against Budget');

      // Unit Trust AUM
      const unitTrustData = [
        ['Month', 'Actual', 'Budget'],
        ['25-Jun', '', ''],
        ['25-Jul', '', ''],
        ['25-Aug', '', '']
      ];
      const unitTrustSheet = xlsx.utils.aoa_to_sheet(unitTrustData);
      xlsx.utils.book_append_sheet(workbook, unitTrustSheet, 'Unit Trust AUM');

      // WM AUM
      const wmAumData = [
        ['Month', 'Actual', 'Budget'],
        ['25-Jun', '', ''],
        ['25-Jul', '', ''],
        ['25-Aug', '', '']
      ];
      const wmAumSheet = xlsx.utils.aoa_to_sheet(wmAumData);
      xlsx.utils.book_append_sheet(workbook, wmAumSheet, 'WM AUM');

      // Treasuries
      const treasuriesData = [
        ['Month', 'T-Bills', 'Outright Sale', 'Gov Securities'],
        ['Jun-25', '', '', ''],
        ['Jul-25', '', '', ''],
        ['Aug-25', '', '', '']
      ];
      const treasuriesSheet = xlsx.utils.aoa_to_sheet(treasuriesData);
      xlsx.utils.book_append_sheet(workbook, treasuriesSheet, 'Treasuries');

      // Dealing Securities
      const dealingSecuritiesData = [
        ['Category', 'Jun', 'Jul', 'Aug'],
        ['Investment in Corporate & Gov Debts', '', '', ''],
        ['MTM Gain/Loss on Corporate & Gov. Debts', '', '', ''],
        ['Investment in Listed Equity Securities FVTPL', '', '', ''],
        ['MTM Gain/Loss on Listed Equity Securities FVTPL', '', '', ''],
        ['Investment in Listed Equity Securities FVTOCI', '', '', ''],
        ['MTM Gain/Loss on Listed Equity Securities FVTOCI', '', '', ''],
        ['Value of Debt Mandates executed for the Month', '', '', '']
      ];
      const dealingSheet = xlsx.utils.aoa_to_sheet(dealingSecuritiesData);
      xlsx.utils.book_append_sheet(workbook, dealingSheet, 'Dealing Securities');

      // FCE's Market Turnover
      const fceMarketTurnoverData = [
        ['Metric', '25-Jun', '25-Jul', '25-Aug'],
        ['Volume %', '', '', ''],
        ['Commission %', '', '', '']
      ];
      const fceMarketSheet = xlsx.utils.aoa_to_sheet(fceMarketTurnoverData);
      xlsx.utils.book_append_sheet(workbook, fceMarketSheet, "FCE's Market Turnover");

      // Portfolio Management
      const portfolioData = [
        ['Month', 'Value'],
        ['25-Jun', ''],
        ['25-Jul', ''],
        ['25-Aug', '']
      ];
      const portfolioSheet = xlsx.utils.aoa_to_sheet(portfolioData);
      xlsx.utils.book_append_sheet(workbook, portfolioSheet, 'Portfolio Management');

    } else if (entityId === 'janashakthi-finance') {
      // Finance-specific sheets
      
      // Net Interest Income Against Budget
      const netInterestData = [
        ['Month', 'Actual', 'Budget'],
        ['25-Jun', '', ''],
        ['25-Jul', '', ''],
        ['25-Aug', '', '']
      ];
      const netInterestSheet = xlsx.utils.aoa_to_sheet(netInterestData);
      xlsx.utils.book_append_sheet(workbook, netInterestSheet, 'Net Interest Income_Budget');

      // Loan Composition
      const loanCompositionData = [
        ['Loan Type', 'Value'],
        ['Factoring', ''],
        ['Gold Loans', ''],
        ['Leasing', ''],
        ['Loans', ''],
        ['Ijara', '']
      ];
      const loanSheet = xlsx.utils.aoa_to_sheet(loanCompositionData);
      xlsx.utils.book_append_sheet(workbook, loanSheet, 'Loan Composition');

      // Overheads Against Budget
      const overheadsData = [
        ['Category', 'Actual', 'Budget'],
        ['Staff Cost', '', ''],
        ['Admin Cost', '', ''],
        ['Marketing', '', ''],
        ['Professional Charges', '', '']
      ];
      const overheadsSheet = xlsx.utils.aoa_to_sheet(overheadsData);
      xlsx.utils.book_append_sheet(workbook, overheadsSheet, 'Overheads Against Budget');

      // Business Activity
      const businessActivityData = [
        ['Metric', '25-Jun', '25-Jul', '25-Aug'],
        ['New FDs', '', '', ''],
        ['FDs Withdrawn', '', '', ''],
        ['Other Loans', '', '', ''],
        ['Gold Loans', '', '', '']
      ];
      const businessSheet = xlsx.utils.aoa_to_sheet(businessActivityData);
      xlsx.utils.book_append_sheet(workbook, businessSheet, 'Business Activity');
    }

    // Instructions Sheet for all entities
    const instructionsData = [
      ['Instructions for Data Entry'],
      [''],
      ['1. Fill in the KPIs sheet with actual and budget values'],
      ['2. Use the chart data sheets to provide monthly trend data'],
      ['3. Ensure all monetary values are in the correct units (LKR Mn, etc.)'],
      ['4. Date format should be consistent (e.g., 25-Jun for June 2025)'],
      ['5. Leave cells empty if no data is available'],
      [''],
      ['Chart Data Guidelines:'],
      ['- Line charts: Use Month, Actual, Budget columns'],
      ['- Pie charts: Use Category, Value columns'],
      ['- Bar charts: Use Category, Actual, Budget columns'],
      [''],
      ['Contact IT support if you encounter any issues']
    ];
    const instructionsSheet = xlsx.utils.aoa_to_sheet(instructionsData);
    xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    // Generate file
    const fileName = `${entity.shortName}_Template_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, 'templates', fileName);
    
    xlsx.writeFile(workbook, filePath);
    
    console.log(`Generated complete template for ${entity.shortName} with ${workbook.SheetNames.length} sheets`);
    
    res.download(filePath, `${entity.shortName}_Template.xlsx`, (err) => {
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

// Upload data
app.post('/api/upload', authenticateToken, upload.single('dataFile'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for data upload' });
    }
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

    // Validate filename matches selected entity
    const validation = validateEntityByFilename(req.file.originalname, entityId);

    // BLOCK UPLOAD if filename doesn't match entity
    if (!validation.isValid) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
  
      let errorMessage;
      if (validation.detectedEntity) {
        errorMessage = `Filename "${req.file.originalname}" appears to be for ${validation.detectedEntityName} but you selected ${validation.selectedEntityName}. Please select the correct entity or upload the correct file.`;
      } else {
        errorMessage = `Filename "${req.file.originalname}" doesn't match the selected entity ${validation.selectedEntityName}. Please ensure the filename contains the entity name or code.`;
      }
  
      return res.status(400).json({ 
        error: 'Filename does not match selected entity',
        message: errorMessage,
        selectedEntity: validation.selectedEntityName,
        detectedEntity: validation.detectedEntityName || 'Not detected',
        filename: req.file.originalname
      });
    }

    console.log(`✅ Filename validation passed: "${req.file.originalname}" matches ${entity.shortName}`);
    
    const period = await Dashboard.createOrGetPeriod(month, parseInt(year));

    // Read and parse Excel file
    const workbook = xlsx.readFile(req.file.path);

    console.log(`Processing upload for ${entity.shortName}, available sheets:`, workbook.SheetNames);

    let kpiCount = 0;
    let chartCount = 0;

    // Parse KPI data
    if (workbook.SheetNames.includes('KPIs')) {
      const kpiSheet = workbook.Sheets['KPIs'];
      const kpiData = xlsx.utils.sheet_to_json(kpiSheet, { header: 1 });
      
      // Skip header row
      for (let i = 1; i < kpiData.length; i++) {
        const row = kpiData[i];
        if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
          await Dashboard.createOrUpdateKPI({
            entityId,
            periodId: period.id,
            name: row[0],
            actual: parseFloat(row[1]) || null,
            budget: parseFloat(row[2]) || null,
            unit: row[3] || ''
          });
          kpiCount++;
        }
      }
    }


    // Parse chart data from other sheets - entity-specific processing
    if (entityId === 'janashakthi-limited') {
      // Share Composition
      if (workbook.SheetNames.includes('Share Composition')) {
        const sheet = workbook.Sheets['Share Composition'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const shareComposition = [];

        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            shareComposition.push({
              name: row[0],
              value: parseFloat(row[1]) || 0,
              color: ['#8B5CF6', '#06B6D4', '#10B981'][i-1] || '#3B82F6'
            });
          }
        }

        if (shareComposition.length > 0) {
          await Dashboard.saveChartData({
            entityId, periodId: period.id, chartType: 'Share Composition',
            dataKey: 'shareComposition', dataValue: shareComposition
          });
          chartCount++;
        }
      }

      // Overheads
      if (workbook.SheetNames.includes('Overheads')) {
        const sheet = workbook.Sheets['Overheads'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const overheads = [];

        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
            overheads.push({
              name: row[0],
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }

        if (overheads.length > 0) {
          await Dashboard.saveChartData({
            entityId, periodId: period.id, chartType: 'Overheads',
            dataKey: 'overheads', dataValue: overheads
          });
          chartCount++;
        }
      }

      // WACD Movement
      const wacdSheetNames = ['WACD Movement', 'WACD vs AWPLR', 'WACD'];
      let wacdSheetName = workbook.SheetNames.find(name => 
        wacdSheetNames.includes(name) || name.toLowerCase().includes('wacd')
      );

      if (wacdSheetName) {
        const sheet = workbook.Sheets[wacdSheetName];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const wacdMovement = [];

        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
            wacdMovement.push({
              month: String(row[0]).trim(),
              actual: parseFloat(row[1]) || 0,
              budget: parseFloat(row[2]) || 0
            });
          }
        }

        if (wacdMovement.length > 0) {
          await Dashboard.saveChartData({
            entityId, periodId: period.id, chartType: 'WACD Movement',
            dataKey: 'wacdMovement', dataValue: wacdMovement
          });
          chartCount++;
        }
      }

      // Maturity Profile
      if (workbook.SheetNames.includes('Maturity Profile')) {
        const sheet = workbook.Sheets['Maturity Profile'];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const maturityProfile = [];

        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row[0] && row[1]) {
            maturityProfile.push({
              name: row[0],
              value: parseFloat(row[1]) || 0
            });
          }
        }

        if (maturityProfile.length > 0) {
          await Dashboard.saveChartData({
            entityId, periodId: period.id, chartType: 'Maturity Profile',
            dataKey: 'maturityProfile', dataValue: maturityProfile
          });
          chartCount++;
        }
      }

    } else if (entityId === 'janashakthi-insurance') {
      // Process Insurance-specific sheets
      const insuranceSheets = {
        'Retail Business FYP': 'retailBusinessFYP',
        'JSV FYP': 'jsvFYP',
        'DTA FYP': 'dtaFYP',
        'Renewal Premium': 'renewalPremium',
        'UL Credit Rating': 'ulCreditRating',
        'Surplus Actual': 'surplusActual'
      };

      for (const [sheetName, dataKey] of Object.entries(insuranceSheets)) {
        if (workbook.SheetNames.includes(sheetName)) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          const chartData = [];

          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
              chartData.push({
                month: String(row[0]).trim(),
                actual: parseFloat(row[1]) || 0,
                budget: parseFloat(row[2]) || 0
              });
            }
          }

          if (chartData.length > 0) {
            await Dashboard.saveChartData({
              entityId, periodId: period.id, chartType: sheetName,
              dataKey, dataValue: chartData
            });
            chartCount++;
          }
        }
      }

    } else if (entityId === 'first-capital') {
      // Process First Capital-specific sheets
      const fchSheets = {
        'Net Income Against Budget': 'netIncomeAgainstBudget',
        'Trading Composition': 'tradingComposition',
        'Overheads Against Budget': 'overheadsAgainstBudget',
        'Unit Trust AUM': 'unitTrustAUM',
        'WM AUM': 'wmAUM',
        'Treasuries': 'treasuriesData',
        'Dealing Securities': 'dealingSecurities',
        'Portfolio Management': 'portfolioManagement',
        'FCE Market Turnover': 'fceMarketTurnover'
        
      };

      // Special handling for FCE Market Turnover (table format)
      const fceSheetNames = ['FCE Market Turnover', "FCE's Market Turnover", 'FCEs Market Turnover'];
      let fceSheetName = workbook.SheetNames.find(name => 
        fceSheetNames.some(expectedName => 
          name.toLowerCase().includes(expectedName.toLowerCase()) ||
          expectedName.toLowerCase().includes(name.toLowerCase())
        )
      );

      if (fceSheetName) {
        console.log(`Processing FCE Market Turnover sheet: "${fceSheetName}"`);
  
        const sheet = workbook.Sheets[fceSheetName];
        const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
        console.log('FCE Market Turnover raw data:', sheetData);

        if (sheetData.length > 2) { // Must have header + at least 2 data rows
          // Find the Volume % and Commission % rows
          let volumeRow = null;
          let commissionRow = null;
    
          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            const firstCell = String(row[0] || '').toLowerCase().trim();
      
            if (firstCell.includes('volume')) {
              volumeRow = row;
              console.log('Found volume row:', row);
            } else if (firstCell.includes('commission')) {
              commissionRow = row;
              console.log('Found commission row:', row);
            }
          }
    
          if (volumeRow && commissionRow) {
            // Extract header to understand column mapping
            const headers = sheetData[0] || [];
            console.log('Headers:', headers);
      
            // Find column indices for months (looking for patterns like "25-Jun", "25-Jul", "25-Aug" or "25-Sep")
            const monthColumns = {};
      
            for (let col = 1; col < headers.length; col++) {
              const header = String(headers[col] || '').toLowerCase().trim();
              console.log(`Checking header at column ${col}:`, header);
        
              if (header.includes('jun')) {
                monthColumns.jun = col;
              } else if (header.includes('jul')) {
                monthColumns.jul = col;
              } else if (header.includes('aug') || header.includes('sep') || header.includes('oct')) {
                monthColumns.aug = col; // Map Aug, Sep, and Oct to aug for consistency
              }
            }
      
            console.log('Month column mapping:', monthColumns);
      
            // Capture the actual month headers from the Excel file
            const monthHeaders = {
              month1: String(headers[1] || '25-Jun').trim(),
              month2: String(headers[2] || '25-Jul').trim(), 
              month3: String(headers[3] || '25-Aug').trim()
            };

            const fceMarketTurnover = {
              headers: monthHeaders, // Add this line to include headers
              jun: {
                volume: volumeRow[monthColumns.jun] ? String(volumeRow[monthColumns.jun]) + '%' : '0%',
                commission: commissionRow[monthColumns.jun] ? String(commissionRow[monthColumns.jun]) + '%' : '0%'
              },
              jul: {
                volume: volumeRow[monthColumns.jul] ? String(volumeRow[monthColumns.jul]) + '%' : '0%',
                commission: commissionRow[monthColumns.jul] ? String(commissionRow[monthColumns.jul]) + '%' : '0%'
              },
              aug: {
                volume: volumeRow[monthColumns.aug] ? String(volumeRow[monthColumns.aug]) + '%' : '0%',
                commission: commissionRow[monthColumns.aug] ? String(commissionRow[monthColumns.aug]) + '%' : '0%'
              }
            };

            console.log('Final FCE Market Turnover data:', fceMarketTurnover);

            await Dashboard.saveChartData({
              entityId, 
              periodId: period.id, 
              chartType: "FCE's Market Turnover", 
              dataKey: 'fceMarketTurnover', 
              dataValue: fceMarketTurnover
            });
            chartCount++;
          } else {
            console.log('Could not find Volume % or Commission % rows in FCE Market Turnover sheet');
            console.log('Available rows:', sheetData.map((row, i) => `Row ${i}: ${row[0]}`));
          }
        } else {
          console.log('FCE Market Turnover sheet has insufficient data rows');
        }
      }

      for (const [sheetName, dataKey] of Object.entries(fchSheets)) {
        if (workbook.SheetNames.includes(sheetName)) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
          let chartData = [];

          if (dataKey === 'tradingComposition') {
            // Pie chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && row[1]) {
                chartData.push({
                  name: row[0],
                  value: parseFloat(row[1]) || 0,
                  color: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i-1] || '#3B82F6'
                });
              }
            }
          } else if (dataKey === 'treasuriesData') {
            // Multi-line chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && (row[1] || row[2] || row[3])) {
                chartData.push({
                  month: String(row[0]).trim(),
                  tBills: parseFloat(row[1]) || 0,
                  outrightSale: parseFloat(row[2]) || 0,
                  govSecurities: parseFloat(row[3]) || 0
                });
              }
            }
          } else if (dataKey === 'dealingSecurities') {
            // Grouped bar chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && (row[1] || row[2] || row[3])) {
                chartData.push({
                  category: row[0],
                  shortLabel: row[0].substring(0, 20) + '...',
                  jun: parseFloat(row[1]) || 0,
                  jul: parseFloat(row[2]) || 0,
                  aug: parseFloat(row[3]) || 0
                });
              }
            }
          } else {
            // Standard line chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
                chartData.push({
                  month: String(row[0]).trim(),
                  actual: parseFloat(row[1]) || 0,
                  budget: parseFloat(row[2]) || 0
                });
              }
            }
          }

          if (chartData.length > 0) {
            await Dashboard.saveChartData({
              entityId, periodId: period.id, chartType: sheetName,
              dataKey, dataValue: chartData
            });
            chartCount++;
          }
        }
      }

    } else if (entityId === 'janashakthi-finance') {
      // Process Finance-specific sheets
      const financeSheets = {
        'Net Interest Income_Budget': 'netInterestIncomeAgainstBudget',
        'Loan Composition': 'loanComposition',
        'Overheads Against Budget': 'overheadsAgainstBudget',
        'Business Activity': 'businessActivity'
      };

      for (const [sheetName, dataKey] of Object.entries(financeSheets)) {
        if (workbook.SheetNames.includes(sheetName)) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
          let chartData = [];

          if (dataKey === 'loanComposition') {
            // Pie chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && row[1]) {
                chartData.push({
                  name: row[0],
                  value: parseFloat(row[1]) || 0,
                  color: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i-1] || '#3B82F6'
                });
              }
            }
          } else if (dataKey === 'businessActivity') {
            // Special handling for business activity table
            const metrics = {};
            const headers = sheetData[0] || [];
        
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0]) {
                metrics[row[0]] = {
                  month1: parseFloat(row[1]) || 0,
                  month2: parseFloat(row[2]) || 0,
                  month3: parseFloat(row[3]) || 0
                };
              }
            }
        
            chartData = {
              headers: {
                month1: headers[1] || 'Month 1',
                month2: headers[2] || 'Month 2', 
                month3: headers[3] || 'Month 3'
              },
              metrics
            };
          } else {
            // Standard line/bar chart data
            for (let i = 1; i < sheetData.length; i++) {
              const row = sheetData[i];
              if (row[0] && (row[1] !== undefined || row[2] !== undefined)) {
                chartData.push({
                  name: row[0],
                  actual: parseFloat(row[1]) || 0,
                  budget: parseFloat(row[2]) || 0
                });
              }
            }
          }

          if (chartData.length > 0 || (typeof chartData === 'object' && Object.keys(chartData).length > 0)) {
            await Dashboard.saveChartData({
              entityId, periodId: period.id, chartType: sheetName,
              dataKey, dataValue: chartData
            });
            chartCount++;
          }
        }
      }
    }

    // Clean up uploaded file
    await fs.unlink(req.file.path);
    
    console.log(`Data uploaded successfully for ${entity.shortName} - ${month} ${year}`);
    
    res.json({ 
      message: 'Data uploaded successfully',
      entity: entity.shortName,
      period: `${month}-${year}`,
      kpiCount,
      chartCount
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

// Temporary cleanup route - add this before your error handling middleware
app.get('/api/cleanup-database', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    console.log('Starting database cleanup...');
    
    // Delete invalid chart data
    const deleteQuery = `
      DELETE FROM chart_data 
      WHERE data_key IS NULL 
         OR data_key = 'undefined' 
         OR data_value IS NULL 
         OR data_value = 'undefined'
         OR data_value = ''
    `;
    
    const deleteResult = await db.query(deleteQuery);
    console.log('Deleted invalid entries:', deleteResult.rows[0]?.changes || 0);
    
    // Count what's left
    const countResult = await db.query('SELECT COUNT(*) as count FROM chart_data');
    const remaining = countResult.rows[0]?.count || 0;
    
    // Show sample of remaining data
    const sampleResult = await db.query(`
      SELECT entity_id, period_id, data_key, 
             SUBSTR(data_value, 1, 100) as preview
      FROM chart_data 
      LIMIT 10
    `);
    
    res.json({
      message: 'Database cleanup completed',
      deletedEntries: deleteResult.rows[0]?.changes || 0,
      remainingEntries: remaining,
      sampleData: sampleResult.rows
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up ALL duplicates - KPIs and Chart Data
app.post('/api/admin/cleanup-duplicates', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    console.log('Starting comprehensive cleanup...');
    let deletedCount = 0;
    
    // Step 1: Clean up KPI duplicates (keep latest by ID)
    const kpiCleanupQuery = `
      DELETE FROM kpis WHERE id NOT IN (
        SELECT MAX(id) FROM kpis 
        GROUP BY entity_id, period_id, name
      )
    `;
    
    const kpiResult = await db.query(kpiCleanupQuery);
    const kpiDeleted = kpiResult.rows[0]?.changes || 0;
    deletedCount += kpiDeleted;
    console.log(`KPIs cleaned: ${kpiDeleted} duplicates removed`);
    
    // Step 2: Clean up Chart Data duplicates
    const chartCleanupQueries = [
      // Remove specific naming conflicts first
      `DELETE FROM chart_data WHERE chart_type = 'unitTrustAUM' AND EXISTS (
        SELECT 1 FROM chart_data c2 WHERE c2.entity_id = chart_data.entity_id 
        AND c2.period_id = chart_data.period_id AND c2.chart_type = 'Unit Trust AUM'
      )`,
      
      `DELETE FROM chart_data WHERE data_key = 'share_composition' AND EXISTS (
        SELECT 1 FROM chart_data c2 WHERE c2.entity_id = chart_data.entity_id 
        AND c2.period_id = chart_data.period_id AND c2.data_key = 'shareComposition'
      )`,
      
      // Remove all other chart duplicates (keep latest by ID)
      `DELETE FROM chart_data WHERE id NOT IN (
        SELECT MAX(id) FROM chart_data 
        GROUP BY entity_id, period_id, chart_type
      )`
    ];
    
    for (const query of chartCleanupQueries) {
      const result = await db.query(query);
      const changes = result.rows[0]?.changes || 0;
      deletedCount += changes;
      console.log(`Chart data query executed: ${changes} entries deleted`);
    }
    // Step 2.5: Remove wrong KPIs from Janashakthi Limited
    console.log('Removing wrong KPIs from Janashakthi Limited...');
    
    const removeWrongKPIsQuery = `
      DELETE FROM kpis 
      WHERE entity_id = 'janashakthi-limited' 
      AND name IN (?, ?, ?, ?, ?, ?, ?,?,?,?,?,?)
    `;
    
    const wrongKPIs = [
      'Financial Assets', 
      'NAV', 
      'Operating Cost to Income', 
      'PBT', 
      'PAT', 
      'ROI', 
      'Securities Sold',
      'Total Liabilities',
      'Net Interest Income / Total Interest Income',
      'ROA Annualized',
      'Investment Impairment'
    ];
    
    const wrongKPIResult = await db.query(removeWrongKPIsQuery, wrongKPIs);
    const wrongKPIsDeleted = wrongKPIResult.rows[0]?.changes || 0;
    deletedCount += wrongKPIsDeleted;
    console.log(`Removed ${wrongKPIsDeleted} wrong KPIs from Janashakthi Limited`);

    // Step 3: Get final counts for verification
    const kpiCount = await db.query('SELECT COUNT(*) as count FROM kpis');
    const chartCount = await db.query('SELECT COUNT(*) as count FROM chart_data');
    
    res.json({
      message: 'Comprehensive cleanup completed successfully',
      deletedEntries: deletedCount,
      remaining: {
        kpis: kpiCount.rows[0].count,
        chartData: chartCount.rows[0].count
      }
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug route to check raw database access
app.get('/api/debug-raw-db', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Direct SQLite query
    const rawResult = await db.sqlite.all('SELECT * FROM chart_data LIMIT 5');
    
    res.json({
      message: 'Raw database access test',
      rawResult: rawResult,
      sampleRecord: rawResult[0] || null,
      columnNames: rawResult[0] ? Object.keys(rawResult[0]) : []
    });
    
  } catch (error) {
    console.error('Raw DB error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add these debug routes to server.js (for admin use only)

// Debug route to check chart data for specific entity/period
app.get('/api/debug/chart-data/:entity/:month/:year', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { entity, month, year } = req.params;
    
    const period = await Dashboard.createOrGetPeriod(month, parseInt(year));
    if (!period) {
      return res.status(404).json({ error: 'Period not found' });
    }

    // Get raw chart data from database
    const query = `
      SELECT id, chart_type, data_key, 
             LENGTH(data_value) as data_length,
             SUBSTR(data_value, 1, 200) as data_preview
      FROM chart_data 
      WHERE entity_id = ? AND period_id = ?
      ORDER BY chart_type, data_key
    `;
    
    const rawData = await db.query(query, [entity, period.id]);
    
    // Get processed chart data
    const processedData = await Dashboard.getChartData(entity, period.id);
    
    res.json({
      entity,
      period: `${month}-${year}`,
      raw_entries: rawData.rows.length,
      processed_keys: Object.keys(processedData),
      raw_data: rawData.rows,
      processed_sample: Object.fromEntries(
        Object.entries(processedData).slice(0, 3).map(([key, value]) => [
          key, 
          Array.isArray(value) ? `Array(${value.length})` : typeof value
        ])
      )
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up invalid chart data
app.post('/api/debug/cleanup-chart-data', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    console.log('Starting chart data cleanup...');
    
    // Delete invalid entries
    const deleteQuery = `
      DELETE FROM chart_data 
      WHERE data_key IS NULL 
         OR data_key = 'undefined' 
         OR data_value IS NULL 
         OR data_value = 'undefined'
         OR data_value = 'null'
         OR data_value = ''
         OR data_value = '[]'
         OR data_value = '{}'
    `;
    
    const deleteResult = await db.query(deleteQuery);
    
    // Get remaining count
    const countResult = await db.query('SELECT COUNT(*) as count FROM chart_data');
    
    res.json({
      message: 'Chart data cleanup completed',
      deleted_entries: deleteResult.rows[0]?.changes || 0,
      remaining_entries: countResult.rows[0]?.count || 0
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this route to your server.js file

// Export database contents to Excel
app.get('/api/export/database-report', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('Generating database export...');

    // Create Excel workbook
    const workbook = xlsx.utils.book_new();

    // 1. Export Periods
    const periodsQuery = 'SELECT * FROM periods ORDER BY year DESC, month DESC';
    const periodsResult = await db.query(periodsQuery);
    
    if (periodsResult.rows.length > 0) {
      const periodsData = [
        ['ID', 'Month', 'Year', 'Period Key', 'Created At'],
        ...periodsResult.rows.map(row => [
          row.id, row.month, row.year, row.period_key, row.created_at
        ])
      ];
      const periodsSheet = xlsx.utils.aoa_to_sheet(periodsData);
      xlsx.utils.book_append_sheet(workbook, periodsSheet, 'Periods');
    }

    // 2. Export Entities
    const entitiesQuery = 'SELECT * FROM entities';
    const entitiesResult = await db.query(entitiesQuery);
    
    if (entitiesResult.rows.length > 0) {
      const entitiesData = [
        ['ID', 'Name', 'Short Name', 'Description', 'Created At'],
        ...entitiesResult.rows.map(row => [
          row.id, row.name, row.short_name, row.description, row.created_at
        ])
      ];
      const entitiesSheet = xlsx.utils.aoa_to_sheet(entitiesData);
      xlsx.utils.book_append_sheet(workbook, entitiesSheet, 'Entities');
    }

    // 3. Export KPIs Summary
    const kpisQuery = `
      SELECT 
        k.id,
        e.name as entity_name,
        p.period_key,
        k.name as kpi_name,
        k.actual_value,
        k.budget_value,
        k.unit,
        k.created_at,
        k.updated_at
      FROM kpis k
      JOIN entities e ON k.entity_id = e.id
      JOIN periods p ON k.period_id = p.id
      ORDER BY p.period_key DESC, e.name, k.name
    `;
    const kpisResult = await db.query(kpisQuery);
    
    if (kpisResult.rows.length > 0) {
      const kpisData = [
        ['ID', 'Entity', 'Period', 'KPI Name', 'Actual Value', 'Budget Value', 'Unit', 'Created', 'Updated'],
        ...kpisResult.rows.map(row => [
          row.id, row.entity_name, row.period_key, row.kpi_name, 
          row.actual_value, row.budget_value, row.unit, row.created_at, row.updated_at
        ])
      ];
      const kpisSheet = xlsx.utils.aoa_to_sheet(kpisData);
      xlsx.utils.book_append_sheet(workbook, kpisSheet, 'KPIs');
    }

    // 4. Export Chart Data Summary
    const chartDataQuery = `
      SELECT 
        c.id,
        e.name as entity_name,
        p.period_key,
        c.chart_type,
        c.data_key,
        LENGTH(c.data_value) as data_length,
        CASE 
          WHEN c.data_value LIKE '[%' THEN 'Array'
          WHEN c.data_value LIKE '{%' THEN 'Object'
          ELSE 'Other'
        END as data_type,
        c.created_at
      FROM chart_data c
      JOIN entities e ON c.entity_id = e.id
      JOIN periods p ON c.period_id = p.id
      ORDER BY p.period_key DESC, e.name, c.chart_type
    `;
    const chartDataResult = await db.query(chartDataQuery);
    
    if (chartDataResult.rows.length > 0) {
      const chartDataSummary = [
        ['ID', 'Entity', 'Period', 'Chart Type', 'Data Key', 'Data Length', 'Data Type', 'Created'],
        ...chartDataResult.rows.map(row => [
          row.id, row.entity_name, row.period_key, row.chart_type, 
          row.data_key, row.data_length, row.data_type, row.created_at
        ])
      ];
      const chartDataSheet = xlsx.utils.aoa_to_sheet(chartDataSummary);
      xlsx.utils.book_append_sheet(workbook, chartDataSheet, 'Chart Data Summary');
    }

    // 5. Export Detailed Chart Data for Each Entity/Period
    const entityPeriodQuery = `
      SELECT DISTINCT 
        e.id as entity_id,
        e.name as entity_name,
        p.id as period_id,
        p.period_key
      FROM chart_data c
      JOIN entities e ON c.entity_id = e.id
      JOIN periods p ON c.period_id = p.id
      ORDER BY p.period_key DESC, e.name
    `;
    const entityPeriodResult = await db.query(entityPeriodQuery);

    for (const ep of entityPeriodResult.rows) {
      // Get chart data for this entity/period
      const detailQuery = `
        SELECT chart_type, data_key, data_value
        FROM chart_data 
        WHERE entity_id = ? AND period_id = ?
        ORDER BY chart_type, data_key
      `;
      const detailResult = await db.query(detailQuery, [ep.entity_id, ep.period_id]);

      if (detailResult.rows.length > 0) {
        const sheetName = `${ep.entity_name.substring(0, 15)} ${ep.period_key}`.replace(/[^\w\s]/g, '');
        
        const detailData = [
          ['Chart Type', 'Data Key', 'Parsed Data', 'Raw JSON (First 100 chars)']
        ];

        detailResult.rows.forEach(row => {
          let parsedPreview = 'Parse Error';
          try {
            const parsed = JSON.parse(row.data_value);
            if (Array.isArray(parsed)) {
              parsedPreview = `Array with ${parsed.length} items`;
              // Add first few array items as separate rows
              parsed.slice(0, 5).forEach((item, index) => {
                detailData.push([
                  `${row.chart_type} [${index}]`,
                  row.data_key,
                  JSON.stringify(item),
                  ''
                ]);
              });
            } else if (typeof parsed === 'object') {
              parsedPreview = `Object with keys: ${Object.keys(parsed).join(', ')}`;
              detailData.push([
                row.chart_type,
                row.data_key,
                JSON.stringify(parsed, null, 2).substring(0, 200),
                row.data_value.substring(0, 100)
              ]);
            } else {
              parsedPreview = String(parsed);
              detailData.push([
                row.chart_type,
                row.data_key,
                parsedPreview,
                row.data_value.substring(0, 100)
              ]);
            }
          } catch (e) {
            detailData.push([
              row.chart_type,
              row.data_key,
              'PARSE ERROR: ' + e.message,
              row.data_value.substring(0, 100)
            ]);
          }
        });

        const detailSheet = xlsx.utils.aoa_to_sheet(detailData);
        xlsx.utils.book_append_sheet(workbook, detailSheet, sheetName);
      }
    }

    // 6. Add Database Statistics
    const statsData = [
      ['Statistic', 'Count'],
      ['Total Users', (await db.query('SELECT COUNT(*) as count FROM users')).rows[0].count],
      ['Total Entities', (await db.query('SELECT COUNT(*) as count FROM entities')).rows[0].count],
      ['Total Periods', (await db.query('SELECT COUNT(*) as count FROM periods')).rows[0].count],
      ['Total KPIs', (await db.query('SELECT COUNT(*) as count FROM kpis')).rows[0].count],
      ['Total Chart Data Entries', (await db.query('SELECT COUNT(*) as count FROM chart_data')).rows[0].count],
      [''],
      ['KPIs by Entity', ''],
      ...((await db.query(`
        SELECT e.name, COUNT(k.id) as count 
        FROM entities e 
        LEFT JOIN kpis k ON e.id = k.entity_id 
        GROUP BY e.id, e.name 
        ORDER BY count DESC
      `)).rows.map(row => [row.name, row.count])),
      [''],
      ['Chart Data by Entity', ''],
      ...((await db.query(`
        SELECT e.name, COUNT(c.id) as count 
        FROM entities e 
        LEFT JOIN chart_data c ON e.id = c.entity_id 
        GROUP BY e.id, e.name 
        ORDER BY count DESC
      `)).rows.map(row => [row.name, row.count]))
    ];
    
    const statsSheet = xlsx.utils.aoa_to_sheet(statsData);
    xlsx.utils.book_append_sheet(workbook, statsSheet, 'Database Stats');

    // Generate file
    const fileName = `Database_Export_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`;
    const filePath = path.join(__dirname, 'exports', fileName);
    
    // Ensure exports directory exists
    await fs.mkdir(path.join(__dirname, 'exports'), { recursive: true });
    
    xlsx.writeFile(workbook, filePath);
    
    console.log(`Generated database export: ${fileName}`);
    
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error downloading export:', err);
      }
      // Clean up file after download
      setTimeout(() => {
        fs.unlink(filePath).catch(console.error);
      }, 60000); // Delete after 1 minute
    });

  } catch (error) {
    console.error('Error generating database export:', error);
    res.status(500).json({ error: 'Failed to generate database export: ' + error.message });
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
initializeDatabaseStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}`);
    console.log(`Database-powered backend ready`);
    console.log(`API health check: http://localhost:${PORT}/api/health`);
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});