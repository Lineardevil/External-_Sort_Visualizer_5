import struct
import random

def generate_binary_file(filename="3000.bin", count=3000):
    with open(filename, "wb") as f:
        for _ in range(count):
            number = random.uniform(0, 100)
            f.write(struct.pack("d", number))  # 'd' = double (8 bytes)

    print(f"Đã tạo {filename} với {count} số double (8 bytes).")

if __name__ == "__main__":
    generate_binary_file("3000.bin", 3000)