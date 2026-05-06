"""Configuration for the FrontierWarden link audit crawler."""
from __future__ import annotations

from pathlib import Path

SEEDS: list[str] = [
    "https://docs.evefrontier.com/",
    "https://docs.evefrontier.com/tools/interfacing-with-the-eve-frontier-world",
    "https://sui-docs.evefrontier.com/",
    "https://github.com/evefrontier/world-contracts",
    "https://github.com/evefrontier/builder-documentation",
    "https://github.com/evefrontier/builder-scaffold",
    "https://github.com/evefrontier/evevault",
    "https://github.com/Ocky-Public/Frontier-Indexer",
]

ALLOWED_NETLOCS: set[str] = {
    "docs.evefrontier.com",
    "sui-docs.evefrontier.com",
    "github.com",
    "raw.githubusercontent.com",
}

ALLOWED_GITHUB_PREFIXES: tuple[str, ...] = (
    "https://github.com/evefrontier/",
    "https://github.com/Ocky-Public/",
    "https://raw.githubusercontent.com/evefrontier/",
    "https://raw.githubusercontent.com/Ocky-Public/",
)

KEYWORDS: list[str] = [
    "gate",
    "smart assembly",
    "world contract",
    "extension",
    "authorize_extension",
    "ExtensionAuthorizedEvent",
    "ExtensionRevokedEvent",
    "JumpEvent",
    "GateLinkedEvent",
    "GateUnlinkedEvent",
    "GatePolicy",
    "PlayerProfile",
    "Character",
    "OwnerCap",
    "published-at",
    "original-id",
    "UpgradeCap",
    "dapp discovery",
    "Walrus",
    "registry",
    "efctl",
    "scaffold",
    "metadata hash",
    "metadata URI",
    "smartAssemblyTypes",
    "listing",
    "slug",
    "approval",
    "Discovery frontend",
    "Move.lock",
    "package lineage",
    "type origin",
    "Move Registry",
    "MVR",
]

HIGH_PRIORITY_KEYWORDS: set[str] = {
    "authorize_extension",
    "GatePolicy",
    "JumpEvent",
    "GateLinkedEvent",
    "GateUnlinkedEvent",
    "OwnerCap",
    "UpgradeCap",
    "efctl",
    "scaffold",
    "smart assembly",
    "world contract",
}

OUT_DIR = Path("research/link_audit")
USER_AGENT = "FrontierWarden-LinkAudit/1.0 (+https://github.com/Kodaxadev/FrontierWarden)"
MAX_BODY_BYTES = 500_000
MAX_PAGES = 500
MAX_PAGES_PER_NETLOC = 150

GITHUB_NOISY_SECTIONS: set[str] = {
    "commit",
    "commits",
    "pull",
    "pulls",
    "issues",
    "actions",
    "releases",
    "blame",
    "compare",
    "stargazers",
    "watchers",
    "network",
    "graphs",
    "settings",
    "security",
    "packages",
    "runs",
    "search",
    "forks",
    "custom-properties",
    "branches",
    "pulse",
    "activity",
    "projects",
    "milestones",
    "labels",
}

CLASSIFICATION_RULES: list[tuple[str, str]] = [
    ("sui-docs.evefrontier.com", "sui_docs"),
    ("docs.evefrontier.com", "official_docs"),
    ("github.com/evefrontier/world-contracts", "world_contracts"),
    ("github.com/evefrontier/builder-documentation", "builder_documentation"),
    ("github.com/evefrontier/builder-scaffold", "builder_scaffold"),
    ("github.com/evefrontier/evevault", "wallet_dappkit"),
    ("github.com/evefrontier/", "evefrontier_repo"),
    ("Ocky-Public", "community_tools"),
]
