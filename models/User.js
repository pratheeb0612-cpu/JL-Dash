const db = require('../database/connection');
const bcrypt = require('bcrypt');

class User {
  static async create({ email, name, password, role = 'user' }) {
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const query = `
        INSERT INTO users (email, name, password_hash, role)
        VALUES (?, ?, ?, ?)
      `;
      
      const result = await db.query(query, [email, name, hashedPassword, role]);
      
      // Get the created user
      return await this.findById(result.rows[0].id);
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const query = 'SELECT id, email, name, role, created_at, last_login FROM users WHERE id = ?';
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const query = 'SELECT * FROM users WHERE email = ?';
      const result = await db.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async updateLastLogin(id) {
    try {
      const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';
      await db.query(query, [id]);
    } catch (error) {
      console.error('Error updating last login:', error);
      throw error;
    }
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async count() {
    try {
      const query = 'SELECT COUNT(*) as count FROM users';
      const result = await db.query(query);
      return result.rows[0].count;
    } catch (error) {
      console.error('Error counting users:', error);
      throw error;
    }
  }
}

module.exports = User;