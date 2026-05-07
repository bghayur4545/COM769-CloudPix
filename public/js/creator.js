const API = '';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const username = localStorage.getItem('username');

// Guard: must be logged in as creator
if (!token || role !== 'creator') {
    window.location.href = '/index.html';
}

document.getElementById('nav-username').textContent = username;

let deleteTargetId = null;

function logout() {
    localStorage.clear();
    window.location.href = '/index.html';
}

function authHeaders() {
    return { 'Authorization': `Bearer ${token}` };
}

function showUploadMessage(text, type) {
    const el = document.getElementById('upload-message');
    el.textContent = text;
    el.className = `message ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const preview = document.getElementById('img-preview');
    const dropContent = document.getElementById('drop-preview');
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
    dropContent.classList.add('hidden');
}

async function handleUpload(e) {
    e.preventDefault();
    const btn = document.getElementById('upload-btn');
    const file = document.getElementById('file-input').files[0];

    if (!file) {
        showUploadMessage('Please select an image file.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('title', document.getElementById('up-title').value.trim());
    formData.append('caption', document.getElementById('up-caption').value.trim());
    formData.append('location', document.getElementById('up-location').value.trim());
    formData.append('people', document.getElementById('up-people').value.trim());

    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
        const res = await fetch(`${API}/api/photos`, {
            method: 'POST',
            headers: authHeaders(),
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            showUploadMessage('Photo uploaded successfully!', 'success');
            document.getElementById('upload-form').reset();
            document.getElementById('img-preview').classList.add('hidden');
            document.getElementById('drop-preview').classList.remove('hidden');
            loadMyPhotos();
        } else {
            showUploadMessage(data.message || data.error || 'Upload failed', 'error');
        }
    } catch {
        showUploadMessage('Network error during upload.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Upload Photo';
    }
}

async function loadMyPhotos() {
    const grid = document.getElementById('my-photos-grid');
    grid.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const res = await fetch(`${API}/api/my-photos`, { headers: authHeaders() });
        const data = await res.json();

        if (!res.ok) {
            grid.innerHTML = '<div class="empty-state">Failed to load photos.</div>';
            return;
        }

        if (!data.photos.length) {
            grid.innerHTML = '<div class="empty-state">No photos yet. Upload your first photo!</div>';
            return;
        }

        grid.innerHTML = data.photos.map(photo => `
            <div class="photo-card">
                <div class="photo-card-img-wrap">
                    <img src="${photo.imageUrl}" alt="${escapeHtml(photo.title)}"
                         onerror="this.style.display='none'">
                    <div class="photo-card-overlay"></div>
                </div>
                <div class="photo-card-body">
                    <div class="photo-card-title">${escapeHtml(photo.title)}</div>
                    <div class="photo-card-meta">
                        ${photo.location ? `<span>📍 ${escapeHtml(photo.location)}</span>` : ''}
                        ${photo.averageRating ? `<span class="photo-card-rating">★ ${photo.averageRating}</span>` : ''}
                        <span>${new Date(photo.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="photo-card-actions">
                    <button class="btn-danger" style="flex:1" onclick="openDeleteModal('${photo._id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch {
        grid.innerHTML = '<div class="empty-state">Failed to load photos.</div>';
    }
}

function openDeleteModal(id) {
    deleteTargetId = id;
    document.getElementById('delete-modal').classList.remove('hidden');
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeDeleteModal() {
    deleteTargetId = null;
    document.getElementById('delete-modal').classList.add('hidden');
    document.getElementById('modal-overlay').classList.add('hidden');
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    try {
        const res = await fetch(`${API}/api/photos/${deleteTargetId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });

        if (res.ok) {
            closeDeleteModal();
            loadMyPhotos();
        } else {
            alert('Delete failed. Please try again.');
        }
    } catch {
        alert('Network error during delete.');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Drag and drop support
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#667eea'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#c4b5fd'; });
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = '#c4b5fd';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const input = document.getElementById('file-input');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        previewImage({ target: { files: [file] } });
    }
});

// Load photos on page ready
loadMyPhotos();
