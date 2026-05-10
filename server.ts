import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import db from './server/db.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple Auth Middleware Simulation
  const authenticate = (req: any, res: any, next: any) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid user session' });
    }
    req.user = user;
    next();
  };

  const authorize = (roles: string[]) => {
    return (req: any, res: any, next: any) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }
      next();
    };
  };

  // Auth API
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password) as any;
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.status(401).json({ error: 'Invalid email or password' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // API Routes
  app.get('/api/dashboard/stats', authenticate, (req, res) => {
    try {
      const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as any;
      const totalStock = db.prepare('SELECT SUM(quantity) as count FROM stock_batches').get() as any;
      
      const lowStockItems = db.prepare(`
        SELECT p.name, p.sku, s.total as quantity, p.min_stock_level
        FROM products p 
        JOIN (SELECT product_id, SUM(quantity) as total FROM stock_batches GROUP BY product_id) s 
        ON p.id = s.product_id 
        WHERE s.total < p.min_stock_level
      `).all() as any[];

      const expiringSoonItems = db.prepare(`
        SELECT sb.id, p.name, sb.quantity, sb.expiry_date
        FROM stock_batches sb
        JOIN products p ON sb.product_id = p.id
        WHERE sb.expiry_date < date('now', '+30 days') AND sb.expiry_date >= date('now')
      `).all() as any[];

      const expired = db.prepare("SELECT SUM(quantity) as count FROM stock_batches WHERE expiry_date < date('now')").get() as any;
      const healthy = db.prepare("SELECT SUM(quantity) as count FROM stock_batches WHERE expiry_date >= date('now') OR expiry_date IS NULL").get() as any;

      res.json({
        totalProducts: totalProducts.count,
        totalStock: totalStock.count || 0,
        lowStockAlerts: lowStockItems.length,
        lowStockItems,
        expiringSoon: expiringSoonItems.length,
        expiringSoonItems,
        expiredStock: expired.count || 0,
        healthyStock: healthy.count || 0
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  app.get('/api/inventory', authenticate, (req, res) => {
    try {
      const inventory = db.prepare(`
        SELECT p.*, c.name as category_name, 
               SUM(CASE WHEN sb.expiry_date >= date('now') OR sb.expiry_date IS NULL THEN sb.quantity ELSE 0 END) as total_quantity 
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN stock_batches sb ON p.id = sb.product_id
        GROUP BY p.id
      `).all();
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });

  app.get('/api/categories', authenticate, (req, res) => {
    try {
      const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  app.get('/api/batches', authenticate, (req, res) => {
    try {
      const batches = db.prepare(`
        SELECT 
          sb.*, 
          p.name as product_name,
          p.sku as sku,
          p.selling_price as selling_price,
          p.category_id,
          p.description,
          c.name as category_name,
          c.description as category_description,
          p.min_stock_level,
          (SELECT SUM(quantity) FROM stock_batches WHERE product_id = p.id) as total_product_quantity
        FROM stock_batches sb
        JOIN products p ON sb.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY sb.expiry_date ASC
      `).all();
      res.json(batches);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch batches' });
    }
  });

  app.post('/api/stock/incoming', authenticate, (req, res) => {
    const { product_id, quantity, purchase_price, expiry_date } = req.body;
    
    if (!product_id || !quantity || !purchase_price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const result = db.prepare(`
        INSERT INTO stock_batches (product_id, quantity, purchase_price, expiry_date)
        VALUES (?, ?, ?, ?)
      `).run(product_id, quantity, purchase_price, expiry_date);
      
      res.json({ id: result.lastInsertRowid, message: 'Stock batch added successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add stock batch' });
    }
  });

  app.put('/api/products/:id', authenticate, authorize(['admin']), (req, res) => {
    const { id } = req.params;
    const { name, category_id, min_stock_level, sku, description, selling_price } = req.body;

    try {
      db.prepare(`
        UPDATE products 
        SET name = ?, category_id = ?, min_stock_level = ?, sku = ?, description = ?, selling_price = ?
        WHERE id = ?
      `).run(name, category_id, min_stock_level, sku, description, selling_price, id);
      
      res.json({ message: 'Product updated successfully' });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.put('/api/batches/:id', (req, res) => {
    const { id } = req.params;
    const { expiry_date, purchase_price, quantity } = req.body;

    try {
      db.prepare(`
        UPDATE stock_batches 
        SET expiry_date = ?, purchase_price = ?, quantity = ?
        WHERE id = ?
      `).run(expiry_date, purchase_price, quantity, id);
      
      res.json({ message: 'Batch updated successfully' });
    } catch (error) {
      console.error('Update batch error:', error);
      res.status(500).json({ error: 'Failed to update batch' });
    }
  });

  app.post('/api/batches/:id/dispose', (req, res) => {
    const { id } = req.params;
    const { reason, quantity, product_id } = req.body;
    try {
      db.transaction(() => {
        // Log disposal
        db.prepare('INSERT INTO disposal_history (batch_id, product_id, quantity, reason) VALUES (?, ?, ?, ?)').run(id, product_id, quantity, reason);
        // Update batch quantity to 0
        db.prepare('UPDATE stock_batches SET quantity = 0 WHERE id = ?').run(id);
      })();
      res.json({ success: true });
    } catch (error) {
      console.error('Dispose batch error:', error);
      res.status(500).json({ error: 'Failed to dispose batch' });
    }
  });

  app.get('/api/disposal-history', (req, res) => {
    try {
      const history = db.prepare(`
        SELECT dh.*, p.name as product_name 
        FROM disposal_history dh 
        JOIN products p ON dh.product_id = p.id 
        ORDER BY disposed_at DESC
      `).all();
      res.json(history);
    } catch (error) {
      console.error('Fetch disposal history error:', error);
      res.status(500).json({ error: 'Failed to fetch disposal history' });
    }
  });

  // Notifications API
  app.get('/api/notifications', (req, res) => {
    try {
      const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    try {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  app.get('/api/settings/notifications', (req, res) => {
    try {
      const settings = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings/notifications', (req, res) => {
    const { low_stock_threshold, expiry_threshold_days, enable_in_app, enable_email, email_address } = req.body;
    try {
      db.prepare(`
        UPDATE notification_settings 
        SET low_stock_threshold = ?, expiry_threshold_days = ?, enable_in_app = ?, enable_email = ?, email_address = ?
        WHERE id = 1
      `).run(low_stock_threshold, expiry_threshold_days, enable_in_app ? 1 : 0, enable_email ? 1 : 0, email_address);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  const checkNotifications = () => {
    try {
      const settings = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() as any;
      if (!settings || !settings.enable_in_app) return;

      // Check Low Stock
      const lowStockItems = db.prepare(`
        SELECT p.id, p.name, SUM(sb.quantity) as total 
        FROM products p 
        JOIN stock_batches sb ON p.id = sb.product_id 
        GROUP BY p.id 
        HAVING total <= ?
      `).all(settings.low_stock_threshold) as any[];

      lowStockItems.forEach(item => {
        const exists = db.prepare('SELECT id FROM notifications WHERE product_id = ? AND type = "low_stock" AND is_read = 0').get(item.id);
        if (!exists) {
          db.prepare('INSERT INTO notifications (type, title, message, product_id) VALUES (?, ?, ?, ?)')
            .run('low_stock', 'Low Stock Alert', `${item.name} is running low (${item.total} units remaining)`, item.id);
        }
      });

      // Check Expiry
      const expiringSoon = db.prepare(`
        SELECT sb.id, p.name, sb.expiry_date, sb.quantity
        FROM stock_batches sb 
        JOIN products p ON sb.product_id = p.id 
        WHERE sb.expiry_date <= date('now', '+' || ? || ' days') 
        AND sb.expiry_date >= date('now')
        AND sb.quantity > 0
      `).all(settings.expiry_threshold_days) as any[];

      expiringSoon.forEach(batch => {
        const exists = db.prepare('SELECT id FROM notifications WHERE batch_id = ? AND type = "expiring" AND is_read = 0').get(batch.id);
        if (!exists) {
          db.prepare('INSERT INTO notifications (type, title, message, batch_id) VALUES (?, ?, ?, ?)')
            .run('expiring', 'Expiry Alert', `Batch of ${batch.name} expires on ${batch.expiry_date}`, batch.id);
        }
      });

      // Mock Email Logic
      if (settings.enable_email && settings.email_address) {
        const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get() as any;
        if (unreadCount.count > 0) {
          console.log(`[EMAIL ALERT] Sending cumulative alert to ${settings.email_address}. Total unread alerts: ${unreadCount.count}`);
        }
      }

    } catch (error) {
      console.error('Notification check error:', error);
    }
  };

  // Run initial check
  checkNotifications();
  // Periodic check every hour
  setInterval(checkNotifications, 1000 * 60 * 60);

  app.post('/api/notifications/refresh', (req, res) => {
    checkNotifications();
    res.json({ success: true });
  });

  // Staff & Approval API
  app.get('/api/users', (req, res) => {
    try {
      const users = db.prepare('SELECT * FROM users').all();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.get('/api/staff/approvals', authenticate, (req, res) => {
    try {
      const approvals = db.prepare(`
        SELECT a.*, u.name as requester_name, r.name as reviewer_name 
        FROM approvals a
        JOIN users u ON a.requester_id = u.id
        LEFT JOIN users r ON a.reviewer_id = r.id
        ORDER BY a.created_at DESC
      `).all();
      res.json(approvals.map((a: any) => ({ ...a, data: JSON.parse(a.data) })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch approvals' });
    }
  });

  app.post('/api/staff/approvals/request', (req, res) => {
    const { type, data, requester_id } = req.body;
    try {
      const result = db.prepare(`
        INSERT INTO approvals (type, data, requester_id, status)
        VALUES (?, ?, ?, ?)
      `).run(type, JSON.stringify(data), requester_id || 2, 'pending');
      
      // Log the request
      db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)')
        .run(requester_id || 2, `REQUEST_${type.toUpperCase()}`, `User requested ${type}`);

      res.json({ id: result.lastInsertRowid, message: 'Approval request submitted' });
    } catch (error) {
      console.error('Approval request error:', error);
      res.status(500).json({ error: 'Failed to submit approval request' });
    }
  });

  app.post('/api/staff/approvals/:id/review', authenticate, authorize(['admin']), (req, res) => {
    const { id } = req.params;
    const { status, reviewer_id, notes } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    try {
      const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get() as any;
      if (!approval) return res.status(404).json({ error: 'Approval not found' });
      if (approval.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

      db.transaction(() => {
        db.prepare(`
          UPDATE approvals 
          SET status = ?, reviewer_id = ?, reviewed_at = DATETIME('now'), notes = ?
          WHERE id = ?
        `).run(status, reviewer_id || 1, notes, id);

        if (status === 'approved') {
          const data = JSON.parse(approval.data);
          
          if (approval.type === 'stock_intake') {
            db.prepare(`
              INSERT INTO stock_batches (product_id, quantity, purchase_price, expiry_date)
              VALUES (?, ?, ?, ?)
            `).run(data.product_id, data.quantity, data.purchase_price, data.expiry_date);
          } else if (approval.type === 'disposal') {
            db.prepare('INSERT INTO disposal_history (batch_id, product_id, quantity, reason) VALUES (?, ?, ?, ?)').run(data.batch_id, data.product_id, data.quantity, data.reason);
            db.prepare('UPDATE stock_batches SET quantity = 0 WHERE id = ?').run(data.batch_id);
          } else if (approval.type === 'product_update') {
            db.prepare(`
              UPDATE products 
              SET name = ?, category_id = ?, min_stock_level = ?, sku = ?, description = ?, selling_price = ?
              WHERE id = ?
            `).run(data.name, data.category_id, data.min_stock_level, data.sku, data.description, data.selling_price, data.id);
          }
        }

        // Log the decision
        db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)')
          .run(reviewer_id || 1, `${status.toUpperCase()}_${approval.type.toUpperCase()}`, `ID: ${id}`);
      })();

      res.json({ success: true, message: `Request ${status}` });
    } catch (error) {
      console.error('Review approval error:', error);
      res.status(500).json({ error: 'Failed to review approval' });
    }
  });

  app.get('/api/staff/audit-logs', (req, res) => {
    try {
      const logs = db.prepare(`
        SELECT l.*, u.name as user_name, u.role as user_role
        FROM audit_logs l
        JOIN users u ON l.user_id = u.id
        ORDER BY l.created_at DESC
        LIMIT 100
      `).all();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  app.get('/api/sales', authenticate, (req, res) => {
    try {
      const sales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC').all() as any[];
      const salesWithItems = sales.map(sale => {
        const items = db.prepare(`
          SELECT si.*, p.name as product_name 
          FROM sale_items si
          JOIN products p ON si.product_id = p.id
          WHERE si.sale_id = ?
        `).all(sale.id);
        return { ...sale, items };
      });
      res.json(salesWithItems);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sales' });
    }
  });

  app.post('/api/sales/status', (req, res) => {
    const { id, status } = req.body;
    try {
      db.prepare('UPDATE sales SET status = ? WHERE id = ?').run(status, id);
      
      // Log status update
      db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)')
        .run(1, 'UPDATE_SALE_STATUS', `Sale ID: ${id}, New Status: ${status}`);

      res.json({ message: 'Status updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  app.post('/api/sales', (req, res) => {
    const { customer_name, items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    try {
      const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      
      // Start transaction
      const insertSale = db.prepare('INSERT INTO sales (total_amount, customer_name, status) VALUES (?, ?, ?)');
      const insertSaleItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, batch_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
      const getBatches = db.prepare(`
        SELECT id, quantity 
        FROM stock_batches 
        WHERE product_id = ? AND quantity > 0 
        AND (expiry_date >= date('now') OR expiry_date IS NULL)
        ORDER BY received_at ASC
      `);
      const updateBatch = db.prepare('UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?');

      const transaction = db.transaction(() => {
        const saleResult = insertSale.run(total_amount, customer_name || 'Walk-in Customer', 'completed');
        const saleId = saleResult.lastInsertRowid;

        for (const item of items) {
          let remainingToDeduct = item.quantity;
          const batches = getBatches.all(item.product_id) as any[];

          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;

            const deductAmount = Math.min(batch.quantity, remainingToDeduct);
            insertSaleItem.run(saleId, item.product_id, batch.id, deductAmount, item.unit_price);
            updateBatch.run(deductAmount, batch.id);
            remainingToDeduct -= deductAmount;
          }

          if (remainingToDeduct > 0) {
            throw new Error(`Insufficient stock for product ID ${item.product_id}`);
          }
        }

        // Log the sale
        db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)')
          .run(2, 'COMPLETED_SALE', `Sale ID: ${saleId}, Amount: ${total_amount}`);

        return saleId;
      });

      const saleId = transaction();
      res.json({ id: saleId, message: 'Sale completed successfully' });
    } catch (error: any) {
      console.error('Sale error:', error);
      res.status(500).json({ error: error.message || 'Failed to complete sale' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
