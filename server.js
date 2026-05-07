require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const NodeCache  = require('node-cache');
const Sentiment  = require('sentiment');
const rateLimit  = require('express-rate-limit');
const sharp      = require('sharp');

const User    = require('./models/User');
const Photo   = require('./models/Photo');
const Comment = require('./models/Comment');

const app = express();

// ── Security headers (Helmet) ──────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'"],
            styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:     ["'self'", "https://fonts.gstatic.com"],
            imgSrc:      ["'self'", 'data:', 'blob:'],
            connectSrc:  ["'self'"],
        }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ── Rate Limiting (scalability + protection) ───────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many auth attempts, please try again in 15 minutes.' }
});

app.use(globalLimiter);
app.use(cors());
app.use(express.json());

// Ensure uploads dirs exist
['uploads', 'uploads/thumbs'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✓ Connected to MongoDB Atlas'))
    .catch(err  => console.error('✗ MongoDB error:', err));

// ── ADVANCED FEATURE: In-memory cache (scalable feed delivery) ─────────────
const cache = new NodeCache({ stdTTL: 300 });

// ── ADVANCED FEATURE: Sentiment analysis engine ────────────────────────────
const sentimentAnalyzer = new Sentiment();

// ── Multer (disk storage) ──────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => {
        const safe = file.originalname.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        cb(null, `${Date.now()}-${safe}`);
    }
});
const upload = multer({
    storage,
    limits:     { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/jpeg|jpg|png|gif|webp/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// ── ADVANCED FEATURE: Media conversion via Sharp ───────────────────────────
async function processImage(filePath, filename) {
    const thumbFilename = `thumb_${filename}`;
    const thumbPath     = path.join(__dirname, 'uploads', 'thumbs', thumbFilename);

    // Resize original to max 1200px wide, convert to JPEG, optimize quality
    await sharp(filePath)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toFile(filePath.replace(filename, `opt_${filename}`));

    // Replace original with optimised version
    fs.renameSync(filePath.replace(filename, `opt_${filename}`), filePath);

    // Generate square thumbnail at 400×400
    await sharp(filePath)
        .resize(400, 400, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 75 })
        .toFile(thumbPath);

    return `/uploads/thumbs/${thumbFilename}`;
}

// ── IDENTITY FRAMEWORK (ADVANCED FEATURE) ─────────────────────────────────
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};

const requireRole = (role) => (req, res, next) => {
    if (req.user.role !== role)
        return res.status(403).json({ message: `Access denied: ${role} role required` });
    next();
};

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Public registration — consumers and creators
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password)
            return res.status(400).json({ message: 'Username and password are required' });
        if (username.length < 3)
            return res.status(400).json({ message: 'Username must be at least 3 characters' });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Username already taken' });

        const hashed = await bcrypt.hash(password, 10);
        await new User({ username, password: hashed, role: role || 'consumer' }).save();

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Admin-only creator account creation — protected by ADMIN_SECRET env variable
app.post('/api/admin/create-creator', authLimiter, async (req, res) => {
    try {
        const { adminSecret, username, password } = req.body;

        if (adminSecret !== process.env.ADMIN_SECRET)
            return res.status(403).json({ message: 'Invalid admin credentials' });
        if (!username || !password)
            return res.status(400).json({ message: 'Username and password are required' });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Username already taken' });

        const hashed = await bcrypt.hash(password, 10);
        await new User({ username, password: hashed, role: 'creator' }).save();

        res.status(201).json({ message: `Creator account '${username}' created successfully!` });
    } catch (error) {
        console.error('Create creator error:', error);
        res.status(500).json({ error: 'Failed to create creator account' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, role: user.role, username: user.username, message: 'Logged in successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PHOTO ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Creator: upload photo with metadata + media conversion
app.post('/api/photos', authenticate, requireRole('creator'), upload.single('image'), async (req, res) => {
    try {
        const { title, caption, location, people } = req.body;
        if (!req.file) return res.status(400).json({ message: 'Image file is required' });
        if (!title)    return res.status(400).json({ message: 'Title is required' });

        const filePath    = req.file.path;
        const filename    = req.file.filename;
        const imageUrl    = `/uploads/${filename}`;

        // ADVANCED FEATURE: Process image — resize + generate thumbnail
        let thumbnailUrl  = '';
        try {
            thumbnailUrl = await processImage(filePath, filename);
        } catch (sharpErr) {
            console.warn('Image processing skipped:', sharpErr.message);
        }

        const photo = new Photo({
            title,
            caption:      caption  || '',
            location:     location || '',
            people:       people ? people.split(',').map(p => p.trim()).filter(Boolean) : [],
            imageUrl,
            thumbnailUrl,
            creator:      req.user.id,
            creatorName:  req.user.username
        });
        await photo.save();
        cache.flushAll();

        res.status(201).json({ message: 'Photo uploaded successfully!', photo });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// All users: paginated photo feed with search — CACHED
app.get('/api/photos', async (req, res) => {
    try {
        const { search, page = 1, limit = 24 } = req.query;
        const cacheKey = search
            ? `photos_search_${search.toLowerCase()}_p${page}`
            : `photos_all_p${page}`;

        const cached = cache.get(cacheKey);
        if (cached) return res.json({ ...cached, source: 'cache' });

        const query = search
            ? { $or: [
                { title:       { $regex: search, $options: 'i' } },
                { caption:     { $regex: search, $options: 'i' } },
                { location:    { $regex: search, $options: 'i' } },
                { people:      { $elemMatch: { $regex: search, $options: 'i' } } },
                { creatorName: { $regex: search, $options: 'i' } }
            ]} : {};

        const skip  = (parseInt(page) - 1) * parseInt(limit);
        const total  = await Photo.countDocuments(query);
        const photos = await Photo.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));

        const payload = { photos, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) };
        cache.set(cacheKey, payload);

        res.json({ ...payload, source: 'database' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

app.get('/api/photos/:id', async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) return res.status(404).json({ message: 'Photo not found' });
        res.json(photo);
    } catch {
        res.status(500).json({ error: 'Failed to fetch photo' });
    }
});

// Creator: delete own photo + its files
app.delete('/api/photos/:id', authenticate, requireRole('creator'), async (req, res) => {
    try {
        const photo = await Photo.findOne({ _id: req.params.id, creator: req.user.id });
        if (!photo) return res.status(404).json({ message: 'Photo not found or not your photo' });

        // Remove files from disk
        const filesToDelete = [
            path.join(__dirname, photo.imageUrl),
            photo.thumbnailUrl ? path.join(__dirname, photo.thumbnailUrl) : null
        ].filter(Boolean);
        filesToDelete.forEach(f => { try { fs.unlinkSync(f); } catch {} });

        await Photo.deleteOne({ _id: req.params.id });
        await Comment.deleteMany({ photo: req.params.id });
        cache.flushAll();

        res.json({ message: 'Photo deleted successfully' });
    } catch {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Rate a photo (any authenticated user, 1–5)
app.post('/api/photos/:id/rate', authenticate, async (req, res) => {
    try {
        const ratingNum = parseInt(req.body.rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5)
            return res.status(400).json({ message: 'Rating must be 1–5' });

        const photo = await Photo.findById(req.params.id);
        if (!photo) return res.status(404).json({ message: 'Photo not found' });

        const existing = photo.ratings.find(r => r.user.toString() === req.user.id);
        if (existing) existing.value = ratingNum;
        else          photo.ratings.push({ user: req.user.id, value: ratingNum });

        photo.averageRating = Math.round(
            (photo.ratings.reduce((s, r) => s + r.value, 0) / photo.ratings.length) * 10
        ) / 10;
        await photo.save();
        cache.flushAll();

        res.json({ message: 'Rating submitted!', averageRating: photo.averageRating, totalRatings: photo.ratings.length });
    } catch {
        res.status(500).json({ error: 'Rating failed' });
    }
});

// Creator: own photos only
app.get('/api/my-photos', authenticate, requireRole('creator'), async (req, res) => {
    try {
        const photos = await Photo.find({ creator: req.user.id }).sort({ createdAt: -1 });
        res.json({ photos });
    } catch {
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  COMMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ADVANCED FEATURE: sentiment analysis on every comment
app.post('/api/photos/:id/comments', authenticate, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text?.trim()) return res.status(400).json({ message: 'Comment text is required' });

        const photo = await Photo.findById(req.params.id);
        if (!photo) return res.status(404).json({ message: 'Photo not found' });

        const result        = sentimentAnalyzer.analyze(text);
        const sentimentScore = result.score;
        const sentimentLabel = sentimentScore > 0 ? 'positive' : sentimentScore < 0 ? 'negative' : 'neutral';

        const comment = await new Comment({
            photo:          req.params.id,
            user:           req.user.id,
            username:       req.user.username,
            text:           text.trim(),
            sentimentScore,
            sentimentLabel
        }).save();

        res.status(201).json({ message: 'Comment added!', comment });
    } catch {
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

app.get('/api/photos/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ photo: req.params.id }).sort({ createdAt: -1 });
        res.json({ comments });
    } catch {
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/status', (req, res) => {
    res.json({
        status:      'ok',
        app:         'CloudPix',
        version:     '1.0.0',
        timestamp:   new Date().toISOString(),
        cache_stats: cache.getStats()
    });
});

// Serve SPA for unmatched routes
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CloudPix running → http://localhost:${PORT}`));
