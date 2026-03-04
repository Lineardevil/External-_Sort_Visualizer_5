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
    block_size = int(request.form.get("block_size", 5))
    k_way = int(request.form.get("k_way", 4))
    input_numbers = read_binary_file("uploads/input.bin")[:200]

    steps = []
    # PHASE 1: Tạo Run ban đầu (Chunk 40)
    chunk_size = 40
    current_runs = []
    for i in range(0, len(input_numbers), chunk_size):
        chunk = sorted(input_numbers[i:i + chunk_size])
        path = f"runs/viz_run_0_{len(current_runs)}.bin"
        write_binary_file(path, chunk)
        current_runs.append(path)
        steps.append({
            "phase": "creation",
            "msg": f"Tạo Run ban đầu từ Chunk 40 số",
            "all_runs": [read_binary_file(p) for p in current_runs]
        })

    # PHASE 2: Multi-pass Merge (Trộn cho đến khi còn 1 Run)
    pass_idx = 1
    while len(current_runs) > 1:
        new_runs = []
        # Chia các Run hiện có thành từng nhóm tối đa K phần tử
        for i in range(0, len(current_runs), k_way):
            group = current_runs[i: i + k_way]
            if len(group) == 1:  # Nếu chỉ còn 1 Run lẻ, đưa thẳng vào lượt sau
                new_runs.append(group[0])
                continue

            output_path = f"runs/viz_run_{pass_idx}_{len(new_runs)}.bin"
            # Thực hiện trộn nhóm này và ghi lại steps
            sub_steps = merge_logic_for_viz(group, output_path, block_size, pass_idx)
            steps.extend(sub_steps)
            new_runs.append(output_path)

        current_runs = new_runs
        pass_idx += 1

    return jsonify({"steps": steps, "count": len(input_numbers)})


def merge_logic_for_viz(run_files, output_file, block_size, pass_num, group_idx):
    """Thực hiện trộn một nhóm Run và ghi lại các bước (steps)"""
    handles = [open(f, "rb") for f in run_files]
    buffers = [[] for _ in run_files]
    steps = []
    viz_output = []
    # Đọc toàn bộ nội dung các run trong nhóm này để hiển thị trên giao diện
    full_runs_data = [read_binary_file(f) for f in run_files]
    pointers = [0] * len(run_files)

    msg_prefix = f"PASS {pass_num} (Group {group_idx}): "

    def refill(idx):
        data = handles[idx].read(8 * block_size)
        if not data: return False
        nums = struct.unpack(f"{len(data) // 8}d", data)
        buffers[idx].extend(nums)
        return True

    heap = []
    # Khởi tạo Heap
    for i in range(len(handles)):
        if refill(i) and buffers[i]:
            val = buffers[i].pop(0)
            heapq.heappush(heap, (val, i))

    while heap:
        val, idx = heapq.heappop(heap)
        viz_output.append(val)
        pointers[idx] += 1

        # Ghi lại trạng thái tại bước này
        steps.append({
            "phase": "merge",
            "pass_info": f"Lượt {pass_num} - Nhóm {group_idx}",
            "picked": val,
            "run_idx": idx,
            "heap": [x[0] for x in heap],
            "buffers": [list(b) for b in buffers],
            "pointers": pointers.copy(),
            "runs_full": full_runs_data,
            "output": viz_output.copy()
        })

        if not buffers[idx]:
            refill(idx)  # Nạp thêm Block Size nếu Buffer trống

        if buffers[idx]:
            next_v = buffers[idx].pop(0)
            heapq.heappush(heap, (next_v, idx))

    for h in handles: h.close()
    # Sau khi trộn xong nhóm này, ghi kết quả ra tệp Run trung gian
    write_binary_file(output_file, viz_output)
    return steps


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
            "phase": "merge", "picked": val, "run_idx": idx,
            "heap": [x[0] for x in heap], "buffers": [list(b) for b in buffers],
            "pointers": pointers.copy(), "runs_full": full_runs_data, "output": viz_output.copy()
        })
        if not buffers[idx]: refill(idx)
        if buffers[idx]:
            next_v = buffers[idx].pop(0)
            heapq.heappush(heap, (next_v, idx))

    for h in handles: h.close()
    return jsonify({"steps": steps, "count": len(input_numbers)})

@app.route('/download')
def download_file():
    return send_from_directory("output", "sorted.bin", as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)