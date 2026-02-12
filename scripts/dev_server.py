import base64
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Dict
from urllib.parse import urlsplit, parse_qs, urlencode, quote_plus

CH_API_BASE = "https://api.company-information.service.gov.uk"
TFL_API_BASE = "https://api.tfl.gov.uk"
POSTCODES_API_BASE = "https://api.postcodes.io"
OPENSKY_API_BASE = "https://opensky-network.org/api"
OS_PLACES_API_BASE = "https://api.os.uk/search/places/v1"
NRE_LDBWS_URL = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx"
NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search"
AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1"
UK_RAIL_STATIONS_URL = "https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.json"
WEBTRIS_API_BASE = "https://webtris.highwaysengland.co.uk/api"
SIGNALBOX_API_BASE = "https://api.signalbox.io/v2.5"
DVLA_VES_API_BASE = "https://driver-vehicle-licensing.api.gov.uk"

_station_catalog_cache = {
    "loaded": False,
    "items": [],
}


def b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")


def load_env_file():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        print(f"Loading environment from: {env_path}")
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()
                    if key.strip() == "CH_API_KEY":
                        print(f"CH_API_KEY loaded: {value.strip()[:8]}...")
                    if key.strip() == "OS_PLACES_API_KEY":
                        print(f"OS_PLACES_API_KEY loaded: {value.strip()[:8]}...")
                    if key.strip() == "NRE_LDBWS_TOKEN":
                        print(f"NRE_LDBWS_TOKEN loaded: {value.strip()[:8]}...")
                    if key.strip() == "SIGNALBOX_API_KEY":
                        print(f"SIGNALBOX_API_KEY loaded: {value.strip()[:8]}...")
                    if key.strip() == "DVLA_API_KEY":
                        print(f"DVLA_API_KEY loaded: {value.strip()[:8]}...")
    else:
        print(f"Warning: No .env file found at {env_path}")
        print("Set CH_API_KEY environment variable or create .env file")


class Handler(SimpleHTTPRequestHandler):
    def _haversine_km(self, lat1, lon1, lat2, lon2):
        import math
        r = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
        )
        return 2 * r * math.asin(math.sqrt(a))

    def _load_station_catalog(self):
        if _station_catalog_cache["loaded"]:
            return _station_catalog_cache["items"]
        req = urllib.request.Request(UK_RAIL_STATIONS_URL)
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", "ControlRoom/1.0 (+https://localhost)")
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = json.loads(resp.read().decode("utf-8", errors="replace"))
        items = []
        if isinstance(raw, list):
            for r in raw:
                crs = str(r.get("crsCode") or "").strip().upper()
                name = str(r.get("stationName") or "").strip()
                if len(crs) == 3 and name:
                    items.append(
                        {
                            "crs": crs,
                            "name": name,
                            "country": str(r.get("constituentCountry") or "").strip().lower(),
                            "lat": r.get("lat"),
                            "lon": r.get("long"),
                        }
                    )
        _station_catalog_cache["loaded"] = True
        _station_catalog_cache["items"] = items
        return items

    def _send_json_error(self, status: int, payload: bytes):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_get(self, upstream_url: str, headers: Optional[Dict[str, str]] = None):
        req = urllib.request.Request(upstream_url)
        req.add_header("User-Agent", "ControlRoom/1.0 (+https://localhost)")
        if headers:
            for key, value in headers.items():
                req.add_header(key, value)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
                return True
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b"{}"
            self._send_json_error(e.code, body)
            return True
        except Exception as e:
            payload = ("{\"error\":\"Upstream failed\",\"detail\":\"%s\"}" % str(e)).encode("utf-8")
            self._send_json_error(502, payload)
            return True

    def _send_json(self, payload, status: int = 200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _xml_local_name(self, tag: str) -> str:
        return tag.split("}", 1)[1] if "}" in tag else tag

    def _find_first_text(self, root, name: str, default: str = "") -> str:
        for el in root.iter():
            if self._xml_local_name(el.tag) == name:
                return (el.text or "").strip()
        return default

    def _children_by_local_name(self, root, name: str):
        out = []
        for el in root.iter():
            if self._xml_local_name(el.tag) == name:
                out.append(el)
        return out

    def _parse_service(self, service_el):
        def gt(n, d=""):
            for ch in service_el.iter():
                if self._xml_local_name(ch.tag) == n:
                    return (ch.text or "").strip() or d
            return d

        origins = []
        destinations = []
        for origin in self._children_by_local_name(service_el, "origin"):
            names = [self._find_first_text(loc, "locationName", "") for loc in self._children_by_local_name(origin, "location")]
            names = [n for n in names if n]
            if names:
                origins.extend(names)
        for dest in self._children_by_local_name(service_el, "destination"):
            names = [self._find_first_text(loc, "locationName", "") for loc in self._children_by_local_name(dest, "location")]
            names = [n for n in names if n]
            if names:
                destinations.extend(names)

        return {
            "serviceID": gt("serviceID"),
            "std": gt("std"),
            "etd": gt("etd"),
            "sta": gt("sta"),
            "eta": gt("eta"),
            "platform": gt("platform"),
            "operator": gt("operator"),
            "operatorCode": gt("operatorCode"),
            "length": gt("length"),
            "origin": origins,
            "destination": destinations,
        }

    def _build_ldbws_envelope(self, token: str, method: str, body_xml: str) -> bytes:
        envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ldb="http://thalesgroup.com/RTTI/2017-10-01/ldb/">
  <soap:Header>
    <AccessToken xmlns="http://thalesgroup.com/RTTI/2013-11-28/Token/types">
      <TokenValue>{token}</TokenValue>
    </AccessToken>
  </soap:Header>
  <soap:Body>
    <ldb:{method}Request>
      {body_xml}
    </ldb:{method}Request>
  </soap:Body>
</soap:Envelope>
"""
        return envelope.encode("utf-8")

    def _call_ldbws(self, method: str, body_xml: str):
        token = os.environ.get("NRE_LDBWS_TOKEN", "").strip()
        if not token:
            return None, {"error": "NRE_LDBWS_TOKEN env var not set"}

        endpoint = os.environ.get("NRE_LDBWS_URL", NRE_LDBWS_URL).strip() or NRE_LDBWS_URL
        payload = self._build_ldbws_envelope(token, method, body_xml)
        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Content-Type", "text/xml; charset=utf-8")
        req.add_header("Accept", "text/xml")
        req.add_header("SOAPAction", f"http://thalesgroup.com/RTTI/2017-10-01/ldb/{method}")
        req.add_header("User-Agent", "ControlRoom/1.0 (+https://localhost)")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                xml_body = resp.read()
                root = ET.fromstring(xml_body)
                for el in root.iter():
                    if self._xml_local_name(el.tag) == "Fault":
                        fault_string = self._find_first_text(el, "faultstring", "SOAP Fault")
                        return None, {"error": "LDBWS SOAP fault", "detail": fault_string}
                return root, None
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                detail = str(e)
            return None, {"error": f"HTTP {e.code}", "detail": detail}
        except Exception as e:
            return None, {"error": "LDBWS request failed", "detail": str(e)}

    def _parse_station_board(self, root):
        board = None
        for el in root.iter():
            if self._xml_local_name(el.tag) in ("GetStationBoardResult", "StationBoardResult"):
                board = el
                break
        if board is None:
            return {
                "generatedAt": "",
                "locationName": "",
                "crs": "",
                "nrccMessages": [],
                "services": [],
            }

        out = {
            "generatedAt": self._find_first_text(board, "generatedAt", ""),
            "locationName": self._find_first_text(board, "locationName", ""),
            "crs": self._find_first_text(board, "crs", ""),
            "nrccMessages": [],
            "services": [],
        }
        for msg_el in self._children_by_local_name(board, "nrccMessage"):
            txt = (msg_el.text or "").strip()
            if txt:
                out["nrccMessages"].append(txt)

        service_list = []
        for list_name in ("trainServices", "busServices", "ferryServices"):
            for svc_list in self._children_by_local_name(board, list_name):
                for svc in svc_list:
                    if self._xml_local_name(svc.tag) == "service":
                        service_list.append(self._parse_service(svc))
        out["services"] = service_list
        return out

    def _parse_service_details(self, root):
        details = None
        for el in root.iter():
            if self._xml_local_name(el.tag) in ("GetServiceDetailsResult", "ServiceDetailsResult"):
                details = el
                break
        if details is None:
            return {}
        return {
            "generatedAt": self._find_first_text(details, "generatedAt", ""),
            "serviceType": self._find_first_text(details, "serviceType", ""),
            "locationName": self._find_first_text(details, "locationName", ""),
            "crs": self._find_first_text(details, "crs", ""),
            "operator": self._find_first_text(details, "operator", ""),
            "operatorCode": self._find_first_text(details, "operatorCode", ""),
            "rsid": self._find_first_text(details, "rsid", ""),
            "std": self._find_first_text(details, "std", ""),
            "etd": self._find_first_text(details, "etd", ""),
            "sta": self._find_first_text(details, "sta", ""),
            "eta": self._find_first_text(details, "eta", ""),
            "platform": self._find_first_text(details, "platform", ""),
            "isCancelled": self._find_first_text(details, "isCancelled", ""),
            "cancelReason": self._find_first_text(details, "cancelReason", ""),
            "delayReason": self._find_first_text(details, "delayReason", ""),
        }

    def do_GET(self):
        if self.path.startswith("/ch/"):
            api_key = os.environ.get("CH_API_KEY", "").strip()
            if not api_key:
                self._send_json_error(500, b'{"error":"CH_API_KEY env var not set"}')
                return

            upstream_url = CH_API_BASE + self.path.replace("/ch", "", 1)
            self._proxy_get(
                upstream_url,
                headers={
                    "Authorization": "Basic " + b64(f"{api_key}:"),
                    "Accept": "application/json",
                },
            )
            return

        if self.path.startswith("/tfl/"):
            upstream_url = TFL_API_BASE + self.path.replace("/tfl", "", 1)
            self._proxy_get(upstream_url, headers={"Accept": "application/json"})
            return

        if self.path.startswith("/postcodes/"):
            upstream_url = POSTCODES_API_BASE + self.path.replace("/postcodes", "", 1)
            self._proxy_get(upstream_url, headers={"Accept": "application/json"})
            return

        if self.path.startswith("/webtris/"):
            upstream_url = WEBTRIS_API_BASE + "/" + self.path.replace("/webtris/", "", 1)
            self._proxy_get(upstream_url, headers={"Accept": "application/json"})
            return

        if self.path.startswith("/signalbox/health"):
            key = os.environ.get("SIGNALBOX_API_KEY", "").strip()
            self._send_json({"ok": True, "configured": bool(key), "endpoint": SIGNALBOX_API_BASE})
            return

        if self.path.startswith("/dvla/health"):
            key = os.environ.get("DVLA_API_KEY", "").strip()
            self._send_json({"ok": True, "configured": bool(key), "endpoint": f"{DVLA_VES_API_BASE}/vehicle-enquiry/v1/vehicles"})
            return

        if self.path.startswith("/signalbox/trains"):
            key = os.environ.get("SIGNALBOX_API_KEY", "").strip()
            if not key:
                self._send_json({"error": "SIGNALBOX_API_KEY env var not set"}, status=500)
                return
            parsed = urlsplit(self.path)
            query = f"?{parsed.query}" if parsed.query else ""
            upstream_url = SIGNALBOX_API_BASE + "/trains" + query
            self._proxy_get(
                upstream_url,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {key}",
                },
            )
            return

        if self.path.startswith("/opensky/states/all"):
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            upstream_url = OPENSKY_API_BASE + "/states/all"
            if query:
                upstream_url += "?" + query
            self._proxy_get(upstream_url, headers={"Accept": "application/json"})
            return

        if self.path.startswith("/osplaces/postcode"):
            os_key = os.environ.get("OS_PLACES_API_KEY", "").strip()
            if not os_key:
                self._send_json_error(500, b'{"error":"OS_PLACES_API_KEY env var not set"}')
                return

            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            postcode = (params.get("postcode") or [""])[0].strip()
            if not postcode:
                self._send_json_error(400, b'{"error":"postcode query parameter required"}')
                return

            query = urlencode(
                {
                    "postcode": postcode,
                    "key": os_key,
                    "maxresults": "1",
                    "output_srs": "EPSG:4326",
                }
            )
            upstream_url = f"{OS_PLACES_API_BASE}/postcode?{query}"
            self._proxy_get(upstream_url, headers={"Accept": "application/json"})
            return

        if self.path.startswith("/nre/health"):
            token = os.environ.get("NRE_LDBWS_TOKEN", "").strip()
            self._send_json({"ok": True, "configured": bool(token), "endpoint": os.environ.get("NRE_LDBWS_URL", NRE_LDBWS_URL)})
            return

        if self.path.startswith("/nre/departures") or self.path.startswith("/nre/arrivals"):
            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            crs = ((params.get("crs") or [""])[0]).strip().upper()
            rows = ((params.get("rows") or ["10"])[0]).strip()
            if not crs or len(crs) != 3:
                self._send_json({"error": "crs query parameter required (3-letter station code)"}, status=400)
                return
            method = "GetDepartureBoard" if self.path.startswith("/nre/departures") else "GetArrivalBoard"
            body = f"<ldb:numRows>{rows or '10'}</ldb:numRows><ldb:crs>{crs}</ldb:crs>"
            root, err = self._call_ldbws(method, body)
            if err:
                self._send_json(err, status=502)
                return
            board = self._parse_station_board(root)
            self._send_json({"ok": True, "type": "departures" if method == "GetDepartureBoard" else "arrivals", "board": board})
            return

        if self.path.startswith("/nre/stations"):
            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            q = ((params.get("q") or [""])[0]).strip().lower()
            crs = ((params.get("crs") or [""])[0]).strip().upper()
            limit_s = ((params.get("limit") or ["20"])[0]).strip()
            try:
                limit = max(1, min(100, int(limit_s)))
            except Exception:
                limit = 20
            try:
                items = self._load_station_catalog()
            except Exception as e:
                self._send_json({"ok": False, "error": "station catalog unavailable", "detail": str(e), "stations": []}, status=502)
                return

            if crs and len(crs) == 3:
                base = None
                for st in items:
                    if st["crs"] == crs:
                        base = st
                        break
                if not base:
                    self._send_json({"ok": True, "base": None, "stations": []})
                    return
                try:
                    lat1 = float(base.get("lat"))
                    lon1 = float(base.get("lon"))
                except Exception:
                    self._send_json({"ok": True, "base": base, "stations": []})
                    return
                nearby = []
                for st in items:
                    if st["crs"] == crs:
                        continue
                    try:
                        lat2 = float(st.get("lat"))
                        lon2 = float(st.get("lon"))
                    except Exception:
                        continue
                    d = self._haversine_km(lat1, lon1, lat2, lon2)
                    if d <= 45:
                        nearby.append((d, st))
                nearby.sort(key=lambda x: x[0])
                out = []
                for d, st in nearby[:limit]:
                    cp = dict(st)
                    cp["distanceKm"] = round(d, 2)
                    out.append(cp)
                self._send_json({"ok": True, "base": base, "stations": out})
                return

            if not q:
                top = items[:limit]
                self._send_json({"ok": True, "stations": top})
                return

            q_upper = q.upper()
            scored = []
            for st in items:
                name_l = st["name"].lower()
                crs = st["crs"]
                score = 0
                if crs == q_upper:
                    score += 200
                elif crs.startswith(q_upper):
                    score += 120
                if name_l.startswith(q):
                    score += 80
                if q in name_l:
                    score += 40
                if score > 0:
                    scored.append((score, st))

            scored.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
            out = [s for _, s in scored[:limit]]
            self._send_json({"ok": True, "stations": out})
            return

        if self.path.startswith("/nre/service"):
            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            service_id = ((params.get("service_id") or [""])[0]).strip()
            if not service_id:
                self._send_json({"error": "service_id query parameter required"}, status=400)
                return
            body = f"<ldb:serviceID>{service_id}</ldb:serviceID>"
            root, err = self._call_ldbws("GetServiceDetails", body)
            if err:
                self._send_json(err, status=502)
                return
            self._send_json({"ok": True, "service": self._parse_service_details(root)})
            return

        if self.path.startswith("/geo/search"):
            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            q = ((params.get("q") or [""])[0]).strip()
            limit = ((params.get("limit") or ["1"])[0]).strip()
            if not q:
                self._send_json({"error": "q query parameter required"}, status=400)
                return
            upstream = f"{NOMINATIM_BASE}?q={quote_plus(q)}&format=jsonv2&limit={quote_plus(limit)}"
            self._proxy_get(
                upstream,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "ControlRoom/1.0 (+https://localhost)",
                },
            )
            return

        if self.path.startswith("/flight/schedule"):
            parsed = urlsplit(self.path)
            params = parse_qs(parsed.query or "")
            callsign = ((params.get("callsign") or [""])[0]).strip().upper()
            icao24 = ((params.get("icao24") or [""])[0]).strip().lower()
            key = os.environ.get("AVIATIONSTACK_API_KEY", "").strip()
            if not key:
                self._send_json(
                    {
                        "ok": False,
                        "reason": "AVIATIONSTACK_API_KEY env var not set",
                        "flight": None,
                    },
                    status=200,
                )
                return
            if not callsign and not icao24:
                self._send_json({"ok": False, "reason": "callsign or icao24 required", "flight": None}, status=400)
                return

            upstream_params = {"access_key": key, "limit": "12"}
            if callsign:
                upstream_params["flight_iata"] = callsign
            upstream_url = f"{AVIATIONSTACK_BASE}/flights?{urlencode(upstream_params)}"
            req = urllib.request.Request(upstream_url)
            req.add_header("Accept", "application/json")
            req.add_header("User-Agent", "ControlRoom/1.0 (+https://localhost)")
            try:
                with urllib.request.urlopen(req, timeout=25) as resp:
                    body = json.loads(resp.read().decode("utf-8", errors="replace"))
            except urllib.error.HTTPError as e:
                detail = ""
                try:
                    detail = e.read().decode("utf-8", errors="replace")[:500]
                except Exception:
                    detail = str(e)
                self._send_json({"ok": False, "reason": f"aviationstack HTTP {e.code}", "detail": detail}, status=502)
                return
            except Exception as e:
                self._send_json({"ok": False, "reason": "aviationstack request failed", "detail": str(e)}, status=502)
                return

            items = body.get("data") if isinstance(body, dict) else []
            if not isinstance(items, list):
                items = []

            def score(item):
                val = 0
                cs = str(item.get("flight", {}).get("iata", "")).upper()
                if callsign and cs == callsign:
                    val += 50
                if item.get("live"):
                    val += 20
                if item.get("flight_status"):
                    val += 10
                return val

            items.sort(key=score, reverse=True)
            top = items[0] if items else None
            if not top:
                self._send_json({"ok": True, "reason": "no schedule match", "flight": None}, status=200)
                return

            dep = top.get("departure") or {}
            arr = top.get("arrival") or {}
            flight_obj = top.get("flight") or {}
            airline = top.get("airline") or {}
            out = {
                "ok": True,
                "flight": {
                    "flight_code": flight_obj.get("iata") or flight_obj.get("icao") or callsign,
                    "status": top.get("flight_status") or "unknown",
                    "airline": airline.get("name") or "",
                    "departure": {
                        "airport": dep.get("airport") or dep.get("iata") or dep.get("icao"),
                        "scheduled": dep.get("scheduled"),
                        "estimated": dep.get("estimated"),
                        "actual": dep.get("actual"),
                        "delay": dep.get("delay"),
                    },
                    "arrival": {
                        "airport": arr.get("airport") or arr.get("iata") or arr.get("icao"),
                        "scheduled": arr.get("scheduled"),
                        "estimated": arr.get("estimated"),
                        "actual": arr.get("actual"),
                        "delay": arr.get("delay"),
                    },
                },
            }
            self._send_json(out, status=200)
            return

        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/dvla/vehicle"):
            api_key = os.environ.get("DVLA_API_KEY", "").strip()
            if not api_key:
                self._send_json({"error": "DVLA_API_KEY env var not set"}, status=500)
                return
            length = 0
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except Exception:
                length = 0
            raw = self.rfile.read(length) if length > 0 else b"{}"
            try:
                body = json.loads(raw.decode("utf-8", errors="replace"))
            except Exception:
                self._send_json({"error": "Invalid JSON body"}, status=400)
                return
            registration = str(body.get("registrationNumber") or "").upper().replace(" ", "").strip()
            if not registration:
                self._send_json({"error": "registrationNumber is required"}, status=400)
                return

            upstream_url = f"{DVLA_VES_API_BASE}/vehicle-enquiry/v1/vehicles"
            payload = json.dumps({"registrationNumber": registration}).encode("utf-8")
            req = urllib.request.Request(upstream_url, data=payload, method="POST")
            req.add_header("Accept", "application/json")
            req.add_header("Content-Type", "application/json")
            req.add_header("x-api-key", api_key)
            req.add_header("User-Agent", "ControlRoom/1.0 (+https://localhost)")
            try:
                with urllib.request.urlopen(req, timeout=25) as resp:
                    body = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
                    return
            except urllib.error.HTTPError as e:
                err_body = e.read() if hasattr(e, "read") else b"{}"
                self._send_json_error(e.code, err_body)
                return
            except Exception as e:
                self._send_json({"error": "DVLA upstream failed", "detail": str(e)}, status=502)
                return

        self._send_json({"error": "Not found"}, status=404)


def main():
    load_env_file()

    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"\n{'=' * 60}")
    print("Control Room Server Running")
    print(f"{'=' * 60}")
    print(f"Local:  http://localhost:{port}")
    print(f"Proxy:  /ch/* -> {CH_API_BASE}")
    print(f"Proxy:  /tfl/* -> {TFL_API_BASE}")
    print(f"Proxy:  /postcodes/* -> {POSTCODES_API_BASE}")
    print(f"Proxy:  /webtris/* -> {WEBTRIS_API_BASE}")
    print(f"Proxy:  /opensky/states/all -> {OPENSKY_API_BASE}/states/all")
    print(f"Proxy:  /osplaces/postcode?postcode=... -> {OS_PLACES_API_BASE}/postcode")
    print(f"Proxy:  /nre/departures|arrivals?crs=KGX&rows=10 -> {NRE_LDBWS_URL}")
    print(f"Proxy:  /nre/service?service_id=... -> {NRE_LDBWS_URL}")
    print(f"Proxy:  /nre/stations?q=king&limit=20 -> {UK_RAIL_STATIONS_URL}")
    print(f"Proxy:  /geo/search?q=... -> {NOMINATIM_BASE}")
    print(f"Proxy:  /flight/schedule?callsign=BAW130&icao24=... -> {AVIATIONSTACK_BASE}/flights")
    print(f"Proxy:  /signalbox/trains?... -> {SIGNALBOX_API_BASE}/trains")
    print(f"Proxy:  /dvla/vehicle [POST] -> {DVLA_VES_API_BASE}/vehicle-enquiry/v1/vehicles")
    print(f"{'=' * 60}\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
