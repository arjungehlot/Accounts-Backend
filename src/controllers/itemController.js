import ItemMaster from '../models/ItemMaster.js';

// GET /api/items
export const getItems = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;

    const items = await ItemMaster.find(filter).sort({ category: 1, name: 1 }).lean();

    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = items.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.code?.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    next(error);
  }
};

// GET /api/items/:id
export const getItem = async (req, res, next) => {
  try {
    const item = await ItemMaster.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

// POST /api/items
export const createItem = async (req, res, next) => {
  try {
    const item = await ItemMaster.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

// PUT /api/items/:id
export const updateItem = async (req, res, next) => {
  try {
    const item = await ItemMaster.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/items/:id
export const deleteItem = async (req, res, next) => {
  try {
    const item = await ItemMaster.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    next(error);
  }
};
