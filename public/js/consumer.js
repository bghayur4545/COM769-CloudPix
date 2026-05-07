const API = '';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const username = localStorage.getItem('username');

// Guard: must be logged in
if (!token) {
    window.location.href = '/index.html';
}

document.getElementById('nav-username').textContent = username;

// Show Upload Studio tab and correct badge if user is a creator
if (role === 'creator') {
    document.getElementById('nav-studio-link').classList.remove('hidden');
    const badge = document.getElementById('nav-role-badge');
    badge.textContent = 'Creator';
    badge.className = 'nav-badge creator-badge';
} else {
    const badge = document.getElementById('nav-role-badge');
    badge.textContent = 'Consumer';
    badge.className = 'nav-badge consumer-badge';
}

let currentPhotoId = null;
let searchDebounce = null;

function logout() {
    localStorage.clear();
    window.location.href = '/index.html';
}

function authHeaders() {
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounceSearch() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(searchPhotos, 400);
}

async function searchPhotos() {
    const q = document.getElementById('search-input').value.trim();
    loadPhotos(q);
}

async function loadPhotos(search = '') {
    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '<div class="loading-spinner">Loading photos...</div>';

    try {
        const url = search ? `${API}/api/photos?search=${encodeURIComponent(search)}` : `${API}/api/photos`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            grid.innerHTML = '<div class="empty-state">Failed to load photos.</div>';
            return;
        }

        const count = document.getElementById('photo-count');
        count.textContent = data.photos.length
            ? `${data.photos.length} photo${data.photos.length !== 1 ? 's' : ''}${search ? ` for "${search}"` : ''} ${data.source === 'cache' ? '(cached)' : ''}`
            : '';

        if (!data.photos.length) {
            grid.innerHTML = `<div class="empty-state">${search ? 'No photos found for your search.' : 'No photos yet!'}</div>`;
            return;
        }

        grid.innerHTML = data.photos.map(photo => `
            <div class="photo-card" onclick="openPhoto('${photo._id}')">
                <div class="photo-card-img-wrap">
                    <img src="${photo.thumbnailUrl || photo.imageUrl}" alt="${escapeHtml(photo.title)}"
                         onerror="this.style.display='none'">
                    <div class="photo-card-overlay"></div>
                </div>
                <div class="photo-card-body">
                    <div class="photo-card-title">${escapeHtml(photo.title)}</div>
                    <div class="photo-card-meta">
                        <span>@${escapeHtml(photo.creatorName)}</span>
                        ${photo.location ? `<span>📍 ${escapeHtml(photo.location)}</span>` : ''}
                        ${photo.averageRating ? `<span class="photo-card-rating">★ ${photo.averageRating}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    } catch {
        grid.innerHTML = '<div class="empty-state">Network error. Please refresh.</div>';
    }
}

async function openPhoto(photoId) {
    currentPhotoId = photoId;

    document.getElementById('photo-modal').classList.remove('hidden');
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-img').src = '';
    document.getElementById('modal-title').textContent = 'Loading...';
    document.getElementById('modal-caption').textContent = '';
    document.getElementById('modal-location').innerHTML = '';
    document.getElementById('modal-people').innerHTML = '';
    document.getElementById('modal-creator').textContent = '';
    document.getElementById('avg-rating').textContent = '';
    document.getElementById('comments-list').innerHTML = '<div style="color:#aaa;font-size:.85rem">Loading comments...</div>';
    resetStars();

    try {
        const [photoRes, commentsRes] = await Promise.all([
            fetch(`${API}/api/photos/${photoId}`),
            fetch(`${API}/api/photos/${photoId}/comments`)
        ]);

        const photo = await photoRes.json();
        const commentsData = await commentsRes.json();

        document.getElementById('modal-img').src = photo.imageUrl;
        document.getElementById('modal-title').textContent = photo.title;
        document.getElementById('modal-caption').textContent = photo.caption || '';
        document.getElementById('modal-creator').textContent = photo.creatorName;

        const locEl = document.getElementById('modal-location');
        locEl.innerHTML = photo.location ? `<span>📍</span><span>${escapeHtml(photo.location)}</span>` : '';

        const peopleEl = document.getElementById('modal-people');
        peopleEl.innerHTML = photo.people && photo.people.length
            ? `<span>👥</span><span>${photo.people.map(escapeHtml).join(', ')}</span>` : '';

        if (photo.averageRating) {
            document.getElementById('avg-rating').textContent = `Average: ${photo.averageRating} ★ (${photo.ratings.length} rating${photo.ratings.length !== 1 ? 's' : ''})`;
        }

        renderComments(commentsData.comments || []);
    } catch {
        document.getElementById('modal-title').textContent = 'Error loading photo';
    }
}

function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
    document.getElementById('modal-overlay').classList.add('hidden');
    currentPhotoId = null;
    resetStars();
}

function resetStars() {
    document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
}

function highlightStars(value) {
    document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.value) <= value);
    });
}

// Star hover effects
document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('mouseenter', () => highlightStars(parseInt(star.dataset.value)));
    star.addEventListener('mouseleave', resetStars);
});

async function submitRating(value) {
    if (!currentPhotoId) return;
    highlightStars(value);

    try {
        const res = await fetch(`${API}/api/photos/${currentPhotoId}/rate`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ rating: value })
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('avg-rating').textContent =
                `Average: ${data.averageRating} ★ (${data.totalRatings} rating${data.totalRatings !== 1 ? 's' : ''})`;
        }
    } catch {
        // Silently fail rating
    }
}

async function submitComment(e) {
    e.preventDefault();
    if (!currentPhotoId) return;

    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;

    try {
        const res = await fetch(`${API}/api/photos/${currentPhotoId}/comments`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ text })
        });
        const data = await res.json();

        if (res.ok) {
            input.value = '';
            // Prepend new comment to list
            const list = document.getElementById('comments-list');
            const noComments = list.querySelector('.no-comments');
            if (noComments) noComments.remove();
            list.insertAdjacentHTML('afterbegin', renderComment(data.comment));
        }
    } catch {
        // Silently fail
    } finally {
        input.disabled = false;
        input.focus();
    }
}

function renderComment(comment) {
    const sentimentEmoji = { positive: '😊', negative: '😞', neutral: '😐' };
    const emoji = sentimentEmoji[comment.sentimentLabel] || '😐';
    return `
        <div class="comment-item ${comment.sentimentLabel}">
            <div class="comment-author">${escapeHtml(comment.username)}</div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
            <div class="comment-sentiment sentiment-${comment.sentimentLabel}">
                ${emoji} ${comment.sentimentLabel}
            </div>
        </div>
    `;
}

function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if (!comments.length) {
        list.innerHTML = '<div class="no-comments" style="color:#aaa;font-size:.85rem;padding:8px 0">No comments yet. Be the first!</div>';
        return;
    }
    list.innerHTML = comments.map(renderComment).join('');
}

// Close modal on Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePhotoModal();
});

// Initial load
loadPhotos();
