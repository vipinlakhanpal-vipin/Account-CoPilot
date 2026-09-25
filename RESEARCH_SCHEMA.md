# Account CoPilot — Research Record Schema (v1)

One JSON file per company: `data/research/<company-slug>.json`. UTF-8, valid JSON, no comments.
Research date for this run: 2026-09-25. Research Channel is always `"Claude"` for records produced by Claude.

## Evidence rules (non-negotiable)
- Every contact, fact and signal must trace to a URL you actually saw in a search result or fetched page. No URL → do not record it.
- Never invent or pattern-guess emails or phone numbers. Leave blank (`""`) if not verified.
- No generic mailboxes (info@, sales@, contact@, procurement@, etc.) and no personal domains (gmail, yahoo, outlook, hotmail…).
- Phones: only a publicly listed business mobile, direct/local line, or the company board/switchboard number (Phone Type = "Board" for switchboard).
- Nationality: only when explicitly stated by a public source; otherwise `"Not Publicly Verified"`. Never infer from name, photo, location etc.
- Title (Verbatim): copy the title exactly as written in the source. Do not reword.
- LinkedIn: WebFetch usually cannot open LinkedIn. If you only saw a LinkedIn profile in a search-result snippet, set source_type `"LinkedIn (search snippet)"`. Never claim Sales Navigator access.
- Distinguish verification: FACT / LIKELY / UNVERIFIED / CONFLICTING / UNKNOWN. Never convert an inference into a fact.
- Prefer recent sources (2025–2026). If a source is older, flag a possible employment change rather than assume it is current.

## File shape
```json
{
  "company": {
    "company_name": "", "company_website": "", "domain": "", "country": "UAE", "hq_city": "",
    "exchange": "ADX|DFM|Nasdaq Dubai|Dual", "ticker": "",
    "industry": "",
    "revenue_usd_m": 0, "revenue_local": "e.g. AED 12.3bn", "revenue_fy": "FY2025", "revenue_source_url": "",
    "employee_range": "e.g. 1,001-5,000", "employee_source": "",
    "icp_fit": "Yes|No|Borderline", "icp_fit_reason": "listed? revenue >$250M? >=100 employees?",
    "ownership": "e.g. Public (ADX); majority-owned by ADNOC", "parent_company": "", "subsidiaries": "key subsidiaries, comma separated",
    "procurement_model": "Centralized / Group shared services / Decentralized / Unknown — with evidence",
    "erp": "e.g. SAP S/4HANA | Oracle Fusion Cloud ERP | Microsoft Dynamics 365 | Unknown",
    "erp_status": "FACT|LIKELY|UNVERIFIED|UNKNOWN", "erp_evidence": "why + source URL",
    "third_party_apps": [ {"name": "", "category": "CRM/HCM/ERP/S2P/CLM/AP automation/Analytics/ITSM/Cloud/etc", "status": "FACT|LIKELY|UNVERIFIED", "evidence": "", "source_url": ""} ],
    "existing_s2p_product": "Coupa|SAP Ariba|Coupa + SAP Ariba|Other S2P|Multiple S2P Platforms|No Evidence|Unknown",
    "existing_s2p_detail": "name the Other S2P product if known (e.g. Oracle Procurement Cloud, Jaggaer, Ivalua, Zycus, GEP SMART, SAP SRM, in-house portal)",
    "s2p_platform_status": "Confirmed Current|Confirmed Historical|Currently Implementing|Expansion / Rollout|Evaluation|RFP / Tender|Replacement / Transformation|Integration Project|Optimization|Managed Services Opportunity|No Evidence|Unknown",
    "s2p_signal_level": "VERY STRONG SIGNAL|STRONG SIGNAL|MODERATE SIGNAL|WEAK SIGNAL|NO SIGNAL|CONFLICTING SIGNAL",
    "s2p_strong_signals": "narrative: WHAT was found and WHY it is a signal, with dates",
    "digital_transformation_signals": "", "procurement_transformation_signals": "",
    "relevant_technologies": "", "known_implementation_partner": "", "known_consulting_partner": "",
    "coupa_opportunity_type": "Existing Coupa Customer — Managed Services|Existing Coupa Customer — Optimization|Existing Coupa Customer — Integration|Existing Coupa Customer — Expansion|Coupa Implementation Opportunity|Coupa Evaluation|Coupa Replacement / Transformation|No Evidence",
    "ariba_opportunity_type": "Existing Ariba Customer — Managed Services|Existing Ariba Customer — Optimization|Existing Ariba Customer — Integration|Existing Ariba Customer — Expansion|Ariba Implementation Opportunity|Ariba Evaluation|Ariba Replacement / Transformation|No Evidence",
    "potential_opportunity": "evidence-based observation, never 'sell X'",
    "board_phone": "company switchboard, only if on official site", "board_phone_source": "",
    "account_notes": "", "research_confidence": "HIGH|MEDIUM|LOW"
  },
  "contacts": [ {
    "full_name": "", "nationality": "Not Publicly Verified",
    "title_verbatim": "", "standardized_title": "",
    "role_family": "PROCUREMENT|FINANCE|IT|SUPPLY CHAIN|TRANSFORMATION|OTHER",
    "contact_tier": "Tier 1|Tier 2|Tier 3|Tier 4",
    "channel_source": "Claude-Website|Claude-LinkedIn|Claude-Press|Claude-Conference|Claude-Seamless|Claude-AnnualReport|Claude-Web",
    "source": "e.g. Company leadership page", "source_type": "Company Leadership Page|Annual Report|Press Release|LinkedIn (search snippet)|Conference Speaker Profile|News Article|Seamless.ai|Job Posting|Other",
    "source_url": "", "second_source_url": "", "verification_status": "VERIFIED|LIKELY CURRENT|UNVERIFIED|CONFLICTING",
    "linkedin_url": "", "location": "City, Country", "country": "",
    "email": "", "email_status": "Verified Active|Publicly Listed|Unverified|Inactive|Not Found", "email_source": "",
    "phone": "", "phone_type": "Mobile|Direct/Local|Board|", "phone_source": "",
    "employment_status": "Current|Recently Changed|Previous|Unknown",
    "previous_company": "", "previous_title": "",
    "s2p_contact_signal": "e.g. profile mentions leading Coupa rollout; speaker at procurement digitisation event",
    "notes_contact": "intel: tenure, priorities, public statements, events",
    "confidence": "HIGH|MEDIUM|LOW"
  } ],
  "signals": [ {"category": "PROCUREMENT TRANSFORMATION|TECHNOLOGY|ORGANIZATIONAL|COMMERCIAL|JOB MARKET", "signal": "", "level": "VERY STRONG SIGNAL|STRONG SIGNAL|MODERATE SIGNAL|WEAK SIGNAL", "platform": "Coupa|SAP Ariba|Other|Unknown", "evidence": "", "source_url": "", "date": "YYYY-MM or YYYY-MM-DD"} ],
  "sources": [ {"source": "", "source_type": "", "source_tier": "Tier 1|Tier 2|Tier 3|Tier 4", "url": "", "information_found": "", "evidence": "short snippet/paraphrase", "date_published": "", "date_accessed": "2026-09-25", "confidence": "HIGH|MEDIUM|LOW", "related_contact": "", "supports_current_employment": "Yes|No|N/A", "supports_current_title": "Yes|No|N/A", "supports_s2p_status": "Yes|No|N/A"} ],
  "employment_history": [ {"full_name": "", "company": "", "title": "", "source": "", "source_url": "", "date_found": "", "determination": "Current employment|Previous employment|Recently changed employment|Duplicate identity|Possible false match", "evidence": ""} ],
  "conflicts": [ {"entity": "contact or company name", "field": "", "value_a": "", "source_a": "", "value_b": "", "source_b": "", "determination": "", "evidence": ""} ]
}
```

## Tier guide (internal sales classification, not a fact)
- Tier 1: CPO, CFO, CIO/CTO/CDO, Chief Transformation Officer, Group CEO only if procurement sits with them (rarely include CEO).
- Tier 2: VP/SVP/EVP Procurement, Procurement Director, Finance Director, IT Director, Chief Supply Chain Officer.
- Tier 3: Head of Procurement/Sourcing/Contracts, Strategic Sourcing Director, ERP Director, Procurement Transformation Lead, Head of Shared Services, Head of AP.
- Tier 4: Procurement Manager, S2P/P2P Manager, Coupa/Ariba Administrator, Procurement Systems Manager.
