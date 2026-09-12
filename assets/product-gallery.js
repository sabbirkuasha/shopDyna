/*
 * Product gallery: a snap carousel synced to the thumbnail rail, plus a
 * full-screen lightbox with zoom and pan.
 *
 * This replaces the Splide + BiggerPicture pair used on the Svelte storefront
 * with the equivalent interactions built on native scroll snapping and the
 * theme's existing local GSAP, so no extra libraries or stylesheets ship.
 *
 * Progressive enhancement: the track already swipes and snaps without this
 * script. Everything below only adds thumbnail syncing, arrows, dots, keyboard
 * control, and the lightbox.
 */
(() => {
  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const gsap = () => window.gsap;

  /* ------------------------------------------------------------- carousel */

  const initGallery = (root) => {
    if (!root || root.dataset.galleryReady === "true") return null;

    const viewport = root.querySelector("[data-gallery-viewport]");
    const slides = [...root.querySelectorAll("[data-gallery-slide]")];
    if (!viewport || slides.length === 0) return null;

    root.dataset.galleryReady = "true";

    const thumbs = [...root.querySelectorAll("[data-gallery-thumb]")];
    const dots = [...root.querySelectorAll("[data-gallery-dot]")];
    const previous = root.querySelector("[data-gallery-prev]");
    const next = root.querySelector("[data-gallery-next]");
    const status = root.querySelector("[data-gallery-status]");

    let index = 0;

    const clamp = (value) => Math.max(0, Math.min(slides.length - 1, value));

    const paint = (nextIndex, revealThumb = true) => {
      index = clamp(nextIndex);

      thumbs.forEach((thumb, position) => {
        const active = position === index;
        thumb.classList.toggle("border-[var(--product-accent)]", active);
        thumb.classList.toggle("border-transparent", !active);
        thumb.setAttribute("aria-pressed", String(active));
      });

      dots.forEach((dot, position) => {
        const active = position === index;
        dot.classList.toggle("bg-[var(--product-accent)]", active);
        dot.classList.toggle("bg-gray-300", !active);
        dot.setAttribute("aria-pressed", String(active));
      });

      if (previous) previous.disabled = index === 0;
      if (next) next.disabled = index === slides.length - 1;

      if (status) status.textContent = `Image ${index + 1} of ${slides.length}`;

      /*
       * Keep the active thumbnail in view on the vertical desktop rail. Skipped
       * on the first paint, because scrollIntoView during page load can yank
       * the whole page down to the gallery.
       */
      if (revealThumb) {
        thumbs[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };

    const goTo = (target, smooth = true) => {
      const slide = slides[clamp(target)];
      if (!slide) return;
      viewport.scrollTo({
        left: slide.offsetLeft - slides[0].offsetLeft,
        behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
      });
      /* Paint immediately so the UI responds before the scroll settles. */
      paint(clamp(target));
    };

    let frame;
    viewport.addEventListener(
      "scroll",
      () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const width = slides[0].getBoundingClientRect().width || 1;
          const nextIndex = clamp(Math.round(viewport.scrollLeft / width));
          if (nextIndex !== index) paint(nextIndex);
        });
      },
      { passive: true },
    );

    thumbs.forEach((thumb) =>
      thumb.addEventListener("click", () =>
        goTo(Number(thumb.dataset.galleryThumb)),
      ),
    );
    dots.forEach((dot) =>
      dot.addEventListener("click", () => goTo(Number(dot.dataset.galleryDot))),
    );
    previous?.addEventListener("click", () => goTo(index - 1));
    next?.addEventListener("click", () => goTo(index + 1));

    viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
      }
    });

    /* Selecting a variant with its own image moves the carousel to it. */
    document.addEventListener("product:show-media", (event) => {
      const mediaId = String(event.detail?.mediaId || "");
      if (!mediaId) return;
      const target = slides.findIndex(
        (slide) => slide.dataset.mediaId === mediaId,
      );
      if (target >= 0 && target !== index) goTo(target);
    });

    /* Slide widths follow the viewport, so re-align after a resize. */
    let resizeTimer;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => goTo(index, false), 150);
    });

    paint(0, false);
    return { goTo, getIndex: () => index };
  };

  /* ------------------------------------------------------------- lightbox */

  const initLightbox = (carousel) => {
    const dialog = document.querySelector("[data-lightbox]");
    const dataScript = document.querySelector("[data-lightbox-data]");
    if (!dialog || !dataScript) return;
    /* A Theme Editor section reload would otherwise stack duplicate listeners. */
    if (dialog.dataset.lightboxReady === "true") return;
    dialog.dataset.lightboxReady = "true";

    let items = [];
    try {
      items = JSON.parse(dataScript.textContent) || [];
    } catch (error) {
      return;
    }
    if (!items.length) return;

    const image = dialog.querySelector("[data-lightbox-image]");
    const stage = dialog.querySelector("[data-lightbox-stage]");
    const counter = dialog.querySelector("[data-lightbox-counter]");
    const previous = dialog.querySelector("[data-lightbox-prev]");
    const next = dialog.querySelector("[data-lightbox-next]");
    const zoomButton = dialog.querySelector("[data-lightbox-zoom]");
    const closeButton = dialog.querySelector("[data-lightbox-close]");

    let current = 0;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let lastFocused = null;

    const applyTransform = () => {
      image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      image.classList.toggle("cursor-zoom-in", scale === 1);
      image.classList.toggle("cursor-grab", scale > 1);
      zoomButton?.setAttribute("aria-pressed", String(scale > 1));
    };

    const resetZoom = () => {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    };

    const show = (target, animate = true) => {
      current = Math.max(0, Math.min(items.length - 1, target));
      const item = items[current];

      image.src = item.src;
      image.alt = item.alt || "";
      if (item.width) image.width = item.width;
      if (item.height) image.height = item.height;

      resetZoom();

      if (counter) counter.textContent = `${current + 1} / ${items.length}`;
      if (previous) previous.disabled = current === 0;
      if (next) next.disabled = current === items.length - 1;

      /*
       * Opacity only. Tweening transform here would fight applyTransform(),
       * which owns the image's transform for zoom and pan.
       */
      if (animate && gsap() && !prefersReducedMotion()) {
        gsap().fromTo(
          image,
          { opacity: 0 },
          { opacity: 1, duration: 0.28, ease: "power2.out" },
        );
      }
    };

    const open = (target) => {
      lastFocused = document.activeElement;
      show(target, false);
      dialog.showModal();
      document.body.classList.add("overflow-hidden");
      closeButton?.focus();

      if (gsap() && !prefersReducedMotion()) {
        gsap().fromTo(
          dialog,
          { opacity: 0 },
          { opacity: 1, duration: 0.22, ease: "power2.out" },
        );
        gsap().fromTo(
          image,
          { opacity: 0 },
          { opacity: 1, duration: 0.34, delay: 0.05, ease: "power3.out" },
        );
      }
    };

    const close = () => dialog.close();

    /*
     * All cleanup hangs off the dialog's own `close` event. Escape closes a
     * native dialog without going through close() above, so putting the work
     * here keeps both routes identical — including restoring focus.
     */
    dialog.addEventListener("close", () => {
      document.body.classList.remove("overflow-hidden");
      resetZoom();
      /*
       * Return focus to the slide the viewer ended on, which may differ from
       * the one they opened if they paged through the lightbox.
       */
      carousel?.goTo(current, false);
      const opener = document.querySelector(
        `[data-lightbox-open="${current}"]`,
      );
      (opener || lastFocused)?.focus?.();
    });

    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-lightbox-open]");
      if (!opener) return;
      event.preventDefault();
      open(Number(opener.dataset.lightboxOpen));
    });

    previous?.addEventListener("click", () => show(current - 1));
    next?.addEventListener("click", () => show(current + 1));
    closeButton?.addEventListener("click", close);

    zoomButton?.addEventListener("click", () => {
      scale = scale > 1 ? 1 : 2;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    });

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(current - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        show(current + 1);
      }
      /* Escape is handled natively by <dialog>; its close event cleans up. */
    });

    /* Click the backdrop (the stage, outside the image) to dismiss. */
    stage?.addEventListener("click", (event) => {
      if (event.target === stage) close();
    });

    /* Double-click / double-tap toggles zoom at the pointer. */
    image.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (scale > 1) {
        resetZoom();
        return;
      }
      const rect = image.getBoundingClientRect();
      scale = 2.5;
      offsetX = (rect.left + rect.width / 2 - event.clientX) * (scale - 1);
      offsetY = (rect.top + rect.height / 2 - event.clientY) * (scale - 1);
      applyTransform();
    });

    /* Wheel zoom, anchored on the image centre. */
    stage?.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && Math.abs(event.deltaY) < 8) return;
        event.preventDefault();
        const nextScale = Math.min(
          4,
          Math.max(1, scale - event.deltaY * 0.002),
        );
        if (nextScale === 1) {
          resetZoom();
          return;
        }
        scale = nextScale;
        applyTransform();
      },
      { passive: false },
    );

    /*
     * Pointer handling covers three gestures:
     *   one pointer, zoomed   -> pan the image
     *   one pointer, natural  -> swipe sideways to page, down to dismiss
     *   two pointers          -> pinch to zoom
     *
     * The image carries `touch-none` so the browser does not claim these
     * gestures for its own panning first.
     */
    const pointers = new Map();
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;

    const pointerDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    image.addEventListener("pointerdown", (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      image.setPointerCapture?.(event.pointerId);

      if (pointers.size === 2) {
        /* A second finger starts a pinch, so cancel the in-progress drag. */
        dragging = false;
        pinchStartDistance = pointerDistance();
        pinchStartScale = scale;
        return;
      }

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      if (scale > 1) image.classList.add("is-grabbing");
    });

    image.addEventListener("pointermove", (event) => {
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (pointers.size === 2 && pinchStartDistance > 0) {
        const ratio = pointerDistance() / pinchStartDistance;
        scale = Math.min(4, Math.max(1, pinchStartScale * ratio));
        if (scale === 1) {
          offsetX = 0;
          offsetY = 0;
        }
        applyTransform();
        return;
      }

      if (!dragging || scale <= 1) return;
      offsetX = startOffsetX + (event.clientX - startX);
      offsetY = startOffsetY + (event.clientY - startY);
      applyTransform();
    });

    const endDrag = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStartDistance = 0;

      if (!dragging) return;
      dragging = false;
      image.classList.remove("is-grabbing");
      image.releasePointerCapture?.(event.pointerId);
      if (scale > 1) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
        show(deltaX < 0 ? current + 1 : current - 1);
      } else if (deltaY > 90) {
        close();
      }
    };

    image.addEventListener("pointerup", endDrag);
    image.addEventListener("pointercancel", endDrag);

    applyTransform();
  };

  /* ----------------------------------------------------------------- init */

  const initialize = (scope = document) => {
    const root = scope.querySelector?.("[data-product-gallery]");
    if (!root) return;
    const carousel = initGallery(root);
    initLightbox(carousel);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initialize(), {
      once: true,
    });
  } else {
    initialize();
  }

  /* Re-initialise when the Theme Editor re-renders the product section. */
  document.addEventListener("shopify:section:load", (event) =>
    initialize(event.target),
  );
})();
