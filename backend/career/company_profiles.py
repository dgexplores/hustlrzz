"""Company interview style profiles (English).

Consolidates the interview-style knowledge from the original Chinese skill,
fully localized to English. Used to shape question generation and report
output per target company.
"""

import re

COMPANY_PROFILES: dict[str, dict] = {
    "google": {
        "style": "Engineering rigor: clear algorithms, strong abstraction",
        "focus": "Coding, system design, Googliness",
        "notes": [
            "Coding values clean thinking, edge cases, complexity analysis, readable code",
            "System design tests abstraction, extensibility, reliability and trade-offs",
            "Behavioral asks about Googliness, collaboration, ambiguity handling, learning",
        ],
    },
    "meta": {
        "style": "Outcome-driven: coding speed, product scale",
        "focus": "Coding, system design, behavioral",
        "notes": [
            "Coding is fast-paced; expects runnable, explainable solutions fast",
            "System design near large social/content/ad scale, emphasis on trade-offs and metrics",
            "Behavioral looks at impact, ownership, conflict, driving results under pressure",
        ],
    },
    "amazon": {
        "style": "Leadership Principles driven, dives deep",
        "focus": "Coding, system design, Leadership Principles",
        "notes": [
            "Behavioral questions must use STAR with concrete data and results",
            "AWS/platform roles probe reliability, cost, observability, failure recovery",
            "Dive Deep common: project details, trade-off rationale, failure retros",
        ],
    },
    "microsoft": {
        "style": "Collaborative growth: engineering practice, team fit",
        "focus": "Coding, design, growth mindset",
        "notes": [
            "Heavy emphasis on problem decomposition and maintainable engineering",
            "Behavioral around growth mindset, inclusion, cross-team influence",
            "Azure/platform roles need cloud, distributed systems, reliability, security basics",
        ],
    },
    "apple": {
        "style": "Craft and polish, ownership of end-to-end experience",
        "focus": "Hands-on depth, hardware/software integration, product instinct",
    },
    "netflix": {
        "style": "High-performance, judgment over process, candid feedback",
        "focus": "Judgment, ownership, results, thriving in ambiguity",
    },
    "stripe": {
        "style": "Precision, API/product craft, developer empathy",
        "focus": "Clean interfaces, correctness, pragmatic engineering",
    },
    "linkedin": {
        "style": "Transformation, identity, integrity",
        "focus": "Coding, systems design, product thinking",
    },
    "generic": {
        "style": "Inferred from the job description",
        "focus": "Blend of hard skills, project depth and behavioral fit",
        "notes": [],
    },
}


def company_profile(company: str) -> dict:
    """Match on whole-word tokens only.

    "go" must not match "google" and "Metallurgy Corp" must not match "meta",
    so substring matching is deliberately avoided.
    """
    key = (company or "").strip().lower()
    if key in COMPANY_PROFILES:
        return COMPANY_PROFILES[key]
    tokens = set(re.findall(r"[a-z0-9]+", key))
    for known, profile in COMPANY_PROFILES.items():
        if known != "generic" and known in tokens:
            return profile
    fallback = COMPANY_PROFILES["generic"]
    fallback = {**fallback, "name": company or "this role"}
    return fallback