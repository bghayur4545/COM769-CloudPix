const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    title: { type: String, required: true },
    caption: { type: String, default: '' },
    location: { type: String, default: '' },
    people: [{ type: String }],
    imageUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: '' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    ratings: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        value: { type: Number, min: 1, max: 5 }
    }],
    averageRating: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Photo', photoSchema);
