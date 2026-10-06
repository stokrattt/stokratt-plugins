"""Static checks for every plugin listed in the marketplace.

Run: python3 -m unittest discover tests
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
TEXT_SUFFIXES = {".md", ".json", ".txt", ""}
# The style states these rules itself, so the lines that name the banned characters are allowed.
RULE_LINES = ("Never use em dashes", "Never \u201cso\u201d")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def frontmatter(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    fields = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return fields
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return None


def text_files():
    for path in ROOT.rglob("*"):
        if path.is_file() and ".git" not in path.parts and path.suffix in TEXT_SUFFIXES:
            yield path


class MarketplaceTest(unittest.TestCase):
    def setUp(self):
        self.marketplace = load_json(MARKETPLACE)

    def test_has_required_fields(self):
        self.assertRegex(self.marketplace.get("name", ""), r"^[a-z0-9]+(-[a-z0-9]+)*$")
        self.assertTrue(self.marketplace.get("owner", {}).get("name"), "owner.name is required")
        self.assertTrue(self.marketplace.get("plugins"), "plugins list is empty")

    def test_every_plugin_entry_points_to_a_matching_plugin(self):
        for entry in self.marketplace["plugins"]:
            with self.subTest(plugin=entry.get("name")):
                source = ROOT / entry["source"]
                manifest = source / ".claude-plugin" / "plugin.json"
                self.assertTrue(manifest.is_file(), f"{manifest} is missing")
                self.assertEqual(load_json(manifest)["name"], entry["name"])

    def test_output_styles_have_frontmatter(self):
        for entry in self.marketplace["plugins"]:
            source = ROOT / entry["source"]
            styles = load_json(source / ".claude-plugin" / "plugin.json").get("outputStyles")
            if not styles:
                continue
            style_dir = source / styles
            files = list(style_dir.glob("*.md"))
            self.assertTrue(files, f"{style_dir} has no .md styles")
            for style in files:
                with self.subTest(style=str(style.relative_to(ROOT))):
                    fields = frontmatter(style)
                    self.assertIsNotNone(fields, "frontmatter is missing or not closed")
                    self.assertEqual(fields.get("name"), style.stem)
                    self.assertTrue(fields.get("description"), "description is empty")


class TextTest(unittest.TestCase):
    def test_no_long_dashes_or_curly_quotes(self):
        banned = re.compile("[\u2014\u2013\u201c\u201d\u00ab\u00bb]")
        for path in text_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if banned.search(line) and not any(rule in line for rule in RULE_LINES):
                    self.fail(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")

    def test_no_personal_paths_or_emails(self):
        personal = re.compile(r"/Users/|/home/|C:\\Users|[\w.+-]+@[\w-]+\.[a-z]{2,}")
        for path in text_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                self.assertIsNone(personal.search(line), f"{path.relative_to(ROOT)}:{number}")

    def test_placeholders_are_replaced(self):
        for path in text_files():
            self.assertNotIn("YOUR_GITHUB_USERNAME", path.read_text(encoding="utf-8"), path.name)


if __name__ == "__main__":
    unittest.main()
