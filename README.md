# Canva tại Việt Nam 2026 · Keynote + Minigame bấm chuông

- `/`: bài thuyết trình (mở trên MacBook, Safari)
- `/play`: trang cho người chơi (quét QR trên slide Minigame)

## Deploy lên Vercel (khoảng 10 phút, miễn phí)

1. **Tạo repo GitHub**: vào github.com → New repository → đặt tên (ví dụ `canva-keynote`) → Create.
   Bấm "uploading an existing file", kéo toàn bộ **nội dung** thư mục này vào (thư mục `api`, `assets`, `fonts`, `js` và các file `index.html`, `play.html`, `questions.js`, `vercel.json`, `package.json`...) → Commit.
2. **Import vào Vercel**: vercel.com → Add New → Project → chọn repo vừa tạo → Framework Preset: **Other** → Deploy.
3. **Thêm cơ sở dữ liệu cho chuông** (bắt buộc, thiếu bước này game sẽ báo “Chưa kết nối Upstash Redis” và không cho vào phòng):
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

## Kiểm tra trước buổi diễn

Mở slide Minigame, di chuột: bảng điều khiển góc phải dưới phải ghi **“Đã kết nối · N người chơi”** (chấm xanh).
Nếu ghi “Chưa kết nối Upstash Redis” thì làm lại bước 3 rồi Redeploy.

## Giới hạn người chơi

Mặc định tối đa **50 người**. Đổi trong `questions.js`: `window.GAME_CONFIG = { maxPlayers: 50 };`
Khi đủ người, mã QR trên màn hình bị che bằng thông báo “Đã đủ 50 người chơi”, ai quét sau sẽ thấy “Phòng đã đủ người”.
Mỗi điện thoại chỉ tính là 1 người: tải lại trang, khoá màn hình hay đổi tên đều không làm tăng số người.
Lưu ý: cùng một người nhưng mở bằng 2 trình duyệt khác nhau (ví dụ Zalo và Safari) sẽ bị tính là 2 người.

## Sửa câu hỏi

Sửa file `questions.js` ngay trên GitHub (biểu tượng bút chì) → Commit → Vercel tự cập nhật sau khoảng 30 giây.
Giữ đúng 3 câu, mỗi câu 4 đáp án; `answer` là chữ cái đáp án đúng.

## Giới hạn gói miễn phí

Upstash Free: 500.000 lệnh/tháng, tối đa 10.000 lệnh/giây. Lúc cao điểm 50 người chơi dùng khoảng 150 lệnh/giây; cả buổi khoảng 20 phút tốn chừng 150.000 lệnh. Gói miễn phí đủ cho buổi diễn và vài lần tập với ít người.
Đừng để điện thoại người chơi mở trang `/play` nhiều ngày liền vì vẫn tốn lệnh (khi khoá màn hình thì trang tự ngừng gửi yêu cầu).

## Chạy thử trên máy

`node dev-server.js` → mở http://localhost:3000 (bài thuyết trình) và http://localhost:3000/play (người chơi). Dữ liệu chỉ lưu tạm trong bộ nhớ.
