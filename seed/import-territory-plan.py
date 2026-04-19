#!/usr/bin/env python3
"""
Parse the FY27 Territory Plan xlsx into a clean JSON fixture
(seed/fixtures/territory-plan.json) that the Node seed loader consumes.

Re-run this whenever the source plan is updated.
"""
import json
import pandas as pd
from pathlib import Path
import re

SOURCE = '/Users/Diya/Downloads/FY27 Territory Plan - Update Jan 2026.xlsx'
OUT = Path(__file__).parent / 'fixtures' / 'territory-plan.json'

US_STATES = {
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'District of Columbia', 'DC'
}

COUNTRY_BY_HINT = {
  'UK': 'GB', 'United Kingdom': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB',
  'Ireland': 'IE', 'France': 'FR', 'Germany': 'DE', 'Switzerland': 'CH',
  'Netherlands': 'NL', 'Belgium': 'BE', 'Denmark': 'DK', 'Sweden': 'SE',
  'Norway': 'NO', 'Finland': 'FI', 'Italy': 'IT', 'Spain': 'ES', 'Portugal': 'PT',
  'Austria': 'AT', 'Czech Republic': 'CZ', 'Poland': 'PL', 'Australia': 'AU',
  'Japan': 'JP', 'China': 'CN', 'India': 'IN', 'Canada': 'CA', 'Mexico': 'MX',
  'Brazil': 'BR', 'Argentina': 'AR', 'Singapore': 'SG', 'Korea': 'KR',
  'South Korea': 'KR', 'New Zealand': 'NZ', 'South Africa': 'ZA'
}

# Rough $ revenue / employee estimates scaled by account type tier.
# Used only where we don't have real company financials in the sheet.
REV_BAND = {
  'Key Account': (10_000_000_000, 50_000_000_000),
  'Key /Target Account': (5_000_000_000, 25_000_000_000),
  'Target Account': (1_000_000_000, 10_000_000_000),
  'Growth Account': (500_000_000, 3_000_000_000),
  'Other Account': (200_000_000, 1_500_000_000)
}
EMP_BAND = {
  'Key Account': (20_000, 120_000),
  'Key /Target Account': (10_000, 80_000),
  'Target Account': (3_000, 40_000),
  'Growth Account': (1_000, 12_000),
  'Other Account': (500, 5_000)
}

def parse_prefix_number(s, default=None):
    """Pull the leading integer out of cells like '3 = blah blah'."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return default
    s = str(s).strip()
    m = re.match(r'^\s*(\d)\b', s)
    return int(m.group(1)) if m else default

def normalize_ln_intent(s, default=0):
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return default
    v = str(s).strip().lower()
    return {'negative': 0, 'neutral': 1, 'moderate': 2, 'positive': 3}.get(v, default)

def classify_country(hq):
    if not hq or (isinstance(hq, float) and pd.isna(hq)):
        return 'US', None
    hq = str(hq).strip()
    # Try country hints first
    for hint, iso in COUNTRY_BY_HINT.items():
        if hint.lower() in hq.lower():
            return iso, hq
    # Pull the last comma-separated chunk (commonly "city, state")
    parts = [p.strip() for p in hq.split(',')]
    last = parts[-1] if parts else hq
    if last in US_STATES or hq in US_STATES:
        return 'US', hq
    # Some cells are bare state names
    if hq in US_STATES:
        return 'US', hq
    return 'US', hq  # default to US; still keep the label

def est_revenue(acc_type, rnd):
    lo, hi = REV_BAND.get(acc_type or 'Other Account', (500_000_000, 2_000_000_000))
    return int(lo + rnd.random() * (hi - lo))

def est_employees(acc_type, rnd):
    lo, hi = EMP_BAND.get(acc_type or 'Other Account', (1_000, 10_000))
    return int(lo + rnd.random() * (hi - lo))

def slug(name):
    return re.sub(r'[^A-Z0-9]', '', (name or '').upper())[:9].ljust(9, 'X')

def main():
    import random
    rnd = random.Random(20260417)  # deterministic

    rankings = pd.read_excel(SOURCE, sheet_name='Rankings Sheet', header=0)
    # Drop rows without an account name
    rankings = rankings[rankings['Account'].notna()].copy()
    rankings['Account'] = rankings['Account'].astype(str).str.strip()
    rankings = rankings[rankings['Account'] != '']

    transition = pd.read_excel(SOURCE, sheet_name='Accounts with Transition Plan', header=1)
    transition = transition[transition['Account'].notna()].copy()
    transition['Account'] = transition['Account'].astype(str).str.strip()

    # Build accounts
    accounts = []
    seen_ids = set()
    for i, row in rankings.iterrows():
        name = row['Account']
        sf_id = '001AXRI' + slug(name)[:8]
        if sf_id in seen_ids:
            sf_id = '001AXRI' + slug(name)[:6] + str(i).zfill(2)
        seen_ids.add(sf_id)
        country, hq_label = classify_country(row['HQ Location'])
        acc_type = row['Account Type'] if pd.notna(row['Account Type']) else 'Other Account'
        fit = parse_prefix_number(row['Fit'], default=1)
        zoom_intent = parse_prefix_number(row['Zoom Intent'], default=0)
        ln_intent = normalize_ln_intent(row['LN Intent'], default=1)
        relationship = parse_prefix_number(row['Relationship'], default=0)
        engagement = parse_prefix_number(row['Engagement'], default=0)
        total_fire_raw = row['Total FIRE Score'] if pd.notna(row['Total FIRE Score']) else None
        try:
            total_fire_raw = int(total_fire_raw) if total_fire_raw is not None else None
        except (ValueError, TypeError):
            total_fire_raw = None
        accounts.append({
            'name': name,
            'sf_id': sf_id,
            'territory': str(row['Territory']).strip() if pd.notna(row['Territory']) else None,
            'cp_name': str(row['CP']).strip() if pd.notna(row['CP']) else None,
            'account_type': acc_type,
            'hq_label': hq_label,
            'country': country,
            'gtm_industry': str(row['GTM Industry']).strip() if pd.notna(row['GTM Industry']) else 'Other',
            'sub_industry': str(row['Sub-Industry']).strip() if pd.notna(row['Sub-Industry']) else None,
            'fit_raw': fit,
            'intent_zoom_raw': zoom_intent,
            'intent_ln_raw': ln_intent,
            'relationship_raw': relationship,
            'engagement_raw': engagement,
            'total_fire_raw': total_fire_raw,
            'notes': str(row['Notes']).strip() if pd.notna(row['Notes']) else None,
            'est_revenue': est_revenue(acc_type, rnd),
            'est_employees': est_employees(acc_type, rnd)
        })

    # Collect unique CPs by territory to build the user hierarchy
    from collections import defaultdict, Counter
    cp_territories = defaultdict(Counter)
    for a in accounts:
        if a['cp_name'] and a['cp_name'] not in ('Not assigned', 'Unassigned'):
            # A CP can span regions; prefer the mode
            cp_territories[a['cp_name']][a['territory'] or 'Unknown'] += 1

    # Pick the majority territory for each CP
    cp_rows = []
    for cp, counter in cp_territories.items():
        home_territory, _ = counter.most_common(1)[0]
        cp_rows.append({'name': cp, 'territory': home_territory})
    cp_rows.sort(key=lambda r: (r['territory'], r['name']))

    # Transitions
    transitions = []
    for _, row in transition.iterrows():
        name = row['Account']
        if not name or pd.isna(name):
            continue
        transitions.append({
            'account': name,
            'current_region': str(row['Current Region ']).strip() if pd.notna(row['Current Region ']) else None,
            'future_region': str(row['Future Region']).strip() if pd.notna(row['Future Region']) else None,
            'transition_when': str(row['Date/Qt of Transition ']).strip() if pd.notna(row['Date/Qt of Transition ']) else None,
            'notes': str(row['Notes']).strip() if pd.notna(row['Notes']) else None
        })

    out = {
        'source_file': 'FY27 Territory Plan - Update Jan 2026.xlsx',
        'territories': sorted({a['territory'] for a in accounts if a['territory']}),
        'cps': cp_rows,
        'accounts': accounts,
        'transitions': transitions
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w') as f:
        json.dump(out, f, indent=2)
    print(f'Wrote {OUT} — {len(accounts)} accounts, {len(cp_rows)} CPs, {len(transitions)} transitions')

if __name__ == '__main__':
    main()
