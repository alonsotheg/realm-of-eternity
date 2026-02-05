# Realm of Eternity - Development Tools

This directory contains Python tools for validating and exporting game data.

## Tools Overview

### validate_data.py
Validates all JSON game data files for:
- Valid JSON syntax
- Required fields present
- Cross-references (items, zones, quests exist)
- No duplicate IDs
- Data consistency

**Usage:**
```bash
# Run from repository root
python Tools/validate_data.py

# Verbose output
python Tools/validate_data.py --verbose

# Specify custom data path
python Tools/validate_data.py --data-path /path/to/Data
```

### export_to_ue5.py
Converts JSON game data to CSV format for UE5 Data Table import.
Also generates C++ struct definitions.

**Usage:**
```bash
# Run from repository root
python Tools/export_to_ue5.py

# Custom output directory
python Tools/export_to_ue5.py --output-dir Build/UE5Data

# Skip C++ struct generation
python Tools/export_to_ue5.py --no-structs
```

**Output:**
- `DT_Items.csv` - Item definitions
- `DT_Enemies.csv` - Enemy definitions
- `DT_Bosses.csv` - Boss definitions
- `DT_Abilities.csv` - Combat abilities
- `DT_Zones.csv` - World zones
- `DT_Quests.csv` - Quest definitions
- `DT_Recipes.csv` - Crafting recipes
- `DT_Achievements.csv` - Achievement definitions
- `DT_LootTables.csv` - Loot tables
- `DT_LootPools.csv` - Shared loot pools
- `GameDataStructs.h` - UE5 C++ struct definitions

## Importing to UE5

1. Run the export tool
2. In UE5, create Data Tables with matching struct types
3. Right-click Data Table → Reimport → Select CSV file
4. Or use Import Asset to bring in CSVs directly

## Requirements

Python 3.8 or later. No external dependencies required.

## Adding New Validators

To add validation for a new data type:

1. Add ID collection in `collect_ids()`
2. Create a new `validate_X()` method
3. Call the new method in `run_validation()`

## JSON Schema Notes

All JSON files should have:
- `meta` object with version info (recommended)
- Unique IDs for all entries
- Consistent field naming (camelCase)
