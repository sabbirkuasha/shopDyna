(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const initSlider = (slider) => {
    if (!slider || slider.dataset.sliderReady === "true") return;
    const slides = [...slider.querySelectorAll("[data-hero-slide]")];
    if (slides.length < 2) return;

    slider.dataset.sliderReady = "true";
    const dots = [...slider.querySelectorAll("[data-hero-dot]")];
    const previous = slider.querySelector("[data-hero-previous]");
    const next = slider.querySelector("[data-hero-next]");
    const toggle = slider.querySelector("[data-hero-toggle]");
    const pauseIcon = slider.querySelector("[data-hero-pause]");
    const playIcon = slider.querySelector("[data-hero-play]");
    const duration = Math.max(3000, Number(slider.dataset.duration) || 6000);
    const autoplayEnabled = slider.dataset.autoplay === "true";
    const pauseOnHover = slider.dataset.pauseHover === "true";
    const transition = slider.dataset.transition || "fade";
    const gsap = window.gsap;
    let current = Math.max(
      0,
      slides.findIndex(
        (slide) => slide.getAttribute("aria-hidden") === "false",
      ),
    );
    let timer;
    let pausedByUser = false;
    let interactionPaused = false;
    let animating = false;
    let touchStartX = 0;

    const updateToggle = () => {
      if (!toggle) return;
      const paused = pausedByUser || interactionPaused;
      toggle.setAttribute(
        "aria-label",
        paused ? "Play slideshow" : "Pause slideshow",
      );
      pauseIcon?.classList.toggle("hidden", paused);
      playIcon?.classList.toggle("hidden", !paused);
    };
    const stopTimer = () => window.clearTimeout(timer);
    const startTimer = () => {
      stopTimer();
      if (
        autoplayEnabled &&
        !pausedByUser &&
        !interactionPaused &&
        !reducedMotion.matches &&
        !document.hidden
      ) {
        timer = window.setTimeout(() => show(current + 1, 1), duration);
      }
      updateToggle();
    };
    const finish = (outgoing, incoming, target) => {
      outgoing.classList.add("invisible");
      outgoing.setAttribute("aria-hidden", "true");
      incoming.classList.remove("invisible");
      incoming.setAttribute("aria-hidden", "false");
      if (gsap)
        gsap.set([outgoing, incoming], {
          clearProps: "opacity,transform,visibility",
        });
      current = target;
      dots.forEach((dot, index) =>
        dot.setAttribute("aria-current", String(index === current)),
      );
      animating = false;
      startTimer();
    };
    const show = (requestedIndex, direction = 1) => {
      const target = (requestedIndex + slides.length) % slides.length;
      if (target === current || animating) return;
      animating = true;
      stopTimer();
      const outgoing = slides[current];
      const incoming = slides[target];
      incoming.classList.remove("invisible");

      if (reducedMotion.matches || !gsap) {
        finish(outgoing, incoming, target);
        return;
      }

      gsap.killTweensOf([outgoing, incoming]);
      const timeline = gsap.timeline({
        onComplete: () => finish(outgoing, incoming, target),
      });
      if (transition === "slide") {
        timeline
          .fromTo(
            incoming,
            { xPercent: 100 * direction },
            { xPercent: 0, duration: 0.75, ease: "power3.inOut" },
            0,
          )
          .to(
            outgoing,
            {
              xPercent: -24 * direction,
              autoAlpha: 0,
              duration: 0.75,
              ease: "power3.inOut",
            },
            0,
          );
      } else if (transition === "zoom") {
        timeline
          .fromTo(
            incoming,
            { autoAlpha: 0, scale: 1.08 },
            { autoAlpha: 1, scale: 1, duration: 1, ease: "power3.out" },
            0,
          )
          .to(
            outgoing,
            { autoAlpha: 0, scale: 0.98, duration: 0.65, ease: "power2.in" },
            0,
          );
      } else {
        timeline
          .fromTo(
            incoming,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.75, ease: "power2.inOut" },
            0,
          )
          .to(
            outgoing,
            { autoAlpha: 0, duration: 0.75, ease: "power2.inOut" },
            0,
          );
      }
      const content = incoming.querySelector("[data-hero-content]");
      if (content)
        timeline.fromTo(
          content.children,
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.08,
            ease: "power2.out",
          },
          0.3,
        );
    };

    previous?.addEventListener("click", () => show(current - 1, -1));
    next?.addEventListener("click", () => show(current + 1, 1));
    dots.forEach((dot, index) =>
      dot.addEventListener("click", () =>
        show(index, index < current ? -1 : 1),
      ),
    );
    toggle?.addEventListener("click", () => {
      pausedByUser = !pausedByUser;
      startTimer();
    });
    if (pauseOnHover) {
      slider.addEventListener("mouseenter", () => {
        interactionPaused = true;
        stopTimer();
        updateToggle();
      });
      slider.addEventListener("mouseleave", () => {
        interactionPaused = false;
        startTimer();
      });
    }
    slider.addEventListener("focusin", () => {
      interactionPaused = true;
      stopTimer();
    });
    slider.addEventListener("focusout", (event) => {
      if (slider.contains(event.relatedTarget)) return;
      interactionPaused = false;
      startTimer();
    });
    slider.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") show(current - 1, -1);
      if (event.key === "ArrowRight") show(current + 1, 1);
    });
    slider.addEventListener(
      "touchstart",
      (event) => {
        touchStartX = event.changedTouches[0].clientX;
      },
      { passive: true },
    );
    slider.addEventListener(
      "touchend",
      (event) => {
        const distance = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(distance) > 45)
          show(current + (distance < 0 ? 1 : -1), distance < 0 ? 1 : -1);
      },
      { passive: true },
    );
    document.addEventListener("visibilitychange", startTimer);
    reducedMotion.addEventListener?.("change", startTimer);
    startTimer();
  };

  const initAll = (scope = document) => {
    if (scope.matches?.("[data-hero-slider]")) initSlider(scope);
    scope.querySelectorAll?.("[data-hero-slider]").forEach(initSlider);
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => initAll(), {
      once: true,
    });
  else initAll();
  document.addEventListener("shopify:section:load", (event) =>
    initAll(event.target),
  );
  document.addEventListener("shopify:block:select", (event) => {
    const slide = event.target.closest?.("[data-hero-slide]");
    const slider = slide?.closest("[data-hero-slider]");
    if (!slide || !slider) return;
    slider
      .querySelector(`[data-hero-dot="${slide.dataset.slideIndex}"]`)
      ?.click();
  });
})();
