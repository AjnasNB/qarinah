(() => {
  const canvas = document.querySelector(".memory-river-motion");
  const photo = document.querySelector(".memory-landscape img");
  const drawing = canvas?.getContext("2d");
  if (!drawing || !photo) return;

  // Trace the water in the original 1536 × 1024 image. The mobile crop uses the same trace.
  const river = [
    [560, 938, 3], [580, 923, 7], [597, 906, 6], [614, 886, 9],
    [627, 895, 7], [641, 924, 10], [656, 956, 13], [677, 971, 15],
    [692, 957, 10], [710, 901, 9], [729, 830, 12], [754, 760, 15],
    [780, 695, 15], [803, 661, 28], [826, 651, 43], [850, 658, 37],
    [870, 687, 22], [893, 723, 23], [918, 762, 30], [941, 787, 19],
    [963, 808, 14], [985, 821, 7]
  ];
  const outline = new Path2D();
  for (const [i, [y, center, width]] of river.entries()) {
    if (i === 0) outline.moveTo(center - width, y);
    else outline.lineTo(center - width, y);
  }
  for (const [y, center, width] of [...river].reverse()) outline.lineTo(center + width, y);
  outline.closePath();

  const bands = [];
  for (let i = 1; i < river.length; i++) {
    const [start, fromX, fromWidth] = river[i - 1];
    const [end, toX, toWidth] = river[i];
    for (let y = start; y < end; y += 4) {
      const progress = (y - start) / (end - start);
      const center = fromX + (toX - fromX) * progress;
      const width = fromWidth + (toWidth - fromWidth) * progress + 5;
      const sheen = drawing.createLinearGradient(center - width, 0, center + width, 0);
      sheen.addColorStop(0, "#9fc5df00");
      sheen.addColorStop(.5, "#9fc5df");
      sheen.addColorStop(1, "#9fc5df00");
      bands.push({ y, x: center - width, width: 2 * width, height: Math.min(4, end - y), sheen });
    }
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  let frame = 0;
  let lastDraw = 0;
  let view;

  function layout() {
    if (photo.naturalHeight === 0) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.4);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    const sourceScale = photo.naturalHeight / 1024;
    const cropLeft = Math.max(0, 1536 - photo.naturalWidth / sourceScale) * .52;
    const fit = Math.max(width / photo.naturalWidth, height / photo.naturalHeight);
    const scale = fit * sourceScale;
    const [alignX, alignY] = getComputedStyle(photo).objectPosition.split(" ").map(value => parseFloat(value) / 100);
    view = {
      sourceScale, cropLeft,
      scale: scale * pixelRatio,
      x: ((width - photo.naturalWidth * fit) * alignX - cropLeft * scale) * pixelRatio,
      y: (height - photo.naturalHeight * fit) * alignY * pixelRatio,
      reflection: width <= 620 ? .34 : .27
    };
    sync();
  }

  function draw(time) {
    frame = 0;
    if (time - lastDraw >= 36) {
      lastDraw = time;
      const { sourceScale, cropLeft, scale, x, y, reflection } = view;
      drawing.clearRect(0, 0, canvas.width, canvas.height);
      drawing.save();
      drawing.setTransform(scale, 0, 0, scale, x, y);
      drawing.clip(outline);
      const t = time / 1000;
      for (const band of bands) {
        // Both waves move downstream, with offsets that break up the reflections across bends.
        const wave = band.y * .095 - t * 4.2;
        const ripple = band.y * .21 - t * 6.4 + band.x * .024;
        const dx = Math.sin(ripple) * 3.8;
        const dy = Math.sin(wave) * 4.6;
        drawing.globalAlpha = .82;
        drawing.drawImage(photo, (band.x + dx - cropLeft) * sourceScale, (band.y + dy) * sourceScale,
          band.width * sourceScale, band.height * sourceScale,
          band.x, band.y, band.width, band.height + .2);
        const glint = Math.max(0, Math.sin(wave + Math.cos(ripple) * .45)) ** 4;
        drawing.globalAlpha = .055 + reflection * glint;
        drawing.fillStyle = band.sheen;
        drawing.fillRect(band.x, band.y, band.width, band.height);
      }
      drawing.restore();
    }
    sync();
  }

  function sync() {
    const play = view && visible && !document.hidden && !reduced.matches
      && !document.documentElement.classList.contains("memory-motion-paused");
    if (play && !frame) frame = requestAnimationFrame(draw);
    if (!play && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  new ResizeObserver(layout).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(canvas);
  photo.addEventListener("load", layout);
  reduced.addEventListener("change", layout);
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("qarinah:motion", sync);
  window.addEventListener("pageshow", layout);
  layout();
})();
