from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import struct
import heapq

app = Flask(__name__)

# Ensure system directories exist
for path in ["uploads", "runs", "output"]:
    os.makedirs(path, exist_ok=True)

def read_binary_file(filename):
    """Load binary file into RAM"""
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
    """Split file into sorted runs"""
    for f in os.listdir("runs"):
        os.remove(os.path.join("runs", f))
    numbers = read_binary_file(input_file)
    n = len(numbers)
    if n == 0: return []
    run_size = max(1, n // k)
    run_files = []
    for i in range(0, n, run_size):
        chunk = numbers[i:i + run_size]
        chunk.sort()
        run_name = f"runs/run_{len(run_files)}.bin"
        write_binary_file(run_name, chunk)
        run_files.append(run_name)
    return run_files

def fast_merge_only(run_files, output_file):
    """Fast merge without storing steps for download"""
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
    """Merge and store animation steps"""
    handles = [open(f, "rb") for f in run_files]
    buffers = [[] for _ in run_files]
    io_reads = 0
    steps = []
    viz_output = []
    full_runs_content = [read_binary_file(f) for f in run_files]
    current_pointers = [0] * len(run_files)

    def refill_buffer(idx):
        nonlocal io_reads
        data_read = handles[idx].read(8 * block_size)
        if not data_read: return False
        io_reads += 1
        count = len(data_read) // 8
        numbers = struct.unpack(f"{count}d", data_read)
        buffers[idx].extend(numbers)
        return True

    heap = []
    for i in range(len(handles)):
        if refill_buffer(i):
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
            "buffers": [list(b) for b in buffers], "io_reads": io_reads,
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
    """STAGE 1: SORT FULL FILE"""
    file = request.files.get("file")
    k_way = max(2, min(int(request.form.get("k_way", 4)), 20))
    if not file: return jsonify({"error": "No file uploaded"}), 400
    input_path = "uploads/input.bin"
    file.save(input_path)
    runs = create_runs_dynamic(input_path, k_way)
    fast_merge_only(runs, "output/sorted.bin")
    return jsonify({"status": "FULL FILE SORTED SUCCESSFULLY!"})

@app.route("/prepare_visualize", methods=["POST"])
def prepare_visualize():
    """STAGE 2: PREPARE 500 ELEMENTS FOR PREVIEW"""
    block_size = int(request.form.get("block_size", 5))
    k_way = int(request.form.get("k_way", 4))
    input_path = "uploads/input.bin"
    viz_temp_path = "uploads/viz_limit.bin"
    with open(input_path, "rb") as f_in:
        data = f_in.read(500 * 8)
    with open(viz_temp_path, "wb") as f_out:
        f_out.write(data)
    runs = create_runs_dynamic(viz_temp_path, k_way)
    steps = merge_runs_with_blocks(runs, "output/viz_sorted.bin", block_size)
    return jsonify({"steps": steps})

@app.route('/download')
def download_file():
    return send_from_directory("output", "sorted.bin", as_attachment=True)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)