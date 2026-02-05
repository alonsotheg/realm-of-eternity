#!/usr/bin/env python3
"""
Realm of Eternity - UE5 Data Table Exporter

This script converts game JSON data to CSV format for UE5 Data Table import.
Also generates UE5 struct definitions for C++ integration.

Usage:
    python export_to_ue5.py [--output-dir OUTPUT] [--format csv|json]
"""

import json
import csv
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ExportConfig:
    output_dir: Path
    format: str  # 'csv' or 'json'
    generate_structs: bool


class UE5Exporter:
    """Export game data to UE5-compatible formats."""

    def __init__(self, data_path: str, config: ExportConfig):
        self.data_path = Path(data_path)
        self.config = config
        self.exported_files: List[str] = []

    def ensure_output_dir(self):
        """Create output directory if it doesn't exist."""
        self.config.output_dir.mkdir(parents=True, exist_ok=True)

    def load_json(self, file_path: Path) -> Optional[Dict]:
        """Load a JSON file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
            return None

    def flatten_dict(self, d: Dict, parent_key: str = '', sep: str = '_') -> Dict:
        """Flatten nested dictionary for CSV export."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self.flatten_dict(v, new_key, sep).items())
            elif isinstance(v, list):
                # Convert list to JSON string for CSV
                items.append((new_key, json.dumps(v)))
            else:
                items.append((new_key, v))
        return dict(items)

    def export_items(self):
        """Export items to UE5 Data Table format."""
        items_file = self.data_path / "Items" / "items.json"
        if not items_file.exists():
            print("Items file not found, skipping...")
            return

        data = self.load_json(items_file)
        if not data:
            return

        items = data.get('items', [])

        # Prepare CSV data
        csv_rows = []
        for item in items:
            row = {
                'RowName': item.get('id', ''),
                'Name': item.get('name', ''),
                'Description': item.get('description', ''),
                'Type': item.get('type', ''),
                'Slot': item.get('slot', ''),
                'Stackable': str(item.get('stackable', False)).lower(),
                'MaxStack': item.get('maxStack', 1),
                'Tradeable': str(item.get('tradeable', True)).lower(),
                'Value': item.get('value', 0),
                'Weight': item.get('weight', 0.0),
                'Requirements': json.dumps(item.get('requirements', {})),
                'Stats': json.dumps(item.get('stats', {})),
                'Effects': json.dumps(item.get('effects', [])),
            }
            csv_rows.append(row)

        self._write_csv('DT_Items', csv_rows)
        print(f"Exported {len(csv_rows)} items")

    def export_enemies(self):
        """Export enemies to UE5 Data Table format."""
        enemies_file = self.data_path / "Npcs" / "enemies.json"
        if not enemies_file.exists():
            print("Enemies file not found, skipping...")
            return

        data = self.load_json(enemies_file)
        if not data:
            return

        # Export regular enemies
        csv_rows = []
        for enemy in data.get('enemies', []):
            row = {
                'RowName': enemy.get('id', ''),
                'Name': enemy.get('name', ''),
                'Description': enemy.get('description', ''),
                'Category': enemy.get('category', ''),
                'Level': enemy.get('level', 1),
                'CombatLevel': enemy.get('combatLevel', 1),
                'Health': enemy.get('health', 100),
                'AttackStyle': enemy.get('attackStyle', 'melee'),
                'Aggressive': str(enemy.get('aggressive', False)).lower(),
                'RespawnTime': enemy.get('respawnTime', 60),
                'Zones': json.dumps(enemy.get('zones', [])),
                'Stats': json.dumps(enemy.get('stats', {})),
                'Abilities': json.dumps(enemy.get('abilities', [])),
                'LootTableRef': enemy.get('lootTableRef', ''),
                'BeastslayerLevel': enemy.get('beastslayerLevel', 0),
                'Immunities': json.dumps(enemy.get('immunities', [])),
                'Weaknesses': json.dumps(enemy.get('weaknesses', [])),
            }
            csv_rows.append(row)

        self._write_csv('DT_Enemies', csv_rows)
        print(f"Exported {len(csv_rows)} enemies")

        # Export world bosses
        boss_rows = []
        for boss in data.get('worldBosses', []) + data.get('dungeonBosses', []):
            row = {
                'RowName': boss.get('id', ''),
                'Name': boss.get('name', ''),
                'Description': boss.get('description', ''),
                'Category': boss.get('category', ''),
                'Level': boss.get('level', 1),
                'CombatLevel': boss.get('combatLevel', 1),
                'Health': boss.get('health', 1000),
                'Phases': boss.get('phases', 1),
                'AttackStyles': json.dumps(boss.get('attackStyles', [])),
                'Zone': boss.get('zone', ''),
                'Stats': json.dumps(boss.get('stats', {})),
                'Abilities': json.dumps(boss.get('abilities', [])),
                'LootTableRef': boss.get('lootTableRef', ''),
                'MinPlayers': boss.get('minPlayers', 1),
                'Requirements': json.dumps(boss.get('requirements', {})),
            }
            boss_rows.append(row)

        if boss_rows:
            self._write_csv('DT_Bosses', boss_rows)
            print(f"Exported {len(boss_rows)} bosses")

    def export_abilities(self):
        """Export abilities to UE5 Data Table format."""
        abilities_file = self.data_path / "Combat" / "abilities.json"
        if not abilities_file.exists():
            print("Abilities file not found, skipping...")
            return

        data = self.load_json(abilities_file)
        if not data:
            return

        csv_rows = []
        for category in ['melee', 'ranged', 'magic', 'defense', 'prayer']:
            for ability in data.get(category, []):
                row = {
                    'RowName': ability.get('id', ''),
                    'Name': ability.get('name', ''),
                    'Description': ability.get('description', ''),
                    'Category': category,
                    'Type': ability.get('type', 'basic'),
                    'LevelRequired': ability.get('levelRequired', 1),
                    'Cooldown': ability.get('cooldown', 0),
                    'AdrenalineCost': ability.get('adrenalineCost', 0),
                    'AdrenalineGain': ability.get('adrenalineGain', 0),
                    'ManaCost': ability.get('manaCost', 0),
                    'PrayerDrain': ability.get('prayerDrain', 0),
                    'DamageType': ability.get('damageType', 'physical'),
                    'BaseDamage': ability.get('baseDamage', 0),
                    'DamageMultiplier': ability.get('damageMultiplier', 1.0),
                    'Duration': ability.get('duration', 0),
                    'Effects': json.dumps(ability.get('effects', [])),
                    'Animation': ability.get('animation', ''),
                    'VFX': ability.get('vfx', ''),
                    'SFX': ability.get('sfx', ''),
                }
                csv_rows.append(row)

        self._write_csv('DT_Abilities', csv_rows)
        print(f"Exported {len(csv_rows)} abilities")

    def export_zones(self):
        """Export zones to UE5 Data Table format."""
        zones_file = self.data_path / "World" / "zones.json"
        if not zones_file.exists():
            print("Zones file not found, skipping...")
            return

        data = self.load_json(zones_file)
        if not data:
            return

        csv_rows = []
        for region in data.get('regions', []):
            for zone in region.get('zones', []):
                row = {
                    'RowName': zone.get('id', ''),
                    'Name': zone.get('name', ''),
                    'Description': zone.get('description', ''),
                    'Region': region.get('name', ''),
                    'RegionId': region.get('id', ''),
                    'LevelRange': json.dumps(zone.get('levelRange', {})),
                    'Type': zone.get('type', 'open_world'),
                    'PvpEnabled': str(zone.get('pvpEnabled', False)).lower(),
                    'Connections': json.dumps(zone.get('connections', [])),
                    'SpawnPoints': json.dumps(zone.get('spawnPoints', [])),
                    'Bounds': json.dumps(zone.get('bounds', {})),
                    'Resources': json.dumps(zone.get('resources', [])),
                    'Enemies': json.dumps(zone.get('enemies', [])),
                }
                csv_rows.append(row)

        self._write_csv('DT_Zones', csv_rows)
        print(f"Exported {len(csv_rows)} zones")

    def export_quests(self):
        """Export quests to UE5 Data Table format."""
        quests_file = self.data_path / "Quests" / "quests.json"
        if not quests_file.exists():
            print("Quests file not found, skipping...")
            return

        data = self.load_json(quests_file)
        if not data:
            return

        csv_rows = []
        for quest in data.get('quests', []):
            row = {
                'RowName': quest.get('id', ''),
                'Name': quest.get('name', ''),
                'Description': quest.get('description', ''),
                'Difficulty': quest.get('difficulty', 'novice'),
                'Length': quest.get('length', 'short'),
                'StartNpc': quest.get('startNpc', ''),
                'Requirements': json.dumps(quest.get('requirements', {})),
                'Rewards': json.dumps(quest.get('rewards', {})),
                'Objectives': json.dumps(quest.get('objectives', [])),
                'QuestPoints': quest.get('questPoints', 1),
                'Members': str(quest.get('members', False)).lower(),
            }
            csv_rows.append(row)

        self._write_csv('DT_Quests', csv_rows)
        print(f"Exported {len(csv_rows)} quests")

    def export_loot_tables(self):
        """Export loot tables to UE5 format."""
        loot_file = self.data_path / "Npcs" / "loot_tables.json"
        if not loot_file.exists():
            print("Loot tables file not found, skipping...")
            return

        data = self.load_json(loot_file)
        if not data:
            return

        # Export enemy loot tables
        csv_rows = []
        for table_id, table in data.get('enemyLootTables', {}).items():
            row = {
                'RowName': table_id,
                'AlwaysDrops': json.dumps(table.get('alwaysDrops', [])),
                'MainDrops': json.dumps(table.get('mainDrops', [])),
                'UncommonDrops': json.dumps(table.get('uncommonDrops', [])),
                'RareDrops': json.dumps(table.get('rareDrops', [])),
                'BeastslayerOnly': str(table.get('beastslayerOnly', False)).lower(),
                'BeastslayerLevel': table.get('beastslayerLevel', 0),
            }
            csv_rows.append(row)

        self._write_csv('DT_LootTables', csv_rows)
        print(f"Exported {len(csv_rows)} loot tables")

        # Export shared pools
        pool_rows = []
        for pool_id, pool in data.get('sharedPools', {}).items():
            row = {
                'RowName': pool_id,
                'Description': pool.get('description', ''),
                'Items': json.dumps(pool.get('items', [])),
            }
            pool_rows.append(row)

        if pool_rows:
            self._write_csv('DT_LootPools', pool_rows)
            print(f"Exported {len(pool_rows)} loot pools")

    def export_recipes(self):
        """Export all recipes to UE5 format."""
        recipes_path = self.data_path / "Recipes"
        if not recipes_path.exists():
            print("Recipes directory not found, skipping...")
            return

        all_recipes = []
        for recipe_file in recipes_path.glob("*.json"):
            data = self.load_json(recipe_file)
            if not data:
                continue

            skill_name = recipe_file.stem
            for category, recipes in data.items():
                if not isinstance(recipes, list):
                    continue

                for recipe in recipes:
                    if not isinstance(recipe, dict):
                        continue

                    row = {
                        'RowName': recipe.get('id', ''),
                        'Name': recipe.get('name', ''),
                        'Skill': recipe.get('skill', skill_name),
                        'Category': category,
                        'Level': recipe.get('level', 1),
                        'XP': recipe.get('xp', 0),
                        'Duration': recipe.get('duration', 1),
                        'Inputs': json.dumps(recipe.get('inputs', [])),
                        'Outputs': json.dumps(recipe.get('outputs', [])),
                        'Tool': recipe.get('tool', ''),
                        'Facility': json.dumps(recipe.get('facility', [])),
                    }
                    all_recipes.append(row)

        if all_recipes:
            self._write_csv('DT_Recipes', all_recipes)
            print(f"Exported {len(all_recipes)} recipes")

    def export_achievements(self):
        """Export achievements to UE5 format."""
        achievements_file = self.data_path / "Achievements" / "achievements.json"
        if not achievements_file.exists():
            print("Achievements file not found, skipping...")
            return

        data = self.load_json(achievements_file)
        if not data:
            return

        csv_rows = []
        for achievement in data.get('achievements', []):
            row = {
                'RowName': achievement.get('id', ''),
                'Name': achievement.get('name', ''),
                'Description': achievement.get('description', ''),
                'Category': achievement.get('category', ''),
                'Tier': achievement.get('tier', 'easy'),
                'Points': achievement.get('points', 0),
                'Requirements': json.dumps(achievement.get('requirements', {})),
                'Rewards': json.dumps(achievement.get('rewards', {})),
            }
            csv_rows.append(row)

        self._write_csv('DT_Achievements', csv_rows)
        print(f"Exported {len(csv_rows)} achievements")

    def _write_csv(self, name: str, rows: List[Dict]):
        """Write data to CSV file."""
        if not rows:
            return

        output_file = self.config.output_dir / f"{name}.csv"
        fieldnames = list(rows[0].keys())

        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        self.exported_files.append(str(output_file))

    def generate_ue5_structs(self):
        """Generate C++ struct definitions for UE5."""
        structs_file = self.config.output_dir / "GameDataStructs.h"

        header = f"""// Auto-generated by export_to_ue5.py
// Generated: {datetime.now().isoformat()}
// DO NOT EDIT MANUALLY

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "GameDataStructs.generated.h"

/**
 * Item definition for the game
 */
USTRUCT(BlueprintType)
struct FItemDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Type;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Slot;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool Stackable = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 MaxStack = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool Tradeable = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Value = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Weight = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Requirements;  // JSON string

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Stats;  // JSON string

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Effects;  // JSON string
}};

/**
 * Enemy definition
 */
USTRUCT(BlueprintType)
struct FEnemyDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Level = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 CombatLevel = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Health = 100;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString AttackStyle;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool Aggressive = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 RespawnTime = 60;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Zones;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Stats;  // JSON object

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Abilities;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString LootTableRef;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 BeastslayerLevel = 0;
}};

/**
 * Ability definition
 */
USTRUCT(BlueprintType)
struct FAbilityDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Type;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 LevelRequired = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Cooldown = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 AdrenalineCost = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 AdrenalineGain = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ManaCost = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString DamageType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 BaseDamage = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DamageMultiplier = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Duration = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Effects;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Animation;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString VFX;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SFX;
}};

/**
 * Zone definition
 */
USTRUCT(BlueprintType)
struct FZoneDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Region;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RegionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString LevelRange;  // JSON object

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Type;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool PvpEnabled = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Connections;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SpawnPoints;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Bounds;  // JSON object
}};

/**
 * Quest definition
 */
USTRUCT(BlueprintType)
struct FQuestDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Difficulty;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Length;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StartNpc;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Requirements;  // JSON object

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Rewards;  // JSON object

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Objectives;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 QuestPoints = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool Members = false;
}};

/**
 * Recipe definition
 */
USTRUCT(BlueprintType)
struct FRecipeDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Skill;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Level = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 XP = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Duration = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Inputs;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Outputs;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Tool;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Facility;  // JSON array
}};

/**
 * Achievement definition
 */
USTRUCT(BlueprintType)
struct FAchievementDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Tier;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Points = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Requirements;  // JSON object

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Rewards;  // JSON object
}};

/**
 * Loot table definition
 */
USTRUCT(BlueprintType)
struct FLootTableDefinition : public FTableRowBase
{{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString AlwaysDrops;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString MainDrops;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString UncommonDrops;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString RareDrops;  // JSON array

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool BeastslayerOnly = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 BeastslayerLevel = 0;
}};
"""

        with open(structs_file, 'w', encoding='utf-8') as f:
            f.write(header)

        self.exported_files.append(str(structs_file))
        print(f"Generated UE5 struct definitions: {structs_file}")

    def run_export(self):
        """Run all exports."""
        self.ensure_output_dir()

        print(f"Exporting data from: {self.data_path}")
        print(f"Output directory: {self.config.output_dir}")
        print("-" * 50)

        self.export_items()
        self.export_enemies()
        self.export_abilities()
        self.export_zones()
        self.export_quests()
        self.export_loot_tables()
        self.export_recipes()
        self.export_achievements()

        if self.config.generate_structs:
            self.generate_ue5_structs()

        print("-" * 50)
        print(f"Export complete! {len(self.exported_files)} files generated.")
        for f in self.exported_files:
            print(f"  - {f}")


def main():
    parser = argparse.ArgumentParser(description='Export Realm of Eternity data to UE5 format')
    parser.add_argument('--data-path', default='Data', help='Path to Data directory')
    parser.add_argument('--output-dir', default='Export/UE5', help='Output directory for exports')
    parser.add_argument('--format', choices=['csv', 'json'], default='csv', help='Export format')
    parser.add_argument('--no-structs', action='store_true', help='Skip C++ struct generation')

    args = parser.parse_args()

    # Find data path
    data_path = Path(args.data_path)
    if not data_path.exists():
        script_dir = Path(__file__).parent.parent
        data_path = script_dir / 'Data'

    if not data_path.exists():
        print(f"Error: Data directory not found at {data_path}")
        sys.exit(1)

    # Configure output
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = Path(__file__).parent.parent / output_dir

    config = ExportConfig(
        output_dir=output_dir,
        format=args.format,
        generate_structs=not args.no_structs
    )

    exporter = UE5Exporter(str(data_path), config)
    exporter.run_export()


if __name__ == '__main__':
    main()
