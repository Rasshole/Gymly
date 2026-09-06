#!/usr/bin/env python3
"""
France Phase 3: Address recovery for Keepcool, Elancia, Vita Liberté.
Scrapes official club pages for addresses, then geocodes via Nominatim.
"""

import json
import re
import time
import urllib.request
import urllib.error
import urllib.parse
import hashlib
import os
import unicodedata

STAGING_PATH = "data/france/france_centers_staging.json"
GEOCODE_CACHE_PATH = "data/france/france_geocode_cache.json"

FRANCE_BBOX = {"lat_min": 41.3, "lat_max": 51.1, "lng_min": -5.2, "lng_max": 9.6}

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def slugify(text):
    text = text.lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r"[''`]", "", text)
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text

def fetch_url(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except (urllib.error.HTTPError, urllib.error.URLError, Exception) as e:
        return None

def extract_address_from_keepcool_page(html, club_name):
    """Extract address from Keepcool FAQ section on club pages."""
    results = {}
    
    # Look for "Où se trouve" FAQ answer which typically has full address
    patterns = [
        r'(?:situé|située|situe)\s+(?:au\s+)?(\d+[\s,]*(?:bis|ter)?\s*(?:rue|avenue|boulevard|place|allée|chemin|impasse|cours|passage|route|quai|square|rond-point|parvis|voie|esplanade|promenade)[^,\n]{3,60}),?\s*(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\-\s]+)',
        r'(?:situé|située|situe)\s+(?:au\s+)?([^,\n]{5,80}),?\s*(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\-\s]+)',
        r'(\d+[\s,]*(?:bis|ter)?\s*(?:rue|avenue|boulevard|place|allée|chemin|impasse|cours|passage|route|quai|square|rond-point|parvis|voie|esplanade|promenade)[^,\n]{3,60}),?\s*(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\-\s]+)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            addr, postal, city = matches[0]
            addr = addr.strip().rstrip(',')
            city = city.strip().rstrip('.')
            if len(postal) == 5 and postal[0] in '01234567890':
                results['address'] = addr
                results['postal_code'] = postal
                results['city_extracted'] = city
                break
    
    # Also try to find address in simpler format: "rue X, City"
    if not results:
        m = re.search(r'(?:rue|avenue|boulevard|place|allée|chemin|impasse|cours|passage|route|quai)\s+[^,\n]{3,50},\s*(?:Centre Commercial[^,]*,\s*)?(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\-\s]+)', html, re.IGNORECASE)
        if m:
            # Get the full match context
            start = max(0, m.start() - 50)
            context = html[start:m.end()]
            addr_m = re.search(r'(\d*\s*(?:rue|avenue|boulevard|place|allée|chemin|impasse|cours|passage|route|quai)[^,\n]{3,50})', context, re.IGNORECASE)
            if addr_m:
                results['address'] = addr_m.group(1).strip()
                results['postal_code'] = m.group(1)
                results['city_extracted'] = m.group(2).strip().rstrip('.')
    
    # Try to get address without number (e.g. "rue du Stand, Centre Commercial...")
    if not results:
        m = re.search(r'((?:rue|avenue|boulevard|place|allée|chemin)\s+[^,\n]{3,40}),\s*(\d{5})\s+([A-ZÀ-Ü][a-zà-ü\-\s]+)', html, re.IGNORECASE)
        if m:
            results['address'] = m.group(1).strip()
            results['postal_code'] = m.group(2)
            results['city_extracted'] = m.group(3).strip().rstrip('.')

    return results

def geocode_nominatim(address, postal_code, city, country="France", cache=None):
    """Geocode using Nominatim with caching."""
    query = f"{address}, {postal_code} {city}, {country}"
    cache_key = hashlib.md5(query.encode()).hexdigest()
    
    if cache and cache_key in cache:
        cached = cache[cache_key]
        return cached.get('lat'), cached.get('lng'), cached.get('display_name', ''), 'cached'
    
    time.sleep(1.1)  # Nominatim rate limit
    
    params = urllib.parse.urlencode({
        'q': query,
        'format': 'json',
        'addressdetails': 1,
        'limit': 1,
        'countrycodes': 'fr'
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Gymly-AddressRecovery/1.0 (patrick@gymly.com)'
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        if cache is not None:
            cache[cache_key] = {'lat': None, 'lng': None, 'error': str(e)}
        return None, None, '', 'error'
    
    if not data:
        if cache is not None:
            cache[cache_key] = {'lat': None, 'lng': None, 'no_result': True}
        return None, None, '', 'no_result'
    
    lat = float(data[0]['lat'])
    lng = float(data[0]['lon'])
    display = data[0].get('display_name', '')
    
    # Validate within France bbox
    if not (FRANCE_BBOX['lat_min'] <= lat <= FRANCE_BBOX['lat_max'] and 
            FRANCE_BBOX['lng_min'] <= lng <= FRANCE_BBOX['lng_max']):
        if cache is not None:
            cache[cache_key] = {'lat': lat, 'lng': lng, 'display_name': display, 'rejected': 'outside_france'}
        return None, None, display, 'outside_france'
    
    if cache is not None:
        cache[cache_key] = {'lat': lat, 'lng': lng, 'display_name': display}
    
    return lat, lng, display, 'ok'


def recover_keepcool(data, cache):
    """Recover addresses for Keepcool clubs."""
    keepcool = [d for d in data if d.get('chain') == 'Keepcool' and d.get('import_category') != 'READY_TO_IMPORT']
    print(f"\n=== KEEPCOOL RECOVERY: {len(keepcool)} clubs ===")
    
    recovered = 0
    geocoded = 0
    failed_urls = []
    
    for i, club in enumerate(keepcool):
        name = club['name']
        loc = name.replace('Keepcool ', '').replace('KEEPCOOL ', '')
        
        # Generate URL slug variants
        base_slug = slugify(loc)
        # Some known transformations
        slug_variants = [base_slug]
        # Try without trailing parts (e.g. "nice-garibaldi" might be just on a different page)
        parts = base_slug.split('-')
        if len(parts) > 1:
            slug_variants.append('-'.join(parts[:1]))  # just city
        
        html = None
        used_url = None
        for slug in slug_variants:
            url = f"https://www.keepcool.fr/salle-de-sport/{slug}"
            html = fetch_url(url)
            if html:
                used_url = url
                break
            time.sleep(0.5)
        
        if not html:
            failed_urls.append((name, base_slug))
            if (i + 1) % 20 == 0:
                print(f"  Progress: {i+1}/{len(keepcool)}, recovered: {recovered}")
            continue
        
        addr_info = extract_address_from_keepcool_page(html, name)
        
        if addr_info.get('address'):
            club['address'] = addr_info['address']
            if addr_info.get('postal_code'):
                club['postal_code'] = addr_info['postal_code']
            if addr_info.get('city_extracted'):
                club['city'] = addr_info['city_extracted']
            club['source_url'] = used_url
            recovered += 1
            
            # Geocode
            lat, lng, display, status = geocode_nominatim(
                club['address'], club.get('postal_code', ''), club.get('city', ''),
                cache=cache
            )
            if lat and lng:
                club['lat'] = lat
                club['lng'] = lng
                club['coord_source'] = 'nominatim'
                club['geocode_status'] = 'ok'
                club['geocode_display'] = display
                club['import_category'] = 'READY_TO_IMPORT'
                club['verification_status'] = 'VERIFIED_CURRENT'
                club['is_active'] = True
                club['notes'] = 'phase3_recovered; official_page'
                geocoded += 1
            else:
                club['geocode_status'] = status
                club['import_category'] = 'NEEDS_COORDINATES'
                club['notes'] = f'phase3_address_found; geocode_{status}'
        else:
            # Page loaded but no address found
            failed_urls.append((name, f"no_address_on_{base_slug}"))
        
        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{len(keepcool)}, recovered: {recovered}, geocoded: {geocoded}")
        
        time.sleep(0.3)
    
    print(f"\n  KEEPCOOL RESULTS: recovered={recovered}, geocoded={geocoded}, failed={len(keepcool)-recovered}")
    print(f"  Failed URLs (first 10): {failed_urls[:10]}")
    return recovered, geocoded


def recover_elancia(data, cache):
    """Recover addresses for Elancia clubs."""
    elancia = [d for d in data if d.get('chain') == 'Elancia' and d.get('import_category') != 'READY_TO_IMPORT']
    print(f"\n=== ELANCIA RECOVERY: {len(elancia)} clubs ===")
    
    recovered = 0
    geocoded = 0
    
    # Try the main site first
    html = fetch_url("https://www.elancia.fr/nos-salles")
    if not html:
        html = fetch_url("https://www.elancia.fr/clubs")
    if not html:
        html = fetch_url("https://www.elancia.fr/salles-de-sport")
    
    # Try individual club pages
    for i, club in enumerate(elancia):
        name = club['name']
        loc = name.replace('Elancia ', '').replace('ELANCIA ', '')
        slug = slugify(loc)
        
        urls_to_try = [
            f"https://www.elancia.fr/salle-de-sport/{slug}",
            f"https://www.elancia.fr/club/{slug}",
            f"https://www.elancia.fr/salles/{slug}",
            f"https://www.elancia.fr/{slug}",
        ]
        
        html = None
        used_url = None
        for url in urls_to_try:
            html = fetch_url(url)
            if html:
                used_url = url
                break
            time.sleep(0.3)
        
        if html:
            # Try same patterns as keepcool
            addr_info = extract_address_from_keepcool_page(html, name)
            if addr_info.get('address'):
                club['address'] = addr_info['address']
                if addr_info.get('postal_code'):
                    club['postal_code'] = addr_info['postal_code']
                if addr_info.get('city_extracted'):
                    club['city'] = addr_info['city_extracted']
                club['source_url'] = used_url
                recovered += 1
                
                lat, lng, display, status = geocode_nominatim(
                    club['address'], club.get('postal_code', ''), club.get('city', ''),
                    cache=cache
                )
                if lat and lng:
                    club['lat'] = lat
                    club['lng'] = lng
                    club['coord_source'] = 'nominatim'
                    club['geocode_status'] = 'ok'
                    club['geocode_display'] = display
                    club['import_category'] = 'READY_TO_IMPORT'
                    club['verification_status'] = 'VERIFIED_CURRENT'
                    club['is_active'] = True
                    club['notes'] = 'phase3_recovered; official_page'
                    geocoded += 1
                else:
                    club['geocode_status'] = status
                    club['import_category'] = 'NEEDS_COORDINATES'
        
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i+1}/{len(elancia)}, recovered: {recovered}")
        time.sleep(0.3)
    
    print(f"\n  ELANCIA RESULTS: recovered={recovered}, geocoded={geocoded}, failed={len(elancia)-recovered}")
    return recovered, geocoded


def recover_vita_liberte(data, cache):
    """Recover addresses for Vita Liberté clubs."""
    vita = [d for d in data if d.get('chain') == 'Vita Liberté' and d.get('import_category') != 'READY_TO_IMPORT']
    print(f"\n=== VITA LIBERTÉ RECOVERY: {len(vita)} clubs ===")
    
    recovered = 0
    geocoded = 0
    
    for i, club in enumerate(vita):
        name = club['name']
        loc = name.replace('Vita Liberté ', '').replace('Vita Liberte ', '').replace('VITA LIBERTÉ ', '')
        slug = slugify(loc)
        
        urls_to_try = [
            f"https://www.vitaliberte.fr/salle-de-sport/{slug}",
            f"https://www.vitaliberte.fr/club/{slug}",
            f"https://www.vitaliberte.fr/salles/{slug}",
            f"https://www.vitaliberte.fr/{slug}",
            f"https://www.vitaliberte.fr/salle-de-sport-{slug}",
        ]
        
        html = None
        used_url = None
        for url in urls_to_try:
            html = fetch_url(url)
            if html:
                used_url = url
                break
            time.sleep(0.3)
        
        if html:
            addr_info = extract_address_from_keepcool_page(html, name)
            if addr_info.get('address'):
                club['address'] = addr_info['address']
                if addr_info.get('postal_code'):
                    club['postal_code'] = addr_info['postal_code']
                if addr_info.get('city_extracted'):
                    club['city'] = addr_info['city_extracted']
                club['source_url'] = used_url
                recovered += 1
                
                lat, lng, display, status = geocode_nominatim(
                    club['address'], club.get('postal_code', ''), club.get('city', ''),
                    cache=cache
                )
                if lat and lng:
                    club['lat'] = lat
                    club['lng'] = lng
                    club['coord_source'] = 'nominatim'
                    club['geocode_status'] = 'ok'
                    club['geocode_display'] = display
                    club['import_category'] = 'READY_TO_IMPORT'
                    club['verification_status'] = 'VERIFIED_CURRENT'
                    club['is_active'] = True
                    club['notes'] = 'phase3_recovered; official_page'
                    geocoded += 1
                else:
                    club['geocode_status'] = status
                    club['import_category'] = 'NEEDS_COORDINATES'
        
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i+1}/{len(vita)}, recovered: {recovered}")
        time.sleep(0.3)
    
    print(f"\n  VITA LIBERTÉ RESULTS: recovered={recovered}, geocoded={geocoded}, failed={len(vita)-recovered}")
    return recovered, geocoded


def recover_remaining(data, cache):
    """One pass on remaining NEEDS_COORDINATES/NEEDS_REVIEW with addresses but no coords."""
    remaining = [d for d in data if d.get('import_category') in ('NEEDS_COORDINATES', 'NEEDS_REVIEW') 
                 and d.get('address') and d.get('postal_code') and d.get('city')
                 and d.get('chain') not in ('Keepcool', 'Elancia', 'Vita Liberté')]
    
    print(f"\n=== REMAINING RECOVERY: {len(remaining)} with address but no coords ===")
    geocoded = 0
    
    for club in remaining:
        if club.get('lat') and club.get('lng'):
            continue
        lat, lng, display, status = geocode_nominatim(
            club['address'], club['postal_code'], club['city'], cache=cache
        )
        if lat and lng:
            club['lat'] = lat
            club['lng'] = lng
            club['coord_source'] = 'nominatim'
            club['geocode_status'] = 'ok'
            club['geocode_display'] = display
            club['import_category'] = 'READY_TO_IMPORT'
            club['verification_status'] = 'VERIFIED_CURRENT'
            club['is_active'] = True
            if not club.get('notes'):
                club['notes'] = 'phase3_geocoded'
            else:
                club['notes'] += '; phase3_geocoded'
            geocoded += 1
    
    print(f"  REMAINING RESULTS: geocoded={geocoded}")
    return geocoded


if __name__ == "__main__":
    os.chdir("/Users/patrickgarcia/Desktop/Gymly/Gymly-1")
    
    data = load_json(STAGING_PATH)
    cache = load_json(GEOCODE_CACHE_PATH) if os.path.exists(GEOCODE_CACHE_PATH) else {}
    
    print(f"Loaded {len(data)} entries, cache has {len(cache)} entries")
    
    kc_rec, kc_geo = recover_keepcool(data, cache)
    save_json(STAGING_PATH, data)
    save_json(GEOCODE_CACHE_PATH, cache)
    print("  [saved intermediate]")
    
    el_rec, el_geo = recover_elancia(data, cache)
    save_json(STAGING_PATH, data)
    save_json(GEOCODE_CACHE_PATH, cache)
    print("  [saved intermediate]")
    
    vl_rec, vl_geo = recover_vita_liberte(data, cache)
    save_json(STAGING_PATH, data)
    save_json(GEOCODE_CACHE_PATH, cache)
    print("  [saved intermediate]")
    
    rem_geo = recover_remaining(data, cache)
    save_json(STAGING_PATH, data)
    save_json(GEOCODE_CACHE_PATH, cache)
    
    print("\n\n=== FINAL SUMMARY ===")
    print(f"Keepcool: {kc_rec} addresses recovered, {kc_geo} geocoded")
    print(f"Elancia: {el_rec} addresses recovered, {el_geo} geocoded")
    print(f"Vita Liberté: {vl_rec} addresses recovered, {vl_geo} geocoded")
    print(f"Remaining: {rem_geo} additionally geocoded")
    
    from collections import Counter
    cats = Counter(d['import_category'] for d in data)
    print(f"\nFinal categories:")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    
    brands_ready = Counter(d.get('chain', d.get('brand', '?')) for d in data if d['import_category'] == 'READY_TO_IMPORT')
    print(f"\nREADY_TO_IMPORT by brand:")
    for k, v in sorted(brands_ready.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
