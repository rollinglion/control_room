const API_KEYS = {
  GOOGLE_MAPS: (typeof window !== "undefined"
    ? String(window.GOOGLE_MAPS_API_KEY || window.GOOGLE_STREETVIEW_API_KEY || "")
    : "")
};

export default API_KEYS;
