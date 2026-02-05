# Asset Management Guide

## Directory Structure
```
realm-of-eternity/
├── realmofeternity.html (main game file)
├── assets/
│   ├── items.json (asset manifest - UPDATE THIS)
│   └── items/ (folder for images)
│       ├── sword.png
│       ├── shield.png
│       ├── helmet.png
│       └── ... (all item images)
```

## Image Specifications

### Dimensions
- **Width:** 64px
- **Height:** 64px
- **Format:** PNG
- **Background:** Transparent (RGBA)
- **Style:** Consistent with game aesthetic

### Creation Tips
1. Keep a consistent art style across all items
2. Center the icon in the 64x64 canvas
3. Leave 4-8px padding around edges for breathing room
4. Use bold, clear designs (they'll be small)

## How to Add/Update Assets

### Step 1: Create Your Image
1. Create a 64x64 PNG image
2. Save it with the exact filename from `assets/items.json`
3. Example: `sword.png`, `shield.png`, `copper.png`

### Step 2: Upload to Assets Folder
1. Navigate to: `c:\Users\1\Documents\realm-of-eternity\assets\items\`
2. Place your PNG files in this folder
3. Filename MUST match exactly what's in `items.json`

### Step 3: Update Manifest (items.json)
The file is already set up with all items. Just make sure filenames match.

Example entry in `items.json`:
```json
"sword": {
  "filename": "sword.png",
  "fallback": "🗡️"
}
```

- `filename`: Name of your PNG file (must match exactly, case-sensitive)
- `fallback`: Emoji to show if image fails to load

### Step 4: Game Loads Assets Automatically
The game will:
1. Check if image exists at `assets/items/[filename]`
2. Load the image if found
3. Fall back to emoji if image missing (no errors!)

## Adding NEW Items

If you add a new item to the game:

1. **Add to items.json:**
```json
"new_item_name": {
  "filename": "new_item_name.png",
  "fallback": "🎯"
}
```

2. **Create the image:** `new_item_name.png` (64x64 PNG)

3. **Upload to:** `assets/items/new_item_name.png`

That's it! No code changes needed.

## Testing

To verify assets are loading:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "png"
4. Reload the game
5. You should see your image files loading

If images don't load:
- Check filename matches exactly (case-sensitive)
- Verify file is in `assets/items/` folder
- Ensure it's a valid PNG file
- Check console for errors (F12 → Console tab)

## Image Sources (Free to Use)

### Free Asset Websites
- OpenGameArt.org
- itch.io (free asset packs)
- Aseprite (for pixel art)
- Photoshop/GIMP (free: GIMP)

### RPG Asset Packs
- Look for "16x16" or "32x32" pixel art packs (scale up to 64x64)
- Search: "free RPG items pixel art"
- Download packs, extract, and resize to 64x64

## Quick Reference: All Item Filenames

```
Weapons:
  sword.png
  iron_sword.png
  dragon_sword.png
  elder_sword.png

Shields:
  shield.png (Bronze Shield)
  iron_shield.png
  steel_shield.png

Helmets:
  helmet.png (Bronze Helmet)
  iron_helmet.png
  steel_helmet.png

Platebodies:
  platebody.png (Bronze Platebody)
  iron_platebody.png
  steel_platebody.png

Platelegs:
  legs.png (Bronze Platelegs)
  iron_platelegs.png
  steel_platelegs.png

Boots:
  leather_boots.png
  bronze_boots.png
  iron_boots.png
  steel_boots.png

Resources:
  copper.png
  iron.png
  coal.png
  wood.png
  diamond.png
  onyx.png
  pearl.png

Raw Fish:
  fish.png (Shrimp)
  trout.png
  salmon.png

Cooked Food:
  cooked_fish.png (Cooked Shrimp)
  cooked_trout.png
  cooked_salmon.png
  cooked_frog_legs.png

Tools:
  bronze_pickaxe.png
  iron_pickaxe.png
  bronze_axe.png
  iron_axe.png

Monster Drops:
  wolf_pelt.png
  frog_legs.png (Raw Frog Legs)
  rock_shell.png
  ash_powder.png
  dragon_scale.png
  elder_scale.png

Chests:
  wooden_chest.png
  iron_chest.png
  golden_chest.png

Blueprints:
  dragon_sword_blueprint.png
  elder_sword_blueprint.png
  amulet_blueprint.png

Special Items:
  dragon_amulet.png
  dragon_familiar.png
  elder_familiar.png
  stone_familiar.png

Herbs (Herblore Gathering):
  greenleaf.png
  swiftgrass.png
  earthweed.png
  bloodroot.png
  glowcap.png
  ironleaf.png
  silverleaf.png
  emberleaf.png
  nightshade_bloom.png
  spirit_moss.png
  astral_lotus.png
  chronoweed.png

Healing Potions:
  potions.png (Basic Healing Potion)
  greater_healing_potion.png
  superior_healing_potion.png

Combat Buff Potions:
  minor_attack_potion.png
  greater_attack_potion.png
  attack_elixir.png
  minor_defense_potion.png
  greater_defense_potion.png
  defense_elixir.png
  battle_tonic.png
  berserker_draught.png
  vitality_potion.png

Skilling Buff Potions:
  minor_haste_potion.png
  haste_potion.png
  superior_haste_potion.png
  skilling_focus_potion.png
  efficient_worker_potion.png

Utility Potions:
  fortune_potion.png
  endurance_potion.png
  focus_draught.png

Farming Seeds:
  strawberry_seed.png
  blueberry_seed.png
  raspberry_seed.png
  blackberry_seed.png
  lettuce_seed.png
  radish_seed.png
  tomato_seed.png
  cucumber_seed.png
  squash_seed.png

Farming Crops (Consumable Food):
  strawberry.png
  blueberry.png
  raspberry.png
  blackberry.png
  lettuce.png
  radish.png
  tomato.png
  cucumber.png
  squash.png
