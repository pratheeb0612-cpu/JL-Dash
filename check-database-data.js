const db = require('./database/connection');

async function checkDatabaseData() {
  try {
    console.log('🔍 Checking database data...\n');
    
    await db.init();
    
    // Check if tables exist and have data
    const tables = ['users', 'entities', 'periods', 'kpis', 'chart_data', 'upload_logs'];
    
    for (const table of tables) {
      try {
        const countQuery = `SELECT COUNT(*) as count FROM ${table}`;
        const result = await db.query(countQuery);
        const count = result.rows[0].count;
        
        console.log(`📊 ${table.toUpperCase()}: ${count} records`);
        
        if (count > 0) {
          // Show sample data for verification
          const sampleQuery = `SELECT * FROM ${table} LIMIT 3`;
          const sampleResult = await db.query(sampleQuery);
          console.log(`   Sample data:`, sampleResult.rows);
        }
        console.log('');
      } catch (error) {
        console.log(`❌ ${table.toUpperCase()}: Table doesn't exist or error - ${error.message}\n`);
      }
    }
    
    // Specific checks for dashboard data
    console.log('🎯 DASHBOARD DATA ANALYSIS:\n');
    
    // Check periods
    try {
      const periodsQuery = `
        SELECT period_key, month, year 
        FROM periods 
        ORDER BY year DESC, 
          CASE month 
            WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
            WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
            WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
            WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END DESC
      `;
      const periodsResult = await db.query(periodsQuery);
      
      if (periodsResult.rows.length > 0) {
        console.log('📅 Available Periods:');
        periodsResult.rows.forEach(period => {
          console.log(`   • ${period.month} ${period.year} (${period.period_key})`);
        });
      } else {
        console.log('📅 No periods found in database');
      }
      console.log('');
    } catch (error) {
      console.log('❌ Error checking periods:', error.message);
    }
    
    // Check entities
    try {
      const entitiesQuery = 'SELECT id, name, short_name FROM entities';
      const entitiesResult = await db.query(entitiesQuery);
      
      if (entitiesResult.rows.length > 0) {
        console.log('🏢 Available Entities:');
        entitiesResult.rows.forEach(entity => {
          console.log(`   • ${entity.name} (${entity.short_name}) - ID: ${entity.id}`);
        });
      } else {
        console.log('🏢 No entities found in database');
      }
      console.log('');
    } catch (error) {
      console.log('❌ Error checking entities:', error.message);
    }
    
    // Check KPIs by entity and period
    try {
      const kpiSummaryQuery = `
        SELECT 
          e.name as entity_name,
          p.period_key,
          COUNT(k.id) as kpi_count
        FROM entities e
        LEFT JOIN kpis k ON e.id = k.entity_id
        LEFT JOIN periods p ON k.period_id = p.id
        WHERE k.id IS NOT NULL
        GROUP BY e.id, e.name, p.period_key
        ORDER BY p.period_key DESC, e.name
      `;
      const kpiSummaryResult = await db.query(kpiSummaryQuery);
      
      if (kpiSummaryResult.rows.length > 0) {
        console.log('📈 KPI Data Summary:');
        kpiSummaryResult.rows.forEach(row => {
          console.log(`   • ${row.entity_name} - ${row.period_key}: ${row.kpi_count} KPIs`);
        });
      } else {
        console.log('📈 No KPI data found');
      }
      console.log('');
    } catch (error) {
      console.log('❌ Error checking KPI summary:', error.message);
    }
    
    // Check chart data
    try {
      const chartSummaryQuery = `
        SELECT 
          e.name as entity_name,
          p.period_key,
          COUNT(c.id) as chart_count
        FROM entities e
        LEFT JOIN chart_data c ON e.id = c.entity_id
        LEFT JOIN periods p ON c.period_id = p.id
        WHERE c.id IS NOT NULL
        GROUP BY e.id, e.name, p.period_key
        ORDER BY p.period_key DESC, e.name
      `;
      const chartSummaryResult = await db.query(chartSummaryQuery);
      
      if (chartSummaryResult.rows.length > 0) {
        console.log('📊 Chart Data Summary:');
        chartSummaryResult.rows.forEach(row => {
          console.log(`   • ${row.entity_name} - ${row.period_key}: ${row.chart_count} chart datasets`);
        });
      } else {
        console.log('📊 No chart data found');
      }
      console.log('');
    } catch (error) {
      console.log('❌ Error checking chart summary:', error.message);
    }
    
    // Check if migration was successful
    console.log('🔍 MIGRATION STATUS:\n');
    
    const totalKpis = await db.query('SELECT COUNT(*) as count FROM kpis');
    const totalCharts = await db.query('SELECT COUNT(*) as count FROM chart_data');
    const totalPeriods = await db.query('SELECT COUNT(*) as count FROM periods');
    
    if (totalKpis.rows[0].count > 0 || totalCharts.rows[0].count > 0) {
      console.log('✅ Migration appears SUCCESSFUL!');
      console.log(`   • ${totalPeriods.rows[0].count} periods`);
      console.log(`   • ${totalKpis.rows[0].count} KPIs`);
      console.log(`   • ${totalCharts.rows[0].count} chart datasets`);
    } else {
      console.log('❌ Migration may have FAILED or no data to migrate');
      console.log('   • Check if data/dashboard_data.json exists');
      console.log('   • Run: node scripts/migrate-to-database.js');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await db.close();
  }
}

// Run the check
checkDatabaseData();