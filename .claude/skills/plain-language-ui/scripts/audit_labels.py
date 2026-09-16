#!/usr/bin/env python3
"""
audit_labels.py — inventory every page, label, button and rendered enum in an
Angular or React/Next.js codebase and flag the ones a first-day user could not understand.

Read-only. Writes <out>/report.md and <out>/report.json.

Usage:
  python audit_labels.py <repo> [--out ui-audit] [--stack auto|angular|react]
                                [--glossary extra.md ...] [--allow allow.txt]
                                [--min-severity low|medium|high]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict, field
from pathlib import Path

# ----------------------------------------------------------------------------- config

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "out", "coverage",
             ".angular", "bin", "obj", "storybook-static", ".turbo", "__pycache__"}

TEMPLATE_EXT = {".html", ".tsx", ".jsx", ".ts", ".js", ".vue"}
I18N_HINT = re.compile(r"(i18n|locales?|messages|translations?)", re.I)

# Words that are fine on their own. Extend with --allow.
DEFAULT_ALLOW = {
    "name", "first name", "last name", "email", "phone", "address", "city", "country",
    "postcode", "zip", "date", "start date", "end date", "amount", "total", "notes",
    "comment", "comments", "description", "search", "filter", "save", "cancel", "close",
    "back", "next", "edit", "delete", "remove", "add", "yes", "no", "ok", "login",
    "log in", "log out", "sign in", "sign out", "password", "username", "settings",
    "help", "home", "actions", "status", "type", "created", "updated", "download",
    "upload", "print", "export", "import", "nom", "prénom", "adresse", "ville", "pays",
    "téléphone", "courriel", "montant", "date de début", "date de fin", "rechercher",
    "enregistrer", "annuler", "fermer", "retour", "suivant", "modifier", "supprimer",
    "ajouter", "oui", "non", "aide", "accueil",
}

BARE_VERBS = {"submit", "validate", "process", "generate", "sync", "run", "execute",
              "apply", "confirm", "ok", "go", "continue", "proceed", "send", "post",
              "valider", "soumettre", "traiter", "générer", "synchroniser", "exécuter",
              "appliquer", "confirmer", "continuer", "envoyer"}

ENUM_PROPS = r"(status|state|type|kind|code|regime|régime|category|stage|phase|mode|level)"

# ---- element extractors ------------------------------------------------------------
# Each pattern yields (kind, text). Kept deliberately regex-based: good enough for an
# inventory, zero dependencies, runs anywhere.

LABEL_PATTERNS = [
    # Angular Material / native
    ("label",   re.compile(r"<mat-label[^>]*>(.*?)</mat-label>", re.S | re.I)),
    ("label",   re.compile(r"<label[^>]*>(.*?)</label>", re.S | re.I)),
    ("label",   re.compile(r"<(?:Form)?Label[^>]*>(.*?)</(?:Form)?Label>", re.S)),
    ("label",   re.compile(r"<InputLabel[^>]*>(.*?)</InputLabel>", re.S)),
    ("label",   re.compile(r"""\blabel\s*[:=]\s*["'`]([^"'`]{1,120})["'`]""")),
    ("label",   re.compile(r"""\baria-label\s*=\s*["'{]+([^"'}]{1,120})["'}]""")),
    ("placeholder", re.compile(r"""\bplaceholder\s*[:=]\s*["'`{]+([^"'`}]{1,120})["'`}]""")),
    # headers
    ("header",  re.compile(r"<th[^>]*>(.*?)</th>", re.S | re.I)),
    ("header",  re.compile(r"""\bheader(?:Name)?\s*:\s*["'`]([^"'`]{1,120})["'`]""")),
    # buttons
    ("button",  re.compile(r"<button[^>]*>(.*?)</button>", re.S | re.I)),
    ("button",  re.compile(r"<Button[^>]*>(.*?)</Button>", re.S)),
    # titles
    ("title",   re.compile(r"<(?:Card|Dialog|Sheet|Page|mat-card|mat-dialog)?-?[Tt]itle[^>]*>(.*?)</(?:Card|Dialog|Sheet|Page|mat-card|mat-dialog)?-?[Tt]itle>", re.S)),
    ("title",   re.compile(r"<h[12][^>]*>(.*?)</h[12]>", re.S | re.I)),
    ("title",   re.compile(r"""\btitle\s*:\s*["'`]([^"'`]{1,120})["'`]""")),
]

HELP_PATTERNS = [
    re.compile(r"<mat-hint", re.I), re.compile(r"matTooltip", re.I),
    re.compile(r"<FormDescription"), re.compile(r"<FormHelperText"),
    re.compile(r"\bhelperText\s*[:=]"), re.compile(r"\bdescription\s*[:=]"),
    re.compile(r"\bhint\s*[:=]"), re.compile(r"aria-describedby"),
    re.compile(r"<Tooltip"), re.compile(r"\.describe\("),
    re.compile(r"\bhelp\s*[:=]"), re.compile(r"class(?:Name)?=[\"'][^\"']*(help|hint|caption|muted)"),
]
TOOLTIP_ONLY = [re.compile(r"matTooltip", re.I), re.compile(r"<Tooltip"), re.compile(r"\btitle\s*=")]

RAW_ENUM_ANGULAR = re.compile(r"\{\{\s*[\w.\[\]?]*\.\w*" + ENUM_PROPS + r"\s*\}\}", re.I)
RAW_ENUM_REACT = re.compile(r"\{\s*[\w.\[\]?!]*\.\w*" + ENUM_PROPS + r"\s*\}", re.I)
IDENT_LIKE = re.compile(r"^(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+|[a-z]+(?:[A-Z][a-z0-9]+)+|\w+_\w+|[\w.]+\.[\w.]+)$")
ACRONYM = re.compile(r"^[A-Z0-9/&\-]{2,6}$")
ANGULAR_ROUTE = re.compile(r"""\bpath\s*:\s*["'`]([^"'`]*)["'`]""")
BRIEF = re.compile(r"SCREEN_BRIEF", re.I)
EXCEPTION = re.compile(r"@plain-language-exception", re.I)
TAG = re.compile(r"<[^>]+>")
INTERP = re.compile(r"\{\{.*?\}\}|\{.*?\}")


# ----------------------------------------------------------------------------- model

@dataclass
class Finding:
    file: str
    line: int
    kind: str          # label | placeholder | header | button | title | enum | page | i18n
    text: str
    severity: str      # high | medium | low
    reason: str
    has_help: bool = False
    help_kind: str = ""  # visible | tooltip | none


@dataclass
class Page:
    file: str
    route: str
    has_brief: bool


@dataclass
class Report:
    repo: str
    stack: str
    pages: list = field(default_factory=list)
    findings: list = field(default_factory=list)
    exceptions: list = field(default_factory=list)
    counts: dict = field(default_factory=dict)


# ----------------------------------------------------------------------------- helpers

def load_terms(paths: list[Path]) -> set[str]:
    terms: set[str] = set()
    for p in paths:
        if not p.exists():
            continue
        for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith("One term") or line.startswith("at the bottom"):
                continue
            terms.add(line.lower())
    return terms


def detect_stack(repo: Path) -> str:
    if (repo / "angular.json").exists() or list(repo.glob("**/angular.json"))[:1]:
        return "angular"
    for name in ("next.config.js", "next.config.mjs", "next.config.ts"):
        if (repo / name).exists() or list(repo.glob(f"**/{name}"))[:1]:
            return "react"
    pkg = repo / "package.json"
    if pkg.exists():
        try:
            deps = json.loads(pkg.read_text()).get("dependencies", {})
            if "@angular/core" in deps:
                return "angular"
            if "react" in deps:
                return "react"
        except Exception:
            pass
    return "react"


def clean(text: str) -> str:
    text = TAG.sub(" ", text)
    text = INTERP.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" \t\n:*")
    return text


def iter_files(repo: Path):
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            p = Path(root) / f
            if p.suffix in TEMPLATE_EXT or (p.suffix == ".json" and I18N_HINT.search(str(p))):
                yield p


def line_of(src: str, idx: int) -> int:
    return src.count("\n", 0, idx) + 1


CONTAINERS = ["mat-form-field", "FormItem", "FormField", "FormControl", "fieldset",
              "mat-card", "Card", "th", "td", "tr", "button", "Button", "label"]


def window(src: str, idx: int, before: int = 300, after: int = 500) -> str:
    return src[max(0, idx - before): idx + after]


def scoped_context(src: str, idx: int) -> str:
    """Text of the nearest enclosing known container, else the surrounding 2 lines."""
    best = None
    for tag in CONTAINERS:
        open_re = re.compile(rf"<{tag}(?=[\s>])")
        close_re = re.compile(rf"</{tag}\s*>")
        starts = [m.start() for m in open_re.finditer(src, 0, idx + 1)]
        if not starts:
            continue
        for st in reversed(starts):
            m = close_re.search(src, st)
            if m and m.end() >= idx:
                span = (st, m.end())
                if best is None or (span[1] - span[0]) < (best[1] - best[0]):
                    best = span
                break
    if best and (best[1] - best[0]) < 2500:
        return src[best[0]:best[1]]
    ls = src.rfind("\n", 0, idx)
    for _ in range(2):
        ls = src.rfind("\n", 0, max(ls, 0))
    le = src.find("\n", idx)
    for _ in range(2):
        le = src.find("\n", le + 1) if le != -1 else -1
    return src[max(ls, 0): le if le != -1 else len(src)]


def has_exception(src: str, idx: int) -> bool:
    """@plain-language-exception on the same line or the line directly above."""
    ls = src.rfind("\n", 0, idx)
    prev_ls = src.rfind("\n", 0, max(ls, 0))
    le = src.find("\n", idx)
    return bool(EXCEPTION.search(src[max(prev_ls, 0): le if le != -1 else len(src)]))


def help_status(ctx: str) -> tuple[bool, str]:
    if any(p.search(ctx) for p in HELP_PATTERNS):
        only_tooltip = all(not p.search(ctx) for p in HELP_PATTERNS
                           if p.pattern not in ("matTooltip", "<Tooltip", "aria-describedby"))
        return True, ("tooltip" if only_tooltip else "visible")
    if any(p.search(ctx) for p in TOOLTIP_ONLY):
        return True, "tooltip"
    return False, "none"


def classify(kind: str, text: str, terms: set[str], allow: set[str],
             has_help: bool, help_kind: str) -> tuple[str, str] | None:
    """Return (severity, reason) or None if fine."""
    t = text.strip()
    low = t.lower()
    if not t or len(t) > 140:
        return None
    if low in allow:
        return None

    if IDENT_LIKE.match(t) and " " not in t:
        return "high", "Identifier/enum/i18n-key rendered to the user"

    if kind == "button" and low in BARE_VERBS:
        return "high", "Bare verb — button doesn't say what will happen"

    matched = [term for term in terms if term and re.search(rf"(?<![\w-]){re.escape(term)}(?![\w-])", low)]
    if matched:
        if not has_help:
            return "high", f"Domain term ({matched[0]}) with no explanation"
        if help_kind == "tooltip":
            return "low", f"Domain term ({matched[0]}) explained only in a tooltip"
        # explained visibly, but is the plain version first?
        if low.startswith(matched[0]):
            return "medium", f"Domain term ({matched[0]}) leads the label — put plain wording first"
        return None

    if ACRONYM.match(t) and not has_help:
        return "medium", "Acronym with no explanation"

    words = len(low.split())
    if kind in ("label", "header", "placeholder") and words <= 2 and not has_help:
        return "medium", "Short label with no helper text"

    if kind == "button" and words <= 1 and not has_help:
        return "medium", "One-word button"

    if has_help and help_kind == "tooltip" and kind in ("label", "header"):
        return "low", "Helper exists only as a tooltip"

    return None


# ----------------------------------------------------------------------------- scan

def scan(repo: Path, stack: str, terms: set[str], allow: set[str]) -> Report:
    rep = Report(repo=str(repo), stack=stack)
    seen: set[tuple[str, int, str]] = set()

    for p in iter_files(repo):
        rel = str(p.relative_to(repo))
        try:
            src = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # ---- i18n JSON: every value is a label candidate
        if p.suffix == ".json":
            try:
                data = json.loads(src)
            except Exception:
                continue
            def walk(obj, path=""):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        walk(v, f"{path}.{k}" if path else k)
                elif isinstance(obj, str):
                    kind = "button" if re.search(r"(button|btn|action|submit|cta)", path, re.I) else "label"
                    has_help = bool(re.search(rf"{re.escape(path.rsplit('.',1)[0])}\.(hint|help|description|desc)\b", src))
                    res = classify(kind, obj, terms, allow, has_help, "visible" if has_help else "none")
                    if res:
                        rep.findings.append(Finding(rel, 0, "i18n", f"{path} = {obj}", res[0], res[1], has_help, "visible" if has_help else "none"))
            walk(data)
            continue

        # ---- pages
        is_page = False
        route = ""
        if stack == "react":
            if re.search(r"(^|/)app/.*page\.(tsx|jsx|ts|js)$", rel) or \
               (re.search(r"(^|/)pages/", rel) and not re.search(r"/(api|_app|_document)", rel) and p.suffix in (".tsx", ".jsx")):
                is_page, route = True, rel
        else:
            if rel.endswith(".component.ts") and re.search(r"(page|view|screen|container)", rel, re.I):
                is_page, route = True, rel
            for m in ANGULAR_ROUTE.finditer(src):
                if m.group(1) and m.group(1) not in ("", "**"):
                    rep.pages.append(Page(rel, "/" + m.group(1), bool(BRIEF.search(src))))
        if is_page:
            rep.pages.append(Page(rel, route, bool(BRIEF.search(src))))

        # ---- raw enums
        enum_re = RAW_ENUM_ANGULAR if p.suffix == ".html" or stack == "angular" else RAW_ENUM_REACT
        for m in enum_re.finditer(src):
            frag = m.group(0)
            if "|" in frag or "(" in frag or "Label" in frag or "label" in frag:
                continue  # piped / mapped
            ln = line_of(src, m.start())
            if has_exception(src, m.start()):
                rep.exceptions.append(asdict(Finding(rel, ln, "enum", frag, "exception", "declared")))
                continue
            key = (rel, ln, frag)
            if key not in seen:
                seen.add(key)
                rep.findings.append(Finding(rel, ln, "enum", frag, "high", "Enum/status rendered without a label map"))

        # ---- labels & co
        for kind, pat in LABEL_PATTERNS:
            for m in pat.finditer(src):
                raw = m.group(1)
                text = clean(raw)
                if not text or text.startswith(("{{", "{")) or "=>" in text:
                    continue
                ln = line_of(src, m.start())
                ctx = scoped_context(src, m.start())
                if has_exception(src, m.start()):
                    rep.exceptions.append(asdict(Finding(rel, ln, kind, text, "exception", "declared")))
                    continue
                has_help, hk = help_status(ctx)
                res = classify(kind, text, terms, allow, has_help, hk)
                if not res:
                    continue
                key = (rel, ln, text)
                if key in seen:
                    continue
                seen.add(key)
                rep.findings.append(Finding(rel, ln, kind, text, res[0], res[1], has_help, hk))

    # pages without brief → findings
    for pg in rep.pages:
        if not pg.has_brief:
            rep.findings.append(Finding(pg.file, 1, "page", pg.route, "high", "Page has no SCREEN_BRIEF (who / goal / after)"))

    # dedupe pages
    uniq = {(pg.file, pg.route): pg for pg in rep.pages}
    rep.pages = list(uniq.values())

    c = Counter(f.severity for f in rep.findings)
    rep.counts = {"high": c["high"], "medium": c["medium"], "low": c["low"],
                  "pages": len(rep.pages),
                  "pages_without_brief": sum(1 for pg in rep.pages if not pg.has_brief),
                  "exceptions": len(rep.exceptions)}
    return rep


# ----------------------------------------------------------------------------- output

def write_md(rep: Report, out: Path, min_sev: str):
    order = {"high": 0, "medium": 1, "low": 2}
    keep = [f for f in rep.findings if order[f.severity] <= order[min_sev]]
    keep.sort(key=lambda f: (order[f.severity], f.file, f.line))
    by_file = Counter(f.file for f in keep if f.severity == "high")

    L = []
    L.append(f"# Plain-language UI audit — `{Path(rep.repo).name}` ({rep.stack})\n")
    L.append("## Summary\n")
    L.append(f"- Pages found: **{rep.counts['pages']}**, without a Screen Brief: **{rep.counts['pages_without_brief']}**")
    L.append(f"- High: **{rep.counts['high']}** · Medium: **{rep.counts['medium']}** · Low: **{rep.counts['low']}**")
    L.append(f"- Declared exceptions (`@plain-language-exception`): {rep.counts['exceptions']}\n")
    if by_file:
        L.append("### Worst files (high-severity count)\n")
        for f, n in by_file.most_common(10):
            L.append(f"- `{f}` — {n}")
        L.append("")
    L.append("## How to read this\n")
    L.append("- **high** — a user cannot understand this without training: raw identifiers, bare-verb buttons, domain terms with no explanation, pages with no brief.")
    L.append("- **medium** — probably confusing: acronyms, two-word labels with no helper, domain term leading the label.")
    L.append("- **low** — explanation exists but is hidden (tooltip only).\n")
    L.append("Fix order: write the Screen Brief for the page first, then the high items on it, then medium. Lows are quick wins.\n")

    L.append("## Pages\n")
    L.append("| File | Route | Screen Brief |")
    L.append("|---|---|---|")
    for pg in sorted(rep.pages, key=lambda x: (x.has_brief, x.file)):
        L.append(f"| `{pg.file}` | `{pg.route}` | {'✅' if pg.has_brief else '❌ missing'} |")
    L.append("")

    L.append("## Findings\n")
    L.append("| Sev | File:line | Kind | Text | Why | Help |")
    L.append("|---|---|---|---|---|---|")
    for f in keep:
        txt = f.text.replace("|", "\\|")[:90]
        L.append(f"| {f.severity} | `{f.file}:{f.line}` | {f.kind} | {txt} | {f.reason} | {f.help_kind} |")
    L.append("")

    if rep.exceptions:
        L.append("## Declared exceptions (kept on purpose — still worth a glance)\n")
        for e in rep.exceptions:
            L.append(f"- `{e['file']}:{e['line']}` {e['kind']}: {e['text']}")
        L.append("")

    L.append("## Remediation table (fill in, then apply)\n")
    L.append("| File | Element | Current | Proposed label | Proposed helper |")
    L.append("|---|---|---|---|---|")
    for f in keep[:60]:
        if f.kind in ("page",):
            continue
        L.append(f"| `{f.file}:{f.line}` | {f.kind} | {f.text.replace('|', '/')[:60]} | | |")
    (out / "report.md").write_text("\n".join(L), encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo")
    ap.add_argument("--out", default="ui-audit")
    ap.add_argument("--stack", default="auto", choices=["auto", "angular", "react"])
    ap.add_argument("--glossary", action="append", default=[], help="extra glossary file(s)")
    ap.add_argument("--allow", help="file with one allowed plain word per line")
    ap.add_argument("--min-severity", default="low", choices=["low", "medium", "high"])
    args = ap.parse_args(argv)

    repo = Path(args.repo).resolve()
    if not repo.exists():
        sys.exit(f"repo not found: {repo}")
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    here = Path(__file__).resolve().parent.parent
    gloss = [here / "references" / "glossary-lu-compliance.md"] + [Path(g) for g in args.glossary]
    terms = load_terms(gloss)
    allow = set(DEFAULT_ALLOW)
    if args.allow:
        allow |= {l.strip().lower() for l in Path(args.allow).read_text().splitlines() if l.strip()}

    stack = detect_stack(repo) if args.stack == "auto" else args.stack
    rep = scan(repo, stack, terms, allow)

    (out / "report.json").write_text(json.dumps({
        "repo": rep.repo, "stack": rep.stack, "counts": rep.counts,
        "pages": [asdict(p) for p in rep.pages],
        "findings": [asdict(f) for f in rep.findings],
        "exceptions": rep.exceptions,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    write_md(rep, out, args.min_severity)

    c = rep.counts
    print(f"stack={stack}  pages={c['pages']} (no brief: {c['pages_without_brief']})  "
          f"high={c['high']} medium={c['medium']} low={c['low']}  exceptions={c['exceptions']}")
    print(f"→ {out/'report.md'}")
    return 1 if c["high"] else 0


if __name__ == "__main__":
    sys.exit(main())
