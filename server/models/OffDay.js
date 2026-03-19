const mongoose = require('mongoose');

const offDaySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

offDaySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('OffDay', offDaySchema);
