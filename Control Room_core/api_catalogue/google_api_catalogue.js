const GOOGLE_API_CATALOGUE = {
  geospatial_core: {
    geocoding: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/geocode/json",
      capability: "address_to_coordinates"
    },
    places: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/place",
      capability: "place_intelligence"
    },
    elevation: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/elevation/json",
      capability: "terrain_intelligence"
    }
  },
  routing: {
    directions: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/directions/json",
      capability: "route_analysis"
    },
    distance_matrix: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/distancematrix/json",
      capability: "travel_time_analysis"
    },
    routes_api: {
      enabled: true,
      endpoint: "https://routes.googleapis.com/directions/v2:computeRoutes",
      capability: "advanced_route_analysis"
    }
  },
  environment: {
    weather: {
      enabled: true,
      endpoint: "https://weather.googleapis.com",
      capability: "environment_intelligence"
    },
    air_quality: {
      enabled: true,
      endpoint: "https://airquality.googleapis.com",
      capability: "environment_risk_assessment"
    },
    pollen: {
      enabled: true,
      endpoint: "https://pollen.googleapis.com",
      capability: "biological_environment_intelligence"
    },
    solar: {
      enabled: true,
      endpoint: "https://solar.googleapis.com",
      capability: "structure_analysis"
    }
  },
  imagery: {
    map_tiles: {
      enabled: true,
      endpoint: "https://tile.googleapis.com",
      capability: "map_tile_access"
    },
    street_view_static: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/streetview",
      capability: "ground_imagery"
    },
    aerial_view: {
      enabled: true,
      endpoint: "https://aerialview.googleapis.com",
      capability: "3d_visual_intelligence"
    }
  },
  location_services: {
    geolocation: {
      enabled: true,
      endpoint: "https://www.googleapis.com/geolocation/v1/geolocate",
      capability: "device_position_estimation"
    },
    timezone: {
      enabled: true,
      endpoint: "https://maps.googleapis.com/maps/api/timezone/json",
      capability: "timezone_resolution"
    }
  }
};

if (typeof window !== "undefined") {
  window.GOOGLE_API_CATALOGUE = GOOGLE_API_CATALOGUE;
}

export default GOOGLE_API_CATALOGUE;
