(() => {
  const ROOT = () => window.Shopify?.routes?.root || "/";
  const FAVORITES_KEY = "deshal-favorites";

  const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  /* ---------------------------------------------------------------- utils */

  /**
   * Announce a change to assistive technology through the global live region
   * in layout/theme.liquid. Clearing first forces screen readers to re-read a
   * message that is identical to the previous one.
   */
  const announce = (message) => {
    const region = document.querySelector("[data-live-region]");
    if (!region || !message) return;
    region.textContent = "";
    window.setTimeout(() => {
      region.textContent = message;
    }, 60);
  };

  /**
   * Shopify's cart API returns its failure detail in `description` (and
   * occasionally in `message`). Fall back to a readable sentence so a customer
   * never sees a bare status code.
   */
  const readCartError = async (response, fallback) => {
    try {
      const payload = await response.json();
      return payload.description || payload.message || fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getFavorites = () => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    } catch (error) {
      return [];
    }
  };

  const setFavorites = (products) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(products));
      return true;
    } catch (error) {
      return false;
    }
  };

  /* ------------------------------------------------------------ focus trap */

  /**
   * Keep Tab and Shift+Tab inside `container` while it is open. Returns the
   * function that removes the trap again.
   */
  const trapFocus = (container) => {
    const onKeydown = (event) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        container.querySelectorAll(FOCUSABLE),
      ).filter(
        (element) =>
          element.offsetParent !== null || element === document.activeElement,
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeydown);
    return () => container.removeEventListener("keydown", onKeydown);
  };

  /* ---------------------------------------------------------- cart drawer */

  const drawer = () => document.querySelector("[data-cart-drawer]");
  const overlay = () => document.querySelector("[data-cart-drawer-overlay]");

  let releaseFocusTrap = null;
  let lastFocusedBeforeDrawer = null;

  const setDrawer = (open) => {
    const panel = drawer();
    const shade = overlay();
    if (!panel || !shade) return;

    if (open) lastFocusedBeforeDrawer = document.activeElement;

    panel.classList.toggle("invisible", !open);
    panel.classList.toggle("translate-x-full", !open);
    shade.classList.toggle("invisible", !open);
    shade.classList.toggle("opacity-0", !open);
    panel.setAttribute("aria-hidden", String(!open));
    panel.inert = !open;
    document.body.classList.toggle("overflow-hidden", open);

    document
      .querySelectorAll("[data-cart-drawer-open]")
      .forEach((control) =>
        control.setAttribute("aria-expanded", String(open)),
      );

    releaseFocusTrap?.();
    releaseFocusTrap = null;

    if (open) {
      releaseFocusTrap = trapFocus(panel);
      panel.querySelector("[data-cart-drawer-close]")?.focus();
    } else if (lastFocusedBeforeDrawer?.isConnected) {
      lastFocusedBeforeDrawer.focus();
      lastFocusedBeforeDrawer = null;
    }
  };

  /**
   * Re-render the drawer section from the server, then refresh every cart
   * count in the header. The drawer is re-created by `replaceWith`, so the
   * focus trap is rebuilt afterwards whenever it stays open.
   */
  const refreshDrawer = async ({ open = true, announcement = "" } = {}) => {
    const response = await fetch(`${ROOT()}?section_id=cart-drawer`);
    if (!response.ok) throw new Error("Unable to refresh the cart.");

    const html = await response.text();
    const next = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("#CartDrawerSection");
    if (!next) throw new Error("Unable to refresh the cart.");

    const wasOpen = drawer()?.getAttribute("aria-hidden") === "false";
    releaseFocusTrap?.();
    releaseFocusTrap = null;
    document.getElementById("CartDrawerSection")?.replaceWith(next);
    setDrawer(open || wasOpen);

    const cart = await fetch(`${ROOT()}cart.js`).then((result) =>
      result.json(),
    );
    document.querySelectorAll("[data-cart-count]").forEach((count) => {
      count.textContent = cart.item_count;
      count.classList.toggle("hidden", cart.item_count === 0);
    });
    document.querySelectorAll("[data-cart-drawer-open]").forEach((control) => {
      control.setAttribute(
        "aria-label",
        `Cart with ${cart.item_count} ${cart.item_count === 1 ? "item" : "items"}`,
      );
    });

    if (announcement) announce(announcement);
    return cart;
  };

  /* --------------------------------------------------- quantity and lines */

  /**
   * Toggle the busy presentation for one cart line and the order summary, so
   * the controls cannot be pressed twice while a request is in flight.
   */
  const setLineBusy = (context, busy) => {
    const {
      cartLine,
      quantityValue,
      quantityLoading,
      quantityButtons,
      cartSummary,
      summaryValues,
      summaryLoading,
    } = context;

    quantityButtons?.forEach((button) => {
      if (busy) {
        button.dataset.previouslyDisabled = String(button.disabled);
        button.disabled = true;
      } else {
        button.disabled = button.dataset.previouslyDisabled === "true";
        delete button.dataset.previouslyDisabled;
      }
    });

    cartLine?.toggleAttribute("aria-busy", busy);
    quantityValue?.classList.toggle("invisible", busy);
    quantityLoading?.classList.toggle("hidden", !busy);
    quantityLoading?.classList.toggle("flex", busy);
    cartSummary?.toggleAttribute("aria-busy", busy);
    summaryValues?.classList.toggle("animate-pulse", busy);
    summaryValues?.classList.toggle("opacity-50", busy);
    summaryLoading?.classList.toggle("hidden", !busy);
    summaryLoading?.classList.toggle("flex", busy);
  };

  const showLineError = (context, message) => {
    const { quantityError } = context;
    if (quantityError) {
      quantityError.textContent = message;
      quantityError.classList.remove("hidden");
    }
    announce(message);
  };

  const changeCartLine = async (control) => {
    const requestedQuantity = Number(control.dataset.quantity);
    const isRemove = control.hasAttribute("data-cart-remove");
    if (control.disabled || control.dataset.pending === "true") return;
    if (!isRemove && requestedQuantity < 1) return;

    const cartLine = control.closest("[data-cart-line]");
    const quantityControl = control.closest("[data-cart-quantity-control]");
    const cartSummary = document.querySelector("[data-cart-summary]");
    const context = {
      cartLine,
      quantityControl,
      quantityValue: quantityControl?.querySelector(
        "[data-cart-quantity-value]",
      ),
      quantityLoading: quantityControl?.querySelector(
        "[data-cart-quantity-loading]",
      ),
      quantityButtons: quantityControl?.querySelectorAll("[data-cart-change]"),
      quantityError: cartLine?.querySelector("[data-cart-quantity-error]"),
      cartSummary,
      summaryValues: cartSummary?.querySelector("[data-cart-summary-values]"),
      summaryLoading: cartSummary?.querySelector("[data-cart-summary-loading]"),
    };

    const title = control.dataset.itemTitle || "item";
    control.dataset.pending = "true";
    context.quantityError?.classList.add("hidden");
    setLineBusy(context, true);

    try {
      const response = await fetch(`${ROOT()}cart/change.js`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          line: Number(control.dataset.line),
          quantity: requestedQuantity,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readCartError(
            response,
            "We couldn't update that quantity. Please try again.",
          ),
        );
      }

      const cart = await response.json();
      const line = cart.items?.[Number(control.dataset.line) - 1];

      /*
       * Shopify silently caps the quantity at the available stock instead of
       * failing, so compare what came back with what was asked for and tell the
       * customer when the two differ.
       */
      if (!isRemove && line && line.quantity < requestedQuantity) {
        await refreshDrawer({ open: false });
        showLineError(
          context,
          `Only ${line.quantity} of ${title} ${line.quantity === 1 ? "is" : "are"} available.`,
        );
        return;
      }

      const announcement = isRemove
        ? `${title} removed from your cart.`
        : `${title} quantity updated to ${requestedQuantity}.`;
      await refreshDrawer({ open: false, announcement });
    } catch (error) {
      setLineBusy(context, false);
      showLineError(
        context,
        error.message || "We couldn't update that quantity. Please try again.",
      );
    } finally {
      delete control.dataset.pending;
    }
  };

  /* --------------------------------------------------------- add to cart */

  const showFormError = (form, message) => {
    let target = form.querySelector("[data-cart-add-error]");
    if (!target) {
      target = document.createElement("p");
      target.className =
        "mt-3 border border-red-200 bg-red-50 p-3 text-sm text-red-700";
      target.setAttribute("role", "alert");
      target.dataset.cartAddError = "";
      form.append(target);
    }
    target.textContent = message;
    target.classList.remove("hidden");
    announce(message);
  };

  const clearFormError = (form) => {
    form.querySelector("[data-cart-add-error]")?.classList.add("hidden");
  };

  const addToCart = async (form, submitter) => {
    if (form.dataset.pending === "true") return;
    form.dataset.pending = "true";
    clearFormError(form);

    const originalLabel = submitter?.textContent;
    if (submitter) {
      submitter.disabled = true;
      submitter.setAttribute("aria-busy", "true");
      if (originalLabel) submitter.textContent = "Adding…";
    }

    try {
      const response = await fetch(`${ROOT()}cart/add.js`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });

      if (!response.ok) {
        throw new Error(
          await readCartError(
            response,
            "We couldn't add that product. Please try again.",
          ),
        );
      }

      const added = await response.json();
      const title = added.product_title || added.title || "Product";
      await refreshDrawer({
        open: true,
        announcement: `${title} added to your cart.`,
      });
    } catch (error) {
      showFormError(
        form,
        error.message || "We couldn't add that product. Please try again.",
      );
    } finally {
      delete form.dataset.pending;
      if (submitter) {
        submitter.disabled = false;
        submitter.removeAttribute("aria-busy");
        if (originalLabel) submitter.textContent = originalLabel;
      }
    }
  };

  /* ------------------------------------------------------------ favorites */

  const toggleFavorite = (button) => {
    let item;
    try {
      item = JSON.parse(button.dataset.product);
    } catch (error) {
      return;
    }

    const products = getFavorites();
    const index = products.findIndex(
      (product) => product.handle === item.handle,
    );
    const willAdd = index < 0;

    if (willAdd) products.push(item);
    else products.splice(index, 1);

    if (!setFavorites(products)) {
      announce(
        "Favourites can't be saved while your browser is blocking site storage.",
      );
      return;
    }

    button.setAttribute("aria-pressed", String(willAdd));
    button.classList.toggle("text-red-700", willAdd);
    announce(
      `${item.title || "Product"} ${willAdd ? "added to" : "removed from"} your favourites.`,
    );
    document.dispatchEvent(new CustomEvent("favorites:changed"));
  };

  const syncFavoriteButtons = () => {
    const products = getFavorites();
    document.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
      let item;
      try {
        item = JSON.parse(button.dataset.product);
      } catch (error) {
        return;
      }
      const active = products.some((product) => product.handle === item.handle);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("text-red-700", active);
    });
  };

  /* -------------------------------------------------------------- events */

  document.addEventListener("click", (event) => {
    const open = event.target.closest("[data-cart-drawer-open]");
    if (open) {
      /* The control is a real link to /cart, so it still works without JS. */
      event.preventDefault();
      setDrawer(true);
      return;
    }

    if (
      event.target.closest(
        "[data-cart-drawer-close],[data-cart-drawer-overlay]",
      )
    ) {
      setDrawer(false);
      return;
    }

    const change = event.target.closest("[data-cart-change]");
    if (change) {
      changeCartLine(change);
      return;
    }

    const favorite = event.target.closest("[data-favorite-toggle]");
    if (favorite) {
      event.preventDefault();
      toggleFavorite(favorite);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      drawer()?.getAttribute("aria-hidden") === "false"
    ) {
      setDrawer(false);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest('form[action*="/cart/add"]');
    if (!form || event.submitter?.name === "return_to") return;
    event.preventDefault();
    addToCart(form, event.submitter);
  });

  document.addEventListener("DOMContentLoaded", () => {
    syncFavoriteButtons();
    const panel = drawer();
    if (panel && panel.getAttribute("aria-hidden") !== "false")
      panel.inert = true;
  });

  document.addEventListener("favorites:changed", syncFavoriteButtons);
})();
