import jwt from 'jsonwebtoken';

export const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

export const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
  });
};

// Generate next sequential number
export const nextNumber = (existingNumbers = [], prefix) => {
  const year = new Date().getFullYear();
  const nums = existingNumbers
    .map(n => parseInt((n || '').split('-').pop()))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
};

export const generateInvoiceNumber = (existing) => nextNumber(existing, 'BS-INV');
export const generateReceiptNumber = (existing) => nextNumber(existing, 'BS-REC');
export const generateExpenseNumber = (existing) => nextNumber(existing, 'BS-EXP');
export const generateItemCode      = (category, existing) => {
  const prefix = (category || 'OTH').substring(0, 3).toUpperCase();
  const nums = existing
    .map(n => parseInt((n || '').split('-').pop()))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
};
