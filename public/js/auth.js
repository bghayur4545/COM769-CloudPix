const API = '';

// ===== TAB SWITCHING =====
function showTab(tab) {
    const isLogin = tab === 'login';

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Slide the indicator
    const indicator = document.getElementById('tab-indicator');
    indicator.classList.toggle('right', !isLogin);

    // Update heading
    document.getElementById('form-heading').textContent    = isLogin ? 'Welcome back'            : 'Create account';
    document.getElementById('form-subheading').textContent = isLogin ? 'Sign in to your account' : 'Join CloudPix today';

    // Sync role dropdown — carry selection across tabs
    if (isLogin) {
        const regRole = document.getElementById('reg-role')?.value;
        if (regRole) document.getElementById('login-role').value = regRole;
    } else {
        const loginRole = document.getElementById('login-role')?.value;
        if (loginRole) document.getElementById('reg-role').value = loginRole;
    }

    hideToast();
}

// ===== TOAST =====
function showToast(text, type) {
    const el = document.getElementById('auth-message');
    el.textContent = text;
    el.className = `auth-toast ${type}`;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    if (type === 'success') {
        el._timer = setTimeout(() => el.classList.add('hidden'), 4000);
    }
}
function hideToast() {
    document.getElementById('auth-message').classList.add('hidden');
}

// ===== SHOW/HIDE PASSWORD =====
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.querySelector('.eye-open').classList.toggle('hidden', !isText);
    btn.querySelector('.eye-closed').classList.toggle('hidden', isText);
}

// ===== PASSWORD STRENGTH =====
const strengthLabels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
const strengthClasses = ['', 'strength-1', 'strength-2', 'strength-3', 'strength-4', 'strength-5'];

function checkPasswordStrength(password) {
    const rules = {
        len:     password.length >= 8,
        upper:   /[A-Z]/.test(password),
        lower:   /[a-z]/.test(password),
        num:     /[0-9]/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };

    // Update rule indicators
    setRule('rule-len',     rules.len);
    setRule('rule-upper',   rules.upper);
    setRule('rule-lower',   rules.lower);
    setRule('rule-num',     rules.num);
    setRule('rule-special', rules.special);

    const score = Object.values(rules).filter(Boolean).length;

    // Update strength bars
    const meter = document.getElementById('pw-strength');
    const label = document.getElementById('strength-label');
    meter.className = 'pw-strength';

    if (!password) {
        label.textContent = 'Enter a password';
        meter.classList.remove('visible');
        clearBars();
        checkConfirmPassword();
        return;
    }

    meter.classList.add('visible', strengthClasses[score]);
    label.textContent = strengthLabels[score];
    updateBars(score);
    checkConfirmPassword();
}

function setRule(id, passed) {
    const el = document.getElementById(id);
    el.classList.toggle('valid', passed);
}

function clearBars() {
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`sbar-${i}`).className = 'strength-bar';
    }
}

function updateBars(score) {
    const colors = ['', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'];
    for (let i = 1; i <= 4; i++) {
        const bar = document.getElementById(`sbar-${i}`);
        if (i <= score) {
            bar.className = 'strength-bar sbar-active';
            bar.style.background = colors[score];
        } else {
            bar.className = 'strength-bar';
            bar.style.background = '';
        }
    }
}

// ===== CONFIRM PASSWORD =====
function checkConfirmPassword() {
    const pw      = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const msg     = document.getElementById('confirm-msg');
    const input   = document.getElementById('reg-confirm');

    if (!confirm) {
        msg.className = 'confirm-msg hidden';
        input.className = input.className.replace(/\b(valid|error)\b/g, '').trim();
        return false;
    }

    if (pw === confirm) {
        msg.textContent = '✓ Passwords match';
        msg.className = 'confirm-msg match';
        input.classList.add('valid');
        input.classList.remove('error');
        return true;
    } else {
        msg.textContent = '✕ Passwords do not match';
        msg.className = 'confirm-msg mismatch';
        input.classList.add('error');
        input.classList.remove('valid');
        return false;
    }
}

// ===== VALIDATE PASSWORD =====
function isPasswordStrong(password) {
    return (
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    );
}

// ===== LOADING STATE =====
function setLoading(btnId, loading, text) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.querySelector('.btn-text').textContent = loading ? 'Please wait...' : text;
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
}

// ===== LOGIN =====
async function handleLogin(e) {
    e.preventDefault();
    hideToast();

    const username     = document.getElementById('login-username').value.trim();
    const password     = document.getElementById('login-password').value;
    const selectedRole = document.getElementById('login-role').value;

    if (!username || !password) {
        showToast('Please fill in all fields.', 'error');
        return;
    }

    setLoading('login-btn', true, 'Sign In');
    try {
        const res  = await fetch(`${API}/api/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            // Role mismatch — account type doesn't match the selection
            if (data.role !== selectedRole) {
                const label = data.role === 'creator' ? 'Creator' : 'Consumer';
                showToast(`This account is a ${label} account. Please select "${label}" and try again.`, 'error');
                document.getElementById('login-role').value = data.role;
                return;
            }
            localStorage.setItem('token',    data.token);
            localStorage.setItem('role',     data.role);
            localStorage.setItem('username', data.username);
            showToast('Login successful! Redirecting…', 'success');
            setTimeout(() => {
                window.location.href = data.role === 'creator' ? '/creator.html' : '/consumer.html';
            }, 800);
        } else {
            showToast(data.message || 'Login failed. Please try again.', 'error');
        }
    } catch {
        showToast('Network error. Is the server running?', 'error');
    } finally {
        setLoading('login-btn', false, 'Sign In');
    }
}

// ===== REGISTER =====
async function handleRegister(e) {
    e.preventDefault();
    hideToast();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const role     = document.getElementById('reg-role').value;

    // Client-side validation
    if (!username || username.length < 3) {
        showToast('Username must be at least 3 characters.', 'error');
        return;
    }
    if (!isPasswordStrong(password)) {
        showToast('Password does not meet strength requirements.', 'error');
        return;
    }
    if (password !== confirm) {
        showToast('Passwords do not match.', 'error');
        return;
    }

    setLoading('reg-btn', true, 'Create Account');
    try {
        const res  = await fetch(`${API}/api/auth/register`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, password, role })
        });
        const data = await res.json();

        if (res.ok) {
            showToast('Account created! You can now log in.', 'success');
            document.getElementById('register-form').reset();
            clearBars();
            document.getElementById('pw-strength').classList.remove('visible');
            document.querySelectorAll('.rule').forEach(r => r.classList.remove('valid'));
            document.getElementById('confirm-msg').className = 'confirm-msg hidden';
            setTimeout(() => showTab('login'), 1800);
        } else {
            showToast(data.message || 'Registration failed.', 'error');
        }
    } catch {
        showToast('Network error. Is the server running?', 'error');
    } finally {
        setLoading('reg-btn', false, 'Create Account');
    }
}

// ===== AUTO-REDIRECT IF ALREADY LOGGED IN =====
if (localStorage.getItem('token')) {
    const r = localStorage.getItem('role');
    window.location.href = r === 'creator' ? '/creator.html' : '/consumer.html';
}
