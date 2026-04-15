<p align="center">
  <img src="assets/nghuy.png" width="180" alt="Nghuy Logo">
</p>

# SubTrack - Hệ Thống Quản Lý Đăng Ký (Subscription)

Dự án ứng dụng quản lý đăng ký tự động. 
Tài liệu này là hướng dẫn chi tiết các bước để cài đặt và triển khai (Deploy) dự án lên máy chủ VPS.

## 1. Cơ Sở Dữ Liệu (Database)
Hệ thống sử dụng **SQLite** lưu trực tiếp ở file `backend/subscriptions.db`. 
- **KHÔNG CẦN** cài đặt MySQL, PostgreSQL hay MongoDB trên máy chủ.
- Cơ sở dữ liệu hoàn toàn tự động kích hoạt ngay khi chạy mã nguồn.


## 2. Thiết Lập Tự Động Push Code & FTP (CI/CD)
Dự án được cấu hình bằng tính năng GitHub Actions. Mỗi khi bạn lưu code trên máy tính, nó sẽ tự động đẩy bản mới lên **VPS của bạn trực tiếp qua FTP**.

1. Vào Github Repository của bạn -> **Settings** -> **Secrets and variables** -> **Actions**
2. Bấm **New repository secret** và thêm 3 biến thiết yếu sau:
   - `FTP_SERVER`: Địa chỉ IP của VPS (hoặc Domain Server FTP)
   - `FTP_USERNAME`: Tài khoản FTP 
   - `FTP_PASSWORD`: Mật khẩu đăng nhập FTP

Khi muốn cấp nhật và up code mới sau khi code xong, bạn chỉ việc gõ lệnh tại thư mục code trên máy tính:
```bash
./push.sh
```

## 3. Cài Đặt Môi Trường Trên VPS (Chỉ cần làm 1 lần)
Bạn cần có một phần mềm để chạy web nền tảng Node.js (V20). Hãy SSH vào VPS Terminal của bạn và chạy:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Sau đó tìm đến thư mục chính xác mà FTP của bạn đã đẩy code xuống (Ví dụ: `cd /www/wwwroot/subs.nghuy.vn`) và chạy các lệnh:
```bash
npm install
npm install -g pm2
pm2 start backend/server.js --name "subtrack-api"
pm2 save
pm2 startup
```
*(Giải thích: Các lệnh trên giúp bạn tải những thư viện còn thiếu, sau đó bật phần mềm ở cổng `3001` duy trì chạy ngầm mãi mãi trên máy chủ VPS).*

## 4. Cấu Hình Nginx (Trỏ Reverse Proxy)
Sau khi ứng dụng đang chạy ở Port `3001`, bạn cần hướng dữ liệu duyệt web từ Internet vào cổng đó để website hiển thị. Mở bảng điều khiển Server của bạn (aaPanel, CyberPanel, v.v...) và thêm thiết lập Reverse Proxy cho tên miền với:

- **Target URL:** `http://127.0.0.1:3001`
- **Sent Domain:** `$host`

Lưu lại Cài đặt Reverse Proxy và tải lại lại tên miền trên trình duyệt Web (F5/Ctrl+F5). Trải nghiệm dự án của bạn ngay 🎉!
