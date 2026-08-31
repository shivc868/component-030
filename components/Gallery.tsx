"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(useGSAP, Draggable, InertiaPlugin);

// `width`/`lift` belong to each image (not the index) so they repeat with
// the loop and the wrap seam stays invisible. `lift` = downward offset, px.
const IMAGES = [
  { src: "/gallery/01.jpg", width: 300, lift: 0 },
  { src: "/gallery/02.jpg", width: 260, lift: 92 },
  { src: "/gallery/03.jpg", width: 344, lift: 38 },
  { src: "/gallery/04.jpg", width: 288, lift: 148 },
  { src: "/gallery/05.jpg", width: 320, lift: 20 },
  { src: "/gallery/06.jpg", width: 272, lift: 112 },
  { src: "/gallery/07.jpg", width: 304, lift: 60 },
  { src: "/gallery/08.jpg", width: 332, lift: 132 },
  { src: "/gallery/01.jpg", width: 284, lift: 76 },
  { src: "/gallery/02.jpg", width: 316, lift: 8 },
  { src: "/gallery/03.jpg", width: 264, lift: 124 },
  { src: "/gallery/04.jpg", width: 336, lift: 48 },
  { src: "/gallery/05.jpg", width: 292, lift: 140 },
  { src: "/gallery/06.jpg", width: 308, lift: 28 },
  { src: "/gallery/07.jpg", width: 268, lift: 100 },
  { src: "/gallery/08.jpg", width: 324, lift: 64 },
];

/** Speed at the viewport centre on a 1440px-wide screen, px/s; it scales
 * with the viewport so a card takes the same time to cross any screen.
 * Edge speed = MIN_SCALE × speed. */
const DRIFT = 500;
/** Gap at the centre, px — it shrinks with the cards toward the edges. */
const CARD_GAP = 10;
/** Scale at both viewport edges (1 at the centre). Also the edge speed
 * factor — below ~0.3 cards visibly park at the edge; that is the physics
 * of keeping gaps uniform, not a bug. */
const MIN_SCALE = 0.1;

/** Height of the row at full size: the tallest card (3:4 box) plus its lift.
 * `--s` is chosen so this always fits inside the section. */
const ROW_HEIGHT = Math.max(...IMAGES.map((i) => i.lift + (i.width * 4) / 3));

export function Gallery() {
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const sectionEl = section.current!;
    const viewportEl = viewport.current!;
    const trackEl = track.current!;
    const items = gsap.utils.toArray<HTMLElement>(".gallery-item", trackEl);

    // Everything below is measured, so it is rebuilt whenever the section's
    // size changes (rotation, resize). `progress` carries the row position
    // across a rebuild so the loop doesn't jump.
    let progress = 0;
    let teardown = () => {};

    const build = () => {
      teardown();

      // --s scales every card width, lift and gap together: full size on a
      // 1440px-wide screen, never wider than that ratio, and never taller
      // than the section (minus breathing room) — so no page scrollbar.
      const fitW = sectionEl.offsetWidth / 1440;
      const fitH = (sectionEl.offsetHeight - 96) / ROW_HEIGHT;
      gsap.set(trackEl, { "--s": gsap.utils.clamp(0.45, 1, Math.min(fitW, fitH)) });

      const setWidth = items[IMAGES.length].offsetLeft - items[0].offsetLeft;
      const speed = (DRIFT * viewportEl.offsetWidth) / 1440;

      /*
        A constant-speed row seen through a fixed lens. F warps the x axis:
        magnification 1 at the centre easing (cosine) to MIN_SCALE at both
        edges, normalised so the viewport maps onto itself. Each card's two
        edges go through F; its scale and shift are whatever comes out.
      */
      const center = viewportEl.offsetWidth / 2;
      const mean = (1 + MIN_SCALE) / 2;
      const R = center / mean; // half the row length the lens sees
      const F = (q: number) => {
        const u = gsap.utils.clamp(-R, R, q - center);
        const lens = mean * u + ((1 - MIN_SCALE) * R * Math.sin((Math.PI * u) / R)) / (2 * Math.PI);
        return center + lens + (q - center - u) * MIN_SCALE;
      };

      const lefts = items.map((el) => el.offsetLeft);
      const widths = items.map((el) => el.offsetWidth);

      // One "css" setter per card: x and scale land in a single transform
      // write (separate per-property scale setters don't render).
      gsap.set(items, { willChange: "transform" });
      const setCard = items.map((el) => gsap.quickSetter(el, "css"));

      // The track itself never moves: the row offset `x` is folded into each
      // card's own transform. The middle of three copies is on screen; wrap
      // keeps it there.
      const paint = (x: number) => {
        for (let i = 0; i < items.length; i++) {
          const l = F(lefts[i] + x);
          const r = F(lefts[i] + x + widths[i]);
          setCard[i]({
            x: (l + r) / 2 - (lefts[i] + widths[i] / 2),
            scale: (r - l) / widths[i],
          });
        }
      };

      const wrap = gsap.utils.wrap(-2 * setWidth, -setWidth);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      let offset = -2 * setWidth + progress * setWidth;
      let dragging = false;

      const tick = (_: number, dt: number) => {
        if (!dragging && !reduced.matches) offset -= (speed * dt) / 1000;
        const x = wrap(offset);
        progress = (x + 2 * setWidth) / setWidth;
        paint(x);
      };
      gsap.ticker.add(tick);

      // Draggable drives a detached proxy; we only read its x.
      const proxy = document.createElement("div");
      const sync = () => {
        offset = Number(gsap.getProperty(proxy, "x"));
      };
      const [drag] = Draggable.create(proxy, {
        type: "x",
        trigger: viewportEl,
        inertia: true,
        cursor: "grab",
        activeCursor: "grabbing",
        allowNativeTouchScrolling: true,
        onPressInit() {
          gsap.set(proxy, { x: offset });
          dragging = true;
        },
        onDrag: sync,
        onThrowUpdate: sync,
        onRelease() {
          if (!drag.isThrowing) dragging = false;
        },
        onThrowComplete() {
          dragging = false;
        },
      });

      // Paint the new layout now rather than on the next frame, so a
      // resize never shows one frame of stale transforms.
      paint(wrap(offset));

      teardown = () => {
        gsap.ticker.remove(tick);
        drag.kill();
      };
    };

    build();
    // The section is 100svh, which ignores the mobile address bar, so this
    // only fires for real size changes.
    const observer = new ResizeObserver(build);
    observer.observe(sectionEl);

    return () => {
      observer.disconnect();
      teardown();
    };
  });

  return (
    // Exactly one viewport tall, row centred in it — nothing to scroll.
    <section
      ref={section}
      aria-label="Gallery"
      className="flex h-svh items-center overflow-hidden"
    >
      <div ref={viewport} className="w-full select-none overflow-hidden">
        <div
          ref={track}
          className="flex w-max items-start"
          style={{ columnGap: `calc(${CARD_GAP}px * var(--s))` }}
        >
          {[...IMAGES, ...IMAGES, ...IMAGES].map((image, i) => (
            <div
              key={i}
              className="gallery-item shrink-0"
              style={{
                width: `calc(${image.width}px * var(--s))`,
                marginTop: `calc(${image.lift}px * var(--s))`,
              }}
              aria-hidden={i >= IMAGES.length || undefined}
            >
              <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-[#141414]">
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 344px, (min-width: 640px) 240px, 172px"
                  className="object-cover"
                  draggable={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
