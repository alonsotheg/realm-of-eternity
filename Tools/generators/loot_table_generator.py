#!/usr/bin/env python3
"""
Realm of Eternity - Loot Table Generator
Generates balanced loot tables for monsters, bosses, and activities.
"""

import json
import random
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple
from pathlib import Path


class Rarity(Enum):
    ALWAYS = "always"      # 100% drop rate
    COMMON = "common"      # 1/1 to 1/10
    UNCOMMON = "uncommon"  # 1/10 to 1/50
    RARE = "rare"          # 1/50 to 1/200
    VERY_RARE = "very_rare"  # 1/200 to 1/1000
    ULTRA_RARE = "ultra_rare"  # 1/1000 to 1/5000
    LEGENDARY = "legendary"  # 1/5000+


@dataclass
class DropRate:
    numerator: int = 1
    denominator: int = 1

    @property
    def probability(self) -> float:
        return self.numerator / self.denominator

    @property
    def display(self) -> str:
        return f"{self.numerator}/{self.denominator}"


@dataclass
class LootItem:
    item_id: str
    quantity_min: int = 1
    quantity_max: int = 1
    drop_rate: DropRate = field(default_factory=lambda: DropRate(1, 1))
    rarity: Rarity = Rarity.COMMON
    requirements: Optional[Dict] = None
    noted: bool = False


@dataclass
class LootTableConfig:
    source_type: str  # monster, boss, skilling, minigame, clue
    source_id: str
    combat_level: int = 1
    difficulty: str = "normal"
    guaranteed_drops: List[Dict] = field(default_factory=list)
    main_drops: List[Dict] = field(default_factory=list)
    rare_drop_table_access: bool = False
    gem_drop_table_access: bool = False
    unique_drops: List[Dict] = field(default_factory=list)
    tertiary_drops: List[Dict] = field(default_factory=list)


class LootTableGenerator:
    """Generates balanced loot tables based on source configuration."""

    # Base item pools by category
    COMMON_DROPS = {
        "bones": ["bones", "big_bones", "dragon_bones", "superior_dragon_bones"],
        "hides": ["cowhide", "green_dragonhide", "blue_dragonhide", "black_dragonhide"],
        "herbs": ["grimy_guam", "grimy_marrentill", "grimy_tarromin", "grimy_harralander",
                  "grimy_ranarr", "grimy_irit", "grimy_avantoe", "grimy_kwuarm",
                  "grimy_snapdragon", "grimy_cadantine", "grimy_lantadyme", "grimy_dwarf_weed",
                  "grimy_torstol"],
        "seeds": ["potato_seed", "onion_seed", "cabbage_seed", "tomato_seed",
                  "ranarr_seed", "snapdragon_seed", "torstol_seed"],
        "gems": ["uncut_sapphire", "uncut_emerald", "uncut_ruby", "uncut_diamond",
                 "uncut_dragonstone", "uncut_onyx"],
        "runes": ["fire_rune", "water_rune", "air_rune", "earth_rune", "mind_rune",
                  "chaos_rune", "death_rune", "blood_rune", "soul_rune"],
        "ores": ["copper_ore", "tin_ore", "iron_ore", "coal", "mithril_ore",
                 "adamantite_ore", "runite_ore"],
        "bars": ["bronze_bar", "iron_bar", "steel_bar", "mithril_bar",
                 "adamantite_bar", "runite_bar"],
        "coins": ["gold_coins"],
        "food": ["raw_shark", "raw_anglerfish", "cooked_shark", "manta_ray"],
        "potions": ["prayer_potion", "super_restore", "saradomin_brew"]
    }

    RARE_DROP_TABLE = [
        {"item_id": "loop_half_of_key", "rate": DropRate(1, 128)},
        {"item_id": "tooth_half_of_key", "rate": DropRate(1, 128)},
        {"item_id": "rune_spear", "rate": DropRate(1, 128)},
        {"item_id": "shield_left_half", "rate": DropRate(1, 256)},
        {"item_id": "dragon_med_helm", "rate": DropRate(1, 256)},
        {"item_id": "rune_kiteshield", "rate": DropRate(1, 64)},
        {"item_id": "rune_sq_shield", "rate": DropRate(1, 64)},
        {"item_id": "dragonstone", "rate": DropRate(1, 128)},
        {"item_id": "rune_2h_sword", "rate": DropRate(1, 64)},
        {"item_id": "rune_battleaxe", "rate": DropRate(1, 64)}
    ]

    GEM_DROP_TABLE = [
        {"item_id": "uncut_sapphire", "rate": DropRate(1, 4)},
        {"item_id": "uncut_emerald", "rate": DropRate(1, 8)},
        {"item_id": "uncut_ruby", "rate": DropRate(1, 16)},
        {"item_id": "uncut_diamond", "rate": DropRate(1, 64)},
        {"item_id": "uncut_dragonstone", "rate": DropRate(1, 256)}
    ]

    def __init__(self, config: LootTableConfig):
        self.config = config

    def generate(self) -> Dict:
        """Generate a complete loot table."""
        table = {
            "metadata": {
                "source_type": self.config.source_type,
                "source_id": self.config.source_id,
                "combat_level": self.config.combat_level,
                "difficulty": self.config.difficulty
            },
            "guaranteed": self._generate_guaranteed_drops(),
            "main_table": self._generate_main_drops(),
            "tertiary": self._generate_tertiary_drops()
        }

        if self.config.unique_drops:
            table["unique_table"] = self._generate_unique_drops()

        if self.config.rare_drop_table_access:
            table["rare_drop_table"] = self._generate_rdt_access()

        if self.config.gem_drop_table_access:
            table["gem_drop_table"] = self._generate_gdt_access()

        # Calculate and add statistics
        table["statistics"] = self._calculate_statistics(table)

        return table

    def _generate_guaranteed_drops(self) -> List[Dict]:
        """Generate guaranteed drops (always drop on kill)."""
        drops = []

        # Add configured guaranteed drops
        for drop in self.config.guaranteed_drops:
            drops.append({
                "item_id": drop.get("item_id"),
                "quantity": drop.get("quantity", 1),
                "rate": "1/1"
            })

        # Add bones based on combat level if not specified
        if not any(d.get("item_id", "").endswith("bones") for d in drops):
            if self.config.combat_level >= 200:
                drops.append({"item_id": "superior_dragon_bones", "quantity": 1, "rate": "1/1"})
            elif self.config.combat_level >= 100:
                drops.append({"item_id": "dragon_bones", "quantity": 1, "rate": "1/1"})
            elif self.config.combat_level >= 50:
                drops.append({"item_id": "big_bones", "quantity": 1, "rate": "1/1"})
            else:
                drops.append({"item_id": "bones", "quantity": 1, "rate": "1/1"})

        return drops

    def _generate_main_drops(self) -> List[Dict]:
        """Generate the main drop table."""
        drops = []

        # Use configured main drops
        for drop in self.config.main_drops:
            rate = drop.get("rate", {"num": 1, "denom": 10})
            drops.append({
                "item_id": drop.get("item_id"),
                "quantity_min": drop.get("quantity_min", 1),
                "quantity_max": drop.get("quantity_max", 1),
                "rate": f"{rate.get('num', 1)}/{rate.get('denom', 10)}",
                "rarity": self._classify_rarity(rate.get("num", 1), rate.get("denom", 10))
            })

        # Auto-generate additional drops based on combat level
        drops.extend(self._auto_generate_drops())

        return drops

    def _auto_generate_drops(self) -> List[Dict]:
        """Auto-generate appropriate drops based on combat level."""
        drops = []
        level = self.config.combat_level

        # Coins - scale with level
        coin_min = level * 10
        coin_max = level * 50
        drops.append({
            "item_id": "gold_coins",
            "quantity_min": coin_min,
            "quantity_max": coin_max,
            "rate": "3/10",
            "rarity": "common"
        })

        # Herbs - higher level = better herbs
        herb_index = min(len(self.COMMON_DROPS["herbs"]) - 1, level // 10)
        for i in range(max(0, herb_index - 2), herb_index + 1):
            if i < len(self.COMMON_DROPS["herbs"]):
                drops.append({
                    "item_id": self.COMMON_DROPS["herbs"][i],
                    "quantity_min": 1,
                    "quantity_max": 3,
                    "rate": f"1/{20 + i * 5}",
                    "rarity": "uncommon" if i < 8 else "rare"
                })

        # Runes - scale with level
        if level >= 20:
            rune_drops = [
                ("chaos_rune", 10, 30, "1/15"),
                ("death_rune", 5, 20, "1/20"),
            ]
            if level >= 60:
                rune_drops.append(("blood_rune", 5, 15, "1/30"))
            if level >= 80:
                rune_drops.append(("soul_rune", 3, 10, "1/40"))

            for rune_id, qmin, qmax, rate in rune_drops:
                drops.append({
                    "item_id": rune_id,
                    "quantity_min": qmin,
                    "quantity_max": qmax,
                    "rate": rate,
                    "rarity": "uncommon"
                })

        return drops

    def _generate_unique_drops(self) -> List[Dict]:
        """Generate unique/signature drops."""
        drops = []

        for unique in self.config.unique_drops:
            rate = unique.get("rate", {"num": 1, "denom": 512})
            drops.append({
                "item_id": unique.get("item_id"),
                "quantity": unique.get("quantity", 1),
                "rate": f"{rate.get('num', 1)}/{rate.get('denom', 512)}",
                "rarity": self._classify_rarity(rate.get("num", 1), rate.get("denom", 512)),
                "broadcast": unique.get("broadcast", True),
                "collection_log": True
            })

        return drops

    def _generate_tertiary_drops(self) -> List[Dict]:
        """Generate tertiary drops (rolled separately from main table)."""
        drops = []

        # Add configured tertiary drops
        for drop in self.config.tertiary_drops:
            rate = drop.get("rate", {"num": 1, "denom": 100})
            drops.append({
                "item_id": drop.get("item_id"),
                "quantity": drop.get("quantity", 1),
                "rate": f"{rate.get('num', 1)}/{rate.get('denom', 100)}",
                "tertiary": True
            })

        # Auto-add clue scrolls based on combat level
        if self.config.combat_level >= 10:
            drops.append({
                "item_id": "clue_scroll_easy",
                "quantity": 1,
                "rate": "1/128",
                "tertiary": True
            })
        if self.config.combat_level >= 40:
            drops.append({
                "item_id": "clue_scroll_medium",
                "quantity": 1,
                "rate": "1/256",
                "tertiary": True
            })
        if self.config.combat_level >= 80:
            drops.append({
                "item_id": "clue_scroll_hard",
                "quantity": 1,
                "rate": "1/512",
                "tertiary": True
            })
        if self.config.combat_level >= 150:
            drops.append({
                "item_id": "clue_scroll_elite",
                "quantity": 1,
                "rate": "1/1000",
                "tertiary": True
            })

        return drops

    def _generate_rdt_access(self) -> Dict:
        """Generate rare drop table access configuration."""
        return {
            "access_rate": f"1/{128 - min(100, self.config.combat_level)}",
            "items": [
                {
                    "item_id": item["item_id"],
                    "rate": item["rate"].display
                }
                for item in self.RARE_DROP_TABLE
            ]
        }

    def _generate_gdt_access(self) -> Dict:
        """Generate gem drop table access configuration."""
        return {
            "access_rate": f"1/{64 - min(50, self.config.combat_level // 2)}",
            "items": [
                {
                    "item_id": item["item_id"],
                    "rate": item["rate"].display
                }
                for item in self.GEM_DROP_TABLE
            ]
        }

    def _classify_rarity(self, numerator: int, denominator: int) -> str:
        """Classify drop rarity based on rate."""
        rate = numerator / denominator

        if rate >= 1:
            return "always"
        elif rate >= 0.1:
            return "common"
        elif rate >= 0.02:
            return "uncommon"
        elif rate >= 0.005:
            return "rare"
        elif rate >= 0.001:
            return "very_rare"
        elif rate >= 0.0002:
            return "ultra_rare"
        else:
            return "legendary"

    def _calculate_statistics(self, table: Dict) -> Dict:
        """Calculate statistics about the loot table."""
        def parse_rate(rate_str: str) -> float:
            parts = rate_str.split("/")
            return int(parts[0]) / int(parts[1])

        total_value = 0
        unique_count = len(table.get("unique_table", []))
        main_count = len(table.get("main_table", []))

        # Expected drops per kill
        expected_drops = sum(
            parse_rate(drop.get("rate", "1/1"))
            for drop in table.get("main_table", [])
        )

        # Unique dry rate (kills to expect all uniques)
        if unique_count > 0:
            unique_rates = [
                1 / parse_rate(drop.get("rate", "1/512"))
                for drop in table.get("unique_table", [])
            ]
            avg_dry_rate = sum(unique_rates) / len(unique_rates)
        else:
            avg_dry_rate = 0

        return {
            "main_drop_count": main_count,
            "unique_drop_count": unique_count,
            "expected_drops_per_kill": round(expected_drops, 2),
            "average_unique_dry_rate": round(avg_dry_rate, 0),
            "has_rdt_access": "rare_drop_table" in table,
            "has_gdt_access": "gem_drop_table" in table
        }


def generate_loot_table(config_path: Path, output_path: Path) -> Dict:
    """Generate a loot table from configuration file."""
    with open(config_path) as f:
        config_data = json.load(f)

    config = LootTableConfig(**config_data)
    generator = LootTableGenerator(config)
    table = generator.generate()

    with open(output_path, 'w') as f:
        json.dump(table, f, indent=2)

    return table


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate loot tables")
    parser.add_argument("--config", type=Path, help="Loot table configuration")
    parser.add_argument("--output", type=Path, default=Path("loot_table.json"))
    parser.add_argument("--preview", action="store_true", help="Print preview")

    args = parser.parse_args()

    if args.config and args.config.exists():
        table = generate_loot_table(args.config, args.output)
    else:
        # Example: Generate a boss loot table
        config = LootTableConfig(
            source_type="boss",
            source_id="example_boss",
            combat_level=250,
            difficulty="hard",
            guaranteed_drops=[
                {"item_id": "superior_dragon_bones", "quantity": 2}
            ],
            unique_drops=[
                {"item_id": "boss_pet", "rate": {"num": 1, "denom": 3000}},
                {"item_id": "boss_weapon", "rate": {"num": 1, "denom": 512}},
                {"item_id": "boss_armor", "rate": {"num": 1, "denom": 256}}
            ],
            rare_drop_table_access=True,
            gem_drop_table_access=True
        )

        generator = LootTableGenerator(config)
        table = generator.generate()

        with open(args.output, 'w') as f:
            json.dump(table, f, indent=2)

    print(f"Generated loot table for: {table['metadata']['source_id']}")
    print(f"Output: {args.output}")

    if args.preview:
        stats = table["statistics"]
        print(f"\nStatistics:")
        print(f"  Main drops: {stats['main_drop_count']}")
        print(f"  Unique drops: {stats['unique_drop_count']}")
        print(f"  Expected drops/kill: {stats['expected_drops_per_kill']}")
        if stats['average_unique_dry_rate'] > 0:
            print(f"  Avg unique dry rate: {int(stats['average_unique_dry_rate'])} kills")


if __name__ == "__main__":
    main()
