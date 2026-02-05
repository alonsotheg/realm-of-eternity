#!/usr/bin/env python3
"""
Realm of Eternity - Game Data Validator
Validates all JSON data files against their schemas and cross-references.
"""

import json
import os
import sys
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass
from enum import Enum


class Severity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class ValidationResult:
    file: str
    severity: Severity
    message: str
    line: Optional[int] = None
    path: Optional[str] = None


class GameDataValidator:
    """Validates game data files for consistency and correctness."""

    def __init__(self, data_root: Path):
        self.data_root = data_root
        self.results: List[ValidationResult] = []
        self.items: Dict[str, Any] = {}
        self.npcs: Dict[str, Any] = {}
        self.skills: Set[str] = set()
        self.quests: Dict[str, Any] = {}
        self.regions: Dict[str, Any] = {}
        self.bosses: Dict[str, Any] = {}

    def add_error(self, file: str, message: str, path: str = None):
        self.results.append(ValidationResult(file, Severity.ERROR, message, path=path))

    def add_warning(self, file: str, message: str, path: str = None):
        self.results.append(ValidationResult(file, Severity.WARNING, message, path=path))

    def add_info(self, file: str, message: str, path: str = None):
        self.results.append(ValidationResult(file, Severity.INFO, message, path=path))

    def load_json(self, filepath: Path) -> Optional[Dict]:
        """Load and parse a JSON file."""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            self.add_error(str(filepath), f"Invalid JSON: {e}")
            return None
        except FileNotFoundError:
            self.add_error(str(filepath), "File not found")
            return None

    def validate_required_fields(self, data: Dict, required: List[str], file: str, path: str = ""):
        """Check that all required fields are present."""
        for field in required:
            if field not in data:
                self.add_error(file, f"Missing required field: {field}", path)

    def validate_string_field(self, value: Any, file: str, field: str, min_len: int = 1, max_len: int = 1000):
        """Validate a string field."""
        if not isinstance(value, str):
            self.add_error(file, f"{field} must be a string", field)
            return False
        if len(value) < min_len:
            self.add_error(file, f"{field} is too short (min {min_len})", field)
            return False
        if len(value) > max_len:
            self.add_error(file, f"{field} is too long (max {max_len})", field)
            return False
        return True

    def validate_number_field(self, value: Any, file: str, field: str,
                               min_val: float = None, max_val: float = None):
        """Validate a numeric field."""
        if not isinstance(value, (int, float)):
            self.add_error(file, f"{field} must be a number", field)
            return False
        if min_val is not None and value < min_val:
            self.add_error(file, f"{field} is below minimum ({min_val})", field)
            return False
        if max_val is not None and value > max_val:
            self.add_error(file, f"{field} is above maximum ({max_val})", field)
            return False
        return True

    def validate_item_reference(self, item_id: str, file: str, path: str):
        """Validate that an item ID exists in the items database."""
        if item_id not in self.items:
            self.add_warning(file, f"Unknown item reference: {item_id}", path)

    def validate_npc_reference(self, npc_id: str, file: str, path: str):
        """Validate that an NPC ID exists in the NPC database."""
        if npc_id not in self.npcs:
            self.add_warning(file, f"Unknown NPC reference: {npc_id}", path)

    def validate_skill_reference(self, skill_name: str, file: str, path: str):
        """Validate that a skill name is valid."""
        valid_skills = {
            "attack", "strength", "defence", "ranged", "prayer", "magic",
            "hitpoints", "crafting", "mining", "smithing", "fishing", "cooking",
            "firemaking", "woodcutting", "runecrafting", "slayer", "farming",
            "construction", "hunter", "summoning", "dungeoneering", "divination",
            "invention", "archaeology", "agility", "herblore", "thieving", "fletching"
        }
        if skill_name.lower() not in valid_skills:
            self.add_error(file, f"Invalid skill reference: {skill_name}", path)

    def validate_items_file(self, filepath: Path) -> bool:
        """Validate items.json structure."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        if "items" not in data:
            self.add_error(file, "Missing 'items' array")
            return False

        for i, item in enumerate(data.get("items", [])):
            path = f"items[{i}]"

            # Required fields
            self.validate_required_fields(item, ["id", "name"], file, path)

            if "id" in item:
                self.items[item["id"]] = item

            # Validate equipment stats if present
            if "equipment" in item:
                equip = item["equipment"]
                if "slot" in equip:
                    valid_slots = {"head", "cape", "neck", "ammo", "weapon", "shield",
                                   "body", "legs", "hands", "feet", "ring", "two_handed"}
                    if equip["slot"] not in valid_slots:
                        self.add_error(file, f"Invalid equipment slot: {equip['slot']}", f"{path}.equipment.slot")

                # Validate stat bonuses
                for stat in ["attack_bonus", "strength_bonus", "defence_bonus"]:
                    if stat in equip and not isinstance(equip[stat], (int, float, dict)):
                        self.add_error(file, f"Invalid {stat} format", f"{path}.equipment.{stat}")

            # Validate requirements
            if "requirements" in item:
                for skill, level in item["requirements"].items():
                    self.validate_skill_reference(skill, file, f"{path}.requirements")
                    self.validate_number_field(level, file, f"{path}.requirements.{skill}", 1, 120)

            # Validate value
            if "value" in item:
                self.validate_number_field(item["value"], file, f"{path}.value", 0)

        self.add_info(file, f"Validated {len(data.get('items', []))} items")
        return True

    def validate_npcs_file(self, filepath: Path) -> bool:
        """Validate NPCs.json structure."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        for i, npc in enumerate(data.get("npcs", [])):
            path = f"npcs[{i}]"

            self.validate_required_fields(npc, ["id", "name"], file, path)

            if "id" in npc:
                self.npcs[npc["id"]] = npc

            # Validate combat stats if present
            if "combat_level" in npc:
                self.validate_number_field(npc["combat_level"], file, f"{path}.combat_level", 1, 5000)

            if "hitpoints" in npc:
                self.validate_number_field(npc["hitpoints"], file, f"{path}.hitpoints", 1)

            # Validate drops
            if "drops" in npc:
                for j, drop in enumerate(npc["drops"]):
                    drop_path = f"{path}.drops[{j}]"
                    if "item_id" in drop:
                        self.validate_item_reference(drop["item_id"], file, drop_path)
                    if "drop_rate" in drop:
                        self.validate_number_field(drop["drop_rate"], file, f"{drop_path}.drop_rate", 0, 1)

        self.add_info(file, f"Validated {len(data.get('npcs', []))} NPCs")
        return True

    def validate_skills_file(self, filepath: Path) -> bool:
        """Validate skill definition files."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)
        skill_name = filepath.stem

        # Common skill file validations
        if "xp_table" in data:
            xp_table = data["xp_table"]
            if not isinstance(xp_table, list):
                self.add_error(file, "xp_table must be an array")
            else:
                prev_xp = 0
                for i, xp in enumerate(xp_table):
                    if not isinstance(xp, int) or xp < prev_xp:
                        self.add_error(file, f"Invalid XP value at level {i+1}", f"xp_table[{i}]")
                    prev_xp = xp

        # Validate training methods if present
        if "training_methods" in data:
            for i, method in enumerate(data["training_methods"]):
                path = f"training_methods[{i}]"
                if "level_required" in method:
                    self.validate_number_field(method["level_required"], file, f"{path}.level_required", 1, 120)
                if "xp_per_action" in method:
                    self.validate_number_field(method["xp_per_action"], file, f"{path}.xp_per_action", 0)

        self.add_info(file, f"Validated {skill_name} skill file")
        return True

    def validate_quests_file(self, filepath: Path) -> bool:
        """Validate quest definition files."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        for i, quest in enumerate(data.get("quests", [])):
            path = f"quests[{i}]"

            self.validate_required_fields(quest, ["id", "name", "difficulty"], file, path)

            if "id" in quest:
                self.quests[quest["id"]] = quest

            # Validate difficulty
            if "difficulty" in quest:
                valid_difficulties = {"novice", "intermediate", "experienced", "master", "grandmaster"}
                if quest["difficulty"].lower() not in valid_difficulties:
                    self.add_error(file, f"Invalid difficulty: {quest['difficulty']}", f"{path}.difficulty")

            # Validate quest points
            if "quest_points" in quest:
                self.validate_number_field(quest["quest_points"], file, f"{path}.quest_points", 1, 10)

            # Validate requirements
            if "requirements" in quest:
                reqs = quest["requirements"]
                if "skills" in reqs:
                    for skill, level in reqs["skills"].items():
                        self.validate_skill_reference(skill, file, f"{path}.requirements.skills")
                if "quests" in reqs:
                    for req_quest in reqs["quests"]:
                        if req_quest not in self.quests and req_quest != quest.get("id"):
                            self.add_warning(file, f"Unknown quest requirement: {req_quest}",
                                           f"{path}.requirements.quests")

            # Validate stages
            if "stages" in quest:
                for j, stage in enumerate(quest["stages"]):
                    stage_path = f"{path}.stages[{j}]"
                    self.validate_required_fields(stage, ["id", "description"], file, stage_path)

        self.add_info(file, f"Validated {len(data.get('quests', []))} quests")
        return True

    def validate_regions_file(self, filepath: Path) -> bool:
        """Validate world regions file."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        for i, region in enumerate(data.get("regions", [])):
            path = f"regions[{i}]"

            self.validate_required_fields(region, ["id", "name"], file, path)

            if "id" in region:
                self.regions[region["id"]] = region

            # Validate biome if present
            if "biome" in region:
                valid_biomes = {"temperate", "forest", "desert", "arctic", "swamp",
                               "jungle", "volcanic", "coastal", "mountain", "plains"}
                if region["biome"].lower() not in valid_biomes:
                    self.add_warning(file, f"Unknown biome: {region['biome']}", f"{path}.biome")

        self.add_info(file, f"Validated {len(data.get('regions', []))} regions")
        return True

    def validate_bosses_file(self, filepath: Path) -> bool:
        """Validate boss definitions file."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        for category in ["god_wars", "slayer_bosses", "raids", "solo_bosses"]:
            if category in data:
                bosses = data[category]
                if isinstance(bosses, dict):
                    for boss_id, boss in bosses.items():
                        path = f"{category}.{boss_id}"
                        self.bosses[boss_id] = boss

                        if "combat_level" in boss:
                            self.validate_number_field(boss["combat_level"], file,
                                                      f"{path}.combat_level", 1)
                        if "hitpoints" in boss:
                            self.validate_number_field(boss["hitpoints"], file,
                                                      f"{path}.hitpoints", 1)

                        # Validate drops
                        if "drops" in boss:
                            for j, drop in enumerate(boss["drops"]):
                                if "item_id" in drop:
                                    self.validate_item_reference(drop["item_id"], file,
                                                                f"{path}.drops[{j}]")

        self.add_info(file, f"Validated {len(self.bosses)} bosses")
        return True

    def validate_audio_spec(self, filepath: Path) -> bool:
        """Validate audio specification file."""
        data = self.load_json(filepath)
        if not data:
            return False

        file = str(filepath)

        # Validate audio engine settings
        if "audio_engine" in data:
            engine = data["audio_engine"]
            if "system" in engine and engine["system"] != "MetaSounds":
                self.add_warning(file, "Non-standard audio system specified")

        # Validate sound classes
        if "sound_classes" in data:
            classes = data["sound_classes"]
            if "master" not in classes:
                self.add_error(file, "Missing master sound class")

            for class_name, class_data in classes.items():
                if "volume" in class_data:
                    self.validate_number_field(class_data["volume"], file,
                                              f"sound_classes.{class_name}.volume", 0, 1)

        self.add_info(file, "Validated audio specification")
        return True

    def cross_validate(self):
        """Perform cross-file validation checks."""
        # Check for orphaned references
        # Check for duplicate IDs
        # Check for circular dependencies in quests

        all_ids = set()
        duplicates = set()

        for item_id in self.items:
            if item_id in all_ids:
                duplicates.add(item_id)
            all_ids.add(item_id)

        for npc_id in self.npcs:
            if npc_id in all_ids:
                duplicates.add(npc_id)
            all_ids.add(npc_id)

        for duplicate in duplicates:
            self.add_error("cross-validation", f"Duplicate ID found: {duplicate}")

    def run_all_validations(self) -> Tuple[int, int, int]:
        """Run all validations and return counts of errors, warnings, info."""

        # Find and validate all relevant files
        data_dir = self.data_root / "Data"
        ue5_dir = self.data_root / "UE5"

        # Items
        items_file = data_dir / "Items" / "items.json"
        if items_file.exists():
            self.validate_items_file(items_file)

        # NPCs
        npcs_file = data_dir / "NPCs" / "npcs.json"
        if npcs_file.exists():
            self.validate_npcs_file(npcs_file)

        # Skills
        skills_dir = data_dir / "Skills"
        if skills_dir.exists():
            for skill_file in skills_dir.glob("*.json"):
                self.validate_skills_file(skill_file)

        # Quests
        quests_file = data_dir / "Quests" / "quest_definitions.json"
        if quests_file.exists():
            self.validate_quests_file(quests_file)

        # Regions
        regions_file = data_dir / "World" / "regions.json"
        if regions_file.exists():
            self.validate_regions_file(regions_file)

        # Bosses
        bosses_file = data_dir / "Combat" / "bosses.json"
        if bosses_file.exists():
            self.validate_bosses_file(bosses_file)

        # Audio spec
        audio_file = ue5_dir / "Specifications" / "AudioSoundDesignSpec.json"
        if audio_file.exists():
            self.validate_audio_spec(audio_file)

        # Cross-validation
        self.cross_validate()

        # Count results
        errors = sum(1 for r in self.results if r.severity == Severity.ERROR)
        warnings = sum(1 for r in self.results if r.severity == Severity.WARNING)
        info = sum(1 for r in self.results if r.severity == Severity.INFO)

        return errors, warnings, info

    def print_results(self):
        """Print validation results to console."""
        for result in self.results:
            prefix = {
                Severity.ERROR: "\033[91mERROR\033[0m",
                Severity.WARNING: "\033[93mWARNING\033[0m",
                Severity.INFO: "\033[94mINFO\033[0m"
            }[result.severity]

            location = result.file
            if result.path:
                location += f" ({result.path})"

            print(f"{prefix}: {location}: {result.message}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Validate Realm of Eternity game data")
    parser.add_argument("--root", type=Path, default=Path("."),
                       help="Root directory of the project")
    parser.add_argument("--json", action="store_true",
                       help="Output results as JSON")
    parser.add_argument("--fail-on-warning", action="store_true",
                       help="Exit with error code on warnings")

    args = parser.parse_args()

    validator = GameDataValidator(args.root)
    errors, warnings, info = validator.run_all_validations()

    if args.json:
        output = {
            "summary": {
                "errors": errors,
                "warnings": warnings,
                "info": info
            },
            "results": [
                {
                    "file": r.file,
                    "severity": r.severity.value,
                    "message": r.message,
                    "path": r.path
                }
                for r in validator.results
            ]
        }
        print(json.dumps(output, indent=2))
    else:
        validator.print_results()
        print(f"\nSummary: {errors} errors, {warnings} warnings, {info} info")

    if errors > 0:
        sys.exit(1)
    elif warnings > 0 and args.fail_on_warning:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
