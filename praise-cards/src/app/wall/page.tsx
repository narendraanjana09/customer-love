"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { database } from "@/config/firebase";
import { onValue, ref } from "firebase/database";

type Palette = { bg: string; text: string; accent: string };
type FontPack = { quote: string; author: string };

type CardData = {
  id: string;
  quote: string;
  author: string;
  width: number;
  height: number;
  palette: Palette;
  gradient: [string, string];
  font: FontPack;
  bgType: string;
  layout: string;
  seed: number;
  format: string;
  radius: string;
  quoteSizeMultiplier: number;
  authorSizeMultiplier: number;
  createdAt: string;
};

export default function PraiseWallPage() {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---------- utilities ----------
  function seededRandom(seed: number) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function wrapTextSmart(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    const push = () => {
      if (current) lines.push(current);
      current = "";
    };

    for (const tok of tokens) {
      const test = current ? current + " " + tok : tok;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
        continue;
      }
      if (current) push();

      if (ctx.measureText(tok).width <= maxWidth) {
        current = tok;
        continue;
      }

      let chunk = "";
      for (const ch of tok) {
        const t = chunk + ch;
        if (ctx.measureText(t).width <= maxWidth) chunk = t;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) current = chunk;
    }
    push();
    return lines;
  }

  function roundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function addGrain(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    amount = 0.06,
    seed = 1,
  ) {
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (seededRandom(seed + i) - 0.5) * 255 * amount;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  function hexToRgb(hex: string) {
    const h = hex.replace("#", "").trim();
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function relLuma({ r, g, b }: { r: number; g: number; b: number }) {
    const srgb = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function mixRgb(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
    t: number,
  ) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  function sampleAverageRgb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const img = ctx.getImageData(
      Math.max(0, Math.floor(x)),
      Math.max(0, Math.floor(y)),
      Math.max(1, Math.floor(w)),
      Math.max(1, Math.floor(h)),
    ).data;

    let r = 0,
      g = 0,
      b = 0,
      c = 0;
    const step = 16;
    for (let i = 0; i < img.length; i += 4 * step) {
      r += img[i];
      g += img[i + 1];
      b += img[i + 2];
      c++;
    }
    return { r: r / c, g: g / c, b: b / c };
  }

  function chooseTextColors(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    palette: Palette,
  ) {
    const sx = width * 0.22;
    const sy = height * 0.3;
    const sw = width * 0.56;
    const sh = height * 0.4;

    const avg = sampleAverageRgb(ctx, sx, sy, sw, sh);
    const L = relLuma(avg);

    const isLightBg = L > 0.55;
    const quoteColor = isLightBg ? "#111827" : "#FFFFFF";

    let authorColor: string = palette.accent;

    if (!isLightBg) {
      authorColor = "rgba(255,255,255,0.85)";
    } else {
      const acc = hexToRgb(palette.accent);
      const quoteRgb = hexToRgb(quoteColor);

      const accL = relLuma(acc);
      const quoteL = relLuma(quoteRgb);
      const contrast =
        (Math.max(accL, quoteL) + 0.05) / (Math.min(accL, quoteL) + 0.05);

      if (contrast < 2.2) {
        const mixed = mixRgb(acc, quoteRgb, 0.55);
        authorColor = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
      }
    }

    return { quoteColor, authorColor };
  }

  function drawDoodles(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    seed: number,
  ) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const n = 10;

    const drawTinyHeart = (x: number, y: number, size: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((seededRandom(s) - 0.5) * 0.8);

      const r = size * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.bezierCurveTo(-size, -r, -size, -size, 0, -size * 0.25);
      ctx.bezierCurveTo(size, -size, size, -r, 0, r);
      ctx.closePath();

      ctx.globalAlpha *= 0.9;
      ctx.fill();
      ctx.globalAlpha *= 1.05;
      ctx.lineWidth = Math.max(1.2, size * 0.12);
      ctx.stroke();
      ctx.restore();
    };

    const drawTinyStar = (x: number, y: number, size: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(seededRandom(s) * Math.PI * 2);

      const spikes = 5;
      const outer = size;
      const inner = size * 0.45;

      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const wob = 1 + (seededRandom(s + i * 7) - 0.5) * 0.18;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        const px = Math.cos(angle) * rad * wob;
        const py = Math.sin(angle) * rad * wob;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.globalAlpha *= 0.85;
      ctx.fill();
      ctx.globalAlpha *= 1.1;
      ctx.lineWidth = Math.max(1.2, size * 0.12);
      ctx.stroke();
      ctx.restore();
    };

    for (let i = 0; i < n; i++) {
      const x = seededRandom(seed + i * 11) * width;
      const y = seededRandom(seed + i * 11 + 1) * height;
      const size = 7 + seededRandom(seed + i * 11 + 2) * 12;

      const cx = width / 2,
        cy = height / 2;
      if (Math.hypot(x - cx, y - cy) < Math.min(width, height) * 0.26) continue;

      const kind = Math.floor(seededRandom(seed + i * 19) * 2);
      if (kind === 0) drawTinyHeart(x, y, size, seed + i * 101);
      else drawTinyStar(x, y, size * 0.9, seed + i * 101);
    }

    ctx.restore();
  }

  function renderCard(canvas: HTMLCanvasElement, card: CardData) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(1, Number(card.width) || 1);
    const height = Math.max(1, Number(card.height) || 1);

    // render at full fidelity, then CSS scales it down for masonry
    canvas.width = width;
    canvas.height = height;

    const { palette, gradient, font, bgType, layout, seed } = card;
    const quoteMul = Number(card.quoteSizeMultiplier || 100) / 100;
    const authorMul = Number(card.authorSizeMultiplier || 100) / 100;

    const padding = width * 0.1;
    const qSize = Math.floor(width * 0.05 * quoteMul);
    const qLine = qSize * 1.38;

    const aSize = card.author.trim()
      ? Math.floor(width * 0.034 * authorMul)
      : 0;

    const radius = Number(card.radius);

    ctx.save();
    roundedRectPath(ctx, 0, 0, width, height, radius);
    ctx.clip();

    // BG
    const isDark = bgType === "dark";
    if (bgType === "gradient" || bgType === "glass") {
      const grd = ctx.createLinearGradient(0, 0, width, height);
      grd.addColorStop(0, gradient[0]);
      grd.addColorStop(1, gradient[1]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, width, height);
      if (bgType === "glass") {
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(0, 0, width, height);
      }
    } else if (bgType === "dark") {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === "paper") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = palette.accent;
      for (let i = 0; i < 90; i++) {
        const x = seededRandom(seed + i) * width;
        const y = seededRandom(seed + i + 100) * height;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (bgType === "noise") {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      addGrain(ctx, width, height, 0.08, seed);
    } else if (bgType === "stripes") {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(0,0,0,0.05)";
      ctx.lineWidth = 14;
      for (let i = -height; i < width + height; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + height, height);
        ctx.stroke();
      }
    } else if (bgType === "halftone") {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      const step = 26;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const r = 2 + seededRandom(seed + x * 7 + y * 11) * 3;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (bgType === "blobs") {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = palette.accent;
      for (let i = 0; i < 3; i++) {
        const x = seededRandom(seed + i * 10) * width;
        const y = seededRandom(seed + i * 10 + 1) * height;
        const r = 120 + seededRandom(seed + i * 10 + 2) * 260;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);
    }

    const doodleColor = isDark ? "rgba(255,255,255,1)" : palette.accent;
    drawDoodles(ctx, width, height, doodleColor, seed + 999);

    // Layout positions
    const innerPadding = padding;
    let contentY = height * 0.52;
    let contentX = width * 0.5;
    let align: CanvasTextAlign = "center";
    let innerMax = width - innerPadding * 2;

    if (layout === "left") {
      align = "left";
      contentX = innerPadding;
      contentY = height * 0.46;
    } else if (layout === "icon-top") {
      contentY = height * 0.56;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.22, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (layout === "split") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = palette.accent;
      if (height >= width) {
        ctx.fillRect(0, 0, width, height * 0.32);
        contentY = height * 0.58;
      } else {
        ctx.fillRect(0, 0, width * 0.32, height);
        align = "left";
        contentX = width * 0.38;
        innerMax = width * 0.55;
      }
      ctx.globalAlpha = 1;
    }

    const { quoteColor, authorColor } = chooseTextColors(
      ctx,
      width,
      height,
      palette,
    );

    ctx.textAlign = align;
    ctx.textBaseline = "top";

    ctx.font = `${qSize}px ${font.quote}`;
    ctx.fillStyle = quoteColor;

    const safeTop = innerPadding * 0.9;
    const safeBottom = height - innerPadding * 0.9;

    const textLines = wrapTextSmart(ctx, card.quote, innerMax);
    const quoteH = textLines.length * qLine;

    const aGap = card.author.trim() ? aSize * 0.6 : 0;
    const aBlock = card.author.trim() ? aSize * 1.6 : 0;
    const totalH = quoteH + aGap + aBlock;

    let y = contentY - totalH / 2;
    if (y < safeTop) y = safeTop;
    if (y + totalH > safeBottom) y = safeBottom - totalH;
    if (y < safeTop) y = safeTop;

    const x = align === "left" ? contentX : width / 2;

    for (const line of textLines) {
      ctx.fillText(line, x, y);
      y += qLine;
    }

    if (card.author.trim()) {
      y += aGap;
      ctx.font = `800 ${aSize}px ${font.author}`;
      ctx.fillStyle = authorColor;
      ctx.fillText(card.author, x, y);
    }

    ctx.restore();
  }

  async function copyCanvasImage(canvas: HTMLCanvasElement) {
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png",
        );
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ClipboardItemAny = (window as any).ClipboardItem;
      if (!ClipboardItemAny) throw new Error("ClipboardItem missing");

      await navigator.clipboard.write([
        new ClipboardItemAny({ "image/png": blob }),
      ]);
      setToast("Copied image");
    } catch (e) {
      console.error(e);
      setToast(
        "Copy failed. Use HTTPS/localhost and allow clipboard permission.",
      );
    }
  }

  // ---------- fetch cards ----------
  useEffect(() => {
    const wallRef = ref(database, "praiseWall");

    const unsub = onValue(
      wallRef,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setCards([]);
          return;
        }
        const val = snap.val();
        const list: CardData[] = Object.entries(val).map(([id, v]: any) => ({
          id,
          ...v,
        }));

        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setCards(list);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, []);

  // ---------- render to canvases ----------
  useEffect(() => {
    for (const c of cards) {
      const canvas = canvasRefs.current.get(c.id);
      if (canvas) renderCard(canvas, c);
    }
  }, [cards]);

  // Display width for masonry cards (keeps them small even if source is 1080px)
  const displayWidth = 320; // px
  const displayWidthSingle = 380; // px

  const isSingle = cards.length === 1;

  const masonryStyle = useMemo(() => {
    return {
      ["--cardW" as any]: `${isSingle ? displayWidthSingle : displayWidth}px`,
    } as React.CSSProperties;
  }, [isSingle]);

  return (
    <div className="page" style={masonryStyle}>
      {!loading && cards.length === 0 ? (
        <div className="empty">No praise yet.</div>
      ) : (
        <div className={`masonry ${isSingle ? "single" : ""}`}>
          {cards.map((card) => (
            <div key={card.id} className="item">
              <div className="card">
                <button
                  className="copy"
                  type="button"
                  onClick={() => {
                    const canvas = canvasRefs.current.get(card.id);
                    if (canvas) copyCanvasImage(canvas);
                  }}
                >
                  Copy
                </button>

                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(card.id, el);
                  }}
                  className="canvas"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {toast ? <div className="toast show">{toast}</div> : null}

      <style jsx>{`
        .page {
          max-width: 1400px;
          margin: 0 auto;
          padding: 36px 18px 90px;
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .empty {
          text-align: center;
          padding: 70px 10px;
          color: #6b7280;
        }

        /* ---------------- Masonry (CSS columns that actually staggers) ---------------- */
        .masonry {
          column-gap: 18px;
          column-fill: balance;

          /* key: let the browser choose columns based on available width */
          column-width: calc(var(--cardW) + 18px);
        }

        .masonry.single {
          max-width: calc(var(--cardW) + 18px);
          margin: 0 auto;
        }

        .item {
          display: inline-block; /* REQUIRED for columns */
          width: var(--cardW); /* fixed visual width, keeps it small */
          max-width: 100%;
          margin: 0 0 18px;
          break-inside: avoid;
          -webkit-column-break-inside: avoid;
        }

        /* ---------------- Card ---------------- */
        .card {
          position: relative;
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(236, 72, 153, 0.12);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
        }

        .card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 14px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.18s ease;
          box-shadow:
            0 0 0 1px rgba(236, 72, 153, 0.38),
            0 0 26px rgba(236, 72, 153, 0.22);
        }

        .card:hover {
          transform: translateY(-3px);
          border-color: rgba(236, 72, 153, 0.26);
          box-shadow: 0 18px 36px rgba(0, 0, 0, 0.12);
        }

        .card:hover::before {
          opacity: 1;
        }

        /* Canvas is huge (1080px+), so we scale it to fit the visual width */
        .canvas {
          display: block;
          width: 100%;
          height: auto;
          background: #f3f4f6;
        }

        .copy {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          background: rgba(17, 24, 39, 0.62);
          color: #fff;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          opacity: 0;
          transition:
            opacity 0.15s ease,
            transform 0.15s ease,
            background 0.15s ease;
          backdrop-filter: blur(10px);
        }

        .card:hover .copy {
          opacity: 1;
        }

        .copy:hover {
          transform: translateY(-1px);
          background: rgba(17, 24, 39, 0.78);
        }

        /* On touch devices show button always */
        @media (hover: none) {
          .copy {
            opacity: 1;
          }
        }

        /* Toast */
        .toast {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%) translateY(16px);
          background: rgba(17, 24, 39, 0.92);
          color: #fff;
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          opacity: 0;
          transition:
            opacity 0.18s ease,
            transform 0.18s ease;
          z-index: 1000;
        }

        .toast.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        /* keep compact on small screens */
        @media (max-width: 520px) {
          .page {
            padding: 26px 14px 80px;
          }
          .masonry {
            column-width: calc(320px + 18px);
          }
          .item {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
