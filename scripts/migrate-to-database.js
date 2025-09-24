const fs = require('fs').promises;
const path = require('path');
const db = require('../database/connection');
const { Dashboard, User } = require('../models');

async function migrateData() {
  try {
    console.log('Starting migration from file storage to database...');
    
    await db.init();
    
    // Migrate users first
    try {
      const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
      const usersFileData = await fs.readFile(usersFilePath, 'utf8');
      const usersData = JSON.parse(usersFileData);
      
      for (const [email, userData] of Object.entries(usersData)) {
        try {
          // Check if user already exists
          const existingUser = await User.findByEmail(email);
          if (!existingUser) {
            // Create user with existing password hash
            await db.query(
              'INSERT INTO users (email, name, password_hash, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)',
              [email, userData.name, userData.password, userData.role, userData.createdAt, userData.lastLogin]
            );
            console.log(`Migrated user: ${email}`);
          }
        } catch (userError) {
          console.error(`Error migrating user ${email}:`, userError);
        }
      }
    } catch (usersError) {
      console.log('No users file found or empty, skipping user migration');
    }
    
    // Migrate dashboard data
    try {
      const dataFilePath = path.join(__dirname, '..', 'data', 'dashboard_data.json');
      const fileData = await fs.readFile(dataFilePath, 'utf8');
      const dashboardData = JSON.parse(fileData);
      
      for (const [periodKey, entities] of Object.entries(dashboardData)) {
        const [month, year] = periodKey.split('-');
        console.log(`Migrating period: ${periodKey}`);
        
        const period = await Dashboard.createOrGetPeriod(month, parseInt(year));
        
        for (const [entityId, data] of Object.entries(entities)) {
          console.log(`  Migrating ${entityId}`);
          
          // Migrate KPIs
          if (data.kpis && Array.isArray(data.kpis)) {
            for (const kpi of data.kpis) {
              try {
                await Dashboard.createOrUpdateKPI({
                  entityId,
                  periodId: period.id,
                  name: kpi.name,
                  actual: kpi.actual,
                  budget: kpi.budget,
                  unit: kpi.unit
                });
              } catch (kpiError) {
                console.error(`Error migrating KPI ${kpi.name}:`, kpiError);
              }
            }
            console.log(`    Migrated ${data.kpis.length} KPIs`);
          }
          
          // Migrate chart data
          let chartCount = 0;
          for (const [chartType, chartData] of Object.entries(data)) {
            if (chartType !== 'kpis') {
              try {
                await Dashboard.saveChartData({
                  entityId,
                  periodId: period.id,
                  chartType,
                  dataKey: chartType,
                  dataValue: chartData
                });
                chartCount++;
              } catch (chartError) {
                console.error(`Error migrating chart ${chartType}:`, chartError);
              }
            }
          }
          console.log(`    Migrated ${chartCount} chart datasets`);
        }
      }
      
      console.log('Migration completed successfully!');
      
      // Backup original files
      const backupDir = path.join(__dirname, '..', 'data', 'backup');
      await fs.mkdir(backupDir, { recursive: true });
      
      await fs.copyFile(dataFilePath, path.join(backupDir, 'dashboard_data.json.backup'));
      if (await fs.access(path.join(__dirname, '..', 'data', 'users.json')).then(() => true).catch(() => false)) {
        await fs.copyFile(
          path.join(__dirname, '..', 'data', 'users.json'),
          path.join(backupDir, 'users.json.backup')
        );
      }
      
      console.log('Original files backed up to data/backup/');
      
    } catch (dataError) {
      console.error('Error migrating dashboard data:', dataError);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  migrateData();
}

module.exports = migrateData;