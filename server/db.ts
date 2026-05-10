import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'warehouse.db'));

// Migration for existing users table to add password column if it doesn't exist
try {
  db.prepare('SELECT password FROM users LIMIT 1').get();
} catch (e: any) {
  if (e.message.includes('no such column: password')) {
    db.exec('ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT "changeme"');
  }
}

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    min_stock_level INTEGER DEFAULT 10,
    unit TEXT DEFAULT 'pcs',
    selling_price REAL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    purchase_price REAL,
    expiry_date TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_amount REAL NOT NULL,
    tax_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    customer_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    batch_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
  );

  CREATE TABLE IF NOT EXISTS disposal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    disposed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- Trigger to automatically deduct stock when a sale item is inserted
  CREATE TRIGGER IF NOT EXISTS deduct_stock_after_sale
  AFTER INSERT ON sale_items
  FOR EACH ROW
  BEGIN
    UPDATE stock_batches 
    SET quantity = quantity - NEW.quantity 
    WHERE id = NEW.batch_id;
  END;

  -- Trigger to restore stock if a sale item is deleted
  CREATE TRIGGER IF NOT EXISTS restore_stock_after_sale_item_delete
  AFTER DELETE ON sale_items
  FOR EACH ROW
  BEGIN
    UPDATE stock_batches 
    SET quantity = quantity + OLD.quantity 
    WHERE id = OLD.batch_id;
  END;

  CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    low_stock_threshold INTEGER DEFAULT 10,
    expiry_threshold_days INTEGER DEFAULT 7,
    enable_in_app BOOLEAN DEFAULT 1,
    enable_email BOOLEAN DEFAULT 0,
    email_address TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    product_id INTEGER,
    batch_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'stock_intake', 'disposal', 'product_creation', 'sale'
    data TEXT NOT NULL, -- JSON string of the proposed action
    requester_id INTEGER,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    reviewer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    notes TEXT,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (reviewer_id) REFERENCES users(id)
  );

  INSERT OR IGNORE INTO notification_settings (id, low_stock_threshold, expiry_threshold_days, enable_in_app, enable_email) 
  VALUES (1, 10, 7, 1, 0);

  -- Seed some users
  INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (1, 'Admin User', 'admin@stockmaster.com', 'admin123', 'admin');
  INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (2, 'Warehouse Staff', 'staff@stockmaster.com', 'staff123', 'staff');
  
  -- Force update passwords for seeded users
  UPDATE users SET password = 'admin123' WHERE id = 1;
  UPDATE users SET password = 'staff123' WHERE id = 2;
`);

// Ensure specific categories exist and are updated
const targetCategories = [
  { name: 'Food & Beverage', desc: '' },
  { name: 'Pharmaceuticals', desc: '' },
  { name: 'Personal Care & Cosmetics', desc: '' },
  { name: 'Home Cleaning & Household Goods', desc: '' }
];

targetCategories.forEach((cat, index) => {
  const id = index + 1;
  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (existing) {
    db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?').run(cat.name, cat.desc, id);
  } else {
    db.prepare('INSERT INTO categories (id, name, description) VALUES (?, ?, ?)').run(id, cat.name, cat.desc);
  }
});

// Seed initial data if empty or incomplete
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
if (productCount.count < 200) {
  const productsToSeed = [
    // Food & Beverage (Category 1)
    { catId: 1, sku: 'FB-001', name: 'Whole Milk', desc: '1L Fresh Whole Milk', perishable: true },
    { catId: 1, sku: 'FB-002', name: 'Low-fat Milk', desc: '1L Low-fat Milk', perishable: true },
    { catId: 1, sku: 'FB-003', name: 'Greek Yogurt', desc: '500g Plain Greek Yogurt', perishable: true },
    { catId: 1, sku: 'FB-004', name: 'Cheddar Cheese', desc: '250g Sharp Cheddar', perishable: true },
    { catId: 1, sku: 'FB-005', name: 'Butter', desc: '200g Salted Butter', perishable: true },
    { catId: 1, sku: 'FB-006', name: 'White Bread', desc: 'Sliced White Bread', perishable: true },
    { catId: 1, sku: 'FB-007', name: 'Whole Wheat Bread', desc: 'Sliced Whole Wheat', perishable: true },
    { catId: 1, sku: 'FB-008', name: 'Croissants', desc: 'Pack of 4', perishable: true },
    { catId: 1, sku: 'FB-009', name: 'Bagels', desc: 'Pack of 6', perishable: true },
    { catId: 1, sku: 'FB-010', name: 'Corn Flakes', desc: '500g Cereal', perishable: false },
    { catId: 1, sku: 'FB-011', name: 'Oats', desc: '1kg Rolled Oats', perishable: false },
    { catId: 1, sku: 'FB-012', name: 'Basmati Rice', desc: '5kg Bag', perishable: false },
    { catId: 1, sku: 'FB-013', name: 'Spaghetti', desc: '500g Pasta', perishable: false },
    { catId: 1, sku: 'FB-014', name: 'Ground Beef', desc: '500g Lean', perishable: true },
    { catId: 1, sku: 'FB-015', name: 'Chicken Breast', desc: '1kg Boneless', perishable: true },
    { catId: 1, sku: 'FB-016', name: 'Pork Chops', desc: '500g', perishable: true },
    { catId: 1, sku: 'FB-017', name: 'Salmon Fillet', desc: '250g Fresh', perishable: true },
    { catId: 1, sku: 'FB-018', name: 'Canned Tuna', desc: '160g in Brine', perishable: false },
    { catId: 1, sku: 'FB-019', name: 'Eggs (Dozen)', desc: 'Large Grade A', perishable: true },
    { catId: 1, sku: 'FB-020', name: 'Potato Chips', desc: '150g Classic', perishable: false },
    { catId: 1, sku: 'FB-021', name: 'Chocolate Bar', desc: '100g Milk Chocolate', perishable: false },
    { catId: 1, sku: 'FB-022', name: 'Gummy Bears', desc: '200g Fruit Flavors', perishable: false },
    { catId: 1, sku: 'FB-023', name: 'Canned Peas', desc: '400g', perishable: false },
    { catId: 1, sku: 'FB-024', name: 'Canned Corn', desc: '400g', perishable: false },
    { catId: 1, sku: 'FB-025', name: 'Tomato Paste', desc: '200g', perishable: false },
    { catId: 1, sku: 'FB-026', name: 'Apples', desc: '1kg Red', perishable: true },
    { catId: 1, sku: 'FB-027', name: 'Bananas', desc: '1kg Bunch', perishable: true },
    { catId: 1, sku: 'FB-028', name: 'Oranges', desc: '1kg', perishable: true },
    { catId: 1, sku: 'FB-029', name: 'Strawberries', desc: '250g', perishable: true },
    { catId: 1, sku: 'FB-030', name: 'Spinach', desc: '200g Bag', perishable: true },
    { catId: 1, sku: 'FB-031', name: 'Broccoli', desc: 'Each', perishable: true },
    { catId: 1, sku: 'FB-032', name: 'Carrots', desc: '1kg', perishable: true },
    { catId: 1, sku: 'FB-033', name: 'Potatoes', desc: '2kg Bag', perishable: true },
    { catId: 1, sku: 'FB-034', name: 'Onions', desc: '1kg', perishable: true },
    { catId: 1, sku: 'FB-035', name: 'Garlic', desc: '3 Pack', perishable: true },
    { catId: 1, sku: 'FB-036', name: 'Coffee Beans', desc: '250g Roasted', perishable: false },
    { catId: 1, sku: 'FB-037', name: 'Black Tea Bags', desc: '50pk', perishable: false },
    { catId: 1, sku: 'FB-038', name: 'Green Tea', desc: '20pk', perishable: false },
    { catId: 1, sku: 'FB-039', name: 'Orange Juice', desc: '1L', perishable: false },
    { catId: 1, sku: 'FB-040', name: 'Apple Juice', desc: '1L', perishable: false },
    { catId: 1, sku: 'FB-041', name: 'Bottled Water', desc: '1.5L', perishable: false },
    { catId: 1, sku: 'FB-042', name: 'Sparkling Water', desc: '1L', perishable: false },
    { catId: 1, sku: 'FB-043', name: 'Olive Oil', desc: '500ml Extra Virgin', perishable: false },
    { catId: 1, sku: 'FB-044', name: 'Vegetable Oil', desc: '1L', perishable: false },
    { catId: 1, sku: 'FB-045', name: 'Sugar', desc: '1kg White', perishable: false },
    { catId: 1, sku: 'FB-046', name: 'Salt', desc: '500g Table', perishable: false },
    { catId: 1, sku: 'FB-047', name: 'Black Pepper', desc: '50g Ground', perishable: false },
    { catId: 1, sku: 'FB-048', name: 'Honey', desc: '250g Pure', perishable: false },
    { catId: 1, sku: 'FB-049', name: 'Peanut Butter', desc: '340g', perishable: false },
    { catId: 1, sku: 'FB-050', name: 'Strawberry Jam', desc: '340g', perishable: false },

    // Pharmaceuticals (Category 2)
    { catId: 2, sku: 'PH-001', name: 'Paracetamol 500mg', desc: 'Pain relief', perishable: true },
    { catId: 2, sku: 'PH-002', name: 'Ibuprofen 200mg', desc: 'Anti-inflammatory', perishable: true },
    { catId: 2, sku: 'PH-003', name: 'Aspirin 81mg', desc: 'Low dose', perishable: true },
    { catId: 2, sku: 'PH-004', name: 'Cetirizine', desc: 'Allergy relief', perishable: true },
    { catId: 2, sku: 'PH-005', name: 'Loratadine', desc: 'Non-drowsy allergy', perishable: true },
    { catId: 2, sku: 'PH-006', name: 'Cough Syrup', desc: '100ml', perishable: true },
    { catId: 2, sku: 'PH-007', name: 'Throat Lozenges', desc: 'Pack of 16', perishable: true },
    { catId: 2, sku: 'PH-008', name: 'Antacid Tablets', desc: 'Pack of 24', perishable: true },
    { catId: 2, sku: 'PH-009', name: 'Vitamin C 1000mg', desc: 'Immune support', perishable: true },
    { catId: 2, sku: 'PH-010', name: 'Multivitamin (Adult)', desc: 'Daily support', perishable: true },
    { catId: 2, sku: 'PH-011', name: 'Multivitamin (Kids)', desc: 'Chewable', perishable: true },
    { catId: 2, sku: 'PH-012', name: 'Fish Oil Capsules', desc: 'Omega-3', perishable: true },
    { catId: 2, sku: 'PH-013', name: 'Calcium + Vit D', desc: 'Bone health', perishable: true },
    { catId: 2, sku: 'PH-014', name: 'Magnesium Tablets', desc: 'Muscle health', perishable: true },
    { catId: 2, sku: 'PH-015', name: 'Zinc Supplements', desc: 'Immune health', perishable: true },
    { catId: 2, sku: 'PH-016', name: 'Probiotics', desc: 'Digestive health', perishable: true },
    { catId: 2, sku: 'PH-017', name: 'Melatonin', desc: 'Sleep aid', perishable: true },
    { catId: 2, sku: 'PH-018', name: 'Iron Supplements', desc: 'Blood health', perishable: true },
    { catId: 2, sku: 'PH-019', name: 'B-Complex Vitamins', desc: 'Energy support', perishable: true },
    { catId: 2, sku: 'PH-020', name: 'Vitamin D3', desc: '1000 IU', perishable: true },
    { catId: 2, sku: 'PH-021', name: 'Digital Thermometer', desc: 'Fast reading', perishable: false },
    { catId: 2, sku: 'PH-022', name: 'Blood Pressure Monitor', desc: 'Upper arm', perishable: false },
    { catId: 2, sku: 'PH-023', name: 'Pulse Oximeter', desc: 'Fingertip', perishable: false },
    { catId: 2, sku: 'PH-024', name: 'First Aid Kit', desc: 'Travel size', perishable: false },
    { catId: 2, sku: 'PH-025', name: 'Adhesive Bandages', desc: 'Assorted sizes', perishable: false },
    { catId: 2, sku: 'PH-026', name: 'Gauze Pads', desc: 'Sterile', perishable: false },
    { catId: 2, sku: 'PH-027', name: 'Medical Tape', desc: 'Micropore', perishable: false },
    { catId: 2, sku: 'PH-028', name: 'Antiseptic Liquid', desc: '250ml', perishable: false },
    { catId: 2, sku: 'PH-029', name: 'Rubbing Alcohol', desc: '500ml', perishable: false },
    { catId: 2, sku: 'PH-030', name: 'Hand Sanitizer', desc: '500ml Pump', perishable: false },
    { catId: 2, sku: 'PH-031', name: 'Face Masks (50pk)', desc: '3-ply', perishable: false },
    { catId: 2, sku: 'PH-032', name: 'Latex Gloves', desc: 'Box of 100', perishable: false },
    { catId: 2, sku: 'PH-033', name: 'Eye Drops', desc: 'Lubricating', perishable: false },
    { catId: 2, sku: 'PH-034', name: 'Nasal Spray', desc: 'Saline', perishable: false },
    { catId: 2, sku: 'PH-035', name: 'Hydrocortisone Cream', desc: 'Anti-itch', perishable: false },
    { catId: 2, sku: 'PH-036', name: 'Antifungal Cream', desc: 'Athletes foot', perishable: false },
    { catId: 2, sku: 'PH-037', name: 'Burn Ointment', desc: 'Soothing', perishable: false },
    { catId: 2, sku: 'PH-038', name: 'Muscle Rub Gel', desc: 'Pain relief', perishable: false },
    { catId: 2, sku: 'PH-039', name: 'Pregnancy Test', desc: 'Digital', perishable: false },
    { catId: 2, sku: 'PH-040', name: 'Ovulation Test', desc: 'Pack of 7', perishable: false },
    { catId: 2, sku: 'PH-041', name: 'Glucose Test Strips', desc: 'Pack of 50', perishable: false },
    { catId: 2, sku: 'PH-042', name: 'Lancets', desc: 'Pack of 100', perishable: false },
    { catId: 2, sku: 'PH-043', name: 'Compression Socks', desc: 'Medium', perishable: false },
    { catId: 2, sku: 'PH-044', name: 'Knee Brace', desc: 'Adjustable', perishable: false },
    { catId: 2, sku: 'PH-045', name: 'Wrist Splint', desc: 'Left/Right', perishable: false },
    { catId: 2, sku: 'PH-046', name: 'Heating Pad', desc: 'Electric', perishable: false },
    { catId: 2, sku: 'PH-047', name: 'Ice Pack', desc: 'Reusable', perishable: false },
    { catId: 2, sku: 'PH-048', name: 'Ear Wax Removal Kit', desc: 'Drops + Bulb', perishable: false },
    { catId: 2, sku: 'PH-049', name: 'Denture Adhesive', desc: 'Strong hold', perishable: false },
    { catId: 2, sku: 'PH-050', name: 'Contact Lens Solution', desc: 'Multi-purpose', perishable: false },

    // Personal Care & Cosmetics (Category 3)
    { catId: 3, sku: 'PC-001', name: 'Moisturizing Lotion', desc: '400ml', perishable: true },
    { catId: 3, sku: 'PC-002', name: 'Sunscreen SPF 50', desc: '200ml', perishable: true },
    { catId: 3, sku: 'PC-003', name: 'Night Cream', desc: '50ml', perishable: true },
    { catId: 3, sku: 'PC-004', name: 'Face Wash', desc: '150ml', perishable: true },
    { catId: 3, sku: 'PC-005', name: 'Toner', desc: '200ml', perishable: true },
    { catId: 3, sku: 'PC-006', name: 'Serum (Vitamin C)', desc: '30ml', perishable: true },
    { catId: 3, sku: 'PC-007', name: 'Sheet Masks', desc: 'Pack of 5', perishable: true },
    { catId: 3, sku: 'PC-008', name: 'Lip Balm', desc: 'Shea Butter', perishable: true },
    { catId: 3, sku: 'PC-009', name: 'Shampoo (Normal)', desc: '400ml', perishable: false },
    { catId: 3, sku: 'PC-010', name: 'Conditioner', desc: '400ml', perishable: true },
    { catId: 3, sku: 'PC-011', name: 'Hair Mask', desc: '250ml', perishable: true },
    { catId: 3, sku: 'PC-012', name: 'Hair Oil', desc: 'Argan Oil', perishable: true },
    { catId: 3, sku: 'PC-013', name: 'Hair Spray', desc: 'Extra Hold', perishable: true },
    { catId: 3, sku: 'PC-014', name: 'Dry Shampoo', desc: '200ml', perishable: true },
    { catId: 3, sku: 'PC-015', name: 'Foundation', desc: 'Liquid', perishable: true },
    { catId: 3, sku: 'PC-016', name: 'Concealer', desc: 'Long-wear', perishable: true },
    { catId: 3, sku: 'PC-017', name: 'Mascara', desc: 'Waterproof', perishable: true },
    { catId: 3, sku: 'PC-018', name: 'Eyeliner', desc: 'Black Pen', perishable: true },
    { catId: 3, sku: 'PC-019', name: 'Eyeshadow Palette', desc: 'Nude Tones', perishable: true },
    { catId: 3, sku: 'PC-020', name: 'Lipstick (Red)', desc: 'Matte', perishable: true },
    { catId: 3, sku: 'PC-021', name: 'Lip Gloss', desc: 'Clear', perishable: true },
    { catId: 3, sku: 'PC-022', name: 'Blush', desc: 'Powder', perishable: true },
    { catId: 3, sku: 'PC-023', name: 'Setting Powder', desc: 'Translucent', perishable: true },
    { catId: 3, sku: 'PC-024', name: 'Makeup Remover', desc: 'Micellar Water', perishable: true },
    { catId: 3, sku: 'PC-025', name: 'Men\'s Fragrance', desc: '100ml EDT', perishable: true },
    { catId: 3, sku: 'PC-026', name: 'Women\'s Fragrance', desc: '100ml EDP', perishable: true },
    { catId: 3, sku: 'PC-027', name: 'Body Mist', desc: '250ml', perishable: true },
    { catId: 3, sku: 'PC-028', name: 'Deodorant Spray', desc: '150ml', perishable: false },
    { catId: 3, sku: 'PC-029', name: 'Roll-on Deodorant', desc: '50ml', perishable: false },
    { catId: 3, sku: 'PC-030', name: 'Bar Soap', desc: 'Pack of 3', perishable: false },
    { catId: 3, sku: 'PC-031', name: 'Liquid Body Wash', desc: '500ml', perishable: false },
    { catId: 3, sku: 'PC-032', name: 'Bubble Bath', desc: '500ml', perishable: false },
    { catId: 3, sku: 'PC-033', name: 'Toothpaste (Whitening)', desc: '100ml', perishable: false },
    { catId: 3, sku: 'PC-034', name: 'Toothbrush (Medium)', desc: 'Pack of 2', perishable: false },
    { catId: 3, sku: 'PC-035', name: 'Electric Toothbrush', desc: 'Rechargeable', perishable: false },
    { catId: 3, sku: 'PC-036', name: 'Mouthwash', desc: '500ml', perishable: false },
    { catId: 3, sku: 'PC-037', name: 'Dental Floss', desc: '50m', perishable: false },
    { catId: 3, sku: 'PC-038', name: 'Shaving Cream', desc: '200ml', perishable: false },
    { catId: 3, sku: 'PC-039', name: 'Disposable Razors', desc: 'Pack of 5', perishable: false },
    { catId: 3, sku: 'PC-040', name: 'Aftershave Balm', desc: '100ml', perishable: false },
    { catId: 3, sku: 'PC-041', name: 'Cotton Pads', desc: 'Pack of 80', perishable: false },
    { catId: 3, sku: 'PC-042', name: 'Cotton Swabs', desc: 'Pack of 200', perishable: false },
    { catId: 3, sku: 'PC-043', name: 'Nail Polish', desc: 'Assorted colors', perishable: false },
    { catId: 3, sku: 'PC-044', name: 'Nail Polish Remover', desc: '100ml', perishable: false },
    { catId: 3, sku: 'PC-045', name: 'Hand Cream', desc: '75ml', perishable: false },
    { catId: 3, sku: 'PC-046', name: 'Foot Cream', desc: '75ml', perishable: false },
    { catId: 3, sku: 'PC-047', name: 'Talcum Powder', desc: '200g', perishable: false },
    { catId: 3, sku: 'PC-048', name: 'Hair Dye (Black)', desc: 'Permanent', perishable: false },
    { catId: 3, sku: 'PC-049', name: 'Beard Oil', desc: '30ml', perishable: false },
    { catId: 3, sku: 'PC-050', name: 'Face Scrub', desc: '100ml', perishable: false },

    // Home Cleaning & Household Goods (Category 4)
    { catId: 4, sku: 'HC-001', name: 'Laundry Detergent (Liquid)', desc: '2L', perishable: false },
    { catId: 4, sku: 'HC-002', name: 'Laundry Pods', desc: 'Pack of 30', perishable: false },
    { catId: 4, sku: 'HC-003', name: 'Fabric Softener', desc: '1.5L', perishable: false },
    { catId: 4, sku: 'HC-004', name: 'Stain Remover', desc: '500ml', perishable: false },
    { catId: 4, sku: 'HC-005', name: 'Dish Soap', desc: '750ml', perishable: false },
    { catId: 4, sku: 'HC-006', name: 'Dishwasher Tablets', desc: 'Pack of 40', perishable: false },
    { catId: 4, sku: 'HC-007', name: 'All-Purpose Cleaner', desc: '1L Spray', perishable: false },
    { catId: 4, sku: 'HC-008', name: 'Glass Cleaner', desc: '750ml', perishable: false },
    { catId: 4, sku: 'HC-009', name: 'Kitchen Degreaser', desc: '500ml', perishable: false },
    { catId: 4, sku: 'HC-010', name: 'Bathroom Cleaner', desc: '750ml', perishable: false },
    { catId: 4, sku: 'HC-011', name: 'Toilet Bowl Cleaner', desc: '750ml', perishable: false },
    { catId: 4, sku: 'HC-012', name: 'Floor Cleaner (Wood)', desc: '1L', perishable: false },
    { catId: 4, sku: 'HC-013', name: 'Floor Cleaner (Tile)', desc: '1L', perishable: false },
    { catId: 4, sku: 'HC-014', name: 'Disinfectant Spray', desc: '500ml', perishable: false },
    { catId: 4, sku: 'HC-015', name: 'Disinfectant Wipes', desc: 'Pack of 60', perishable: false },
    { catId: 4, sku: 'HC-016', name: 'Air Freshener Spray', desc: '300ml', perishable: false },
    { catId: 4, sku: 'HC-017', name: 'Scented Candles', desc: 'Lavender', perishable: false },
    { catId: 4, sku: 'HC-018', name: 'Paper Towels', desc: '2 Roll Pack', perishable: false },
    { catId: 4, sku: 'HC-019', name: 'Toilet Paper (12pk)', desc: '3-ply', perishable: false },
    { catId: 4, sku: 'HC-020', name: 'Facial Tissues', desc: 'Box of 100', perishable: false },
    { catId: 4, sku: 'HC-021', name: 'Napkins', desc: 'Pack of 100', perishable: false },
    { catId: 4, sku: 'HC-022', name: 'Trash Bags (Large)', desc: 'Pack of 20', perishable: false },
    { catId: 4, sku: 'HC-023', name: 'Trash Bags (Small)', desc: 'Pack of 50', perishable: false },
    { catId: 4, sku: 'HC-024', name: 'Aluminum Foil', desc: '30m', perishable: false },
    { catId: 4, sku: 'HC-025', name: 'Plastic Wrap', desc: '30m', perishable: false },
    { catId: 4, sku: 'HC-026', name: 'Parchment Paper', desc: '20m', perishable: false },
    { catId: 4, sku: 'HC-027', name: 'Ziploc Bags (Gallon)', desc: 'Pack of 20', perishable: false },
    { catId: 4, sku: 'HC-028', name: 'Ziploc Bags (Sandwich)', desc: 'Pack of 50', perishable: false },
    { catId: 4, sku: 'HC-029', name: 'Sponges (3pk)', desc: 'Non-scratch', perishable: false },
    { catId: 4, sku: 'HC-030', name: 'Scouring Pads', desc: 'Metal', perishable: false },
    { catId: 4, sku: 'HC-031', name: 'Microfiber Cloths', desc: 'Pack of 4', perishable: false },
    { catId: 4, sku: 'HC-032', name: 'Rubber Gloves', desc: 'Medium', perishable: false },
    { catId: 4, sku: 'HC-033', name: 'Broom and Dustpan', desc: 'Set', perishable: false },
    { catId: 4, sku: 'HC-034', name: 'Mop and Bucket', desc: 'Set', perishable: false },
    { catId: 4, sku: 'HC-035', name: 'Vacuum Bags', desc: 'Universal', perishable: false },
    { catId: 4, sku: 'HC-036', name: 'Lint Roller', desc: '60 Sheets', perishable: false },
    { catId: 4, sku: 'HC-037', name: 'Drain Opener', desc: '1L Liquid', perishable: false },
    { catId: 4, sku: 'HC-038', name: 'Furniture Polish', desc: '300ml', perishable: false },
    { catId: 4, sku: 'HC-039', name: 'Carpet Cleaner', desc: '500ml', perishable: false },
    { catId: 4, sku: 'HC-040', name: 'Oven Cleaner', desc: '500ml', perishable: false },
    { catId: 4, sku: 'HC-041', name: 'Silver Polish', desc: '200ml', perishable: false },
    { catId: 4, sku: 'HC-042', name: 'Shoe Polish', desc: 'Black', perishable: false },
    { catId: 4, sku: 'HC-043', name: 'Batteries (AA)', desc: 'Pack of 8', perishable: false },
    { catId: 4, sku: 'HC-044', name: 'Batteries (AAA)', desc: 'Pack of 8', perishable: false },
    { catId: 4, sku: 'HC-045', name: 'Light Bulbs (LED)', desc: 'Pack of 4', perishable: false },
    { catId: 4, sku: 'HC-046', name: 'Extension Cord', desc: '3m', perishable: false },
    { catId: 4, sku: 'HC-047', name: 'Matches', desc: 'Box of 10', perishable: false },
    { catId: 4, sku: 'HC-048', name: 'Lighter', desc: 'Refillable', perishable: false },
    { catId: 4, sku: 'HC-049', name: 'Insecticide Spray', desc: '400ml', perishable: false },
    { catId: 4, sku: 'HC-050', name: 'Mouse Traps', desc: 'Pack of 2', perishable: false }
  ];

  const insertProduct = db.prepare('INSERT OR IGNORE INTO products (category_id, sku, name, description, min_stock_level, selling_price) VALUES (?, ?, ?, ?, ?, ?)');
  const insertBatch = db.prepare('INSERT INTO stock_batches (product_id, quantity, purchase_price, expiry_date) VALUES (?, ?, ?, ?)');
  const getProductId = db.prepare('SELECT id FROM products WHERE sku = ?');

  productsToSeed.forEach((p) => {
    const randomSellingPrice = parseFloat((Math.random() * 20 + 5).toFixed(2));
    insertProduct.run(p.catId, p.sku, p.name, p.desc, 10, randomSellingPrice);
    
    // Check if product was just inserted or already existed
    const product = getProductId.get(p.sku) as { id: number };
    
    // Check if it has any stock
    const stockCount = db.prepare('SELECT COUNT(*) as count FROM stock_batches WHERE product_id = ?').get(product.id) as { count: number };
    
    if (stockCount.count === 0) {
      const randomQty = Math.floor(Math.random() * 100) + 20;
      const randomPrice = parseFloat((Math.random() * 10 + 1).toFixed(2));
      
      let expiryDate = null;
      if (p.perishable) {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        expiryDate = date.toISOString().split('T')[0];
      }
      
      insertBatch.run(product.id, randomQty, randomPrice, expiryDate);
    }
  });

  // Ensure at least one sale exists
  const saleCount = db.prepare('SELECT COUNT(*) as count FROM sales').get() as { count: number };
  if (saleCount.count === 0) {
    db.prepare('INSERT INTO sales (total_amount, tax_amount, status, customer_name) VALUES (?, ?, ?, ?)')
      .run(45.00, 2, 'completed', 'John Smith');

    db.prepare('INSERT INTO sale_items (sale_id, product_id, batch_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)')
      .run(1, 1, 1, 5, 3.5);
  }

  // Correct existing perishable goods expiry dates (one-time fix)
  const perishableSkus = productsToSeed.filter(p => p.perishable).map(p => p.sku);
  const updateExpiry = db.prepare(`
    UPDATE stock_batches 
    SET expiry_date = date('now', '+30 days') 
    WHERE product_id IN (SELECT id FROM products WHERE sku = ?) 
    AND (expiry_date IS NULL OR expiry_date = '')
  `);
  
  perishableSkus.forEach(sku => {
    updateExpiry.run(sku);
  });
}

export default db;
