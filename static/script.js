let animationInterval = null;
let cachedSteps = [];
let selectedFile = null;
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    updateRamEstimate();
    document.getElementById('blockSizeInput').addEventListener('input', updateRamEstimate);
    document.getElementById('kWayInput').addEventListener('input', updateRamEstimate);
});

function updateRamEstimate() {
    const b = parseInt(document.getElementById('blockSizeInput').value) || 0;
    const k = parseInt(document.getElementById('kWayInput').value) || 0;
    const total = (k * b) + k;
    document.getElementById('ram-estimate').innerText = total;
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
    } catch (e) { alert("Lỗi khi sắp xếp!"); }
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
    if(id !== 'visualize-screen') clearInterval(animationInterval);
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
        if (currentIndex >= cachedSteps.length) return clearInterval(animationInterval);
        drawState(cachedSteps[currentIndex]);
        slider.value = currentIndex;
        document.getElementById("stepDisplay").innerText = `${currentIndex + 1}/${cachedSteps.length}`;
        currentIndex++;
    }, 800);
}

function drawState(step) {
    document.getElementById("io-display").innerText = `DISK READS: ${step.io_reads}`;
    drawRuns(step.runs_full, step.pointers);
    drawBuffers(step.buffers);
    drawHeap(step.heap);
    drawPicked(step.picked);
    drawOutput(step.output);
}

// CÁC HÀM VẼ GIAO DIỆN CHI TIẾT
function drawRuns(runs, pointers) {
    const c = document.getElementById("runs"); c.innerHTML = "";
    runs.forEach((run, rIdx) => {
        const row = document.createElement("div"); row.className = "run-row";
        row.innerHTML = `<div class="run-label">RUN #${rIdx}</div>`;
        run.forEach((v, i) => {
            const b = document.createElement("div"); b.className = "box"; b.innerText = v.toFixed(1);
            if (i === pointers[rIdx]) b.style.boxShadow = "0 0 10px var(--neon-orange)";
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

function drawHeap(heap) {
    const container = document.getElementById("heap"); container.innerHTML = "";
    if (heap.length === 0) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%"); svg.setAttribute("height", "150");
    heap.forEach((v, i) => {
        const x = 50 + i * 70;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x); circle.setAttribute("cy", "50"); circle.setAttribute("r", "22");
        circle.setAttribute("stroke", "var(--neon-blue)"); circle.setAttribute("fill", "none");
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x); txt.setAttribute("y", "55"); txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("fill", "white"); txt.textContent = v.toFixed(1);
        g.appendChild(circle); g.appendChild(txt); svg.appendChild(g);
    });
    container.appendChild(svg);
}

function drawPicked(v) {
    const c = document.getElementById("picked"); c.innerHTML = "";
    if (v != null) { const b = document.createElement("div"); b.className = "box picked-box"; b.innerText = v.toFixed(1); c.appendChild(b); }
}

function drawOutput(out) {
    const c = document.getElementById("output"); c.innerHTML = "";
    out.slice(-30).forEach(v => {
        const b = document.createElement("div"); b.className = "box output-box"; b.innerText = v.toFixed(1); c.appendChild(b);
    });
}

function showToast(m) {
    const t = document.createElement("div"); t.className = "toast"; t.innerText = m;
    document.getElementById("toast-container").appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function seekStep(v) { pauseAnimation(); currentIndex = parseInt(v); drawState(cachedSteps[currentIndex]); }
function pauseAnimation() { clearInterval(animationInterval); }