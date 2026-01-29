"use client";

import { useEffect, useRef } from "react";
import { database } from "@/config/firebase";
import { push, ref } from "firebase/database";

type FormatKey = "square" | "portrait" | "landscape";

type Palette = { bg: string; text: string; accent: string };
type FontPack = { quote: string; author: string };
type Design = {
  palette: Palette;
  gradient: [string, string];
  font: FontPack;
  bgType: string;
  layout: string;
  seed: number;
};

type CardState = {
  w: number | null;
  h: number | null;
  previewW: number | null;
};

export default function PraiseGenerator() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;

    // Minimums, but per-card export can grow via resize drag
    const PREVIEW_SCALE = 0.28;

    const FORMATS: Record<FormatKey, { minWidth: number; minHeight: number }> =
      {
        square: { minWidth: 1080, minHeight: 1080 },
        portrait: { minWidth: 1080, minHeight: 1350 },
        landscape: { minWidth: 1600, minHeight: 900 },
      };

    // richer palettes + accents
    const PALETTES: Palette[] = [
      { bg: "#FFF5F5", text: "#2D3748", accent: "#E53E3E" },
      { bg: "#EBF8FF", text: "#1A365D", accent: "#2B6CB0" },
      { bg: "#F0FFF4", text: "#1C4532", accent: "#2F855A" },
      { bg: "#FFFAF0", text: "#5F370E", accent: "#DD6B20" },
      { bg: "#FAF5FF", text: "#2A1F55", accent: "#6B46C1" },
      { bg: "#FFF5F7", text: "#521B41", accent: "#B83280" },
      { bg: "#E6FFFA", text: "#234E52", accent: "#2C7A7B" },
      { bg: "#F7FAFC", text: "#1A202C", accent: "#4A5568" },
      { bg: "#0B1020", text: "#E6E6EA", accent: "#7C3AED" }, // dark
      { bg: "#0F172A", text: "#E2E8F0", accent: "#38BDF8" }, // dark
      { bg: "#111827", text: "#F9FAFB", accent: "#F59E0B" }, // dark
    ];

    const GRADIENTS: [string, string][] = [
      ["#667eea", "#764ba2"],
      ["#4facfe", "#00f2fe"],
      ["#f093fb", "#f5576c"],
      ["#43e97b", "#38f9d7"],
      ["#fa709a", "#fee140"],
      ["#30cfd0", "#330867"],
      ["#a8edea", "#fed6e3"],
      ["#ff9a9e", "#fad0c4"],
      ["#1f2937", "#111827"], // dark
      ["#0ea5e9", "#22c55e"],
    ];

    const FONTS: FontPack[] = [
      { quote: "Georgia, serif", author: "Georgia, serif" },
      { quote: "Palatino, serif", author: "Palatino, serif" },
      { quote: "Garamond, serif", author: "Garamond, serif" },
      {
        quote: "-apple-system, BlinkMacSystemFont, sans-serif",
        author: "-apple-system, BlinkMacSystemFont, sans-serif",
      },
      { quote: "Trebuchet MS, sans-serif", author: "Trebuchet MS, sans-serif" },
      { quote: "Verdana, sans-serif", author: "Verdana, sans-serif" },
    ];

    const STYLE_PACKS: Record<
      string,
      { bgTypes: string[]; layouts: string[] }
    > = {
      balanced: {
        bgTypes: [
          "solid",
          "gradient",
          "paper",
          "noise",
          "halftone",
          "blobs",
          "glass",
          "stripes",
        ],
        layouts: [
          "centered",
          "left",
          "split",
          "underline",
          "footer",
          "corner-frame",
          "diagonal",
        ],
      },
      bold: {
        bgTypes: ["gradient", "dark", "stripes", "blobs"],
        layouts: ["split", "diagonal", "side-stripe", "corner-frame"],
      },
      minimal: {
        bgTypes: ["solid", "paper"],
        layouts: ["centered", "left", "underline", "footer", "bordered"],
      },
      playful: {
        bgTypes: ["gradient", "halftone", "blobs", "noise", "paper"],
        layouts: ["icon-top", "split", "diagonal", "underline"],
      },
    };

    // Scoped query helper (so ids don’t clash with other pages/components)
    const $ = <T extends HTMLElement>(id: string) =>
      rootRef.current!.querySelector(`#${id}`) as T | null;

    const quoteText = $<HTMLTextAreaElement>("quoteText")!;
    const authorText = $<HTMLInputElement>("authorText")!;
    const formatSelect = $<HTMLSelectElement>("formatSelect")!;
    const countSelect = $<HTMLSelectElement>("countSelect")!;
    const radiusSelect = $<HTMLSelectElement>("radiusSelect")!;
    const stylePack = $<HTMLSelectElement>("stylePack")!;
    const liveUpdate = $<HTMLInputElement>("liveUpdate")!;
    const generateBtn = $<HTMLButtonElement>("generateBtn")!;
    const quoteSize = $<HTMLInputElement>("quoteSize")!;
    const authorSize = $<HTMLInputElement>("authorSize")!;
    const quoteSizeVal = $<HTMLDivElement>("quoteSizeVal")!;
    const authorSizeVal = $<HTMLDivElement>("authorSizeVal")!;
    const toast = $<HTMLDivElement>("toast")!;
    const infoText = $<HTMLDivElement>("infoText")!;
    const cardsGrid = $<HTMLDivElement>("cardsGrid")!;

    function seededRandom(seed: number) {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }

    function pick<T>(arr: T[], seed: number) {
      return arr[Math.floor(seededRandom(seed) * arr.length)];
    }

    function generateDesign(seed: number): Design {
      const pack = STYLE_PACKS[stylePack.value] || STYLE_PACKS.balanced;
      const palette = pick(PALETTES, seed++);
      const gradient = pick(GRADIENTS, seed++);
      const font = pick(FONTS, seed++);
      const bgType = pick(pack.bgTypes, seed++);
      const layout = pick(pack.layouts, seed++);
      return { palette, gradient, font, bgType, layout, seed };
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

    // Break long words and wrap nicely
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

        // tok too long: split
        let chunk = "";
        for (const ch of tok) {
          const t = chunk + ch;
          if (ctx.measureText(t).width <= maxWidth) {
            chunk = t;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        if (chunk) current = chunk;
      }
      push();
      return lines;
    }

    function showToast(msg: string) {
      toast.textContent = msg;
      toast.classList.add("show");
      window.setTimeout(() => toast.classList.remove("show"), 2300);
    }

    async function copyImage(canvas: HTMLCanvasElement) {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("Blob failed");

        // ClipboardItem is not in TS lib by default in some setups
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ClipboardItemAny = (window as any).ClipboardItem;
        if (!ClipboardItemAny) throw new Error("ClipboardItem missing");

        await navigator.clipboard.write([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new ClipboardItemAny({ "image/png": blob }) as any,
        ]);

        showToast("Copied image");
      } catch {
        showToast("Clipboard failed. Use HTTPS or localhost.");
      }
    }

    function downloadImage(canvas: HTMLCanvasElement, index: number) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quote-card-${index + 1}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Downloaded");
      }, "image/png");
    }

    async function uploadToWall(canvas: HTMLCanvasElement, index: number) {
      try {
        const quote = quoteText.value;
        const author = authorText.value;

        if (!quote.trim()) {
          showToast("Please enter a quote");
          return;
        }

        const design = designsCache[index];

        const cardData = {
          // text
          quote: quote.trim(),
          author: author.trim(),

          // exact export size (so wall can scale consistently)
          width: canvas.width,
          height: canvas.height,

          // full design details (to re-render later)
          palette: design.palette,
          gradient: design.gradient,
          font: design.font,
          bgType: design.bgType,
          layout: design.layout,
          seed: design.seed,

          // generator controls that affect rendering
          format: formatSelect.value,
          radius: radiusSelect.value,
          quoteSizeMultiplier: Number(quoteSize.value),
          authorSizeMultiplier: Number(authorSize.value),

          createdAt: new Date().toISOString(),
        };

        const wallRef = ref(database, "praiseWall");
        await push(wallRef, cardData);

        showToast("✨ Uploaded to Praise Wall!");
      } catch (error) {
        console.error("Upload error:", error);
        showToast("Upload failed. Check Firebase config.");
      }
    }

    function getQuoteMul() {
      return Number(quoteSize.value) / 100;
    }
    function getAuthorMul() {
      return Number(authorSize.value) / 100;
    }

    function updateRangeLabels() {
      quoteSizeVal.textContent = `${quoteSize.value}%`;
      authorSizeVal.textContent = `${authorSize.value}%`;
    }

    // More “fun” details: subtle doodles
    function drawDoodles(
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      color: string,
      seed: number,
    ) {
      ctx.save();
      ctx.globalAlpha = 0.12; // a bit subtle
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // How many doodles (keep small + clean)
      const n = 10; //+ Math.floor(seededRandom(seed) * 1);

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
          const wob = 1 + (seededRandom(s + i * 7) - 0.5) * 0.18; // hand-drawn wobble
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

        // tiny sizes
        const size = 7 + seededRandom(seed + i * 11 + 2) * 12;

        // keep center cleaner
        const cx = width / 2,
          cy = height / 2;
        if (Math.hypot(x - cx, y - cy) < Math.min(width, height) * 0.26)
          continue;

        // random pick: 0 = heart, 1 = star
        const kind = Math.floor(seededRandom(seed + i * 19) * 2);

        if (kind === 0) drawTinyHeart(x, y, size, seed + i * 101);
        else drawTinyStar(x, y, size * 0.9, seed + i * 101);
      }

      ctx.restore();
    }

    function computeSafeStartY(
      contentY: number,
      blockH: number,
      safeTop: number,
      safeBottom: number,
    ) {
      let y = contentY - blockH / 2;
      if (y < safeTop) y = safeTop;
      if (y + blockH > safeBottom) y = safeBottom - blockH;
      if (y < safeTop) y = safeTop;
      return y;
    }

    // --- State ---
    let designsCache: Design[] = [];
    let cardState: CardState[] = [];
    let domCards: Array<{
      wrapper: HTMLDivElement;
      canvas: HTMLCanvasElement;
      pill: HTMLDivElement;
    }> = [];

    function makeDesigns(count: number) {
      const baseSeed = Date.now();
      const designs: Design[] = [];
      const used = new Set<string>();

      for (let i = 0; i < count; i++) {
        let d: Design;
        let tries = 0;
        let hash = "";
        do {
          const seed = baseSeed + i * 1000 + tries * 111;
          d = generateDesign(seed);
          hash = `${d.bgType}-${d.layout}-${PALETTES.indexOf(d.palette)}-${
            d.font.quote
          }`;
          tries++;
        } while (used.has(hash) && tries < 60);
        used.add(hash);
        designs.push(d);
      }
      return designs;
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
      // sRGB relative luminance
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
      // sample every Nth pixel for speed
      const step = 16;
      for (let i = 0; i < img.length; i += 4 * step) {
        r += img[i];
        g += img[i + 1];
        b += img[i + 2];
        c++;
      }
      return { r: r / c, g: g / c, b: b / c };
    }

    // Returns best text + author colors for current drawn background
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

      // Quote color
      const quoteColor = isLightBg ? "#111827" : "#FFFFFF";

      // Default author color = accent
      let authorColor: string = palette.accent;

      // --- FIX FOR DARK CARDS ---
      if (!isLightBg) {
        // Dark background: force author to be readable
        authorColor = "rgba(255,255,255,0.85)";
      } else {
        // Light background: ensure accent has enough contrast
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

    function renderCard(
      canvas: HTMLCanvasElement,
      quote: string,
      author: string,
      design: Design,
      format: FormatKey,
      radius: string,
      sizeOverride?: CardState | null,
    ) {
      const base = FORMATS[format];

      // export size (minimum + override)
      let width = Math.max(base.minWidth, sizeOverride?.w ?? base.minWidth);
      let height = Math.max(base.minHeight, sizeOverride?.h ?? base.minHeight);

      const quoteMul = getQuoteMul();
      const authorMul = getAuthorMul();

      // measure needed height for full text (auto-grow)
      const m = document.createElement("canvas");
      m.width = width;
      m.height = 10;
      const ctxM = m.getContext("2d")!;

      const padding = width * 0.1;
      const maxWidth = width - padding * 2;

      const qSize = Math.floor(width * 0.05 * quoteMul);
      const qLine = qSize * 1.38;

      ctxM.font = `${qSize}px ${design.font.quote}`;
      const lines = wrapTextSmart(ctxM, quote, maxWidth);

      const aSize = author.trim() ? Math.floor(width * 0.034 * authorMul) : 0;
      const aGap = author.trim() ? aSize * 0.6 : 0;
      const blockH =
        lines.length * qLine + aGap + (author.trim() ? aSize * 1.6 : 0);

      const needed = Math.ceil(blockH + padding * 2.6);

      // IMPORTANT: if user is resizing smaller and we are clamped,
      // do not keep increasing due to text calculation beyond current height cap.
      // We only auto-grow when needed exceeds current height.
      height = Math.max(height, needed);

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d")!;
      const { palette, gradient, font, bgType, layout, seed } = design;

      // clip
      ctx.save();
      roundedRectPath(ctx, 0, 0, width, height, Number(radius));
      ctx.clip();

      // --- Background ---
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

      // doodles (except minimal pack)
      const pack = stylePack.value;
      if (pack !== "minimal") {
        const doodleColor = isDark ? "rgba(255,255,255,1)" : palette.accent;
        drawDoodles(ctx, width, height, doodleColor, seed + 999);
      }

      // --- Layout elements ---
      let contentY = height * 0.52;
      let contentX = width * 0.5;
      let align: CanvasTextAlign = "center";
      let innerMax = width - padding * 2;

      if (layout === "left") {
        align = "left";
        contentX = padding;
        contentY = height * 0.46;
      } else if (layout === "icon-top") {
        contentY = height * 0.56;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.22, 54, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (layout === "bordered") {
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 7;
        ctx.strokeRect(
          padding / 2,
          padding / 2,
          width - padding,
          height - padding,
        );
        innerMax = width - padding * 3;
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
      } else if (layout === "underline") {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = palette.accent;
        ctx.fillRect(padding, height * 0.72, width - padding * 2, 10);
        ctx.globalAlpha = 1;
      } else if (layout === "footer") {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = palette.accent;
        ctx.fillRect(0, height * 0.82, width, height * 0.18);
        ctx.globalAlpha = 1;
        contentY = height * 0.48;
      } else if (layout === "corner-frame") {
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 8;
        const s = padding * 0.9;
        ctx.beginPath();
        ctx.moveTo(padding * 0.6, padding * 0.6 + s);
        ctx.lineTo(padding * 0.6, padding * 0.6);
        ctx.lineTo(padding * 0.6 + s, padding * 0.6);
        ctx.moveTo(width - padding * 0.6 - s, padding * 0.6);
        ctx.lineTo(width - padding * 0.6, padding * 0.6);
        ctx.lineTo(width - padding * 0.6, padding * 0.6 + s);
        ctx.moveTo(padding * 0.6, height - padding * 0.6 - s);
        ctx.lineTo(padding * 0.6, height - padding * 0.6);
        ctx.lineTo(padding * 0.6 + s, height - padding * 0.6);
        ctx.moveTo(width - padding * 0.6 - s, height - padding * 0.6);
        ctx.lineTo(width - padding * 0.6, height - padding * 0.6);
        ctx.lineTo(width - padding * 0.6, height - padding * 0.6 - s);
        ctx.stroke();
        innerMax = width - padding * 2.4;
      } else if (layout === "diagonal") {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        contentY = height * 0.58;
      }

      const { quoteColor, authorColor } = chooseTextColors(
        ctx,
        width,
        height,
        palette,
      );

      // --- Text render ---
      ctx.textAlign = align;
      ctx.textBaseline = "top";

      ctx.font = `${qSize}px ${font.quote}`;
      ctx.fillStyle = quoteColor;

      const safeTop = padding * 0.9;
      const safeBottom = height - padding * 0.9;

      const textLines = wrapTextSmart(ctx, quote, innerMax);
      const quoteH = textLines.length * qLine;

      const aBlock = author.trim() ? aSize * 1.6 : 0;
      const totalH = quoteH + aGap + aBlock;

      let y = computeSafeStartY(contentY, totalH, safeTop, safeBottom);
      const x = align === "left" ? contentX : width / 2;

      for (const line of textLines) {
        ctx.fillText(line, x, y);
        y += qLine;
      }

      if (author.trim()) {
        y += aGap;
        ctx.font = `800 ${aSize}px ${font.author}`;
        ctx.fillStyle = authorColor;
        ctx.fillText(author, x, y);
      }

      ctx.restore();
    }

    function attachResize(
      handle: HTMLDivElement,
      canvas: HTMLCanvasElement,
      index: number,
      wrapperEl: HTMLDivElement,
    ) {
      let startX = 0,
        startY = 0;
      let startW = 0,
        startH = 0;
      let scale = 1;
      let dragging = false;

      const clamp = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v));

      const onMove = (e: PointerEvent) => {
        if (!dragging) return;

        const dx = (e.clientX - startX) * scale;

        const format = formatSelect.value as FormatKey;
        const base = FORMATS[format];

        const rightPanel = rootRef.current!.querySelector(
          ".right-panel",
        ) as HTMLElement | null;
        const maxPreview = rightPanel
          ? rightPanel.getBoundingClientRect().width - 56
          : 1200;

        const maxExportW = Math.floor(maxPreview / PREVIEW_SCALE);

        let newW = Math.max(base.minWidth, Math.round(startW + dx));
        let newH = startH; // Keep height fixed, only width changes

        // cap export width so preview doesn’t go infinite / text doesn’t keep growing visually
        newW = Math.min(newW, maxExportW);

        const prev = cardState[index] || { w: null, h: null, previewW: null };

        // If size not changing (clamped), DO NOT rerender (prevents "text grows and grows" feeling)
        if (prev.w === newW && prev.h === newH) return;

        const newPreviewW = Math.round(newW * PREVIEW_SCALE);

        cardState[index] = {
          w: newW,
          h: newH,
          previewW: clamp(newPreviewW, 260, maxPreview),
        };

        renderAll({ rerenderOnlyIndex: index });
      };

      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {}
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        dragging = true;
        startX = e.clientX;
        startY = e.clientY;

        startW = canvas.width;
        startH = canvas.height;

        // IMPORTANT: freeze scale at pointerdown
        const displayW = canvas.getBoundingClientRect().width;
        scale = (canvas.width || 1) / Math.max(1, displayW);

        handle.setPointerCapture(e.pointerId);

        document.body.style.cursor = "se-resize";
        document.body.style.userSelect = "none";

        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp, { passive: false });
      };

      handle.addEventListener("pointerdown", onDown);

      // return cleanup for this handle
      return () => handle.removeEventListener("pointerdown", onDown);
    }

    function buildCard(index: number) {
      const wrapper = document.createElement("div");
      wrapper.className = "card-wrapper";

      const container = document.createElement("div");
      container.className = "card-container";

      const canvas = document.createElement("canvas");

      const handle = document.createElement("div");
      handle.className = "resize-handle";
      handle.title = "Drag to resize export";

      const pill = document.createElement("div");
      pill.className = "size-pill";
      pill.textContent = "—";

      container.appendChild(canvas);
      container.appendChild(handle);
      container.appendChild(pill);
      wrapper.appendChild(container);

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "card-btn";
      copyBtn.textContent = "Copy image";
      copyBtn.onclick = () => copyImage(canvas);

      const dlBtn = document.createElement("button");
      dlBtn.className = "card-btn";
      dlBtn.textContent = "Download";
      dlBtn.onclick = () => downloadImage(canvas, index);

      const uploadBtn = document.createElement("button");
      uploadBtn.className = "card-btn";
      uploadBtn.textContent = "Upload to Praise Wall";
      uploadBtn.onclick = () => uploadToWall(canvas, index);

      actions.appendChild(copyBtn);
      actions.appendChild(dlBtn);
      actions.appendChild(uploadBtn);
      wrapper.appendChild(actions);

      const cleanupResize = attachResize(handle, canvas, index, wrapper);

      return { wrapper, canvas, pill, cleanupResize };
    }

    function renderAll({
      newDesigns = false,
      rerenderOnlyIndex = null,
    }: {
      newDesigns?: boolean;
      rerenderOnlyIndex?: number | null;
    } = {}) {
      const quote = quoteText.value;
      const author = authorText.value;
      const format = formatSelect.value as FormatKey;
      const radius = radiusSelect.value;
      const count = Number(countSelect.value);

      if (!quote.trim()) {
        showToast("Please enter a quote");
        return;
      }

      // designs
      if (newDesigns || designsCache.length !== count) {
        designsCache = makeDesigns(count);
        cardState = Array.from({ length: count }, () => ({
          w: null,
          h: null,
          previewW: null,
        }));
      }

      infoText.textContent = `Format min ${FORMATS[format].minWidth}×${FORMATS[format].minHeight}. Drag bottom-right handle to resize export.`;

      // --- RERENDER ONLY ONE CARD ---
      if (rerenderOnlyIndex !== null) {
        const item = domCards[rerenderOnlyIndex];
        if (!item) return;

        const st = cardState[rerenderOnlyIndex];

        renderCard(
          item.canvas,
          quote,
          author,
          designsCache[rerenderOnlyIndex],
          format,
          radius,
          st,
        );

        item.pill.textContent = `${item.canvas.width}×${item.canvas.height}`;

        // Apply preview width (persisted)
        if (st?.previewW) {
          item.wrapper.style.setProperty("--preview-w", `${st.previewW}px`);
        } else {
          const previewW = Math.round(item.canvas.width * PREVIEW_SCALE);
          item.wrapper.style.setProperty(
            "--preview-w",
            `${Math.min(previewW, 700)}px`,
          );
        }

        return;
      }

      // --- FULL REBUILD ---
      cardsGrid.innerHTML = "";
      // cleanup old resize listeners
      for (const c of domCards as any[]) {
        try {
          c.cleanupResize?.();
        } catch {}
      }
      domCards = [];

      for (let i = 0; i < count; i++) {
        const card = buildCard(i);
        cardsGrid.appendChild(card.wrapper);
        domCards.push(card as any);

        const st = cardState[i];

        renderCard(
          card.canvas,
          quote,
          author,
          designsCache[i],
          format,
          radius,
          st,
        );
        card.pill.textContent = `${card.canvas.width}×${card.canvas.height}`;

        // Apply preview width (persisted)
        if (st?.previewW) {
          card.wrapper.style.setProperty("--preview-w", `${st.previewW}px`);
        } else {
          const previewW = Math.round(card.canvas.width * PREVIEW_SCALE);
          card.wrapper.style.setProperty(
            "--preview-w",
            `${Math.min(previewW, 700)}px`,
          );
        }
      }

      showToast(newDesigns ? "Generated new styles" : "Updated");
    }

    function maybeLiveRender() {
      if (liveUpdate.checked) {
        renderAll({ newDesigns: false });
      }
    }

    // --- wire UI listeners (store refs for cleanup) ---
    const onGenerate = () => renderAll({ newDesigns: true });
    const onFormatChange = () => renderAll({ newDesigns: false });
    const onCountChange = () => renderAll({ newDesigns: true });
    const onRadiusChange = () => maybeLiveRender();
    const onStylePackChange = () => renderAll({ newDesigns: true });
    const onQuoteInput = () => maybeLiveRender();
    const onAuthorInput = () => maybeLiveRender();
    const onQuoteSizeInput = () => {
      updateRangeLabels();
      maybeLiveRender();
    };
    const onAuthorSizeInput = () => {
      updateRangeLabels();
      maybeLiveRender();
    };

    generateBtn.addEventListener("click", onGenerate);

    formatSelect.addEventListener("change", onFormatChange);
    countSelect.addEventListener("change", onCountChange);
    radiusSelect.addEventListener("change", onRadiusChange);
    stylePack.addEventListener("change", onStylePackChange);

    quoteText.addEventListener("input", onQuoteInput);
    authorText.addEventListener("input", onAuthorInput);

    quoteSize.addEventListener("input", onQuoteSizeInput);
    authorSize.addEventListener("input", onAuthorSizeInput);

    // init
    updateRangeLabels();

    const initialCount = Number(countSelect.value);
    designsCache = makeDesigns(initialCount);
    cardState = Array.from({ length: initialCount }, () => ({
      w: null,
      h: null,
      previewW: null,
    }));

    renderAll({ newDesigns: false });

    // Cleanup
    return () => {
      generateBtn.removeEventListener("click", onGenerate);

      formatSelect.removeEventListener("change", onFormatChange);
      countSelect.removeEventListener("change", onCountChange);
      radiusSelect.removeEventListener("change", onRadiusChange);
      stylePack.removeEventListener("change", onStylePackChange);

      quoteText.removeEventListener("input", onQuoteInput);
      authorText.removeEventListener("input", onAuthorInput);

      quoteSize.removeEventListener("input", onQuoteSizeInput);
      authorSize.removeEventListener("input", onAuthorSizeInput);

      // cleanup card resizers
      for (const c of domCards as any[]) {
        try {
          c.cleanupResize?.();
        } catch {}
      }
    };
  }, []);

  return (
    <div ref={rootRef}>
      <div className="container">
        <div className="panel left-panel">
          <div className="header">
            <div>
              <h1>❤️ Praise Cards Generator</h1>
            </div>
          </div>

          <div className="form-group">
            <label>Praise Message</label>
            <textarea
              id="quoteText"
              placeholder="For me, gratitude is an amazing app. I'm a paper and pen girlie but with Gratitude I don't even feel the difference.... a 9.5 out of 10 for me."
            />
          </div>

          <div className="form-group">
            <label>User Name</label>
            <input id="authorText" type="text" placeholder="Faith Anazodo" />
          </div>

          <div className="row">
            <div className="form-group">
              <label>Format</label>
              <select id="formatSelect" defaultValue="square">
                <option value="square">Square (min 1080×1080)</option>
                <option value="portrait">Portrait (min 1080×1350)</option>
                <option value="landscape">Landscape (min 1600×900)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Cards</label>
              <select id="countSelect" defaultValue="6">
                <option value="6">6</option>
                <option value="9">9</option>
                <option value="12">12</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div className="form-group">
              <label>Corner Radius</label>
              <select id="radiusSelect" defaultValue="26">
                <option value="18">18px</option>
                <option value="26">26px</option>
                <option value="34">34px</option>
              </select>
            </div>
            <div className="form-group">
              <label>Style Pack</label>
              <select id="stylePack" defaultValue="balanced">
                <option value="balanced">Balanced</option>
                <option value="bold">Bold</option>
                <option value="minimal">Minimal</option>
                <option value="playful">Playful</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Praise Messagae Font Size</label>
            <div className="range-row">
              <input
                id="quoteSize"
                type="range"
                min="70"
                max="140"
                defaultValue="95"
              />
              <div className="range-value" id="quoteSizeVal">
                95%
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>User Name Font Size</label>
            <div className="range-row">
              <input
                id="authorSize"
                type="range"
                min="20"
                max="140"
                defaultValue="105"
              />
              <div className="range-value" id="authorSizeVal">
                105%
              </div>
            </div>
          </div>

          <div className="toggles">
            <input id="liveUpdate" type="checkbox" defaultChecked />
            <label
              htmlFor="liveUpdate"
              style={{
                textTransform: "none",
                letterSpacing: 0,
                fontWeight: 800,
                color: "#1d1d1f",
              }}
            >
              Live update
            </label>
          </div>

          <div className="btn-row">
            <button className="btn primary" id="generateBtn">
              Generate
            </button>
          </div>
        </div>

        <div className="panel right-panel">
          <div className="topbar">
            <div className="hint" id="infoText">
              Tip: Drag the bottom-right corner of a card to resize width and
              height.
            </div>
          </div>
          <div className="grid" id="cardsGrid"></div>
        </div>
      </div>

      <div className="toast" id="toast"></div>
    </div>
  );
}
