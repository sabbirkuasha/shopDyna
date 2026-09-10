(() => {
  const drawer = () => document.querySelector("[data-cart-drawer]");
  const overlay = () => document.querySelector("[data-cart-drawer-overlay]");
  const setDrawer = (open) => {
    const panel = drawer();
    const shade = overlay();
    if (!panel || !shade) return;
    panel.classList.toggle("invisible", !open);
    panel.classList.toggle("translate-x-full", !open);
    shade.classList.toggle("invisible", !open);
    shade.classList.toggle("opacity-0", !open);
    panel.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("overflow-hidden", open);
    if (open) panel.querySelector("[data-cart-drawer-close]")?.focus();
  };
  const refreshDrawer = async (open = true) => {
    const response = await fetch(
      `${window.Shopify.routes.root}?section_id=cart-drawer`,
    );
    if (!response.ok) throw new Error("Unable to refresh cart");
    const html = await response.text();
    const next = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("#CartDrawerSection");
    document.getElementById("CartDrawerSection")?.replaceWith(next);
    if (open) setDrawer(true);
    const cart = await fetch(`${window.Shopify.routes.root}cart.js`).then(
      (result) => result.json(),
    );
    document.querySelectorAll("[data-cart-count]").forEach((count) => {
      count.textContent = cart.item_count;
      count.classList.toggle("hidden", cart.item_count === 0);
    });
  };

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-cart-drawer-open]")) setDrawer(true);
    if (
      event.target.closest(
        "[data-cart-drawer-close],[data-cart-drawer-overlay]",
      )
    )
      setDrawer(false);
    const change = event.target.closest("[data-cart-change]");
    if (change) {
      const requestedQuantity = Number(change.dataset.quantity);
      const isRemove = change.hasAttribute("data-cart-remove");
      if (change.disabled || (!isRemove && requestedQuantity < 1)) return;
      const cartLine = change.closest("[data-cart-line]");
      const quantityControl = change.closest("[data-cart-quantity-control]");
      const quantityValue = quantityControl?.querySelector(
        "[data-cart-quantity-value]",
      );
      const quantityLoading = quantityControl?.querySelector(
        "[data-cart-quantity-loading]",
      );
      const quantityButtons = quantityControl?.querySelectorAll(
        "[data-cart-change]",
      );
      const quantityError = cartLine?.querySelector(
        "[data-cart-quantity-error]",
      );
      const cartSummary = document.querySelector("[data-cart-summary]");
      const summaryValues = cartSummary?.querySelector(
        "[data-cart-summary-values]",
      );
      const summaryLoading = cartSummary?.querySelector(
        "[data-cart-summary-loading]",
      );
      quantityError?.classList.add("hidden");
      quantityButtons?.forEach((button) => {
        button.disabled = true;
      });
      cartLine?.setAttribute("aria-busy", "true");
      quantityValue?.classList.add("invisible");
      quantityLoading?.classList.remove("hidden");
      quantityLoading?.classList.add("flex");
      cartSummary?.setAttribute("aria-busy", "true");
      summaryValues?.classList.add("animate-pulse", "opacity-50");
      summaryLoading?.classList.remove("hidden");
      summaryLoading?.classList.add("flex");
      try {
        const response = await fetch(`${window.Shopify.routes.root}cart/change.js`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            line: Number(change.dataset.line),
            quantity: requestedQuantity,
          }),
        });
        if (!response.ok) throw new Error("Unable to update quantity");
        await refreshDrawer();
      } catch (error) {
        console.error(error);
        cartLine?.removeAttribute("aria-busy");
        quantityValue?.classList.remove("invisible");
        quantityLoading?.classList.add("hidden");
        quantityLoading?.classList.remove("flex");
        cartSummary?.removeAttribute("aria-busy");
        summaryValues?.classList.remove("animate-pulse", "opacity-50");
        summaryLoading?.classList.add("hidden");
        summaryLoading?.classList.remove("flex");
        quantityError?.classList.remove("hidden");
        quantityButtons?.forEach((button) => {
          button.disabled = Number(button.dataset.quantity) < 1;
        });
      }
    }
    const favorite = event.target.closest("[data-favorite-toggle]");
    if (favorite) {
      event.preventDefault();
      const products = JSON.parse(
        localStorage.getItem("deshal-favorites") || "[]",
      );
      const item = JSON.parse(favorite.dataset.product);
      const index = products.findIndex(
        (product) => product.handle === item.handle,
      );
      if (index >= 0) products.splice(index, 1);
      else products.push(item);
      localStorage.setItem("deshal-favorites", JSON.stringify(products));
      favorite.setAttribute("aria-pressed", String(index < 0));
      favorite.classList.toggle("text-red-700", index < 0);
      document.dispatchEvent(new CustomEvent("favorites:changed"));
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setDrawer(false);
  });
  document.addEventListener("DOMContentLoaded", () => {
    const products = JSON.parse(
      localStorage.getItem("deshal-favorites") || "[]",
    );
    document.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
      const item = JSON.parse(button.dataset.product);
      const active = products.some((product) => product.handle === item.handle);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("text-red-700", active);
    });
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest('form[action*="/cart/add"]');
    if (!form || event.submitter?.name === "return_to") return;
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      const response = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).description || "Unable to add product",
        );
      await refreshDrawer();
    } catch (error) {
      alert(error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
})();
