import re, subprocess, sys, json
pdb, label = sys.argv[1], sys.argv[2]
addrs = [int(x, 16) for x in sys.argv[3].split(",")]
tool = sys.argv[4]
out = []
sh = subprocess.run([tool, "dump", "--section-headers", pdb], capture_output=True, text=True).stdout
secs = {}
cur = None
for line in sh.splitlines():
    m = re.search(r"SECTION HEADER #(\d+)", line)
    if m: cur = int(m.group(1)); continue
    m = re.search(r"([0-9A-Fa-f]+) virtual address", line)
    if m and cur is not None: secs[cur] = int(m.group(1), 16)
out.append(f"sections {secs}")
sy = subprocess.run([tool, "dump", "--symbols", pdb], capture_output=True, text=True).stdout
procs = []
name = None
for line in sy.splitlines():
    m = re.search(r"S_[GL]PROC32(?:_ID)? \[size = \d+\] `(.*)`", line)
    if m: name = m.group(1); continue
    if name:
        m = re.search(r"addr = (\d+):(\d+), code size = (\d+)", line)
        if m:
            s, off, size = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if s in secs: procs.append((secs[s] + off, size, name))
            name = None
out.append(f"procs {len(procs)}")
procs.sort()
import bisect
starts = [p[0] for p in procs]
for a in addrs:
    q = a - 1
    i = bisect.bisect_right(starts, q) - 1
    hit = "?"
    if i >= 0:
        st, size, nm = procs[i]
        hit = f"{nm} +0x{q-st:X}" + ("" if q < st + size else f" (OUTSIDE size {size})")
    out.append(f"0x{a:X} -> {hit}")
open(f"out-{label}.txt", "w").write("\n".join(out) + "\n")
print("\n".join(out))
