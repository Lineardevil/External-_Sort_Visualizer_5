let animationInterval = null;
let currentSteps = [];
let currentIndex = 0;
let cachedSteps = [];
let selectedFile = null;

/**
 * 1. KHỞI TẠO & THEO DÕI CẤU HÌNH
 */
document.addEventListener('DOMContentLoaded', () => {
    // Cập nhật RAM ngay khi load trang
    updateRamEstimate();

    // Theo dõi thay đổi ở các ô nhập liệu
    document.getElementById('blockSizeInput').addEventListener('input', updateRamEstimate);
    document.getElementById('kWayInput').addEventListener('input', updateRamEstimate);
});

function updateRamEstimate() {
    const b = parseInt(document.getElementById('blockSizeInput').value) || 0;
    const k = parseInt(document.getElementById('kWayInput').value) || 0;
    const total = (k * b) + k; // Công thức: (K*B) + K

    const ramText = document.getElementById('ram-estimate');
    const warning = document.getElementById('ram-warning');
    const fileLabel = document.getElementById('fileInputLabel');

    if (ramText) ramText.innerText = total;

    // CẢNH BÁO & CẤM: Nếu RAM dự kiến > 1000
    if (total > 1000) {
        if (warning) warning.style.display = 'block';
        if (ramText) ramText.style.color = '#ff4d4d';
        fileLabel.style.opacity = "0.5";
        fileLabel.style.pointerEvents = "none"; // Khóa không cho chọn file
    } else {
        if (warning) warning.style.display = 'none';
        if (ramText) ramText.style.color = 'var(--neon-blue)';
        fileLabel.style.opacity = "1";
        fileLabel.style.pointerEvents = "auto"; // Mở khóa
    }
}

/**
 * 2. XỬ LÝ FILE & UPLOAD
 */
function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return;

    const n = Math.floor(file.size / 8);
    document.getElementById('file-info').style.display = 'block';
    document.getElementById('info-n').innerText = n;

    // Ẩn các nút cũ để tránh nhầm lẫn
    document.getElementById('btn-visualize').style.display = 'none';
    document.getElementById('btn-download').style.display = 'none';
    document.getElementById('info-status').innerText = "ĐANG TẢI LÊN...";

    autoUploadAndSort(file);
}

async function autoUploadAndSort(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("block_size", document.getElementById('blockSizeInput').value);
    formData.append("k_way", document.getElementById('kWayInput').value); // Gửi k_way lên server

    document.getElementById('loading-area').style.display = 'block';

    try {
        const response = await fetch("/upload", { method: "POST", body: formData });
        const data = await response.json();

        document.getElementById('loading-area').style.display = 'none';

        if (data.error) {
            alert(data.error);
            return;
        }

        // Cập nhật trạng thái sau khi Sort xong
        document.getElementById('info-status').innerText = data.status;
        document.getElementById('info-output').innerText = data.output_status;

        // HIỆN NÚT DOWNLOAD & VISUALIZE
        document.getElementById('btn-download').style.display = 'inline-block';

        if (data.steps && data.steps.length > 0) {
            cachedSteps = data.steps;
            document.getElementById('btn-visualize').style.display = 'inline-block';
            showToast("Sắp xếp thành công! Bạn có thể xem mô phỏng hoặc tải file.");
        } else {
            showToast("File lớn: Đã tối ưu tốc độ, hãy nhấn Download để lấy kết quả.");
        }

    } catch (err) {
        document.getElementById('loading-area').style.display = 'none';
        alert("Lỗi kết nối server!");
    }
}

/**
 * 3. HỆ THỐNG MÔ PHỎNG (Giữ nguyên các hàm vẽ của bạn)
 */
function showPage(pageId) {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('visualize-screen').style.display = 'none';
    document.getElementById(pageId).style.display = 'block';
    if (pageId !== 'visualize-screen') pauseAnimation();
}

function goToVisualize() {
    if (cachedSteps.length > 0) {
        currentSteps = cachedSteps;
        currentIndex = 0;
        showPage('visualize-screen');
        startAnimation();
    }
}

function startAnimation() {
    const slider = document.getElementById("stepSlider");
    slider.max = currentSteps.length - 1;
    if (animationInterval) clearInterval(animationInterval);

    animationInterval = setInterval(() => {
        if (currentIndex >= currentSteps.length) {
            clearInterval(animationInterval);
            return;
        }
        drawState(currentSteps[currentIndex]);
        document.getElementById("stepSlider").value = currentIndex;
        document.getElementById("stepDisplay").innerText = `${currentIndex + 1}/${currentSteps.length}`;
        currentIndex++;
    }, 800);
}

function pauseAnimation() { clearInterval(animationInterval); }

function seekStep(idx) {
    pauseAnimation();
    currentIndex = parseInt(idx);
    drawState(currentSteps[currentIndex]);
    document.getElementById("stepDisplay").innerText = `${currentIndex + 1}/${currentSteps.length}`;
}

function drawState(step) {
    document.getElementById("io-display").innerText = `DISK READS: ${step.io_reads}`;
    drawRuns(step.runs_full, step.pointers);
    drawBuffers(step.buffers);
    drawHeap(step.heap);
    drawPicked(step.picked);
    drawOutput(step.output);
}


/**
 * CÁC HÀM VẼ GIAO DIỆN
 */
function drawBuffers(buffers) {
    const container = document.getElementById("buffers-area");
    if (!container) return;

    // Xóa trắng để vẽ lại, giữ tiêu đề chính của khu vực
    container.innerHTML = "<h3>RAM BUFFERS (Active Blocks)</h3>";

    buffers.forEach((buf, i) => {
        const row = document.createElement("div");
        row.className = "buffer-row";

        // Tạo nhãn tiêu đề chiếm trọn hàng đầu tiên của khối (giống RUN #X)
        const label = document.createElement("div");
        label.className = "buffer-label";
        label.innerText = `BUFFER #${i}`;
        row.appendChild(label);

        // Thêm các ô số vào hàng
        buf.forEach(val => {
            const b = document.createElement("div");
            b.className = "box buffer-box";
            b.innerText = val.toFixed(1);
            row.appendChild(b);
        });

        // Nếu buffer rỗng (đang chờ nạp), có thể hiện thông báo nhẹ
        if (buf.length === 0) {
            const emptyHint = document.createElement("span");
            emptyHint.style.color = "gray";
            emptyHint.style.fontSize = "0.8rem";
            emptyHint.innerText = " (Empty - Waiting for refill)";
            row.appendChild(emptyHint);
        }

        container.appendChild(row);
    });
}

function drawRuns(runs, pointers) {
    const container = document.getElementById("runs");
    if (!container) return;
    container.innerHTML = "";

    runs.forEach((run, runIndex) => {
        const row = document.createElement("div");
        row.className = "run-row";

        // Tạo tiêu đề cho bảng Run
        const label = document.createElement("div");
        label.className = "run-label";
        label.innerText = `RUN #${runIndex}`;
        row.appendChild(label);

        run.forEach((value, i) => {
            const box = document.createElement("div");
            box.className = "box";
            box.innerText = value.toFixed(1);

            // Logic highlight con số hiện tại đang được xét
            if (i === pointers[runIndex]) {
                box.style.border = "2px solid var(--neon-orange)";
                box.style.boxShadow = "0 0 10px var(--neon-orange)";
                box.style.zIndex = "10";
            } else if (i < pointers[runIndex]) {
                // Các con số đã được lấy đi sẽ làm mờ
                box.style.opacity = "0.2";
            }
            row.appendChild(box);
        });
        container.appendChild(row);
    });
}

function drawHeap(heap) {
    const container = document.getElementById("heap");
    if (!container) return;
    container.innerHTML = "";
    if (heap.length === 0) return;

    const width = container.clientWidth || 800;
    const levelHeight = 60;
    const height = Math.ceil(Math.log2(heap.length + 1)) * levelHeight + 40;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", height);

    const positions = [];
    for (let i = 0; i < heap.length; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const indexInLevel = i - (Math.pow(2, level) - 1);
        const nodesInLevel = Math.pow(2, level);
        const x = (width / (nodesInLevel + 1)) * (indexInLevel + 1);
        const y = 30 + level * levelHeight;
        positions.push({ x, y });
    }

    for (let i = 0; i < heap.length; i++) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < heap.length) drawLine(svg, positions[i], positions[left]);
        if (right < heap.length) drawLine(svg, positions[i], positions[right]);
    }

    for (let i = 0; i < heap.length; i++) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", positions[i].x); circle.setAttribute("cy", positions[i].y);
        circle.setAttribute("r", "18"); circle.setAttribute("fill", "#161b22");
        circle.setAttribute("stroke", "var(--neon-blue)"); circle.setAttribute("stroke-width", "2");

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", positions[i].x); text.setAttribute("y", positions[i].y + 5);
        text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "var(--neon-blue)");
        text.setAttribute("font-size", "12px"); text.textContent = heap[i].toFixed(1);

        g.appendChild(circle); g.appendChild(text); svg.appendChild(g);
    }
    container.appendChild(svg);
}

function drawLine(svg, p1, p2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
    line.setAttribute("stroke", "#30363d"); line.setAttribute("stroke-width", "2");
    svg.appendChild(line);
}

function drawPicked(value) {
    const container = document.getElementById("picked");
    if (!container) return;
    container.innerHTML = "";
    if (value !== null && value !== undefined) {
        const div = document.createElement("div");
        div.className = "box picked-box";
        div.innerText = value.toFixed(1);
        container.appendChild(div);
    }
}

function drawOutput(output) {
    const container = document.getElementById("output");
    if (!container) return;
    container.innerHTML = "";
    output.forEach(value => {
        const div = document.createElement("div");
        div.className = "box output-box";
        div.innerText = value.toFixed(1);
        container.appendChild(div);
    });
}


// Các hàm vẽ chi tiết (Bạn giữ nguyên logic vẽ SVG/HTML cũ của bạn ở đây)
function drawRuns(runs, pointers) { /* Code vẽ của bạn */ }
function drawBuffers(buffers) { /* Code vẽ của bạn */ }
function drawHeap(heap) { /* Code vẽ của bạn */ }
function drawPicked(val) { /* Code vẽ của bạn */ }
function drawOutput(output) { /* Code vẽ của bạn */ }

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    selectedFile = fileInput.files[0];
    if (!selectedFile) return;

    // Hiển thị thông tin file và nút SORT
    document.getElementById('file-ready-area').style.display = 'block';
    document.getElementById('info-filename').innerText = selectedFile.name;
    document.getElementById('info-n').innerText = Math.floor(selectedFile.size / 8);

    // Ẩn khu vực kết quả cũ nếu có
    document.getElementById('result-area').style.display = 'none';
}

function triggerSort() {
    if (!selectedFile) return;
    autoUploadAndSort(selectedFile);
}

async function autoUploadAndSort(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("block_size", document.getElementById('blockSizeInput').value);
    formData.append("k_way", document.getElementById('kWayInput').value);

    document.getElementById('loading-area').style.display = 'block';
    document.getElementById('btn-start-sort').disabled = true;

    try {
        const response = await fetch("/upload", { method: "POST", body: formData });
        const data = await response.json();

        document.getElementById('loading-area').style.display = 'none';

        if (data.error) {
            alert(data.error);
            return;
        }

        // Hiển thị khu vực kết quả (Nút Download và Visualize)
        document.getElementById('result-area').style.display = 'block';
        document.getElementById('info-status').innerText = data.status;

        if (data.steps && data.steps.length > 0) {
            cachedSteps = data.steps;
            document.getElementById('btn-visualize').style.display = 'inline-block';
        } else {
            document.getElementById('btn-visualize').style.display = 'none';
        }

        showToast("Hệ thống đã sắp xếp xong! Bạn có thể tải file ngay.");

    } catch (err) {
        document.getElementById('loading-area').style.display = 'none';
        alert("Lỗi kết nối server!");
    } finally {
        document.getElementById('btn-start-sort').disabled = false;
    }
}