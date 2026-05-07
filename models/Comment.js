const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    sentimentScore: { type: Number, default: 0 },
    sentimentLabel: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' }
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
