#!/usr/bin/env python3
"""
dgt_cdd_client.py

Minimal CI-oriented client for Portugal's DGT (Direcao-Geral do Territorio)
Centro de Dados (CDD) LiDAR archive -- national MDT (bare-earth DTM) and MDS
(DSM) at 50cm/2m, plus raw LAZ point clouds, CC-BY 4.0.

There is no official public API yet (DGT has said one is coming). This talks
to the same undocumented backend that the CDD website's own frontend uses:
a Keycloak-protected STAC search API. The endpoint shapes here are inferred
from the community-maintained QGIS plugin/script "DGT CDD Downloader"
(github.com/qgispt/dgtcd_downer, GPL-2.0) -- credit to that project for
having reverse-engineered the auth flow; this is an independent, trimmed
reimplementation aimed at non-interactive CI use (env-var credentials,
single bbox, JSON summary on stdout) rather than interactive/QGIS use.

Auth: free account at https://cdd.dgterritorio.gov.pt/ (email-confirmed,
access granted immediately) -- same shape as Sweden/Finland's API-key gate.

Usage:
  export DGT_CDD_EMAIL="you@example.com"
  export DGT_CDD_PASSWORD="********"
  python3 dgt_cdd_client.py \
      --bbox -9.05 38.60 -9.00 38.65 \
      --collections MDT-50cm MDS-50cm \
      --output-dir ./out/portugal_lidar

Requires: requests
"""

import argparse
import os
import sys
import time
import urllib.parse
from html.parser import HTMLParser

import requests

AUTH_BASE = "https://auth.cdd.dgterritorio.gov.pt/realms/dgterritorio/protocol/openid-connect"
MAIN_SITE = "https://cdd.dgterritorio.gov.pt"
REDIRECT_URI = "https://cdd.dgterritorio.gov.pt/auth/callback"
CLIENT_ID = "aai-oidc-dgt"
STAC_SEARCH_URL = "https://cdd.dgterritorio.gov.pt/dgt-be/v1/search"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) dgt-cdd-client/1.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
}


class KeycloakLoginFormParser(HTMLParser):
    """Extracts the hidden fields + POST target from Keycloak's login page."""

    def __init__(self):
        super().__init__()
        self.form_action = None
        self.hidden_fields = {}
        self._in_form = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form" and a.get("id") == "kc-form-login":
            self._in_form = True
            self.form_action = a.get("action")
        elif tag == "input" and self._in_form and a.get("type") == "hidden":
            name = a.get("name")
            if name:
                self.hidden_fields[name] = a.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form":
            self._in_form = False


class DGTAuthError(RuntimeError):
    pass


def authenticate(email: str, password: str) -> requests.Session:
    """Runs the OIDC/Keycloak login flow and returns an authenticated session."""
    session = requests.Session()
    session.headers.update(HEADERS)

    # 1. Prime session cookies against the main site.
    r = session.get(MAIN_SITE, timeout=30)
    r.raise_for_status()

    # 2. Kick off the OIDC auth code flow -> lands on Keycloak's login page.
    auth_params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": "openid profile email",
    }
    r = session.get(f"{AUTH_BASE}/auth?{urllib.parse.urlencode(auth_params)}", timeout=30)
    r.raise_for_status()

    # 3. Parse the login form's hidden fields + POST target.
    parser = KeycloakLoginFormParser()
    parser.feed(r.text)
    if not parser.form_action:
        raise DGTAuthError(
            "Could not locate the Keycloak login form -- DGT may have changed "
            "their auth pages. Check https://cdd.dgterritorio.gov.pt/ manually."
        )

    login_url = parser.form_action
    if login_url.startswith("/"):
        login_url = f"https://auth.cdd.dgterritorio.gov.pt{login_url}"

    payload = dict(parser.hidden_fields)
    payload.update({"username": email, "password": password})

    # 4. Submit credentials; a successful login redirects back to MAIN_SITE.
    r = session.post(
        login_url,
        data=payload,
        headers={
            **HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://auth.cdd.dgterritorio.gov.pt",
            "Referer": r.url,
        },
        allow_redirects=True,
        timeout=30,
    )
    r.raise_for_status()

    if not r.url.startswith(MAIN_SITE):
        raise DGTAuthError(
            "Login did not redirect back to the CDD site -- check credentials, "
            "or DGT_CDD_EMAIL / DGT_CDD_PASSWORD may be wrong/expired."
        )

    # 5. Confirm the session actually works against the STAC API.
    probe = session.post(STAC_SEARCH_URL, json={"bbox": [-9.0, 38.0, -8.9, 38.1], "limit": 1}, timeout=30)
    if probe.status_code != 200:
        raise DGTAuthError(f"STAC probe failed with HTTP {probe.status_code} after login.")

    return session


def search(session: requests.Session, bbox, collections=None, limit=1000):
    payload = {"bbox": bbox, "limit": limit}
    if collections:
        payload["collections"] = collections
    r = session.post(STAC_SEARCH_URL, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


def iter_assets(stac_response):
    """Yields (collection, item_id, url, content_type) for every asset found."""
    for feature in stac_response.get("features", []):
        collection = feature.get("collection", "unknown")
        item_id = feature.get("id", "item")
        for asset in feature.get("assets", {}).values():
            url = asset.get("href")
            if url:
                yield collection, item_id, url, asset.get("type", "")


EXT_BY_MIME = {
    "image/tiff; application=geotiff": ".tif",
    "image/tiff": ".tif",
    "application/vnd.laszip": ".laz",
}


def download(session: requests.Session, url: str, dest_path: str, retries=3):
    if os.path.exists(dest_path):
        return "skipped"
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            with session.get(url, stream=True, timeout=60) as r:
                if r.headers.get("Content-Type", "").lower().startswith("text/html"):
                    raise DGTAuthError(f"Got HTML instead of data for {url} -- session likely expired.")
                r.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 16):
                        if chunk:
                            f.write(chunk)
            return "downloaded"
        except (requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError, requests.exceptions.Timeout):
            if attempt == retries:
                raise
            time.sleep(5 * attempt)


def main():
    ap = argparse.ArgumentParser(description="Non-interactive DGT CDD client for CI.")
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"), required=True)
    ap.add_argument("--collections", nargs="*", default=None, help="e.g. MDT-50cm MDS-50cm LAZ")
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--delay", type=float, default=1.0, help="Seconds between downloads (be polite to DGT's servers)")
    args = ap.parse_args()

    email = os.environ.get("DGT_CDD_EMAIL")
    password = os.environ.get("DGT_CDD_PASSWORD")
    if not email or not password:
        sys.exit("ERROR: set DGT_CDD_EMAIL and DGT_CDD_PASSWORD environment variables "
                  "(register free at https://cdd.dgterritorio.gov.pt/).")

    print("Authenticating with DGT CDD...", file=sys.stderr)
    session = authenticate(email, password)
    print("Authenticated.", file=sys.stderr)

    print(f"Searching bbox={args.bbox} collections={args.collections or 'all'}...", file=sys.stderr)
    result = search(session, args.bbox, collections=args.collections)

    downloaded, skipped = 0, 0
    for collection, item_id, url, mime in iter_assets(result):
        ext = EXT_BY_MIME.get(mime, os.path.splitext(url)[1] or ".bin")
        dest = os.path.join(args.output_dir, collection, f"{item_id}{ext}")
        status = download(session, url, dest)
        print(f"  [{status}] {collection}/{item_id}{ext}", file=sys.stderr)
        if status == "downloaded":
            downloaded += 1
            time.sleep(args.delay)
        else:
            skipped += 1

    print(f"Done. downloaded={downloaded} skipped={skipped}", file=sys.stderr)
    print(f'{{"downloaded": {downloaded}, "skipped": {skipped}, "output_dir": "{args.output_dir}"}}')


if __name__ == "__main__":
    main()
