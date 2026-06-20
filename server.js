const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware configuration
app.use(express.json());
app.use(express.static('public')); // Serves the frontend UI
app.use('/uploads', express.static('uploads')); // Serves uploaded screenshots

// Configure file uploads for screenshots
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, 'telebirr-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Mock Database arrays to track state
const approvedTransactions = new Set(['CR12345678', 'FT87654321']); // Already used IDs
const pendingDeposits = [];

/**
 * Validation Helper for Telebirr Transaction Format
 * Ensures incoming IDs roughly match Ethio Telecom receipt structures
 */
function isValidTelebirrFormat(txId) {
    // Regex matches common Telebirr formats (e.g., 2 letters followed by numbers/alphanumeric)
    const telebirrRegex = /^[A-Z0-9]{8,12}$/i;
    return telebirrRegex.test(txId);
}

// Endpoint 1: User submits a new deposit claim
app.post('/api/deposit/submit', upload.single('screenshot'), (req, res) => {
    const { userId, amount, transactionId } = req.body;
    const file = req.file;

    if (!userId || !amount || !transactionId || !file) {
        return res.status(400).json({ error: 'All fields and screenshot are required.' });
    }

    // 1. Structural Check
    if (!isValidTelebirrFormat(transactionId)) {
        return res.status(400).json({ error: 'Invalid Telebirr transaction ID format.' });
    }

    // 2. Anti-Fraud Idempotency Check (Check if ID already claimed)
    if (approvedTransactions.has(transactionId) || pendingDeposits.some(d => d.transactionId === transactionId)) {
        return res.status(409).json({ error: 'This Transaction ID has already been submitted or processed.' });
    }

    // 3. Queue the deposit for Admin Manual Review
    const newDeposit = {
        id: pendingDeposits.length + 1,
        userId,
        amount: parseFloat(amount),
        transactionId: transactionId.toUpperCase(),
        screenshotUrl: `/uploads/${file.filename}`,
        status: 'Pending',
        timestamp: new Date().toLocaleString()
    };

    pendingDeposits.push(newDeposit);
    res.status(201).json({ message: 'Deposit submitted successfully. Awaiting admin approval.', data: newDeposit });
});

// Endpoint 2: Admin retrieves all pending claims
app.get('/api/admin/pending', (req, res) => {
    res.json(pendingDeposits);
});

// Endpoint 3: Admin Approves or Rejects a transaction
app.post('/api/admin/verify', (req, res) => {
    const { transactionId, action } = req.body; // action can be 'Approve' or 'Reject'

    const depositIndex = pendingDeposits.findIndex(d => d.transactionId === transactionId);
    
    if (depositIndex === -1) {
        return res.status(404).json({ error: 'Transaction record not found.' });
    }

    const deposit = pendingDeposits[depositIndex];

    if (action === 'Approve') {
        deposit.status = 'Approved';
        approvedTransactions.add(transactionId); // Lock the ID permanently to prevent double claims
        
        // TODO: Insert your logic here to increment user's balance in your real betting database
        
        pendingDeposits.splice(depositIndex, 1); // Remove from pending list
        return res.json({ message: `Successfully approved. User ${deposit.userId} credited with ${deposit.amount} Birr.` });
    } else {
        deposit.status = 'Rejected';
        pendingDeposits.splice(depositIndex, 1); // Clear from queue
        return res.json({ message: 'Transaction rejected successfully.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
