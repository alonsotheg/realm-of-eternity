#!/usr/bin/env python3
"""
Realm of Eternity - Game Data Validator

This script validates all JSON game data files to ensure:
- Valid JSON syntax
- Required fields present
- Cross-references are valid (items exist, zones exist, etc.)
- No duplicate IDs
- Data consistency

Usage:
    python validate_data.py [--fix] [--verbose]
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Set, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

class Severity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"

@dataclass
class ValidationResult:
    file: str
    message: str
    severity: Severity
    path: str = ""
    suggestion: str = ""

@dataclass
class ValidationReport:
    results: List[ValidationResult] = field(default_factory=list)

    def add(self, result: ValidationResult):
        self.results.append(result)

    def has_errors(self) -> bool:
        return any(r.severity == Severity.ERROR for r in self.results)

    def error_count(self) -> int:
        return sum(1 for r in self.results if r.severity == Severity.ERROR)

    def warning_count(self) -> int:
        return sum(1 for r in self.results if r.severity == Severity.WARNING)

class GameDataValidator:
    """Validates all game data files for consistency and correctness."""

    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.report = ValidationReport()

        # Caches for cross-reference validation
        self.item_ids: Set[str] = set()
        self.npc_ids: Set[str] = set()
        self.enemy_ids: Set[str] = set()
        self.zone_ids: Set[str] = set()
        self.quest_ids: Set[str] = set()
        self.ability_ids: Set[str] = set()
        self.recipe_ids: Set[str] = set()
        self.achievement_ids: Set[str] = set()
        self.dialogue_ids: Set[str] = set()
        self.loot_table_ids: Set[str] = set()
        self.skill_names: Set[str] = set()

        # All data loaded
        self.data: Dict[str, Any] = {}

    def load_json(self, file_path: Path) -> Optional[Dict]:
        """Load and parse a JSON file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            self.report.add(ValidationResult(
                file=str(file_path),
                message=f"Invalid JSON syntax: {e}",
                severity=Severity.ERROR,
                path=f"line {e.lineno}, column {e.colno}"
            ))
            return None
        except Exception as e:
            self.report.add(ValidationResult(
                file=str(file_path),
                message=f"Error reading file: {e}",
                severity=Severity.ERROR
            ))
            return None

    def collect_ids(self):
        """First pass: collect all IDs for cross-reference validation."""

        # Items
        items_file = self.data_path / "Items" / "items.json"
        if items_file.exists():
            data = self.load_json(items_file)
            if data:
                self.data['items'] = data
                for item in data.get('items', []):
                    self.item_ids.add(item.get('id', ''))

        # NPCs
        friendly_file = self.data_path / "Npcs" / "friendly.json"
        if friendly_file.exists():
            data = self.load_json(friendly_file)
            if data:
                self.data['friendly_npcs'] = data
                for npc in data.get('npcs', []):
                    self.npc_ids.add(npc.get('id', ''))

        # Enemies
        enemies_file = self.data_path / "Npcs" / "enemies.json"
        if enemies_file.exists():
            data = self.load_json(enemies_file)
            if data:
                self.data['enemies'] = data
                for enemy in data.get('enemies', []):
                    self.enemy_ids.add(enemy.get('id', ''))
                for boss in data.get('worldBosses', []):
                    self.enemy_ids.add(boss.get('id', ''))
                for boss in data.get('dungeonBosses', []):
                    self.enemy_ids.add(boss.get('id', ''))

        # Zones
        zones_file = self.data_path / "World" / "zones.json"
        if zones_file.exists():
            data = self.load_json(zones_file)
            if data:
                self.data['zones'] = data
                for region in data.get('regions', []):
                    for zone in region.get('zones', []):
                        self.zone_ids.add(zone.get('id', ''))

        # Quests
        quests_file = self.data_path / "Quests" / "quests.json"
        if quests_file.exists():
            data = self.load_json(quests_file)
            if data:
                self.data['quests'] = data
                for quest in data.get('quests', []):
                    self.quest_ids.add(quest.get('id', ''))

        # Abilities
        abilities_file = self.data_path / "Combat" / "abilities.json"
        if abilities_file.exists():
            data = self.load_json(abilities_file)
            if data:
                self.data['abilities'] = data
                for category in ['melee', 'ranged', 'magic', 'defense', 'prayer']:
                    for ability in data.get(category, []):
                        self.ability_ids.add(ability.get('id', ''))

        # Achievements
        achievements_file = self.data_path / "Achievements" / "achievements.json"
        if achievements_file.exists():
            data = self.load_json(achievements_file)
            if data:
                self.data['achievements'] = data
                for achievement in data.get('achievements', []):
                    self.achievement_ids.add(achievement.get('id', ''))

        # Loot Tables
        loot_file = self.data_path / "Npcs" / "loot_tables.json"
        if loot_file.exists():
            data = self.load_json(loot_file)
            if data:
                self.data['loot_tables'] = data
                for table_id in data.get('enemyLootTables', {}).keys():
                    self.loot_table_ids.add(table_id)
                for table_id in data.get('bossLootTables', {}).keys():
                    self.loot_table_ids.add(table_id)

        # Recipes
        recipes_path = self.data_path / "Recipes"
        if recipes_path.exists():
            for recipe_file in recipes_path.glob("*.json"):
                data = self.load_json(recipe_file)
                if data:
                    self.data[f'recipes_{recipe_file.stem}'] = data
                    for key, recipes in data.items():
                        if isinstance(recipes, list):
                            for recipe in recipes:
                                if isinstance(recipe, dict) and 'id' in recipe:
                                    self.recipe_ids.add(recipe.get('id', ''))
                                    if 'skill' in recipe:
                                        self.skill_names.add(recipe['skill'])

        # Define valid skills
        self.skill_names.update([
            'melee', 'ranged', 'magic', 'defense', 'hitpoints', 'prayer',
            'mining', 'smithing', 'woodcutting', 'firemaking', 'fishing',
            'cooking', 'farming', 'herblore', 'fletching', 'crafting',
            'runecrafting', 'construction', 'agility', 'thieving', 'beastslaying',
            'summoning', 'dungeoneering', 'divination', 'invention'
        ])

    def validate_items(self):
        """Validate items.json structure and references."""
        if 'items' not in self.data:
            return

        items = self.data['items']
        file_path = "Data/Items/items.json"
        seen_ids = set()

        for idx, item in enumerate(items.get('items', [])):
            item_id = item.get('id', '')

            # Check for duplicate IDs
            if item_id in seen_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Duplicate item ID: {item_id}",
                    severity=Severity.ERROR,
                    path=f"items[{idx}]"
                ))
            seen_ids.add(item_id)

            # Required fields
            required = ['id', 'name', 'type']
            for field in required:
                if field not in item:
                    self.report.add(ValidationResult(
                        file=file_path,
                        message=f"Missing required field '{field}' in item",
                        severity=Severity.ERROR,
                        path=f"items[{idx}]"
                    ))

            # Validate equipment requirements
            if 'requirements' in item:
                reqs = item['requirements']
                for skill, level in reqs.items():
                    if skill not in self.skill_names:
                        self.report.add(ValidationResult(
                            file=file_path,
                            message=f"Unknown skill '{skill}' in requirements",
                            severity=Severity.WARNING,
                            path=f"items[{idx}].requirements",
                            suggestion=f"Valid skills: {', '.join(sorted(self.skill_names))}"
                        ))
                    if not isinstance(level, int) or level < 1 or level > 120:
                        self.report.add(ValidationResult(
                            file=file_path,
                            message=f"Invalid level {level} for skill {skill}",
                            severity=Severity.ERROR,
                            path=f"items[{idx}].requirements.{skill}"
                        ))

    def validate_enemies(self):
        """Validate enemies.json structure and references."""
        if 'enemies' not in self.data:
            return

        enemies_data = self.data['enemies']
        file_path = "Data/Npcs/enemies.json"
        seen_ids = set()

        all_enemies = (
            enemies_data.get('enemies', []) +
            enemies_data.get('worldBosses', []) +
            enemies_data.get('dungeonBosses', [])
        )

        for idx, enemy in enumerate(all_enemies):
            enemy_id = enemy.get('id', '')

            # Check for duplicate IDs
            if enemy_id in seen_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Duplicate enemy ID: {enemy_id}",
                    severity=Severity.ERROR,
                    path=f"enemies[{idx}]"
                ))
            seen_ids.add(enemy_id)

            # Required fields
            required = ['id', 'name', 'level', 'health']
            for field in required:
                if field not in enemy:
                    self.report.add(ValidationResult(
                        file=file_path,
                        message=f"Missing required field '{field}' in enemy {enemy_id}",
                        severity=Severity.ERROR,
                        path=f"enemies[{idx}]"
                    ))

            # Validate loot table reference
            loot_ref = enemy.get('lootTableRef', '')
            if loot_ref and loot_ref not in self.loot_table_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Invalid loot table reference: {loot_ref}",
                    severity=Severity.WARNING,
                    path=f"enemies[{idx}].lootTableRef",
                    suggestion=f"Enemy: {enemy_id}"
                ))

            # Validate stats
            stats = enemy.get('stats', {})
            if not stats:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Missing stats for enemy {enemy_id}",
                    severity=Severity.WARNING,
                    path=f"enemies[{idx}].stats"
                ))

    def validate_loot_tables(self):
        """Validate loot_tables.json references."""
        if 'loot_tables' not in self.data:
            return

        loot_data = self.data['loot_tables']
        file_path = "Data/Npcs/loot_tables.json"

        def check_item_ref(item_id: str, path: str):
            if item_id not in self.item_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Unknown item reference: {item_id}",
                    severity=Severity.WARNING,
                    path=path,
                    suggestion="Item may not be defined in items.json"
                ))

        # Check shared pools
        for pool_name, pool in loot_data.get('sharedPools', {}).items():
            for idx, item in enumerate(pool.get('items', [])):
                check_item_ref(item.get('itemId', ''), f"sharedPools.{pool_name}.items[{idx}]")

        # Check enemy loot tables
        for table_name, table in loot_data.get('enemyLootTables', {}).items():
            for drop_type in ['mainDrops', 'uncommonDrops', 'rareDrops']:
                for idx, drop in enumerate(table.get(drop_type, [])):
                    if 'itemId' in drop:
                        check_item_ref(drop['itemId'], f"enemyLootTables.{table_name}.{drop_type}[{idx}]")

        # Check boss loot tables
        for table_name, table in loot_data.get('bossLootTables', {}).items():
            for drop_type in ['guaranteedDrops', 'commonDrops', 'rareDrops', 'ultraRareDrops']:
                for idx, drop in enumerate(table.get(drop_type, [])):
                    if 'itemId' in drop:
                        check_item_ref(drop['itemId'], f"bossLootTables.{table_name}.{drop_type}[{idx}]")

    def validate_recipes(self):
        """Validate all recipe files."""
        recipes_path = self.data_path / "Recipes"
        if not recipes_path.exists():
            return

        for recipe_file in recipes_path.glob("*.json"):
            file_path = f"Data/Recipes/{recipe_file.name}"
            data = self.data.get(f'recipes_{recipe_file.stem}', {})

            for category, recipes in data.items():
                if not isinstance(recipes, list):
                    continue

                for idx, recipe in enumerate(recipes):
                    if not isinstance(recipe, dict):
                        continue

                    recipe_id = recipe.get('id', 'unknown')

                    # Check inputs reference valid items
                    for input_idx, input_item in enumerate(recipe.get('inputs', [])):
                        item_id = input_item.get('itemId', '')
                        if item_id and item_id not in self.item_ids:
                            self.report.add(ValidationResult(
                                file=file_path,
                                message=f"Unknown input item: {item_id}",
                                severity=Severity.WARNING,
                                path=f"{category}[{idx}].inputs[{input_idx}]",
                                suggestion=f"Recipe: {recipe_id}"
                            ))

                    # Check outputs reference valid items
                    for output_idx, output_item in enumerate(recipe.get('outputs', [])):
                        item_id = output_item.get('itemId', '')
                        if item_id and item_id not in self.item_ids:
                            self.report.add(ValidationResult(
                                file=file_path,
                                message=f"Unknown output item: {item_id}",
                                severity=Severity.WARNING,
                                path=f"{category}[{idx}].outputs[{output_idx}]",
                                suggestion=f"Recipe: {recipe_id}"
                            ))

                    # Validate skill level
                    level = recipe.get('level', 0)
                    if not isinstance(level, int) or level < 1 or level > 99:
                        self.report.add(ValidationResult(
                            file=file_path,
                            message=f"Invalid skill level: {level}",
                            severity=Severity.ERROR,
                            path=f"{category}[{idx}].level",
                            suggestion=f"Recipe: {recipe_id}. Level must be 1-99"
                        ))

    def validate_quests(self):
        """Validate quests.json structure and references."""
        if 'quests' not in self.data:
            return

        quests_data = self.data['quests']
        file_path = "Data/Quests/quests.json"
        seen_ids = set()

        for idx, quest in enumerate(quests_data.get('quests', [])):
            quest_id = quest.get('id', '')

            # Check for duplicate IDs
            if quest_id in seen_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Duplicate quest ID: {quest_id}",
                    severity=Severity.ERROR,
                    path=f"quests[{idx}]"
                ))
            seen_ids.add(quest_id)

            # Validate requirements reference valid quests
            for req_idx, req in enumerate(quest.get('requirements', {}).get('quests', [])):
                if req not in self.quest_ids:
                    self.report.add(ValidationResult(
                        file=file_path,
                        message=f"Unknown quest requirement: {req}",
                        severity=Severity.WARNING,
                        path=f"quests[{idx}].requirements.quests[{req_idx}]",
                        suggestion=f"Quest: {quest_id}"
                    ))

            # Validate rewards reference valid items
            for reward_idx, reward in enumerate(quest.get('rewards', {}).get('items', [])):
                item_id = reward.get('itemId', '')
                if item_id and item_id not in self.item_ids:
                    self.report.add(ValidationResult(
                        file=file_path,
                        message=f"Unknown reward item: {item_id}",
                        severity=Severity.WARNING,
                        path=f"quests[{idx}].rewards.items[{reward_idx}]",
                        suggestion=f"Quest: {quest_id}"
                    ))

    def validate_achievements(self):
        """Validate achievements.json structure and references."""
        if 'achievements' not in self.data:
            return

        achievements_data = self.data['achievements']
        file_path = "Data/Achievements/achievements.json"
        seen_ids = set()

        valid_tiers = achievements_data.get('tiers', {}).keys()
        valid_categories = [c['id'] for c in achievements_data.get('categories', [])]

        for idx, achievement in enumerate(achievements_data.get('achievements', [])):
            ach_id = achievement.get('id', '')

            # Check for duplicate IDs
            if ach_id in seen_ids:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Duplicate achievement ID: {ach_id}",
                    severity=Severity.ERROR,
                    path=f"achievements[{idx}]"
                ))
            seen_ids.add(ach_id)

            # Validate tier
            tier = achievement.get('tier', '')
            if tier and tier not in valid_tiers:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Invalid tier: {tier}",
                    severity=Severity.ERROR,
                    path=f"achievements[{idx}].tier",
                    suggestion=f"Valid tiers: {', '.join(valid_tiers)}"
                ))

            # Validate category
            category = achievement.get('category', '')
            if category and category not in valid_categories:
                self.report.add(ValidationResult(
                    file=file_path,
                    message=f"Invalid category: {category}",
                    severity=Severity.ERROR,
                    path=f"achievements[{idx}].category",
                    suggestion=f"Valid categories: {', '.join(valid_categories)}"
                ))

    def validate_zones(self):
        """Validate zones.json structure."""
        if 'zones' not in self.data:
            return

        zones_data = self.data['zones']
        file_path = "Data/World/zones.json"
        seen_ids = set()

        for region_idx, region in enumerate(zones_data.get('regions', [])):
            for zone_idx, zone in enumerate(region.get('zones', [])):
                zone_id = zone.get('id', '')

                # Check for duplicate IDs
                if zone_id in seen_ids:
                    self.report.add(ValidationResult(
                        file=file_path,
                        message=f"Duplicate zone ID: {zone_id}",
                        severity=Severity.ERROR,
                        path=f"regions[{region_idx}].zones[{zone_idx}]"
                    ))
                seen_ids.add(zone_id)

                # Validate connections reference valid zones
                for conn in zone.get('connections', []):
                    # This is a bit tricky since we're iterating while collecting
                    pass  # Will be validated in second pass

        # Second pass: validate connections
        for region in zones_data.get('regions', []):
            for zone in region.get('zones', []):
                zone_id = zone.get('id', '')
                for conn_idx, conn in enumerate(zone.get('connections', [])):
                    if conn not in self.zone_ids:
                        self.report.add(ValidationResult(
                            file=file_path,
                            message=f"Invalid zone connection: {conn}",
                            severity=Severity.ERROR,
                            path=f"zones.{zone_id}.connections[{conn_idx}]",
                            suggestion=f"Zone {zone_id} references non-existent zone {conn}"
                        ))

    def run_validation(self) -> ValidationReport:
        """Run all validations and return the report."""
        print("Collecting IDs from all data files...")
        self.collect_ids()

        print(f"Found: {len(self.item_ids)} items, {len(self.enemy_ids)} enemies, "
              f"{len(self.zone_ids)} zones, {len(self.quest_ids)} quests")

        print("\nValidating data files...")
        self.validate_items()
        self.validate_enemies()
        self.validate_loot_tables()
        self.validate_recipes()
        self.validate_quests()
        self.validate_achievements()
        self.validate_zones()

        return self.report

    def print_report(self, verbose: bool = False):
        """Print the validation report."""
        errors = [r for r in self.report.results if r.severity == Severity.ERROR]
        warnings = [r for r in self.report.results if r.severity == Severity.WARNING]
        infos = [r for r in self.report.results if r.severity == Severity.INFO]

        print("\n" + "=" * 60)
        print("VALIDATION REPORT")
        print("=" * 60)

        if errors:
            print(f"\nERRORS ({len(errors)}):")
            print("-" * 40)
            for result in errors:
                print(f"  [{result.file}]")
                print(f"    {result.message}")
                if result.path:
                    print(f"    Path: {result.path}")
                if result.suggestion:
                    print(f"    Suggestion: {result.suggestion}")
                print()

        if warnings:
            print(f"\nWARNINGS ({len(warnings)}):")
            print("-" * 40)
            for result in warnings:
                print(f"  [{result.file}]")
                print(f"    {result.message}")
                if result.path:
                    print(f"    Path: {result.path}")
                if verbose and result.suggestion:
                    print(f"    Suggestion: {result.suggestion}")
                print()

        if verbose and infos:
            print(f"\nINFO ({len(infos)}):")
            print("-" * 40)
            for result in infos:
                print(f"  [{result.file}] {result.message}")

        print("\n" + "=" * 60)
        print(f"SUMMARY: {len(errors)} errors, {len(warnings)} warnings")
        print("=" * 60)

        if not errors and not warnings:
            print("\nAll validations passed!")
            return 0
        elif errors:
            print("\nValidation failed with errors.")
            return 1
        else:
            print("\nValidation passed with warnings.")
            return 0


def main():
    parser = argparse.ArgumentParser(description='Validate Realm of Eternity game data')
    parser.add_argument('--data-path', default='Data', help='Path to Data directory')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--fix', action='store_true', help='Attempt to fix issues (not implemented)')

    args = parser.parse_args()

    # Find data path
    data_path = Path(args.data_path)
    if not data_path.exists():
        # Try relative to script location
        script_dir = Path(__file__).parent.parent
        data_path = script_dir / 'Data'

    if not data_path.exists():
        print(f"Error: Data directory not found at {data_path}")
        sys.exit(1)

    print(f"Validating data in: {data_path.absolute()}")

    validator = GameDataValidator(str(data_path))
    validator.run_validation()
    exit_code = validator.print_report(verbose=args.verbose)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
