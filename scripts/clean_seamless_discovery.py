"""Classifies data/verification/seamless_discovery.json into import buckets (rules agreed for UAE; reuse per region).
Writes data/verification/seamless_discovery_clean.json. Buckets:
  KEEP     -> import as a new account (ICP status from the Seamless-discovery rule in recompute_icp.mjs)
  DUP      -> already in the app, or a unit of an account already in the app (dup_of says which)
  GOV      -> ministry / authority / police / military / sovereign fund (kept aside, tagged separately)
  SINGLE   -> single hotel, hospital, school or attraction (not a procurement-owning group)
  BRANCH   -> local branch/subsidiary of a foreign-headquartered group
  REGION   -> belongs to another country; held for that region's import
  JUNK     -> not a company, defunct, merged away, or data error
"""
import json, re

RULES = {
 "DUP": {
  "E& Uae": "Emirates Telecommunications Group Company PJSC (e&)", "Etisalat Facilities Management": "Emirates Telecommunications Group Company PJSC (e&)",
  "Atlantis Resorts": "Kerzner International (Atlantis Dubai)", "Aquaventure Waterpark": "Kerzner International (Atlantis Dubai)",
  "Nawah Energy Company": "Emirates Nuclear Energy Corporation (ENEC)", "Nmdc Dredging & Marine": "NMDC Group PJSC", "Dubizzle": "Dubizzle Group",
  "Damac Hotels & Resorts": "DAMAC Real Estate Development Ltd", "Damac Limited": "DAMAC Real Estate Development Ltd", "Edgnex Data Centres by Damac": "DAMAC Real Estate Development Ltd",
  "Dubai Properties": "Dubai Holding", "Meydan Group": "Dubai Holding", "Motiongate Dubai": "Dubai Holding",
  "Citymax Hotels by Landmark Group": "Landmark Group", "Max Fashion Mena & SEA": "Landmark Group",
  "Al Habtoor Motors": "Al Habtoor Group", "Al Habtoor City Hotel Collection": "Al Habtoor Group",
  "Al-Futtaim Contracting": "Al-Futtaim Group", "Al Futtaim Motors Toyota & Lexus Showroom": "Al-Futtaim Group", "Toyota UAE": "Al-Futtaim Group", "AF Construction": "Al-Futtaim Group",
  "Al Tayer Stocks": "Al Tayer Group", "Al Masaood Energy": "Al Masaood Group", "Tristar Engineering & Construction LLC": "Tristar Group",
  "Emke Group": "Lulu Retail Holdings PLC", "LuLu Group International": "Lulu Retail Holdings PLC",
  "Ferrari World Yas Island": "Miral Group (Yas Island)", "Jafza": "DP World", "Abu Dhabi Ports": "AD Ports Group", "Abu Dhabi Terminals": "AD Ports Group",
  "The Abu Dhabi Company for Petroleum Oil Operations": "ADNOC (Abu Dhabi National Oil Company)", "Abu Dhabi Company for Onshore Oil Operations": "ADNOC (Abu Dhabi National Oil Company)",
  "Takreer Ruwais Refinery Expansion": "ADNOC (Abu Dhabi National Oil Company)", "Gasco": "ADNOC Gas plc", "National Drilling Company": "ADNOC Drilling Company P.J.S.C.",
  "Esnaad Group": "ADNOC Logistics & Services plc", "Taqa Distribution": "Abu Dhabi National Energy Company PJSC (TAQA)",
  "National Bank of Abu Dhabi": "First Abu Dhabi Bank PJSC (FAB)", "FGB": "First Abu Dhabi Bank PJSC (FAB)", "Mashreq Corporate & Investment Banking Group": "Mashreq",
  "Khidmah": "Aldar Properties PJSC", "Aldar Academies": "Aldar Properties PJSC", "TDIC": "Aldar Properties PJSC (TDIC assets moved to Aldar/Modon)",
  "Sheikh Shakhbout Medical City": "Pure Health Holding PJSC (PureHealth)", "Daman": "Pure Health Holding PJSC (PureHealth)", "Rafed UAE": "Pure Health Holding PJSC (PureHealth)",
  "LLH Hospital": "Burjeel Holdings PLC", "Thumbay Hospital": "Thumbay Group (this list)", "Gems Wellington International School": "Gems Education (this list)",
  "Emirates Aviation University": "Emirates Group (Emirates Airline + dnata)", "Abu Dhabi Airports Free Zone": "Abu Dhabi Airports (this list)",
  "Advanced Military Maintenance Repair & Overhaul Center": "EDGE (this list)", "Danube Building Materials": "Danube Group (this list)",
  "Al Fahim HQ": "Alfahim (this list)", "Mubadala": "Mubadala (sovereign investor; Mubadala Energy already in app)",
 },
 "GOV": ["Dubai Health Authority", "Ministry of Education", "Ministry of Health and Prevention", "Dubai Municipality", "Abu Dhabi Police", "Dubai Customs",
  "Abu Dhabi Civil Defence Authority", "UAE Armed Forces", "RTA Dubai", "Arab Monetary Fund", "Abu Dhabi Investment Authority"],
 "SINGLE": ["Le Royal Monceau", "Waldorf Astoria Lusail Doha", "JW Marriott Marquis Hotel Dubai", "Grosvenor House Dubai and Le Royal Meridien Beach Resort", "Armani Hotel Dubai",
  "Sofitel Dubai the Palm", "Grand Millennium Dubai", "Waldorf Astoria Ras Al Khaimah", "Atana Hotel", "Le Royal Méridien Abu Dhabi", "Asiana Hotel Dubai",
  "The Retreat Palm Dubai MGallery by Sofitel", "Caesars Palace Dubai", "Two Seasons Hotel & Apartments", "Aloft Abu Dhabi", "Sheraton Sharjah Beach Resort & Spa",
  "Marriott Hotel Al Forsan", "The St. Regis Downtown Dubai", "Bin Majid Nehal Hotel", "Dubai International Hotel", "Wynn Al Marjan Island",
  "Imperial College London Diabetes Centre", "Danat Al Emarat Hospital for Women & Children", "Iranian Hospital-Dubai", "HMS Al Garhoud Hospital", "Gmc Hospital",
  "RAK Hospital", "Universal Hospital", "Amina Healthcare Group", "Cambridge Medical & Rehabilitation Center", "Kaya Skin Clinic Arabia", "Emirates International Hospital"],
 "BRANCH": ["Midea Group", "Power Construction Corporation of China Ltd.", "Apar Industries Limited", "KAZ Minerals", "China National Chemical Engineering Corporation",
  "China Machinery Engineering Corporation", "MCB Bank Limited Dubai Branch", "Dabur International Ltd.", "Bosch Middle East", "Würth UAE", "Iron Mountain Middle East",
  "Omnicom Media Group", "MetLife Gulf", "Securitas UAE", "Novomet", "Sertecpet", "Goltens Worldwide", "Unilumin", "K-FLEX", "Advanta Seeds", "Alpine Access Solutions",
  "AMS", "Keolis.MHI", "Amazon Payment Services", "Nando's UAE", "Sgb by Brandsafway", "Viking Services", "GFG Alliance", "Unifrutti Group", "Mövenpick Hotels & Resorts",
  "Minor Hotels", "InfoPrint Solutions", "FTI Delta", "RX Middle East", "Allianz Middle East Ship Management LLC", "Verger Delporte UAE Ltd.", "Fura Gems Inc.",
  "Petrofac Emirates LLC", "Galfar Engineering & Contracting Co. W.l.l Emirates", "Binladin Contracting Group", "Saudi German Health UAE", "Günal Construction Dubai",
  "Techno Engineering Services Ltd.", "Cravia Inc."],
 "REGION": {"Talaat Moustafa Group": "Egypt", "Conspel Qatar WLL": "Qatar", "Mohammed Abdulmohsin Al-Kharafi & Sons": "Kuwait", "UAE Exchange Centre Co. WLL": "Kuwait",
  "Qurum Business Group": "Oman", "Saudi Amana Contracting Co. Ltd.": "KSA", "Fakeeh University Hospital": "KSA", "Taqa Energy": "KSA"},
 "JUNK": {"Banking": "directory website, not a company", "Jobs in Dubai": "job board, not a company", "Learnoflix Affiliate Program": "affiliate programme, not a company",
  "Advocate & Legal Consultants": "small law firm; revenue band implausible", "SR": "unidentified record (nicouae.com)", "Dewey & LeBoeuf Llp.": "law firm dissolved in 2012",
  "Souq.com": "now Amazon.ae", "Arabtec Construction": "in liquidation since 2020", "Drake & Scull International PJSC": "financially distressed; revenue far below band",
  "Maids.cc": "domestic-helper agency; $1B+ band implausible", "Pcci Group": "unidentified; band implausible", "RobtStone LLC": "unidentified; band implausible"},
}

rows = json.load(open("data/verification/seamless_discovery.json"))
names = {r["name"] for r in rows}
for b, v in RULES.items():
    for n in v: assert any(x == n or x.startswith(n[:25]) for x in names), (b, n)  # every rule must match a real row

def bucket(r):
    n = r["name"]
    for b in ("JUNK", "REGION", "GOV", "SINGLE", "BRANCH"):
        v = RULES[b]
        hit = next((k for k in v if n == k or (len(k) > 25 and n.startswith(k[:25]))), None)
        if hit: return b, (v[hit] if isinstance(v, dict) else "")
    hit = next((k for k in RULES["DUP"] if n == k or (len(k) > 25 and n.startswith(k[:25]))), None)
    if hit: return "DUP", RULES["DUP"][hit]
    return "KEEP", ""

out = []
for r in rows:
    b, why = bucket(r)
    out.append({**r, "bucket": b, "note": why})
json.dump(out, open("data/verification/seamless_discovery_clean.json", "w"), indent=1, ensure_ascii=False)
from collections import Counter
print(Counter(o["bucket"] for o in out))
keep = [o for o in out if o["bucket"] == "KEEP"]
print(Counter(o["staffCountRange"] for o in keep))
