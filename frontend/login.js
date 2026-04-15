/**
 * Xử lý logic Đăng nhập / Đăng ký
 * Subscription Manager Auth
 */

const loginContainer = document.getElementById('loginFormContainer');
const registerContainer = document.getElementById('registerFormContainer');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');

// --- Chuyển đổi giữa 2 form (Animate Smoothly) ---
showRegister.onclick = (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
};

showLogin.onclick = (e) => {
    e.preventDefault();
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'block';
};

// --- Xử lý Đăng nhập ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Bắt buộc để nhận Cookie từ Server
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (data.success) {
            showToast("Đăng nhập thành công! Đang chuyển hướng...");
            // Chuyển hướng theo Role
            setTimeout(() => {
                if (data.user.role === 'admin') {
                    window.location.href = 'admin/index.html';
                } else {
                    window.location.href = 'client/index.html';
                }
            }, 1000);
        } else {
            showToast(data.error || "Sai tài khoản hoặc mật khẩu");
        }
    } catch (err) {
        showToast("Lỗi kết nối Server");
    }
});

// --- Xử lý Đăng ký ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (data.success) {
            showToast("Đăng ký thành công! Hãy Đăng nhập.");
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        } else {
            showToast(data.error || "Tài khoản đã tồn tại");
        }
    } catch (err) {
        showToast("Lỗi kết nối Server");
    }
});

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('toast--show');
    setTimeout(() => { toast.classList.remove('toast--show'); }, 3500);
}
