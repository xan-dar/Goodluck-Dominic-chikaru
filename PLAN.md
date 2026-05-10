# StockMaster Pro: Comprehensive Development Plan

## 1. File Structure
```text
/
├── server/                 # Backend (Express)
│   ├── controllers/        # Request handlers
│   ├── models/             # Database interactions
│   ├── routes/             # API endpoint definitions
│   ├── middleware/         # Auth & Validation
│   └── db.ts               # Database connection
├── src/                    # Frontend (React + Vite)
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page-level components (Dashboard, Inventory, Sales)
│   ├── services/           # API fetch wrappers
│   ├── hooks/              # Custom React hooks
│   └── types/              # TypeScript interfaces
├── server.ts               # Main entry point (Full-stack)
└── package.json
```

## 2. Database Schema (MySQL)
- **categories**: `id`, `name`, `description`
- **products**: `id`, `category_id`, `sku`, `name`, `description`, `min_stock_level`
- **stock_batches**: `id`, `product_id`, `quantity`, `purchase_price`, `expiry_date`, `received_at`
- **sales**: `id`, `total_amount`, `tax_amount`, `created_at`, `user_id`
- **sale_items**: `id`, `sale_id`, `product_id`, `batch_id`, `quantity`, `unit_price`

## 3. Stored Procedures and Triggers
- **Trigger `after_sale_insert`**: Automatically decrements quantity in `stock_batches` when a sale item is added.
- **Procedure `GetExpiredStock`**: Returns all batches where `expiry_date < CURRENT_DATE`.
- **Procedure `ProcessSale`**: A transaction-wrapped procedure to ensure atomicity across `sales` and `sale_items`.

## 4. REST API Design
- `GET /api/products`: List all products with current total stock.
- `POST /api/stock/incoming`: Add new stock batches.
- `POST /api/sales`: Record a new sale (updates inventory).
- `GET /api/reports/expiry`: Get items nearing expiration.
- `GET /api/reports/dashboard`: Summary stats (total value, low stock alerts).

## 5. Server Route Separation
Routes are separated by resource (e.g., `productRoutes.ts`, `saleRoutes.ts`). Controllers handle the logic, and Models handle the raw SQL queries.

## 6. Client-Side Fetch Example
```typescript
const fetchInventory = async () => {
  const response = await fetch('/api/products');
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
};
```

## 7. Business Logic
- **Stock Depletion**: Uses First-In-First-Out (FIFO) based on expiry date to minimize waste.
- **Expiry Handling**: Flagging items within 30 days of expiry in the UI.
- **Reorder Logic**: Automatic alerts when `total_stock < min_stock_level`.

## 8. Concurrency Control
- **Database Transactions**: All sales operations are wrapped in `BEGIN TRANSACTION` and `COMMIT`.
- **Optimistic Locking**: Checking if stock is still available at the moment of sale execution.

## 9. Operational Features
- **Reporting**: PDF/CSV export for monthly sales and stock valuation.
- **Audit Log**: Tracking every manual stock adjustment.

## 10. Security Measures
- **JWT Authentication**: Secure API access.
- **Input Validation**: Using `Zod` or `Joi` to sanitize all incoming data.
- **CORS**: Restricting API access to the application domain.
