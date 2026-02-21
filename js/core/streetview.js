// ================== streetview.js ==================
// Google Street View Static API integration for entity enrichment
(function () {
  "use strict";

  var DEFAULT_SIZE = "400x250";
  var DEFAULT_FOV = 90;
  var DEFAULT_HEADING = 0;
  var DEFAULT_PITCH = 0;
  var DEFAULT_RADIUS = 60;

  function _getApiKey() {
    return window.GOOGLE_STREETVIEW_API_KEY || window.GOOGLE_MAPS_API_KEY || "";
  }

  function isConfigured() {
    return !!_getApiKey();
  }

  function _escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function _isLocalHost() {
    var host = String((window.location && window.location.hostname) || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  function _formatDateYYYYMMDD(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return String(yyyy) + mm + dd;
  }

  function _normalizeAddressForFile(address) {
    var out = String(address || "").replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
    return out || "Unknown Location";
  }

  function _buildDownloadFilename(address) {
    var dateStamp = _formatDateYYYYMMDD(new Date());
    var normalizedAddress = _normalizeAddressForFile(address);
    var base = dateStamp + " - Google Maps - " + normalizedAddress;
    return base.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "").trim() + ".png";
  }

  function _buildStreetViewUrl(lat, lng, options, useProxyOnLocalhost, allowUnsigned) {
    var key = _getApiKey();
    if (!key && !allowUnsigned) return null;

    options = options || {};
    var size = options.size || DEFAULT_SIZE;
    var fov = options.fov || DEFAULT_FOV;
    var heading = options.heading != null ? options.heading : DEFAULT_HEADING;
    var pitch = options.pitch != null ? options.pitch : DEFAULT_PITCH;
    var radius = options.radius != null ? options.radius : DEFAULT_RADIUS;
    var source = options.source || "outdoor";

    var qs =
      "?size=" + encodeURIComponent(size) +
      "&location=" + encodeURIComponent(lat + "," + lng) +
      "&fov=" + encodeURIComponent(fov) +
      "&heading=" + encodeURIComponent(heading) +
      "&pitch=" + encodeURIComponent(pitch) +
      "&radius=" + encodeURIComponent(radius) +
      "&source=" + encodeURIComponent(source);

    if (key) {
      qs += "&key=" + encodeURIComponent(key);
    }
    if (useProxyOnLocalhost && _isLocalHost() && typeof window.apiUrl === "function") {
      return window.apiUrl("/streetview/static" + qs);
    }
    return "https://maps.googleapis.com/maps/api/streetview" + qs;
  }

  function getStaticUrl(lat, lng, options) {
    return _buildStreetViewUrl(lat, lng, options, true, false);
  }

  function getDisplayUrl(lat, lng, options) {
    return _buildStreetViewUrl(lat, lng, options, false, true);
  }

  async function hasStreetView(lat, lng) {
    var key = _getApiKey();
    if (!key) return false;

    var url = "https://maps.googleapis.com/maps/api/streetview/metadata" +
      "?location=" + encodeURIComponent(lat + "," + lng) +
      "&radius=" + encodeURIComponent(DEFAULT_RADIUS) +
      "&source=outdoor" +
      "&key=" + encodeURIComponent(key);

    try {
      var resp = await fetch(url);
      var data = await resp.json();
      return data.status === "OK";
    } catch (_e) {
      return false;
    }
  }

  async function getStreetViewStatus(lat, lng) {
    var key = _getApiKey();
    if (!key) return { ok: false, status: "NO_KEY" };

    var url = "https://maps.googleapis.com/maps/api/streetview/metadata" +
      "?location=" + encodeURIComponent(lat + "," + lng) +
      "&radius=" + encodeURIComponent(DEFAULT_RADIUS) +
      "&source=outdoor" +
      "&key=" + encodeURIComponent(key);

    try {
      var resp = await fetch(url);
      var data = await resp.json();
      var status = String((data && data.status) || "UNKNOWN");
      return { ok: status === "OK", status: status, data: data };
    } catch (_e) {
      return { ok: false, status: "NETWORK_ERROR" };
    }
  }

  async function renderThumbnail(container, lat, lng, options) {
    if (!container) return;
    if (!isConfigured()) {
      container.innerHTML = '<div class="sv-unavailable">Street View not configured</div>';
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      container.innerHTML = "";
      return;
    }

    options = options || {};
    var size = options.size || "360x200";
    var imgOptions = {
      size: size,
      fov: options.fov,
      heading: options.heading,
      pitch: options.pitch,
      radius: options.radius,
      source: options.source || "outdoor"
    };

    var url = getDisplayUrl(lat, lng, imgOptions);
    var fallbackUrl = getStaticUrl(lat, lng, imgOptions);
    if (!url) {
      container.innerHTML = '<div class="sv-unavailable">Street View unavailable</div>';
      return;
    }

    var meta = await getStreetViewStatus(lat, lng);
    if (!meta.ok) {
      var msg = "No Street View coverage";
      if (meta.status === "NO_KEY") msg = "Street View key missing";
      else if (meta.status === "REQUEST_DENIED") msg = "Street View request denied (API key/referrer)";
      else if (meta.status === "OVER_QUERY_LIMIT") msg = "Street View quota exceeded";
      else if (meta.status === "INVALID_REQUEST") msg = "Street View request invalid";
      else if (meta.status === "NETWORK_ERROR") msg = "Street View network error";
      if (meta && meta.data && meta.data.error_message) msg += ": " + _escapeHtml(meta.data.error_message);
      container.innerHTML = '<div class="sv-unavailable">' + msg + "</div>";
      return;
    }

    var img = document.createElement("img");
    img.className = "inspector-streetview";
    img.alt = "Street View at " + lat.toFixed(5) + ", " + lng.toFixed(5);
    img.loading = "lazy";
    img.src = url;
    img.style.cursor = "pointer";
    img.title = "Click to open in Google Maps";
    img.dataset.fallbackSrc = fallbackUrl || "";
    img.dataset.fallbackTried = "0";

    img.onerror = function () {
      if (img.dataset.fallbackTried !== "1" && img.dataset.fallbackSrc) {
        img.dataset.fallbackTried = "1";
        img.src = img.dataset.fallbackSrc;
        return;
      }
      container.innerHTML = '<div class="sv-unavailable">Street View image unavailable (coverage, key policy, or quota).</div>';
    };

    img.onclick = function () {
      var mapsUrl = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng;
      window.open(mapsUrl, "_blank");
    };

    container.innerHTML = "";
    container.appendChild(img);
  }

  function renderInspectorView(container, lat, lng) {
    renderThumbnail(container, lat, lng, { size: "640x300", fov: 80, radius: 90, source: "outdoor" });
  }

  async function downloadPng(lat, lng, options) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    options = options || {};
    var size = options.size || "1280x720";
    var url = getDisplayUrl(lat, lng, {
      size: size,
      fov: options.fov,
      heading: options.heading,
      pitch: options.pitch,
      radius: options.radius,
      source: options.source || "outdoor"
    });
    if (!url) return;

    var address = String(options.addressString || options.address || "").trim();
    var filename = String(options.filename || _buildDownloadFilename(address));

    try {
      var resp = await fetch(url);
      if (!resp.ok) throw new Error("download failed");
      var blob = await resp.blob();
      var bitmap = await createImageBitmap(blob);
      var canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      var pngBlob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/png");
      });
      if (!pngBlob) throw new Error("png conversion failed");
      var objectUrl = URL.createObjectURL(pngBlob);
      var a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);
    } catch (_e) {
      window.open(url, "_blank");
    }
  }

  function openMapsPano(lat, lng) {
    var mapsUrl = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng;
    window.open(mapsUrl, "_blank");
  }

  function getPopupThumbnailHtml(lat, lng, options) {
    options = options || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";

    var mapsUrl = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng;
    var encodedAddress = encodeURIComponent(String(options.addressString || options.address || ""));
    var url = getDisplayUrl(lat, lng, { size: "300x150", fov: 90, radius: 90, source: "outdoor" });

    if (!url) {
      return '<a class="popup-psc-btn" href="' + mapsUrl + '" target="_blank" rel="noopener">Open in Google Maps</a>';
    }

    return (
      '<div class="sv-popup-wrap">' +
        '<img class="sv-popup-thumb" src="' + url + '" alt="Street View" loading="lazy" ' +
          'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" ' +
          'onclick="window.StreetView.openMapsPano(' + lat + ',' + lng + ')" ' +
          'title="Click to open Street View">' +
        '<div class="sv-popup-fallback" style="display:none;">Street View preview unavailable in-app.</div>' +
      '</div>' +
      '<div class="popup-btn-row">' +
        '<a class="popup-psc-btn" href="' + mapsUrl + '" target="_blank" rel="noopener">Open in Google Maps</a>' +
        '<button class="popup-psc-btn" type="button" onclick="window.StreetView.downloadPng(' + lat + ',' + lng + ',{addressString:decodeURIComponent(\'' + encodedAddress + '\')})">Download PNG</button>' +
      '</div>'
    );
  }

  window.StreetView = {
    isConfigured: isConfigured,
    getStaticUrl: getStaticUrl,
    hasStreetView: hasStreetView,
    getStreetViewStatus: getStreetViewStatus,
    renderThumbnail: renderThumbnail,
    renderInspectorView: renderInspectorView,
    getPopupThumbnailHtml: getPopupThumbnailHtml,
    downloadPng: downloadPng,
    getDisplayUrl: getDisplayUrl,
    openMapsPano: openMapsPano
  };
})();
