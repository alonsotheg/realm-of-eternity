#!/usr/bin/env python3
"""
Realm of Eternity - Procedural Dungeon Generator
Generates randomized dungeon layouts with rooms, corridors, and encounters.
"""

import json
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple, Set
from pathlib import Path


class RoomType(Enum):
    ENTRANCE = "entrance"
    CORRIDOR = "corridor"
    COMBAT = "combat"
    PUZZLE = "puzzle"
    TREASURE = "treasure"
    BOSS = "boss"
    SKILL_CHECK = "skill_check"
    SAFE = "safe"
    SECRET = "secret"


class TileType(Enum):
    FLOOR = "floor"
    WALL = "wall"
    DOOR = "door"
    LOCKED_DOOR = "locked_door"
    TRAP = "trap"
    WATER = "water"
    LAVA = "lava"
    PIT = "pit"
    STAIRS_UP = "stairs_up"
    STAIRS_DOWN = "stairs_down"


@dataclass
class Room:
    id: int
    room_type: RoomType
    x: int
    y: int
    width: int
    height: int
    connections: List[int] = field(default_factory=list)
    encounters: List[Dict] = field(default_factory=list)
    loot: List[Dict] = field(default_factory=list)
    puzzle: Optional[Dict] = None
    skill_requirement: Optional[Dict] = None


@dataclass
class DungeonConfig:
    name: str
    theme: str
    difficulty: str  # novice, intermediate, experienced, master, grandmaster
    min_rooms: int = 10
    max_rooms: int = 20
    min_room_size: int = 5
    max_room_size: int = 15
    width: int = 100
    height: int = 100
    combat_room_chance: float = 0.4
    puzzle_room_chance: float = 0.15
    treasure_room_chance: float = 0.1
    secret_room_chance: float = 0.05
    trap_density: float = 0.1
    required_skills: List[Dict] = field(default_factory=list)
    monster_table: List[Dict] = field(default_factory=list)
    loot_table: List[Dict] = field(default_factory=list)
    boss_config: Optional[Dict] = None


class DungeonGenerator:
    """Procedural dungeon generator using BSP and cellular automata."""

    def __init__(self, config: DungeonConfig, seed: Optional[int] = None):
        self.config = config
        self.seed = seed or random.randint(0, 2**32)
        random.seed(self.seed)
        self.rooms: List[Room] = []
        self.grid: List[List[TileType]] = []
        self.next_room_id = 0

    def generate(self) -> Dict:
        """Generate a complete dungeon."""
        # Initialize grid
        self.grid = [[TileType.WALL for _ in range(self.config.width)]
                     for _ in range(self.config.height)]

        # Generate rooms using BSP
        self._generate_rooms_bsp()

        # Connect rooms
        self._connect_rooms()

        # Place entrance and boss room
        self._place_special_rooms()

        # Add encounters and loot
        self._populate_rooms()

        # Add traps
        self._add_traps()

        # Add secret rooms
        self._add_secret_rooms()

        return self._export()

    def _generate_rooms_bsp(self):
        """Generate rooms using Binary Space Partitioning."""
        num_rooms = random.randint(self.config.min_rooms, self.config.max_rooms)

        for _ in range(num_rooms * 3):  # Try multiple times
            if len(self.rooms) >= num_rooms:
                break

            # Random room dimensions
            width = random.randint(self.config.min_room_size, self.config.max_room_size)
            height = random.randint(self.config.min_room_size, self.config.max_room_size)

            # Random position (with padding)
            x = random.randint(2, self.config.width - width - 2)
            y = random.randint(2, self.config.height - height - 2)

            # Check for overlap
            if not self._check_room_overlap(x, y, width, height):
                room = Room(
                    id=self.next_room_id,
                    room_type=RoomType.CORRIDOR,  # Will be assigned later
                    x=x, y=y, width=width, height=height
                )
                self.next_room_id += 1
                self.rooms.append(room)
                self._carve_room(room)

    def _check_room_overlap(self, x: int, y: int, width: int, height: int) -> bool:
        """Check if a room would overlap with existing rooms."""
        padding = 2
        for room in self.rooms:
            if (x < room.x + room.width + padding and
                x + width + padding > room.x and
                y < room.y + room.height + padding and
                y + height + padding > room.y):
                return True
        return False

    def _carve_room(self, room: Room):
        """Carve out a room in the grid."""
        for y in range(room.y, room.y + room.height):
            for x in range(room.x, room.x + room.width):
                self.grid[y][x] = TileType.FLOOR

    def _connect_rooms(self):
        """Connect rooms with corridors using minimum spanning tree."""
        if len(self.rooms) < 2:
            return

        connected: Set[int] = {0}
        unconnected: Set[int] = set(range(1, len(self.rooms)))

        while unconnected:
            best_dist = float('inf')
            best_pair = (0, 1)

            for c in connected:
                for u in unconnected:
                    dist = self._room_distance(self.rooms[c], self.rooms[u])
                    if dist < best_dist:
                        best_dist = dist
                        best_pair = (c, u)

            self._carve_corridor(self.rooms[best_pair[0]], self.rooms[best_pair[1]])
            self.rooms[best_pair[0]].connections.append(best_pair[1])
            self.rooms[best_pair[1]].connections.append(best_pair[0])

            connected.add(best_pair[1])
            unconnected.remove(best_pair[1])

        # Add some extra connections for loops
        extra_connections = random.randint(1, len(self.rooms) // 4)
        for _ in range(extra_connections):
            r1 = random.choice(self.rooms)
            r2 = random.choice(self.rooms)
            if r1.id != r2.id and r2.id not in r1.connections:
                self._carve_corridor(r1, r2)
                r1.connections.append(r2.id)
                r2.connections.append(r1.id)

    def _room_distance(self, r1: Room, r2: Room) -> float:
        """Calculate distance between room centers."""
        c1 = (r1.x + r1.width // 2, r1.y + r1.height // 2)
        c2 = (r2.x + r2.width // 2, r2.y + r2.height // 2)
        return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2) ** 0.5

    def _carve_corridor(self, r1: Room, r2: Room):
        """Carve a corridor between two rooms."""
        c1 = (r1.x + r1.width // 2, r1.y + r1.height // 2)
        c2 = (r2.x + r2.width // 2, r2.y + r2.height // 2)

        # L-shaped corridor
        if random.random() < 0.5:
            self._carve_h_corridor(c1[0], c2[0], c1[1])
            self._carve_v_corridor(c1[1], c2[1], c2[0])
        else:
            self._carve_v_corridor(c1[1], c2[1], c1[0])
            self._carve_h_corridor(c1[0], c2[0], c2[1])

    def _carve_h_corridor(self, x1: int, x2: int, y: int):
        """Carve a horizontal corridor."""
        for x in range(min(x1, x2), max(x1, x2) + 1):
            if 0 <= x < self.config.width and 0 <= y < self.config.height:
                self.grid[y][x] = TileType.FLOOR

    def _carve_v_corridor(self, y1: int, y2: int, x: int):
        """Carve a vertical corridor."""
        for y in range(min(y1, y2), max(y1, y2) + 1):
            if 0 <= x < self.config.width and 0 <= y < self.config.height:
                self.grid[y][x] = TileType.FLOOR

    def _place_special_rooms(self):
        """Designate entrance and boss rooms."""
        if not self.rooms:
            return

        # Entrance is the first room (or one closest to edge)
        entrance = min(self.rooms, key=lambda r: min(r.x, r.y,
                       self.config.width - r.x - r.width,
                       self.config.height - r.y - r.height))
        entrance.room_type = RoomType.ENTRANCE

        # Boss room is furthest from entrance
        boss = max(self.rooms, key=lambda r: self._room_distance(entrance, r))
        boss.room_type = RoomType.BOSS

    def _populate_rooms(self):
        """Add encounters and loot to rooms."""
        for room in self.rooms:
            if room.room_type in (RoomType.ENTRANCE, RoomType.BOSS):
                continue

            roll = random.random()
            if roll < self.config.combat_room_chance:
                room.room_type = RoomType.COMBAT
                room.encounters = self._generate_encounters(room)
            elif roll < self.config.combat_room_chance + self.config.puzzle_room_chance:
                room.room_type = RoomType.PUZZLE
                room.puzzle = self._generate_puzzle()
            elif roll < (self.config.combat_room_chance +
                        self.config.puzzle_room_chance +
                        self.config.treasure_room_chance):
                room.room_type = RoomType.TREASURE
                room.loot = self._generate_loot(room, bonus=True)
            else:
                room.room_type = RoomType.SAFE

            # All non-entrance rooms can have loot
            if room.room_type != RoomType.TREASURE and random.random() < 0.3:
                room.loot = self._generate_loot(room)

        # Populate boss room
        boss_rooms = [r for r in self.rooms if r.room_type == RoomType.BOSS]
        for boss_room in boss_rooms:
            boss_room.encounters = self._generate_boss_encounter()
            boss_room.loot = self._generate_loot(boss_room, boss=True)

    def _generate_encounters(self, room: Room) -> List[Dict]:
        """Generate monster encounters for a room."""
        if not self.config.monster_table:
            return []

        num_monsters = random.randint(1, max(1, (room.width * room.height) // 20))
        encounters = []

        for _ in range(num_monsters):
            monster = random.choice(self.config.monster_table)
            encounters.append({
                "monster_id": monster.get("id", "generic_monster"),
                "level": monster.get("level", 1),
                "position": {
                    "x": random.randint(room.x + 1, room.x + room.width - 2),
                    "y": random.randint(room.y + 1, room.y + room.height - 2)
                }
            })

        return encounters

    def _generate_boss_encounter(self) -> List[Dict]:
        """Generate boss encounter."""
        if self.config.boss_config:
            return [{
                "monster_id": self.config.boss_config.get("id", "dungeon_boss"),
                "level": self.config.boss_config.get("level", 100),
                "is_boss": True,
                "mechanics": self.config.boss_config.get("mechanics", [])
            }]
        return []

    def _generate_loot(self, room: Room, bonus: bool = False, boss: bool = False) -> List[Dict]:
        """Generate loot for a room."""
        if not self.config.loot_table:
            return []

        num_items = random.randint(1, 3)
        if bonus:
            num_items += 2
        if boss:
            num_items += 3

        loot = []
        for _ in range(num_items):
            item = random.choice(self.config.loot_table)
            quantity = random.randint(1, item.get("max_quantity", 1))
            if boss:
                quantity *= 2
            loot.append({
                "item_id": item.get("id", "gold_coins"),
                "quantity": quantity
            })

        return loot

    def _generate_puzzle(self) -> Dict:
        """Generate a puzzle configuration."""
        puzzle_types = [
            {"type": "lever_sequence", "levers": random.randint(3, 6)},
            {"type": "pressure_plates", "plates": random.randint(4, 9)},
            {"type": "symbol_matching", "symbols": random.randint(3, 5)},
            {"type": "torch_lighting", "torches": random.randint(4, 8)},
            {"type": "block_pushing", "blocks": random.randint(2, 4)}
        ]
        return random.choice(puzzle_types)

    def _add_traps(self):
        """Add traps to the dungeon."""
        floor_tiles = []
        for y in range(self.config.height):
            for x in range(self.config.width):
                if self.grid[y][x] == TileType.FLOOR:
                    floor_tiles.append((x, y))

        num_traps = int(len(floor_tiles) * self.config.trap_density)
        trap_tiles = random.sample(floor_tiles, min(num_traps, len(floor_tiles)))

        for x, y in trap_tiles:
            self.grid[y][x] = TileType.TRAP

    def _add_secret_rooms(self):
        """Add secret rooms to the dungeon."""
        if random.random() > self.config.secret_room_chance:
            return

        # Try to add a secret room adjacent to an existing room
        for _ in range(10):
            base_room = random.choice(self.rooms)
            width = random.randint(3, 6)
            height = random.randint(3, 6)

            # Try each side
            positions = [
                (base_room.x - width - 1, base_room.y),  # Left
                (base_room.x + base_room.width + 1, base_room.y),  # Right
                (base_room.x, base_room.y - height - 1),  # Top
                (base_room.x, base_room.y + base_room.height + 1)  # Bottom
            ]

            for x, y in positions:
                if (x > 0 and y > 0 and
                    x + width < self.config.width and
                    y + height < self.config.height and
                    not self._check_room_overlap(x, y, width, height)):

                    secret = Room(
                        id=self.next_room_id,
                        room_type=RoomType.SECRET,
                        x=x, y=y, width=width, height=height
                    )
                    self.next_room_id += 1
                    self.rooms.append(secret)
                    self._carve_room(secret)
                    secret.loot = self._generate_loot(secret, bonus=True)
                    return

    def _export(self) -> Dict:
        """Export dungeon to dictionary format."""
        return {
            "metadata": {
                "name": self.config.name,
                "theme": self.config.theme,
                "difficulty": self.config.difficulty,
                "seed": self.seed,
                "width": self.config.width,
                "height": self.config.height
            },
            "rooms": [
                {
                    "id": room.id,
                    "type": room.room_type.value,
                    "bounds": {
                        "x": room.x,
                        "y": room.y,
                        "width": room.width,
                        "height": room.height
                    },
                    "connections": room.connections,
                    "encounters": room.encounters,
                    "loot": room.loot,
                    "puzzle": room.puzzle,
                    "skill_requirement": room.skill_requirement
                }
                for room in self.rooms
            ],
            "grid": [
                [tile.value for tile in row]
                for row in self.grid
            ],
            "required_skills": self.config.required_skills
        }


def generate_dungeon(config_path: Path, output_path: Path, seed: Optional[int] = None):
    """Generate a dungeon from a config file."""
    with open(config_path) as f:
        config_data = json.load(f)

    config = DungeonConfig(**config_data)
    generator = DungeonGenerator(config, seed)
    dungeon = generator.generate()

    with open(output_path, 'w') as f:
        json.dump(dungeon, f, indent=2)

    return dungeon


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate procedural dungeons")
    parser.add_argument("--config", type=Path, help="Dungeon configuration file")
    parser.add_argument("--output", type=Path, default=Path("dungeon.json"),
                       help="Output file path")
    parser.add_argument("--seed", type=int, help="Random seed for reproducibility")
    parser.add_argument("--preview", action="store_true", help="Show ASCII preview")

    args = parser.parse_args()

    # Default config if none provided
    if args.config and args.config.exists():
        dungeon = generate_dungeon(args.config, args.output, args.seed)
    else:
        config = DungeonConfig(
            name="Generated Dungeon",
            theme="cave",
            difficulty="intermediate",
            monster_table=[
                {"id": "cave_spider", "level": 20},
                {"id": "cave_crawler", "level": 25},
                {"id": "moss_giant", "level": 42}
            ],
            loot_table=[
                {"id": "gold_coins", "max_quantity": 500},
                {"id": "iron_ore", "max_quantity": 5},
                {"id": "healing_potion", "max_quantity": 2}
            ],
            boss_config={
                "id": "cave_horror",
                "level": 80,
                "mechanics": ["aoe_attack", "summon_adds"]
            }
        )
        generator = DungeonGenerator(config, args.seed)
        dungeon = generator.generate()

        with open(args.output, 'w') as f:
            json.dump(dungeon, f, indent=2)

    print(f"Generated dungeon with {len(dungeon['rooms'])} rooms")
    print(f"Seed: {dungeon['metadata']['seed']}")
    print(f"Output: {args.output}")

    if args.preview:
        print("\nASCII Preview:")
        symbols = {
            "floor": ".",
            "wall": "#",
            "door": "+",
            "trap": "^",
            "stairs_up": "<",
            "stairs_down": ">"
        }
        grid = dungeon["grid"]
        for row in grid[::2]:  # Sample every other row for terminal
            print("".join(symbols.get(tile, "?") for tile in row[::2]))


if __name__ == "__main__":
    main()
