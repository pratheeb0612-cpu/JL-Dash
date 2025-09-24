const db = require('../database/connection');

class Dashboard {
  static async createOrUpdateKPI({ entityId, periodId, name, actual, budget, unit }) {
    try {
      const query = `
        INSERT INTO kpis (entity_id, period_id, name, actual_value, budget_value, unit)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_id, period_id, name) 
        DO UPDATE SET 
          actual_value = excluded.actual_value,
          budget_value = excluded.budget_value,
          unit = excluded.unit,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const result = await db.query(query, [entityId, periodId, name, actual, budget, unit]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating/updating KPI:', error);
      throw error;
    }
  }

  static async getKPIsByEntityAndPeriod(entityId, periodId) {
    try {
      const query = `
        SELECT name, actual_value as actual, budget_value as budget, unit
        FROM kpis 
        WHERE entity_id = ? AND period_id = ?
        ORDER BY name
      `;
      
      const result = await db.query(query, [entityId, periodId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting KPIs:', error);
      throw error;
    }
  }

  
  static async saveChartData({ entityId, periodId, chartType, dataKey, dataValue }) {
    try {
        // Enhanced validation
        if (dataValue === undefined || dataValue === null) {
            console.warn(`Invalid dataValue for ${dataKey}:`, dataValue);
            return null;
        }

        // Additional checks for empty arrays/objects
        if (Array.isArray(dataValue) && dataValue.length === 0) {
            console.warn(`Empty array for ${dataKey}, skipping save`);
            return null;
        }

        if (typeof dataValue === 'object' && Object.keys(dataValue).length === 0) {
            console.warn(`Empty object for ${dataKey}, skipping save`);
            return null;
        }

        const jsonString = JSON.stringify(dataValue);
        
        // Validate JSON string
        if (jsonString === 'undefined' || jsonString === 'null' || jsonString === '[]' || jsonString === '{}') {
            console.warn(`Invalid JSON string for ${dataKey}: ${jsonString}`);
            return null;
        }

        console.log(`Saving chart data: ${entityId} - ${dataKey} - ${jsonString.length} chars`);

        // Step 1: Clear any existing data for this chart type
        const deleteQuery = `
            DELETE FROM chart_data 
            WHERE entity_id = ? AND period_id = ? AND data_key = ?
        `;
        await db.query(deleteQuery, [entityId, periodId, dataKey]);

        // Step 2: Insert new data
        const insertQuery = `
            INSERT INTO chart_data (entity_id, period_id, chart_type, data_key, data_value)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const result = await db.query(insertQuery, [entityId, periodId, chartType, dataKey, jsonString]);
        
        console.log(`✅ Saved chart data for ${dataKey}`);
        return result.rows[0];
    } catch (error) {
        console.error('Error saving chart data:', error);
        throw error;
    }
  }

  // Replace the getChartData method in models/Dashboard.js

  static async getChartData(entityId, periodId) {
    try {
      const query = `
        SELECT * FROM chart_data 
        WHERE entity_id = ? AND period_id = ?
        AND data_key IS NOT NULL 
        AND data_value IS NOT NULL
        AND data_value != ''
        AND data_value != 'undefined'
        AND data_value != 'null'
      `;

      const rows = await db.sqlite.all(query, [entityId, periodId]);
      console.log(`Found ${rows.length} chart data entries for ${entityId}, period ${periodId}`);

      const data = {};

      rows.forEach((row, index) => {
        console.log(`Processing row ${index}:`, {
          id: row.id,
          entity_id: row.entity_id,
          chart_type: row.chart_type,
          data_key: row.data_key,
          has_data_value: !!row.data_value
        });
    
        if (row.data_key && row.data_value) {
          try {
            const parsedData = JSON.parse(row.data_value);
          
            // Additional validation - ensure parsed data is not empty
            if (Array.isArray(parsedData) && parsedData.length === 0) {
              console.warn(`Empty array for ${row.data_key}, skipping`);
              return;
            }
          
            if (typeof parsedData === 'object' && parsedData !== null && Object.keys(parsedData).length === 0) {
              console.warn(`Empty object for ${row.data_key}, skipping`);
              return;
            }
          
            data[row.data_key] = parsedData;
            console.log(`✅ Successfully loaded: ${row.data_key} with ${Array.isArray(parsedData) ? parsedData.length : 'object'} items`);
          } catch (parseError) {
            console.error(`❌ Parse error for ${row.data_key}:`, parseError);
            console.error(`Raw data:`, row.data_value.substring(0, 200));
          }
        }
      });

      console.log(`Final data object keys:`, Object.keys(data));
      return data;
    } catch (error) {
      console.error('Error getting chart data:', error);
      throw error;
    }
  }

  static async createOrGetPeriod(month, year) {
    try {
      const periodKey = `${month}-${year}`;
      
      // Try to get existing period
      let query = 'SELECT * FROM periods WHERE period_key = ?';
      let result = await db.query(query, [periodKey]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      // Create new period
      query = 'INSERT INTO periods (month, year, period_key) VALUES (?, ?, ?)';
      await db.query(query, [month, year, periodKey]);
      
      // Get the created period
      query = 'SELECT * FROM periods WHERE period_key = ?';
      result = await db.query(query, [periodKey]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating/getting period:', error);
      throw error;
    }
  }

  static async getAllData() {
    try {
      // Get all periods
      const periodsQuery = 'SELECT * FROM periods ORDER BY year DESC, month DESC';
      const periodsResult = await db.query(periodsQuery);
    
      console.log('Found periods:', periodsResult.rows.length);
    
      const dashboardData = {};
    
      // Use hardcoded entities list (more reliable than database query)
      const entities = [
        'janashakthi-limited', 
        'janashakthi-insurance', 
        'first-capital', 
        'janashakthi-finance'
      ];
    
      for (const period of periodsResult.rows) {
        const periodKey = period.period_key;
        console.log(`Processing period: ${periodKey}`);
        dashboardData[periodKey] = {};
      
        for (const entityId of entities) {
          // Get KPIs for this entity and period
          const kpis = await this.getKPIsByEntityAndPeriod(entityId, period.id);
        
          // Get chart data for this entity and period  
          const chartData = await this.getChartData(entityId, period.id);
        
          console.log(`Entity ${entityId} in ${periodKey}: ${kpis.length} KPIs, ${Object.keys(chartData).length} chart datasets`);
        
          // Only include entity data if there are KPIs or chart data
          if (kpis.length > 0 || Object.keys(chartData).length > 0) {
            dashboardData[periodKey][entityId] = {
              kpis,
              ...chartData
            };
          }
        }
      
        // Remove empty periods
        if (Object.keys(dashboardData[periodKey]).length === 0) {
          delete dashboardData[periodKey];
        }
      }
    
      console.log('Final dashboard data structure:', Object.keys(dashboardData));
      return dashboardData;
    } catch (error) {
      console.error('Error getting all data:', error);
      throw error;
    }
  }
}

module.exports = Dashboard;