let animationInterval = null;
let isPaused = false;
let animationSpeed = 800;
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
    const ram = (k * b) + k;

    const display = document.getElementById('ram-estimate');
    const warning = document.getElementById('config-warning');
    const btnSort = document.getElementById('btn-start-sort');
    const btnPrep = document.getElementById('btn-prep-viz');

    display.innerText = ram;
    let errorMsg = "";

    if (b <= 0 || k <= 0) errorMsg = "⚠️ B and K must be greater than 0!";
    else if (k < 2) errorMsg = "⚠️ K-Way must be at least 2!";
    else if (ram > 5000) errorMsg = "⚠️ RAM usage too high! System might crash.";

    if (errorMsg) {
        warning.innerText = errorMsg;
        warning.style.display = 'block';
        display.style.color = "#ff4444";
        if (btnSort) btnSort.disabled = true;
        if (btnPrep) btnPrep.disabled = true;
    } else {
        warning.style.display = 'none';
        display.style.color = "var(--neon-orange)";
        if (btnSort) btnSort.disabled = false;
        if (btnPrep) btnPrep.disabled = false;
    }
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
        showToast("Full file sorted successfully!");
    } catch (e) { alert("Error during sorting!"); }
}

async function requestVisualize() {
    const formData = new FormData();
    formData.append("block_size", document.getElementById('blockSizeInput').value);
    formData.append("k_way", document.getElementById('kWayInput').value);

    const res = await fetch("/prepare_visualize", { method: "POST", body: formData });
    const data = await res.json();

    cachedSteps = data.steps;
    const actualCount = data.count; // Lấy con số thực tế từ backend

    document.getElementById('btn-visualize').style.display = 'block';

    // Hiển thị thông báo khớp với số lượng thực tế
    showToast(`Prepared ${actualCount} elements for visualization`);
}

function togglePlayPause() {
    const btn = document.getElementById('btn-play-pause');
    if (isPaused) {
        isPaused = false;
        btn.innerText = "PAUSE";
        startAnimation();
    } else {
        isPaused = true;
        btn.innerText = "PLAY";
        clearInterval(animationInterval);
    }
}

function updateSpeed(v) {
    animationSpeed = parseInt(v);
    if (!isPaused && animationInterval) {
        clearInterval(animationInterval);
        startAnimation();
    }
}

function showPage(id) {
    document.querySelectorAll('#start-screen, #upload-screen, #visualize-screen').forEach(p => p.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if(id !== 'visualize-screen') { clearInterval(animationInterval); isPaused = false; }
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
    const statusH2 = document.querySelector("#visualize-screen h2");
    if (step.phase === "creation") {
        statusH2.innerText = `PHASE 1: CHUNKING (Size 40) - ${step.msg}`;
        drawRuns(step.all_runs, []);
        document.getElementById("buffers-area").innerHTML = "<div class='loader-small'></div> Đang chuẩn bị các Run ban đầu...";
    } else {
        // Hiển thị thông tin Pass (Lượt trộn) trung gian
        statusH2.innerHTML = `PHASE 2: MERGING <span class='neon-text'>[${step.pass_info}]</span>`;
        drawRuns(step.runs_full, step.pointers);
        drawBuffers(step.buffers);
        drawHeap(step.heap);
        drawPicked(step.picked);
        drawOutput(step.output);
    }
}
function drawRuns(runs, pointers) {
    const c = document.getElementById("runs"); c.innerHTML = "";
    runs.forEach((run, rIdx) => {
        const row = document.createElement("div"); row.className = "run-row";
        row.innerHTML = `<div class="run-label">RUN #${rIdx}</div>`;
        run.forEach((v, i) => {
            const b = document.createElement("div"); b.className = "box"; b.innerText = v.toFixed(1);
            if (pointers && i === pointers[rIdx]) b.style.boxShadow = "0 0 10px #ff9f0a";
            if (pointers && i < pointers[rIdx]) b.style.opacity = "0.2";
            row.appendChild(b);
        });
        c.appendChild(row);
    });
}

function drawBuffers(buffers) {
    const bSize = parseInt(document.getElementById('blockSizeInput').value);
    const c = document.getElementById("buffers-area"); c.innerHTML = "";
    buffers.forEach((buf, i) => {
        const row = document.createElement("div"); row.className = "buffer-row";
        row.innerHTML = `<div class="buffer-label">BUFFER #${i} ${buf.length===0?'<small style="color:red">REFILL</small>':''}</div>`;
        for (let j = 0; j < bSize; j++) {
            const b = document.createElement("div"); b.className = "box buffer-box";
            if (buf[j] !== undefined) b.innerText = buf[j].toFixed(1);
            else { b.style.opacity = "0.1"; b.style.borderStyle = "dashed"; }
            row.appendChild(b);
        }
        c.appendChild(row);
    });
}
function drawHeap(heap) {
    const container = document.getElementById("heap"); container.innerHTML = "";
    if (heap.length === 0) return;
    const width = container.clientWidth || 500;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%"); svg.setAttribute("height", "180");
    const levelH = 45; const pos = [];
    for (let i = 0; i < heap.length; i++) {
        const lv = Math.floor(Math.log2(i + 1));
        const idxInLv = i - (Math.pow(2, lv) - 1);
        const x = (width / (Math.pow(2, lv) + 1)) * (idxInLv + 1);
        const y = 25 + lv * levelH;
        pos.push({ x, y });
    }
    for (let i = 0; i < heap.length; i++) {
        const L = 2 * i + 1; const R = 2 * i + 2;
        [L, R].forEach(cIdx => {
            if (cIdx < heap.length) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", pos[i].x); line.setAttribute("y1", pos[i].y);
                line.setAttribute("x2", pos[cIdx].x); line.setAttribute("y2", pos[cIdx].y);
                line.setAttribute("stroke", "#444"); svg.appendChild(line);
            }
        });
    }
    for (let i = 0; i < heap.length; i++) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", pos[i].x); c.setAttribute("cy", pos[i].y); c.setAttribute("r", "16");
        c.setAttribute("fill", "#161b22"); c.setAttribute("stroke", "#00d2ff");
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", pos[i].x); t.setAttribute("y", pos[i].y + 4);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "white");
        t.setAttribute("font-size", "10px"); t.textContent = heap[i].toFixed(1);
        g.appendChild(c); g.appendChild(t); svg.appendChild(g);
    }
    container.appendChild(svg);
}

function drawPicked(v) {
    const c = document.getElementById("picked"); c.innerHTML = "";
    if (v != null) { const b = document.createElement("div"); b.className = "box"; b.innerText = v.toFixed(1); c.appendChild(b); }
}

function drawOutput(out) {
    const container = document.getElementById("output");
    if (!container) return;
    const currentDisplayedCount = container.children.length;
    if (out.length > currentDisplayedCount) {
        const newElements = out.slice(currentDisplayedCount);
        newElements.forEach((value) => {
            const div = document.createElement("div");
            div.className = "box output-box";
            div.innerText = value.toFixed(1);
            container.appendChild(div);
        });
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    else if (out.length < currentDisplayedCount || out.length === 0) {
        container.innerHTML = "";
        out.forEach(value => {
            const div = document.createElement("div");
            div.className = "box output-box";
            div.innerText = value.toFixed(1);
            container.appendChild(div);
        });
    }
}

function showToast(m) {
    const t = document.createElement("div"); t.className = "toast"; t.innerText = m;
    document.getElementById("toast-container").appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function seekStep(v) { pauseAnimation(); currentIndex = parseInt(v); drawState(cachedSteps[currentIndex]); }
function pauseAnimation() { clearInterval(animationInterval); isPaused = true; document.getElementById('btn-play-pause').innerText = "PLAY"; }