let animationInterval = null;
let currentSteps = [];
let currentIndex = 0;
let cachedSteps = [];

/**
 * CHUYỂN TRANG & DỌN DẸP
 */
function showPage(pageId) {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('visualize-screen').style.display = 'none';
    document.getElementById(pageId).style.display = 'block';

    // Dừng toàn bộ animation khi chuyển trang để tránh lỗi bộ nhớ
    pauseAnimation();
}

function handleFileSelect() {
    const file = document.getElementById('fileInput').files[0];
    if (file) {
        const n = Math.floor(file.size / 8);
        const k = Math.ceil(Math.sqrt(n));

        document.getElementById('file-info').style.display = 'block';
        document.getElementById('info-n').innerText = n;
        document.getElementById('info-k').innerText = k;
        document.getElementById('btn-sort').style.display = 'inline-block';
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000); // Giảm thời gian thông báo xuống 5s cho gọn
}

/**
 * XỬ LÝ LOGIC SORT
 */


function handleFileSelect() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) return;

    // Hiển thị thông tin cơ bản trước
    const n = Math.floor(file.size / 8);
    const k = Math.ceil(Math.sqrt(n));
    document.getElementById('file-info').style.display = 'block';
    document.getElementById('info-n').innerText = n;
    document.getElementById('info-k').innerText = k;
    document.getElementById('info-status').innerText = "PROCESSING...";

    // Tự động chạy Sort ngay khi chọn file
    autoUploadAndSort(file);
}

function autoUploadAndSort(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("block_size", document.getElementById('blockSizeInput').value);

    document.getElementById('loading-area').style.display = 'block';

    fetch("/upload", {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById('loading-area').style.display = 'none';

        // Cập nhật thông tin file kết quả ngay lập tức
        const statusEl = document.getElementById('info-status');
        const outputEl = document.getElementById('info-output');
        if (statusEl) statusEl.innerText = "COMPLETED";
        if (outputEl) outputEl.innerText = data.output_status;

        // Lưu steps vào bộ nhớ đệm
        if (data.steps && data.steps.length > 0) {
            cachedSteps = data.steps;
            document.getElementById('btn-visualize').style.display = 'inline-block';
            showToast("Sắp xếp thành công! Bạn có thể xem mô phỏng.");
        } else {
            showToast("File quá lớn, đã xuất file kết quả trực tiếp.");
        }
    })
    .catch(err => {
        document.getElementById('loading-area').style.display = 'none';
        alert("Lỗi: " + err.message);
    });
}

function goToVisualize() {
    if (cachedSteps.length > 0) {
        currentSteps = cachedSteps;
        currentIndex = 0;
        showPage('visualize-screen');
        startAnimation();
    }
}

/**
 * HỆ THỐNG ANIMATION
 */
function startAnimation() {
    const slider = document.getElementById("stepSlider");
    if (slider) slider.max = currentSteps.length - 1;

    if (animationInterval) clearInterval(animationInterval);

    animationInterval = setInterval(() => {
        if (currentIndex >= currentSteps.length) {
            clearInterval(animationInterval);
            showToast("Hoàn tất quá trình sắp xếp!");
            return;
        }
        drawState(currentSteps[currentIndex]);
        updateSliderDisplay();
        currentIndex++;
    }, 800);
}

function updateSliderDisplay() {
    const slider = document.getElementById("stepSlider");
    const display = document.getElementById("stepDisplay");
    if (slider) slider.value = currentIndex;
    if (display) display.innerText = `${currentIndex + 1} / ${currentSteps.length}`;
}

function drawState(step) {
    // 1. Cập nhật con số Disk Reads lên UI
    const ioDisplay = document.getElementById("io-display");
    if (ioDisplay) {
        ioDisplay.innerText = `DISK READS: ${step.io_reads}`;
    }

    // 2. Các hàm vẽ khác giữ nguyên
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

/**
 * ĐIỀU KHIỂN
 */
function pauseAnimation() { clearInterval(animationInterval); animationInterval = null; }
function resumeAnimation() { if (!animationInterval && currentIndex < currentSteps.length) startAnimation(); }
function seekStep(idx) {
    pauseAnimation();
    currentIndex = parseInt(idx);
    if (currentSteps[currentIndex]) {
        drawState(currentSteps[currentIndex]);
        updateSliderDisplay();
    }
}