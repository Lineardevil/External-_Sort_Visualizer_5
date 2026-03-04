from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import struct
import heapq

app = Flask(__name__)

# Đảm bảo các thư mục tồn tại
for path in ["uploads", "runs", "output"]:
    os.makedirs(path, exist_ok=True)


def read_binary_file(filename):
    numbers = []
    if not os.path.exists(filename): return numbers
    with open(filename, "rb") as f:
        data = f.read()
        if data:
            count = len(data) // 8
            numbers = list(struct.unpack(f"{count}d", data))
    return numbers


def write_binary_file(filename, numbers):
    with open(filename, "wb") as f:
        for number in numbers:
            f.write(struct.pack("d", number))


def create_runs_dynamic(input_file, k):
    for f in os.listdir("runs"):
        os.remove(os.path.join("runs", f))
    numbers = read_binary_file(input_file)
    n = len(numbers)
    if n == 0: return []

    # Sửa lỗi file nhỏ: Đảm bảo run_size tối thiểu là 1
    run_size = max(1, (n + k - 1) // k)
    run_files = []
    for i in range(0, n, run_size):
        chunk = numbers[i:i + run_size]
        chunk.sort()
        run_name = f"runs/run_{len(run_files)}.bin"
        write_binary_file(run_name, chunk)
        run_files.append(run_name)
    return run_files


def fast_merge_only(run_files, output_file):
    if not run_files: return
    handles = [open(f, "rb") for f in run_files]

    def get_val(f):
        data = f.read(8)
        return struct.unpack("d", data)[0] if data else None

    heap = []
    for i, h in enumerate(handles):
        val = get_val(h)
        if val is not None: heapq.heappush(heap, (val, i))
    with open(output_file, "wb") as f_out:
        while heap:
            val, idx = heapq.heappop(heap)
            f_out.write(struct.pack("d", val))
            next_val = get_val(handles[idx])
            if next_val is not None: heapq.heappush(heap, (next_val, idx))
    for h in handles: h.close()


def merge_runs_with_blocks(run_files, output_file, block_size):
    if not run_files: return []
    handles = [open(f, "rb") for f in run_files]
    buffers = [[] for _ in run_files]
    steps = []
    viz_output = []
    full_runs_content = [read_binary_file(f) for f in run_files]
    current_pointers = [0] * len(run_files)

    def refill_buffer(idx):
        data_read = handles[idx].read(8 * block_size)
        if not data_read: return False
        count = len(data_read) // 8
        numbers = struct.unpack(f"{count}d", data_read)
        buffers[idx].extend(numbers)
        return True

    heap = []
    for i in range(len(handles)):
        if refill_buffer(i):
            if buffers[i]:
                val = buffers[i].pop(0)
                heapq.heappush(heap, (val, i))

    while heap:
        val, idx = heapq.heappop(heap)
        viz_output.append(val)
        current_pointers[idx] += 1
        if not buffers[idx]: refill_buffer(idx)
        if buffers[idx]:
            next_val = buffers[idx].pop(0)
            heapq.heappush(heap, (next_val, idx))
        steps.append({
            "picked": val, "run_idx": idx, "heap": [x[0] for x in heap],
            "buffers": [list(b) for b in buffers],
            "pointers": current_pointers.copy(), "runs_full": full_runs_content,
            "output": viz_output.copy()
        })
    for h in handles: h.close()
    return steps


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    try:
        k_way = int(request.form.get("k_way", 4))
        if k_way < 2: return jsonify({"error": "K-Way must be at least 2"}), 400
    except:
        return jsonify({"error": "Invalid params"}), 400
    if not file: return jsonify({"error": "No file uploaded"}), 400
    input_path = "uploads/input.bin"
    file.save(input_path)
    runs = create_runs_dynamic(input_path, k_way)
    fast_merge_only(runs, "output/sorted.bin")
    return jsonify({"status": "FULL FILE SORTED SUCCESSFULLY!"})


@app.route("/prepare_visualize", methods=["POST"])
def prepare_visualize():
    try:
        block_size = int(request.form.get("block_size", 5))
        k_way = int(request.form.get("k_way", 4))
    except:
        return jsonify({"error": "Invalid params"}), 400

    input_numbers = read_binary_file("uploads/input.bin")[:200]  # Lấy 200 số để dễ nhìn
    steps = []

    # --- PHASE 1: CREATION (Lấy chunk -> Chia Run) ---
    n = len(input_numbers)
    run_size = max(1, (n + k_way - 1) // k_way)
    initial_runs = []

    for i in range(0, n, run_size):
        chunk = sorted(input_numbers[i:i + run_size])
        run_name = f"runs/run_{len(initial_runs)}.bin"
        write_binary_file(run_name, chunk)
        initial_runs.append(run_name)

        # Ghi lại bước tạo Run (Visualize luồng nạp Chunk)
        steps.append({
            "phase": "creation",
            "msg": f"Đang tạo Run {len(initial_runs) - 1} từ Chunk dữ liệu...",
            "current_run_idx": len(initial_runs) - 1,
            "chunk_data": chunk,
            "all_runs": [read_binary_file(f) for f in initial_runs] + [[] for _ in range(k_way - len(initial_runs))]
        })

    # --- PHASE 2: MERGE (Tràn xuống buffer -> Heap -> Output) ---
    handles = [open(f, "rb") for f in initial_runs]
    buffers = [[] for _ in initial_runs]
    viz_output = []
    pointers = [0] * len(initial_runs)

    def refill(idx):
        data = handles[idx].read(8 * block_size)
        if not data: return False
        buffers[idx].extend(struct.unpack(f"{len(data) // 8}d", data))
        return True

    heap = []
    for i in range(len(handles)):
        if refill(i) and buffers[i]:
            val = buffers[i].pop(0)
            heapq.heappush(heap, (val, i))

    while heap:
        val, idx = heapq.heappop(heap)
        viz_output.append(val)
        pointers[idx] += 1

        steps.append({
            "phase": "merge",
            "picked": val, "run_idx": idx,
            "heap": [x[0] for x in heap],
            "buffers": [list(b) for b in buffers],
            "pointers": pointers.copy(),
            "runs_full": [read_binary_file(f) for f in initial_runs],
            "output": viz_output.copy()
        })

        if not buffers[idx]: refill(idx)
        if buffers[idx]:
            next_val = buffers[idx].pop(0)
            heapq.heappush(heap, (next_val, idx))

    for h in handles: h.close()
    return jsonify({"steps": steps, "count": n})

@app.route('/download')
def download_file():
    return send_from_directory("output", "sorted.bin", as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)