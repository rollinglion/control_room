(function registerControlRoomSW() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;
  const scope = document.currentScript?.dataset?.scope || "/";
  const swUrl = document.currentScript?.dataset?.sw || "/sw.js";
  const register = () => {
    navigator.serviceWorker.register(swUrl, { scope })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (worker) {
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("Control Room assets updated. Reload to use the latest build.");
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("Service worker registration failed", err);
      });
  };
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
})();
