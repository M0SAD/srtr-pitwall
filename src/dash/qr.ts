// Küçük QR kod üreticisi (bağımlılıksız): bayt kipi, hata düzeltme düzeyi M, sürüm 1–10 (213 bayta kadar).
// "Başka cihazda aç" panelindeki adresler için yeterli. Dönen değer: modül matrisi (true = koyu).

const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsDivisor(degree: number): number[] {
  const res = new Array<number>(degree).fill(0);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      res[j] = mul(res[j], root);
      if (j + 1 < degree) res[j] ^= res[j + 1];
    }
    root = mul(root, 2);
  }
  return res;
}
function rsRemainder(data: number[], div: number[]): number[] {
  const res = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (res.shift() as number);
    res.push(0);
    div.forEach((c, i) => (res[i] ^= mul(c, f)));
  }
  return res;
}

const dataCapacity = (v: number) => TOTAL[v] - EC_PER_BLOCK[v] * BLOCKS[v];

function codewords(bytes: Uint8Array, v: number): number[] {
  const cap = dataCapacity(v);
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(4, 4);
  push(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);

  // Bloklara böl, hata düzeltme ekle, serpiştir
  const nb = BLOCKS[v];
  const ec = EC_PER_BLOCK[v];
  const short = Math.floor(cap / nb);
  const longCount = cap % nb;
  const div = rsDivisor(ec);
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  let k = 0;
  for (let i = 0; i < nb; i++) {
    const len = short + (i >= nb - longCount ? 1 : 0);
    const d = data.slice(k, k + len);
    k += len;
    blocks.push(d);
    ecs.push(rsRemainder(d, div));
  }
  const out: number[] = [];
  for (let i = 0; i <= short; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

/** Metni QR matrisine çevirir; sığmazsa null */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= 10 && bytes.length + (v < 10 ? 2 : 3) > dataCapacity(v)) v++;
  if (v > 10) return null;
  const size = 17 + 4 * v;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    m[y][x] = dark;
    fn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
  }
  const al = ALIGN[v];
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const format = (mask: number) => {
    const data = mask; // düzey M: 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  const cw = codewords(bytes, v);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) {
          m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
  }

  const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (k: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
  };
  const penalty = () => {
    let p = 0;
    let dark = 0;
    for (let y = 0; y < size; y++) {
      let rowRun = 1;
      let colRun = 1;
      let row = "";
      let col = "";
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        row += m[y][x] ? "1" : "0";
        col += m[x][y] ? "1" : "0";
        if (x > 0) {
          if (m[y][x] === m[y][x - 1]) {
            rowRun++;
            if (rowRun === 5) p += 3;
            else if (rowRun > 5) p++;
          } else rowRun = 1;
          if (m[x][y] === m[x - 1][y]) {
            colRun++;
            if (colRun === 5) p += 3;
            else if (colRun > 5) p++;
          } else colRun = 1;
        }
        if (x > 0 && y > 0 && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x] && m[y][x] === m[y - 1][x - 1]) p += 3;
      }
      for (const s of [row, col]) {
        for (const pat of ["10111010000", "00001011101"]) {
          let at = s.indexOf(pat);
          while (at >= 0) {
            p += 40;
            at = s.indexOf(pat, at + 1);
          }
        }
      }
    }
    p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return p;
  };
  let best = 0;
  let bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    applyMask(k);
    format(k);
    const p = penalty();
    if (p < bestP) {
      bestP = p;
      best = k;
    }
    applyMask(k);
  }
  applyMask(best);
  format(best);
  return m;
}

/** SVG yolu (her koyu modül 1×1 kare); viewBox: 0 0 n n, n = boyut + 2 × kenar boşluğu */
export function qrSvgPath(m: boolean[][], quiet = 3): { d: string; n: number } {
  let d = "";
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return { d, n: m.length + quiet * 2 };
}
