"""Account CoPilot — builds the in-app dashboard (output/site/index.html) from the same data as the workbook."""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import load_all, ROOT, RUN_DATE  # noqa: E402

XLSX = "Account_CoPilot_Master_Book_UAE.xlsx"


def main():
    d = load_all()
    erp_rows = [{"company_id": a["company_id"], "company": a["company_name"], "name": a.get("erp", "Unknown"),
                 "category": "ERP (core)", "status": a.get("erp_status", ""), "evidence": a.get("erp_evidence", ""),
                 "source_url": ""} for a in d["accounts"]]
    for a in d["accounts"]:
        a.pop("third_party_apps", None)
    payload = {"meta": {"run_date": RUN_DATE, "xlsx": XLSX},
               "accounts": d["accounts"], "contacts": d["contacts"], "signals": d["signals"],
               "sources": d["sources"], "conflicts": d["conflicts"], "apps": erp_rows + d["apps"]}
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    import base64
    src = os.path.join(ROOT, "output", XLSX)
    xb64 = base64.b64encode(open(src, "rb").read()).decode() if os.path.exists(src) else ""
    tpl = open(os.path.join(ROOT, "scripts", "dashboard_template.html"), encoding="utf-8").read()
    site = os.path.join(ROOT, "output", "site")
    os.makedirs(site, exist_ok=True)
    with open(os.path.join(site, "index.html"), "w", encoding="utf-8") as f:
        f.write(tpl.replace("/*__DATA__*/", data).replace("/*__XLSX__*/", xb64))
    stale = os.path.join(site, XLSX)
    if os.path.exists(stale):
        os.remove(stale)
    print(f"Dashboard written: {len(d['accounts'])} accounts, {len(d['contacts'])} contacts")


if __name__ == "__main__":
    main()
