#!/usr/bin/env python3
"""
France Phase 2 — Close major coverage gaps.
Discovers new chains, geocodes L'Orange Bleue + Fitness Park unresolved,
merges into france_centers_staging.json.

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/france"
STAGING = OUT / "france_centers_staging.json"
CACHE = OUT / "france_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"

ctx = ssl.create_default_context()
UA = "GymlyFranceGeocoder/2.0 (catalog research; accuracy over coverage; no fallback centroids)"

FR_METRO_BOUNDS = (41.3, 51.1, -5.2, 9.6)
FR_OVERSEAS = {
    "Guadeloupe": (15.8, 16.6, -62.0, -60.9),
    "Martinique": (14.3, 14.9, -61.3, -60.8),
    "Guyane": (2.1, 5.8, -54.6, -51.6),
    "Réunion": (-21.4, -20.8, 55.2, 55.9),
    "Mayotte": (-13.1, -12.5, 44.9, 45.4),
}


def make_id(brand, address, postal, city, source_url="", name=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join([
            (brand or "").strip().lower(),
            (city or "").strip().lower(),
            (name or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            "france",
        ])
    else:
        key = "|".join([
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            (city or "").strip().lower(),
            "france",
        ])
    return "fr_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def fr_postal(s) -> str:
    if s is None:
        return ""
    raw = str(s).strip()
    m = re.search(r"\b(\d{5})\b", raw)
    return m.group(1) if m else ""


def in_france_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    lo, hi, w, e = FR_METRO_BOUNDS
    if lo <= lat <= hi and w <= lng <= e:
        return True
    for bounds in FR_OVERSEAS.values():
        olo, ohi, ow, oe = bounds
        if olo <= lat <= ohi and ow <= lng <= oe:
            return True
    return False


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "fr",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ").replace("é", "e").replace("è", "e").replace("ê", "e")
    s = s.replace("ë", "e").replace("à", "a").replace("â", "a").replace("ç", "c")
    s = s.replace("î", "i").replace("ï", "i").replace("ô", "o").replace("ù", "u")
    s = s.replace("û", "u").replace("œ", "oe").replace("æ", "ae")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def score_candidate(item, street, postal, city):
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_france_bbox(lat, lng):
        return None, ["outside_france"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "fr":
        return None, ["not_fr"], lat, lng
    t = (item.get("type") or item.get("class") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {
        "house", "building", "yes", "retail", "commercial", "industrial",
        "gym", "fitness_centre", "sports_centre",
    }:
        return None, ["coarse_class:" + osm_class], lat, lng

    score = 0
    reasons = []
    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc).upper()
    postal_n = re.sub(r"\s+", "", str(postal or "")).upper()
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:3] == postal_n[:3]:
        score += 1
        reasons.append("postal_soft")

    city_n = norm(city)
    display = (item.get("display_name") or "").lower()
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb", "city_district")
    )
    if city_n and (city_n in city_fields or city_n in norm(display)):
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    if road and street_n and (
        road in street_n or street_n in norm(display)
        or any(tok and tok in road for tok in street_n.split() if len(tok) > 4)
    ):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")

    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache):
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        return r
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return r
    street = r.get("address") or ""
    postal = r.get("postal_code") or ""
    city = r.get("city") or ""
    if not street or not postal or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, France",
        f"{street}, {postal}, France",
        f"{street}, {city}, France",
    ]
    for q in queries:
        try:
            items = nominatim(q, cache)
        except Exception:
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
            if sc is not None:
                scored.append((sc, reasons, lat, lng, it.get("display_name")))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
                r["lat"] = r["lng"] = None
                return r
        top = scored[0]
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["lat"] = r["lng"] = None
    return r


# ─── CHAIN DISCOVERY DATA ────────────────────────────────────────────────────

def parse_on_air_clubs():
    """Parse ON AIR Fitness clubs from scraped club page data."""
    clubs = []
    raw_data = [
        ("Aix La Pioline", "190 Rue Bastide-de-Verdaches", "13290", "Aix-en-Provence"),
        ("Aix La Rotonde", "6 Avenue des Belges", "13100", "Aix-en-Provence"),
        ("Amiens", "3 Avenue Paul Claudel", "80480", "Dury"),
        ("Angers Saint-Serge", "9 Allée du Président Chirac", "49100", "Angers"),
        ("Annecy Centre", "15 Rue de la Gare", "74000", "Annecy"),
        ("Argenteuil", "13 Boulevard des Martyrs de Châteaubriant", "95100", "Argenteuil"),
        ("Arnouville", "11 Rue Jean Jaurès", "95400", "Arnouville"),
        ("Arras", "62 Avenue Winston Churchill", "62000", "Arras"),
        ("Beauvais", "2 Rue Arago", "60000", "Beauvais"),
        ("Besançon", "226C Rue de Dole", "25000", "Besançon"),
        ("Béziers", "97 Bd de la Liberté", "34500", "Béziers"),
        ("Bobigny", "15-35 Avenue Henri Barbusse", "93000", "Bobigny"),
        ("Bondy", "3-5 Rue Auguste Polissard", "93140", "Bondy"),
        ("Bordeaux Bassins à Flot", "171 Rue Lucien Faure", "33300", "Bordeaux"),
        ("Bordeaux Belvédère", "7 Rue de la Garonne", "33000", "Bordeaux"),
        ("Boulogne-Billancourt Sud", "38 Quai Georges Gorse", "92100", "Boulogne-Billancourt"),
        ("Boulogne-sur-Mer", "64 Boulevard de la Liane", "62360", "Saint-Léonard"),
        ("Bourgoin-Jallieu", "8 Rue Édouard Branly", "38300", "Bourgoin-Jallieu"),
        ("Bron", "67 Rue du Parc", "69500", "Bron"),
        ("Cagnes-sur-Mer", "119 Avenue des Alpes", "06800", "Cagnes-sur-Mer"),
        ("Carré Sénart", "Centre Commercial Westfield Carré Sénart", "77127", "Lieusaint"),
        ("Chalon-sur-Saône", "4 Route de Sevrey", "71100", "Lux"),
        ("Chambly", "Rue Thomas Edison", "60230", "Chambly"),
        ("Châtillon", "51 Boulevard de la Liberté", "92320", "Châtillon"),
        ("Chaville", "1356 Avenue Roger Salengro", "92370", "Chaville"),
        ("Chelles", "16 Avenue Sylvie", "77500", "Chelles"),
        ("Chennevières-sur-Marne", "7 Avenue de Pince Vent", "94430", "Chennevières-sur-Marne"),
        ("Chilly-Mazarin", "8 Avenue du Président François Mitterrand", "91380", "Chilly-Mazarin"),
        ("Clermont La Pardieu", "4 Rue Eric de Cromières", "63000", "Clermont-Ferrand"),
        ("Clermont-Ferrand Jaude", "5 Rue d'Assas", "63000", "Clermont-Ferrand"),
        ("Clichy", "75 Rue Henri Barbusse", "92210", "Clichy"),
        ("Corbeil-Essonnes", "2 Rue de Seine", "91100", "Corbeil-Essonnes"),
        ("Cormontreuil", "3 Rue des Blancs Monts", "51350", "Cormontreuil"),
        ("Cranves-Sales", "1193 Rte des Fontaines", "74380", "Cranves-Sales"),
        ("Décines", "213 Avenue Franklin Roosevelt", "69150", "Décines-Charpieu"),
        ("Dreux", "2 Rue Georges Besse", "28100", "Dreux"),
        ("Évry", "14 Place des Terrasses de l'Agora", "91000", "Évry"),
        ("Franconville", "2 Rue André Citroën", "95130", "Franconville"),
        ("Garges-lès-Gonesse", "43 Boulevard de la Muette", "95140", "Garges-lès-Gonesse"),
        ("Goussainville", "1 Rue Ferdinand de Lesseps", "95190", "Goussainville"),
        ("Grenoble Gambetta", "48 Boulevard Gambetta", "38000", "Grenoble"),
        ("Grenoble SMH", "76 Avenue Gabriel Péri", "38400", "Saint-Martin-d'Hères"),
        ("Guadeloupe La Jaille", "ZA La Jaille", "97122", "Baie-Mahault"),
        ("Ivry-sur-Seine", "78 Avenue Maurice Thorez", "94200", "Ivry-sur-Seine"),
        ("La Courneuve", "45 Boulevard Pasteur", "93120", "La Courneuve"),
        ("La Défense", "15 Parvis de La Défense", "92092", "Puteaux"),
        ("La Réunion Saint-Denis", "1 Rue de la Fraternité", "97490", "Saint-Denis"),
        ("La Réunion Saint-Pierre", "9 Rue des Olivines", "97410", "Saint-Pierre"),
        ("La Valette-du-Var", "23 Avenue des Frères Lumière", "83160", "La Valette-du-Var"),
        ("La Ville-du-Bois", "1 Avenue de la Division Leclerc", "91620", "La Ville-du-Bois"),
        ("Le Blanc-Mesnil", "137 Avenue Charles Floquet", "93150", "Le Blanc-Mesnil"),
        ("Le Blanc-Mesnil Sud", "87-95 Avenue Paul Vaillant Couturier", "93150", "Le Blanc-Mesnil"),
        ("Le Cannet", "982 Avenue du Campon", "06110", "Le Cannet"),
        ("Le Havre La Nef", "51 Rue Pierre Semard", "76600", "Le Havre"),
        ("Le Pré-Saint-Gervais", "17 Rue d'Estienne d'Orves", "93310", "Le Pré-Saint-Gervais"),
        ("Lempdes", "19 Avenue de l'Europe", "63370", "Lempdes"),
        ("Levallois Neuilly", "140 Rue Danton", "92300", "Levallois-Perret"),
        ("Limoges", "27 Rue Auguste Comte", "87280", "Limoges"),
        ("Limoges Centre", "Place Jourdan", "87000", "Limoges"),
        ("Lons", "123 Boulevard Charles de Gaulle", "64140", "Lons"),
        ("Lyon Brotteaux", "34 Rue du Professeur Weill", "69006", "Lyon"),
        ("Lyon Cordeliers", "10 Rue du Président Carnot", "69002", "Lyon"),
        ("Lyon Gerland", "60 Avenue Tony Garnier", "69007", "Lyon"),
        ("Lyon Jean Macé", "81 Rue Parmentier", "69007", "Lyon"),
        ("Lyon Saxe Gambetta", "3 Place Aristide Briand", "69003", "Lyon"),
        ("Maisons-Alfort", "298 Rue Jean Jaurès", "94700", "Maisons-Alfort"),
        ("Malakoff", "6/12 Avenue Pierre Brossolette", "92240", "Malakoff"),
        ("Marseille La Joliette", "45 Boulevard des Dames", "13002", "Marseille"),
        ("Martinique Le Lamentin", "Centre commercial Place d'Armes", "97232", "Le Lamentin"),
        ("Meaux", "40 Rue François de Tessan", "77100", "Meaux"),
        ("Melun", "44 Route Départementale 306", "77240", "Vert-Saint-Denis"),
        ("Mérignac", "11 rue Georges Ohm", "33700", "Mérignac"),
        ("Metz Centre", "33 Rue Serpenoise", "57000", "Metz"),
        ("Mondeville", "67 Rue Charles Coulomb", "14120", "Mondeville"),
        ("Montauban", "700 Avenue de Paris", "82000", "Montauban"),
        ("Montigny-Le-Bretonneux", "4 Passage Georges Méliès", "78180", "Montigny-le-Bretonneux"),
        ("Montpellier Celleneuve", "129 Avenue de Lodève", "34070", "Montpellier"),
        ("Montpellier Odysseum", "75 boulevard Télémaque", "34000", "Montpellier"),
        ("Montreuil", "278 rue de Rosny", "93100", "Montreuil"),
        ("Montrouge", "99 Avenue Verdier", "92120", "Montrouge"),
        ("Morangis", "80 Av. Charles de Gaulle", "91420", "Morangis"),
        ("Nancy", "144 Boulevard Lobau", "54000", "Nancy"),
        ("Nanterre", "115 Rue du 11 Novembre", "92000", "Nanterre"),
        ("Nantes Centre", "18 Allée d'Orléans", "44000", "Nantes"),
        ("Nice Arenas", "106 Boulevard René Cassin", "06200", "Nice"),
        ("Nîmes 7 Collines", "42 Rue du Forez", "30000", "Nîmes"),
        ("Nîmes Caremeau", "Chemin Jules Lissajous", "30000", "Nîmes"),
        ("Noyelles-Godault", "1 route Nationale 43", "62950", "Noyelles-Godault"),
        ("O'Parinor", "Centre Commercial O'Parinor", "93005", "Aulnay-sous-Bois"),
        ("Orléans Centre", "29 Boulevard Rocheplatte", "45000", "Orléans"),
        ("Paris 13 BNF", "93 Avenue de France", "75013", "Paris"),
        ("Paris Clignancourt", "25 Rue de Clignancourt", "75018", "Paris"),
        ("Paris Flandre", "119 Avenue de Flandre", "75019", "Paris"),
        ("Paris Montparnasse", "80 Avenue du Maine", "75014", "Paris"),
        ("Paris Voltaire", "172 boulevard Voltaire", "75011", "Paris"),
        ("Périgueux-Trélissac", "214 Avenue Michel Grandou", "24750", "Trélissac"),
        ("Plaisir", "1170 Avenue de Saint Germain", "78370", "Plaisir"),
        ("Poitiers", "93 Route de Gençay", "86000", "Poitiers"),
        ("Pontoise", "64 Chaussée Jules César", "95300", "Pontoise"),
        ("Rennes Saint-Grégoire", "L'Auge de Pierre", "35760", "Saint-Grégoire"),
        ("Roissy-en-Brie", "2 Rue de la Canarderie", "77680", "Roissy-en-Brie"),
        ("Roubaix Leers", "1 Avenue de l'Europe", "59115", "Leers"),
        ("Saint Jean de Vedas", "99 Avenue de la Condamine", "34430", "Saint-Jean-de-Védas"),
        ("Saint-Brice-sous-Forêt", "100 Rue de Paris", "95350", "Saint-Brice-sous-Forêt"),
        ("Saint-Maur-des-Fossés", "9 Boulevard Maurice Berteaux", "94100", "Saint-Maur-des-Fossés"),
        ("Saint-Maximin Creil", "311 rue de la Révolution Française", "60740", "Saint-Maximin"),
        ("Sainte-Geneviève-des-Bois", "8 rue Marie Laurencin", "91220", "Le Plessis-Pâté"),
        ("Sens", "14 Route de Voulx", "89100", "Sens"),
        ("Seynod", "153 Avenue d'Aix-les-Bains", "74600", "Seynod"),
        ("Stains", "70 Avenue Aristide Briand", "93240", "Stains"),
        ("Suresnes Puteaux", "4 Rue Curie", "92150", "Suresnes"),
        ("Toulouse Blagnac", "16 Rue Gustave Flaubert", "31700", "Blagnac"),
        ("Ulis 2", "Avenue de l'Aubrac", "91940", "Les Ulis"),
        ("Valence", "289 avenue de Romans", "26000", "Valence"),
        ("Valenciennes", "18 Rue de la Vieille Poissonnerie", "59300", "Valenciennes"),
        ("Vanves", "12 Avenue Pasteur", "92170", "Vanves"),
        ("Vélizy", "16-18 avenue Morane Saulnier", "78140", "Vélizy-Villacoublay"),
        ("Vichy", "35 Rue Lucas", "03200", "Vichy"),
        ("Villejuif", "137 Avenue de Paris", "94800", "Villejuif"),
        ("Villemoisson Sur Orge", "142 route de Corbeil", "91360", "Villemoisson-sur-Orge"),
        ("Villenave-d'Ornon", "5 Avenue du 7ème Art", "33140", "Villenave-d'Ornon"),
        ("Vincennes", "12 Rue Robert Giraudineau", "94300", "Vincennes"),
        ("Viry-Châtillon", "81-83 Avenue du Général de Gaulle", "91170", "Viry-Châtillon"),
        ("Montgeron", "Rue du Lutin", "91230", "Montgeron"),
        ("Tourcoing", "56 Rue Nationale", "59200", "Tourcoing"),
    ]
    for name_suffix, address, postal, city in raw_data:
        clubs.append({
            "brand": "ON AIR Fitness",
            "name": f"ON AIR {name_suffix}",
            "address": address,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://onair-fitness.fr/club/",
            "phase": "france_phase2",
        })
    return clubs


def parse_keepcool_clubs():
    """Keepcool + Neoness clubs from official list."""
    clubs = []
    keepcool_raw = [
        ("Keepcool", "BOURG-EN-BRESSE", "01000", "Bourg-en-Bresse"),
        ("Keepcool", "MANOSQUE", "04100", "Manosque"),
        ("Keepcool", "BRIANCON", "05100", "Briançon"),
        ("Keepcool", "GAP", "05000", "Gap"),
        ("Keepcool", "CAGNES-SUR-MER", "06800", "Cagnes-sur-Mer"),
        ("Keepcool", "NICE ETOILE", "06000", "Nice"),
        ("Keepcool", "NICE GARIBALDI", "06300", "Nice"),
        ("Keepcool", "NICE GORBELLA", "06100", "Nice"),
        ("Keepcool", "NICE PROMENADE", "06000", "Nice"),
        ("Keepcool", "AUBENAS", "07200", "Aubenas"),
        ("Keepcool", "PAMIERS", "09100", "Pamiers"),
        ("Keepcool", "NARBONNE", "11100", "Narbonne"),
        ("Keepcool", "RODEZ", "12000", "Rodez"),
        ("Keepcool", "AIX-EN-PROVENCE CENTRE REPUBLIQUE", "13100", "Aix-en-Provence"),
        ("Keepcool", "AIX-EN-PROVENCE LA DURANNE", "13090", "Aix-en-Provence"),
        ("Keepcool", "AIX-EN-PROVENCE LA PIOLINE", "13290", "Aix-en-Provence"),
        ("Keepcool", "AIX-EN-PROVENCE LES MILLES", "13290", "Aix-en-Provence"),
        ("Keepcool", "AIX-EN-PROVENCE ROTONDE", "13100", "Aix-en-Provence"),
        ("Keepcool", "ARLES FOURCHON", "13200", "Arles"),
        ("Keepcool", "AUBAGNE", "13400", "Aubagne"),
        ("Keepcool", "ISTRES", "13800", "Istres"),
        ("Keepcool", "MARSEILLE 5ÈME", "13005", "Marseille"),
        ("Keepcool", "MARSEILLE CASTELLANE", "13006", "Marseille"),
        ("Keepcool", "MARSEILLE CHÂTEAU-GOMBERT", "13013", "Marseille"),
        ("Keepcool", "MARSEILLE CHUTES LAVIE", "13004", "Marseille"),
        ("Keepcool", "MARSEILLE CINQ AVENUES", "13004", "Marseille"),
        ("Keepcool", "MARSEILLE COURS JULIEN", "13006", "Marseille"),
        ("Keepcool", "MARSEILLE JOLIETTE", "13002", "Marseille"),
        ("Keepcool", "MARSEILLE LA VALENTINE", "13011", "Marseille"),
        ("Keepcool", "MARSEILLE LES OLIVES", "13013", "Marseille"),
        ("Keepcool", "MARSEILLE RABATAU", "13008", "Marseille"),
        ("Keepcool", "MARSEILLE SAINTE-ANNE", "13008", "Marseille"),
        ("Keepcool", "MARSEILLE VIEUX PORT", "13001", "Marseille"),
        ("Keepcool", "PLAN DE CAMPAGNE LES PENNES", "13170", "Les Pennes-Mirabeau"),
        ("Keepcool", "ROUSSET PEYNIER", "13790", "Rousset"),
        ("Keepcool", "SALON DE PROVENCE PELISSANNE", "13330", "Pélissanne"),
        ("Keepcool", "VENELLES", "13770", "Venelles"),
        ("Keepcool", "VENTABREN", "13122", "Ventabren"),
        ("Keepcool", "VITROLLES", "13127", "Vitrolles"),
        ("Keepcool", "COGNAC", "16100", "Cognac"),
        ("Keepcool", "LA ROCHELLE", "17000", "La Rochelle"),
        ("Keepcool", "ROCHEFORT", "17300", "Rochefort"),
        ("Keepcool", "SAINTES", "17100", "Saintes"),
        ("Keepcool", "BOURGES", "18000", "Bourges"),
        ("Keepcool", "BEAUNE", "21200", "Beaune"),
        ("Keepcool", "DIJON QUETIGNY", "21800", "Quetigny"),
        ("Keepcool", "DIJON VALMY", "21000", "Dijon"),
        ("Keepcool", "LANNION", "22300", "Lannion"),
        ("Keepcool", "PLÉRIN", "22190", "Plérin"),
        ("Keepcool", "TRÉGUEUX-SAINT-BRIEUC", "22950", "Trégueux"),
        ("Keepcool", "PERIGUEUX", "24000", "Périgueux"),
        ("Keepcool", "MONTÉLIMAR", "26200", "Montélimar"),
        ("Keepcool", "PIERRELATTE", "26700", "Pierrelatte"),
        ("Keepcool", "CHARTRES", "28000", "Chartres"),
        ("Keepcool", "DREUX", "28100", "Dreux"),
        ("Keepcool", "BREST GUIPAVAS", "29490", "Guipavas"),
        ("Keepcool", "BREST PLOUZANÉ", "29280", "Plouzané"),
        ("Keepcool", "BREST PORT", "29200", "Brest"),
        ("Keepcool", "GUILERS", "29820", "Guilers"),
        ("Keepcool", "LESNEVEN", "29260", "Lesneven"),
        ("Keepcool", "QUIMPER", "29000", "Quimper"),
        ("Keepcool", "ALÈS", "30100", "Alès"),
        ("Keepcool", "AVIGNON LES ANGLES", "30133", "Les Angles"),
        ("Keepcool", "BAGNOLS-SUR-CÈZE", "30200", "Bagnols-sur-Cèze"),
        ("Keepcool", "NIMES 7 COLLINES", "30900", "Nîmes"),
        ("Keepcool", "NÎMES CENTRE", "30000", "Nîmes"),
        ("Keepcool", "NIMES OUEST", "30900", "Nîmes"),
        ("Keepcool", "CARBONNE", "31390", "Carbonne"),
        ("Keepcool", "CAZÈRES", "31220", "Cazères"),
        ("Keepcool", "LABÈGE", "31670", "Labège"),
        ("Keepcool", "TOULOUSE ATLANTA", "31000", "Toulouse"),
        ("Keepcool", "TOULOUSE CAPITOLE", "31000", "Toulouse"),
        ("Keepcool", "TOULOUSE MATABIAU", "31000", "Toulouse"),
        ("Keepcool", "BORDEAUX CENTRE PARLEMENT", "33000", "Bordeaux"),
        ("Keepcool", "CENON", "33150", "Cenon"),
        ("Keepcool", "LA BRÈDE", "33650", "La Brède"),
        ("Keepcool", "LA TESTE", "33260", "La Teste-de-Buch"),
        ("Keepcool", "LE PIAN-MÉDOC", "33290", "Le Pian-Médoc"),
        ("Keepcool", "MERIGNAC CAPEYRON", "33700", "Mérignac"),
        ("Keepcool", "PESSAC", "33600", "Pessac"),
        ("Keepcool", "PODENSAC", "33720", "Podensac"),
        ("Keepcool", "SAINT-ANDRÉ-DE-CUBZAC", "33240", "Saint-André-de-Cubzac"),
        ("Keepcool", "SAINT-MÉDARD-EN-JALLES", "33160", "Saint-Médard-en-Jalles"),
        ("Keepcool", "AGDE", "34300", "Agde"),
        ("Keepcool", "BEZIERS", "34500", "Béziers"),
        ("Keepcool", "MONTPELLIER EUROMÉDECINE", "34090", "Montpellier"),
        ("Keepcool", "SAINT-JEAN-DE-VEDAS", "34430", "Saint-Jean-de-Védas"),
        ("Keepcool", "CESSON VIASILVA", "35510", "Cesson-Sévigné"),
        ("Keepcool", "RENNES COLOMBIER", "35000", "Rennes"),
        ("Keepcool", "CHAMBRAY-LÈS-TOURS", "37170", "Chambray-lès-Tours"),
        ("Keepcool", "CROLLES", "38920", "Crolles"),
        ("Keepcool", "GRENOBLE COMBOIRE", "38130", "Échirolles"),
        ("Keepcool", "GRENOBLE GAMBETTA", "38000", "Grenoble"),
        ("Keepcool", "GRENOBLE SAINT-MARTIN-D'HÈRES", "38400", "Saint-Martin-d'Hères"),
        ("Keepcool", "MONT-DE-MARSAN", "40000", "Mont-de-Marsan"),
        ("Keepcool", "FIRMINY", "42700", "Firminy"),
        ("Keepcool", "MONTBRISON", "42600", "Montbrison"),
        ("Keepcool", "ROANNE RIORGES", "42153", "Riorges"),
        ("Keepcool", "SAINT-ETIENNE", "42000", "Saint-Étienne"),
        ("Keepcool", "SAINT-ETIENNE LA FOUILLOUSE", "42480", "La Fouillouse"),
        ("Keepcool", "SORBIERS", "42290", "Sorbiers"),
        ("Keepcool", "LE PUY-EN-VELAY", "43000", "Le Puy-en-Velay"),
        ("Keepcool", "NANTES BEAUJOIRE", "44300", "Nantes"),
        ("Keepcool", "NANTES CENTRE HÔTEL-DIEU", "44000", "Nantes"),
        ("Keepcool", "NANTES CENTRE SAINT-MIHIEL", "44000", "Nantes"),
        ("Keepcool", "NANTES JULES VERNE", "44300", "Nantes"),
        ("Keepcool", "NANTES PÔLE SUD", "44200", "Nantes"),
        ("Keepcool", "NANTES RAGON", "44115", "Basse-Goulaine"),
        ("Keepcool", "NANTES ROUTE DE VANNES", "44100", "Nantes"),
        ("Keepcool", "PORNIC", "44210", "Pornic"),
        ("Keepcool", "SAINT-NAZAIRE", "44600", "Saint-Nazaire"),
        ("Keepcool", "ORLÉANS CENTRE", "45000", "Orléans"),
        ("Keepcool", "ORLÉANS FLEURY-LES-AUBRAIS", "45400", "Fleury-les-Aubrais"),
        ("Keepcool", "CAHORS", "46000", "Cahors"),
        ("Keepcool", "AGEN-BOÉ", "47550", "Boé"),
        ("Keepcool", "ANGERS CAPUCINS", "49100", "Angers"),
        ("Keepcool", "NANCY ARTEM", "54000", "Nancy"),
        ("Keepcool", "NANCY CENTRE COMMANDERIE", "54000", "Nancy"),
        ("Keepcool", "NANCY ESSEY", "54270", "Essey-lès-Nancy"),
        ("Keepcool", "NANCY GARE", "54000", "Nancy"),
        ("Keepcool", "LORIENT", "56100", "Lorient"),
        ("Keepcool", "METZ GARE", "57000", "Metz"),
        ("Keepcool", "METZ SAINT JULIEN", "57070", "Metz"),
        ("Keepcool", "METZ SUD", "57000", "Metz"),
        ("Keepcool", "SARREBOURG", "57400", "Sarrebourg"),
        ("Keepcool", "THIONVILLE", "57100", "Thionville"),
        ("Keepcool", "NEVERS", "58000", "Nevers"),
        ("Keepcool", "LE QUESNOY", "59530", "Le Quesnoy"),
        ("Keepcool", "LILLE", "59000", "Lille"),
        ("Keepcool", "LILLE CENTRE", "59800", "Lille"),
        ("Keepcool", "LILLE SOLFERINO", "59000", "Lille"),
        ("Keepcool", "VALENCIENNES", "59300", "Valenciennes"),
        ("Keepcool", "VILLENEUVE D'ASCQ", "59650", "Villeneuve-d'Ascq"),
        ("Keepcool", "CLERMONT FERRAND", "63000", "Clermont-Ferrand"),
        ("Keepcool", "COURNON", "63800", "Cournon-d'Auvergne"),
        ("Keepcool", "RIOM MOZAC", "63200", "Riom"),
        ("Keepcool", "ANGLET", "64600", "Anglet"),
        ("Keepcool", "PAU", "64000", "Pau"),
        ("Keepcool", "TARBES", "65000", "Tarbes"),
        ("Keepcool", "PERPIGNAN CHÂTEAU ROUSSILLON", "66000", "Perpignan"),
        ("Keepcool", "SAINT-CYPRIEN", "66750", "Saint-Cyprien"),
        ("Keepcool", "ERSTEIN", "67150", "Erstein"),
        ("Keepcool", "HAGUENAU", "67500", "Haguenau"),
        ("Keepcool", "LINGOLSHEIM", "67380", "Lingolsheim"),
        ("Keepcool", "NEUDORF", "67100", "Strasbourg"),
        ("Keepcool", "NEUDORF RIBEAUVILLÉ", "67100", "Strasbourg"),
        ("Keepcool", "OBERNAI", "67210", "Obernai"),
        ("Keepcool", "SCHWEIGHOUSE", "67590", "Schweighouse-sur-Moder"),
        ("Keepcool", "SELESTAT", "67600", "Sélestat"),
        ("Keepcool", "SOUFFELWEYERSHEIM", "67460", "Souffelweyersheim"),
        ("Keepcool", "STRASBOURG", "67000", "Strasbourg"),
        ("Keepcool", "STRASBOURG CATHÉDRALE", "67000", "Strasbourg"),
        ("Keepcool", "STRASBOURG LES HALLES", "67000", "Strasbourg"),
        ("Keepcool", "COLMAR", "68000", "Colmar"),
        ("Keepcool", "MULHOUSE WITTENHEIM", "68270", "Wittenheim"),
        ("Keepcool", "BRON", "69500", "Bron"),
        ("Keepcool", "CRAPONNE", "69290", "Craponne"),
        ("Keepcool", "LYON 2 CONFLUENCE", "69002", "Lyon"),
        ("Keepcool", "LYON 3 FELIX FAURE", "69003", "Lyon"),
        ("Keepcool", "LYON 3 MONTCHAT", "69003", "Lyon"),
        ("Keepcool", "LYON 8", "69008", "Lyon"),
        ("Keepcool", "LYON 9 VAISE", "69009", "Lyon"),
        ("Keepcool", "LYON PART DIEU", "69003", "Lyon"),
        ("Keepcool", "LYON SKY56", "69002", "Lyon"),
        ("Keepcool", "VILLEURBANNE - CHARPENNES", "69100", "Villeurbanne"),
        ("Keepcool", "MÂCON NORD", "71000", "Mâcon"),
        ("Keepcool", "LE MANS VILLAGE", "72100", "Le Mans"),
        ("Keepcool", "AIX-LES-BAINS", "73100", "Aix-les-Bains"),
        ("Keepcool", "CHAMBÉRY CENTRE", "73000", "Chambéry"),
        ("Keepcool", "ANNECY", "74000", "Annecy"),
        ("Keepcool", "PARIS 02 CLERY", "75002", "Paris"),
        ("Keepcool", "PARIS 04 BASTILLE", "75004", "Paris"),
        ("Keepcool", "PARIS 05 SAINT-GERMAIN", "75005", "Paris"),
        ("Keepcool", "PARIS 08 MONCEAU", "75008", "Paris"),
        ("Keepcool", "PARIS 09 CHÂTEAUDUN", "75009", "Paris"),
        ("Keepcool", "PARIS 14 DENFERT-ROCHEREAU", "75014", "Paris"),
        ("Keepcool", "PARIS 15 CONVENTION", "75015", "Paris"),
        ("Keepcool", "PARIS 18 MARCADET", "75018", "Paris"),
        ("Keepcool", "BARENTIN", "76360", "Barentin"),
        ("Keepcool", "LE HAVRE", "76600", "Le Havre"),
        ("Keepcool", "MONT SAINT AIGNAN", "76130", "Mont-Saint-Aignan"),
        ("Keepcool", "ROUEN CENTRE", "76000", "Rouen"),
        ("Keepcool", "FONTAINEBLEAU", "77300", "Fontainebleau"),
        ("Keepcool", "NEMOURS", "77140", "Nemours"),
        ("Keepcool", "VARENNES-SUR-SEINE", "77130", "Varennes-sur-Seine"),
        ("Keepcool", "FLINS-SUR-SEINE", "78410", "Flins-sur-Seine"),
        ("Keepcool", "LE CHESNAY", "78150", "Le Chesnay"),
        ("Keepcool", "LES CLAYES-SOUS-BOIS", "78340", "Les Clayes-sous-Bois"),
        ("Keepcool", "MANTES-LA-VILLE", "78711", "Mantes-la-Ville"),
        ("Keepcool", "MARLY-LE-ROI", "78160", "Marly-le-Roi"),
        ("Keepcool", "SAINT-GERMAIN-EN-LAYE", "78100", "Saint-Germain-en-Laye"),
        ("Keepcool", "NIORT", "79000", "Niort"),
        ("Keepcool", "ABBEVILLE", "80100", "Abbeville"),
        ("Keepcool", "AMIENS CENTRE", "80000", "Amiens"),
        ("Keepcool", "ALBI", "81000", "Albi"),
        ("Keepcool", "MONTAUBAN", "82000", "Montauban"),
        ("Keepcool", "BRIGNOLES", "83170", "Brignoles"),
        ("Keepcool", "CALLIAN", "83440", "Callian"),
        ("Keepcool", "DRAGUIGNAN", "83300", "Draguignan"),
        ("Keepcool", "FRÉJUS LA PALUD", "83600", "Fréjus"),
        ("Keepcool", "HYÈRES", "83400", "Hyères"),
        ("Keepcool", "LA VALETTE", "83160", "La Valette-du-Var"),
        ("Keepcool", "SAINTE-MAXIME", "83120", "Sainte-Maxime"),
        ("Keepcool", "SAINT-MAXIMIN-LA-SAINTE-BAUME", "83470", "Saint-Maximin-la-Sainte-Baume"),
        ("Keepcool", "SAINT-RAPHAËL", "83700", "Saint-Raphaël"),
        ("Keepcool", "APT", "84400", "Apt"),
        ("Keepcool", "AVIGNON FONTCOUVERTE", "84000", "Avignon"),
        ("Keepcool", "AVIGNON LE PONTET", "84130", "Le Pontet"),
        ("Keepcool", "BOLLÈNE", "84500", "Bollène"),
        ("Keepcool", "CAVAILLON", "84300", "Cavaillon"),
        ("Keepcool", "LE THOR", "84250", "Le Thor"),
        ("Keepcool", "ORANGE", "84100", "Orange"),
        ("Keepcool", "PERTUIS", "84120", "Pertuis"),
        ("Keepcool", "POITIERS", "86000", "Poitiers"),
        ("Keepcool", "SENS", "89100", "Sens"),
        ("Keepcool", "SAVIGNY-SUR-ORGE", "91600", "Savigny-sur-Orge"),
        ("Keepcool", "ANTONY", "92160", "Antony"),
        ("Keepcool", "GENNEVILLIERS", "92230", "Gennevilliers"),
        ("Keepcool", "LEVALLOIS-PERRET", "92300", "Levallois-Perret"),
        ("Keepcool", "MALAKOFF", "92240", "Malakoff"),
        ("Keepcool", "MONTROUGE", "92120", "Montrouge"),
        ("Keepcool", "PUTEAUX", "92800", "Puteaux"),
        ("Keepcool", "CHAMPIGNY-SUR-MARNE", "94500", "Champigny-sur-Marne"),
        ("Keepcool", "CHOISY-LE-ROI", "94600", "Choisy-le-Roi"),
        ("Keepcool", "CORMEILLES EN PARISIS", "95240", "Cormeilles-en-Parisis"),
        ("Keepcool", "ERAGNY", "95610", "Éragny"),
        ("Keepcool", "MARTINIQUE DUCOS", "97224", "Ducos"),
        ("Keepcool", "MARTINIQUE FORT-DE-FRANCE", "97200", "Fort-de-France"),
        ("Keepcool", "MARTINIQUE ROBERT CRÉOLIS", "97231", "Le Robert"),
        ("Keepcool", "LA RÉUNION LE TAMPON", "97430", "Le Tampon"),
        ("Keepcool", "LA RÉUNION QUARTIER-FRANCAIS", "97441", "Sainte-Suzanne"),
        ("Keepcool", "LA RÉUNION SAINT-BENOIT", "97470", "Saint-Benoît"),
        ("Keepcool", "LA RÉUNION SAINTE-CLOTILDE", "97490", "Sainte-Clotilde"),
        ("Keepcool", "LA RÉUNION SAINTE-MARIE DUPARC", "97438", "Sainte-Marie"),
        ("Keepcool", "LA RÉUNION SAINT-GILLES-ÉPERON", "97434", "Saint-Gilles-les-Bains"),
        ("Keepcool", "LA RÉUNION SAINT-JOSEPH", "97480", "Saint-Joseph"),
        ("Keepcool", "LA RÉUNION SAINT-LEU", "97436", "Saint-Leu"),
        ("Keepcool", "LA RÉUNION SAINT-LOUIS", "97450", "Saint-Louis"),
        ("Keepcool", "LA RÉUNION SAINT-PIERRE", "97410", "Saint-Pierre"),
    ]
    neoness_raw = [
        ("Neoness", "AUSTERLITZ", "75005", "Paris", "22 bis boulevard Saint Marcel"),
        ("Neoness", "BASTILLE", "75011", "Paris", "4-6 Passage Louis Philippe"),
        ("Neoness", "BATIGNOLLES-PLACE DE CLICHY", "75017", "Paris", "5 Rue Bernard Buffet"),
        ("Neoness", "BEAUGRENELLE", "75015", "Paris", "Place des 5 Martyrs du Lycée Buffon"),
        ("Neoness", "BELLEVILLE-MÉNILMONTANT", "75011", "Paris", "25 Boulevard de Belleville"),
        ("Neoness", "BNF BIBLIOTHÈQUE FRANÇOIS MITTERRAND", "75013", "Paris", "123 Avenue de France"),
        ("Neoness", "BOURSE-OPÉRA", "75002", "Paris", "21 rue De La Banque"),
        ("Neoness", "CHÂTELET-MONTORGUEIL", "75002", "Paris", "35/39 rue Greneta"),
        ("Neoness", "DENFERT-ALÉSIA", "75014", "Paris", "214 Avenue du Maine"),
        ("Neoness", "JAURÈS-BUTTES CHAUMONT", "75019", "Paris", "Halle Secrétan 46 Ter rue de Meaux"),
        ("Neoness", "LA MOTTE PICQUET", "75015", "Paris", "18 Rue Juge"),
        ("Neoness", "MADELEINE", "75009", "Paris", "7 rue Caumartin"),
        ("Neoness", "MONTMARTRE-MARCADET", "75018", "Paris", "28 Bis rue Boinod"),
        ("Neoness", "MONTPARNASSE", "75014", "Paris", "214 Avenue du Maine"),
        ("Neoness", "NATION", "75020", "Paris", "81 Rue de Lagny"),
        ("Neoness", "PLACE D'ITALIE-BUTTE AUX CAILLES", "75013", "Paris", "7 rue Vergniaud"),
        ("Neoness", "PLACE D'ITALIE-LES GOBELINS", "75013", "Paris", "7 bis rue Abel Hovelacque"),
        ("Neoness", "RÉPUBLIQUE", "75011", "Paris", "50 rue de Malte"),
        ("Neoness", "SAINT-LAZARE", "75009", "Paris", "44 rue De Clichy"),
        ("Neoness", "ASNIÈRES-GARE", "92600", "Asnières-sur-Seine", None),
        ("Neoness", "ASNIÈRES-GENNEVILLIERS", "92600", "Asnières-sur-Seine", None),
        ("Neoness", "BOULOGNE-BILLANCOURT", "92100", "Boulogne-Billancourt", None),
        ("Neoness", "COLOMBES-DÉFENSE OUEST", "92700", "Colombes", None),
        ("Neoness", "CCIAL QUAIS D'IVRY", "94200", "Ivry-sur-Seine", "30 boulevard Paul Vaillant Couturier"),
        ("Neoness", "FONTENAY-SOUS-BOIS", "94120", "Fontenay-sous-Bois", None),
        ("Neoness", "KREMLIN-VILLEJUIF", "94270", "Le Kremlin-Bicêtre", "116 avenue de Fontainebleau"),
        ("Neoness", "DÉFENSE-GRANDE ARCHE", "92800", "Puteaux", None),
        ("Neoness", "LYON MAIRIE DU 8ÈME", "69008", "Lyon", None),
        ("Neoness", "LYON PART-DIEU", "69003", "Lyon", None),
        ("Neoness", "MARGUERITTES", "30320", "Marguerittes", None),
    ]

    for brand, name_suffix, postal, city in keepcool_raw:
        clubs.append({
            "brand": brand,
            "name": f"{brand} {name_suffix.title()}",
            "address": None,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://www.keepcool.fr/liste-clubs-keepcool",
            "phase": "france_phase2",
        })

    for brand, name_suffix, postal, city, address in neoness_raw:
        clubs.append({
            "brand": brand,
            "name": f"{brand} {name_suffix.title()}",
            "address": address,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://www.neoness.fr/nos-salles-de-sport",
            "phase": "france_phase2",
        })

    return clubs


def parse_elancia_clubs():
    """Elancia clubs from official website."""
    clubs_raw = [
        ("Andrezieux", "42160", "Andrézieux-Bouthéon"),
        ("Angers Doyenné", "49000", "Angers"),
        ("Aurillac", "15000", "Aurillac"),
        ("Auxerre", "89000", "Auxerre"),
        ("Blois", "41000", "Blois"),
        ("Bourg-en-Bresse", "01000", "Bourg-en-Bresse"),
        ("Bourges", "18000", "Bourges"),
        ("Brest", "29850", "Gouesnou"),
        ("Brive", "19100", "Brive-la-Gaillarde"),
        ("Caen Beaulieu", "14000", "Caen"),
        ("Caen Centre", "14000", "Caen"),
        ("Caen Mondeville", "14120", "Mondeville"),
        ("Carquefou", "44470", "Carquefou"),
        ("Ceyrat", "63122", "Ceyrat"),
        ("Champniers", "16430", "Champniers"),
        ("Chauray", "79180", "Chauray"),
        ("Cherbourg Centre", "50100", "Cherbourg-en-Cotentin"),
        ("Châteauroux Saint-Maur", "36250", "Saint-Maur"),
        ("Clermont Brezet", "63100", "Clermont-Ferrand"),
        ("Cholet", "49300", "Cholet"),
        ("Cournon", "63800", "Cournon-d'Auvergne"),
        ("Cusset", "03300", "Cusset"),
        ("Gueret", "23000", "Guéret"),
        ("Guipavas", "29490", "Guipavas"),
        ("Issoire", "63500", "Issoire"),
        ("La Chapelle-Saint-Aubin", "72650", "La Chapelle-Saint-Aubin"),
        ("Lannion", "22300", "Lannion"),
        ("Laval", "53000", "Laval"),
        ("Le Mans Centre", "72000", "Le Mans"),
        ("Limoges Centre", "87000", "Limoges"),
        ("Limoges Nord", "87000", "Limoges"),
        ("Limoges Sud", "87000", "Limoges"),
        ("Montluçon", "03100", "Montluçon"),
        ("Niort", "79000", "Niort"),
        ("Paris Opéra", "75009", "Paris"),
        ("Poitiers", "86000", "Poitiers"),
        ("Poitiers Expo", "86000", "Poitiers"),
        ("Reims", "51100", "Reims"),
        ("Rennes Cartier", "35000", "Rennes"),
        ("Rennes Hotel Dieu", "35000", "Rennes"),
        ("Rennes Maginot", "35000", "Rennes"),
        ("Rennes Mitterrand", "35000", "Rennes"),
        ("Riom", "63200", "Riom"),
        ("Saint Laurent du Var", "06700", "Saint-Laurent-du-Var"),
        ("Saint-Cyr", "37540", "Saint-Cyr-sur-Loire"),
        ("Thionville", "57100", "Thionville"),
        ("Tulle", "19000", "Tulle"),
    ]
    clubs = []
    for name_suffix, postal, city in clubs_raw:
        clubs.append({
            "brand": "Elancia",
            "name": f"Elancia {name_suffix}",
            "address": None,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": f"https://www.elancia.fr/salles-de-sport/",
            "phase": "france_phase2",
        })
    return clubs


def parse_magic_form_clubs():
    """Magic Form clubs from official website."""
    clubs_raw = [
        ("Paris 14", "12 Rue Pierre Larousse", "75014", "Paris"),
        ("Cachan", "13-15 Rue Cousté", "94230", "Cachan"),
        ("Choisy-le-Roi", "12 Rue des Anciennes Cristalleries", "94600", "Choisy-le-Roi"),
        ("Clamart", "6 bis Rue de Versailles", "92140", "Clamart"),
        ("Courbevoie", "33 Rue du Moulin des Bruyères", "92400", "Courbevoie"),
        ("Créteil", "20 Avenue du Maréchal de Lattre de Tassigny", "94000", "Créteil"),
        ("Dourdan", "30 Avenue de Paris", "91410", "Dourdan"),
        ("Epône", "Avenue Fernand Léger", "78680", "Épône"),
        ("Gif-sur-Yvette", "11 Place du Marché Neuf", "91190", "Gif-sur-Yvette"),
        ("Le Bourget", "130 Avenue de la Division Leclerc", "93350", "Le Bourget"),
        ("Le Plessis-Trévise", "27 Avenue du Général de Gaulle", "94420", "Le Plessis-Trévise"),
        ("Le Raincy", "106 Avenue Thiers", "93340", "Le Raincy"),
        ("Levallois-Perret", "12 Rue Carnot", "92300", "Levallois-Perret"),
        ("Massy", "7 Avenue Saint-Marc", "91300", "Massy"),
        ("Mennecy", "9-13 Rue Jean Cocteau", "91540", "Mennecy"),
        ("Meudon", "85 Rue Henri Barbusse", "92190", "Meudon"),
        ("Montreuil", "112 Boulevard de la Boissière", "93100", "Montreuil"),
        ("Mormant", "Rue Antoine Laurent De Lavoisier", "77720", "Mormant"),
        ("Nemours", "37 Avenue Carnot", "77140", "Saint-Pierre-lès-Nemours"),
        ("Provins", "11 Rue Georges Dromigny", "77160", "Provins"),
        ("Saint Maur", "57 Avenue Henri Martin", "94100", "Saint-Maur-des-Fossés"),
        ("Sucy-En-Brie", "6 Allée du Pacifique", "94370", "Sucy-en-Brie"),
        ("Versailles", "14 Ter rue de Noailles", "78000", "Versailles"),
        ("Villeneuve-le-Roi", "45 Avenue du Maréchal Joffre", "94290", "Villeneuve-le-Roi"),
        ("Villiers-le-Bel", "178 Avenue Pierre Semard", "95400", "Villiers-le-Bel"),
        ("Vitry-sur-Seine", "58 Avenue Paul Vaillant Couturier", "94400", "Vitry-sur-Seine"),
        ("Angers", "12 Boulevard Gaston Birgé", "49100", "Angers"),
        ("Bordeaux", "75 Cours d'Albret", "33000", "Bordeaux"),
        ("Dijon", "10-12 Boulevard Carnot", "21000", "Dijon"),
        ("Draguignan", "144 Bd. Marx Dormoy", "83300", "Draguignan"),
        ("Le Taillan-Médoc", "1 Place Buffon", "33320", "Le Taillan-Médoc"),
        ("Sens", "82 Grande Rue", "89100", "Sens"),
        ("Solliès-Pont", "Avenue de l'Arlésienne", "83210", "Solliès-Pont"),
        ("Tours", "228 Avenue André Maginot", "37100", "Tours"),
        ("Troyes", "52 bis Boulevard du 14 Juillet", "10000", "Troyes"),
        ("Paris 12", "Rue de Lyon", "75012", "Paris"),
    ]
    clubs = []
    for name_suffix, address, postal, city in clubs_raw:
        clubs.append({
            "brand": "Magic Form",
            "name": f"Magic Form {name_suffix}",
            "address": address,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://magic-form.fr/clubs/",
            "phase": "france_phase2",
        })
    return clubs


def parse_vita_liberte_clubs():
    """Vita Liberté clubs from official website."""
    clubs_raw = [
        ("Ajaccio", "20000", "Ajaccio"),
        ("Ajaccio Sanguinaires", "20000", "Ajaccio"),
        ("Aléria", "20270", "Aléria"),
        ("Aubagne Les Paluds", "13400", "Aubagne"),
        ("Auriol", "13390", "Auriol"),
        ("Bagnols sur Cèze", "30200", "Bagnols-sur-Cèze"),
        ("Bandol", "83150", "Bandol"),
        ("Bastia", "20200", "Bastia"),
        ("Bayonne", "64100", "Bayonne"),
        ("Biguglia", "20620", "Biguglia"),
        ("Bruges", "33520", "Bruges"),
        ("Cap Corse", "20200", "Bastia"),
        ("Corte", "20250", "Corte"),
        ("Cuges les Pins", "13780", "Cuges-les-Pins"),
        ("Digne les Bains", "04000", "Digne-les-Bains"),
        ("Folelli", "20213", "Folelli"),
        ("Forcalquier", "04300", "Forcalquier"),
        ("Furiani", "20600", "Furiani"),
        ("La Ciotat", "13600", "La Ciotat"),
        ("La Destrousse", "13112", "La Destrousse"),
        ("La Fare les Oliviers", "13580", "La Fare-les-Oliviers"),
        ("La Teste de Buch", "33260", "La Teste-de-Buch"),
        ("Le Beausset", "83330", "Le Beausset"),
        ("Libourne", "33500", "Libourne"),
        ("Macouria", "97355", "Macouria"),
        ("Marseille L'Estaque", "13016", "Marseille"),
        ("Marseille Saint Barnabé", "13012", "Marseille"),
        ("Marseille Sormiou", "13009", "Marseille"),
        ("Meyreuil", "13590", "Meyreuil"),
        ("Montélimar", "26200", "Montélimar"),
        ("Nice Libération", "06000", "Nice"),
        ("Pamiers", "09100", "Pamiers"),
        ("Pau Lons", "64140", "Lons"),
        ("Pertuis", "84120", "Pertuis"),
        ("Plan de Cuques", "13380", "Plan-de-Cuques"),
        ("Poissy", "78300", "Poissy"),
        ("Port Cogolin", "83310", "Cogolin"),
        ("Portes les Valence", "26800", "Portes-lès-Valence"),
        ("Porticcio", "20166", "Porticcio"),
        ("Porto Vecchio", "20137", "Porto-Vecchio"),
        ("Propriano", "20110", "Propriano"),
        ("Saint-André-de-Cubzac", "33240", "Saint-André-de-Cubzac"),
        ("Saint-Cannat", "13760", "Saint-Cannat"),
        ("Saint-Savournin", "13119", "Saint-Savournin"),
        ("Salon de Provence", "13300", "Salon-de-Provence"),
        ("Sausset les Pins", "13960", "Sausset-les-Pins"),
        ("Six Fours", "83140", "Six-Fours-les-Plages"),
        ("Sollies Pont", "83210", "Solliès-Pont"),
        ("Talence", "33400", "Talence"),
        ("Toulon", "83000", "Toulon"),
        ("Trets", "13530", "Trets"),
    ]
    clubs = []
    for name_suffix, postal, city in clubs_raw:
        clubs.append({
            "brand": "Vita Liberté",
            "name": f"Vita Liberté {name_suffix}",
            "address": None,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://www.vitaliberte.fr/nos-clubs/",
            "phase": "france_phase2",
        })
    return clubs


def parse_gigafit_clubs():
    """Gigafit clubs from MaSalleDeSport directory."""
    clubs_raw = [
        ("Paris 19", "82 Rue Petit", "75019", "Paris"),
        ("Paris 18", "5-7 rue Ordener", "75018", "Paris"),
        ("Issy-les-Moulineaux", "92 Avenue Victor Cresson", "92130", "Issy-les-Moulineaux"),
        ("Gennevilliers", "25 All. Maria Casares", "92230", "Gennevilliers"),
        ("Pierrelaye", "7 bis Avenue de Général Leclerc", "95480", "Pierrelaye"),
        ("Dunkerque", "99 quai Wilson", "59430", "Dunkerque"),
        ("Beauvais", "14 Rue Ferdinand de Lesseps", "60000", "Beauvais"),
        ("Beauvais Lady", "14 Rue Ferdinand de Lesseps", "60000", "Beauvais"),
        ("Nogent-sur-Oise", "82 Rue Jean Monnet", "60180", "Nogent-sur-Oise"),
        ("Itteville", "22 route de la Ferté Alais", "91760", "Itteville"),
        ("Saint-Pavace", "273 Av. du Maine", "72190", "Saint-Pavace"),
        ("Villeparisis", "17 Avenue Roger Salengro", "77270", "Villeparisis"),
        ("Breuil-le-Vert", "633 Rte de Paris", "60600", "Breuil-le-Vert"),
        ("Vigneux-sur-Seine", "2 Avenue Henri Barbusse", "91270", "Vigneux-sur-Seine"),
        ("Villemomble", "1 Allée du Plateau", "93250", "Villemomble"),
        ("Brive-la-Gaillarde", "Impasse de la Sarretie", "19100", "Brive-la-Gaillarde"),
        ("Gif-sur-Yvette", "5 Allée du Val Fleury", "91190", "Gif-sur-Yvette"),
        ("Noisy-le-Roi", "6 Av. de l'Europe Bâtiment A", "78590", "Noisy-le-Roi"),
        ("Toulon Bon-Rencontre", "85 Av. Aristide Briand", "83200", "Toulon"),
        ("Périgueux-Marsac", "1 rue du Commerce", "24430", "Marsac-sur-l'Isle"),
        ("Conflans-Sainte-Honorine", "47 rue Maurice Berteaux", "78700", "Conflans-Sainte-Honorine"),
        ("Pont-Sainte-Maxence", "Avenue d'Auvelais", "60700", "Pont-Sainte-Maxence"),
        ("Saint-Cyr-l'École", "75/77 Rue du Dr Vaillant", "78210", "Saint-Cyr-l'École"),
        ("Dijon", "64B rue Sully", "21000", "Dijon"),
        ("Éragny", "Éragny", "95610", "Éragny"),
        ("Martinique", "Martinique", "97200", "Fort-de-France"),
        ("Gagny", "Gagny", "93220", "Gagny"),
        ("Dinard", "Dinard", "35800", "Dinard"),
    ]
    clubs = []
    for name_suffix, address, postal, city in clubs_raw:
        is_project = name_suffix in ("Éragny", "Martinique", "Gagny", "Dinard", "Breuil-le-Vert")
        clubs.append({
            "brand": "Gigafit",
            "name": f"Gigafit {name_suffix}",
            "address": address if address != name_suffix else None,
            "postal_code": postal,
            "city": city,
            "country": "France",
            "source_url": "https://www.gigafit.fr/trouver-votre-club",
            "phase": "france_phase2",
            "import_category": "COMING_SOON" if is_project else None,
            "is_coming_soon": is_project or None,
        })
    return clubs


def parse_anytime_fitness_extra():
    """Additional Anytime Fitness France clubs from Phase 1 that need geocoding."""
    return [
        {
            "brand": "Anytime Fitness",
            "name": "Anytime Fitness Suresnes",
            "address": "3-7 rue Baudin",
            "postal_code": "92150",
            "city": "Suresnes",
            "country": "France",
            "source_url": "https://www.anytimefitness.fr/",
            "phase": "france_phase2",
        },
        {
            "brand": "Anytime Fitness",
            "name": "Anytime Fitness Rueil-Malmaison",
            "address": "98 Avenue Paul Doumer",
            "postal_code": "92500",
            "city": "Rueil-Malmaison",
            "country": "France",
            "source_url": "https://www.anytimefitness.fr/",
            "phase": "france_phase2",
        },
        {
            "brand": "Anytime Fitness",
            "name": "Anytime Fitness Paris 17",
            "address": "40 Rue Jouffroy d'Abbans",
            "postal_code": "75017",
            "city": "Paris",
            "country": "France",
            "source_url": "https://www.anytimefitness.fr/",
            "phase": "france_phase2",
        },
        {
            "brand": "Anytime Fitness",
            "name": "Anytime Fitness Lyon 6",
            "address": "91 Cours Vitton",
            "postal_code": "69006",
            "city": "Lyon",
            "country": "France",
            "source_url": "https://www.anytimefitness.fr/",
            "phase": "france_phase2",
        },
        {
            "brand": "Anytime Fitness",
            "name": "Anytime Fitness Boulogne-Billancourt",
            "address": "164 Boulevard Jean Jaurès",
            "postal_code": "92100",
            "city": "Boulogne-Billancourt",
            "country": "France",
            "source_url": "https://www.anytimefitness.fr/",
            "phase": "france_phase2",
        },
    ]


# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    import sys
    print("=== France Phase 2 Discovery ===", flush=True)

    # Load existing staging
    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    print(f"Loaded {len(staging)} existing staging entries")

    # Load geocode cache
    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    print(f"Geocode cache: {len(cache)} entries")

    # Collect new discoveries
    new_clubs = []
    new_clubs.extend(parse_on_air_clubs())
    print(f"  ON AIR Fitness: {len(parse_on_air_clubs())} clubs")
    new_clubs.extend(parse_keepcool_clubs())
    print(f"  Keepcool/Neoness: {len(parse_keepcool_clubs())} clubs")
    new_clubs.extend(parse_elancia_clubs())
    print(f"  Elancia: {len(parse_elancia_clubs())} clubs")
    new_clubs.extend(parse_magic_form_clubs())
    print(f"  Magic Form: {len(parse_magic_form_clubs())} clubs")
    new_clubs.extend(parse_vita_liberte_clubs())
    print(f"  Vita Liberté: {len(parse_vita_liberte_clubs())} clubs")
    new_clubs.extend(parse_gigafit_clubs())
    print(f"  Gigafit: {len(parse_gigafit_clubs())} clubs")
    new_clubs.extend(parse_anytime_fitness_extra())
    print(f"  Anytime Fitness extra: {len(parse_anytime_fitness_extra())} clubs")
    print(f"Total new discoveries: {len(new_clubs)}")

    # Generate IDs and normalize
    for r in new_clubs:
        r["postal_code"] = fr_postal(r.get("postal_code")) or r.get("postal_code")
        r["chain"] = r.get("chain") or r.get("brand")
        r["center_name"] = r.get("center_name") or r.get("name")
        r["lat"] = r.get("lat")
        r["lng"] = r.get("lng")
        r["id"] = make_id(
            r.get("brand"),
            r.get("address") or "",
            r.get("postal_code") or "",
            r.get("city") or "",
            r.get("source_url") or "",
            r.get("name") or "",
        )

    # Deduplicate against existing staging by ID
    existing_ids = {r["id"] for r in staging}
    added = []
    skipped_dup = 0
    for r in new_clubs:
        if r["id"] in existing_ids:
            skipped_dup += 1
            continue
        existing_ids.add(r["id"])
        added.append(r)
    print(f"New unique entries (not in staging): {len(added)}, skipped duplicates: {skipped_dup}")

    # Classify new entries
    for r in added:
        if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE"):
            continue
        if not r.get("address") or not r.get("postal_code") or not r.get("city"):
            r["import_category"] = "NEEDS_REVIEW"
            continue
        if r.get("lat") is not None and r.get("lng") is not None:
            if in_france_bbox(r["lat"], r["lng"]):
                r["import_category"] = "READY_TO_IMPORT"
                r["verification_status"] = "VERIFIED_CURRENT"
            else:
                r["import_category"] = "NEEDS_COORDINATES"
        else:
            r["import_category"] = "NEEDS_COORDINATES"

    # Add new entries to staging
    staging.extend(added)

    # ─── FIX L'ORANGE BLEUE MESSY ADDRESSES ─────────────────────────────────
    lob_fixed = 0
    street_pat = re.compile(
        r'(\d+[a-z]?\s*[,.]?\s*(?:rue|avenue|boulevard|bd|av|allée|impasse|chemin|route|place|cours|passage|square|zone|za|zac|zi|parc|centre|espace)[\w\s\-\'àâéèêëîïôùûüçÀÉ]+)',
        re.IGNORECASE
    )
    for r in staging:
        if r.get("brand") != "L'Orange Bleue":
            continue
        if r.get("import_category") != "NEEDS_COORDINATES":
            continue
        addr = r.get("address") or ""
        postal = r.get("postal_code") or ""
        city = (r.get("city") or "").lower()
        if not city:
            continue
        matches = street_pat.findall(addr)
        if matches:
            best = matches[-1].strip(" ,.-–")
            if len(best) > 5 and len(best) < 80:
                r["address"] = best
                lob_fixed += 1
        else:
            parts = re.split(r'\d{5}\s+\w+|\d{2}\s+\d{2}\s+\d{2}\s+\d{2}\s+\d{2}', addr)
            if parts:
                last = parts[-1].strip(" ,–-")
                street_words = re.search(r'(rue|avenue|boulevard|bd|av|allée|impasse|chemin|route|place)', last, re.IGNORECASE)
                if street_words and len(last) < 80:
                    city_in = re.sub(re.escape(city), '', last, flags=re.IGNORECASE).strip(" ,")
                    if city_in and len(city_in) > 5:
                        r["address"] = city_in
                        lob_fixed += 1
    print(f"Fixed {lob_fixed} L'Orange Bleue messy addresses", flush=True)

    # ─── GEOCODING ────────────────────────────────────────────────────────────
    # Geocode all NEEDS_COORDINATES that have full address info
    todo = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"
            and r.get("address") and r.get("postal_code") and r.get("city")]
    print(f"\nGeocoding {len(todo)} entries with full addresses...")

    MAX_GEOCODE = 800
    geocoded = 0
    for i, r in enumerate(todo[:MAX_GEOCODE], 1):
        geocode_row(r, cache)
        if r.get("import_category") == "READY_TO_IMPORT":
            geocoded += 1
        if i % 20 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"  geocoded {i}/{min(len(todo), MAX_GEOCODE)} ({geocoded} READY so far)", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"  Geocoding complete: {geocoded}/{min(len(todo), MAX_GEOCODE)} converted to READY", flush=True)

    # Final validation: drop any READY with coords outside France
    for r in staging:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_france_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_france").strip("; ")

    # Write updated staging
    STAGING.write_text(json.dumps(staging, ensure_ascii=False, indent=2), encoding="utf-8")

    # ─── REPORT ───────────────────────────────────────────────────────────────
    cats = Counter(r.get("import_category") for r in staging)
    brands = Counter(r.get("brand") for r in staging)

    print(f"\n=== PHASE 2 RESULTS ===")
    print(f"Total France staging: {len(staging)}")
    print(f"Categories: {dict(cats)}")
    print(f"\nChain breakdown:")
    for brand, count in sorted(brands.items(), key=lambda x: -x[1]):
        sub = [r for r in staging if r.get("brand") == brand]
        ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        print(f"  {brand}: {count} total, {ready} READY")

    print(f"\nDone in {round(time.time() - t0)}s")
    print(f"READY_TO_IMPORT: {cats.get('READY_TO_IMPORT', 0)}")

    # Load production for final count
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    n_live = len(centers)
    ready_n = cats.get("READY_TO_IMPORT", 0)
    print(f"Projected catalog: {n_live} + {ready_n} = {n_live + ready_n}")


if __name__ == "__main__":
    main()
