(() => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const gsap = window.gsap;

  if (!gsap) return;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  window.DeshalMotion = {
    openMenu(drawer, overlay) {
      drawer.classList.remove("-translate-x-full");
      overlay.classList.remove("opacity-0");
      if (reduceMotion) {
        drawer.classList.remove("invisible");
        overlay.classList.remove("invisible");
        return;
      }
      gsap.killTweensOf([drawer, overlay]);
      gsap.set(drawer, { xPercent: -100, force3D: true });
      gsap.set(overlay, { opacity: 0 });
      drawer.classList.remove("invisible");
      overlay.classList.remove("invisible");
      gsap
        .timeline({ defaults: { overwrite: true } })
        .to(overlay, { opacity: 1, duration: 0.38, ease: "power2.out" }, 0)
        .to(
          drawer,
          { xPercent: 0, duration: 0.56, ease: "power3.out", force3D: true },
          0,
        )
        .fromTo(
          drawer.querySelectorAll("nav > ul > li"),
          { autoAlpha: 0, x: -18 },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.35,
            stagger: 0.035,
            ease: "power2.out",
          },
          0.16,
        );
    },

    closeMenu(drawer, overlay, onComplete) {
      if (reduceMotion) {
        drawer.classList.add("invisible", "-translate-x-full");
        overlay.classList.add("invisible", "opacity-0");
        onComplete?.();
        return;
      }
      gsap.killTweensOf([drawer, overlay]);
      gsap
        .timeline({
          defaults: { overwrite: true },
          onComplete: () => {
            drawer.classList.add("invisible", "-translate-x-full");
            overlay.classList.add("invisible", "opacity-0");
            gsap.set([drawer, overlay], { clearProps: "all" });
            onComplete?.();
          },
        })
        .to(
          drawer,
          {
            xPercent: -100,
            duration: 0.46,
            ease: "power3.inOut",
            force3D: true,
          },
          0,
        )
        .to(
          overlay,
          { opacity: 0, duration: 0.34, ease: "power2.inOut" },
          0.04,
        );
    },
  };

  const setupPageTransitions = () => {
    const curtain = document.querySelector("[data-page-transition]");
    if (!curtain || document.documentElement.dataset.transitionsReady) return;
    document.documentElement.dataset.transitionsReady = "true";
    const supportsDocumentTransitions = "startViewTransition" in document;
    const isTransitionArrival = document.documentElement.classList.contains(
      "page-transition-active",
    );

    if (!reduceMotion && isTransitionArrival) {
      gsap.set(curtain, { autoAlpha: 1, yPercent: 0 });
      document.documentElement.classList.remove("page-transition-active");
      try {
        sessionStorage.removeItem("deshal-page-transition");
      } catch (error) {}
      gsap.to(curtain, {
        yPercent: -100,
        duration: 0.72,
        ease: "power4.inOut",
        delay: 0.04,
      });
      gsap.fromTo(
        "#main",
        { autoAlpha: 0.9, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          ease: "power2.out",
          clearProps: "transform,opacity,visibility",
        },
      );
    } else {
      document.documentElement.classList.remove("page-transition-active");
      try {
        sessionStorage.removeItem("deshal-page-transition");
      } catch (error) {}
      gsap.set(curtain, {
        autoAlpha: reduceMotion ? 0 : 1,
        yPercent: reduceMotion ? 0 : -100,
      });
    }

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (["mailto:", "tel:", "javascript:"].includes(url.protocol)) return;

      const isSamePageAnchor =
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash;
      if (isSamePageAnchor) {
        const target = document.querySelector(url.hash);
        if (!target || reduceMotion) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState({}, "", url.hash);
        return;
      }

      if (
        reduceMotion ||
        supportsDocumentTransitions ||
        window.Shopify?.designMode
      )
        return;
      event.preventDefault();
      try {
        sessionStorage.setItem("deshal-page-transition", "pending");
      } catch (error) {}
      curtain.style.pointerEvents = "auto";
      gsap.killTweensOf(curtain);
      gsap.fromTo(
        curtain,
        { yPercent: 100, autoAlpha: 1 },
        {
          yPercent: 0,
          duration: 0.58,
          ease: "power4.inOut",
          onComplete: () => window.location.assign(url.href),
        },
      );
    });

    window.addEventListener("pageshow", (event) => {
      curtain.style.pointerEvents = "none";
      if (event.persisted && !reduceMotion)
        gsap.set(curtain, { yPercent: -100, autoAlpha: 1 });
    });
  };

  const setupHomepageMotion = (scope = document) => {
    if (reduceMotion || !document.body.classList.contains("template-index"))
      return;

    const hero = scope.querySelector?.("[data-home-hero]");
    if (hero && !hero.dataset.motionReady) {
      hero.dataset.motionReady = "true";
      const media = hero.querySelector("[data-home-hero-media]");
      gsap.fromTo(
        media,
        { autoAlpha: 0, scale: 1.045 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 1.35,
          ease: "power3.out",
          clearProps: "transform",
        },
      );
    }

    if (window.ScrollTrigger) {
      scope.querySelectorAll?.("[data-home-reveal]").forEach((element) => {
        if (element.dataset.motionReady) return;
        element.dataset.motionReady = "true";
        const content = element.querySelector("[data-home-card-content]");
        const timeline = gsap.timeline({
          scrollTrigger: { trigger: element, start: "top 86%", once: true },
        });
        timeline.fromTo(
          element,
          { autoAlpha: 0, y: 44 },
          { autoAlpha: 1, y: 0, duration: 0.82, ease: "power3.out" },
        );
        if (content) {
          timeline.fromTo(
            content.children,
            { autoAlpha: 0, y: 18 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.48,
              stagger: 0.08,
              ease: "power2.out",
            },
            "-=0.5",
          );
        }
      });
    }

    if (canHover.matches) {
      scope.querySelectorAll?.("[data-home-card]").forEach((card) => {
        if (card.dataset.hoverReady) return;
        card.dataset.hoverReady = "true";
        const media = card.querySelector("[data-home-card-media]");
        const content = card.querySelector("[data-home-card-content]");
        if (!media) return;
        card.addEventListener("pointerenter", () => {
          gsap.to(media, {
            scale: 1.045,
            duration: 0.7,
            ease: "power3.out",
            overwrite: "auto",
          });
          if (content)
            gsap.to(content.children, {
              y: -6,
              duration: 0.45,
              ease: "power3.out",
              stagger: 0.025,
              overwrite: "auto",
            });
        });
        card.addEventListener("pointerleave", () => {
          gsap.to(media, {
            scale: 1,
            duration: 0.8,
            ease: "power3.out",
            overwrite: "auto",
          });
          if (content)
            gsap.to(content.children, {
              y: 0,
              duration: 0.5,
              ease: "power3.out",
              stagger: 0.025,
              overwrite: "auto",
            });
        });
      });
    }

    window.ScrollTrigger?.refresh();
  };

  /*
   * Product page motion.
   *
   * Entrance motion is deliberately limited to opacity and transform so it can
   * never delay or block the purchase controls: the form is interactive from
   * the first paint, and every tween here is decorative.
   */
  const setupProductMotion = (scope = document) => {
    if (reduceMotion || !document.body.classList.contains("template-product"))
      return;

    const gallery = scope.querySelector?.("[data-product-gallery]");
    if (gallery && !gallery.dataset.motionReady) {
      gallery.dataset.motionReady = "true";
      /* Opacity rather than autoAlpha, so the lightbox openers stay clickable. */
      gsap.fromTo(
        gallery,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          clearProps: "transform",
        },
      );

      const thumbnails = gallery.querySelectorAll("[data-gallery-thumb]");
      if (thumbnails.length) {
        gsap.fromTo(
          thumbnails,
          { opacity: 0, x: -14 },
          {
            opacity: 1,
            x: 0,
            duration: 0.45,
            stagger: 0.06,
            ease: "power2.out",
            clearProps: "transform",
          },
        );
      }
    }

    const form = scope.querySelector?.("[data-product-form]");
    if (form && !form.dataset.motionReady) {
      form.dataset.motionReady = "true";
      /*
       * `opacity`, not `autoAlpha`: autoAlpha also sets visibility:hidden at 0,
       * which would make Add to cart and Buy now briefly unclickable. Fading
       * opacity alone keeps every control hit-testable from the first paint.
       */
      gsap.fromTo(
        form.children,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.05,
          ease: "power2.out",
          clearProps: "transform",
        },
      );
    }

    if (window.ScrollTrigger) {
      scope.querySelectorAll?.("[data-product-reveal]").forEach((element) => {
        if (element.dataset.motionReady) return;
        element.dataset.motionReady = "true";
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: 32 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: "power3.out",
            clearProps: "transform",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          },
        );
      });
    }

    if (canHover.matches) {
      scope.querySelectorAll?.("[data-gallery-thumb]").forEach((thumb) => {
        if (thumb.dataset.hoverReady) return;
        thumb.dataset.hoverReady = "true";
        const image = thumb.querySelector("img");
        if (!image) return;
        thumb.addEventListener("pointerenter", () =>
          gsap.to(image, {
            scale: 1.08,
            duration: 0.35,
            ease: "power2.out",
            overwrite: "auto",
          }),
        );
        thumb.addEventListener("pointerleave", () =>
          gsap.to(image, {
            scale: 1,
            duration: 0.35,
            ease: "power2.out",
            overwrite: "auto",
          }),
        );
      });
    }

    window.ScrollTrigger?.refresh();
  };

  const initialize = () => {
    setupPageTransitions();
    setupHomepageMotion();
    setupProductMotion();
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();

  document.addEventListener("shopify:section:load", (event) => {
    setupHomepageMotion(event.target);
    setupProductMotion(event.target);
  });
})();
