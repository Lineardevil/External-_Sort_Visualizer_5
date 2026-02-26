from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import struct
import heapq

app = Flask(__name__)

# Đảm bảo các thư mục hệ thống luôn sẵn sàng
for path in ["uploads", "runs", "output"]:
    os.makedirs(path, exist_ok=True)


def read_binary_file(filename):
    """Đọc toàn bộ file binary phục vụ vẽ UI"""
    numbers = []
    if not os.path.exists(filename): return numbers
    with open(filename, "rb") as f:
        while True:
            bytes_read = f.read(8)
            if not bytes_read: break
            numbers.append(struct.unpack("d", bytes_read)[0])
    return numbers


def write_binary_file(filename, numbers):
    """Ghi mảng số thực xuống file binary"""
    with open(filename, "wb") as f:
        for number in numbers:
            f.write(struct.pack("d", number))


def create_runs_dynamic(input_file, num_runs_target):
    """Chia file input thành các Run mà KHÔNG nạp cả file vào RAM"""
    for f in os.listdir("runs"):
        os.remove(os.path.join("runs", f))

    file_size = os.path.getsize(input_file)
    n_elements = file_size // 8
    # Kích thước mỗi Run để đạt được số lượng K-Way mong muốn
    run_size = max(1, n_elements // num_runs_target)

    run_files = []
    with open(input_file, "rb") as f_in:
        for i in range(num_runs_target):
            data = f_in.read(run_size * 8)
            if not data: break

            count = len(data) // 8
            chunk = list(struct.unpack(f"{count}d", data))
            chunk.sort()  # Sắp xếp trong RAM

            run_name = f"runs/run_{len(run_files)}.bin"
            write_binary_file(run_name, chunk)
            run_files.append(run_name)
            del chunk

    return run_files


def merge_runs_with_blocks(run_files, output_file, block_size=5):
    """Hàm trộn lưu các bước để Visualize"""
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

    steps.append({
        "picked": None, "run_idx": -1, "heap": [], "io_reads": 0,
        "buffers": [list(b) for b in buffers],
        "pointers": current_pointers.copy(),
        "runs_full": full_runs_content, "output": []
    })

    heap = []
    for i in range(len(handles)):
        if refill_buffer(i):
            val = buffers[i].pop(0)
            heapq.heappush(heap, (val, i))
            steps.append({
                "picked": None, "run_idx": i,
                "heap": [x[0] for x in heap],
                "buffers": [list(b) for b in buffers],
                "io_reads": io_reads,
                "pointers": current_pointers.copy(),
                "runs_full": full_runs_content, "output": []
            })
    while heap:
        val, idx = heapq.heappop(heap)
        viz_output.append(val)
        current_pointers[idx] += 1
        if not buffers[idx]:
            refill_buffer(idx)
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
    write_binary_file(output_file, viz_output)
    return steps


def fast_merge_only(run_files, output_file):
    """Hàm trộn thuần túy cho file lớn, không lưu steps"""
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
            if next_val is not None:
                heapq.heappush(heap, (next_val, idx))
    for h in handles: h.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    # Giới hạn an toàn phía Backend
    block_size = max(1, min(int(request.form.get("block_size", 5)), 100))
    k_way = max(2, min(int(request.form.get("k_way", 4)), 20))

    if not file: return jsonify({"error": "No file"}), 400

    input_path = "uploads/input.bin"
    file.save(input_path)
    n_elements = os.path.getsize(input_path) // 8

    is_too_large = n_elements > 10001
    output_file = "output/sorted.bin"

    runs = create_runs_dynamic(input_path, k_way)  # Dùng k_way từ người dùng

    if is_too_large:
        fast_merge_only(runs, output_file)
        steps = []
        status_msg = f"File lớn ({n_elements} pt): Ưu tiên xuất file nhanh, hủy Visualize."
    else:
        steps = merge_runs_with_blocks(runs, output_file, block_size)
        status_msg = "Xử lý hoàn tất!"

    return jsonify({
        "steps": steps,
        "is_too_large": is_too_large,
        "status": status_msg,
        "output_status": f"File đã sẵn sàng tại: {output_file}"
    })


@app.route('/download')
def download_file():
    """Gửi file sorted.bin từ thư mục output về máy người dùng"""
    return send_from_directory("output", "sorted.bin", as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)