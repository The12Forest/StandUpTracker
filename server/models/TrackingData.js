const mongoose = require('mongoose');

const trackingDataSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  seconds: { type: Number, default: 0 },
  sessions: [{
    start: Date,
    end: Date,
    duration: Number,
  }],
  manualOverride: { type: Boolean, default: false },
  originalSeconds: { type: Number, default: null },
  // Report system fields
  clearedByReports: { type: Boolean, default: false },
  reportClearedAt: { type: Date, default: null },
  reportCount: { type: Number, default: 0 },
  preReportSeconds: { type: Number, default: null },
  reportRestored: { type: Boolean, default: false },
  reportRestoredBy: { type: String, default: null },
  reportRestoredAt: { type: Date, default: null },
}, { timestamps: true });

trackingDataSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TrackingData', trackingDataSchema);
