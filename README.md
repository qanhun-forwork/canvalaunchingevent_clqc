# Canva tại Việt Nam 2026 · Keynote + Minigame bấm chuông

- `/`: bài thuyết trình (mở trên MacBook, Safari)
- `/play`: trang cho người chơi (quét QR trên slide Minigame)

## Deploy lên Vercel (khoảng 10 phút, miễn phí)

1. **Tạo repo GitHub**: vào github.com → New repository → đặt tên (ví dụ `canva-keynote`) → Create.
   Bấm "uploading an existing file", kéo toàn bộ **nội dung** thư mục này vào (thư mục `api`, `assets`, `fonts`, `js` và các file `index.html`, `play.html`, `questions.js`, `vercel.json`, `package.json`...) → Commit.
2. **Import vào Vercel**: vercel.com → Add New → Project → chọn repo vừa tạo → Framework Preset: **Other** → Deploy.
3. **Thêm cơ sở dữ liệu cho chuông** (bắt buộc):
   Trong project Vercel → tab **Storage** → Create Database → chọn **Upstash for Redis** (Marketplace) → gói **Free** → Connect với project này.
   Vercel tự thêm biến `KV_REST_API_URL` và `KV_REST_API_TOKEN`.
4. **Đặt mã điều khiển** (nên làm, để khán giả không điều khiển được game):
   Settings → Environment Variables → thêm `HOST_KEY` = một mã bất kỳ, ví dụ `canva2026`.
5. **Redeploy**: tab Deployments → bản mới nhất → ⋯ → Redeploy.

Mở bài thuyết trình bằng: `https://<tên-project>.vercel.app/?key=canva2026`
(chỉ cần mở có `?key=` một lần, trình duyệt sẽ nhớ). Mã QR trên slide tự trỏ tới `/play`.

## Khi thuyết trình

| Việc | Cách làm |
|---|---|
| Trước giờ diễn | Tới slide Minigame, di chuột → bảng điều khiển góc phải dưới → **Reset game** (bấm 2 lần) để xoá dữ liệu tập dượt |
| Sang câu hỏi | Nhấn → như bình thường. Chuông tự mở sau đếm ngược 3, 2, 1 |
| Có người bấm chuông | Tên hiện lên màn hình. Mời người đó trả lời bằng micro |
| Chấm đáp án | Kỹ thuật **bấm vào ô đáp án** người chơi chọn (hoặc phím **A B C D**). Sai → “SAI RỒI!”, người đó bị khoá, chuông mở lại cho người khác. Đúng → “CHÍNH XÁC!” |
| Không ai trả lời đúng | Phím **S** hoặc nút “Hiện đáp án” |
| Mở lại chuông thủ công | Phím **O** hoặc nút “Mở lại chuông” |
| Tắt/bật âm thanh | Phím **M** |

Âm thanh phát từ máy chiếu (nhớ cắm loa). Âm thanh được tạo bằng code (WebAudio), không dùng file nhạc có bản quyền.
Trên slide câu hỏi, phím B dùng để chấm đáp án B (không làm đen màn hình).

## Sửa câu hỏi

Sửa file `questions.js` ngay trên GitHub (biểu tượng bút chì) → Commit → Vercel tự cập nhật sau khoảng 30 giây.
Giữ đúng 3 câu, mỗi câu 4 đáp án; `answer` là chữ cái đáp án đúng.

## Giới hạn gói miễn phí

Upstash Free: 500.000 lệnh/tháng. Một buổi khoảng 50 người chơi trong 15 phút dùng chừng 100.000 đến 150.000 lệnh, đủ cho buổi diễn và vài lần tập.

## Chạy thử trên máy

`node dev-server.js` → mở http://localhost:3000 (bài thuyết trình) và http://localhost:3000/play (người chơi). Dữ liệu chỉ lưu tạm trong bộ nhớ.
