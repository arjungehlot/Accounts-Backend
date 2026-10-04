import Expense from '../models/Expense.js';
import Activity from '../models/Activity.js';
import { generateExpenseNumber } from '../utils/helpers.js';

// GET /api/expenses
export const getExpenses = async (req, res, next) => {
  try {
    const { category, search, from, to } = req.query;
    const filter = {};

    if (category && category !== 'all') filter.category = category;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }

    const expenses = await Expense.find(filter).sort({ date: -1 }).lean();

    let result = expenses;
    if (search) {
      const q = search.toLowerCase();
      result = expenses.filter(e =>
        e.description?.toLowerCase().includes(q) ||
        e.vendor?.toLowerCase().includes(q) ||
        e.expenseNumber?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    next(error);
  }
};

// GET /api/expenses/:id
export const getExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id).lean();
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

// POST /api/expenses
export const createExpense = async (req, res, next) => {
  try {
    const existing = await Expense.find({}, 'expenseNumber').lean();
    const expenseNumber = generateExpenseNumber(existing.map(e => e.expenseNumber));

    const expense = await Expense.create({ ...req.body, expenseNumber });

    await Activity.create({
      text: `Expense ${expense.expenseNumber} added: ${expense.description}`,
      type: 'expense',
      color: '#EA580C',
      refId: expense._id.toString(),
    });

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

// PUT /api/expenses/:id
export const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/expenses/:id
export const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};
