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

/** Speed at the viewport centre, px/s. Edge speed = MIN_SCALE × DRIFT. */
const DRIFT = 500;
/** Gap at the centre, px — it shrinks with the cards toward the edges. */
const CARD_GAP = 10;
/** Scale at both viewport edges (1 at the centre). Also the edge speed
 * factor — below ~0.3 cards visibly park at the edge; that is the physics
 * of keeping gaps uniform, not a bug. */
const MIN_SCALE = 0.1;

export function Gallery() {
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const trackEl = track.current!;
      const viewportEl = viewport.current!;
      const items = gsap.utils.toArray<HTMLElement>(".gallery-item", trackEl);
      const setWidth = items[IMAGES.length].offsetLeft - items[0].offsetLeft;

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

      // Promote every animated element to its own compositor layer, and seed
      // the transforms so GSAP's per-frame setters below have a cache to
      // write into.
      gsap.set([trackEl, ...items], { x: 0, scale: 1, willChange: "transform" });
      // One "css" setter per card: x and scale land in a single transform
      // write (separate per-property scale setters don't render).
      const setCard = items.map((el) => gsap.quickSetter(el, "css"));

      const paint = (x: number) => {
        for (let i = 0; i < items.length; i++) {
          const l = F(lefts[i] + x);
          const r = F(lefts[i] + x + widths[i]);
          setCard[i]({
            x: (l + r) / 2 - (lefts[i] + x + widths[i] / 2),
            scale: (r - l) / widths[i],
          });
        }
      };

      // The middle of three copies is on screen; wrap keeps it there.
      const setX = gsap.quickSetter(trackEl, "x", "px");
      const wrap = gsap.utils.wrap(-2 * setWidth, -setWidth);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      let offset = -setWidth;
      let dragging = false;

      const tick = (_: number, dt: number) => {
        if (!dragging && !reduced.matches) offset -= (DRIFT * dt) / 1000;
        const x = wrap(offset);
        setX(x);
        paint(x);
      };
      gsap.ticker.add(tick);

      // Draggable drives a detached proxy; we only read its x.
      const proxy = document.createElement("div");
      let start = 0;
      const sync = () => {
        offset = start + Number(gsap.getProperty(proxy, "x"));
      };
      const [drag] = Draggable.create(proxy, {
        type: "x",
        trigger: viewportEl,
        inertia: true,
        cursor: "grab",
        activeCursor: "grabbing",
        allowNativeTouchScrolling: true,
        onPressInit() {
          gsap.set(proxy, { x: 0 });
          start = offset;
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

      return () => {
        gsap.ticker.remove(tick);
        drag.kill();
      };
    },
    { scope: section },
  );

  return (
    <section ref={section} aria-label="Gallery" className="overflow-hidden py-24">
      <div
        ref={viewport}
        className="select-none overflow-hidden"
      >
        <div
          ref={track}
          className="flex w-max items-start"
          style={{ columnGap: CARD_GAP }}
        >
          {[...IMAGES, ...IMAGES, ...IMAGES].map((image, i) => (
            <div
              key={i}
              className="gallery-item shrink-0"
              style={{ width: image.width, marginTop: image.lift }}
              aria-hidden={i >= IMAGES.length || undefined}
            >
              <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-[#141414]">
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 344px, 60vw"
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
