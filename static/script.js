let animationInterval = null;
let isPaused = false;
let animationSpeed = 800; // Mặc định 800ms
let cachedSteps = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    updateRamEstimate();
    document.getElementById('blockSizeInput').addEventListener('input', updateRamEstimate);
    document.getElementById('kWayInput').addEventListener('input', updateRamEstimate);
});

function updateRamEstimate() {
    const b = parseInt(document.getElementById('blockSizeInput').value) || 0;
    const k = parseInt(document.getElementById('kWayInput').value) || 0;
    document.getElementById('ram-estimate').innerText = (k * b) + k;
}

function handleFileSelect() {
    selectedFile = document.getElementById('fileInput').files[0];
    if (!selectedFile) return;
    document.getElementById('file-ready-area').style.display = 'block';
    document.getElementById('info-filename').innerText = selectedFile.name;
    document.getElementById('result-area').style.display = 'none';
}

async function triggerSort() {
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("k_way", document.getElementById('kWayInput').value);
    document.getElementById('loading-area').style.display = 'block';
    try {
        const res = await fetch("/upload", { method: "POST", body: formData });
        const data = await res.json();
        document.getElementById('loading-area').style.display = 'none';
        document.getElementById('result-area').style.display = 'block';
        document.getElementById('info-status').innerText = data.status;
        document.getElementById('btn-visualize').style.display = 'none';
        document.getElementById('btn-prep-viz').style.display = 'block';
    } catch (e) { alert("Lỗi khi Sort!"); }
}

async function requestVisualize() {
    const loading = document.getElementById('viz-loading');
    const btnPrep = document.getElementById('btn-prep-viz');
    loading.style.display = 'block';
    btnPrep.style.display = 'none';

    const formData = new FormData();
    formData.append("block_size", document.getElementById('blockSizeInput').value);
    formData.append("k_way", document.getElementById('kWayInput').value);

    try {
        const res = await fetch("/prepare_visualize", { method: "POST", body: formData });
        const data = await res.json();
        cachedSteps = data.steps;
        loading.style.display = 'none';
        document.getElementById('btn-visualize').style.display = 'block';
        showToast("Dữ liệu mô phỏng đã nạp xong!");
    } catch (e) { alert("Lỗi nạp mô phỏng!"); btnPrep.style.display = 'block'; }
}

function showPage(id) {
    document.querySelectorAll('#start-screen, #upload-screen, #visualize-screen').forEach(p => p.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if(id !== 'visualize-screen') {
        clearInterval(animationInterval);
        isPaused = false;
    }
}

function togglePlayPause() {
    const btn = document.getElementById('btn-play-pause');
    if (isPaused) {
        isPaused = false;
        btn.innerText = "PAUSE";
        btn.style.borderColor = "#00ff88";
        btn.style.color = "#00ff88";
        startAnimation(); // Tiếp tục chạy
    } else {
        isPaused = true;
        btn.innerText = "CONTINUE";
        btn.style.borderColor = "#ff9f0a";
        btn.style.color = "#ff9f0a";
        clearInterval(animationInterval); // Dừng lại
    }
}

function updateSpeed(val) {
    animationSpeed = parseInt(val);
    document.getElementById('speedDisplay').innerText = val + "ms";
    // Nếu đang chạy thì khởi động lại interval với tốc độ mới
    if (!isPaused && animationInterval) {
        clearInterval(animationInterval);
        startAnimation();
    }
}



function goToVisualize() {
    currentIndex = 0;
    showPage('visualize-screen');
    startAnimation();
}

function startAnimation() {
    const slider = document.getElementById("stepSlider");
    slider.max = cachedSteps.length - 1;

    if (animationInterval) clearInterval(animationInterval);

    animationInterval = setInterval(() => {
        if (currentIndex >= cachedSteps.length) {
            clearInterval(animationInterval);
            return;
        }

        drawState(cachedSteps[currentIndex]);
        slider.value = currentIndex;
        document.getElementById("stepDisplay").innerText = `${currentIndex + 1}/${cachedSteps.length}`;
        currentIndex++;
    }, animationSpeed); // Sử dụng biến animationSpeed thay vì 800 cố định
}

function drawState(step) {
    document.getElementById("io-display").innerText = `DISK READS: ${step.io_reads}`;
    drawRuns(step.runs_full, step.pointers);
    drawBuffers(step.buffers);
    drawHeap(step.heap);
    drawPicked(step.picked);
    drawOutput(step.output);
}

// --- CÁC HÀM VẼ CHI TIẾT ---

function drawRuns(runs, pointers) {
    const c = document.getElementById("runs"); c.innerHTML = "";
    runs.forEach((run, rIdx) => {
        const row = document.createElement("div"); row.className = "run-row";
        row.innerHTML = `<div class="run-label">RUN #${rIdx}</div>`;
        run.forEach((v, i) => {
            const b = document.createElement("div"); b.className = "box"; b.innerText = v.toFixed(1);
            if (i === pointers[rIdx]) b.style.boxShadow = "0 0 10px #ff9f0a";
            if (i < pointers[rIdx]) b.style.opacity = "0.2";
            row.appendChild(b);
        });
        c.appendChild(row);
    });
}

function drawBuffers(buffers) {
    const c = document.getElementById("buffers-area"); c.innerHTML = "";
    buffers.forEach((buf, i) => {
        const row = document.createElement("div"); row.className = "buffer-row";
        row.innerHTML = `<div class="buffer-label">BUFFER #${i}</div>`;
        buf.forEach(v => {
            const b = document.createElement("div"); b.className = "box buffer-box"; b.innerText = v.toFixed(1);
            row.appendChild(b);
        });
        c.appendChild(row);
    });
}

/** HÀM VẼ CÂY MIN-HEAP CHUẨN **/
function drawHeap(heap) {
    const container = document.getElementById("heap");
    container.innerHTML = "";
    if (heap.length === 0) return;

    const width = container.clientWidth || 500;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "200");

    const levelHeight = 50;
    const nodeRadius = 18;
    const positions = [];

    // Tính toán tọa độ cho từng node
    for (let i = 0; i < heap.length; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const indexInLevel = i - (Math.pow(2, level) - 1);
        const nodesInLevel = Math.pow(2, level);
        const x = (width / (nodesInLevel + 1)) * (indexInLevel + 1);
        const y = 30 + level * levelHeight;
        positions.push({ x, y });
    }

    // Vẽ đường kẻ nối (vẽ trước để nằm dưới node)
    for (let i = 0; i < heap.length; i++) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        [left, right].forEach(childIdx => {
            if (childIdx < heap.length) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", positions[i].x); line.setAttribute("y1", positions[i].y);
                line.setAttribute("x2", positions[childIdx].x); line.setAttribute("y2", positions[childIdx].y);
                line.setAttribute("stroke", "#444"); line.setAttribute("stroke-width", "2");
                svg.appendChild(line);
            }
        });
    }

    // Vẽ các nút tròn và số
    for (let i = 0; i < heap.length; i++) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", positions[i].x); circle.setAttribute("cy", positions[i].y);
        circle.setAttribute("r", nodeRadius); circle.setAttribute("fill", "#161b22");
        circle.setAttribute("stroke", "#00d2ff"); circle.setAttribute("stroke-width", "2");

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", positions[i].x); txt.setAttribute("y", positions[i].y + 5);
        txt.setAttribute("text-anchor", "middle"); txt.setAttribute("fill", "white");
        txt.setAttribute("font-size", "11px"); txt.textContent = heap[i].toFixed(1);

        g.appendChild(circle); g.appendChild(txt);
        svg.appendChild(g);
    }
    container.appendChild(svg);
}

function drawPicked(v) {
    const c = document.getElementById("picked"); c.innerHTML = "";
    if (v != null) { const b = document.createElement("div"); b.className = "box picked-box"; b.innerText = v.toFixed(1); c.appendChild(b); }
}

function drawOutput(out) {
    const c = document.getElementById("output"); c.innerHTML = "";
    out.slice(-20).forEach(v => {
        const b = document.createElement("div"); b.className = "box output-box"; b.innerText = v.toFixed(1); c.appendChild(b);
    });
}

function showToast(m) {
    const t = document.createElement("div"); t.className = "toast"; t.innerText = m;
    document.getElementById("toast-container").appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function seekStep(v) {
    // Khi người dùng kéo thanh trượt, tạm dừng để tránh xung đột
    if (!isPaused) togglePlayPause();
    currentIndex = parseInt(v);
    drawState(cachedSteps[currentIndex]);
    document.getElementById("stepDisplay").innerText = `${currentIndex + 1}/${cachedSteps.length}`;
}