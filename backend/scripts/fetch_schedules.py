#!/usr/bin/env python3
"""
fetch_schedules.py
==================

Fetch current-week sport drop-in schedules for any list of Toronto
Parks & Recreation facility URLs and emit a single JSON array in the
schema:

    {
      "schedule_id": "C7#TUE#60+#",
      "sport": "Table Tennis",
      "tags": [],
      "day_of_week": "TUE",
      "slots": ["10am-12:30pm"],
      "age_group": "60+",
      "community_center_id": "C7"
    }

Input options
-------------
1. URL args on the command line:

       python fetch_schedules.py \
           "https://www.toronto.ca/.../location/?id=7" \
           "https://www.toronto.ca/.../location/?id=42"

2. A text file with one URL per line (use `#` for comments):

       python fetch_schedules.py --urls-file urls.txt

3. URLs on stdin (one per line):

       cat urls.txt | python fetch_schedules.py --stdin

4. Raw facility IDs (skip the URL step entirely):

       python fetch_schedules.py --ids 7 42 105

Output
------
- Combined JSON array printed to stdout (or saved with --output).
- Progress / diagnostics go to stderr, so stdout stays clean JSON.

Optional flags
--------------
    --categories sports,swim   # default: sports (comma-separated; one of:
                               #   sports, swim, skate, arts, fitness)
    --output out.json          # write JSON to a file instead of stdout
    --pretty / --compact       # pretty-print (default) or compact
    --timeout 30               # per-request timeout in seconds
    --parallel 8               # max concurrent fetches
    --list-facilities          # don't fetch schedules; just print
                               # id + name + address for each URL

The data is pulled from Toronto's live JSON endpoint:
    https://www.toronto.ca/data/parks/live/locations/<id>/<category>/info.json
    https://www.toronto.ca/data/parks/live/locations/<id>/<category>/<weekN>.json

Current-week rule
-----------------
The Toronto API lists weeks in `info.json`; the FIRST entry (typically
`week1.json`) is the current week. We fetch it ONLY when its `hasPrograms`
field is `"true"`. If it's `"false"`, the facility has no drop-in sessions
scheduled in the current week and we skip it (empty result for that
facility/category — no fallback to later weeks).

The endpoint serves UTF-16-encoded JSON; the script handles that automatically.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Iterable

# ----- constants ----------------------------------------------------------

DATA_BASE = "https://www.toronto.ca/data/parks/live/locations"
LOC_PAGE_URL = (
    "https://www.toronto.ca/explore-enjoy/parks-recreation/"
    "places-spaces/parks-and-recreation-facilities/location/"
)
DEFAULT_CATEGORIES = ("sports",)
ALL_CATEGORIES = ("sports", "swim", "skate", "arts", "fitness")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; toronto-facility-fetcher/1.0)",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/plain, */*",
}

# Gemini API key — replace with your actual key.
GEMINI_API_KEY = " "

# Canonical sport names. Entries whose sport field does NOT exactly match
# one of these will be sent to Gemini for normalization.
VALID_SPORTS = [
    "Table Tennis", "Badminton", "Basketball", "Swimming", "Soccer", "Roller Hockey",
    "Yoga", "Rock Wall Climbing", "Rock Climbing", "Pickleball", "Squash",
    "Volleyball", "Ball Hockey", "Open Gym", "Multi-Sport", "Dodgeball",
    "Netball", "Bocce", "Carpet Bowling", "Skateboarding", "Ultimate",
    "Archery", "Baseball", "Cricket", "Golf", "Lawn Bowling", "Tennis", "Lacrosse"
]

# ---------------------------------------------------------------------------
# FREE CENTERS — edit this set to mark community centres that offer
# free admission / free drop-in programs.
#
# Each entry is the Toronto facility ID (the same number that appears as
# ?id=NNN in the public URL, e.g. id=7 -> Broadlands Community Recreation
# Centre). The `isFree` field in the centers-output JSON is derived from
# this set: True if the facility's ID is in the set, False otherwise.
#
# Example:
#   FREE_CENTER_IDS = {7, 24, 42}
# or, equivalently:
#   FREE_CENTER_IDS = {"7", "24", "42"}    # string IDs also accepted
#
# To disable the free-admission flag entirely (default), leave the set empty.
# ---------------------------------------------------------------------------
FREE_CENTER_IDS: set = {42, 58, 63, 89, 325, 451, 486, 575, 633, 647, 675, 702, 712, 714, 731, 743, 749, 750, 780, 788, 795}

# ---------------------------------------------------------------------------
# MASTER LIST — every Toronto facility ID we track.
#
# When no --ids, URLs, --urls-file, or --stdin input is provided, the script
# defaults to fetching schedules for ALL of these centers.
# ---------------------------------------------------------------------------
ALL_CENTER_IDS: list[str] = [
    "13", "523", "800", "893", "897", "472", "480", "487", "582", "17",
    "42", "503", "511", "1045", "512", "515", "24", "27", "535", "507",
    "289", "1132", "30", "7", "33", "591", "3643", "350", "600", "913",
    "537", "824", "486", "476", "558", "499", "782", "25", "1056", "760",
    "548", "712", "567", "568", "575", "171", "36", "3857", "329", "1855",
    "330", "436", "428", "1463", "617", "750", "3775", "1062", "892", "482",
    "822", "308", "1063", "303", "583", "39", "638", "642", "643", "647",
    "896", "652", "45", "478", "483", "633", "48", "1219", "1221", "52",
    "823", "755", "664", "1232", "821", "1234", "1076", "58", "667", "1236",
    "1237", "63", "509", "84", "1078", "1244", "788", "698", "479", "675",
    "1856", "542", "803", "85", "702", "100", "89", "234", "96", "506",
    "891", "405", "802", "693", "1462", "1091", "797", "749", "189", "927",
    "703", "1093", "780", "731", "3861", "3732", "714", "793", "2012", "1288",
    "243", "2791", "722", "477", "801", "732", "883", "1429", "3502", "744",
    "3858", "267", "1098", "3493", "1099", "743", "325", "751", "1320", "272",
    "1344", "297", "1105", "1873", "282", "623", "624", "336", "795", "474",
    "354", "2773", "460", "705", "287", "771", "839", "294", "1865", "451",
    "396", "584", "306", "778", "3501",
]

# Default output paths (same directory as this script)
DEFAULT_SCHEDULES_OUTPUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "SportSchedules.json"
)
DEFAULT_CENTERS_OUTPUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "CommunityCentres.json"
)


# ----- HTTP / JSON helper -------------------------------------------------

def fetch_json(url: str, timeout: float = 30.0):
    """GET URL and decode JSON. Handles UTF-16 served by toronto.ca."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    # Toronto's data endpoint serves UTF-16; fall back to utf-8 variants.
    for enc in ("utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise RuntimeError(f"Could not decode response from {url}")


# ----- URL parsing --------------------------------------------------------

ID_RE = re.compile(r"[?&]id=(\d+)")


def extract_id(url_or_str: str) -> str | None:
    """Return the facility id from a URL or bare id string."""
    s = url_or_str.strip()
    if not s or s.startswith("#"):
        return None
    # Bare numeric id?
    if s.isdigit():
        return s
    # Look for ?id=NNN in a URL (also handle &#038;id= encoded versions)
    m = ID_RE.search(s)
    if m:
        return m.group(1)
    # Last-resort: parse query string
    try:
        parsed = urllib.parse.urlparse(s)
        qs = urllib.parse.parse_qs(parsed.query)
        if "id" in qs and qs["id"]:
            return qs["id"][0]
    except Exception:
        pass
    return None


def collect_ids(args) -> list[str]:
    """Pull facility IDs from CLI args / files / stdin."""
    raw: list[str] = []

    if args.ids:
        raw.extend(args.ids)

    if args.urls_file:
        with open(args.urls_file, "r", encoding="utf-8") as f:
            raw.extend(line.strip() for line in f)

    if args.stdin:
        raw.extend(line.strip() for line in sys.stdin)

    if args.urls:
        raw.extend(args.urls)

    ids: list[str] = []
    seen = set()
    for item in raw:
        if not item:
            continue
        fid = extract_id(item)
        if fid and fid not in seen:
            ids.append(fid)
            seen.add(fid)
    return ids


# ----- week selection (week1.json = current week) -------------------------

def get_current_week(weeks: list[dict]) -> dict | None:
    """Return the current week dict, i.e. the first week in the API's
    `weeks` list. The Toronto Parks & Recreation data API always publishes
    the current week as the first entry (typically `week1.json`).

    The caller is responsible for checking `hasPrograms` on the returned
    dict — if it's falsy / "false", the facility has no drop-in sessions
    scheduled in the current week and should be skipped.

    Returns None if the weeks list is empty / malformed.
    """
    if not weeks:
        return None
    return weeks[0]


# ----- append-mode helpers (load / merge / dedupe against existing file) ---

def entry_key(entry: dict) -> tuple:
    """Natural identity key for a schedule entry.

    Two entries with the same key describe the same (centre, day, age, sport)
    session — they should upsert, not duplicate.
    """
    return (
        entry.get("community_center_id", ""),
        entry.get("schedule_id", ""),
        entry.get("sport", ""),
        entry.get("day_of_week", ""),
        entry.get("age_group", ""),
    )


def load_existing_entries(path: str) -> list[dict]:
    """Read existing schedule entries from a JSON file for append mode.

    Accepts either:
      - a JSON array of schedule entries, or
      - a JSON object with a "schedules" array (the --include-errors shape).

    Returns an empty list if the file does not exist, is empty, or is not
    parseable as JSON. Diagnostics are returned via the second element of
    the tuple (a human-readable note).
    """
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        log(f"WARNING: existing file {path!r} is not valid JSON ({e}); "
            f"starting fresh.")
        return []
    if isinstance(data, list):
        return [e for e in data if isinstance(e, dict)]
    if isinstance(data, dict) and isinstance(data.get("schedules"), list):
        return [e for e in data["schedules"] if isinstance(e, dict)]
    log(f"WARNING: existing file {path!r} has an unexpected shape; "
        f"starting fresh.")
    return []


def upsert_entries(
    existing: list[dict],
    new_entries: list[dict],
) -> tuple[list[dict], int, int]:
    """Merge `new_entries` into `existing`, keyed by entry_key().

    Returns (merged_list, n_added, n_updated):
      - n_added:   number of new entries that didn't previously exist
      - n_updated: number of existing entries that were replaced with a
                   newer version (e.g. slots changed between runs)

    The merged list preserves a stable sort (facility id, day-of-week,
    age_group, sport, first-slot-start-time).
    """
    by_key: dict[tuple, dict] = {}
    n_updated = 0
    # Load existing first
    for e in existing:
        by_key[entry_key(e)] = e
    # Upsert new
    for e in new_entries:
        k = entry_key(e)
        if k in by_key:
            # Replace with the latest scrape. Only count as 'updated' if
            # the entry actually changed (deep equality on the whole dict).
            if by_key[k] != e:
                n_updated += 1
            by_key[k] = e
        else:
            by_key[k] = e
    n_added = len(by_key) - len(existing)
    if n_added < 0:
        # Can happen if existing had duplicates; clamp to 0
        n_added = 0
    merged = list(by_key.values())
    # Re-sort the merged list so the file stays tidy across runs
    _dow_order = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3,
                  "FRI": 4, "SAT": 5, "SUN": 6}
    merged.sort(
        key=lambda s: (
            int(str(s.get("community_center_id", "C0")).lstrip("C") or "0"),
            _dow_order.get(s.get("day_of_week", ""), 99),
            s.get("age_group", ""),
            s.get("sport", ""),
            slot_start_minutes(s["slots"][0]) if s.get("slots") else 0,
        )
    )
    return merged, n_added, n_updated


# ----- centers-file helpers (community center metadata) -------------------

# Public URL pattern for a facility page (used to populate `website`).
LOC_PAGE_URL_PUBLIC = (
    "https://www.toronto.ca/explore-enjoy/parks-recreation/"
    "places-spaces/parks-and-recreation-facilities/location/?id={fid}"
)


def is_free_facility(facility_id: str) -> bool:
    """Return True iff `facility_id` is in the FREE_CENTER_IDS set.

    Both string IDs ('7') and integer IDs (7) are accepted in the set, so
    this helper normalizes the lookup. The Toronto data API uses string IDs
    everywhere, so the caller passes strings.
    """
    if not FREE_CENTER_IDS:
        return False
    # Normalize the set once per call (cheap; sets are small).
    str_ids = {str(i) for i in FREE_CENTER_IDS}
    return str(facility_id) in str_ids


def build_center_entry(res: FacilityResult) -> dict:
    """Build a community-center metadata entry from a FacilityResult.

    Output schema (matches the user's spec):
        {
          "name": "...",
          "address": "...",
          "district": "...",
          "ward": "...",
          "phone": "...",
          "isFree": <bool>,                       # from FREE_CENTER_IDS
          "community_center_id": "C7",
          "website": "https://www.toronto.ca/.../?id=7"
        }

    The `isFree` field is True iff `res.facility_id` is in the module-level
    FREE_CENTER_IDS set (see the comment near its definition).
    """
    return {
        "name": res.name,
        "address": res.address.strip() if res.address else "",
        "district": res.district,
        "ward": res.ward,
        "phone": res.phone,
        "isFree": is_free_facility(res.facility_id),
        "community_center_id": res.community_center_id,
        "website": LOC_PAGE_URL_PUBLIC.format(fid=res.facility_id),
    }


def load_existing_centers(path: str) -> list[dict]:
    """Read existing center entries from a JSON file (array of objects, or
    an object with a "centers" array). Returns [] on any parse error."""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        log(f"WARNING: existing centers file {path!r} is not valid JSON ({e}); "
            f"starting fresh.")
        return []
    if isinstance(data, list):
        return [e for e in data if isinstance(e, dict)]
    if isinstance(data, dict):
        for key in ("centers", "facilities"):
            if isinstance(data.get(key), list):
                return [e for e in data[key] if isinstance(e, dict)]
    log(f"WARNING: existing centers file {path!r} has an unexpected shape; "
        f"starting fresh.")
    return []


def upsert_centers(
    existing: list[dict],
    new_entries: list[dict],
) -> tuple[list[dict], int, int]:
    """Merge `new_entries` into `existing`, keyed by community_center_id.

    Same upsert semantics as upsert_entries() but for center metadata.
    Returns (merged_list, n_added, n_updated). Sorted by community_center_id
    (numeric portion) for stable output across runs.
    """
    by_key: dict[str, dict] = {}
    n_updated = 0
    for c in existing:
        k = c.get("community_center_id", "")
        if k:
            by_key[k] = c
    for c in new_entries:
        k = c.get("community_center_id", "")
        if not k:
            continue
        if k in by_key:
            if by_key[k] != c:
                n_updated += 1
            by_key[k] = c
        else:
            by_key[k] = c
    n_added = max(0, len(by_key) - len(existing))
    merged = list(by_key.values())
    merged.sort(
        key=lambda c: int(str(c.get("community_center_id", "C0"))
                          .lstrip("C") or "0")
    )
    return merged, n_added, n_updated


# ----- normalization helpers ---------------------------------------------

def normalize_day(day: str) -> str:
    """'tuesday' -> 'TUE'"""
    return day.strip().lower()[:3].upper()


def normalize_age(age: str) -> str:
    """Normalize the free-form age string into a compact form.

    Examples:
        '60 years and over'         -> '60+'
        '19 years and over'         -> '19+'
        '13 - 24 years'             -> '13-24'
        '16 - 59 years'             -> '16-59'
        'All' / ''                  -> 'All'
        '60+'                       -> '60+'   (already compact)
    """
    age = (age or "").strip()
    if not age:
        return "All"

    # Range: "16 - 59 years" / "13-24 years"
    m = re.search(r"(\d+)\s*[-\u2013\u2014]\s*(\d+)\s*years?", age, re.I)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    # "60 years and over" / "19 years+" / "5 years and under"
    m = re.search(r"(\d+)\s*years?\s*(?:and\s*)?(over|up|\+)", age, re.I)
    if m:
        return f"{m.group(1)}+"
    m = re.search(r"(\d+)\s*years?\s*(?:and\s*)?under", age, re.I)
    if m:
        return f"<{m.group(1)}"

    # Already compact
    m = re.search(r"(\d+)\s*\+", age)
    if m:
        return f"{m.group(1)}+"

    # Single number like "5 years"
    m = re.search(r"(\d+)\s*years?", age, re.I)
    if m:
        return m.group(1)

    return age


# ----- Gemini sport normalization -----------------------------------------

def normalize_sports_with_gemini(entries: list[dict]) -> list[dict]:
    """Send schedule entries with non-standard sport names to Gemini 2.5 Flash
    for normalization.

    Gemini maps each entry's `sport` field to one of the VALID_SPORTS and
    populates `tags` with contextual qualifiers (e.g. "Family", "Women",
    "2SLGBTQ+").

    Returns the entries list with updated `sport` and `tags` fields.
    """
    if not entries:
        return entries

    valid_sports_str = json.dumps(VALID_SPORTS)
    prompt = f"""You are a data normalization assistant. I have a list of sports activity schedule entries in JSON format. Each entry has a "sport" field that may contain a non-standard sport name.

Your task:
1. Map each entry's "sport" field to the closest match from this canonical list: {valid_sports_str}
2. Extract any qualifiers from the original sport name into the "tags" array.
3. All entries mentioning "girls", "women", "woman", "female", or "ladies" should have "Women" in their tags.
4. Keep all other fields unchanged.

Examples:
- "Multi-Sport with Family" → sport: "Multi-Sport", tags: ["Family"]
- "Dodgeball (2SLGBTQ+)" → sport: "Dodgeball", tags: ["2SLGBTQ+"]
- "Women's Basketball" → sport: "Basketball", tags: ["Women"]
- "Girls Soccer" → sport: "Soccer", tags: ["Women"]
- "Open Gym - All Girls" → sport: "Open Gym", tags: ["Women"]
- "Parasport: Wheelchair Basketball" → sport: "Basketball", tags: ["Parasport: Wheelchair"]
- "Open Gym with Caregiver" → sport: "Open Gym", tags: ["Caregiver"]

Return ONLY a valid JSON array containing the updated entries. Do not include any markdown formatting, code fences, or explanation. Just the raw JSON array.

Here are the entries to normalize:
{json.dumps(entries, indent=2)}"""

    api_url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    request_body = json.dumps({
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.0,
        }
    }).encode("utf-8")

    req = urllib.request.Request(
        api_url,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    log(f"  Calling Gemini 2.5 Flash to normalize {len(entries)} entries...")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))

        # Extract the text from Gemini's response
        text = resp_data["candidates"][0]["content"]["parts"][0]["text"]

        # Parse the JSON array from the response
        # Strip any markdown code fences if present despite our instructions
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)

        normalized = json.loads(text)
        if not isinstance(normalized, list):
            log("  WARNING: Gemini returned non-list; using original entries.")
            return entries

        log(f"  Gemini normalized {len(normalized)} entries successfully.")
        return normalized

    except Exception as e:
        log(f"  ERROR: Gemini normalization failed: {e}")
        log(f"  Falling back to original (un-normalized) entries.")
        return entries


def merge_and_regroup(standard: list[dict], normalized: list[dict]) -> list[dict]:
    """Merge standard entries with Gemini-normalized entries, then re-group
    slots for entries sharing the same (sport, day_of_week, age_group,
    community_center_id).

    This ensures that, after normalization, entries like
    "Multi-Sport with Family" (now "Multi-Sport" + tags) can be merged
    with existing "Multi-Sport" entries if they share the same day/age/center.
    """
    combined = standard + normalized

    # Group by (community_center_id, sport, day_of_week, age_group)
    groups: dict[tuple, dict] = {}
    for entry in combined:
        key = (
            entry.get("community_center_id", ""),
            entry.get("sport", ""),
            entry.get("day_of_week", ""),
            entry.get("age_group", ""),
        )
        if key in groups:
            existing = groups[key]
            # Merge slots: add new slots that don't already exist
            for slot in entry.get("slots", []):
                if slot not in existing["slots"]:
                    existing["slots"].append(slot)
            # Merge tags: add new tags that don't already exist
            for tag in entry.get("tags", []):
                if tag not in existing["tags"]:
                    existing["tags"].append(tag)
        else:
            # Deep copy to avoid mutating the originals
            groups[key] = {
                "schedule_id": entry.get("schedule_id", ""),
                "sport": entry.get("sport", ""),
                "tags": list(entry.get("tags", [])),
                "day_of_week": entry.get("day_of_week", ""),
                "slots": list(entry.get("slots", [])),
                "age_group": entry.get("age_group", ""),
                "community_center_id": entry.get("community_center_id", ""),
            }

    # Sort slots within each group by start time and dedupe
    result = []
    for entry in groups.values():
        seen = set()
        unique_slots = []
        for s in entry["slots"]:
            if s not in seen:
                seen.add(s)
                unique_slots.append(s)
        unique_slots.sort(key=slot_start_minutes)
        entry["slots"] = unique_slots
        result.append(entry)

    return result


def _fmt_time(t: str) -> str:
    """'10:00 AM' -> '10am', '12:30 PM' -> '12:30pm', '07:30 PM' -> '7:30pm'"""
    t = t.strip().lower()
    t = re.sub(r"\s+", "", t)
    m = re.match(r"^0*(\d+)(?::(\d+))?(am|pm)$", t)
    if m:
        h, mm, ap = m.group(1), m.group(2), m.group(3)
        if mm and mm != "00":
            return f"{h}:{mm}{ap}"
        return f"{h}{ap}"
    return t


def normalize_slot(title: str) -> str:
    """'10:00 AM - 12:30 PM' -> '10am-12:30pm'"""
    parts = re.split(r"\s*(?:-|\u2013|\u2014)\s*", title.strip())
    if len(parts) != 2:
        return title.strip().lower()
    return f"{_fmt_time(parts[0])}-{_fmt_time(parts[1])}"


# ----- slot sorting -------------------------------------------------------

_SLOT_START_RE = re.compile(
    r"^0*(\d{1,2})(?::(\d{1,2}))?(am|pm)", re.I
)


def slot_start_minutes(slot: str) -> int:
    """Convert a slot's start time to minutes-since-midnight for sorting.

    '10am-12:30pm'   -> 600
    '7:30pm-9:30pm'  -> 1170
    Falls back to 0 if it can't parse, so unparseable slots sort first.
    """
    m = _SLOT_START_RE.match(slot.strip().lower())
    if not m:
        return 0
    h = int(m.group(1)) % 12  # 12am -> 0, 12pm -> 0 (then add 12 below)
    mm = int(m.group(2)) if m.group(2) else 0
    ap = m.group(3).lower()
    if ap == "pm":
        h += 12
    return h * 60 + mm


# ----- core fetch logic ---------------------------------------------------

@dataclass
class FacilityResult:
    facility_id: str
    community_center_id: str
    name: str = ""
    address: str = ""
    district: str = ""
    ward: str = ""
    phone: str = ""
    schedules: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def has_programs_this_week(self) -> bool:
        """True iff at least one requested category produced schedule entries
        for week1 (i.e. week1 had hasPrograms=true AND parsed entries)."""
        return len(self.schedules) > 0


def fetch_facility_schedules(
    facility_id: str,
    categories: Iterable[str],
    timeout: float,
    group_slots: bool = True,
) -> FacilityResult:
    """Fetch info + schedule for one facility across all requested categories.

    The "current week" is the first entry in the API's `weeks` list (i.e.
    `week1.json`). The Toronto Parks & Recreation data API always publishes
    the current week as that first entry. We fetch and parse it ONLY when its
    `hasPrograms` field is `"true"`; otherwise the facility has no drop-in
    sessions scheduled this week and we skip it (empty `schedules`).

    When `group_slots=True` (default), all time slots that share the same
    (community_center_id, sport, age_group, day_of_week) are merged into a
    single output entry with multiple items in `slots` (sorted by start time,
    deduplicated). When `group_slots=False`, each slot becomes its own entry
    with a single-element `slots` list.
    """
    ccid = f"C{facility_id}"
    base = f"{DATA_BASE}/{facility_id}"
    res = FacilityResult(facility_id=facility_id, community_center_id=ccid)

    # 1) facility info (name / address / district / ward / phone) — best-effort
    try:
        info = fetch_json(f"{base}/info.json", timeout=timeout)
        res.name = info.get("title", "")
        res.address = info.get("address", "")
        res.district = info.get("district", "")
        res.ward = info.get("ward", "")
        res.phone = info.get("phone", "")
    except Exception as e:
        res.errors.append(f"info.json: {e}")

    # 2) for each category, look at week1.json. If hasPrograms=true, fetch
    #    and parse it; otherwise skip this category for this facility.
    # Group key: (sport, age_group, dow) -> list of slot strings
    # (community_center_id is constant per facility, so not in the key)
    groups: dict[tuple[str, str, str], list[str]] = {}
    raw_entries: list[dict] = []  # used when group_slots=False

    for cat in categories:
        cat_info_url = f"{base}/{cat}/info.json"
        try:
            cat_info = fetch_json(cat_info_url, timeout=timeout)
        except Exception as e:
            res.errors.append(f"{cat}/info.json: {e}")
            continue

        weeks = cat_info.get("weeks", []) or []
        current_week = get_current_week(weeks)
        if current_week is None:
            # No weeks listed at all — treat as "no programs this week".
            res.errors.append(f"{cat}: no weeks listed in info.json")
            continue

        if str(current_week.get("hasPrograms", "")).lower() != "true":
            # The current week exists but has no programs. Skip this facility
            # for this category — do NOT fall back to any other week.
            res.errors.append(
                f"{cat}: current week {current_week.get('title')} "
                f"({current_week.get('json', 'week1.json')}) has no programs"
            )
            continue

        week_file = current_week.get("json", "week1.json")
        week_url = f"{base}/{cat}/{week_file}"
        try:
            week_data = fetch_json(week_url, timeout=timeout)
        except Exception as e:
            res.errors.append(f"{cat}/{week_file}: {e}")
            continue

        # Build schedule entries. The Toronto schema is:
        #   programs[].days[].times[].{day,title,status,...}
        # `days[].day` is unreliable (always 'monday' in some snapshots);
        # the actual DOW lives in `times[].day`.
        for program in week_data.get("programs", []) or []:
            for day_entry in program.get("days", []) or []:
                sport = (day_entry.get("title") or "").strip()
                age_group = normalize_age(day_entry.get("age", ""))
                for slot in day_entry.get("times", []) or []:
                    if str(slot.get("status", "")).lower() == "cancelled":
                        continue
                    dow = normalize_day(slot.get("day", ""))
                    slot_str = normalize_slot(slot.get("title", ""))
                    if group_slots:
                        key = (sport, age_group, dow)
                        groups.setdefault(key, []).append(slot_str)
                    else:
                        schedule_id = f"{ccid}#{dow}#{age_group}#"
                        raw_entries.append({
                            "schedule_id": schedule_id,
                            "sport": sport,
                            "tags": [],
                            "day_of_week": dow,
                            "slots": [slot_str],
                            "age_group": age_group,
                            "community_center_id": ccid,
                        })

    if group_slots:
        # Collapse each group: dedupe slots, sort by start time, then emit
        # ONE entry per (sport, age_group, day_of_week).
        for (sport, age_group, dow), slot_list in groups.items():
            # Dedupe while preserving order
            seen = set()
            unique_slots = []
            for s in slot_list:
                if s not in seen:
                    seen.add(s)
                    unique_slots.append(s)
            unique_slots.sort(key=slot_start_minutes)
            schedule_id = f"{ccid}#{dow}#{age_group}#"
            res.schedules.append({
                "schedule_id": schedule_id,
                "sport": sport,
                "tags": [],
                "day_of_week": dow,
                "slots": unique_slots,
                "age_group": age_group,
                "community_center_id": ccid,
            })
    else:
        res.schedules.extend(raw_entries)

    return res


# ----- CLI ----------------------------------------------------------------

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Fetch current-week drop-in schedules for Toronto "
                    "Parks & Recreation facilities.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("urls", nargs="*", help="Facility URLs (?id=NNN) or bare IDs.")
    p.add_argument("--urls-file", "-f", help="Path to a file with one URL/ID per line.")
    p.add_argument("--ids", nargs="*", help="Facility IDs directly.")
    p.add_argument("--stdin", action="store_true", help="Read URLs/IDs from stdin.")
    p.add_argument(
        "--categories",
        default=",".join(DEFAULT_CATEGORIES),
        help=f"Comma-separated categories to fetch. "
             f"Any of: {', '.join(ALL_CATEGORIES)}. Default: sports",
    )
    p.add_argument("--output", "-o",
                   help="Write schedules JSON to this file "
                        "(default: backend/SportSchedules.json).")
    p.add_argument("--pretty", dest="pretty", action="store_true", default=True,
                   help="Pretty-print JSON (default).")
    p.add_argument("--compact", dest="pretty", action="store_false",
                   help="Emit compact JSON.")
    p.add_argument("--timeout", type=float, default=30.0,
                   help="Per-request timeout in seconds (default: 30).")
    p.add_argument("--parallel", type=int, default=8,
                   help="Max concurrent facility fetches (default: 8).")
    p.add_argument("--list-facilities", action="store_true",
                   help="Only list id+name+address for each URL; skip schedules.")
    p.add_argument("--include-errors", action="store_true",
                   help='Include a "facilities" wrapper with errors when something failed.')
    p.add_argument("--no-group", dest="group_slots", action="store_false",
                   default=True,
                   help="Do NOT group slots: emit one entry per time slot "
                        "(each with a single-element 'slots' list). Default "
                        "is to merge all slots of the same (sport, age_group, "
                        "day_of_week, community_center_id) into one entry.")
    p.add_argument("--group", dest="group_slots", action="store_true",
                   default=True,
                   help="Group slots by (sport, age_group, day_of_week, "
                        "community_center_id) — this is the default.")
    p.add_argument("--append", action="store_true",
                   help="When used with --output (and/or --centers-output), "
                        "read any existing entries from the file(s) and MERGE "
                        "the freshly scraped entries in (upsert by their "
                        "natural key). Facilities with no data contribute "
                        "nothing, so the file(s) do not grow on no-op runs. "
                        "Without --append, the file(s) are overwritten.")
    p.add_argument("--centers-output", metavar="PATH",
                   help="Output file for community-center metadata "
                        "(default: backend/CommunityCentres.json). "
                        "Schema: {name, address, district, "
                        "ward, phone, isFree, community_center_id, website}. "
                        "Append mode (controlled by --append) dedupes by "
                        "community_center_id.")
    return p


def log(*a, **kw):
    """stderr-only logger so stdout stays clean JSON."""
    print(*a, file=sys.stderr, **kw)


def main(argv=None) -> int:
    args = build_arg_parser().parse_args(argv)

    # Validate categories
    cats = [c.strip().lower() for c in args.categories.split(",") if c.strip()]
    bad = [c for c in cats if c not in ALL_CATEGORIES]
    if bad:
        log(f"ERROR: unknown category/-ies: {bad}. Valid: {list(ALL_CATEGORIES)}")
        return 2

    ids = collect_ids(args)
    if not ids:
        log("No facility IDs provided — using ALL_CENTER_IDS master list "
            f"({len(ALL_CENTER_IDS)} centers).")
        ids = list(ALL_CENTER_IDS)

    # Default output paths when not explicitly provided
    if not args.output:
        args.output = DEFAULT_SCHEDULES_OUTPUT
        log(f"Using default schedules output: {args.output}")
    if not args.centers_output:
        args.centers_output = DEFAULT_CENTERS_OUTPUT
        log(f"Using default centers output: {args.centers_output}")

    log(f"Fetching {len(ids)} facility/-ies: {ids}")
    log(f"Categories: {cats}")
    log(f"Group slots: {args.group_slots}")
    log(f"Current-week rule: fetch week1.json only when hasPrograms=true; "
        f"otherwise skip the facility.")
    log(f"Parallel: {args.parallel}, Timeout: {args.timeout}s")

    results: list[FacilityResult] = []
    # Use a thread pool — each facility makes several sequential HTTP calls
    # but the facilities themselves are independent.
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.parallel) as pool:
        futs = {
            pool.submit(
                fetch_facility_schedules, fid, cats, args.timeout,
                args.group_slots,
            ): fid for fid in ids
        }
        for fut in concurrent.futures.as_completed(futs):
            fid = futs[fut]
            try:
                r = fut.result()
            except Exception as e:
                log(f"  [FAIL] id={fid}: {e}")
                r = FacilityResult(
                    facility_id=fid,
                    community_center_id=f"C{fid}",
                    errors=[f"unhandled: {e}"],
                )
            results.append(r)
            n_sched = len(r.schedules)
            n_err = len(r.errors)
            tag = "OK " if not n_err else "ERR"
            log(f"  [{tag}] id={fid} {r.name!r:40s} "
                f"schedules={n_sched} errors={n_err}")

    # Stable ordering: by facility id (numeric), then by schedule_id
    results.sort(key=lambda r: int(r.facility_id) if r.facility_id.isdigit() else 0)
    all_schedules: list[dict] = []
    for r in results:
        all_schedules.extend(r.schedules)

    # ----- Gemini normalization step --------------------------------------
    # Split entries into standard (sport already in VALID_SPORTS) and
    # non-standard (needs Gemini normalization).
    valid_set = set(VALID_SPORTS)
    standard_entries = [e for e in all_schedules if e["sport"] in valid_set]
    non_standard_entries = [e for e in all_schedules if e["sport"] not in valid_set]

    if non_standard_entries:
        log(f"\n{len(non_standard_entries)} entries have non-standard sport names:")
        non_std_sports = sorted(set(e["sport"] for e in non_standard_entries))
        for s in non_std_sports:
            log(f"  - {s!r}")
        normalized_entries = normalize_sports_with_gemini(non_standard_entries)
        # Merge normalized entries back with standard entries and re-group
        all_schedules = merge_and_regroup(standard_entries, normalized_entries)
        log(f"  After merge + re-group: {len(all_schedules)} entries")
    else:
        log("\nAll sport names are already standard — skipping Gemini normalization.")

    # Stable ordering: facility, day-of-week (MON..SUN), age_group, sport,
    # then by the first slot's start time within the group.
    _dow_order = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3,
                  "FRI": 4, "SAT": 5, "SUN": 6}
    all_schedules.sort(
        key=lambda s: (
            int(s["community_center_id"].lstrip("C") or "0"),
            _dow_order.get(s["day_of_week"], 99),
            s["age_group"],
            s["sport"],
            slot_start_minutes(s["slots"][0]) if s["slots"] else 0,
        )
    )

    # ---- Output: schedules file (or stdout) ------------------------------
    # In append mode, the output file is treated as a persistent store:
    # we read any existing schedule entries, upsert the freshly scraped
    # ones in (deduped by entry_key), and write the merged list back.
    # Append mode is incompatible with --list-facilities (which has its own
    # output shape).
    use_append_sched = bool(
        args.append and args.output and not args.list_facilities
    )
    if args.append and not args.output and not args.centers_output:
        log("WARNING: --append requires --output and/or --centers-output; "
            "ignoring --append.")
    if args.append and args.list_facilities:
        log("WARNING: --append is incompatible with --list-facilities; "
            "ignoring --append for the schedules file.")

    indent = 2 if args.pretty else None

    if use_append_sched:
        existing = load_existing_entries(args.output)
        merged, n_added, n_updated = upsert_entries(existing, all_schedules)
        # In append mode we always persist a flat array (not the
        # {schedules, facilities} wrapper shape).
        text = json.dumps(merged, indent=indent, ensure_ascii=False)
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
        log(
            f"\nSchedules (append mode) -> {args.output}\n"
            f"  scraped this run:   {len(all_schedules)} entries\n"
            f"  existing in file:   {len(existing)} entries\n"
            f"  new entries added:  {n_added}\n"
            f"  existing updated:   {n_updated}\n"
            f"  total in file now:  {len(merged)} entries"
        )
    else:
        # Non-append path: build the payload (list, --list-facilities, or
        # --include-errors wrapper) and either write to file or stdout.
        if args.list_facilities:
            payload = [
                {
                    "facility_id": r.facility_id,
                    "community_center_id": r.community_center_id,
                    "name": r.name,
                    "address": r.address,
                    "errors": r.errors,
                }
                for r in results
            ]
        elif args.include_errors:
            payload = {
                "schedules": all_schedules,
                "facilities": [
                    {
                        "facility_id": r.facility_id,
                        "community_center_id": r.community_center_id,
                        "name": r.name,
                        "address": r.address,
                        "errors": r.errors,
                    }
                    for r in results
                ],
            }
        else:
            payload = all_schedules

        text = json.dumps(payload, indent=indent, ensure_ascii=False)
        if args.output:
            os.makedirs(
                os.path.dirname(os.path.abspath(args.output)),
                exist_ok=True,
            )
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text)
                f.write("\n")
            log(f"\nWrote {len(all_schedules)} schedule entries "
                f"to {args.output}")
        else:
            print(text)

    # ---- Output: centers metadata file (optional) ------------------------
    # One entry per community center that had week1 hasPrograms=true (i.e.
    # produced at least one schedule entry this run). Append mode (controlled
    # by the same --append flag) dedupes by community_center_id. Centers with
    # no programs are NOT included in this file.
    if args.centers_output:
        new_centers = [
            build_center_entry(r) for r in results if r.has_programs_this_week
        ]

        if args.append:
            existing_c = load_existing_centers(args.centers_output)
            merged_c, c_added, c_updated = upsert_centers(existing_c, new_centers)
            payload_c = merged_c
        else:
            payload_c = new_centers
            c_added = len(new_centers)
            c_updated = 0

        text_c = json.dumps(payload_c, indent=indent, ensure_ascii=False)
        os.makedirs(
            os.path.dirname(os.path.abspath(args.centers_output)),
            exist_ok=True,
        )
        with open(args.centers_output, "w", encoding="utf-8") as f:
            f.write(text_c)
            f.write("\n")

        if args.append:
            log(
                f"\nCenters (append mode) -> {args.centers_output}\n"
                f"  centers with programs this run: {len(new_centers)}\n"
                f"  existing in file:               {len(existing_c)}\n"
                f"  new centers added:              {c_added}\n"
                f"  existing centers updated:       {c_updated}\n"
                f"  total in file now:              {len(merged_c)}"
            )
        else:
            log(f"\nWrote {len(new_centers)} community center entries "
                f"to {args.centers_output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
